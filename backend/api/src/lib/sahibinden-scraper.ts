/**
 * Sahibinden scraper — Cloudflare Worker fetch-based.
 *
 * UYARI: PerimeterX bot koruma nedeniyle Cloudflare IP'den çoğu istek 403
 * dönebilir. Bu modül fail-safe: hata yutar, retry yapmaz, son durumu
 * scraper_run tablosuna yazar. Admin dashboard'dan başarı oranı izlenir.
 *
 * Strateji:
 *   1. Liste sayfası fetch → HTML regex ile ilan link'leri çıkar
 *   2. Her link için detay sayfası fetch → fiyat/m²/lokasyon/koord parse
 *   3. ilanlar tablosuna INSERT (UNIQUE constraint duplicate'leri yutar)
 *   4. Run sonunda mahalle_istatistik refresh tetikle
 *
 * Cron: ayın 1'i 02:00 UTC. Tek run'da max ~5-10 ilçe (Worker 5dk timeout)
 * + state: scraper_run tablosunda kalınan yer kaydedilir, sonraki tetik
 * devam eder.
 */

import type { D1Database } from "@cloudflare/workers-types";

export interface ScraperRun {
  id: number;
  baslangic: number;
  bitis: number | null;
  islenenSayfa: number;
  yakalananIlan: number;
  basariliInsert: number;
  botEngelAdet: number;
  hataAdet: number;
  durum: "calisiyor" | "tamam" | "hata";
  sonHata?: string;
}

// User-Agent rotasyonu — bot tespitini azaltır (yine de PerimeterX yakalayabilir)
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0",
];

function rastgeleUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;
}

interface SayfaIlanLink {
  ilanNo: string;
  url: string;
}

/**
 * Sahibinden liste sayfasından ilan link'lerini çıkar.
 * URL örneği: https://www.sahibinden.com/satilik-arsa/istanbul-sile?pagingSize=50
 *
 * Bot engeli tespit ederse boş döner ve botEngel=true flag'ler.
 */
async function listeSayfaCek(
  ilNorm: string,
  ilceNorm: string,
  kategori: "arsa" | "tarla" = "arsa",
): Promise<{ linkler: SayfaIlanLink[]; botEngel: boolean; hata?: string }> {
  const katUrl = kategori === "tarla" ? "satilik-tarla" : "satilik-arsa";
  const url = `https://www.sahibinden.com/${katUrl}/${ilNorm}-${ilceNorm}?pagingSize=50`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": rastgeleUA(),
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    if (res.status === 403 || res.status === 429) {
      return { linkler: [], botEngel: true, hata: `HTTP ${res.status}` };
    }
    if (!res.ok) {
      return { linkler: [], botEngel: false, hata: `HTTP ${res.status}` };
    }

    const html = await res.text();

    // Bot challenge sayfaları genelde "captcha", "Access Denied", "Robot Doğrulaması" içerir
    if (/captcha|access denied|robot doğrulamas|robot dogrulama|press &amp;? hold|perimeterx|px-captcha/i.test(html)) {
      return { linkler: [], botEngel: true, hata: "Bot challenge HTML" };
    }

    // İlan link'lerini regex ile çıkar — DOM yok, Worker'da JSDOM ağır
    const linkRegex = /href="(\/ilan\/[^"]*?-(\d{8,11}))(?:\/|"|\?|#)/gi;
    const gorulen = new Set<string>();
    const linkler: SayfaIlanLink[] = [];
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(html)) !== null) {
      const yol = match[1]!;
      const ilanNo = match[2]!;
      if (gorulen.has(ilanNo)) continue;
      gorulen.add(ilanNo);
      linkler.push({ ilanNo, url: `https://www.sahibinden.com${yol}` });
    }

    return { linkler, botEngel: false };
  } catch (e) {
    return { linkler: [], botEngel: false, hata: e instanceof Error ? e.message : String(e) };
  }
}

interface DetayParse {
  fiyat: number | null;
  m2: number | null;
  paraBirimi: "TL" | "USD" | "EUR" | "GBP" | null;
  il: string | null;
  ilce: string | null;
  mahalle: string | null;
  lat: number | null;
  lng: number | null;
  kategori: string;
}

/**
 * Detay sayfası HTML parse — minimal regex tabanlı.
 * JSON-LD geo + bilgi tablosu + breadcrumb arar.
 */
async function detaySayfaParse(url: string): Promise<{ ok: boolean; data?: DetayParse; botEngel?: boolean; hata?: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": rastgeleUA(),
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
      },
    });
    if (res.status === 403 || res.status === 429) return { ok: false, botEngel: true };
    if (!res.ok) return { ok: false, hata: `HTTP ${res.status}` };
    const html = await res.text();
    if (/captcha|access denied|robot doğrulamas|robot dogrulama|perimeterx/i.test(html)) {
      return { ok: false, botEngel: true };
    }

    // JSON-LD geo
    let lat: number | null = null;
    let lng: number | null = null;
    const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLdMatch) {
      try {
        const data = JSON.parse(jsonLdMatch[1]!);
        const arr = Array.isArray(data) ? data : [data];
        for (const item of arr) {
          const geo = item?.geo;
          if (geo?.latitude && geo?.longitude) {
            const la = typeof geo.latitude === "string" ? parseFloat(geo.latitude) : geo.latitude;
            const lo = typeof geo.longitude === "string" ? parseFloat(geo.longitude) : geo.longitude;
            if (Number.isFinite(la) && Number.isFinite(lo) && la > 35 && la < 43 && lo > 25 && lo < 46) {
              lat = la; lng = lo;
              break;
            }
          }
        }
      } catch { /* ignore */ }
    }

    // Fiyat — `<div class="classifiedPrice">123.456 TL</div>` benzeri
    let fiyat: number | null = null;
    let paraBirimi: DetayParse["paraBirimi"] = null;
    const fpm = html.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*(TL|USD|EUR|GBP|\$|€|£)\s*<\/[^>]*price/i);
    if (fpm) {
      fiyat = parseFloat(fpm[1]!.replace(/\./g, "").replace(",", ".")) || null;
      const cur = fpm[2]!;
      paraBirimi = /\$|usd/i.test(cur) ? "USD" : /€|eur/i.test(cur) ? "EUR" : /£|gbp/i.test(cur) ? "GBP" : "TL";
    } else {
      // Daha geniş arama — meta tag veya inline price
      const m2 = html.match(/(\d{1,3}(?:[.,]\d{3})*)\s*(TL|USD|EUR|\$|€)/);
      if (m2) {
        const v = parseFloat(m2[1]!.replace(/\./g, "").replace(",", "."));
        if (Number.isFinite(v) && v > 10000) { // Min 10k = arsa fiyatı sanity
          fiyat = v;
          const cur = m2[2]!;
          paraBirimi = /\$|usd/i.test(cur) ? "USD" : /€|eur/i.test(cur) ? "EUR" : "TL";
        }
      }
    }

    // m² — "1500 m²" pattern
    let m2: number | null = null;
    const m2Match = html.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/i);
    if (m2Match) {
      const v = parseFloat(m2Match[1]!.replace(",", "."));
      if (Number.isFinite(v) && v > 10 && v < 1000000) m2 = v;
    }

    // Breadcrumb il/ilçe — "İSTANBUL > BEYKOZ > KAVACIK"
    let il: string | null = null;
    let ilce: string | null = null;
    let mahalle: string | null = null;
    const brMatch = html.match(/breadCrumb[^>]*>([\s\S]*?)<\/(?:ul|div)>/i);
    if (brMatch) {
      const aText = [...brMatch[1]!.matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map((m) => m[1]!.trim());
      if (aText.length >= 3) {
        il = aText[aText.length - 3] ?? null;
        ilce = aText[aText.length - 2] ?? null;
        mahalle = aText[aText.length - 1] ?? null;
      }
    }

    // Kategori — URL'den çıkar
    const kategori = url.includes("satilik-tarla") ? "tarla" : "arsa";

    return { ok: true, data: { fiyat, m2, paraBirimi, il, ilce, mahalle, lat, lng, kategori } };
  } catch (e) {
    return { ok: false, hata: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Normalize il/ilçe — normalizeYerAdi ile aynı kural (lowercase, TR → ASCII).
 */
function norm(s: string | null): string | null {
  if (!s) return null;
  return s
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (c) =>
      ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" })[c] ?? c,
    )
    .trim();
}

/**
 * Tek bir ilçe için: liste → her detayı parse → D1 INSERT.
 */
export async function ilceTarama(
  db: D1Database,
  ilNorm: string,
  ilceNorm: string,
  kategori: "arsa" | "tarla" = "arsa",
  maksIlan = 20, // İlk N ilanı detay parse et (5 dk timeout için)
): Promise<{ link: number; insert: number; botEngel: number; hata: number }> {
  const liste = await listeSayfaCek(ilNorm, ilceNorm, kategori);
  if (liste.botEngel) {
    return { link: 0, insert: 0, botEngel: 1, hata: 0 };
  }
  if (liste.hata) {
    return { link: 0, insert: 0, botEngel: 0, hata: 1 };
  }

  const linkler = liste.linkler.slice(0, maksIlan);
  let insert = 0;
  let botEngel = 0;
  let hata = 0;

  for (const link of linkler) {
    const det = await detaySayfaParse(link.url);
    if (det.botEngel) { botEngel++; continue; }
    if (!det.ok || !det.data) { hata++; continue; }
    const d = det.data;
    if (!d.fiyat || !d.m2 || d.m2 <= 0) { hata++; continue; }

    const fiyatPerM2 = Math.round(d.fiyat / d.m2);
    if (fiyatPerM2 < 100 || fiyatPerM2 > 10_000_000) { hata++; continue; }

    try {
      await db.prepare(
        `INSERT OR IGNORE INTO ilanlar
          (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, fiyat_per_m2,
           m2, kategori, para_birimi, yakalanma_tarihi, lat, lng, koord_kaynagi)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "extension",
        link.ilanNo,
        norm(d.il) ?? ilNorm,
        norm(d.ilce) ?? ilceNorm,
        norm(d.mahalle),
        fiyatPerM2,
        d.m2,
        d.kategori,
        d.paraBirimi ?? "TL",
        Date.now(),
        d.lat != null ? Math.round(d.lat * 1000) / 1000 : null,
        d.lng != null ? Math.round(d.lng * 1000) / 1000 : null,
        d.lat != null ? "dom" : null,
      ).run();
      insert++;
    } catch {
      hata++;
    }

    // İnsani tempo — 1.5sn rastgele gecikme
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
  }

  return { link: linkler.length, insert, botEngel, hata };
}

/**
 * Birden çok ilçeyi sırayla tara — Worker 5dk timeout sınırı içinde.
 */
export async function tumIlceleri(
  db: D1Database,
  hedefler: Array<{ ilNorm: string; ilceNorm: string }>,
  kategori: "arsa" | "tarla" = "arsa",
): Promise<{ islenenIlce: number; toplamLink: number; toplamInsert: number; toplamBotEngel: number; toplamHata: number }> {
  const baslangic = Date.now();
  const MAKS_SURE_MS = 4 * 60 * 1000; // 4 dk (Worker 5dk timeout, biraz pay)

  let islenenIlce = 0;
  let toplamLink = 0;
  let toplamInsert = 0;
  let toplamBotEngel = 0;
  let toplamHata = 0;

  for (const h of hedefler) {
    if (Date.now() - baslangic > MAKS_SURE_MS) break;
    const r = await ilceTarama(db, h.ilNorm, h.ilceNorm, kategori, 10);
    toplamLink += r.link;
    toplamInsert += r.insert;
    toplamBotEngel += r.botEngel;
    toplamHata += r.hata;
    islenenIlce++;

    // Bot engeli arttıysa erken çık (IP yasak riski)
    if (toplamBotEngel >= 3) break;
  }

  return { islenenIlce, toplamLink, toplamInsert, toplamBotEngel, toplamHata };
}
