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
/**
 * İnce ayar çarpanları (alan × konum × çevre × eğim × kırsal) için koruma bandı
 * — kategori bazlı.
 *
 * NEDEN kategori bazlı: bandın, taşıması gereken en büyük bileşen olan alan
 * etkisini kırpmaması gerekir ve o etkinin gerçek aralığı kategoriye göre
 * farklı (bkz. carpan-zinciri.ts alanCarpani, aynı-mahalle içi ölçüm):
 *   arsa  0.32x–1.47x  → geniş band gerekiyor
 *   tarla 0.70x–1.50x  → dar band zaten yeterli
 *
 * Band asimetrik: ALT uç geniş, ÜST uç 1.0'a yakın.
 *   - Alt uç, arsa'nın gerçek büyük-parsel iskontosunu (0.38x) geçirecek kadar
 *     geniş; eski 0.70 tabanı bunu kırpıyordu.
 *   - Üst uç ~1.05-1.10'da tutuluyor: ölçülen küçük-parsel primi gerçek olsa da
 *     baseline zaten mahallenin ilan karışımını yansıttığı için primi tam
 *     uygulamak ikinci kez saymak oluyor ve tahmini şişiriyor.
 *
 * Değerler hold-out backtest'le seçildi (n=1200/segment), tahmin değil.
 * Tarla üst uç süpürmesi (MAPE / ±%20):
 *   max 1.45 → 45.3 / 37.5 · 1.25 → 41.0 / 42.1 · 1.15 → 39.1 / 47.4 · 1.05 → 37.9 / 49.1
 * Arsa üst uç süpürmesi:
 *   max 1.80 → 134.2 / 17.7 · 1.30 → 134.0 / 17.6 · 1.10 → 132.3 / 17.8
 * Runaway çarpanlara karşı koruma amacı her iki kategoride de korunuyor.
 */
export const HEURISTIC_MULTIPLIER_BANT: Record<"arsa" | "tarla", { min: number; max: number }> = {
  arsa:  { min: 0.45, max: 1.10 },
  tarla: { min: 0.70, max: 1.05 },
};

/** Geriye dönük uyumluluk — kategori bilinmeyen çağrılar için arsa bandı. */
export const HEURISTIC_MULTIPLIER_MIN = HEURISTIC_MULTIPLIER_BANT.arsa.min;
export const HEURISTIC_MULTIPLIER_MAX = HEURISTIC_MULTIPLIER_BANT.arsa.max;
export const EMSAL_MIN_BENZERLIK = 0.45;
export const EMSAL_MAX_SECIM = 12;
export const EMSAL_MAX_ILCE_DESTEK = 5;
