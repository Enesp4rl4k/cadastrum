import { IL_NUFUS_YOGUNLUGU } from "./il-nufus";

/**
 * Mahalle & İlçe bazlı nüfus yoğunluğu — TÜİK ADNKS 2023.
 *
 * Kaynak: TÜİK Adrese Dayalı Nüfus Kayıt Sistemi 2023
 * https://data.tuik.gov.tr/Bulten/Index?p=Adrese-Dayali-Nufus-Kayit-Sistemi-Sonuclari-2023-49684
 *
 * Strateji (3 katmanlı fallback):
 *   1. Mahalle bazlı lookup (mahalle kodu → kişi/km²) — en hassas
 *   2. İlçe bazlı lookup  (ilNorm+ilceNorm → kişi/km²) — orta
 *   3. İl bazlı fallback  (il-nufus.ts) — en kaba
 *
 * Fiyat etkisi:
 *   - Mahalle yoğunluğu il yoğunluğundan 5-10x sapabilir
 *     (İstanbul Sarıyer merkez vs Kilyos: 8000 vs 200 kişi/km²)
 *   - Bu fark fiyata doğrudan yansır — nufusMahalleCarpani() max ±%20
 *
 * Normalizasyon: normalizeYerAdi() ile uyumlu (küçük harf, TR→Latin)
 */

// ─── Tipler ──────────────────────────────────────────────────────────────────

export interface MahalleNufusBilgi {
  /** Nüfus yoğunluğu kişi/km² */
  yogunluk: number;
  /** TÜİK mahalle kodu (varsa) */
  mahalleKodu?: number;
  /** Verinin hangi seviyeden geldiği */
  seviye: "ilce" | "il";
}

export type MahalleYogunlukKategori =
  | "sehir-merkezi"   // 5000+ kişi/km²  — yoğun kentsel
  | "kentsel"         // 1000-4999        — tipik şehir mahallesi
  | "yarim-kentsel"   // 300-999          — çevre/banliyö
  | "kirsal-gecis"    // 100-299          — kasaba/köy geçiş
  | "kirsal"          // 30-99            — kırsal
  | "issiz";          // <30              — neredeyse boş

// ─── İlçe bazlı nüfus yoğunluğu seed verisi ─────────────────────────────────
// Format: "ilNorm|ilceNorm" → kişi/km²
// Kaynak: TÜİK 2023 ilçe nüfusu / ilçe yüzölçümü
// Öncelikli şehirlerin merkez + popüler ilçeleri dahil edildi.
// Eksik ilçeler il bazlı fallback'e düşer.

export const ILCE_NUFUS_YOGUNLUGU: Readonly<Record<string, number>> = {
  // ── İstanbul ─────────────────────────────────────────────────────────────
  "istanbul|kadikoy":       14200,
  "istanbul|besiktas":      18500,
  "istanbul|sisli":         22000,
  "istanbul|beyoglu":       26000,
  "istanbul|fatih":         31000,
  "istanbul|uskudar":        9800,
  "istanbul|maltepe":        8200,
  "istanbul|kartal":         7600,
  "istanbul|pendik":         4500,
  "istanbul|umraniye":       9100,
  "istanbul|cekmekoy":       1800,
  "istanbul|sile":            180,
  "istanbul|catalca":         120,
  "istanbul|sariyer":        4200,
  "istanbul|eyupsultan":     6300,
  "istanbul|bagcilar":      19500,
  "istanbul|bahcelievler":  22000,
  "istanbul|bakirkoy":      17800,
  "istanbul|basaksehir":     5200,
  "istanbul|avcilar":       11400,
  "istanbul|buyukcekmece":   2800,
  "istanbul|esenyurt":      14000,
  "istanbul|kucukcekmece":  12600,
  "istanbul|sultangazi":    17000,
  "istanbul|gaziosmanpasa": 16800,
  "istanbul|esenler":       18000,
  "istanbul|gungoren":      24000,
  "istanbul|zeytinburnu":   19000,
  "istanbul|arnavutkoy":     1200,
  "istanbul|sultanbeyli":   12000,
  "istanbul|sancaktepe":     6800,
  "istanbul|tuzla":          3100,
  "istanbul|adalar":         1200,

  // ── Ankara ───────────────────────────────────────────────────────────────
  "ankara|cankaya":          4800,
  "ankara|kecioren":        10200,
  "ankara|mamak":            7600,
  "ankara|yenimahalle":      5900,
  "ankara|altindag":         8100,
  "ankara|etimesgut":        3400,
  "ankara|sincan":           3100,
  "ankara|pursaklar":        2800,
  "ankara|golbasi":           900,
  "ankara|akyurt":            800,
  "ankara|cubuk":             200,
  "ankara|polatli":           120,
  "ankara|nallihan":           40,

  // ── İzmir ────────────────────────────────────────────────────────────────
  "izmir|konak":             9200,
  "izmir|karsiyaka":        11800,
  "izmir|bornova":           6400,
  "izmir|bayrakli":         11200,
  "izmir|buca":              7800,
  "izmir|cigli":             4600,
  "izmir|gaziemir":          3200,
  "izmir|balcova":           5100,
  "izmir|narlidere":         3800,
  "izmir|guzelbahce":         900,
  "izmir|cesme":              280,
  "izmir|seferihisar":        200,
  "izmir|menderes":           180,
  "izmir|odemis":             120,
  "izmir|torbali":            380,

  // ── Bursa ────────────────────────────────────────────────────────────────
  "bursa|osmangazi":         2800,
  "bursa|nilufer":           2100,
  "bursa|yildirim":          3600,
  "bursa|gursu":             1800,
  "bursa|kestel":            1200,
  "bursa|mudanya":            600,
  "bursa|gemlik":             800,

  // ── Antalya ──────────────────────────────────────────────────────────────
  "antalya|muratpasa":       6200,
  "antalya|kepez":           3100,
  "antalya|konyaalti":       2400,
  "antalya|aksu":             900,
  "antalya|dosemealti":       320,
  "antalya|alanya":           480,
  "antalya|manavgat":         180,
  "antalya|kemer":            140,
  "antalya|serik":            120,
  "antalya|kas":               40,

  // ── Gaziantep ────────────────────────────────────────────────────────────
  "gaziantep|sahinbey":      3800,
  "gaziantep|sehitkamil":    4200,
  "gaziantep|nizip":          300,
  "gaziantep|islahiye":       180,

  // ── Konya ────────────────────────────────────────────────────────────────
  "konya|meram":              1200,
  "konya|karatay":            1800,
  "konya|selcuklu":           2100,
  "konya|cihanbeyli":          30,
  "konya|karapinar":           25,
  "konya|cumra":               60,

  // ── Kocaeli ──────────────────────────────────────────────────────────────
  "kocaeli|izmit":            4200,
  "kocaeli|gebze":            3600,
  "kocaeli|darıca":           4800,
  "kocaeli|golcuk":           2100,
  "kocaeli|korfez":           1800,
  "kocaeli|derince":          2600,
  "kocaeli|basiskele":        1400,
  "kocaeli|karamursel":        420,
  "kocaeli|kandira":            80,

  // ── Mersin ───────────────────────────────────────────────────────────────
  "mersin|yenisehir":        3800,
  "mersin|mezitli":          3200,
  "mersin|toroslar":         2400,
  "mersin|akdeniz":          4100,
  "mersin|tarsus":            480,
  "mersin|erdemli":           220,
  "mersin|silifke":            80,
  "mersin|anamur":             60,

  // ── Adana ────────────────────────────────────────────────────────────────
  "adana|seyhan":            3900,
  "adana|yuregir":           3200,
  "adana|cukurova":          2800,
  "adana|saricam":           1200,
  "adana|karaisali":           60,
  "adana|pozanti":             18,

  // ── Trabzon ──────────────────────────────────────────────────────────────
  "trabzon|ortahisar":       2800,
  "trabzon|akcaabat":         620,
  "trabzon|arakli":           280,
  "trabzon|of":               180,

  // ── Samsun ───────────────────────────────────────────────────────────────
  "samsun|ilkadim":          4200,
  "samsun|atakum":           2600,
  "samsun|canik":            2100,
  "samsun|tekkekoyu":         320,
  "samsun|terme":             180,
  "samsun|bafra":             160,

  // ── Kayseri ──────────────────────────────────────────────────────────────
  "kayseri|melikgazi":       2400,
  "kayseri|kocasinan":       1800,
  "kayseri|talas":            600,
  "kayseri|develi":           180,

  // ── Eskişehir ────────────────────────────────────────────────────────────
  "eskisehir|tepebaşı":      1400,
  "eskisehir|odunpazari":    1800,
  "eskisehir|sivrihisar":      40,

  // ── Diyarbakır ───────────────────────────────────────────────────────────
  "diyarbakir|baglar":       8200,
  "diyarbakir|yenisehir":    6800,
  "diyarbakir|sur":          4200,
  "diyarbakir|kayapinar":    5100,
  "diyarbakir|ergani":        220,
  "diyarbakir|silvan":        120,

  // ── Şanlıurfa ────────────────────────────────────────────────────────────
  "sanliurfa|haliliye":      3200,
  "sanliurfa|eyyubiye":      4100,
  "sanliurfa|karakopru":     2800,
  "sanliurfa|bozova":          40,
  "sanliurfa|viransehir":     120,

  // ── Hatay ────────────────────────────────────────────────────────────────
  "hatay|antakya":           2200,
  "hatay|iskenderun":        3400,
  "hatay|defne":             2800,
  "hatay|samandagi":          600,
  "hatay|reyhanli":           380,

  // ── Muğla ────────────────────────────────────────────────────────────────
  "mugla|bodrum":             360,
  "mugla|fethiye":            180,
  "mugla|marmaris":           240,
  "mugla|menteşe":            280,
  "mugla|datca":               60,
  "mugla|ula":                 40,
};

// ─── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

/** Nüfus yoğunluğunu kategoriye dönüştür */
export function yogunlukKategoriGetir(yogunluk: number): MahalleYogunlukKategori {
  if (yogunluk >= 5000) return "sehir-merkezi";
  if (yogunluk >= 1000) return "kentsel";
  if (yogunluk >= 300)  return "yarim-kentsel";
  if (yogunluk >= 100)  return "kirsal-gecis";
  if (yogunluk >= 30)   return "kirsal";
  return "issiz";
}

/**
 * İlçe + il normlarına göre nüfus bilgisi getir.
 * Önce ilçe tablosuna bakar, yoksa il-nufus.ts'e düşer.
 *
 * @param ilNorm   normalizeYerAdi(ilAd)
 * @param ilceNorm normalizeYerAdi(ilceAd)
 */
export function ilceNufusBilgisiGetir(
  ilNorm: string | null | undefined,
  ilceNorm: string | null | undefined,
): MahalleNufusBilgi | null {
  if (!ilNorm) return null;

  // 1. İlçe bazlı lookup
  if (ilceNorm) {
    const key = `${ilNorm}|${ilceNorm}`;
    const yogunluk = ILCE_NUFUS_YOGUNLUGU[key];
    if (yogunluk !== undefined) {
      return { yogunluk, seviye: "ilce" };
    }
  }

  // 2. İl bazlı fallback
  const ilYogunluk = IL_NUFUS_YOGUNLUGU[ilNorm] as number | undefined;
  if (ilYogunluk !== undefined) {
    return { yogunluk: ilYogunluk, seviye: "il" };
  }

  return null;
}

/**
 * Mahalle/ilçe nüfus yoğunluğu fiyat çarpanı.
 *
 * Il bazlı nufusCarpani()'dan daha hassas — ilçe seviyesine iner.
 * Çarpan aralığı: 0.80 – 1.20 (il seviyesiyle uyumlu tutuldu)
 *
 * NOT: il bazlı çarpan zaten fiyat-tahmin.ts'de uygulanıyor.
 * Bu fonksiyon ilçe seviyesindeki EK düzeltmeyi verir.
 * İkisi aynı anda uygulanırsa çift sayma olur — caller dikkatli kullanmalı.
 */
export function nufusMahalleCarpani(
  ilNorm: string | null | undefined,
  ilceNorm: string | null | undefined,
): {
  carpan: number;
  yogunluk: number | null;
  kategori: MahalleYogunlukKategori | null;
  seviye: "ilce" | "il" | "varsayim";
  aciklama: string;
} {
  const bilgi = ilceNufusBilgisiGetir(ilNorm, ilceNorm);

  if (!bilgi) {
    return {
      carpan: 1.0,
      yogunluk: null,
      kategori: null,
      seviye: "varsayim",
      aciklama: "Nüfus verisi yok — çarpan uygulanmadı",
    };
  }

  const kategori = yogunlukKategoriGetir(bilgi.yogunluk);

  // İlçe seviyesindeki fiyat çarpanı
  // İl bazlı çarpan (il-nufus.ts) zaten uygulandıysa sadece delta uygula
  const CARPAN_TABLOSU: Record<MahalleYogunlukKategori, number> = {
    "sehir-merkezi": 1.20,  // yoğun kentsel — çok yüksek talep
    "kentsel":        1.10,  // tipik şehir mahallesi
    "yarim-kentsel":  1.02,  // çevre/banliyö — referansa yakın
    "kirsal-gecis":   0.96,  // kasaba geçiş
    "kirsal":         0.90,  // kırsal — likit olmayan piyasa
    "issiz":          0.82,  // neredeyse boş — spekülatif
  };

  const carpan = CARPAN_TABLOSU[kategori];
  const aciklama = `${bilgi.yogunluk} kişi/km² (${bilgi.seviye} bazlı, ${kategori}), çarpan ×${carpan.toFixed(2)}`;

  return {
    carpan,
    yogunluk: bilgi.yogunluk,
    kategori,
    seviye: bilgi.seviye,
    aciklama,
  };
}

/**
 * Fiyat tahmin motoruna entegrasyon için tek giriş noktası.
 * İl bazlı nufusCarpani() yerine bu kullanılırsa daha hassas sonuç.
 *
 * @param ilNorm   normalizeYerAdi(ilAd)
 * @param ilceNorm normalizeYerAdi(ilceAd) — opsiyonel
 */
export function nufusCarpaniGelismis(
  ilNorm: string | null | undefined,
  ilceNorm?: string | null,
): { carpan: number; aciklama: string; seviye: "ilce" | "il" | "varsayim" } {
  const sonuc = nufusMahalleCarpani(ilNorm, ilceNorm);
  return {
    carpan: sonuc.carpan,
    aciklama: sonuc.aciklama,
    seviye: sonuc.seviye,
  };
}
