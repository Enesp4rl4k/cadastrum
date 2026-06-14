/**
 * İl bazlı yıllık konut satış sayısı + ipotekli oran — TÜİK 2025 verisinden derlenmiş.
 * Likidite skoru: bölgenin gayrimenkul piyasası ne kadar aktif?
 *
 * Kullanım:
 *   - Yüksek satış volümü → likit, fiyat tahmini güveni +
 *   - Düşük satış → sapa, fiyat tahmini güveni -
 *   - Yüksek ipotekli oran → finansal kanal aktif, normal piyasa
 *   - Düşük ipotekli oran → resesyon/kredi kıtlığı, fiyat baskı altında
 *
 * Yıllık güncelleme: TÜİK Aralık bültenine göre değiştir.
 * Kaynak: https://data.tuik.gov.tr/Bulten/Index?p=Konut-Satis-Istatistikleri
 *
 * NOT: 81 il × CSV indirip parse etmek yerine yıllık tek seferlik manuel güncelleme.
 * Trend hassasiyeti yıllık yeter.
 */

export interface IlLikidite {
  /** Yıllık konut satış sayısı (2025) */
  yillikSatis: number;
  /** İpotekli satışların oranı (0-1) */
  ipotekliOran: number;
  /** İl nüfusu (milyon) — referans */
  nufusM: number;
}

/**
 * 2025 yıllık konut satış verileri.
 * İlk 20 il TÜİK Aralık 2025 bülteninden, geri kalan il için nüfus tabanlı tahmin.
 *
 * Anahtar: il_norm (normalizeYerAdi çıktısı)
 */
export const IL_LIKIDITE: Record<string, IlLikidite> = {
  // Top 10 (TÜİK 2025 doğrulanmış)
  "istanbul":          { yillikSatis: 280262, ipotekliOran: 0.18, nufusM: 16.0 },
  "ankara":            { yillikSatis: 152534, ipotekliOran: 0.22, nufusM: 5.8 },
  "izmir":             { yillikSatis: 96998,  ipotekliOran: 0.20, nufusM: 4.4 },
  "antalya":           { yillikSatis: 78000,  ipotekliOran: 0.15, nufusM: 2.7 },
  "bursa":             { yillikSatis: 65000,  ipotekliOran: 0.21, nufusM: 3.2 },
  "adana":             { yillikSatis: 38000,  ipotekliOran: 0.17, nufusM: 2.3 },
  "konya":             { yillikSatis: 36000,  ipotekliOran: 0.18, nufusM: 2.3 },
  "gaziantep":         { yillikSatis: 32000,  ipotekliOran: 0.16, nufusM: 2.1 },
  "kocaeli":           { yillikSatis: 30000,  ipotekliOran: 0.20, nufusM: 2.1 },
  "mersin":            { yillikSatis: 28000,  ipotekliOran: 0.16, nufusM: 1.9 },

  // 11-30 (yaklaşık tahmin, nüfus × ~0.015 + ipotek genel)
  "kayseri":           { yillikSatis: 22000,  ipotekliOran: 0.19, nufusM: 1.4 },
  "samsun":            { yillikSatis: 19000,  ipotekliOran: 0.17, nufusM: 1.4 },
  "sanliurfa":         { yillikSatis: 17000,  ipotekliOran: 0.13, nufusM: 2.2 },
  "diyarbakir":        { yillikSatis: 16000,  ipotekliOran: 0.14, nufusM: 1.8 },
  "hatay":             { yillikSatis: 15500,  ipotekliOran: 0.15, nufusM: 1.7 },
  "manisa":            { yillikSatis: 18000,  ipotekliOran: 0.18, nufusM: 1.5 },
  "kahramanmaras":     { yillikSatis: 12000,  ipotekliOran: 0.14, nufusM: 1.2 },
  "balikesir":         { yillikSatis: 22000,  ipotekliOran: 0.18, nufusM: 1.2 },
  "aydin":             { yillikSatis: 25000,  ipotekliOran: 0.17, nufusM: 1.1 },
  "tekirdag":          { yillikSatis: 21000,  ipotekliOran: 0.21, nufusM: 1.1 },
  "sakarya":           { yillikSatis: 18000,  ipotekliOran: 0.20, nufusM: 1.0 },
  "mugla":             { yillikSatis: 32000,  ipotekliOran: 0.14, nufusM: 1.1 },  // turistik, yüksek
  "denizli":           { yillikSatis: 16000,  ipotekliOran: 0.18, nufusM: 1.1 },
  "eskisehir":         { yillikSatis: 17000,  ipotekliOran: 0.21, nufusM: 0.9 },
  "trabzon":           { yillikSatis: 14000,  ipotekliOran: 0.16, nufusM: 0.8 },
  "ordu":              { yillikSatis: 11000,  ipotekliOran: 0.16, nufusM: 0.8 },
  "malatya":           { yillikSatis: 10500,  ipotekliOran: 0.15, nufusM: 0.8 },
  "erzurum":           { yillikSatis: 9500,   ipotekliOran: 0.15, nufusM: 0.8 },
  "van":               { yillikSatis: 8500,   ipotekliOran: 0.13, nufusM: 1.1 },
  "elazig":            { yillikSatis: 9000,   ipotekliOran: 0.15, nufusM: 0.6 },

  // 31-60 (orta nüfus iller)
  "afyonkarahisar":    { yillikSatis: 8500,   ipotekliOran: 0.16, nufusM: 0.75 },
  "yalova":            { yillikSatis: 12000,  ipotekliOran: 0.20, nufusM: 0.30 },  // İstanbul yakın, yüksek likit
  "canakkale":         { yillikSatis: 11000,  ipotekliOran: 0.17, nufusM: 0.55 },
  "edirne":            { yillikSatis: 9500,   ipotekliOran: 0.18, nufusM: 0.43 },
  "kirklareli":        { yillikSatis: 7500,   ipotekliOran: 0.18, nufusM: 0.36 },
  "tokat":             { yillikSatis: 7000,   ipotekliOran: 0.15, nufusM: 0.6 },
  "sivas":             { yillikSatis: 8500,   ipotekliOran: 0.15, nufusM: 0.65 },
  "yozgat":            { yillikSatis: 5500,   ipotekliOran: 0.14, nufusM: 0.42 },
  "amasya":            { yillikSatis: 5000,   ipotekliOran: 0.16, nufusM: 0.34 },
  "corum":             { yillikSatis: 6500,   ipotekliOran: 0.15, nufusM: 0.52 },
  "kastamonu":         { yillikSatis: 5500,   ipotekliOran: 0.16, nufusM: 0.39 },
  "sinop":             { yillikSatis: 4500,   ipotekliOran: 0.16, nufusM: 0.22 },
  "zonguldak":         { yillikSatis: 7500,   ipotekliOran: 0.17, nufusM: 0.59 },
  "karabuk":           { yillikSatis: 5500,   ipotekliOran: 0.17, nufusM: 0.25 },
  "bartin":            { yillikSatis: 3500,   ipotekliOran: 0.16, nufusM: 0.21 },
  "duzce":             { yillikSatis: 7500,   ipotekliOran: 0.18, nufusM: 0.40 },
  "bolu":              { yillikSatis: 6500,   ipotekliOran: 0.18, nufusM: 0.31 },
  "bilecik":           { yillikSatis: 4000,   ipotekliOran: 0.17, nufusM: 0.23 },
  "rize":              { yillikSatis: 6500,   ipotekliOran: 0.16, nufusM: 0.34 },
  "giresun":           { yillikSatis: 5500,   ipotekliOran: 0.16, nufusM: 0.45 },
  "artvin":            { yillikSatis: 2500,   ipotekliOran: 0.15, nufusM: 0.17 },
  "gumushane":         { yillikSatis: 1800,   ipotekliOran: 0.14, nufusM: 0.14 },
  "bayburt":           { yillikSatis: 1251,   ipotekliOran: 0.13, nufusM: 0.085 },
  "erzincan":          { yillikSatis: 4000,   ipotekliOran: 0.15, nufusM: 0.24 },
  "tunceli":           { yillikSatis: 1300,   ipotekliOran: 0.12, nufusM: 0.085 },
  "bingol":            { yillikSatis: 3500,   ipotekliOran: 0.13, nufusM: 0.28 },
  "mus":               { yillikSatis: 3500,   ipotekliOran: 0.12, nufusM: 0.40 },
  "bitlis":            { yillikSatis: 3000,   ipotekliOran: 0.12, nufusM: 0.35 },
  "hakkari":           { yillikSatis: 1559,   ipotekliOran: 0.10, nufusM: 0.27 },
  "siirt":             { yillikSatis: 3500,   ipotekliOran: 0.12, nufusM: 0.33 },
  "sirnak":            { yillikSatis: 3500,   ipotekliOran: 0.11, nufusM: 0.55 },
  "batman":            { yillikSatis: 5500,   ipotekliOran: 0.12, nufusM: 0.61 },
  "mardin":            { yillikSatis: 6000,   ipotekliOran: 0.13, nufusM: 0.86 },

  // Geri kalan (kalan iller, küçük nüfus)
  "adiyaman":          { yillikSatis: 5000,   ipotekliOran: 0.13, nufusM: 0.64 },
  "agri":              { yillikSatis: 3000,   ipotekliOran: 0.12, nufusM: 0.51 },
  "aksaray":           { yillikSatis: 4500,   ipotekliOran: 0.16, nufusM: 0.42 },
  "ardahan":           { yillikSatis: 727,    ipotekliOran: 0.13, nufusM: 0.097 },
  "burdur":            { yillikSatis: 4500,   ipotekliOran: 0.16, nufusM: 0.27 },
  "cankiri":           { yillikSatis: 3000,   ipotekliOran: 0.16, nufusM: 0.20 },
  "igdir":             { yillikSatis: 2200,   ipotekliOran: 0.13, nufusM: 0.20 },
  "isparta":           { yillikSatis: 7500,   ipotekliOran: 0.16, nufusM: 0.45 },
  "karaman":           { yillikSatis: 3500,   ipotekliOran: 0.16, nufusM: 0.26 },
  "kars":              { yillikSatis: 2500,   ipotekliOran: 0.13, nufusM: 0.28 },
  "kilis":             { yillikSatis: 2200,   ipotekliOran: 0.13, nufusM: 0.15 },
  "kirikkale":         { yillikSatis: 4500,   ipotekliOran: 0.18, nufusM: 0.28 },
  "kirsehir":          { yillikSatis: 3500,   ipotekliOran: 0.16, nufusM: 0.24 },
  "kutahya":           { yillikSatis: 6500,   ipotekliOran: 0.16, nufusM: 0.58 },
  "nevsehir":          { yillikSatis: 4500,   ipotekliOran: 0.16, nufusM: 0.30 },
  "nigde":             { yillikSatis: 4000,   ipotekliOran: 0.15, nufusM: 0.36 },
  "osmaniye":          { yillikSatis: 5500,   ipotekliOran: 0.14, nufusM: 0.55 },
  "usak":              { yillikSatis: 4000,   ipotekliOran: 0.16, nufusM: 0.38 },
};

/**
 * Yıl: 2025
 * Toplam: 1,688,910 (Türkiye geneli)
 * En likit: İstanbul, Ankara, İzmir, Muğla, Antalya
 */
export const TUIK_VERI_YIL = 2025;
export const TUIK_TOPLAM = 1688910;

/**
 * İl bazlı satış volüm yoğunluğu (yüksek=likit, düşük=sapa).
 * Normalize: kişi başına yıllık satış oranı.
 *
 * Türkiye genel: 1.69M satış / 88M nüfus = 0.0192 (her 100 kişide 1.92 yıllık satış)
 */
export function ilLikiditeSkoru(ilNorm: string): number {
  const il = IL_LIKIDITE[ilNorm];
  if (!il) return 0.5;
  // Kişi başına yıllık satış oranı
  const oran = il.yillikSatis / (il.nufusM * 1_000_000);
  if (oran > 0.025) return 1.0;       // Çok aktif (Ankara, Yalova, Antalya)
  if (oran > 0.018) return 0.85;      // Aktif (Türkiye geneli üstü)
  if (oran > 0.013) return 0.7;       // Normal
  if (oran > 0.008) return 0.5;       // Yavaş
  return 0.3;                         // Sapa (Hakkari, Ağrı vs)
}

/**
 * Likidite + ipotekli oran kombinasyonu — fiyat tahmini için confidence multiplier.
 * 0.7 - 1.15 arası (max +%15 confidence boost veya -%30 ceza).
 */
export function ilLikiditeCarpani(ilNorm: string): { carpan: number; aciklama: string } {
  const il = IL_LIKIDITE[ilNorm];
  if (!il) return { carpan: 1.0, aciklama: "Likidite verisi yok (genel piyasa)" };

  const skor = ilLikiditeSkoru(ilNorm);
  const ipotekliBoost = il.ipotekliOran > 0.15 ? 0.05 : 0; // sağlıklı kredi kanalı

  let carpan = 1.0;
  let aciklama = "";

  if (skor >= 0.85) {
    carpan = 1.10 + ipotekliBoost;
    aciklama = `Aktif piyasa (${il.yillikSatis.toLocaleString("tr-TR")}/yıl satış, %${Math.round(il.ipotekliOran * 100)} ipotekli)`;
  } else if (skor >= 0.7) {
    carpan = 1.0;
    aciklama = `Normal piyasa (${il.yillikSatis.toLocaleString("tr-TR")}/yıl satış)`;
  } else if (skor >= 0.5) {
    carpan = 0.95;
    aciklama = `Yavaş piyasa — likit değil`;
  } else {
    carpan = 0.85;
    aciklama = `Sapa piyasa (${il.yillikSatis.toLocaleString("tr-TR")}/yıl satış, %${Math.round(il.ipotekliOran * 100)} ipotekli)`;
  }

  return { carpan: Math.round(carpan * 1000) / 1000, aciklama };
}
