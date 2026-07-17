/**
 * Analiz Orkestratörü — tüm veri katmanlarını paralel fetch eden ve
 * ilerleme durumunu tek noktada raporlayan hook.
 *
 * Parsel değiştiğinde otomatik başlar — kullanıcı "analiz et" butonuna
 * basmak zorunda kalmaz.
 *
 * Katmanlar (öncelik sırası):
 *   1. TKGM (parsel bilgisi)           — zaten geldi
 *   2. e-Plan (imar)                   — useEPlanVerisi hook'u yönetiyor
 *   3. OSM/Overpass (çevre/POI)        — cevreyiAnalizEt yönetiyor
 *   4. Open-Meteo Elevation (eğim)     — cevreyiAnalizEt yönetiyor
 *   5. AFAD + GloFAS (risk)            — DogalVeriKarti yönetiyor
 *   6. OpenLandMap (heyelan)           — DogalVeriKarti yönetiyor
 *   7. Milli Emlak (ihale fiyatları)   — MilliEmlakKarti yönetiyor
 *   8. AI fiyat tahmini               — FiyatTahminKarti yönetiyor
 *
 * Bu hook: yukarıdaki katmanların durumunu toplayıp progress UI'a veri sağlar.
 */

export type KatmanDurum = "bekliyor" | "yukleniyor" | "tamam" | "hata" | "atlandi";

export interface KatmanBilgi {
  id: string;
  ad: string;
  ikon: string;
  durum: KatmanDurum;
  sure?: number; // ms — tamamlanma süresi
}

export interface AnalizIlerleme {
  katmanlar: KatmanBilgi[];
  tamamlanan: number;
  toplam: number;
  tamamlandiMi: boolean;
  /** Kaç ms geçti (parsel geldiğinden beri) */
  gecenMs: number;
}

/** Katman durumunu birleşik ilerleme yüzdesine çevir */
export function ilerlemeYuzde(ilerleme: AnalizIlerleme): number {
  if (ilerleme.toplam === 0) return 0;
  return Math.round((ilerleme.tamamlanan / ilerleme.toplam) * 100);
}

/** Tüm katmanların beklenen listesi — statik tanım */
export const KATMAN_TANIMLARI: Omit<KatmanBilgi, "durum" | "sure">[] = [
  { id: "tkgm",        ad: "Parsel Bilgisi",        ikon: "🗺️" },
  { id: "eplan",       ad: "İmar Durumu",            ikon: "📋" },
  { id: "osm",         ad: "Çevre & POI",            ikon: "📍" },
  { id: "egim",        ad: "Eğim & Yükseklik",       ikon: "⛰️" },
  { id: "deprem",      ad: "Deprem Riski",            ikon: "🌍" },
  { id: "taskin",      ad: "Taşkın & Sel",            ikon: "💧" },
  { id: "heyelan",     ad: "Heyelan Duyarlılık",      ikon: "🏔️" },
  { id: "milli-emlak", ad: "Milli Emlak İhaleleri",   ikon: "🏛️" },
  { id: "fiyat",       ad: "Fiyat Tahmini",           ikon: "💰" },
];

/**
 * Tüm katmanların durumunu tutarlı bir state'e map'le.
 * Her katman "bekliyor" → "yukleniyor" → "tamam" | "hata" geçişi yapar.
 */
export function katmanlarOlustur(
  overrides: Partial<Record<string, KatmanDurum>> = {}
): KatmanBilgi[] {
  return KATMAN_TANIMLARI.map((k) => ({
    ...k,
    durum: overrides[k.id] ?? "bekliyor",
  }));
}

/** Tamamlanan katman sayısını hesapla */
export function tamamlananSay(katmanlar: KatmanBilgi[]): number {
  return katmanlar.filter((k) => k.durum === "tamam" || k.durum === "atlandi").length;
}
