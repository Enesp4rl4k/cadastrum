#!/usr/bin/env node
/**
 * Aylık otomatik Hepsiemlak scraper (yerel — Puppeteer + Stealth).
 *
 * Sahibinden PerimeterX nedeniyle bot bloke ediyor; Hepsiemlak headless Chrome
 * + Stealth plugin ile geçilebiliyor. Bu script Hepsiemlak'tan ilan toplar.
 *
 * URL pattern: https://www.hepsiemlak.com/<ilce>-satilik/arsa
 * İlan link pattern: /<il>-<ilce>-<mahalle>-satilik/<kategori>/<ilanNo>-<seri>
 *
 * Kullanım:
 *   node scripts/aylik-scrape-hepsiemlak.mjs --ilce=sile --maks-ilan=5
 *   node scripts/aylik-scrape-hepsiemlak.mjs --maks=80
 *
 * Env: SCRAPER_API_SECRET (zorunlu), API_BASE (opsiyonel)
 */

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
puppeteer.use(StealthPlugin());

const ARGS = parseArgs();
const API_BASE = process.env.API_BASE || "https://cadastrum-api.cadastrum-tr.workers.dev/v1";
const SCRAPER_SECRET = process.env.SCRAPER_API_SECRET;

if (!SCRAPER_SECRET) {
  console.error("HATA: SCRAPER_API_SECRET env var set edilmedi.");
  process.exit(1);
}

// Hepsiemlak ilçe URL slug'ları. Sahibinden ile aynı isim ama bazı farklar
// (örn "şile" → "sile", "büyükçekmece" → "buyukcekmece"). 80 popüler ilçe.
const HEDEFLER = [
  // İstanbul
  "sile", "beykoz", "catalca", "silivri", "tuzla", "pendik", "kartal", "maltepe",
  "kadikoy", "atasehir", "umraniye", "uskudar", "besiktas", "sisli", "sariyer",
  "kagithane", "eyup", "gaziosmanpasa", "esenyurt", "buyukcekmece", "beylikduzu",
  "avcilar", "kucukcekmece", "basaksehir", "arnavutkoy", "sancaktepe", "cekmekoy",
  "fatih", "zeytinburnu", "bagcilar",
  // Ankara — Hepsiemlak'ta /ankara/cankaya-satilik/arsa formatı, biraz farklı
  "cankaya-ankara", "yenimahalle-ankara", "kecioren-ankara", "etimesgut-ankara",
  "sincan-ankara", "mamak-ankara", "golbasi-ankara", "polatli-ankara",
  // İzmir
  "konak-izmir", "karsiyaka-izmir", "bornova-izmir", "buca-izmir", "gaziemir-izmir",
  "balcova-izmir", "cesme-izmir", "urla-izmir", "selcuk-izmir", "menderes-izmir",
  // Antalya
  "muratpasa-antalya", "konyaalti-antalya", "kepez-antalya", "alanya", "manavgat",
  "kemer", "kas", "serik",
  // Muğla
  "bodrum", "fethiye", "marmaris", "datca", "milas",
  // Bursa/Eskişehir/Kocaeli
  "nilufer-bursa", "osmangazi-bursa", "mudanya", "gemlik",
  "tepebasi", "odunpazari", "izmit", "gebze",
  // Sahil
  "ayvalik", "edremit", "ayvacik-canakkale", "kusadasi", "didim", "sarkoy",
];

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
  return {
    ilce: get("ilce"),
    kategori: get("kategori") ?? "arsa",
    maks: parseInt(get("maks") ?? "20", 10),
    maksIlan: parseInt(get("maks-ilan") ?? "15", 10),
    headless: get("headless") !== "false",
  };
}

function hedeflerListesi() {
  if (ARGS.ilce) return [ARGS.ilce];
  return HEDEFLER.slice(0, ARGS.maks);
}

const uyu = (ms) => new Promise((r) => setTimeout(r, ms + Math.random() * 1000));

function normalize(s) {
  if (!s) return null;
  return s.toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c] ?? c)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * İlçe slug'ından il/ilçe çıkar. Çoklu kelime'li ilçeler için:
 *   "sile" → { il: "istanbul", ilce: "sile" } (default)
 *   "cankaya-ankara" → { il: "ankara", ilce: "cankaya" }
 */
function ilceSlugCoz(slug) {
  // 2 parçalı ise: <ilce>-<il>
  const parts = slug.split("-");
  if (parts.length === 2) {
    return { il: parts[1], ilce: parts[0] };
  }
  // Tek parça → İstanbul varsayılan (Hepsiemlak default behavior)
  return { il: "istanbul", ilce: slug };
}

/**
 * Liste sayfasından ilan link'lerini topla.
 */
async function listeCek(page, ilceSlug, kategori) {
  const katPath = kategori === "tarla" ? "tarla" : "arsa";
  // 2 parçalı slug için URL: /<il>-<ilce>-satilik/arsa|tarla veya /<ilce>-satilik/...
  let url;
  if (ilceSlug.includes("-")) {
    const [ilce, il] = ilceSlug.split("-");
    url = `https://www.hepsiemlak.com/${il}-${ilce}-satilik/${katPath}`;
  } else {
    url = `https://www.hepsiemlak.com/${ilceSlug}-satilik/${katPath}`;
  }
  console.log(`  → ${url}`);

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45_000 });
    await uyu(3000);

    // Cloudflare "Just a moment" challenge — bekle ve tekrar dene
    let title = await page.title();
    if (/just a moment|attention|cloudflare/i.test(title)) {
      console.log(`  ⏳ Cloudflare challenge bekleniyor (10s)…`);
      await uyu(10_000);
      title = await page.title();
    }

    // Bot/url hata
    if (/captcha|robot|olağan dış/i.test(title)) {
      console.warn(`  ⚠️  Bot challenge: ${title}`);
      return { linkler: [], hata: "bot-engel" };
    }
    if (/aradığınız sayfaya|sayfa bulunamadı|404/i.test(title)) {
      console.warn(`  ⚠️  URL yok: ${title}`);
      return { linkler: [], hata: "url-yok" };
    }

    // Scroll — lazy loaded ilanlar yüklensin
    await page.evaluate(() => window.scrollBy(0, 3000));
    await uyu(2000);

    const linkler = await page.evaluate(() => {
      const set = new Set();
      const result = [];
      document.querySelectorAll("a[href]").forEach((a) => {
        const href = a.href;
        // Pattern: /<il>-<ilce>-<mahalle>-satilik/<kategori>/<ilanNo>-<seri>
        const m = href.match(/\/([a-z0-9-]+)-satilik\/([a-z-]+)\/(\d{5,11})-(\d{1,5})/i);
        if (!m) return;
        const ilanNo = `${m[3]}-${m[4]}`;
        if (set.has(ilanNo)) return;
        set.add(ilanNo);
        result.push({
          ilanNo,
          url: href,
          urlSlug: m[1],         // örn "istanbul-sile-karakiraz"
          kategoriSlug: m[2],    // örn "imarli-konut" | "tarla" | "arsa"
        });
      });
      return result;
    });

    console.log(`  ✓ ${linkler.length} unique ilan link`);
    return { linkler };
  } catch (e) {
    console.warn(`  ✗ ${e.message}`);
    return { linkler: [], hata: e.message };
  }
}

/**
 * Detay sayfası parse — Hepsiemlak Next.js + JSON-LD.
 */
async function detayCek(page, ilan) {
  try {
    await page.goto(ilan.url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await uyu(2000);

    const title = await page.title();
    if (/captcha|robot|olağan dış|aradığınız sayfaya/i.test(title)) return null;

    const data = await page.evaluate(() => {
      let lat = null, lng = null, fiyat = null, paraBirimi = "TL", m2 = null;
      let il = null, ilce = null, mahalle = null, imarDurumu = null;

      // JSON-LD veya __NEXT_DATA__
      try {
        const nd = document.getElementById("__NEXT_DATA__");
        if (nd) {
          const data = JSON.parse(nd.textContent || "{}");
          const listing = data?.props?.pageProps?.listing;
          if (listing) {
            // Lokasyon
            const loc = listing.geo || listing.location || listing.coordinates;
            if (loc) {
              const la = typeof loc.lat === "string" ? parseFloat(loc.lat) : loc.lat || loc.latitude;
              const lo = typeof loc.lng === "string" ? parseFloat(loc.lng) : loc.lng || loc.longitude;
              if (la > 35 && la < 43 && lo > 25 && lo < 46) { lat = la; lng = lo; }
            }
            fiyat = listing.price?.amount || listing.price || null;
            paraBirimi = listing.price?.currency || "TL";
            m2 = listing.attributes?.area || listing.area || listing.size || null;
            // Lokasyon hierarchy
            const lh = listing.location || listing.address;
            if (lh) {
              il = lh.city?.name || lh.city || null;
              ilce = lh.district?.name || lh.district || null;
              mahalle = lh.neighborhood?.name || lh.neighborhood || null;
            }
            // İmar
            imarDurumu = listing.attributes?.zoningType || listing.zoning || null;
          }
        }
      } catch (e) { /* ignore */ }

      // Fallback DOM parse
      if (!fiyat) {
        const fEl = document.querySelector("[class*='price'], [class*='Price']");
        const fTxt = fEl?.textContent?.trim() || "";
        const m = fTxt.match(/(\d{1,3}(?:[.,]\d{3})*)\s*(TL|USD|EUR|\$|€)/);
        if (m) {
          fiyat = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
          paraBirimi = /\$|usd/i.test(m[2]) ? "USD" : /€|eur/i.test(m[2]) ? "EUR" : "TL";
        }
      }
      if (!m2) {
        const m2Match = document.body.textContent.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/);
        if (m2Match) {
          const v = parseFloat(m2Match[1].replace(",", "."));
          if (Number.isFinite(v) && v > 10 && v < 1000000) m2 = v;
        }
      }
      // Breadcrumb fallback
      if (!il || !ilce) {
        const bc = document.querySelectorAll("[class*='breadcrumb'] a, [class*='Breadcrumb'] a");
        const items = [...bc].map((a) => a.textContent?.trim()).filter(Boolean);
        if (items.length >= 3) {
          if (!il) il = items[items.length - 3];
          if (!ilce) ilce = items[items.length - 2];
          if (!mahalle) mahalle = items[items.length - 1];
        }
      }

      return { fiyat, m2, paraBirimi, il, ilce, mahalle, imarDurumu, lat, lng };
    });

    return data;
  } catch (e) {
    return null;
  }
}

async function backendePost(batch) {
  if (batch.length === 0) return { basarili: 0, hata: 0, duplicate: 0 };
  const res = await fetch(`${API_BASE}/ilan/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SCRAPER_SECRET}` },
    body: JSON.stringify({ ilanlar: batch }),
  });
  if (!res.ok) {
    console.warn(`  ✗ Backend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return { basarili: 0, hata: batch.length, duplicate: 0 };
  }
  return await res.json();
}

async function istatistikRefresh() {
  console.log("\n[refresh] mahalle_istatistik tetikleniyor…");
  const res = await fetch(`${API_BASE}/istatistik/refresh?secret=${encodeURIComponent(SCRAPER_SECRET)}`);
  console.log(`[refresh] ${res.ok ? "✓" : "✗"} ${res.status}`);
}

async function main() {
  const hedefler = hedeflerListesi();
  console.log(`\n📊 Cadastrum Aylık Scraper — Hepsiemlak`);
  console.log(`${hedefler.length} ilçe × ~${ARGS.maksIlan} ilan = max ${hedefler.length * ARGS.maksIlan} kayıt`);
  console.log(`Kategori: ${ARGS.kategori}, Headless: ${ARGS.headless}\n`);

  const browser = await puppeteer.launch({
    headless: ARGS.headless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--lang=tr-TR",
      "--disable-blink-features=AutomationControlled",
    ],
  });
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36");
  await page.setExtraHTTPHeaders({ "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8" });

  // Cloudflare challenge bypass — önce anasayfaya gidip cookie oluştur.
  // İlk istek challenge geçer (10 sn), sonraki istekler aynı session ile sorunsuz.
  console.log("🍪 Cloudflare session açılıyor (anasayfa ziyaret)…");
  try {
    await page.goto("https://www.hepsiemlak.com/", { waitUntil: "networkidle2", timeout: 60_000 });
    await uyu(10_000); // Challenge tamamen geçsin
    const t = await page.title();
    if (/just a moment|cloudflare|attention/i.test(t)) {
      console.warn(`  ⚠️  Anasayfa hâlâ challenge: "${t}" — devam ediyorum`);
      await uyu(15_000);
    } else {
      console.log(`  ✓ Session açıldı (${t})`);
    }
  } catch (e) {
    console.warn(`  ⚠️  Anasayfa hata: ${e.message}`);
  }

  let toplamLink = 0, toplamInsert = 0, hataIlce = 0;

  try {
    for (let i = 0; i < hedefler.length; i++) {
      const ilceSlug = hedefler[i];
      const { il, ilce } = ilceSlugCoz(ilceSlug);
      console.log(`\n[${i + 1}/${hedefler.length}] ${il}/${ilce}`);

      const liste = await listeCek(page, ilceSlug, ARGS.kategori);
      if (liste.hata === "bot-engel") {
        hataIlce++;
        if (hataIlce >= 3) {
          console.error("⚠️  3+ bot engel — IP yasak riski, çıkılıyor.");
          break;
        }
        await uyu(60_000);
        continue;
      }
      if (liste.linkler.length === 0) {
        hataIlce++;
        continue;
      }
      toplamLink += liste.linkler.length;

      const batch = [];
      const targetSayi = Math.min(liste.linkler.length, ARGS.maksIlan);
      for (let j = 0; j < targetSayi; j++) {
        const link = liste.linkler[j];
        const d = await detayCek(page, link);
        if (!d || !d.fiyat || !d.m2 || d.m2 <= 0) continue;

        const fiyatPerM2 = Math.round(d.fiyat / d.m2);
        if (fiyatPerM2 < 100 || fiyatPerM2 > 10_000_000) continue;

        // Kategori: liste sayfası hedefi + slug (sadece arsa/tarla/bahce/zeytinlik)
        let kategori = ARGS.kategori;
        if (link.kategoriSlug === "tarla") kategori = "tarla";
        else if (link.kategoriSlug === "bahce") kategori = "bahce";
        else if (link.kategoriSlug === "zeytinlik") kategori = "zeytinlik";
        else if (link.kategoriSlug?.includes("arsa") || link.kategoriSlug?.includes("imarli")) kategori = "arsa";
        if (kategori !== "arsa" && kategori !== "tarla") continue;

        batch.push({
          kaynak: "hepsiemlak",
          ilan_no: link.ilanNo,
          il: d.il || il,
          ilce: d.ilce || ilce,
          mahalle: d.mahalle || undefined,
          fiyat_per_m2: fiyatPerM2,
          m2: d.m2,
          kategori,
          imar_durumu: d.imarDurumu ?? undefined,
          para_birimi: d.paraBirimi || "TL",
          lat: d.lat ?? undefined,
          lng: d.lng ?? undefined,
          koord_kaynagi: d.lat ? "dom" : undefined,
        });
        await uyu(1500);
      }

      const sonuc = await backendePost(batch);
      toplamInsert += sonuc.basarili || 0;
      console.log(`  → backend: ${sonuc.basarili} insert, ${sonuc.duplicate} dup, ${sonuc.hata} hata`);

      await uyu(8000); // ilçe arası rate — Cloudflare challenge tetik azaltma
    }
  } finally {
    await browser.close();
  }

  console.log(`\n✓ TAMAM`);
  console.log(`Toplam link: ${toplamLink}, backend insert: ${toplamInsert}, hata ilçe: ${hataIlce}`);

  if (toplamInsert > 50) await istatistikRefresh();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
