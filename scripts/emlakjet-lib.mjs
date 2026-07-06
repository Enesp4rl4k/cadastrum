/**
 * Emlakjet scraper ortak kütüphane — il / ilçe tarama, SQL, resume.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export function normalizeTr(s) {
  return s
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c] ?? c)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeYerAdi(s) {
  return normalizeTr(s)
    .replace(/\b(mahallesi|mahalle|koyu|koy|beldesi|belde|mah|mh)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function objeyiCikar(dosyaYolu, degiskenAdi) {
  const metin = readFileSync(dosyaYolu, "utf8");
  const bas = metin.indexOf("{", metin.indexOf(degiskenAdi));
  let derinlik = 0,
    son = -1;
  for (let i = bas; i < metin.length; i++) {
    if (metin[i] === "{") derinlik++;
    else if (metin[i] === "}") {
      derinlik--;
      if (derinlik === 0) {
        son = i;
        break;
      }
    }
  }
  return JSON.parse(metin.slice(bas, son + 1));
}

export const uyku = (ms) => new Promise((r) => setTimeout(r, ms));
export const sqlEsc = (s) => String(s).replace(/'/g, "''");

export async function getir(url, timeoutMs = 25_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "tr-TR,tr" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  } finally {
    clearTimeout(t);
  }
}

export function listeLinkleri(html) {
  const set = new Set();
  for (const m of html.matchAll(/\/ilan\/[a-z0-9-]+-\d{7,}/g)) set.add(m[0]);
  return [...set];
}

/**
 * Yeni Emlakjet liste sayfasından JSON-LD @graph parse — detay sayfası gerekmez.
 * Her sayfada ~30 RealEstateListing objesi var.
 */
export function listeJsonLdParse(html, kategoriHedef, MERKEZ) {
  const sonuc = [];
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let d;
    try { d = JSON.parse(m[1].trim()); } catch { continue; }
    if (!d["@graph"] || !Array.isArray(d["@graph"])) continue;

    for (const it of d["@graph"]) {
      if (it["@type"] !== "RealEstateListing") continue;

      // Fiyat
      const fiyat = it.offers?.price ?? it.price;
      if (!fiyat) continue;

      // m2 — "616 m²" formatından parse
      const props = it.additionalProperty || [];
      const m2Prop = props.find((p) => p.name === "Metrekare" || p.name === "Alan");
      if (!m2Prop) continue;
      const m2 = parseInt(String(m2Prop.value).replace(/\D/g, ""), 10);
      if (!m2 || m2 < 1 || m2 > 10_000_000) continue;

      const tlm2 = Math.round(fiyat / m2);
      if (tlm2 < 100 || tlm2 > 10_000_000) continue;

      // Konum — "Mahalle Adı, İlçe" formatı
      const konumProp = props.find((p) => p.name === "Konum");
      if (!konumProp) continue;
      const konumParcalar = konumProp.value.split(",").map((s) => s.trim());
      const mahRaw = konumParcalar[0] ?? "";
      const ilceRaw = konumParcalar[1] ?? "";
      if (!ilceRaw) continue;

      // Kategori — "Satılık Arsa" veya "Satılık Tarla"
      const tipProp = props.find((p) => p.name === "İlan Tipi");
      const tipStr = tipProp?.value?.toLocaleLowerCase("tr") ?? "";
      let kategori = kategoriHedef; // fallback: URL'den gelen kategori
      if (tipStr.includes("tarla")) kategori = "tarla";
      else if (tipStr.includes("arsa")) kategori = "arsa";

      // ID — URL'den
      const idMatch = (it.url ?? "").match(/-(\d{7,})$/);
      const id = idMatch ? idMatch[1] : null;
      if (!id) continue;

      // Normalize
      const ilceN = normalizeTr(ilceRaw);
      const mahN = normalizeYerAdi(mahRaw) || null;

      // il_norm — MERKEZ'den tahmin (ilçe adını il listesinde ara)
      // Önce MERKEZ'den eşleşme dene
      let ilN = null;
      let lat = null;
      let lng = null;
      if (mahN && ilceN) {
        // MERKEZ key: "il__ilce__mahalle"
        for (const [key, coords] of Object.entries(MERKEZ)) {
          const parts = key.split("__");
          if (parts[1] === ilceN && (parts[2] === mahN || !mahN)) {
            ilN = parts[0];
            lat = coords[0];
            lng = coords[1];
            break;
          }
        }
      }
      // Fallback: sadece ilçe eşleşmesi
      if (!ilN) {
        for (const key of Object.keys(MERKEZ)) {
          const parts = key.split("__");
          if (parts[1] === ilceN) {
            ilN = parts[0];
            break;
          }
        }
      }
      if (!ilN) continue; // il bulunamazsa atla

      sonuc.push({ id, ilN, ilceN, mahN, kategori, tlm2, m2, lat, lng });
    }
  }
  return sonuc;
}

let _bc = null;
export function detayParse(html) {
  let fiyat = null;
  let baslik = null;
  for (const m of html.matchAll(/application\/ld\+json">(.*?)<\/script>/gs)) {
    try {
      const d = JSON.parse(m[1]);
      const items = Array.isArray(d) ? d : [d];
      for (const it of items) {
        if (it["@type"] === "Product") {
          baslik = it.name ?? null;
          const p = it.offers?.price;
          if (p) fiyat = parseInt(String(p).replace(/\D/g, ""), 10) || null;
        }
        if (it["@type"] === "BreadcrumbList") {
          _bc = (it.itemListElement || [])
            .map((x) => (typeof x.item === "object" ? x.item?.name : x.name))
            .filter(Boolean);
        }
      }
    } catch {
      /* ignore */
    }
  }
  const bc = _bc || [];
  let kategori = "arsa";
  for (const b of bc) {
    const l = b.toLocaleLowerCase("tr");
    if (l.includes("tarla")) kategori = "tarla";
    else if (l.includes("arsa")) kategori = "arsa";
  }
  const yerler = bc
    .filter((b) => /satılık (arsa|tarla)/i.test(b) && !/^anasayfa/i.test(b))
    .map((b) => b.replace(/satılık (arsa|tarla)/i, "").trim())
    .filter((x) => x.length > 0);
  const m2lar = [...html.matchAll(/(\d{1,3}(?:\.\d{3})*)\s*m²/g)]
    .map((m) => parseInt(m[1].replace(/\./g, ""), 10))
    .filter((v) => v > 0 && v < 1e7);
  let m2 = null;
  if (m2lar.length) {
    const f = {};
    for (const v of m2lar) f[v] = (f[v] || 0) + 1;
    m2 = Number(Object.entries(f).sort((a, b) => b[1] - a[1])[0][0]);
  }
  _bc = null;
  return { il: yerler[0], ilce: yerler[1], mahalle: yerler[2], kategori, fiyat, m2, baslik };
}

export function sqlYaz(kayitlar, ciktiPath, baslik = "Emlakjet") {
  const now = Date.now();
  const satirlar = kayitlar.map(
    (k) =>
      `('emlakjet','ej_${sqlEsc(k.id)}','${sqlEsc(k.ilN)}','${sqlEsc(k.ilceN)}',${k.mahN ? `'${sqlEsc(k.mahN)}'` : "NULL"},${k.tlm2},${k.m2},'${k.kategori}','TL',${now},${k.lat ?? "NULL"},${k.lng ?? "NULL"},${k.lat ? "'mahalle-merkez'" : "NULL"},1)`,
  );
  let sql = `-- ${baslik} — ${kayitlar.length} ilan — ${new Date().toISOString()}\n\n`;
  for (let i = 0; i < satirlar.length; i += 400) {
    sql += `INSERT OR IGNORE INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, fiyat_per_m2, m2, kategori, para_birimi, yakalanma_tarihi, lat, lng, koord_kaynagi, aktif) VALUES\n`;
    sql += satirlar.slice(i, i + 400).join(",\n") + ";\n\n";
  }
  writeFileSync(ciktiPath, sql, "utf8");
}

/** Mevcut SQL dosyalarından ej_ id seti (resume duplicate önleme). */
export function sqlIdleriYukle(...dosyalar) {
  const set = new Set();
  for (const p of dosyalar) {
    if (!existsSync(p)) continue;
    const metin = readFileSync(p, "utf8");
    for (const m of metin.matchAll(/'ej_(\d+)'/g)) set.add(m[1]);
  }
  return set;
}

/** SQL'den kayıtları yükle (resume — sqlYaz üzerine yazmasın diye). */
export function sqlKayitlariYukle(...dosyalar) {
  const byId = new Map();
  const re =
    /'(?:emlakjet|extension)','ej_([^']+)','([^']*)','([^']*)',([^,]+),(\d+),(\d+),'([^']+)'/g;
  for (const p of dosyalar) {
    if (!existsSync(p)) continue;
    const metin = readFileSync(p, "utf8");
    let m;
    while ((m = re.exec(metin)) !== null) {
      const mahRaw = m[4].trim();
      byId.set(m[1], {
        id: m[1],
        ilN: m[2],
        ilceN: m[3],
        mahN: mahRaw === "NULL" ? null : mahRaw.replace(/^'|'$/g, ""),
        tlm2: parseInt(m[5], 10),
        m2: parseInt(m[6], 10),
        kategori: m[7],
        lat: null,
        lng: null,
      });
    }
  }
  return [...byId.values()];
}

export function progressYukle(path) {
  if (!existsSync(path)) return { completed: [], stats: {} };
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { completed: [], stats: {} };
  }
}

export function progressKaydet(path, progress) {
  writeFileSync(path, JSON.stringify(progress, null, 2), "utf8");
}

export function ilceListesiYukle(mahallelerPath) {
  const tum = JSON.parse(readFileSync(mahallelerPath, "utf8"));
  const seen = new Set();
  const liste = [];
  for (const m of tum) {
    if (!m.ilNorm || !m.ilceNorm) continue;
    const key = `${m.ilNorm}__${m.ilceNorm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    liste.push({ il: m.il, ilce: m.ilce, ilNorm: m.ilNorm, ilceNorm: m.ilceNorm });
  }
  liste.sort((a, b) =>
    a.ilNorm === b.ilNorm ? a.ilceNorm.localeCompare(b.ilceNorm) : a.ilNorm.localeCompare(b.ilNorm),
  );
  return liste;
}

export async function detaydanKayit(link, MERKEZ, gorulenler, kayitlar, delayMs = 550) {
  const id = link.match(/(\d{7,})$/)?.[1];
  if (!id || gorulenler.has(id)) return false;
  gorulenler.add(id);
  try {
    const dhtml = await getir(`https://www.emlakjet.com${link}`);
    const r = detayParse(dhtml);
    if (!r.fiyat || !r.m2 || !r.il || !r.ilce) return false;
    const tlm2 = Math.round(r.fiyat / r.m2);
    if (tlm2 < 100 || tlm2 > 10_000_000) return false;
    const ilN = normalizeTr(r.il);
    const ilceN = normalizeTr(r.ilce);
    const mahN = r.mahalle ? normalizeYerAdi(r.mahalle) : null;
    let lat = null,
      lng = null;
    if (mahN) {
      const t = MERKEZ[`${ilN}__${ilceN}__${mahN}`];
      if (t) {
        lat = t[0];
        lng = t[1];
      }
    }
    kayitlar.push({
      id,
      ilN,
      ilceN,
      mahN,
      kategori: r.kategori,
      tlm2,
      m2: r.m2,
      lat,
      lng,
    });
    await uyku(delayMs + Math.random() * 350);
    return true;
  } catch {
    return false;
  }
}

/** İlçe tara — URL fallback (il-ilce / sadece ilce). */
export async function ilceTara(ilNorm, ilceNorm, kategori, maxSayfa, kayitlar, gorulenler, MERKEZ, opts = {}) {
  const delayMs = opts.delayMs ?? 550;
  const urlPatterns = [
    (s) => `https://www.emlakjet.com/satilik-${kategori}/${ilNorm}-${ilceNorm}${s}`,
    (s) => `https://www.emlakjet.com/satilik-${kategori}/${ilceNorm}${s}`,
  ];
  let eklenen = 0;
  let patternIdx = 0;

  for (let sayfa = 1; sayfa <= maxSayfa; sayfa++) {
    const suffix = sayfa > 1 ? (sayfa === 2 ? `?sayfa=${sayfa}` : `?sayfa=${sayfa}`) : "";
    let html = null;
    for (let p = patternIdx; p < urlPatterns.length; p++) {
      try {
        html = await getir(urlPatterns[p](suffix));
        patternIdx = p;
        break;
      } catch {
        continue;
      }
    }
    if (!html) break;
    const linkler = listeLinkleri(html);
    if (linkler.length === 0) {
      if (patternIdx < urlPatterns.length - 1) {
        patternIdx++;
        sayfa--;
        continue;
      }
      break;
    }
    let yeni = 0;
    for (const link of linkler) {
      if (await detaydanKayit(link, MERKEZ, gorulenler, kayitlar, delayMs)) {
        eklenen++;
        yeni++;
      }
    }
    if (yeni === 0) break;
    await uyku(700);
  }
  return eklenen;
}

export async function ilTara(ilSlug, kategori, maxSayfa, kayitlar, gorulenler, MERKEZ, opts = {}) {
  let eklenen = 0;
  for (let sayfa = 1; sayfa <= maxSayfa; sayfa++) {
    const url = `https://www.emlakjet.com/satilik-${kategori}/${ilSlug}${sayfa > 1 ? `?sayfa=${sayfa}` : ""}`;
    let html;
    try {
      html = await getir(url);
    } catch {
      break;
    }

    // Önce yeni JSON-LD liste parse'ı dene (detay sayfasına gitmez, çok daha hızlı)
    const jsonLdIlanlar = listeJsonLdParse(html, kategori, MERKEZ);
    if (jsonLdIlanlar.length > 0) {
      let yeniBuSayfa = 0;
      for (const ilan of jsonLdIlanlar) {
        if (gorulenler.has(ilan.id)) continue;
        gorulenler.add(ilan.id);
        kayitlar.push(ilan);
        eklenen++;
        yeniBuSayfa++;
      }
      if (yeniBuSayfa === 0) break; // Tüm ilanlar görüldü, son sayfa
      await uyku(opts.delayMs ?? 600);
      continue;
    }

    // Fallback: eski detay sayfası yöntemi (JSON-LD yoksa)
    const linkler = listeLinkleri(html);
    if (linkler.length === 0) break;
    let yeniBuSayfa = 0;
    for (const link of linkler) {
      if (await detaydanKayit(link, MERKEZ, gorulenler, kayitlar, opts.delayMs ?? 600)) {
        eklenen++;
        yeniBuSayfa++;
      }
    }
    if (yeniBuSayfa === 0) break;
    await uyku(800);
  }
  return eklenen;
}
