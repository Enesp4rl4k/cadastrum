#!/usr/bin/env node
/**
 * site/scripts/statik-veri-indir.mjs — build ÖNCESİ fiyat verisini statik dosyaya çevirir.
 *
 * NEDEN (2026-09-13): veri sayfaları her ziyarette tarayıcıdan API'ye gidiyordu
 * (Worker 100k istek/gün, D1 5M okuma/gün — trafik artınca site düşer).
 * Bu script /v1/statik/il/:il paketlerini alıp public/veri-statik/v1/ altına
 * böler; Pages statik dosyaları sınırsız sunuyor. Site önce buraya bakıyor
 * (src/lib/statik-veri.ts).
 *
 * YALNIZCA Cloudflare Pages build'inde çalışır (CF_PAGES=1) ya da
 * STATIK_INDIR=1 ile. Yerel geliştirme ve CI'da hiçbir şey yapmaz; site o
 * zaman canlı API'yi kullanır (eski davranış).
 *
 * BUILD'İ ASLA KIRMAZ. Başarısız il manifestten çıkarılır → o il canlı API'ye
 * düşer. Her sonuç sayılır ve yazdırılır; sessizce eksik kalmaz.
 *
 * Dosya düzeni (kategori ∈ arsa|tarla):
 *   manifest.json                              { surum, uretildi, iller: {kategori: [il…]}, ozet }
 *   <kategori>/il/<il>.json                    { durum, govde }
 *   <kategori>/ilce/<il>.json                  { <ilce_norm>: govde }
 *   <kategori>/harita-ilce/<il>.json           govde
 *   <kategori>/mahalle/<il>/<ilce>.json        { mahalleler: {…}, trend: {mahalle, varsayilan} | null }
 *   harita.json                                /v1/statik/harita paketinin aynısı (il/kategoriden bağımsız)
 * Dosya adında boşluk → tire (normalize adda tire yok, geri çevrilebilir).
 */
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CIKTI = join(KOK, "public", "veri-statik", "v1");
const KATEGORILER = ["arsa", "tarla"];
const PAKET_SURUMU = 1;
const ES_ZAMANLI = 4;
const DENEME = 3;

if (process.env.CF_PAGES !== "1" && process.env.STATIK_INDIR !== "1") {
  console.log("[statik-veri] CF_PAGES/STATIK_INDIR yok — atlandı (site canlı API kullanacak).");
  process.exit(0);
}

const API = (process.env.PUBLIC_API_BASE ?? "https://cadastrum-api.cadastrum-tr.workers.dev/v1").replace(/\/$/, "");

/** 81 il — site'ın kendi listesinden (src/data/ilceler.ts anahtarları). */
function illeriOku() {
  const s = readFileSync(join(KOK, "src", "data", "ilceler.ts"), "utf8");
  const iller = [...s.matchAll(/^\s{2}"?([a-z0-9-]+)"?:\s*\[/gm)].map((m) => m[1]);
  if (iller.length !== 81) throw new Error(`il listesi okunamadı: ${iller.length} il`);
  return iller;
}

const dosyaAdi = (norm) => norm.replace(/ /g, "-");
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

function yaz(yol, veri) {
  const tam = join(CIKTI, yol);
  mkdirSync(dirname(tam), { recursive: true });
  writeFileSync(tam, JSON.stringify(veri));
}

async function paketGetir(il, kategori) {
  let son;
  for (let d = 1; d <= DENEME; d++) {
    try {
      const r = await fetch(`${API}/statik/il/${il}?kategori=${kategori}`, { signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const p = await r.json();
      if (p.surum !== PAKET_SURUMU) throw new Error(`paket sürümü ${p.surum}, beklenen ${PAKET_SURUMU}`);
      return { paket: p, onbellek: r.headers.get("x-statik-onbellek") };
    } catch (e) {
      son = e;
      if (d < DENEME) await bekle(2000 * d);
    }
  }
  throw son;
}

function paketiYaz(p) {
  const { il, kategori } = p;
  const a = dosyaAdi(il);
  yaz(`${kategori}/il/${a}.json`, p.il_yaniti);
  yaz(`${kategori}/ilce/${a}.json`, p.ilceler);
  yaz(`${kategori}/harita-ilce/${a}.json`, p.toplu_ilce_ozet);
  const ilceler = new Set([...Object.keys(p.mahalleler), ...Object.keys(p.trendler)]);
  let dosya = 3;
  for (const ilce of ilceler) {
    yaz(`${kategori}/mahalle/${a}/${dosyaAdi(ilce)}.json`, {
      mahalleler: p.mahalleler[ilce] ?? {},
      trend: p.trendler[ilce] ?? null,
    });
    dosya++;
  }
  return dosya;
}

async function main() {
  const t0 = Date.now();
  const iller = illeriOku();
  rmSync(CIKTI, { recursive: true, force: true });

  const isler = KATEGORILER.flatMap((k) => iller.map((il) => ({ il, kategori: k })));
  const basarili = Object.fromEntries(KATEGORILER.map((k) => [k, []]));
  const hatalar = [];
  let dosyaSayisi = 0;
  let hit = 0;
  let erisilemeyen = 0;

  let sira = 0;
  async function isci() {
    while (sira < isler.length) {
      const { il, kategori } = isler[sira++];
      try {
        const { paket, onbellek } = await paketGetir(il, kategori);
        dosyaSayisi += paketiYaz(paket);
        basarili[kategori].push(il);
        if (onbellek === "HIT") hit++;
        erisilemeyen += paket.erisilemeyen ?? 0;
      } catch (e) {
        hatalar.push(`${kategori}/${il}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  await Promise.all(Array.from({ length: ES_ZAMANLI }, isci));

  // ── Harita paketi — il/kategoriden bağımsız, TEK dosya ─────────────────────
  //
  // /harita/ozet + /harita/ilceler harita sayfasının HER ziyarette zorunlu ilk
  // yükü; Worker'ın günlük 100.000 istek tavanı D1 bütçesinden AYRI bir
  // platform sınırı, kod optimizasyonuyla kaldırılamaz. Fiyat paketleriyle
  // aynı hata toleransı: başarısız olursa dosya yazılmaz, site harita.json'u
  // bulamayınca canlı API'ye düşer (src/lib/statik-harita.ts).
  let haritaDurumu = "atlandi";
  try {
    const r = await fetch(`${API}/statik/harita`, { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const paket = await r.json();
    if (paket.surum !== PAKET_SURUMU) throw new Error(`paket sürümü ${paket.surum}, beklenen ${PAKET_SURUMU}`);
    yaz("harita.json", paket);
    dosyaSayisi++;
    haritaDurumu = r.headers.get("x-statik-onbellek") === "HIT" ? "HIT" : "MISS";
  } catch (e) {
    haritaDurumu = `HATA: ${e instanceof Error ? e.message : e}`;
    console.warn(`[statik-veri] harita paketi alınamadı, site canlı API kullanacak: ${haritaDurumu}`);
  }

  for (const k of KATEGORILER) basarili[k].sort();
  const ozet = {
    istenen: isler.length,
    basarili: isler.length - hatalar.length,
    basarisiz: hatalar.length,
    kv_onbellek_hit: hit,
    dosya: dosyaSayisi + 1,
    erisilemeyen_ad: erisilemeyen,
    harita: haritaDurumu,
    sure_sn: Math.round((Date.now() - t0) / 1000),
  };
  yaz("manifest.json", { surum: PAKET_SURUMU, uretildi: Date.now(), iller: basarili, ozet });

  console.log(`[statik-veri] ${ozet.basarili}/${ozet.istenen} paket · ${ozet.dosya} dosya · harita: ${haritaDurumu} · KV HIT ${hit} · ulaşılamayan ad ${erisilemeyen} · ${ozet.sure_sn} sn`);
  if (hatalar.length) {
    // Görünür ama build'i kırmıyor: bu iller manifestte yok → canlı API'ye düşer.
    console.warn(`[statik-veri] ${hatalar.length} paket alınamadı, bu iller canlı API kullanacak:`);
    for (const h of hatalar.slice(0, 20)) console.warn("  " + h);
  }
}

main().catch((e) => {
  // Beklenmeyen hata da build'i kırmaz: yarım çıktı silinir, manifest olmadan
  // site tamamen canlı API'ye düşer (eski davranış).
  console.error("[statik-veri] BEKLENMEYEN HATA — statik veri devre dışı, site canlı API kullanacak:", e);
  rmSync(CIKTI, { recursive: true, force: true });
  process.exit(0);
});
