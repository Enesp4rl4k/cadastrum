/**
 * Emlakjet GERÇEK arsa/tarla scraper.
 *
 * Emlakjet server-side fetch'e açık (bot bloğu yok). Detay sayfası JSON-LD +
 * breadcrumb ile güvenilir veri verir: il/ilçe/mahalle/kategori/fiyat/m².
 *
 * Akış:
 *   1. Liste sayfası (satilik-arsa / satilik-tarla, il-ilce) → ilan linkleri
 *   2. Her detay → breadcrumb (konum) + JSON-LD (fiyat) + m² regex
 *   3. fiyat_per_m2 hesapla + mahalle-merkez koordinat eşle
 *   4. SQL çıktı → scripts/emlakjet-data.sql (wrangler d1 execute --file ile yüklenir)
 *
 * Çalıştır: node scripts/emlakjet-scrape.mjs
 * Hedef iller scriptin altında HEDEFLER dizisinde — düzenlenebilir.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CIKTI = join(ROOT, "scripts", "emlakjet-data.sql");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ── Normalizasyon (extension'daki tkgm-api.ts ile birebir) ──
function normalizeTr(s) {
  return s.toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" })[c] ?? c)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ").trim();
}
function normalizeYerAdi(s) {
  return normalizeTr(s)
    .replace(/\b(mahallesi|mahalle|koyu|koy|beldesi|belde|mah|mh)\b/g, "")
    .replace(/\s+/g, " ").trim();
}

// ── Mahalle merkez koordinatları yükle ──
function objeyiCikar(dosyaYolu, degiskenAdi) {
  const metin = readFileSync(dosyaYolu, "utf8");
  const isaret = metin.indexOf(degiskenAdi);
  const bas = metin.indexOf("{", isaret);
  let derinlik = 0, son = -1;
  for (let i = bas; i < metin.length; i++) {
    if (metin[i] === "{") derinlik++;
    else if (metin[i] === "}") { derinlik--; if (derinlik === 0) { son = i; break; } }
  }
  return JSON.parse(metin.slice(bas, son + 1));
}
console.log("Mahalle merkezleri yükleniyor...");
const MERKEZ = objeyiCikar(join(ROOT, "src/lib/data/mahalle-merkezleri.ts"), "MERKEZ_TUPLES");
console.log(`  ${Object.keys(MERKEZ).length} mahalle merkezi yüklendi.`);

const uyku = (ms) => new Promise((r) => setTimeout(r, ms));
const sqlEsc = (s) => String(s).replace(/'/g, "''");

async function getir(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "tr-TR,tr" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Liste sayfasından ilan detay linklerini çıkar. */
function listeLinkleri(html) {
  const set = new Set();
  for (const m of html.matchAll(/\/ilan\/[a-z0-9-]+-\d{7,}/g)) set.add(m[0]);
  return [...set];
}

/** Detay sayfasından kayıt çıkar. */
function detayParse(html) {
  // JSON-LD Product → fiyat
  let fiyat = null, baslik = null;
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
          const names = (it.itemListElement || []).map((x) =>
            typeof x.item === "object" ? x.item?.name : x.name).filter(Boolean);
          // Tipik: [Anasayfa, Satılık Tarla, İstanbul Satılık Tarla, Beykoz Satılık Tarla, Gümüşsuyu Mahallesi Satılık Tarla, BAŞLIK]
          detayParse._bc = names;
        }
      }
    } catch { /* ignore */ }
  }
  const bc = detayParse._bc || [];
  // breadcrumb'tan il/ilçe/mahalle/kategori
  let il = null, ilce = null, mahalle = null, kategori = "arsa";
  for (const b of bc) {
    const low = b.toLocaleLowerCase("tr");
    if (low.includes("tarla")) kategori = "tarla";
    else if (low.includes("arsa")) kategori = "arsa";
  }
  // "X Satılık Tarla/Arsa" formatından yer çıkar.
  // Bare "Satılık Tarla" → "" olur, boşları ele (yoksa il="" → kayıt atlanır).
  const yerler = bc.filter((b) => /satılık (arsa|tarla)/i.test(b) && !/^(anasayfa)/i.test(b))
    .map((b) => b.replace(/satılık (arsa|tarla)/i, "").trim())
    .filter((x) => x.length > 0);
  // yerler: ["İstanbul", "Beykoz", "Gümüşsuyu Mahallesi"] sırasıyla
  if (yerler.length >= 1) il = yerler[0];
  if (yerler.length >= 2) ilce = yerler[1];
  if (yerler.length >= 3) mahalle = yerler[2];

  // m² — sayfadaki en sık geçen m² değeri
  const m2lar = [...html.matchAll(/(\d{1,3}(?:\.\d{3})*)\s*m²/g)].map((m) => parseInt(m[1].replace(/\./g, ""), 10)).filter((v) => v > 0 && v < 10_000_000);
  let m2 = null;
  if (m2lar.length) {
    const freq = {};
    for (const v of m2lar) freq[v] = (freq[v] || 0) + 1;
    m2 = Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
  }

  return { il, ilce, mahalle, kategori, fiyat, m2, baslik };
}

/** Bir il/ilçe + kategori tara. */
async function ilceTara(ilSlug, ilceSlug, kategori, maxSayfa, kayitlar, gorulenler) {
  let eklenen = 0;
  for (let sayfa = 1; sayfa <= maxSayfa; sayfa++) {
    const url = `https://www.emlakjet.com/satilik-${kategori}/${ilSlug}-${ilceSlug}${sayfa > 1 ? `/${sayfa}` : ""}`;
    let html;
    try { html = await getir(url); } catch (e) { console.log(`    sayfa ${sayfa} hata: ${e.message}`); break; }
    const linkler = listeLinkleri(html);
    if (linkler.length === 0) break;
    for (const link of linkler) {
      const id = link.match(/(\d{7,})$/)?.[1];
      if (!id || gorulenler.has(id)) continue;
      gorulenler.add(id);
      try {
        const dhtml = await getir(`https://www.emlakjet.com${link}`);
        const r = detayParse(dhtml);
        detayParse._bc = null;
        if (!r.fiyat || !r.m2 || !r.il || !r.ilce) continue;
        const tlm2 = Math.round(r.fiyat / r.m2);
        if (tlm2 <= 0 || tlm2 > 10_000_000) continue;
        const ilN = normalizeTr(r.il), ilceN = normalizeTr(r.ilce);
        const mahN = r.mahalle ? normalizeYerAdi(r.mahalle) : null;
        // koordinat
        let lat = null, lng = null;
        if (mahN) {
          const k = `${ilN}__${ilceN}__${mahN}`;
          const t = MERKEZ[k];
          if (t) { lat = t[0]; lng = t[1]; }
        }
        kayitlar.push({ id, ilN, ilceN, mahN, kategori: r.kategori, tlm2, m2: r.m2, lat, lng });
        eklenen++;
      } catch { /* detay hata */ }
      await uyku(800 + Math.random() * 700); // kibar tempo
    }
    await uyku(1000);
  }
  return eklenen;
}

// ── Hedef iller (slug: emlakjet formatı, küçük harf tireli) ──
// İlçe slug'ları emlakjet'in beklediği formatta. Büyük şehirlerle başla.
const HEDEFLER = [
  ["istanbul", ["beykoz", "sile", "catalca", "silivri", "tuzla", "cekmekoy", "sancaktepe", "arnavutkoy", "buyukcekmece"]],
  ["ankara", ["cubuk", "golbasi", "kazan-kahramankazan", "polatli", "haymana", "elmadag"]],
  ["izmir", ["urla", "menderes", "seferihisar", "torbali", "kemalpasa", "bergama"]],
  ["bursa", ["nilufer", "gemlik", "iznik", "mudanya", "orhangazi"]],
  ["antalya", ["serik", "manavgat", "aksu", "dosemealti", "kepez"]],
  ["mugla", ["bodrum", "milas", "fethiye", "marmaris", "mentese"]],
  ["kocaeli", ["kandira", "golcuk", "kartepe", "basiskele"]],
  ["tekirdag", ["corlu", "ergene", "saray", "kapakli"]],
  ["balikesir", ["edremit", "ayvalik", "bandirma", "gonen"]],
  ["sakarya", ["serdivan", "akyazi", "karasu", "sapanca"]],
];

const MAX_SAYFA = 2; // ilçe+kategori başına sayfa (her sayfa ~24-30 ilan)

function sqlYaz(kayitlar) {
  const now = Date.now();
  const satirlar = kayitlar.map((k) =>
    `('extension','ej_${sqlEsc(k.id)}','${sqlEsc(k.ilN)}','${sqlEsc(k.ilceN)}',${k.mahN ? `'${sqlEsc(k.mahN)}'` : "NULL"},${k.tlm2},${k.m2},'${k.kategori}','TL',${now},${k.lat ?? "NULL"},${k.lng ?? "NULL"},${k.lat ? "'mahalle-merkez'" : "NULL"},1)`
  );
  let sql = "-- Emlakjet gerçek arsa/tarla verisi\n\n";
  for (let i = 0; i < satirlar.length; i += 400) {
    sql += `INSERT OR IGNORE INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, fiyat_per_m2, m2, kategori, para_birimi, yakalanma_tarihi, lat, lng, koord_kaynagi, aktif) VALUES\n`;
    sql += satirlar.slice(i, i + 400).join(",\n") + ";\n\n";
  }
  writeFileSync(CIKTI, sql, "utf8");
}

(async () => {
  const kayitlar = [];
  const gorulenler = new Set();
  for (const [il, ilceler] of HEDEFLER) {
    for (const ilce of ilceler) {
      for (const kat of ["arsa", "tarla"]) {
        process.stdout.write(`[${il}/${ilce}/${kat}] `);
        const n = await ilceTara(il, ilce, kat, MAX_SAYFA, kayitlar, gorulenler);
        console.log(`+${n} (toplam ${kayitlar.length}, koordlu ${kayitlar.filter((k) => k.lat).length})`);
      }
      // Checkpoint — her ilçe sonrası SQL'i güncelle (çökerse veri durur)
      sqlYaz(kayitlar);
    }
  }
  sqlYaz(kayitlar);
  console.log(`\n✅ ${kayitlar.length} gerçek ilan → ${CIKTI}`);
  console.log(`Koordinatlı: ${kayitlar.filter((k) => k.lat).length}`);
  console.log(`Yükle: SEED-EMLAKJET.bat ile.`);
})();
