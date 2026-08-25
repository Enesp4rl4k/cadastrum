/**
 * Zingat Arsa/Tarla Scraper.
 *
 * Zingat, Emlakjet gibi JSON-LD tabanlı ilan verisini açıkça sunuyor.
 * PerimeterX bot koruması YOK — Worker'dan direkt fetch çalışır.
 *
 * URL yapısı:
 *   Liste: https://www.zingat.com/satilik-arsa?il=istanbul&ilce=kadikoy
 *   JSON API: https://www.zingat.com/api/v2/listing?categoryId=3&city=istanbul&district=kadikoy&page=1
 *
 * Çıktı: scripts/zingat-data.sql → D1 ilanlar tablosuna INSERT OR IGNORE
 *
 * Çalıştır:
 *   node scripts/zingat-scrape.mjs
 *   node scripts/zingat-scrape.mjs --il ankara --maks-ilce 3 --maks-sayfa 5
 *
 * D1'e yükle:
 *   npx wrangler d1 execute cadastrum-db --remote --file=scripts/zingat-data.sql
 */

import { writeFileSync, appendFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CIKTI_SQL = join(ROOT, "scripts", "zingat-data.sql");
const ILERLEME_DOSYA = join(ROOT, "scripts", ".zingat-ilerleme.json");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ─── Parametreler ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const argIl = args.find((_, i) => args[i - 1] === "--il") ?? null;
const maksIlce = parseInt(args.find((_, i) => args[i - 1] === "--maks-ilce") ?? "0", 10) || 0;
const MAKS_SAYFA = parseInt(args.find((_, i) => args[i - 1] === "--maks-sayfa") ?? "8", 10) || 8;
const UYKU_MS = 2000;

// ─── Hedef kategoriler ────────────────────────────────────────────────────────
// Zingat kategori ID: 3 = Arsa, 4 = Tarla, 6 = Konut

const KATEGORILER = [
  { id: "3", slug: "satilik-arsa", norm: "arsa" },
  { id: "4", slug: "satilik-tarla", norm: "tarla" },
];

// ─── Hedef iller ve ilçeler ───────────────────────────────────────────────────

const HEDEF_ILLER = argIl ? [argIl] : [
  "istanbul", "ankara", "izmir", "antalya", "bursa",
  "mugla", "kocaeli", "adana", "mersin", "eskisehir",
  "gaziantep", "konya", "samsun", "trabzon",
];

// Zingat URL'de Türkçe karaktersiz il/ilçe isimleri kullanıyor
const ILCE_LISTESI = {
  istanbul: ["besiktas","kadikoy","sisli","fatih","uskudar","sarıyer","maltepe","kartal","pendik","umraniye","bagcilar","bahcelievler","bakirkoy","avcilar","buyukcekmece","esenyurt","kucukcekmece"],
  ankara: ["cankaya","kecioren","mamak","yenimahalle","altindag","etimesgut","sincan"],
  izmir: ["konak","karsiyaka","bornova","bayrakli","buca","cigli","gaziemir"],
  antalya: ["muratpasa","kepez","konyaalti","alanya","manavgat","kemer"],
  bursa: ["osmangazi","nilufer","yildirim","mudanya","gemlik"],
  mugla: ["bodrum","fethiye","marmaris","mentese","datca"],
  kocaeli: ["izmit","gebze","golcuk","korfez","derince"],
  konya: ["meram","karatay","selcuklu"],
  eskisehir: ["tepebasi","odunpazari"],
  samsun: ["ilkadim","atakum","canik"],
  trabzon: ["ortahisar","akcaabat"],
  mersin: ["yenisehir","mezitli","tarsus"],
  adana: ["seyhan","yuregir"],
  gaziantep: ["sahinbey","sehitkamil"],
};

// ─── Normalizasyon ────────────────────────────────────────────────────────────

function normalizeTr(s) {
  return s.toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (c) => ({ ç:"c",ğ:"g",ı:"i",ö:"o",ş:"s",ü:"u",â:"a",î:"i",û:"u" })[c] ?? c)
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
function normalizeYerAdi(s) {
  return normalizeTr(s)
    .replace(/\b(mahallesi|mahalle|koyu|koy|beldesi|belde|mah|mh)\b/g, "")
    .replace(/\s+/g, " ").trim();
}
const uyku = (ms) => new Promise((r) => setTimeout(r, ms));
const sqlEsc = (s) => String(s ?? "").replace(/'/g, "''");

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function getirHtml(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "tr-TR,tr",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  } finally { clearTimeout(t); }
}

// ─── HTML parse ───────────────────────────────────────────────────────────────

/**
 * Zingat HTML'inden JSON-LD RealEstateListing'leri parse et.
 * Emlakjet ile aynı JSON-LD şeması kullanıyor.
 */
function jsonLdParse(html, il, ilce, kategori) {
  const ilanlar = [];

  // JSON-LD scriptlerini tara
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    let d;
    try { d = JSON.parse(m[1].trim()); } catch { continue; }

    // Tekil ilan ya da @graph dizisi olabilir
    const liste = d["@graph"] ? d["@graph"]
      : d["@type"] === "RealEstateListing" ? [d]
      : [];

    for (const it of liste) {
      if (it["@type"] !== "RealEstateListing") continue;

      const fiyat = it.offers?.price ?? it.price;
      if (!fiyat || Number(fiyat) <= 0) continue;

      // Alan: description veya name'den regex
      const metin = [it.description ?? "", it.name ?? ""].join(" ");
      const m2match = metin.match(/(\d+[\.,]?\d*)\s*m[²2]/i);
      const alan = m2match ? parseFloat(m2match[1].replace(",", ".")) : null;
      if (!alan || alan <= 0) continue;

      const fiyatNum = Number(fiyat);
      const fiyatPerM2 = Math.round(fiyatNum / alan);

      // Konum
      const mahalleRaw = it.address?.addressLocality
        ?? it.address?.streetAddress
        ?? "";
      const mahalle = normalizeYerAdi(mahalleRaw);

      // İlan no
      const ilanNo = it["@id"]?.split("/").filter(Boolean).pop()
        ?? it.identifier
        ?? String(Math.random()).slice(2, 12);

      // Başlık
      const baslik = (it.name ?? "").slice(0, 200);

      ilanlar.push({
        ilanNo: String(ilanNo),
        kaynak: "zingat",
        baslik,
        ilNorm: normalizeYerAdi(il),
        ilceNorm: normalizeYerAdi(ilce),
        mahalleNorm: mahalle,
        kategori,
        fiyat: fiyatNum,
        alan,
        fiyatPerM2,
        paraBirimi: "TL",
      });
    }
  }

  // Fallback: script window.__NEXT_DATA__ veya window.__STATE__ JSON
  if (ilanlar.length === 0) {
    const nextData = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextData) {
      try {
        const data = JSON.parse(nextData[1]);
        const items = data?.props?.pageProps?.listings
          ?? data?.props?.pageProps?.data?.listings
          ?? [];
        for (const it of items) {
          const fiyat = it.price ?? it.salePrice;
          const alan = it.grossSize ?? it.netSize ?? it.squareMeter;
          if (!fiyat || !alan || fiyat <= 0 || alan <= 0) continue;
          ilanlar.push({
            ilanNo: String(it.id ?? it.listingId ?? Math.random()),
            kaynak: "zingat",
            baslik: (it.title ?? it.name ?? "").slice(0, 200),
            ilNorm: normalizeYerAdi(il),
            ilceNorm: normalizeYerAdi(ilce),
            mahalleNorm: normalizeYerAdi(it.neighborhood ?? it.district ?? ilce),
            kategori,
            fiyat,
            alan,
            fiyatPerM2: Math.round(fiyat / alan),
            paraBirimi: "TL",
          });
        }
      } catch { /* ignore */ }
    }
  }

  return ilanlar;
}

// ─── SQL üretim ───────────────────────────────────────────────────────────────

function sqlEkle(dosya, ilan) {
  const now = Date.now();
  const satir = `INSERT OR IGNORE INTO ilanlar (ilan_no,kaynak,baslik,il_norm,ilce_norm,mahalle_norm,kategori,fiyat,alan_m2,fiyat_per_m2,para_birimi,aktif,yakalanma_tarihi) VALUES ('${sqlEsc(ilan.ilanNo)}','${sqlEsc(ilan.kaynak)}','${sqlEsc(ilan.baslik)}','${sqlEsc(ilan.ilNorm)}','${sqlEsc(ilan.ilceNorm)}','${sqlEsc(ilan.mahalleNorm)}','${sqlEsc(ilan.kategori)}',${ilan.fiyat},${ilan.alan},${ilan.fiyatPerM2},'${sqlEsc(ilan.paraBirimi)}',1,${now});\n`;
  appendFileSync(dosya, satir, "utf8");
}

// ─── İlerleme ─────────────────────────────────────────────────────────────────

function ilerlemYukle() {
  if (!existsSync(ILERLEME_DOSYA)) return new Set();
  try { return new Set(JSON.parse(readFileSync(ILERLEME_DOSYA, "utf8"))); } catch { return new Set(); }
}
function ilerlemeKaydet(set) {
  writeFileSync(ILERLEME_DOSYA, JSON.stringify([...set]), "utf8");
}

// ─── İlçe scrape ─────────────────────────────────────────────────────────────

async function ilceScrape(il, ilce, kategoriSlug, kategoriNorm, tamamlanan) {
  const key = `${il}|${ilce}|${kategoriNorm}`;
  if (tamamlanan.has(key)) { console.log(`  ↩ ${key} atlandı`); return 0; }

  let toplamIlan = 0;

  for (let sayfa = 1; sayfa <= MAKS_SAYFA; sayfa++) {
    const url = `https://www.zingat.com/${kategoriSlug}/${il}/${ilce}${sayfa > 1 ? `?page=${sayfa}` : ""}`;
    try {
      const html = await getirHtml(url);
      const ilanlar = jsonLdParse(html, il, ilce, kategoriNorm);

      if (ilanlar.length === 0) {
        if (sayfa === 1) console.log(`    ⚠ Sayfa 1 ilan bulunamadı — HTML yapısı değişmiş olabilir`);
        break;
      }

      for (const ilan of ilanlar) sqlEkle(CIKTI_SQL, ilan);
      toplamIlan += ilanlar.length;
      console.log(`    Sayfa ${sayfa}: ${ilanlar.length} ilan (toplam ${toplamIlan})`);
      await uyku(UYKU_MS);
    } catch (e) {
      console.warn(`    HATA sayfa ${sayfa}: ${e.message}`);
      break;
    }
  }

  tamamlanan.add(key);
  ilerlemeKaydet(tamamlanan);
  return toplamIlan;
}

// ─── Ana akış ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Zingat Arsa/Tarla Scraper ===\n");

  if (!existsSync(CIKTI_SQL)) {
    writeFileSync(CIKTI_SQL, `-- Zingat Arsa/Tarla — ${new Date().toISOString()}\n`, "utf8");
  }

  const tamamlanan = ilerlemYukle();
  let toplamIslem = 0;
  let toplamIlanSayisi = 0;

  for (const il of HEDEF_ILLER) {
    const ilceler = (ILCE_LISTESI[il] ?? []).slice(0, maksIlce || 9999);
    if (ilceler.length === 0) { console.log(`⚠ ${il}: ilçe listesi yok`); continue; }

    console.log(`\n📍 ${il.toUpperCase()} (${ilceler.length} ilçe)`);

    for (const ilce of ilceler) {
      for (const kat of KATEGORILER) {
        console.log(`  → ${ilce} / ${kat.norm}`);
        const n = await ilceScrape(il, ilce, kat.slug, kat.norm, tamamlanan);
        toplamIlanSayisi += n;
        toplamIslem++;
        await uyku(UYKU_MS);
      }
    }
  }

  console.log(`\n✅ Tamamlandı.`);
  console.log(`   ${toplamIslem} ilçe-kategori işlendi, ~${toplamIlanSayisi} ilan.`);
  console.log(`📄 SQL: ${CIKTI_SQL}`);
  console.log(`\nD1'e yüklemek için:\n  npx wrangler d1 execute cadastrum-db --remote --file=scripts/zingat-data.sql`);
}

main().catch(console.error);
