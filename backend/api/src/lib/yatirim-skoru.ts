/**
 * Endeksa tarzı yatırım skoru — 0–100, açıklanabilir bileşenler.
 * Bilgilendirme amaçlıdır; resmi ekspertiz / yatırım tavsiyesi değildir.
 */

export interface YatirimSkoruGirdi {
  guvenSkoru: number;
  kaynak: string;
  emsalAdet: number;
  imarTipi: string;
  emsal: number | null;
  taks: number | null;
  toplamCarpan: number;
  altTlm2: number | null;
  ustTlm2: number | null;
  medyanTlm2: number | null;
  /** 12 ay fiyat değişimi % — varsa likidite/trend bileşenine eklenir */
  trendDegisimYuzde?: number | null;
}

export interface YatirimSkoruBilesen {
  id: string;
  ad: string;
  puan: number;
  max: number;
  not: string;
}

export type YatirimSkoruEtiket = "Zayıf" | "Temkinli" | "Dengeli" | "İyi" | "Güçlü";

export interface YatirimSkoruSonuc {
  skor: number;
  etiket: YatirimSkoruEtiket;
  bilesenler: YatirimSkoruBilesen[];
  yorum: string;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function etiketBul(skor: number): YatirimSkoruEtiket {
  if (skor >= 80) return "Güçlü";
  if (skor >= 65) return "İyi";
  if (skor >= 50) return "Dengeli";
  if (skor >= 35) return "Temkinli";
  return "Zayıf";
}

/** Veri gücü — 0..30 */
function puanVeri(g: YatirimSkoruGirdi): YatirimSkoruBilesen {
  const max = 30;
  let puan = (clamp(g.guvenSkoru, 0, 100) / 100) * 22;
  if (g.kaynak === "spatial-radius") puan += 6;
  else if (g.kaynak === "mahalle-istatistik") puan += 4;
  else if (g.kaynak === "ilce-istatistik") puan += 2;
  // il-fallback: +0
  puan = clamp(Math.round(puan), 0, max);
  return {
    id: "veri",
    ad: "Veri gücü",
    puan,
    max,
    not: `Güven %${Math.round(g.guvenSkoru)} · kaynak ${g.kaynak}`,
  };
}

/** İmar potansiyeli — 0..30 */
function puanImar(g: YatirimSkoruGirdi): YatirimSkoruBilesen {
  const max = 30;
  let puan = 8; // baz
  const tip = g.imarTipi || "belirsiz";
  if (tip === "ticari") puan += 10;
  else if (tip === "konut" || tip === "karma") puan += 8;
  else if (tip === "sanayi") puan += 6;
  else if (tip === "tarim") puan += 2;
  else puan += 3; // belirsiz

  if (g.emsal != null && g.emsal > 0) {
    // 0.5 → +2, 1.0 → +6, 1.5 → +10, 2.5+ → +14
    puan += clamp(2 + (g.emsal - 0.5) * 4, 2, 14);
  } else {
    puan -= 3;
  }
  if (g.taks != null && g.taks > 0) {
    puan += clamp(g.taks * 8, 1, 4);
  }
  puan = clamp(Math.round(puan), 0, max);
  const emsalStr = g.emsal != null ? `KAKS ${g.emsal}` : "KAKS yok";
  return {
    id: "imar",
    ad: "İmar potansiyeli",
    puan,
    max,
    not: `${tip} · ${emsalStr}`,
  };
}

/** Likidite / emsal derinliği — 0..20 (+ trend) */
function puanLikidite(g: YatirimSkoruGirdi): YatirimSkoruBilesen {
  const max = 20;
  let puan = clamp(g.emsalAdet * 1.2, 0, 14);
  if (g.kaynak === "spatial-radius" && g.emsalAdet >= 5) puan += 3;
  const tr = g.trendDegisimYuzde;
  if (tr != null && Number.isFinite(tr)) {
    if (tr >= 8) puan += 3;
    else if (tr >= 0) puan += 1;
    else if (tr > -8) puan -= 1;
    else puan -= 3;
  }
  puan = clamp(Math.round(puan), 0, max);
  const trNot =
    tr != null && Number.isFinite(tr)
      ? ` · 12ay %${tr > 0 ? "+" : ""}${Math.round(tr * 10) / 10}`
      : "";
  return {
    id: "likidite",
    ad: "Likidite",
    puan,
    max,
    not: `${g.emsalAdet} emsal ilan${trNot}`,
  };
}

/** Band netliği — 0..20 (dar band + iyi kaynak = yüksek) */
function puanBand(g: YatirimSkoruGirdi): YatirimSkoruBilesen {
  const max = 20;
  let puan = 10;
  if (g.kaynak === "il-fallback") puan = 4;
  else if (g.kaynak === "ilce-istatistik") puan = 10;
  else if (g.kaynak === "mahalle-istatistik") puan = 14;
  else if (g.kaynak === "spatial-radius") puan = 16;

  const med = g.medyanTlm2;
  const alt = g.altTlm2;
  const ust = g.ustTlm2;
  if (med && med > 0 && alt != null && ust != null && ust > alt) {
    const genislik = (ust - alt) / med;
    // dar (%30) → +4, geniş (%80+) → -4
    if (genislik <= 0.35) puan += 4;
    else if (genislik <= 0.55) puan += 2;
    else if (genislik >= 0.9) puan -= 4;
    else if (genislik >= 0.7) puan -= 2;
  }
  // Aşırı agresif imar çarpanı belirsizlik sayılır
  if (g.toplamCarpan >= 1.6 || g.toplamCarpan <= 0.7) puan -= 2;

  puan = clamp(Math.round(puan), 0, max);
  return {
    id: "band",
    ad: "Band netliği",
    puan,
    max,
    not: g.kaynak === "il-fallback" ? "İl baseline — belirsizlik yüksek" : "Fiyat aralığı kalitesi",
  };
}

export function yatirimSkoruHesapla(g: YatirimSkoruGirdi): YatirimSkoruSonuc {
  const bilesenler = [puanVeri(g), puanImar(g), puanLikidite(g), puanBand(g)];
  const skor = clamp(
    bilesenler.reduce((s, b) => s + b.puan, 0),
    0,
    100,
  );
  const etiket = etiketBul(skor);

  const zayif = [...bilesenler].sort((a, b) => a.puan / a.max - b.puan / b.max)[0];
  const guclu = [...bilesenler].sort((a, b) => b.puan / b.max - a.puan / a.max)[0];

  let yorum: string;
  if (etiket === "Güçlü" || etiket === "İyi") {
    yorum = `Yatırım skoru ${skor}/100 (${etiket}). Güçlü yan: ${guclu.ad}. Fizibilite senaryolarıyla doğrula; resmi imar eklentide.`;
  } else if (etiket === "Dengeli") {
    yorum = `Skor ${skor}/100 — dengeli. ${zayif.ad} bileşeni zayıf kalıyor (${zayif.not}).`;
  } else {
    yorum = `Skor ${skor}/100 (${etiket}). Özellikle ${zayif.ad} düşük — veri veya imar varsayımlarını güçlendirmeden agresif alım riskli.`;
  }

  return { skor, etiket, bilesenler, yorum };
}

/** API / UI için düz JSON */
export function yatirimSkoruJson(g: YatirimSkoruGirdi) {
  return yatirimSkoruHesapla(g);
}
