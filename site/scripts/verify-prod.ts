/**
 * Canlı özellik kapısı — site + API'nin kullanıcıya ulaştığını doğrular.
 *
 * Çalıştır: npx --yes tsx scripts/verify-prod.ts
 * Exit 0 = kritik kontroller geçti.
 */
const API = process.env.CAD_API_BASE ?? "https://cadastrum-api.cadastrum-tr.workers.dev/v1";
const SITE = process.env.CAD_SITE_BASE ?? "https://cadastrum.com.tr";

type Check = { name: string; ok: boolean; detail: string; critical: boolean };

const checks: Check[] = [];

function add(name: string, ok: boolean, detail: string, critical = true) {
  checks.push({ name, ok, detail, critical });
}

async function getText(url: string): Promise<{ status: number; text: string }> {
  const res = await fetch(url, { redirect: "follow" });
  return { status: res.status, text: await res.text() };
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text };
}

async function main() {
  // API health
  try {
    const h = await getText(`${API}/health`);
    const ok = h.status === 200 && h.text.includes("ok");
    add("API health", ok, `${h.status}`);
  } catch (e) {
    add("API health", false, String(e));
  }

  // Sorgu — lokasyon (Endeksa tarzı)
  try {
    const r = await postJson(`${API}/sorgu`, {
      il: "istanbul",
      ilce: "kadikoy",
      mahalle: "caferaga",
      kategori: "arsa",
      m2: 1000,
      imar_tipi: "konut",
      emsal: 1.5,
      taks: 0.35,
    });
    const ok = r.status === 200 && r.json?.ok === true && r.json?.medyan_tlm2 > 0;
    add(
      "API sorgu lokasyon (il/ilçe)",
      ok,
      ok ? `kaynak=${r.json.kaynak} medyan=${r.json.medyan_tlm2}` : `${r.status} ${r.text.slice(0, 120)}`,
    );
  } catch (e) {
    add("API sorgu lokasyon (il/ilçe)", false, String(e));
  }

  // Sorgu — koordinat + yatırım skoru + imar ayarları
  try {
    const r = await postJson(`${API}/sorgu`, {
      lat: 40.988,
      lng: 29.025,
      kategori: "arsa",
      m2: 1000,
      imar_tipi: "konut",
      emsal: 1.5,
      taks: 0.35,
    });
    const j = r.json;
    const baseOk = r.status === 200 && j?.ok === true;
    add("API sorgu koordinat", baseOk, baseOk ? `kaynak=${j.kaynak} medyan=${j.medyan_tlm2}` : `${r.status}`);
    add(
      "API yatirim_skoru",
      baseOk && typeof j?.yatirim_skoru?.skor === "number",
      j?.yatirim_skoru ? `skor=${j.yatirim_skoru.skor} ${j.yatirim_skoru.etiket}` : "MISSING",
    );
    add(
      "API imar ayarlari",
      baseOk && Array.isArray(j?.ayarlar) && j.ayarlar.length > 0,
      baseOk ? `ayarlar=${j?.ayarlar?.length ?? 0} carpan=${j?.toplam_carpan}` : "MISSING",
    );
    add(
      "API fizibilite_ozet",
      baseOk && j?.fizibilite_ozet?.insaat_m2 > 0,
      j?.fizibilite_ozet ? JSON.stringify(j.fizibilite_ozet) : "MISSING",
    );
  } catch (e) {
    add("API sorgu koordinat", false, String(e));
  }

  // Site sayfaları + özellik işaretleri
  // HTML + bağlı JS chunk'larını tara (özellik metinleri çoğu JS'te)
  async function pageBundle(path: string): Promise<{ status: number; blob: string }> {
    const page = await getText(`${SITE}${path}`);
    let blob = page.text;
    const scriptRe = /src="(\/_astro\/[^"]+\.js)"/g;
    const urls = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = scriptRe.exec(page.text))) urls.add(m[1]!);
    for (const u of urls) {
      try {
        const js = await getText(`${SITE}${u}`);
        if (js.status === 200) blob += "\n" + js.text;
      } catch {
        /* ignore */
      }
    }
    return { status: page.status, blob };
  }

  const pages: Array<{ path: string; markers: string[]; critical?: boolean }> = [
    { path: "/sorgu/", markers: ["yatirim-skoru-kart", "sorgu-mod", "Ters fizibilite", "malikPay"] },
    { path: "/harita/", markers: ["tucbs", "ibb"], critical: false },
    { path: "/veri-katalogu/", markers: ["katalog"] },
    { path: "/arsa-talep/", markers: ["mailto"] },
    { path: "/", markers: ["Cadastrum"] },
  ];

  for (const p of pages) {
    try {
      const { status, blob } = await pageBundle(p.path);
      const missing = p.markers.filter((m) => !blob.toLowerCase().includes(m.toLowerCase()));
      const ok = status === 200 && missing.length === 0;
      add(
        `SITE ${p.path}`,
        ok,
        ok ? `200 + markers` : `${status} missing=[${missing.join(", ")}]`,
        p.critical !== false,
      );
    } catch (e) {
      add(`SITE ${p.path}`, false, String(e), p.critical !== false);
    }
  }

  // Rapor
  let fail = 0;
  let warn = 0;
  for (const c of checks) {
    const mark = c.ok ? "PASS" : c.critical ? "FAIL" : "WARN";
    if (!c.ok && c.critical) fail++;
    if (!c.ok && !c.critical) warn++;
    console.log(`${mark.padEnd(4)} ${c.name} — ${c.detail}`);
  }
  console.log(`\n${fail} critical fail, ${warn} warn, ${checks.filter((c) => c.ok).length} pass`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
