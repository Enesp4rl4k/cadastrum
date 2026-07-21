/**
 * AI gelecek değer skoru — 3 / 5 / 10 yıl TL/m² bandı + açıklanabilir bileşenler.
 * Bilgilendirme amaçlıdır; resmi ekspertiz / yatırım tavsiyesi değildir.
 */

export interface GelecekDegerGirdi {
  bugunTlm2: number | null;
  parselM2?: number | null;
  /** Yıllık nominal % değişim (OLS / trend API) */
  trendYillikDegisimYuzde?: number | null;
  /** Uydu gelişim skoru −100…+100 */
  gelisimSkoru?: number | null;
  /** Bugünkü yatırım skoru 0–100 */
  yatirimSkoru?: number | null;
  emsal?: number | null;
  taks?: number | null;
  imarTipi?: string;
  guvenSkoru?: number;
}

export interface GelecekDegerBilesen {
  id: string;
  ad: string;
  puan: number;
  max: number;
  not: string;
}

export type GelecekDegerEtiket =
  | "Zayıf beklenti"
  | "Temkinli"
  | "Dengeli büyüme"
  | "Güçlü büyüme"
  | "Agresif büyüme";

export interface GelecekUfuk {
  yil: 3 | 5 | 10;
  tlm2: number | null;
  toplamTl: number | null;
  carpan: number;
  bandAlt: number | null;
  bandUst: number | null;
}

export interface GelecekDegerSonuc {
  skor: number;
  etiket: GelecekDegerEtiket;
  bilesenler: GelecekDegerBilesen[];
  ufuklar: GelecekUfuk[];
  yillikNominalBeklentiYuzde: number;
  yillikReelBeklentiYuzde: number;
  yorum: string;
  disclaimer: string;
}

const DISCLAIMER =
  "Model çıktısıdır; enflasyon, plan değişikliği ve piyasa şokları yansımayabilir. Yatırım tavsiyesi değildir.";

const ENFLASYON_VARSAYIM = 35; // gösterim için nominal→reel köprü

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function etiketBul(skor: number): GelecekDegerEtiket {
  if (skor >= 80) return "Agresif büyüme";
  if (skor >= 65) return "Güçlü büyüme";
  if (skor >= 50) return "Dengeli büyüme";
  if (skor >= 35) return "Temkinli";
  return "Zayıf beklenti";
}

function puanTrend(g: GelecekDegerGirdi): GelecekDegerBilesen {
  const max = 30;
  const tr = g.trendYillikDegisimYuzde;
  if (tr == null || !Number.isFinite(tr)) {
    return {
      id: "trend",
      ad: "Fiyat trendi",
      puan: 12,
      max,
      not: "Trend verisi yok — nötr varsayım",
    };
  }
  // Nominal %20 → düşük, %40 → orta, %55+ → yüksek (TR arsa nominal)
  const puan = clamp(Math.round((tr - 10) * 0.9), 4, max);
  return {
    id: "trend",
    ad: "Fiyat trendi",
    puan,
    max,
    not: `Yıllık nominal %${tr > 0 ? "+" : ""}${tr.toFixed(0)}`,
  };
}

function puanGelisim(g: GelecekDegerGirdi): GelecekDegerBilesen {
  const max = 25;
  const gs = g.gelisimSkoru;
  if (gs == null || !Number.isFinite(gs)) {
    return {
      id: "uydu",
      ad: "Uydu gelişim",
      puan: 10,
      max,
      not: "Uydu sinyali yok",
    };
  }
  // -100…+100 → 0…25
  const puan = clamp(Math.round(12.5 + gs * 0.125), 2, max);
  return {
    id: "uydu",
    ad: "Uydu gelişim",
    puan,
    max,
    not: `Gelişim skoru ${gs > 0 ? "+" : ""}${Math.round(gs)}`,
  };
}

function puanImar(g: GelecekDegerGirdi): GelecekDegerBilesen {
  const max = 25;
  let puan = 8;
  const tip = (g.imarTipi || "belirsiz").toLowerCase();
  if (tip === "ticari" || tip === "karma") puan += 6;
  else if (tip === "konut") puan += 5;
  else if (tip === "sanayi") puan += 4;
  else if (tip.includes("tar") || tip === "tarim") puan += 1;
  else puan += 2;

  if (g.emsal != null && g.emsal > 0) {
    puan += clamp(Math.round(g.emsal * 5), 1, 10);
  }
  if (g.taks != null && g.taks > 0.3) puan += 2;

  puan = clamp(puan, 0, max);
  return {
    id: "imar",
    ad: "İmar potansiyeli",
    puan,
    max,
    not:
      g.emsal != null
        ? `E=${g.emsal}${g.taks != null ? ` · TAKS=${g.taks}` : ""} · ${tip}`
        : `İmar tipi: ${tip}`,
  };
}

function puanBugun(g: GelecekDegerGirdi): GelecekDegerBilesen {
  const max = 20;
  const ys = g.yatirimSkoru;
  if (ys == null || !Number.isFinite(ys)) {
    return {
      id: "bugun",
      ad: "Bugünkü skor",
      puan: 10,
      max,
      not: "Yatırım skoru yok",
    };
  }
  const puan = clamp(Math.round((ys / 100) * max), 2, max);
  return {
    id: "bugun",
    ad: "Bugünkü skor",
    puan,
    max,
    not: `Yatırım skoru ${Math.round(ys)}/100`,
  };
}

/** Yıllık nominal büyüme beklentisi (%) — projeksiyon için */
export function yillikNominalBeklenti(g: GelecekDegerGirdi): number {
  let y =
    g.trendYillikDegisimYuzde != null && Number.isFinite(g.trendYillikDegisimYuzde)
      ? g.trendYillikDegisimYuzde
      : 28;

  if (g.gelisimSkoru != null && Number.isFinite(g.gelisimSkoru)) {
    y += g.gelisimSkoru / 25;
  }
  if (g.emsal != null && g.emsal >= 1.5) y += 2;
  else if (g.emsal != null && g.emsal < 0.6) y -= 2;

  // Güven düşükse beklentiyi yumuşat
  if (g.guvenSkoru != null && g.guvenSkoru < 40) y = y * 0.85 + 28 * 0.15;

  return clamp(Math.round(y * 10) / 10, 5, 65);
}

function ufukHesapla(
  bugun: number | null,
  yillik: number,
  yil: 3 | 5 | 10,
  parselM2: number | null | undefined,
): GelecekUfuk {
  const r = yillik / 100;
  const carpan = Math.round(Math.pow(1 + r, yil) * 100) / 100;
  const belirsizlik = 0.12 + yil * 0.035;
  if (bugun == null || bugun <= 0) {
    return {
      yil,
      tlm2: null,
      toplamTl: null,
      carpan,
      bandAlt: null,
      bandUst: null,
    };
  }
  const tlm2 = Math.round(bugun * carpan);
  const bandAlt = Math.round(tlm2 * (1 - belirsizlik));
  const bandUst = Math.round(tlm2 * (1 + belirsizlik));
  const toplamTl =
    parselM2 != null && parselM2 > 0 ? Math.round(tlm2 * parselM2) : null;
  return { yil, tlm2, toplamTl, carpan, bandAlt, bandUst };
}

export function gelecekDegerHesapla(g: GelecekDegerGirdi): GelecekDegerSonuc {
  const bilesenler = [puanTrend(g), puanGelisim(g), puanImar(g), puanBugun(g)];
  let skor = bilesenler.reduce((s, b) => s + b.puan, 0);
  skor = clamp(Math.round(skor), 0, 100);

  const yillikNominal = yillikNominalBeklenti(g);
  const yillikReel = Math.round((yillikNominal - ENFLASYON_VARSAYIM) * 10) / 10;
  const etiket = etiketBul(skor);

  const ufuklar: GelecekUfuk[] = [
    ufukHesapla(g.bugunTlm2, yillikNominal, 3, g.parselM2),
    ufukHesapla(g.bugunTlm2, yillikNominal, 5, g.parselM2),
    ufukHesapla(g.bugunTlm2, yillikNominal, 10, g.parselM2),
  ];

  const guclu = [...bilesenler].sort((a, b) => b.puan / b.max - a.puan / a.max)[0]!;
  const zayif = [...bilesenler].sort((a, b) => a.puan / a.max - b.puan / b.max)[0]!;
  const u5 = ufuklar[1]!;

  let yorum: string;
  if (u5.tlm2 != null && g.bugunTlm2 != null) {
    yorum =
      `Gelecek skor ${skor}/100 (${etiket}). ~5 yılda ₺${u5.tlm2.toLocaleString("tr-TR")}/m² bandı ` +
      `(×${u5.carpan}, nominal ~%${yillikNominal}/yıl). Güçlü: ${guclu.ad}; zayıf: ${zayif.ad}.`;
  } else {
    yorum =
      `Gelecek skor ${skor}/100 (${etiket}). Nominal büyüme varsayımı ~%${yillikNominal}/yıl. ` +
      `Güçlü: ${guclu.ad}; zayıf: ${zayif.ad}.`;
  }

  return {
    skor,
    etiket,
    bilesenler,
    ufuklar,
    yillikNominalBeklentiYuzde: yillikNominal,
    yillikReelBeklentiYuzde: yillikReel,
    yorum,
    disclaimer: DISCLAIMER,
  };
}

export function gelecekSkorRenk(skor: number): string {
  if (skor >= 80) return "#059669";
  if (skor >= 65) return "#0284c7";
  if (skor >= 50) return "#1B2A4A";
  if (skor >= 35) return "#d97706";
  return "#dc2626";
}
