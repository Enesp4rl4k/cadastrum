/**
 * TCMB EVDS API — Konut Fiyat Endeksi (KFE) bölge bazlı çarpan.
 *
 * Mevcut enflasyon-duzeltme.ts tek bir TÜFE × 1.15 multiplier kullanıyor.
 * Bu modül daha iyisini yapar: TCMB'nin İBBS Düzey 2 bölge bazlı KFE'sinden
 * gerçek konut fiyat endeksi alır → bölgesel doğruluk artar.
 *
 * Örnek: Konya KFE TR52 endeksi vs İstanbul TR10 farklı şekilde değişir.
 *
 * API: https://evds2.tcmb.gov.tr/service/evds/series=TP.HKFE01-26&type=json
 * Auth: header `key: <API_KEY>`
 * Key alma: https://evds2.tcmb.gov.tr/index.php?/evds/login
 *
 * Fallback: API key yoksa veya hata olursa null döner — caller TÜFE'ye düşer.
 * Cache: 24 saat chrome.storage.local
 */

import { ayarlariGetir } from "./ayarlar";

const EVDS_BASE = "https://evds2.tcmb.gov.tr/service/evds";
const CACHE_KEY = "tcmbKfeCache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat

/**
 * İl adı → İBBS Düzey 2 (NUTS-2) bölge kodu.
 * TCMB KFE bu bölge granülerinde yayınlanır.
 * Kaynak: TÜİK İBBS sınıflandırması.
 */
export const IL_NUTS2: Record<string, string> = {
  // TR1 Batı Anadolu, Marmara, Akdeniz...
  "İstanbul": "TR10",
  "Tekirdağ": "TR21", "Edirne": "TR21", "Kırklareli": "TR21",
  "Balıkesir": "TR22", "Çanakkale": "TR22",
  "İzmir": "TR31",
  "Aydın": "TR32", "Denizli": "TR32", "Muğla": "TR32",
  "Manisa": "TR33", "Afyonkarahisar": "TR33", "Kütahya": "TR33", "Uşak": "TR33",
  "Bursa": "TR41", "Eskişehir": "TR41", "Bilecik": "TR41",
  "Kocaeli": "TR42", "Sakarya": "TR42", "Düzce": "TR42", "Bolu": "TR42", "Yalova": "TR42",
  "Ankara": "TR51",
  "Konya": "TR52", "Karaman": "TR52",
  "Antalya": "TR61", "Isparta": "TR61", "Burdur": "TR61",
  "Adana": "TR62", "Mersin": "TR62",
  "Hatay": "TR63", "Kahramanmaraş": "TR63", "Osmaniye": "TR63",
  "Kırıkkale": "TR71", "Aksaray": "TR71", "Niğde": "TR71", "Nevşehir": "TR71", "Kırşehir": "TR71",
  "Kayseri": "TR72", "Sivas": "TR72", "Yozgat": "TR72",
  "Zonguldak": "TR81", "Karabük": "TR81", "Bartın": "TR81",
  "Kastamonu": "TR82", "Çankırı": "TR82", "Sinop": "TR82",
  "Samsun": "TR83", "Tokat": "TR83", "Çorum": "TR83", "Amasya": "TR83",
  "Trabzon": "TR90", "Ordu": "TR90", "Giresun": "TR90", "Rize": "TR90", "Artvin": "TR90", "Gümüşhane": "TR90",
  "Erzurum": "TRA1", "Erzincan": "TRA1", "Bayburt": "TRA1",
  "Ağrı": "TRA2", "Kars": "TRA2", "Iğdır": "TRA2", "Ardahan": "TRA2",
  "Malatya": "TRB1", "Elazığ": "TRB1", "Bingöl": "TRB1", "Tunceli": "TRB1",
  "Van": "TRB2", "Muş": "TRB2", "Bitlis": "TRB2", "Hakkari": "TRB2",
  "Gaziantep": "TRC1", "Adıyaman": "TRC1", "Kilis": "TRC1",
  "Şanlıurfa": "TRC2", "Diyarbakır": "TRC2",
  "Mardin": "TRC3", "Batman": "TRC3", "Şırnak": "TRC3", "Siirt": "TRC3",
};

/**
 * NUTS-2 bölge kodu → TCMB KFE seri kodu.
 * TP.HKFE01 = Türkiye geneli, TR10-TRC3 = bölgesel
 *
 * NOT: Seri kodu konvansiyonu PDF'ten doğrulanmış değil.
 * Default bağlanma "TP.HKFE01" Türkiye geneli — bölgesel mevcut değilse fallback.
 */
const NUTS2_KFE_SERIES: Record<string, string> = {
  "TR10": "TP.HKFE.TR10",
  "TR21": "TP.HKFE.TR21", "TR22": "TP.HKFE.TR22",
  "TR31": "TP.HKFE.TR31", "TR32": "TP.HKFE.TR32", "TR33": "TP.HKFE.TR33",
  "TR41": "TP.HKFE.TR41", "TR42": "TP.HKFE.TR42",
  "TR51": "TP.HKFE.TR51", "TR52": "TP.HKFE.TR52",
  "TR61": "TP.HKFE.TR61", "TR62": "TP.HKFE.TR62", "TR63": "TP.HKFE.TR63",
  "TR71": "TP.HKFE.TR71", "TR72": "TP.HKFE.TR72",
  "TR81": "TP.HKFE.TR81", "TR82": "TP.HKFE.TR82", "TR83": "TP.HKFE.TR83",
  "TR90": "TP.HKFE.TR90",
  "TRA1": "TP.HKFE.TRA1", "TRA2": "TP.HKFE.TRA2",
  "TRB1": "TP.HKFE.TRB1", "TRB2": "TP.HKFE.TRB2",
  "TRC1": "TP.HKFE.TRC1", "TRC2": "TP.HKFE.TRC2", "TRC3": "TP.HKFE.TRC3",
};
const KFE_TR_GENEL = "TP.HKFE01";

export interface TcmbKfeSonuc {
  /** Endeks çarpan (örn. 1.42 = baselineTarih→bugun arası %42 KFE artışı) */
  carpan: number;
  /** Hangi seri kullanıldı */
  seri: string;
  /** Bölge adı (UI'da göster) */
  bolge: string;
  /** Veri tarihleri (yyyy-mm) */
  baslangicTarih: string;
  bitisTarih: string;
  /** Cache mi yoksa fresh mi? */
  cached: boolean;
}

interface CachedKfe {
  veri: Record<string, { tarih: string; deger: number }[]>;  // seri → [{tarih, deger}]
  cachedAt: number;
}

/** "2025-01" → "01-01-2025" (TCMB EVDS format) */
function evdsDate(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `01-${m}-${y}`;
}

/** "01-01-2025" → "2025-01" (geri çevirme) */
function fromEvdsDate(s: string): string {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  if (!m) return s;
  return `${m[3]}-${m[2]}`;
}

async function cacheOku(): Promise<CachedKfe | null> {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return null;
  try {
    const data = await chrome.storage.local.get(CACHE_KEY);
    const cached = data[CACHE_KEY] as CachedKfe | undefined;
    if (!cached) return null;
    if (Date.now() - cached.cachedAt > CACHE_TTL_MS) return null;
    return cached;
  } catch {
    return null;
  }
}

async function cacheYaz(veri: Record<string, { tarih: string; deger: number }[]>): Promise<void> {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return;
  try {
    await chrome.storage.local.set({
      [CACHE_KEY]: { veri, cachedAt: Date.now() } satisfies CachedKfe,
    });
  } catch {
    // ignore
  }
}

/**
 * EVDS API'den seri verisini çek. Hata olursa null döner.
 */
async function evdsFetch(
  seriKodu: string,
  baslangicTarih: string,
  bitisTarih: string,
  apiKey: string,
): Promise<{ tarih: string; deger: number }[] | null> {
  const url = `${EVDS_BASE}/series=${encodeURIComponent(seriKodu)}` +
    `&startDate=${encodeURIComponent(evdsDate(baslangicTarih))}` +
    `&endDate=${encodeURIComponent(evdsDate(bitisTarih))}` +
    `&type=json&aggregationTypes=avg&formulas=0&frequency=5`; // frequency 5 = aylık

  try {
    const res = await fetch(url, {
      headers: { "key": apiKey, "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`[tcmb-kfe] HTTP ${res.status} for ${seriKodu}`);
      return null;
    }
    const data = await res.json() as {
      items?: Array<Record<string, string | number>>;
      totalCount?: number;
    };
    if (!data.items || data.items.length === 0) return null;

    // EVDS response field name'i seri koduna bağlı (nokta yerine alt çizgi):
    // TP.HKFE.TR10 → TP_HKFE_TR10
    const fieldName = seriKodu.replace(/\./g, "_");
    const result: { tarih: string; deger: number }[] = [];
    for (const item of data.items) {
      const tarih = item.Tarih as string | undefined;
      const deger = item[fieldName];
      if (typeof tarih !== "string") continue;
      const sayi = typeof deger === "number" ? deger : parseFloat(String(deger));
      if (!isFinite(sayi) || sayi <= 0) continue;
      result.push({ tarih: fromEvdsDate(tarih), deger: sayi });
    }
    return result.length > 0 ? result : null;
  } catch (e) {
    console.warn(`[tcmb-kfe] fetch hata:`, e);
    return null;
  }
}

/**
 * TCMB KFE çarpanı getir: baselineTarih → bugun arası endeks oranı.
 *
 * @param il Parselin ili (örn. "Konya") — NUTS-2 bölgesine map'lenir
 * @param baselineTarih "YYYY-MM" formatında baseline ayı
 * @returns null → API key yok / hata / veri yok (caller TÜFE fallback'e düşmeli)
 */
export async function tcmbKfeCarpaniGetir(
  il: string | null | undefined,
  baselineTarih: string,
): Promise<TcmbKfeSonuc | null> {
  const ayar = await ayarlariGetir();
  const apiKey = ayar.tcmbApiKey;
  if (!apiKey || apiKey.trim().length < 10) return null;

  // Seri kodu seç
  const nuts2 = il ? IL_NUTS2[il] : null;
  const seriKodu = (nuts2 && NUTS2_KFE_SERIES[nuts2]) ?? KFE_TR_GENEL;
  const bolge = nuts2 ?? "Türkiye geneli";

  // Cache kontrol
  const cache = await cacheOku();
  let seriler: { tarih: string; deger: number }[] | null = null;
  let cached = false;

  if (cache?.veri?.[seriKodu]) {
    seriler = cache.veri[seriKodu] ?? null;
    cached = true;
  } else {
    // Tüm baseline aralığında ve günümüz arası çek
    const bugun = new Date();
    const bitisTarih = `${bugun.getFullYear()}-${String(bugun.getMonth() + 1).padStart(2, "0")}`;
    seriler = await evdsFetch(seriKodu, baselineTarih, bitisTarih, apiKey);

    // Bölgesel veri yoksa Türkiye geneli dene
    if (!seriler && seriKodu !== KFE_TR_GENEL) {
      seriler = await evdsFetch(KFE_TR_GENEL, baselineTarih, bitisTarih, apiKey);
      if (seriler) {
        // cache kayıt için yeni key
        const yeniCache = cache?.veri ?? {};
        yeniCache[KFE_TR_GENEL] = seriler;
        await cacheYaz(yeniCache);
      }
    } else if (seriler) {
      const yeniCache = cache?.veri ?? {};
      yeniCache[seriKodu] = seriler;
      await cacheYaz(yeniCache);
    }
  }

  if (!seriler || seriler.length < 2) return null;

  // Baseline ve son ay endeks değerleri
  const baslangicVeri = seriler.find(s => s.tarih === baselineTarih) ?? seriler[0];
  const sonVeri = seriler[seriler.length - 1];
  if (!baslangicVeri || !sonVeri || baslangicVeri.deger <= 0) return null;

  const carpan = sonVeri.deger / baslangicVeri.deger;

  return {
    carpan: Math.round(carpan * 10000) / 10000,
    seri: seriKodu,
    bolge,
    baslangicTarih: baslangicVeri.tarih,
    bitisTarih: sonVeri.tarih,
    cached,
  };
}
