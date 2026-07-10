#!/usr/bin/env node
/**
 * Aylık otomatik Sahibinden scraper (yerel — Puppeteer + Node).
 *
 * Kullanım:
 *   node scripts/aylik-scrape.mjs                       # tüm Türkiye, 80 ilçe
 *   node scripts/aylik-scrape.mjs --il=istanbul         # tek il
 *   node scripts/aylik-scrape.mjs --il=istanbul --ilce=sile  # tek ilçe
 *   node scripts/aylik-scrape.mjs --maks=20             # max 20 ilçe (test)
 *   node scripts/aylik-scrape.mjs --maks-ilan=5         # her ilçeden max 5 ilan (hızlı)
 *
 * Env var:
 *   SCRAPER_API_SECRET — backend /v1/ilan/batch için Bearer auth (zorunlu)
 *   API_BASE — backend URL (varsayılan workers.dev)
 *
 * İlk kurulum:
 *   cd C:\Users\parlak\Downloads\arsa-tkgm-extension
 *   npm install puppeteer
 *
 * Windows Task Scheduler ayarı için OTOMATIK-SCRAPER-KURULUM.md'ye bak.
 */

// puppeteer-extra + stealth plugin — Sahibinden PerimeterX bot tespitini atlatır
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
puppeteer.use(StealthPlugin());

const ARGS = parseArgs();

const API_BASE = process.env.API_BASE || "https://cadastrum-api.cadastrum-tr.workers.dev/v1";
const SCRAPER_SECRET = process.env.SCRAPER_API_SECRET;

if (!SCRAPER_SECRET) {
  console.error("HATA: SCRAPER_API_SECRET env var set edilmedi.");
  console.error("Set etmek için (CMD):  set SCRAPER_API_SECRET=23afe125...");
  console.error("Veya PowerShell:        $env:SCRAPER_API_SECRET = '23afe125...'");
  process.exit(1);
}

// Popüler 80 ilçe — emlak yoğun bölgeler. Tam Türkiye'ye geçmek için bootstrap-ilce-listesi.ts kullan.
const VARSAYILAN_HEDEFLER = [
  // İstanbul (39 ilçe)
  ["istanbul", "beykoz"], ["istanbul", "sile"], ["istanbul", "catalca"], ["istanbul", "silivri"],
  ["istanbul", "tuzla"], ["istanbul", "pendik"], ["istanbul", "kartal"], ["istanbul", "maltepe"],
  ["istanbul", "kadikoy"], ["istanbul", "atasehir"], ["istanbul", "umraniye"], ["istanbul", "uskudar"],
  ["istanbul", "besiktas"], ["istanbul", "sisli"], ["istanbul", "sariyer"], ["istanbul", "kagithane"],
  ["istanbul", "eyupsultan"], ["istanbul", "gaziosmanpasa"], ["istanbul", "esenyurt"], ["istanbul", "buyukcekmece"],
  ["istanbul", "beylikduzu"], ["istanbul", "avcilar"], ["istanbul", "kucukcekmece"], ["istanbul", "basaksehir"],
  ["istanbul", "arnavutkoy"], ["istanbul", "sancaktepe"], ["istanbul", "cekmekoy"], ["istanbul", "fatih"],
  ["istanbul", "zeytinburnu"], ["istanbul", "bagcilar"],
  // Ankara (10 yoğun)
  ["ankara", "cankaya"], ["ankara", "yenimahalle"], ["ankara", "kecioren"], ["ankara", "etimesgut"],
  ["ankara", "sincan"], ["ankara", "mamak"], ["ankara", "golbasi"], ["ankara", "polatli"],
  // İzmir (10)
  ["izmir", "konak"], ["izmir", "karsiyaka"], ["izmir", "bornova"], ["izmir", "gaziemir"],
  ["izmir", "buca"], ["izmir", "balcova"], ["izmir", "cesme"], ["izmir", "urla"],
  ["izmir", "selcuk"], ["izmir", "menderes"],
  // Antalya (8)
  ["antalya", "muratpasa"], ["antalya", "konyaalti"], ["antalya", "kepez"], ["antalya", "alanya"],
  ["antalya", "manavgat"], ["antalya", "kemer"], ["antalya", "kas"], ["antalya", "serik"],
  // Muğla (6)
  ["mugla", "bodrum"], ["mugla", "fethiye"], ["mugla", "marmaris"], ["mugla", "datca"],
  ["mugla", "milas"], ["mugla", "menteseköy"],
  // Bursa, Eskişehir, Kocaeli vs (8)
  ["bursa", "nilufer"], ["bursa", "osmangazi"], ["bursa", "mudanya"], ["bursa", "gemlik"],
  ["eskisehir", "tepebasi"], ["eskisehir", "odunpazari"],
  ["kocaeli", "izmit"], ["kocaeli", "gebze"],
  // Sahil + ikinci konut
  ["balikesir", "ayvalik"], ["balikesir", "edremit"], ["canakkale", "ayvacik"],
  ["aydin", "kusadasi"], ["aydin", "didim"], ["tekirdag", "sarkoy"],
];

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
  return {
    il: get("il"),
    ilce: get("ilce"),
    kategori: get("kategori") ?? "arsa",
    maks: parseInt(get("maks") ?? "80", 10),
    maksIlan: parseInt(get("maks-ilan") ?? "15", 10),
    headless: get("headless") !== "false",
  };
}

function hedefler() {
  if (ARGS.il && ARGS.ilce) return [[ARGS.il, ARGS.ilce]];
  if (ARGS.il) return VARSAYILAN_HEDEFLER.filter(([il]) => il === ARGS.il);
  return VARSAYILAN_HEDEFLER.slice(0, ARGS.maks);
}

async function uyu(ms) {
  return new Promise((r) => setTimeout(r, ms + Math.random() * 1000));
}

/**
 * Liste sayfasından ilan link'lerini çıkar.
 */
async function listeLinkleri(page, ilNorm, ilceNorm, kategori) {
  const katUrl = kategori === "tarla" ? "satilik-tarla" : "satilik-arsa";
  const url = `https://www.sahibinden.com/${katUrl}/${ilNorm}-${ilceNorm}?pagingSize=50`;
  console.log(`  → ${url}`);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await uyu(2000);

    // Bot challenge kontrol
    const title = await page.title();
    const body = await page.evaluate(() => document.body?.textContent?.slice(0, 300) ?? "");
    if (/robot|captcha|access denied|perimeterx/i.test(title + " " + body)) {
      console.warn(`  ⚠️  Bot challenge: "${title}"`);
      return { linkler: [], botEngel: true };
    }

    const linkler = await page.evaluate(() => {
      const set = new Set();
      const result = [];
      document.querySelectorAll("a[href*='/ilan/']").forEach((a) => {
        const href = a.getAttribute("href");
        if (!href) return;
        const m = href.match(/\/ilan\/[^/]*?-(\d{8,11})/);
        if (!m || set.has(m[1])) return;
        set.add(m[1]);
        result.push({ ilanNo: m[1], url: href.startsWith("http") ? href : `https://www.sahibinden.com${href}` });
      });
      return result;
    });

    console.log(`  ✓ ${linkler.length} unique ilan link bulundu`);
    return { linkler, botEngel: false };
  } catch (e) {
    console.warn(`  ✗ Hata: ${e.message}`);
    return { linkler: [], botEngel: false };
  }
}

/**
 * Detay sayfasını parse et — fiyat, m², lokasyon, lat/lng.
 */
async function detayParse(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await uyu(1500);

    const title = await page.title();
    if (/robot|captcha|access denied/i.test(title)) return null;

    return await page.evaluate(() => {
      // Başlık
      const h1 = document.querySelector("h1.classifiedTitle, h1[class*='classifiedTitle'], h1");
      const baslik = h1?.textContent?.trim() || null;

      // JSON-LD geo
      let lat = null, lng = null;
      for (const s of document.querySelectorAll("script[type='application/ld+json']")) {
        try {
          const d = JSON.parse(s.textContent || "{}");
          const items = Array.isArray(d) ? d : [d];
          for (const item of items) {
            if (item.geo?.latitude && item.geo?.longitude) {
              const la = parseFloat(item.geo.latitude), lo = parseFloat(item.geo.longitude);
              if (la > 35 && la < 43 && lo > 25 && lo < 46) { lat = la; lng = lo; break; }
            }
          }
          if (lat) break;
        } catch {}
      }

      // Fiyat
      let fiyat = null, paraBirimi = "TL";
      const fiyatEl = document.querySelector(".classifiedInfo .price, .classified-price, [class*='Price'], [class*='price']");
      const fiyatTxt = fiyatEl?.textContent?.trim() || "";
      const fpm = fiyatTxt.match(/(\d{1,3}(?:[.,]\d{3})*)\s*(TL|USD|EUR|\$|€)/i);
      if (fpm) {
        fiyat = parseFloat(fpm[1].replace(/\./g, "").replace(",", "."));
        const cur = fpm[2];
        paraBirimi = /\$|usd/i.test(cur) ? "USD" : /€|eur/i.test(cur) ? "EUR" : "TL";
      }

      // m² ve lokasyon — bilgi tablosu
      let m2 = null, mahalle = null, adaNo = null, parselNo = null, imarDurumu = null;
      const liler = document.querySelectorAll("ul.classifiedInfoList li, .classifiedInfoList li, [class*='classifiedInfoList'] li");
      for (const li of liler) {
        const t = (li.textContent || "").trim();
        const m = t.match(/^([^:]+?)[:\s]+(.+)$/);
        if (!m) continue;
        const label = m[1].toLocaleLowerCase("tr").trim();
        const value = m[2].trim();
        if (/metrekare|m[²2]|brüt/i.test(label) && !m2) {
          const v = parseFloat(value.replace(/[^\d.,]/g, "").replace(",", "."));
          if (Number.isFinite(v) && v > 10) m2 = v;
        } else if (/mahalle/i.test(label)) {
          mahalle = value.replace(/Mah\.?$/i, "").trim();
        } else if (/ada\s*no?$/i.test(label)) {
          const v = parseInt(value.replace(/\D/g, ""), 10);
          if (Number.isFinite(v)) adaNo = v;
        } else if (/parsel\s*no?$/i.test(label)) {
          const v = parseInt(value.replace(/\D/g, ""), 10);
          if (Number.isFinite(v)) parselNo = v;
        } else if (/imar/i.test(label) && !imarDurumu) {
          imarDurumu = value;
        }
      }

      // Breadcrumb il/ilçe
      let il = null, ilce = null;
      const breadcrumbs = document.querySelectorAll(".classifiedInfo .breadCrumb a, .breadCrumb a, [class*='breadCrumb'] a");
      const lokAdlari = Array.from(breadcrumbs).map((a) => a.textContent?.trim()).filter(Boolean);
      if (lokAdlari.length >= 3) {
        il = lokAdlari[lokAdlari.length - 3] || null;
        ilce = lokAdlari[lokAdlari.length - 2] || null;
        if (!mahalle) mahalle = lokAdlari[lokAdlari.length - 1] || null;
      }

      return { baslik, fiyat, m2, paraBirimi, il, ilce, mahalle, adaNo, parselNo, imarDurumu, lat, lng };
    });
  } catch (e) {
    console.warn(`    ✗ Detay hata: ${e.message}`);
    return null;
  }
}

function normalize(s) {
  if (!s) return null;
  return s.toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" })[c] ?? c)
    .trim();
}

async function backendeGonder(ilanlar) {
  if (ilanlar.length === 0) return { basarili: 0, hata: 0, duplicate: 0 };
  const res = await fetch(`${API_BASE}/ilan/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SCRAPER_SECRET}`,
    },
    body: JSON.stringify({ ilanlar }),
  });
  if (!res.ok) {
    console.warn(`  ✗ Backend ${res.status}: ${await res.text()}`);
    return { basarili: 0, hata: ilanlar.length, duplicate: 0 };
  }
  return await res.json();
}

async function istatistikRefresh() {
  console.log("[refresh] mahalle_istatistik tetikleniyor…");
  const res = await fetch(`${API_BASE}/istatistik/refresh?secret=${encodeURIComponent(SCRAPER_SECRET)}`);
  if (res.ok) {
    console.log(`[refresh] ✓ ${await res.text()}`);
  } else {
    console.warn(`[refresh] ✗ ${res.status}`);
  }
}

async function main() {
  const hedeflerListesi = hedefler();
  console.log(`\n📊 Cadastrum Aylık Scraper`);
  console.log(`Hedef: ${hedeflerListesi.length} ilçe × ~${ARGS.maksIlan} ilan = max ${hedeflerListesi.length * ARGS.maksIlan} kayıt`);
  console.log(`Kategori: ${ARGS.kategori}, Headless: ${ARGS.headless}`);
  console.log(`Tahmini süre: ${Math.round(hedeflerListesi.length * ARGS.maksIlan * 3 / 60)} dakika\n`);

  const browser = await puppeteer.launch({
    headless: ARGS.headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--lang=tr-TR"],
  });
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36");
  await page.setExtraHTTPHeaders({ "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8" });

  let toplamLink = 0, toplamIlan = 0, toplamInsert = 0, toplamBotEngel = 0;

  try {
    for (let i = 0; i < hedeflerListesi.length; i++) {
      const [ilNorm, ilceNorm] = hedeflerListesi[i];
      console.log(`\n[${i + 1}/${hedeflerListesi.length}] ${ilNorm}/${ilceNorm}`);

      const { linkler, botEngel } = await listeLinkleri(page, ilNorm, ilceNorm, ARGS.kategori);
      if (botEngel) {
        toplamBotEngel++;
        if (toplamBotEngel >= 3) {
          console.error("⚠️  3+ bot engel — IP yasaklanma riski, çıkılıyor.");
          break;
        }
        await uyu(60_000); // 1 dk backoff
        continue;
      }
      toplamLink += linkler.length;

      const detayHedef = linkler.slice(0, ARGS.maksIlan);
      const ilanBatch = [];
      for (let j = 0; j < detayHedef.length; j++) {
        const link = detayHedef[j];
        const d = await detayParse(page, link.url);
        if (!d || !d.fiyat || !d.m2 || d.m2 <= 0) continue;

        const fiyatPerM2 = Math.round(d.fiyat / d.m2);
        if (fiyatPerM2 < 100 || fiyatPerM2 > 10_000_000) continue;

        ilanBatch.push({
          kaynak: "extension",
          ilan_no: link.ilanNo,
          il: d.il || ilNorm,
          ilce: d.ilce || ilceNorm,
          mahalle: d.mahalle || undefined,
          fiyat_per_m2: fiyatPerM2,
          m2: d.m2,
          kategori: ARGS.kategori,
          imar_durumu: d.imarDurumu ?? undefined,
          para_birimi: d.paraBirimi || "TL",
          lat: d.lat ?? undefined,
          lng: d.lng ?? undefined,
          koord_kaynagi: d.lat ? "dom" : undefined,
        });
        toplamIlan++;
        await uyu(1500);
      }

      const sonuc = await backendeGonder(ilanBatch);
      toplamInsert += sonuc.basarili || 0;
      console.log(`  → backend: basarili=${sonuc.basarili}, dup=${sonuc.duplicate}, hata=${sonuc.hata}`);

      // İlçe arası rate limit
      await uyu(5000);
    }
  } finally {
    await browser.close();
  }

  console.log(`\n✓ TAMAM`);
  console.log(`Toplam link: ${toplamLink}, parse: ${toplamIlan}, backend insert: ${toplamInsert}, bot engel: ${toplamBotEngel}`);

  // İstatistik refresh (yeterli veri biriktiyse)
  if (toplamInsert > 100) {
    await istatistikRefresh();
  } else {
    console.log("[refresh] Yetersiz yeni veri (<100), istatistik refresh atlandı.");
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
