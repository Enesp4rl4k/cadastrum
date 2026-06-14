/**
 * Döviz kuru — USD/EUR/GBP ilanlarını TL'ye çevirmek için.
 *
 * 2 katmanlı strateji:
 * 1) TCMB Türkiye Cumhuriyet Merkez Bankası günlük XML kurları (otomatik refresh, 6 saatlik cache)
 * 2) Statik fallback — TCMB ulaşılamazsa veya API kapalıysa devreye girer
 *
 * Hassas finansal işlem değil; emsal havuzunda dövizli ilanları TL bazına
 * çekip ortalamaya dahil etmek için kullanılıyor.
 */

const TCMB_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 saat

/** Statik fallback (Mayıs 2026, manuel güncelleme) */
const FALLBACK_RATES: Record<string, number> = {
  TL: 1,
  TRY: 1,
  USD: 42,
  EUR: 45,
  GBP: 53,
};
const FALLBACK_GUNCEL_AY = "2026-05";

interface KurCache {
  rates: Record<string, number>;
  fetchedAt: number;
  source: "tcmb" | "fallback";
  tarih: string;
}

let kurCache: KurCache | null = null;
let kurFetchInflight: Promise<KurCache> | null = null;

/**
 * TCMB XML'den günlük kurları çek + parse et.
 * XML formatı:
 *   <Currency CurrencyCode="USD"><ForexBuying>X</ForexBuying><ForexSelling>Y</ForexSelling></Currency>
 *
 * Forex selling (efektif satış) kullanıyoruz — ilan satıcısının pratik beklentisi.
 */
async function tcmbKurlarinaCek(): Promise<KurCache | null> {
  try {
    const r = await fetch(TCMB_URL, { method: "GET" });
    if (!r.ok) return null;
    const xml = await r.text();
    const tarih = /Tarih="([^"]+)"/.exec(xml)?.[1] ?? new Date().toISOString().slice(0, 10);

    const rates: Record<string, number> = { TL: 1, TRY: 1 };
    const re = /<Currency[^>]*CurrencyCode="([^"]+)"[^>]*>([\s\S]*?)<\/Currency>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const code = m[1];
      const block = m[2];
      if (!code || !block) continue;
      const sellingMatch = /<ForexSelling>([\d.]+)<\/ForexSelling>/.exec(block);
      const banknoteSelling = /<BanknoteSelling>([\d.]+)<\/BanknoteSelling>/.exec(block);
      const valStr = sellingMatch?.[1] ?? banknoteSelling?.[1];
      if (!valStr) continue;
      const val = Number.parseFloat(valStr);
      if (Number.isFinite(val) && val > 0) rates[code] = val;
    }

    if (Object.keys(rates).length < 4) return null; // sanity check
    return {
      rates,
      fetchedAt: Date.now(),
      source: "tcmb",
      tarih,
    };
  } catch {
    return null;
  }
}

/** Cache'li kur tablosunu getir; gerekiyorsa TCMB'den taze çek */
export async function kurlariniGuncelle(): Promise<KurCache> {
  // Cache geçerli mi?
  if (kurCache && Date.now() - kurCache.fetchedAt < CACHE_TTL_MS) {
    return kurCache;
  }
  // Concurrent çağrılar aynı fetch'i paylaşsın
  if (kurFetchInflight) return kurFetchInflight;

  kurFetchInflight = (async () => {
    const tcmb = await tcmbKurlarinaCek();
    const result: KurCache = tcmb ?? {
      rates: FALLBACK_RATES,
      fetchedAt: Date.now(),
      source: "fallback",
      tarih: FALLBACK_GUNCEL_AY,
    };
    kurCache = result;
    kurFetchInflight = null;
    return result;
  })();

  return kurFetchInflight;
}

/** Senkron kur erişimi — kurlariniGuncelle'i opsiyonel olarak background'da çağırır */
function suankiKurTablosu(): Record<string, number> {
  if (kurCache) return kurCache.rates;
  // Cache yoksa background'da fetch tetikle ama statik tabloyla cevap dön
  if (typeof fetch !== "undefined" && !kurFetchInflight) {
    kurlariniGuncelle().catch(() => {});
  }
  return FALLBACK_RATES;
}

/** Verilen para biriminden TL'ye çevir. Bilinmeyen para birimi → null. */
export function tlyeCevir(
  fiyat: number | null,
  paraBirimi: string | null | undefined,
): number | null {
  if (fiyat == null || fiyat <= 0) return null;
  if (!paraBirimi) return fiyat; // belirsiz → TL kabul et
  const kur = suankiKurTablosu()[paraBirimi.toUpperCase()];
  if (!kur) return null;
  return Math.round(fiyat * kur);
}

/** TL/m² hesabı: paraBirimi farklıysa kur uygulanır */
export function fiyatPerM2TLOlarak(
  fiyat: number | null,
  m2: number | null,
  paraBirimi: string | null | undefined,
): number | null {
  const tlFiyat = tlyeCevir(fiyat, paraBirimi);
  if (tlFiyat == null || m2 == null || m2 <= 0) return null;
  return Math.round(tlFiyat / m2);
}

/** Mevcut kur tablosunu UI'da göstermek için */
export function kurDurumu(): { tarih: string; source: "tcmb" | "fallback"; rates: Record<string, number> } {
  if (kurCache) {
    return { tarih: kurCache.tarih, source: kurCache.source, rates: { ...kurCache.rates } };
  }
  return { tarih: FALLBACK_GUNCEL_AY, source: "fallback", rates: { ...FALLBACK_RATES } };
}

/** İlan paraBirimi TL değil mi? (USD/EUR/GBP vs.) */
export function dovizliMi(paraBirimi: string | null | undefined): boolean {
  if (!paraBirimi) return false;
  const upper = paraBirimi.toUpperCase();
  return upper !== "TL" && upper !== "TRY";
}
