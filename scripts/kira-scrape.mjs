/**
 * Kira Scraper — Emlakjet kiralık konut ilanları.
 *
 * Emlakjet'in kiralık ilan sayfasından JSON-LD parse ederek
 * il/ilçe/mahalle bazlı kira verisi toplar.
 *
 * Çıktı: scripts/kira-data.sql → D1'e yüklenecek `kira_istatistik` tablosu
 *
 * Çalıştır:
 *   node scripts/kira-scrape.mjs
 *   node scripts/kira-scrape.mjs --il istanbul --maks-ilce 5
 *
 * D1'e yükle:
 *   npx wrangler d1 execute cadastrum-db --remote --file=scripts/kira-data.sql
 */

import { writeFileSync, appendFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CIKTI_SQL = join(ROOT, "scripts", "kira-data.sql");
const ILERLEME_DOSYA = join(ROOT, "scripts", ".kira-scrape-ilerleme.json");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ─── Parametreler ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const argIl = args.find((_, i) => args[i - 1] === "--il") ?? null;
const maksIlce = parseInt(args.find((_, i) => args[i - 1] === "--maks-ilce") ?? "0", 10) || 0;
const MAKS_SAYFA = parseInt(args.find((_, i) => args[i - 1] === "--maks-sayfa") ?? "5", 10) || 5;
const UYKU_MS = 1500;

// ─── Hedef il/ilçeler ─────────────────────────────────────────────────────────

const HEDEF_ILLER = argIl ? [argIl] : [
  "istanbul", "ankara", "izmir", "antalya", "bursa",
  "mugla", "kocaeli", "adana", "mersin", "eskisehir",
  "gaziantep", "konya", "samsun", "trabzon", "kayseri",
];

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

// ─── İlçe listesi (basit statik — scraper hedefleri için) ─────────────────────

const ILCE_LISTESI = {
  istanbul: ["besiktas","kadikoy","sisli","fatih","uskudar","beyoglu","sariyer","maltepe","kartal","pendik","umraniye","bagcilar","bahcelievler","bakirkoy","basaksehir","avcilar","buyukcekmece","esenyurt","kucukcekmece","sultangazi","gaziosmanpasa","esenler","gungoren","zeytinburnu","arnavutkoy","sultanbeyli","sancaktepe","tuzla","adalar","beylikduzu"],
  ankara: ["cankaya","kecioren","mamak","yenimahalle","altindag","etimesgut","sincan","pursaklar","golbasi","akyurt"],
  izmir: ["konak","karsiyaka","bornova","bayrakli","buca","cigli","gaziemir","balcova","narlidere","guzelbahce","cesme","seferihisar","menderes","odemis","torbali"],
  antalya: ["muratpasa","kepez","konyaalti","aksu","dosemealti","alanya","manavgat","kemer","serik"],
  bursa: ["osmangazi","nilufer","yildirim","gursu","kestel","mudanya","gemlik"],
  mugla: ["bodrum","fethiye","marmaris","mentese","datca","ula","koycegiz"],
  kocaeli: ["izmit","gebze","darica","golcuk","korfez","derince","basiskele"],
  konya: ["meram","karatay","selcuklu","cihanbeyli","cumra"],
  eskisehir: ["tepebasi","odunpazari"],
  samsun: ["ilkadim","atakum","canik"],
  trabzon: ["ortahisar","akcaabat","arakli","of"],
  kayseri: ["melikgazi","kocasinan","talas"],
  mersin: ["yenisehir","mezitli","toroslar","akdeniz","tarsus"],
  adana: ["seyhan","yuregir","cukurova","saricam"],
  gaziantep: ["sahinbey","sehitkamil"],
};

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function getir(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);
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

// ─── JSON-LD parse ────────────────────────────────────────────────────────────

function listeJsonLdParse(html, il, ilce) {
  const ilanlar = [];
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let d;
    try { d = JSON.parse(m[1].trim()); } catch { continue; }
    if (!d["@graph"] || !Array.isArray(d["@graph"])) continue;

    for (const it of d["@graph"]) {
      if (it["@type"] !== "RealEstateListing") continue;
      const fiyat = it.offers?.price;
      if (!fiyat || fiyat <= 0) continue;

      // Alan: description'dan regex
      const aciklama = it.description ?? it.name ?? "";
      const m2match = aciklama.match(/(\d+[\.,]?\d*)\s*m[²2]/i);
      const alan = m2match ? parseFloat(m2match[1].replace(",", ".")) : null;
      if (!alan || alan <= 0) continue;

      // Mahalle: address locality
      const mahalleRaw = it.address?.addressLocality ?? "";
      const mahalle = normalizeYerAdi(mahalleRaw);

      ilanlar.push({
        il: normalizeYerAdi(il),
        ilce: normalizeYerAdi(ilce),
        mahalle: mahalle || normalizeYerAdi(ilce),
        fiyatAy: fiyat,
        alanM2: alan,
        birimKira: Math.round(fiyat / alan),
      });
    }
  }
  return ilanlar;
}

// ─── İlçe kira istatistiği ────────────────────────────────────────────────────

function istatistikHesapla(ilanlar) {
  if (ilanlar.length === 0) return null;
  const birimler = ilanlar.map((i) => i.birimKira).sort((a, b) => a - b);
  const n = birimler.length;
  const median = n % 2 === 0
    ? (birimler[n/2-1] + birimler[n/2]) / 2
    : birimler[Math.floor(n/2)];
  const ort = birimler.reduce((s, v) => s + v, 0) / n;
  const q1 = birimler[Math.floor(n * 0.25)] ?? birimler[0];
  const q3 = birimler[Math.floor(n * 0.75)] ?? birimler[n-1];
  return { median: Math.round(median), ort: Math.round(ort), q1, q3, adet: n };
}

// ─── SQL üretim ───────────────────────────────────────────────────────────────

function sqlYaz(dosya, il, ilce, mahalle, stat) {
  if (!stat) return;
  const now = Date.now();
  const key = `${il}|${ilce}|${mahalle}`;
  const satir = `INSERT OR REPLACE INTO kira_istatistik (key,il_norm,ilce_norm,mahalle_norm,median_tlm2_ay,ort_tlm2_ay,q1_tlm2_ay,q3_tlm2_ay,ilan_adet,guncelleme) VALUES ('${sqlEsc(key)}','${sqlEsc(il)}','${sqlEsc(ilce)}','${sqlEsc(mahalle)}',${stat.median},${stat.ort},${stat.q1},${stat.q3},${stat.adet},${now});\n`;
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

// ─── Ana akış ─────────────────────────────────────────────────────────────────

async function ilceScrape(il, ilce, tamamlanan) {
  const key = `${il}|${ilce}`;
  if (tamamlanan.has(key)) { console.log(`  ↩ ${key} atlandı (tamamlandı)`); return {}; }

  const ilanlar = [];
  const BASE = `https://www.emlakjet.com/kiralik-konut/${il}-${ilce}/`;

  for (let sayfa = 1; sayfa <= MAKS_SAYFA; sayfa++) {
    const url = sayfa === 1 ? BASE : `${BASE}?page=${sayfa}`;
    try {
      const html = await getir(url);
      const yeni = listeJsonLdParse(html, il, ilce);
      if (yeni.length === 0) break;
      ilanlar.push(...yeni);
      console.log(`    Sayfa ${sayfa}: ${yeni.length} ilan (toplam ${ilanlar.length})`);
      await uyku(UYKU_MS);
    } catch (e) {
      console.warn(`    HATA sayfa ${sayfa}: ${e.message}`);
      break;
    }
  }

  // Mahalle bazlı grupla
  const mahalleler = {};
  for (const ilan of ilanlar) {
    const k = ilan.mahalle || ilce;
    if (!mahalleler[k]) mahalleler[k] = [];
    mahalleler[k].push(ilan);
  }

  // Tüm ilçe istatistiği
  const toplamStat = istatistikHesapla(ilanlar);
  if (toplamStat) {
    sqlYaz(CIKTI_SQL, il, ilce, "", toplamStat);
    console.log(`    İlçe ortalaması: ${toplamStat.median} ₺/m²/ay (${toplamStat.adet} ilan)`);
  }

  // Mahalle bazlı
  let mahalleYazilan = 0;
  for (const [mah, mIlanlar] of Object.entries(mahalleler)) {
    if (mah === ilce || !mah) continue;
    const stat = istatistikHesapla(mIlanlar);
    if (stat && stat.adet >= 3) {
      sqlYaz(CIKTI_SQL, il, ilce, mah, stat);
      mahalleYazilan++;
    }
  }
  console.log(`    ${mahalleYazilan} mahalle kaydedildi.`);

  tamamlanan.add(key);
  ilerlemeKaydet(tamamlanan);
  return mahalleler;
}

async function main() {
  console.log("=== Kira Scraper — Emlakjet Kiralık Konut ===\n");

  // SQL dosyası başlığı (sadece ilk çalışmada)
  if (!existsSync(CIKTI_SQL)) {
    writeFileSync(CIKTI_SQL, `-- Cadastrum Kira İstatistik — ${new Date().toISOString()}\n`, "utf8");
    writeFileSync(CIKTI_SQL,
      `CREATE TABLE IF NOT EXISTS kira_istatistik (key TEXT PRIMARY KEY, il_norm TEXT, ilce_norm TEXT, mahalle_norm TEXT, median_tlm2_ay INTEGER, ort_tlm2_ay INTEGER, q1_tlm2_ay INTEGER, q3_tlm2_ay INTEGER, ilan_adet INTEGER, guncelleme INTEGER);\n`,
      { flag: "a" }
    );
  }

  const tamamlanan = ilerlemYukle();
  let toplamIslem = 0;

  for (const il of HEDEF_ILLER) {
    const ilceler = (ILCE_LISTESI[il] ?? []).slice(0, maksIlce || 9999);
    if (ilceler.length === 0) {
      console.log(`⚠ ${il}: ilçe listesi bulunamadı — atlandı`);
      continue;
    }
    console.log(`\n📍 ${il.toUpperCase()} (${ilceler.length} ilçe)`);

    for (const ilce of ilceler) {
      console.log(`  → ${ilce}`);
      await ilceScrape(il, ilce, tamamlanan);
      toplamIslem++;
      await uyku(UYKU_MS);
    }
  }

  console.log(`\n✅ Tamamlandı. ${toplamIslem} ilçe işlendi.`);
  console.log(`📄 SQL çıktı: ${CIKTI_SQL}`);
  console.log(`\nD1'e yüklemek için:\n  npx wrangler d1 execute cadastrum-db --remote --file=scripts/kira-data.sql`);
}

main().catch(console.error);
