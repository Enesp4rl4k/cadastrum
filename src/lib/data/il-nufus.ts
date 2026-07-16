/**
 * Türkiye il bazlı nüfus yoğunluğu — TÜİK 2023 Adrese Dayalı Nüfus Kayıt Sistemi.
 * Kaynak: TÜİK ADNKS 2023 (kişi/km²)
 *
 * Nüfus yoğunluğu arsa fiyatına iki kanaldan etki eder:
 *   1. Doğrudan talep baskısı — yoğun iller daha pahalı
 *   2. Altyapı kalitesi proxy'si — yoğun = daha iyi altyapı = daha likit piyasa
 *
 * Fiyat çarpanı: nufusCarpani(il) → 0.80 ile 1.20 arası
 * Bu çarpan fiyat-tahmin.ts'deki konumCarpani() ile birlikte çalışır.
 *
 * Anahtar: normalizeYerAdi(ilAd) ile uyumlu (küçük harf, türkçe→latin)
 */

/** İl nüfus yoğunluğu (kişi/km², TÜİK 2023) */
export const IL_NUFUS_YOGUNLUGU: Readonly<Record<string, number>> = {
  // ── Marmara ──────────────────────────────────────────────────────────────
  istanbul:     3160,   // 15.9M nüfus, 5.343 km²
  kocaeli:      560,    // 2.1M nüfus, 3.626 km²
  bursa:        258,    // 3.2M nüfus, 11.043 km²
  tekirdag:     177,    // 1.1M nüfus, 6.313 km²
  sakarya:      199,    // 1.1M nüfus, 4.895 km²
  yalova:       303,    // 0.3M nüfus, 847 km²
  edirne:       55,     // 0.4M nüfus, 6.165 km²
  kirklareli:   53,     // 0.4M nüfus, 6.550 km²
  bilecik:      56,     // 0.2M nüfus, 4.307 km²
  canakkale:    44,     // 0.6M nüfus, 9.887 km²
  // ── Ege ──────────────────────────────────────────────────────────────────
  izmir:        377,    // 4.5M nüfus, 11.869 km²
  manisa:       82,     // 1.4M nüfus, 13.810 km²
  aydin:        100,    // 1.1M nüfus, 8.007 km²
  mugla:        55,     // 1.1M nüfus, 13.338 km²
  denizli:      86,     // 1.1M nüfus, 11.868 km²
  kutahya:      52,     // 0.6M nüfus, 11.875 km²
  usak:         67,     // 0.4M nüfus, 5.341 km²
  afyonkarahisar: 43,   // 0.7M nüfus, 14.230 km²
  // ── Akdeniz ──────────────────────────────────────────────────────────────
  antalya:      120,    // 2.8M nüfus, 20.723 km²
  mersin:       90,     // 1.9M nüfus, 15.853 km²
  adana:        157,    // 2.3M nüfus, 14.030 km²
  hatay:        174,    // 1.7M nüfus, 5.403 km²
  kahramanmaras: 69,    // 1.2M nüfus, 14.327 km²
  osmaniye:     88,     // 0.6M nüfus, 3.767 km²
  isparta:      43,     // 0.4M nüfus, 8.933 km²
  burdur:       33,     // 0.3M nüfus, 6.887 km²
  // ── İç Anadolu ───────────────────────────────────────────────────────────
  ankara:       200,    // 5.8M nüfus, 25.706 km²
  konya:        56,     // 2.3M nüfus, 41.336 km²
  eskisehir:    68,     // 0.9M nüfus, 13.652 km²
  kayseri:      88,     // 1.4M nüfus, 17.170 km²
  sivas:        20,     // 0.6M nüfus, 28.488 km²
  yozgat:       28,     // 0.4M nüfus, 14.123 km²
  kirsehir:     31,     // 0.2M nüfus, 6.570 km²
  corum:        39,     // 0.5M nüfus, 12.820 km²
  nevsehir:     42,     // 0.3M nüfus, 5.467 km²
  nigde:        40,     // 0.4M nüfus, 7.312 km²
  aksaray:      47,     // 0.5M nüfus, 7.626 km²
  karaman:      28,     // 0.3M nüfus, 9.163 km²
  kirikkale:    96,     // 0.3M nüfus, 4.365 km²
  cankiri:      18,     // 0.2M nüfus, 8.454 km²
  // ── Karadeniz ────────────────────────────────────────────────────────────
  samsun:       99,     // 1.4M nüfus, 9.579 km²
  trabzon:      106,    // 0.8M nüfus, 4.685 km²
  ordu:         85,     // 0.7M nüfus, 6.001 km²
  zonguldak:    124,    // 0.6M nüfus, 3.291 km²
  bolu:         46,     // 0.3M nüfus, 8.276 km²
  duzce:        120,    // 0.4M nüfus, 2.492 km²
  kastamonu:    19,     // 0.3M nüfus, 13.108 km²
  sinop:        24,     // 0.2M nüfus, 5.862 km²
  giresun:      43,     // 0.5M nüfus, 6.934 km²
  rize:         70,     // 0.3M nüfus, 3.920 km²
  artvin:       16,     // 0.2M nüfus, 7.367 km²
  bartin:       65,     // 0.2M nüfus, 2.143 km²
  karabuk:      69,     // 0.2M nüfus, 4.145 km²
  amasya:       41,     // 0.3M nüfus, 5.702 km²
  tokat:        49,     // 0.6M nüfus, 9.958 km²
  bayburt:      13,     // 0.08M nüfus, 3.652 km²
  gumushane:    16,     // 0.1M nüfus, 6.437 km²
  // ── Doğu Anadolu ─────────────────────────────────────────────────────────
  erzurum:      26,     // 0.7M nüfus, 25.066 km²
  erzincan:     17,     // 0.2M nüfus, 11.903 km²
  kars:         16,     // 0.3M nüfus, 9.587 km²
  ardahan:      10,     // 0.1M nüfus, 5.521 km²
  igdir:        32,     // 0.2M nüfus, 3.539 km²
  agri:         36,     // 0.6M nüfus, 11.376 km²
  van:          43,     // 1.2M nüfus, 21.082 km²
  bitlis:       28,     // 0.3M nüfus, 8.022 km²
  mus:          30,     // 0.5M nüfus, 8.022 km²
  bingol:       23,     // 0.3M nüfus, 8.125 km²
  tunceli:       9,     // 0.08M nüfus, 7.774 km²
  elazig:       67,     // 0.6M nüfus, 9.153 km²
  malatya:      68,     // 0.8M nüfus, 12.313 km²
  hakkari:      27,     // 0.3M nüfus, 7.121 km²
  // ── Güneydoğu Anadolu ────────────────────────────────────────────────────
  gaziantep:    478,    // 2.2M nüfus, 6.222 km²
  sanliurfa:    108,    // 2.3M nüfus, 19.242 km²
  diyarbakir:   118,    // 1.8M nüfus, 15.272 km²
  adiyaman:     90,     // 0.6M nüfus, 7.614 km²
  kilis:        77,     // 0.2M nüfus, 1.521 km²
  mardin:       77,     // 0.8M nüfus, 8.891 km²
  batman:       125,    // 0.7M nüfus, 4.694 km²
  siirt:        57,     // 0.3M nüfus, 5.406 km²
  sirnak:       71,     // 0.5M nüfus, 7.172 km²
};

/**
 * Nüfus yoğunluğu kategorisi — fiyat çarpanı için kullanılır.
 */
export type NufusKategori =
  | "mega"        // 1000+ kişi/km² (İstanbul merkezi)
  | "cok-yogun"   // 300-999 (Kocaeli, İzmir, Gaziantep)
  | "yogun"       // 100-299 (Bursa, Adana, Samsun)
  | "orta"        // 50-99  (çoğu Anadolu ili)
  | "seyrek"      // 20-49  (kırsal iller)
  | "cok-seyrek"; // <20    (Doğu/Güneydoğu kırsal)

export function nufusKategoriGetir(yogunluk: number): NufusKategori {
  if (yogunluk >= 1000) return "mega";
  if (yogunluk >= 300)  return "cok-yogun";
  if (yogunluk >= 100)  return "yogun";
  if (yogunluk >= 50)   return "orta";
  if (yogunluk >= 20)   return "seyrek";
  return "cok-seyrek";
}

/**
 * Nüfus yoğunluğu fiyat çarpanı.
 *
 * Yüksek yoğunluk → yüksek talep → yüksek arsa fiyatı
 * Düşük yoğunluk → düşük talep → likit olmayan piyasa → düşük fiyat
 *
 * Dikkat: Bu çarpan zaten il baseline'a kısmen yansımış olabilir.
 * Bu nedenle katsayılar kasıtlı küçük tutuldu (max ±%15).
 * Baseline hiç olmayan (fallback) durumlarda daha belirleyici.
 *
 * @param ilNorm normalizeYerAdi ile normalize edilmiş il adı
 */
export function nufusCarpani(ilNorm: string): {
  carpan: number;
  yogunluk: number | null;
  kategori: NufusKategori | null;
  aciklama: string;
} {
  const yogunluk = IL_NUFUS_YOGUNLUGU[ilNorm] ?? null;

  if (yogunluk === null) {
    return { carpan: 1.0, yogunluk: null, kategori: null, aciklama: "Nüfus verisi yok" };
  }

  const kategori = nufusKategoriGetir(yogunluk);

  // Çarpan tablosu — il baseline zaten nüfusu bir miktar yansıtıyor,
  // bu nedenle sadece aşırı uçlarda düzeltme yapılıyor.
  const CARPAN_TABLOSU: Record<NufusKategori, number> = {
    "mega":       1.12,  // İstanbul: sıradışı talep baskısı
    "cok-yogun":  1.08,  // Kocaeli, İzmir, Gaziantep
    "yogun":      1.04,  // Bursa, Adana, Trabzon
    "orta":       1.00,  // referans — çoğu Anadolu
    "seyrek":     0.96,  // kırsal iller
    "cok-seyrek": 0.90,  // Doğu/Güneydoğu kırsal — likit olmayan piyasa
  };

  const carpan = CARPAN_TABLOSU[kategori] ?? 1.0;
  const aciklama = `${yogunluk} kişi/km² (${kategori}), çarpan ×${carpan.toFixed(2)}`;

  return { carpan, yogunluk, kategori, aciklama };
}

/**
 * İl nüfus sıralaması — 1=en kalabalık (İstanbul), 81=en seyrek.
 * Fiyat tahmininde değil, UI gösteriminde kullanılabilir.
 */
export function ilNufusSiralamasi(ilNorm: string): number | null {
  const sorted = Object.entries(IL_NUFUS_YOGUNLUGU)
    .sort(([, a], [, b]) => b - a)
    .map(([il]) => il);
  const idx = sorted.indexOf(ilNorm);
  return idx >= 0 ? idx + 1 : null;
}
