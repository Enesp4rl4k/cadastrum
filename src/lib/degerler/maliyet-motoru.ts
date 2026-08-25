/**
 * Maliyet Yaklaşımı Motoru — Arazi Değeri + Yenileme Maliyeti − Amortisman.
 *
 * UDES (Uluslararası Değerleme Standartları) Standardı:
 *   Maliyet yaklaşımı, bir mülkün değerini arazi değeri ile yapının
 *   yenileme/ikame maliyetinden birikmiş amortismanın düşülmesi ile bulur.
 *
 *   Değer = Arazi Değeri + (Yeni Yapı Maliyeti − Birikmeli Amortisman)
 *
 * Amortisman bileşenleri:
 *   1. Fiziksel Yıpranma: Yapının yaşı ve bakım durumuna bağlı
 *   2. Fonksiyonel Eskime: Eski tasarım, yetersiz altyapı
 *   3. Ekonomik Dış Etkenler: Bölgenin çöküşü, çevresel negatif etkiler
 *
 * Kullanım alanları:
 *   - Yapı mevcut parseller (mesken, depo, fabrika)
 *   - Sigorta değerlemesi
 *   - Kamulaştırma değerlemesi
 *   - Boş arsalar için uygulanmaz (arazi değeri = maliyet yaklaşımı değeri)
 *
 * Önemli Not: Türkiye'de resmi birim maliyet cetvelleri:
 *   - Çevre ve Şehircilik Bakanlığı birim fiyat bültenleri (yıllık)
 *   - TÜİK Yapı Maliyet Endeksi
 *   - GYODER piyasa raporları
 */

// ─── Tipler ──────────────────────────────────────────────────────────────────

export type YapiTipiMaliyet =
  | "konut-kaba"          // Kaba inşaat (sıva, döşeme yok)
  | "konut-orta"          // Orta kalite (standart)
  | "konut-yuksek"        // Yüksek kalite (lüks)
  | "depo-sanayi"         // Betonarme/çelik depo
  | "ofis-ticari"         // Ofis/ticari yapı
  | "villa"               // Müstakil villa
  | "fabrika"             // Fabrika/imalathane
  | "tarimsal-yapi";      // Ahır, sera, ambar

export type AmortismanYontemi =
  | "yas-omur"    // Yaş/Ekonomik Ömür: (Yaş / Toplam Ömür) × %100
  | "gozlemsel"   // Gözlemsel: uzman tespiti
  | "kirik-omur"; // Kırık Ömür: kalan ekonomik ömür / toplam ömür

export interface YapiVerisi {
  /** Yapı tipi */
  tip: YapiTipiMaliyet;
  /** Brüt inşaat alanı (m²) */
  insaatAlanM2: number;
  /** Yapı yaşı (yıl) — bilgi yoksa null */
  yasYil?: number | null;
  /** Bakım durumu */
  bakimDurumu?: "cok-iyi" | "iyi" | "orta" | "kotu" | "cok-kotu";
  /** Kat sayısı */
  katSayisi?: number;
}

export interface MaliyetYaklasimGirdisi {
  /** Değerleme tarihi (YYYY-MM-DD) */
  degerlenmeTarihi: string;
  /** Arsa alanı (m²) */
  arsaAlanM2: number;
  /** Arsa değeri TL/m² (karşılaştırmalı yaklaşımdan gelir) */
  arsaDegerPerM2: number;
  /** Yapı bilgisi (yoksa yalnızca arazi değeri döner) */
  yapi?: YapiVerisi;
  /** İl normu (bölgesel maliyet farklılıkları için) */
  ilNorm: string;
  /** Amortisman yöntemi */
  amortismanYontemi?: AmortismanYontemi;
}

export interface AmortismanDetay {
  /** Fiziksel yıpranma oranı (0-1) */
  fizikselYipranma: number;
  /** Fonksiyonel eskime oranı (0-1) */
  fonksiyonelEskime: number;
  /** Ekonomik dış etken oranı (0-1) */
  ekonomikEsKime: number;
  /** Toplam birikmeli amortisman oranı (0-1) */
  toplamAmortisman: number;
  /** Amortisman gerekçesi */
  gerekce: string;
}

export interface MaliyetYaklasimSonucu {
  /** Amortisman yöntemi */
  amortismanYontemi: AmortismanYontemi;

  // ─── Arazi değeri ──────────────────────────────────────────────────────────
  /** Arsa alanı m² */
  arsaAlanM2: number;
  /** Arsa TL/m² (girdi) */
  arsaDegerPerM2: number;
  /** Toplam arazi değeri TL */
  araziDegeriTL: number;

  // ─── Yapı maliyeti ─────────────────────────────────────────────────────────
  /** İnşaat alanı m² */
  insaatAlanM2: number;
  /** Birim yapı maliyeti TL/m² (yenileme maliyeti) */
  birimMaliyetTLm2: number;
  /** Bölge katsayısı */
  bolgeKatsayisi: number;
  /** Toplam yenileme maliyeti TL */
  yenilmeMaliyetiTL: number;

  // ─── Amortisman ───────────────────────────────────────────────────────────
  amortisman: AmortismanDetay;
  /** Birikmeli amortisman TL */
  amortismanTL: number;
  /** Amortize edilmiş yapı değeri TL */
  yapıDegeriTL: number;

  // ─── Sonuç ────────────────────────────────────────────────────────────────
  /** Toplam mülk değeri (arazi + yapı) TL */
  toplamDegerTL: number;
  /** TL/m² arsa bazında değer */
  degerPerM2ArsaTL: number;
  /** Güven düzeyi */
  guven: "yuksek" | "orta" | "dusuk";
  /** Metodoloji gerekçesi */
  gerekce: string;
  /** Sınırlayıcı koşullar */
  sinirlar: string[];
}

// ─── Birim maliyet tabloları ──────────────────────────────────────────────────

/**
 * Yapı yenileme birim maliyeti — TL/m² (Temmuz 2026).
 * Kaynak: Çevre ve Şehircilik Bakanlığı birim fiyat bülteni 2026,
 * GYODER piyasa araştırması, TÜİK YEM endeksi.
 */
const BIRIM_MALIYET_TLM2: Record<YapiTipiMaliyet, number> = {
  "konut-kaba":     28_000,  // Kaba inşaat
  "konut-orta":     42_000,  // Standart kalite
  "konut-yuksek":   65_000,  // Lüks
  "depo-sanayi":    22_000,  // Tek katlı depo
  "ofis-ticari":    48_000,  // Ofis/AVM
  "villa":          58_000,  // Müstakil villa
  "fabrika":        28_000,  // Fabrika
  "tarimsal-yapi":  8_000,   // Ahır/sera
};

/**
 * Ekonomik ömür tablosu — yapı tipine göre yıl.
 * Kaynak: Türkiye değerleme uygulamaları, UDES rehberi.
 */
const EKONOMIK_OMUR: Record<YapiTipiMaliyet, number> = {
  "konut-kaba":     50,
  "konut-orta":     50,
  "konut-yuksek":   50,
  "depo-sanayi":    40,
  "ofis-ticari":    45,
  "villa":          50,
  "fabrika":        40,
  "tarimsal-yapi":  25,
};

/**
 * Bölge maliyet katsayısı — İstanbul = 1.0 baz.
 * Büyükşehirler işçilik ve malzeme maliyeti İstanbul yakını.
 * Kırsal bölgeler daha düşük işçilik, yüksek malzeme taşıma.
 */
const BOLGE_KATSAYISI: Record<string, number> = {
  "istanbul": 1.00,
  "ankara":   0.92,
  "izmir":    0.95,
  "antalya":  0.90,
  "bursa":    0.88,
  "kocaeli":  0.93,
  "muğla":    0.85,
  "trabzon":  0.82,
  "samsun":   0.80,
};
const VARSAYILAN_BOLGE_KATSAYISI = 0.75;

// ─── Amortisman hesabı ────────────────────────────────────────────────────────

/**
 * Fiziksel yıpranma oranı — Yaş/Ekonomik Ömür yöntemi.
 * Bakım durumu ayarlayıcı olarak kullanılır.
 */
function fizikselYipranmaHesapla(
  yasYil: number,
  ekonomikOmur: number,
  bakimDurumu: YapiVerisi["bakimDurumu"] = "orta",
): number {
  const temelOran = Math.min(0.95, yasYil / ekonomikOmur);

  // Bakım durumu düzeltmesi
  const bakimDuzeltme: Record<string, number> = {
    "cok-iyi": -0.10,
    "iyi":     -0.05,
    "orta":     0.00,
    "kotu":    +0.10,
    "cok-kotu":+0.20,
  };

  const duzeltme = bakimDuzeltme[bakimDurumu ?? "orta"] ?? 0;
  return Math.max(0, Math.min(0.95, temelOran + duzeltme));
}

/**
 * Fonksiyonel eskime — yapı yaşına bağlı standart oranlar.
 * Eski yapılar modern gereksinimleri karşılamaz (yalıtım, asansör, otopark vb.)
 */
function fonksiyonelEskimeHesapla(yasYil: number, tip: YapiTipiMaliyet): number {
  // 1980 öncesi yapılar için daha yüksek fonksiyonel eskime
  if (yasYil > 40) return 0.15;
  if (yasYil > 25) return 0.08;
  if (yasYil > 15) return 0.04;
  return 0.02;
}

/**
 * Amortisman hesapla — UDES uyumlu 3 bileşen yöntemi.
 */
function amortismanHesapla(
  yapi: YapiVerisi,
  yontem: AmortismanYontemi,
): AmortismanDetay {
  const yasYil = yapi.yasYil ?? 0;
  const ekonomikOmur = EKONOMIK_OMUR[yapi.tip];
  const notlar: string[] = [];

  // 1. Fiziksel yıpranma
  const fizikselYipranma = fizikselYipranmaHesapla(yasYil, ekonomikOmur, yapi.bakimDurumu);
  notlar.push(`Fiziksel yıpranma: %${Math.round(fizikselYipranma * 100)} (${yasYil} yıl, ömür ${ekonomikOmur} yıl)`);

  // 2. Fonksiyonel eskime
  const fonksiyonelEskime = fonksiyonelEskimeHesapla(yasYil, yapi.tip);
  notlar.push(`Fonksiyonel eskime: %${Math.round(fonksiyonelEskime * 100)}`);

  // 3. Ekonomik dış etken — şimdilik sabit (gelecekte mahalle trendi bağlanabilir)
  const ekonomikEsKime = 0.02; // %2 standart
  notlar.push(`Ekonomik dış etken: %${Math.round(ekonomikEsKime * 100)} (standart)`);

  // Toplam — additive method (UDES Bölüm 8.3)
  const toplamAmortisman = Math.min(0.95, fizikselYipranma + fonksiyonelEskime + ekonomikEsKime);

  return {
    fizikselYipranma,
    fonksiyonelEskime,
    ekonomikEsKime,
    toplamAmortisman,
    gerekce: notlar.join("; "),
  };
}

// ─── Ana motor ────────────────────────────────────────────────────────────────

/**
 * Maliyet yaklaşımı değerleme hesabı.
 *
 * @param girdi  Değerleme girdileri
 */
export function maliyetYaklasimHesapla(girdi: MaliyetYaklasimGirdisi): MaliyetYaklasimSonucu {
  const {
    arsaAlanM2,
    arsaDegerPerM2,
    yapi,
    ilNorm,
    amortismanYontemi = "yas-omur",
  } = girdi;
  const sinirlar: string[] = [];

  // ─── 1. Arazi değeri ─────────────────────────────────────────────────────────
  const araziDegeriTL = Math.round(arsaAlanM2 * arsaDegerPerM2);

  // ─── 2. Yapı yok → sadece arazi değeri döner ─────────────────────────────────
  if (!yapi || yapi.insaatAlanM2 <= 0) {
    sinirlar.push("Yapı verisi yok — maliyet yaklaşımı yalnızca arazi değerini içerir");
    return {
      amortismanYontemi,
      arsaAlanM2,
      arsaDegerPerM2,
      araziDegeriTL,
      insaatAlanM2: 0,
      birimMaliyetTLm2: 0,
      bolgeKatsayisi: 1,
      yenilmeMaliyetiTL: 0,
      amortisman: {
        fizikselYipranma: 0,
        fonksiyonelEskime: 0,
        ekonomikEsKime: 0,
        toplamAmortisman: 0,
        gerekce: "Yapı yok",
      },
      amortismanTL: 0,
      yapıDegeriTL: 0,
      toplamDegerTL: araziDegeriTL,
      degerPerM2ArsaTL: arsaDegerPerM2,
      guven: "orta",
      gerekce: `Maliyet yaklaşımı — yalnızca arazi değeri. Yapı tespit edilmedi. Arazi: ${araziDegeriTL.toLocaleString("tr-TR")} ₺.`,
      sinirlar,
    };
  }

  // ─── 3. Yapı yenileme maliyeti ────────────────────────────────────────────────
  const birimMaliyet = BIRIM_MALIYET_TLM2[yapi.tip];
  const bolgeKatsayisi = BOLGE_KATSAYISI[ilNorm] ?? VARSAYILAN_BOLGE_KATSAYISI;
  const birimMaliyetTLm2 = Math.round(birimMaliyet * bolgeKatsayisi);
  const yenilmeMaliyetiTL = Math.round(yapi.insaatAlanM2 * birimMaliyetTLm2);

  // ─── 4. Amortisman ────────────────────────────────────────────────────────────
  let amortisman: AmortismanDetay;

  if (!yapi.yasYil || yapi.yasYil <= 0) {
    // Yeni yapı — minimal amortisman
    amortisman = {
      fizikselYipranma: 0,
      fonksiyonelEskime: 0.02,
      ekonomikEsKime: 0.02,
      toplamAmortisman: 0.04,
      gerekce: "Yeni yapı — sadece teorik eskime (%4)",
    };
    sinirlar.push("Yapı yaşı bilinmiyor — yeni yapı varsayıldı");
  } else {
    amortisman = amortismanHesapla(yapi, amortismanYontemi);
  }

  const amortismanTL = Math.round(yenilmeMaliyetiTL * amortisman.toplamAmortisman);
  const yapıDegeriTL = Math.max(0, yenilmeMaliyetiTL - amortismanTL);

  // ─── 5. Toplam değer ──────────────────────────────────────────────────────────
  const toplamDegerTL = araziDegeriTL + yapıDegeriTL;
  const degerPerM2ArsaTL = arsaAlanM2 > 0 ? Math.round(toplamDegerTL / arsaAlanM2) : 0;

  // ─── 6. Güven değerlendirmesi ─────────────────────────────────────────────────
  let guven: "yuksek" | "orta" | "dusuk";
  if (yapi.yasYil && yapi.bakimDurumu && arsaDegerPerM2 > 0) {
    guven = "yuksek";
  } else if (yapi.yasYil || arsaDegerPerM2 > 0) {
    guven = "orta";
  } else {
    guven = "dusuk";
    sinirlar.push("Yapı yaşı ve bakım durumu bilinmiyor — sonuç tahminidir");
  }

  // ─── 7. Gerekçe ───────────────────────────────────────────────────────────────
  const gerekce = [
    `Maliyet Yaklaşımı — ${amortismanYontemi === "yas-omur" ? "Yaş/Ömür" : "Gözlemsel"} Amortisman.`,
    `Arazi değeri: ${araziDegeriTL.toLocaleString("tr-TR")} ₺ (${arsaDegerPerM2.toLocaleString("tr-TR")} ₺/m² × ${arsaAlanM2} m²).`,
    `Yapı yenileme: ${yenilmeMaliyetiTL.toLocaleString("tr-TR")} ₺ (${birimMaliyetTLm2.toLocaleString("tr-TR")} ₺/m² × ${yapi.insaatAlanM2} m², bölge ×${bolgeKatsayisi}).`,
    `Amortisman: %${Math.round(amortisman.toplamAmortisman * 100)} = ${amortismanTL.toLocaleString("tr-TR")} ₺.`,
    `Amortize edilmiş yapı değeri: ${yapıDegeriTL.toLocaleString("tr-TR")} ₺.`,
    `Sonuç değer: ${toplamDegerTL.toLocaleString("tr-TR")} ₺ (${degerPerM2ArsaTL.toLocaleString("tr-TR")} ₺/m² arsa).`,
  ].join(" ");

  return {
    amortismanYontemi,
    arsaAlanM2,
    arsaDegerPerM2,
    araziDegeriTL,
    insaatAlanM2: yapi.insaatAlanM2,
    birimMaliyetTLm2,
    bolgeKatsayisi,
    yenilmeMaliyetiTL,
    amortisman,
    amortismanTL,
    yapıDegeriTL,
    toplamDegerTL,
    degerPerM2ArsaTL,
    guven,
    gerekce,
    sinirlar,
  };
}

// ─── Maliyet yaklaşımı uygulanabilir mi? ─────────────────────────────────────

/**
 * Maliyet yaklaşımının uygulanabilirliğini belirle.
 * Yapı mevcut ve yaşı biliniyorsa güçlü; yapı yoksa zayıf.
 */
export function maliyetYaklasimUygunMu(yapi?: YapiVerisi): {
  uygun: boolean;
  agirlik: number;
  neden: string;
} {
  if (!yapi || yapi.insaatAlanM2 <= 0) {
    return {
      uygun: false,
      agirlik: 0,
      neden: "Yapı bilgisi yok — maliyet yaklaşımı uygulanamaz",
    };
  }

  if (yapi.yasYil && yapi.bakimDurumu) {
    return {
      uygun: true,
      agirlik: 0.30,
      neden: "Yapı verisi mevcut — maliyet yaklaşımı destekleyici değerleme",
    };
  }

  return {
    uygun: true,
    agirlik: 0.15,
    neden: "Yapı mevcut ama yaş/bakım bilinmiyor — düşük ağırlık",
  };
}
