export type IlanKaynak = "sahibinden" | "hepsiemlak";

export interface IlanBilgisi {
  kaynak: IlanKaynak;
  url: string;
  baslik: string | null;
  fiyat: number | null;
  fiyatStr: string | null;
  paraBirimi: string | null;
  m2: number | null;
  il: string | null;
  ilce: string | null;
  mahalle: string | null;
  adaNo: number | null;
  parselNo: number | null;
  pafta: string | null;
  imarDurumu: string | null;
  ilanNo: string | null;
  aciklamadaAdaParsel: { ada?: number; parsel?: number }[];
  yakalanmaZamani: number;
  /** Kullanıcı manuel olarak il/ilçe/mahalle düzeltti mi? Backend POST ve cache key'i için. */
  manuelDuzeltildi?: boolean;
  /**
   * Faz 2 — Spatial emsal motoru: ilanın koordinatı (DOM/JSON-LD/__NEXT_DATA__'dan).
   * Yoksa null; IlanKarti.tsx mahalle merkez fallback ile doldurur.
   */
  lat?: number | null;
  lng?: number | null;
  /** Koord kaynağı — `dom` = scrape başarılı; `mahalle-merkez` = fallback; `null` = hiç yok */
  koordKaynagi?: "dom" | "mahalle-merkez" | null;
  /** Koord güvenilirliği — DOM scrape `yuksek`, mahalle merkez `orta`, ilçe centroid `dusuk` */
  koordDogruluk?: "yuksek" | "orta" | "dusuk" | null;
}
