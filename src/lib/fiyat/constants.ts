/**
 * fiyat/constants.ts — İl bazlı fallback baseline TL/m² sabitleri.
 *
 * Bu dosya fiyat-tahmin.ts'ten çıkarılmıştır.
 * Gerçek D1 emsal verisi biriktikçe bu tablolar kullanılmaz.
 * Kaynak: Sahibinden ilan ortalaması + AI tahmin (2025).
 */

/** İl bazlı arsa baseline TL/m² (urban, imarlı/imarsız karma) */
export const IL_BASELINE_ARSA_TL_M2: Record<string, number> = {
  // Mega şehirler
  "İstanbul": 18000,
  "Ankara": 6000,
  "İzmir": 10000,
  // Sahil + büyükşehir
  "Antalya": 8000,
  "Muğla": 7000,
  "Bursa": 5000,
  "Kocaeli": 4500,
  "Sakarya": 3500,
  "Tekirdağ": 3000,
  "Yalova": 4000,
  // Anadolu büyükşehir
  "Adana": 3500,
  "Mersin": 3500,
  "Gaziantep": 2800,
  "Konya": 2500,
  "Kayseri": 2200,
  "Eskişehir": 3200,
  "Diyarbakır": 1800,
  "Samsun": 2500,
  "Trabzon": 3500,
  "Şanlıurfa": 1500,
  "Hatay": 2200,
  "Manisa": 2000,
  "Balıkesir": 2800,
  "Denizli": 2500,
  "Erzurum": 1500,
  "Kahramanmaraş": 1800,
  "Malatya": 1500,
  "Mardin": 1300,
  "Van": 1200,
  "Ordu": 2000,
  // Diğer — FALLBACK_BASELINE_TL_M2 kullanılır
};

/** Arsa baseline yoksa bu değer kullanılır */
export const FALLBACK_BASELINE_TL_M2 = 1000;

/**
 * İl bazlı kırsal tarla baseline TL/m².
 * Urban arsa baseline'dan farklı — konut imarından uzak tarım arazisi.
 * Konya/Meram/Çukurçimen gibi kırsal mahalle tarla'sı için urban arsa
 * baseline kullanmak 10-15x overshoot'a yol açıyordu.
 */
export const IL_BASELINE_TARLA_TL_M2: Record<string, number> = {
  // Mega + sahil — yatırım baskısı yüksek
  "İstanbul": 2500,
  "Ankara": 900,
  "İzmir": 1500,
  "Antalya": 1500,
  "Muğla": 1300,
  "Bursa": 800,
  "Kocaeli": 700,
  "Sakarya": 500,
  "Tekirdağ": 500,
  "Yalova": 800,
  // Anadolu büyükşehir
  "Adana": 350,
  "Mersin": 500,
  "Gaziantep": 250,
  "Konya": 200,
  "Kayseri": 200,
  "Eskişehir": 350,
  "Diyarbakır": 120,
  "Samsun": 300,
  "Trabzon": 600,
  "Şanlıurfa": 100,
  "Hatay": 350,
  "Manisa": 350,
  "Balıkesir": 500,
  "Denizli": 300,
  "Erzurum": 80,
  "Kahramanmaraş": 180,
  "Malatya": 130,
  "Mardin": 100,
  "Van": 80,
  "Ordu": 350,
};

/** Tarla baseline yoksa bu değer kullanılır */
export const FALLBACK_TARLA_BASELINE_TL_M2 = 200;

export const GUN_MS = 86_400_000;
export const MAX_ILAN_YASI_GUN = 180;
export const MIN_MAHALLE_BASELINE_SAMPLES = 3;
export const MIN_ILCE_BASELINE_SAMPLES = 5;
export const HEURISTIC_MULTIPLIER_MIN = 0.70;
export const HEURISTIC_MULTIPLIER_MAX = 1.35;
export const EMSAL_MIN_BENZERLIK = 0.45;
export const EMSAL_MAX_SECIM = 12;
export const EMSAL_MAX_ILCE_DESTEK = 5;
