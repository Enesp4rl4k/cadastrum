/**
 * Milli Emlak İhale Scraper
 *
 * Kaynak: milliemlak.gov.tr/web/tr/tasinmaz-satis-ilanlar
 * Yöntem: HTML scrape (Cheerio), pagination, no API key
 *
 * Çalıştırma:
 *   node scripts/milli-emlak-scraper.mjs
 *   node scripts/milli-emlak-scraper.mjs --il=istanbul --maks=50
 *   node scripts/milli-emlak-scraper.mjs --dry-run
 *
 * Çıktı: D1'e INSERT (backend API /v1/admin/milli-emlak/seed endpoint ile)
 *        veya --dry-run ile stdout JSON
 */

import * as cheerio from "cheerio";

const BASE_URL = "https://www.milliemlak.gov.tr";
const LIST_PATH = "/web/tr/tasinmaz-satis-ilanlar";

// CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const IL_FILTRE = args.find((a) => a.startsWith("--il="))?.split("=")[1] ?? null;
const MAKS_ILAN = parseInt(args.find((a) => a.startsWith("--maks="))?.split("=")[1] ?? "200");
const API_BASE = process.env.CADASTRUM_API_URL ?? "https://api.cadastrum.com.tr";
const API_SECRET = process.env.SCRAPER_API_SECRET;

// İl adı → normalize
function normalizeYerAdi(s) {
  if (!s) return "";
  return s
    .toLocaleLowerCase("tr")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
    .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/â/g, "a").replace(/î/g, "i").replace(/û/g, "u")
    .replace(/\s+/g, " ").trim();
}

// m² parse — "1.250,00 m²" → 1250
function parseM2(s) {
  if (!s) return null;
  const clean = s.replace(/[^\d,.]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(clean);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// TL parse — "1.500.000,00 TL" → 1500000
function parseTL(s) {
  if (!s) return null;
  const clean = s.replace(/[^\d,.]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(clean);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Tarih parse — "15.06.2024" → unix ms
function parseTarih(s) {
  if (!s) return null;
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  return new Date(`${m[3]}-${m[2]}-${m[1]}`).getTime();
}

/**
 * Tek sayfa HTML'ini parse et — ilan listesi
 */
function parseListeSayfasi(html) {
  const $ = cheerio.load(html);
  const ilanlar = [];

  // Milli Emlak tablo yapısı: her satır bir ilan
  $("table tbody tr, .ilan-listesi .ilan-satir").each((_, row) => {
    const hucre = $(row).find("td");
    if (hucre.length < 4) return;

    const ilAd = hucre.eq(0).text().trim();
    const ilceAd = hucre.eq(1).text().trim();
    const mahalleAd = hucre.eq(2).text().trim();
    const adaParsel = hucre.eq(3).text().trim();
    const nitelik = hucre.eq(4).text().trim();
    const m2Str = hucre.eq(5).text().trim();
    const muhammenStr = hucre.eq(6).text().trim();
    const ihaleTarihStr = hucre.eq(7).text().trim();
    const detayLink = $(row).find("a").attr("href");

    if (!ilAd || !ilceAd) return;

    // Ada/parsel parse
    const adaParselM = adaParsel.match(/(\d+)\s*[/\s]\s*(\d+)/);
    const adaNo = adaParselM?.[1] ?? null;
    const parselNo = adaParselM?.[2] ?? null;

    const m2 = parseM2(m2Str);
    const muhammenBedel = parseTL(muhammenStr);
    const ihaleT = parseTarih(ihaleTarihStr);

    if (!muhammenBedel) return; // Fiyatsız ilan atla

    const fiyatPerM2 = m2 && m2 > 0 ? Math.round(muhammenBedel / m2) : null;

    ilanlar.push({
      il_norm: normalizeYerAdi(ilAd),
      ilce_norm: normalizeYerAdi(ilceAd),
      mahalle_norm: mahalleAd ? normalizeYerAdi(mahalleAd) : null,
      ada_no: adaNo,
      parsel_no: parselNo,
      m2: m2,
      nitelik: nitelik || null,
      muhammen_bedel: muhammenBedel,
      ihale_bedeli: muhammenBedel, // Kapanış fiyatı detay sayfasından çekilebilir
      fiyat_per_m2: fiyatPerM2,
      ihale_tarihi: ihaleT,
      ihale_tipi: "satis",
      kaynak_url: detayLink ? `${BASE_URL}${detayLink}` : null,
      yakalanma_tarihi: Date.now(),
    });
  });

  return ilanlar;
}

/**
 * Sonraki sayfa var mı?
 */
function sonrakiSayfaVar(html) {
  const $ = cheerio.load(html);
  return $(".pagination .next:not(.disabled), a[rel='next']").length > 0;
}

/**
 * Sayfa URL'i oluştur
 */
function sayfaUrl(sayfa, ilFiltre) {
  const params = new URLSearchParams({ page: sayfa.toString() });
  if (ilFiltre) params.set("il", ilFiltre);
  return `${BASE_URL}${LIST_PATH}?${params.toString()}`;
}

/**
 * Ana scrape fonksiyonu
 */
async function scrape() {
  console.log(`[milli-emlak] Başlıyor — max ${MAKS_ILAN} ilan${IL_FILTRE ? ` (il: ${IL_FILTRE})` : ""}`);

  const tumIlanlar = [];
  let sayfa = 1;
  let devam = true;

  while (devam && tumIlanlar.length < MAKS_ILAN) {
    const url = sayfaUrl(sayfa, IL_FILTRE);
    console.log(`[milli-emlak] Sayfa ${sayfa}: ${url}`);

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "tr-TR,tr;q=0.9",
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        console.warn(`[milli-emlak] HTTP ${res.status} — duruyoruz`);
        break;
      }

      const html = await res.text();

      // CAPTCHA/bot engeli kontrolü
      if (html.includes("captcha") || html.includes("Lütfen robot olmadığınızı")) {
        console.warn("[milli-emlak] Bot engeli tespit edildi — duruyoruz");
        break;
      }

      const ilanlar = parseListeSayfasi(html);
      console.log(`[milli-emlak] Sayfa ${sayfa}: ${ilanlar.length} ilan`);

      tumIlanlar.push(...ilanlar);

      devam = sonrakiSayfaVar(html) && ilanlar.length > 0;
      sayfa++;

      // Nazik rate limit
      if (devam) await new Promise((r) => setTimeout(r, 2000 + Math.random() * 1000));
    } catch (e) {
      console.error(`[milli-emlak] Sayfa ${sayfa} hata: ${e.message}`);
      break;
    }
  }

  console.log(`[milli-emlak] Toplam ${tumIlanlar.length} ilan toplandı`);

  if (DRY_RUN) {
    console.log(JSON.stringify(tumIlanlar.slice(0, 5), null, 2));
    console.log(`[milli-emlak] --dry-run: D1'e yazılmadı`);
    return;
  }

  if (tumIlanlar.length === 0) {
    console.log("[milli-emlak] İlan yok — çıkıyoruz");
    return;
  }

  // Backend API'ye gönder
  await backendeSeed(tumIlanlar);
}

/**
 * Backend API'ye batch seed
 */
async function backendeSeed(ilanlar) {
  if (!API_SECRET) {
    console.error("[milli-emlak] SCRAPER_API_SECRET env yok — seed atlandı");
    console.log(`[milli-emlak] İlanları manuel seed için: scripts/milli-emlak-data.json`);
    const fs = await import("fs/promises");
    await fs.writeFile(
      "scripts/milli-emlak-data.json",
      JSON.stringify(ilanlar, null, 2),
      "utf8"
    );
    return;
  }

  const BATCH_SIZE = 50;
  let toplam = 0;

  for (let i = 0; i < ilanlar.length; i += BATCH_SIZE) {
    const batch = ilanlar.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(`${API_BASE}/v1/admin/milli-emlak/seed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${API_SECRET}`,
        },
        body: JSON.stringify({ ilanlar: batch }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const body = await res.text();
        console.error(`[milli-emlak] Seed batch ${i / BATCH_SIZE + 1} HTTP ${res.status}: ${body}`);
        continue;
      }

      const result = await res.json();
      toplam += result.eklenen ?? 0;
      console.log(`[milli-emlak] Batch ${i / BATCH_SIZE + 1}: ${result.eklenen} eklendi`);
    } catch (e) {
      console.error(`[milli-emlak] Batch ${i / BATCH_SIZE + 1} hata: ${e.message}`);
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`[milli-emlak] Tamamlandı — ${toplam} kayıt D1'e eklendi`);
}

// Main
scrape().catch((e) => {
  console.error("[milli-emlak] Fatal:", e.message);
  process.exit(1);
});
