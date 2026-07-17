/**
 * Fiyat correction katmanı.
 * Sahibinden = ASKING fiyat (ilan fiyatı, kapanış fiyatı değil).
 * Türkiye gayrimenkul piyasasında ortalama %10-15 indirimli kapanır.
 *
 * Bu modül:
 *  1. Asking → estimated kapanış correction
 *  2. Outlier rejection (Tukey IQR + bağlamsal mutlak sınırlar)
 *  3. Trim mean / median seçimi
 *  4. Bölge volatilite hesabı (CV — coefficient of variation)
 */

/** Türkiye ortalama asking → kapanış indirimi (2025 piyasa verisi) */
export const ASKING_KAPANIS_INDIRIM = 0.12;

/**
 * İl + kategori bazlı makul TL/m² sınırları — absürd değerleri IQR'dan ÖNCE temizle.
 *
 * Mantık:
 *   - Kırsal tarla: 50–500.000 TL/m² (köyde 50 TL normal, şehir yakını 500K olabilir)
 *   - İstanbul/İzmir/Ankara arsa: 500–50.000.000 TL/m² (premium merkez)
 *   - Diğer iller arsa: 100–20.000.000 TL/m²
 *
 * Bu sınırlar "veri girişi hatası" (örn. 1 TL/m², 8M TL/m² köy tarlası)
 * ile gerçek extreme değerleri ayırt eder.
 */
export const IL_KATEGORI_SINIR: Record<string, { altMin: number; ustMax: number }> = {
  // Format: "ilNorm:kategori" → { altMin: TL/m², ustMax: TL/m² }

  // İstanbul — premium, çok geniş aralık
  "istanbul:arsa":    { altMin: 500,   ustMax: 100_000_000 },
  "istanbul:tarla":   { altMin: 200,   ustMax: 10_000_000  },

  // İzmir, Ankara — yüksek
  "izmir:arsa":       { altMin: 300,   ustMax: 50_000_000  },
  "izmir:tarla":      { altMin: 100,   ustMax: 5_000_000   },
  "ankara:arsa":      { altMin: 300,   ustMax: 50_000_000  },
  "ankara:tarla":     { altMin: 100,   ustMax: 3_000_000   },

  // Kıyı illeri — turizm etkisi
  "antalya:arsa":     { altMin: 300,   ustMax: 30_000_000  },
  "antalya:tarla":    { altMin: 100,   ustMax: 5_000_000   },
  "mugla:arsa":       { altMin: 300,   ustMax: 30_000_000  },
  "mugla:tarla":      { altMin: 100,   ustMax: 8_000_000   },

  // Büyükşehirler (genel)
  "bursa:arsa":       { altMin: 200,   ustMax: 20_000_000  },
  "kocaeli:arsa":     { altMin: 200,   ustMax: 20_000_000  },
  "tekirdag:arsa":    { altMin: 150,   ustMax: 15_000_000  },

  // Default — tüm iller için fallback
  "_default:arsa":    { altMin: 50,    ustMax: 20_000_000  },
  "_default:tarla":   { altMin: 30,    ustMax: 3_000_000   },
  "_default:bahce":   { altMin: 50,    ustMax: 5_000_000   },
  "_default:bag":     { altMin: 30,    ustMax: 2_000_000   },
  "_default:zeytinlik":{ altMin: 50,   ustMax: 2_000_000   },
  "_default:konut":   { altMin: 1_000, ustMax: 100_000_000 },
};

/**
 * İl + kategori bazlı mutlak sınır filtresi — IQR'dan önce çalışır.
 * Veri girişi hatalarını (1 TL/m²) ve imkânsız değerleri eler.
 *
 * @param fiyatlar  TL/m² değerleri
 * @param ilNorm    normalizeYerAdi(il) — küçük harf, ascii
 * @param kategori  "arsa" | "tarla" | vb.
 */
export function mutlakSinirFiltrele(
  fiyatlar: number[],
  ilNorm: string,
  kategori: string,
): { temiz: number[]; cikarilan: number[] } {
  const sinirKey = `${ilNorm}:${kategori}`;
  const sinir = IL_KATEGORI_SINIR[sinirKey] ?? IL_KATEGORI_SINIR[`_default:${kategori}`] ?? IL_KATEGORI_SINIR["_default:arsa"]!;

  const temiz: number[] = [];
  const cikarilan: number[] = [];

  for (const f of fiyatlar) {
    if (f >= sinir.altMin && f <= sinir.ustMax) {
      temiz.push(f);
    } else {
      cikarilan.push(f);
    }
  }

  return { temiz, cikarilan };
}

/**
 * Bağlamsal outlier temizleme — iki aşamalı:
 *  1. Mutlak sınır filtresi (il + kategori bazlı)
 *  2. Tukey IQR (bağlam sınırlarını geçen değerler içinde)
 *
 * Klasik IQR'ya göre avantajı: İstanbul arsası ile Erzurum tarlası
 * aynı havuza girdiğinde IQR'ın başarısız olması durumunu önler.
 */
export function outlierTemizleBaglamsalAsimli(
  fiyatlar: number[],
  ilNorm: string,
  kategori: string,
): {
  temiz: number[];
  mutlakAtilanlar: number[];
  iqrAtilanlar: number[];
} {
  // Aşama 1: Mutlak sınır
  const { temiz: mutlakTemiz, cikarilan: mutlakAtilan } = mutlakSinirFiltrele(
    fiyatlar,
    ilNorm,
    kategori,
  );

  // Aşama 2: IQR (sınır sonrası kalan değerlerde)
  const { temiz: iqrTemiz, cikarilan: iqrAtilan } = outlierTemizle(mutlakTemiz);

  return {
    temiz: iqrTemiz,
    mutlakAtilanlar: mutlakAtilan,
    iqrAtilanlar: iqrAtilan,
  };
}

export interface IndirimModeliOptions {
  segment?: "arsa" | "tarla";
  ortalamaYasGun?: number;
  ayniMahalleOrani?: number;
  alanUyumOrani?: number;
}

/** Bölgenin likiditesine göre dinamik indirim — yoğun bölgede %8, sapa bölgede %18 */
export function dinamikIndirimOrani(
  ilanSayisi: number,
  ortalamaIslemSayisi: number, // TKGM resmi yıllık ortalama
  options: IndirimModeliOptions = {},
): number {
  let oran = ASKING_KAPANIS_INDIRIM;

  // Likit bölge (çok ilan + çok işlem): %8
  // Orta likit: %12
  // Sapa: %18
  if (ilanSayisi >= 20 || ortalamaIslemSayisi >= 50) oran = 0.08;
  else if (ilanSayisi >= 5 || ortalamaIslemSayisi >= 10) oran = 0.12;
  else oran = 0.18;

  if (options.segment === "tarla") oran += 0.03;
  if (options.segment === "arsa") oran -= 0.01;

  if ((options.ortalamaYasGun ?? 0) > 120) oran += 0.03;
  else if ((options.ortalamaYasGun ?? 0) > 60) oran += 0.015;
  else if ((options.ortalamaYasGun ?? 0) <= 21 && ilanSayisi >= 4) oran -= 0.01;

  if ((options.ayniMahalleOrani ?? 0) >= 0.7) oran -= 0.01;
  if ((options.alanUyumOrani ?? 0) >= 0.7) oran -= 0.01;
  else if ((options.alanUyumOrani ?? 0) < 0.35) oran += 0.015;

  return Math.min(0.24, Math.max(0.06, Number(oran.toFixed(3))));
}

export interface OutlierTemizSonuc {
  temiz: number[];
  cikarilan: number[];
  q1: number;
  q3: number;
  iqr: number;
}

/**
 * Tukey IQR yöntemi — Q1-1.5×IQR ile Q3+1.5×IQR dışındakileri at.
 * Sahibinden'de tek-tük 1 TL/m² (boş ilan) veya 500K TL/m² (köşe parsel premium) olabilir.
 */
export function outlierTemizle(degerler: number[]): OutlierTemizSonuc {
  if (degerler.length < 4) {
    return { temiz: [...degerler], cikarilan: [], q1: 0, q3: 0, iqr: 0 };
  }
  const sirali = [...degerler].sort((a, b) => a - b);
  const n = sirali.length;
  const q1Idx = Math.floor(n / 4);
  const q3Idx = Math.floor((n * 3) / 4);
  const q1 = sirali[q1Idx] ?? 0;
  const q3 = sirali[q3Idx] ?? 0;
  const iqr = q3 - q1;
  const altSinir = q1 - 1.5 * iqr;
  const ustSinir = q3 + 1.5 * iqr;
  const temiz: number[] = [];
  const cikarilan: number[] = [];
  for (const v of degerler) {
    if (v >= altSinir && v <= ustSinir) temiz.push(v);
    else cikarilan.push(v);
  }
  return { temiz, cikarilan, q1, q3, iqr };
}

/** Median — outlier dirençli ortalama */
export function median(degerler: number[]): number {
  if (degerler.length === 0) return 0;
  const sirali = [...degerler].sort((a, b) => a - b);
  const n = sirali.length;
  return n % 2 === 0
    ? ((sirali[n / 2 - 1] ?? 0) + (sirali[n / 2] ?? 0)) / 2
    : sirali[Math.floor(n / 2)] ?? 0;
}

/** Trim mean — alt/üst %25 at, kalanın ortalaması (median ve mean arası) */
export function trimMean(degerler: number[], trimYuzde = 0.25): number {
  if (degerler.length === 0) return 0;
  if (degerler.length < 4) {
    return degerler.reduce((s, v) => s + v, 0) / degerler.length;
  }
  const sirali = [...degerler].sort((a, b) => a - b);
  const trimSayi = Math.floor(sirali.length * trimYuzde);
  const trimli = sirali.slice(trimSayi, sirali.length - trimSayi);
  return trimli.reduce((s, v) => s + v, 0) / trimli.length;
}

/** Coefficient of variation — bölge fiyat volatilitesi (CV %) */
export function variationKatsayisi(degerler: number[]): number {
  if (degerler.length < 2) return 0;
  const mean = degerler.reduce((s, v) => s + v, 0) / degerler.length;
  if (mean === 0) return 0;
  const variance =
    degerler.reduce((s, v) => s + (v - mean) ** 2, 0) / degerler.length;
  const std = Math.sqrt(variance);
  return Math.round((std / mean) * 100);
}

export interface BolgeFiyatOzeti {
  /** Median (outlier-temiz) — en sağlam tahmin */
  medianAsking: number;
  /** Trim mean (alt/üst %25 atılmış) */
  trimMeanAsking: number;
  /** Asking → kapanış correction uygulanmış median */
  estimatedKapanis: number;
  /** Kullanılan indirim oranı */
  uygulanmisIndirim: number;
  /** Çıkarılan outlier sayısı */
  outlierSayisi: number;
  /** Geçerli (outlier'siz) örnek sayısı */
  gecerliOrnek: number;
  /** Volatilite — CV % */
  volatilite: number;
  /** Güven seviyesi */
  guvenSeviyesi: "yuksek" | "orta" | "dusuk";
  guvenAciklama: string;
}

export function bolgeFiyatOzetiHesapla(
  askingFiyatlar: number[],
  options: { tkgmYillikIslem?: number } = {},
): BolgeFiyatOzeti {
  const { temiz, cikarilan } = outlierTemizle(askingFiyatlar);
  const med = median(temiz);
  const trim = trimMean(temiz);
  const indirim = dinamikIndirimOrani(temiz.length, options.tkgmYillikIslem ?? 0);
  const estimatedKapanis = Math.round(med * (1 - indirim));
  const cv = variationKatsayisi(temiz);

  let guven: "yuksek" | "orta" | "dusuk" = "dusuk";
  let guvenAciklama = "";
  if (temiz.length >= 10 && cv < 30) {
    guven = "yuksek";
    guvenAciklama = `${temiz.length} ilan, düşük volatilite (CV %${cv}). Sağlam tahmin.`;
  } else if (temiz.length >= 5 && cv < 50) {
    guven = "orta";
    guvenAciklama = `${temiz.length} ilan, orta volatilite (CV %${cv}). Dikkatli yorumla.`;
  } else if (temiz.length >= 3) {
    guven = "dusuk";
    guvenAciklama = `${temiz.length} ilan, yüksek volatilite (CV %${cv}) — daha çok ilan açtıkça doğruluk artar.`;
  } else {
    guven = "dusuk";
    guvenAciklama = `Sadece ${temiz.length} ilan — istatistiksel olarak güvenilir değil.`;
  }

  return {
    medianAsking: Math.round(med),
    trimMeanAsking: Math.round(trim),
    estimatedKapanis,
    uygulanmisIndirim: Math.round(indirim * 100),
    outlierSayisi: cikarilan.length,
    gecerliOrnek: temiz.length,
    volatilite: cv,
    guvenSeviyesi: guven,
    guvenAciklama,
  };
}
