/**
 * Sahibinden DOM Monitor — selector kırılması algılama.
 *
 * Sahibinden sitesinin DOM yapısı periyodik olarak değişir (class name'leri
 * dinamik). Bizim parser bunları yakalamak için fallback selector chain
 * kullanıyor. Yine de yeni layout çıktığında parser'ın sessiz fail etmesi
 * yerine bildirim almak istiyoruz.
 *
 * Bu modül:
 *  1. İlan detay sayfasında bilinen elementlerin varlığını kontrol eder
 *  2. Eksik elementleri `dom_anomaly_<tarih>` olarak chrome.storage'a yazar
 *  3. Boot view bu kayıtları admin'e listeler — kullanıcı parser güncellemesi
 *     gerektiğini görür
 *
 * Yalnızca admin profilinde aktif — KVKK opt-out olabilir.
 */

interface AnomalyKayit {
  ts: number;
  url: string;
  eksikSelectors: string[];
  domSnippet: string;
}

const STORAGE_PREFIX = "dom_anomaly_";
const MAX_KAYIT = 50; // Son 50 anomaly tutulur, rotation

// Bilinen kritik selektörler — ilan detay sayfasında olması beklenen
const KRITIK_SELECTORS: Array<{ ad: string; selektor: string }> = [
  { ad: "Başlık", selektor: "h1.classifiedTitle, h1[class*='classifiedTitle'], h1[class*='ClassifiedTitle'], h1" },
  { ad: "Fiyat", selektor: ".classifiedInfo .price, .classified-price, [class*='Price'], [class*='price']" },
  { ad: "Bilgi tablosu", selektor: "ul.classifiedInfoList, .classifiedInfoList, [class*='classifiedInfoList']" },
  { ad: "Breadcrumb", selektor: ".classifiedInfo .breadCrumb, .breadCrumb, [class*='breadCrumb']" },
];

/**
 * Sayfada eksik kritik selektörleri tespit eder.
 */
export function eksikSelektorTespit(): string[] {
  const eksikler: string[] = [];
  for (const k of KRITIK_SELECTORS) {
    if (!document.querySelector(k.selektor)) {
      eksikler.push(k.ad);
    }
  }
  return eksikler;
}

/**
 * Anomaly'yi chrome.storage'a kaydet (sadece eksik varsa).
 */
export async function anomalyKaydet(url: string): Promise<void> {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return;
  const eksikler = eksikSelektorTespit();
  if (eksikler.length === 0) return; // Sayfa normal

  // DOM snippet — debug için ilk 1000 karakter body text
  const snippet = (document.body?.textContent ?? "").replace(/\s+/g, " ").slice(0, 1000);

  const kayit: AnomalyKayit = {
    ts: Date.now(),
    url,
    eksikSelectors: eksikler,
    domSnippet: snippet,
  };

  const key = `${STORAGE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await chrome.storage.local.set({ [key]: kayit });

  // Rotation — son 50'yi tut, eski olanları sil
  const tum = await chrome.storage.local.get();
  const anomalyKeys = Object.keys(tum).filter((k) => k.startsWith(STORAGE_PREFIX));
  if (anomalyKeys.length > MAX_KAYIT) {
    anomalyKeys.sort(); // tarih sıralı (timestamp)
    const silinecekler = anomalyKeys.slice(0, anomalyKeys.length - MAX_KAYIT);
    await chrome.storage.local.remove(silinecekler);
  }
}

/**
 * Boot view'da listelemek için tüm anomaly'leri oku.
 */
export async function anomalyListesi(): Promise<AnomalyKayit[]> {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return [];
  const tum = await chrome.storage.local.get();
  return Object.entries(tum)
    .filter(([k]) => k.startsWith(STORAGE_PREFIX))
    .map(([, v]) => v as AnomalyKayit)
    .sort((a, b) => b.ts - a.ts);
}

/**
 * Tüm anomaly'leri sil.
 */
export async function anomalyTemizle(): Promise<void> {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return;
  const tum = await chrome.storage.local.get();
  const keys = Object.keys(tum).filter((k) => k.startsWith(STORAGE_PREFIX));
  if (keys.length > 0) await chrome.storage.local.remove(keys);
}
