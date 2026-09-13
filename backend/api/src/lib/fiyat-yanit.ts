/**
 * Fiyat yanıtlarını KURAN saf fonksiyonlar — D1'e dokunmaz.
 *
 * ── NEDEN AYRI (2026-09-13) ─────────────────────────────────────────────────
 *
 * Aynı yanıtın İKİ üreticisi var ve birbirinden sapmamaları gerekiyor:
 *
 *  1. Canlı rotalar (routes/fiyat.ts) — tek il/ilçe/mahalle, istek başına.
 *  2. Statik dışa aktarma (routes/statik.ts) — il başına TOPLU; site build'i
 *     bunu JSON dosyası olarak Pages'e koyuyor, ziyaretçi trafiği D1'e hiç
 *     gitmiyor.
 *
 * (2) canlı rotaları dahili çağıramıyor: D1 ücretsiz katmanda Worker çağrısı
 * başına en fazla 50 sorgu; bir ilçenin mahallelerini tek tek sormak bunu
 * aşıyor. Bu yüzden (2) az sayıda toplu sorgu yapıp satırları buraya veriyor.
 * Mantık tek yerde olduğu için statik dosya ile API yanıtı yapısal olarak
 * ayrışamaz; test/statik-esdegerlik.spec.ts bunu ayrıca doğruluyor.
 *
 * Toplamalar (ağırlıklı medyan, AVG) burada JS'te YAPILMIYOR: SQLite'ın
 * SUM/AVG'si (Kahan toplamı) JS toplamından son basamakta farklı çıkabiliyor.
 * Her iki üretici de aynı SQL ifadesini çalıştırıp satırı buraya veriyor.
 */

export interface Yanit {
  durum: 200 | 404;
  govde: Record<string, unknown>;
  /** Cache-Control değeri; 404'te yok. */
  onbellek?: string;
}

const VERI_YOK: Yanit = { durum: 404, govde: { error: "Veri bulunamadı" } };

// ── Mahalle ─────────────────────────────────────────────────────────────────

export interface MahalleIstatistik {
  medyan: number; q1: number; q3: number; ortalama: number; ilan_adet: number; son_guncelleme: number;
}
export interface ZamanSatiri { yil: number; ay: number; medyan: number; ilan_adet: number }
export interface MahalleAi { medyan: number; guven: number | null; kaynak: string | null; son_guncelleme: number | null }

/** Gerçek istatistikte ilan varsa AI'ye hiç bakılmaz — canlı rota AI sorgusunu bu yüzden tembel atıyor. */
export function mahalleIstatistikYeterli(ist: MahalleIstatistik | null | undefined): boolean {
  return !!ist && ist.ilan_adet > 0;
}

/**
 * @param trendSon6 `ORDER BY yil DESC, ay DESC LIMIT 6` sırasıyla
 * @param ai        yalnızca istatistik yetersizken anlamlı
 */
export function mahalleYaniti(
  ist: MahalleIstatistik | null | undefined,
  trendSon6: ZamanSatiri[],
  ai: MahalleAi | null | undefined,
): Yanit {
  if (ist && mahalleIstatistikYeterli(ist)) {
    return {
      durum: 200,
      govde: { kaynak: "ilan-istatistik", ...ist, trend: trendSon6 },
      onbellek: "public, s-maxage=3600",
    };
  }
  if (ai) {
    return {
      durum: 200,
      govde: { ...ai, ilan_adet: 0, baseline_satir_sayisi: 1, trend: [] },
      onbellek: "public, s-maxage=86400",
    };
  }
  return VERI_YOK;
}

// ── İlçe ────────────────────────────────────────────────────────────────────

export interface IlceIstatistik { medyan: number; q1: number; q3: number; ilan_adet: number; son_guncelleme: number }
export interface MahalleOzetSatiri { mahalle_norm: string; medyan: number; ilan_adet: number }
export interface AiMahalleSatiri { mahalle_norm: string; medyan: number }

export function ilceAiGerekli(ist: IlceIstatistik | null | undefined, mahalleler: MahalleOzetSatiri[]): boolean {
  return !ist || mahalleler.length === 0;
}

/**
 * @param mahalleler `ORDER BY ilan_adet DESC, mahalle_norm ASC LIMIT 50`
 * @param aiMahalleler `ORDER BY tlm2 DESC, mahalle_norm ASC LIMIT 50`; yalnızca `ilceAiGerekli` iken
 * @param simdi AI agregesinin son_guncelleme'si (canlıda Date.now())
 */
export function ilceYaniti(
  ist: IlceIstatistik | null | undefined,
  mahalleler: MahalleOzetSatiri[],
  aiMahalleler: AiMahalleSatiri[] | null,
  simdi: number,
): Yanit {
  let ozet: Record<string, unknown> | null = ist ? { ...ist, kaynak: "ilan-istatistik" } : null;
  let liste: unknown[] = mahalleler;

  if (ilceAiGerekli(ist, mahalleler) && aiMahalleler && aiMahalleler.length > 0) {
    const fiyatlar = aiMahalleler.map((m) => m.medyan).sort((a, b) => a - b);
    ozet = {
      medyan: fiyatlar[Math.floor(fiyatlar.length / 2)] ?? 0,
      q1: fiyatlar[Math.floor(fiyatlar.length * 0.25)] ?? 0,
      q3: fiyatlar[Math.floor(fiyatlar.length * 0.75)] ?? 0,
      ilan_adet: 0,
      baseline_satir_sayisi: aiMahalleler.length,
      son_guncelleme: simdi,
      kaynak: "ai-aggregate",
    };
    liste = aiMahalleler.map((m) => ({ ...m, ilan_adet: 0, baseline_satir_sayisi: 1 }));
  }

  // Yokluk kararı — 404 yalnızca HİÇBİR ŞEY yokken (bkz. fiyat.ts'deki eski not).
  if (!ozet && liste.length === 0) return VERI_YOK;
  return { durum: 200, govde: { ...ozet, mahalleler: liste }, onbellek: "public, s-maxage=3600" };
}

// ── İl ──────────────────────────────────────────────────────────────────────

export interface IlIstatistik { medyan: number; ilan_adet: number; son_guncelleme: number }
export interface IlceOzetSatiri { ilce_norm: string; medyan: number; ilan_adet: number }
export interface AiIlceSatiri { ilce_norm: string; medyan: number; baseline_satir_sayisi: number }

export function ilAiGerekli(ist: IlIstatistik | null | undefined, ilceler: IlceOzetSatiri[]): boolean {
  return !ist || ilceler.length === 0;
}

/**
 * @param ilceler `ORDER BY medyan DESC, ilce_norm ASC`
 * @param aiIlceler `SELECT ilce_norm, AVG(tlm2) AS medyan, COUNT(*) … GROUP BY ilce_norm ORDER BY medyan DESC, ilce_norm ASC`
 */
export function ilYaniti(
  ist: IlIstatistik | null | undefined,
  ilceler: IlceOzetSatiri[],
  aiIlceler: AiIlceSatiri[] | null,
  simdi: number,
): Yanit {
  let ozet: Record<string, unknown> | null = ist ? { ...ist, kaynak: "ilan-istatistik" } : null;
  let liste: unknown[] = ilceler;

  if (ilAiGerekli(ist, ilceler) && aiIlceler && aiIlceler.length > 0) {
    const fiyatlar = aiIlceler.map((x) => x.medyan).sort((a, b) => a - b);
    ozet = {
      medyan: fiyatlar[Math.floor(fiyatlar.length / 2)] ?? 0,
      ilan_adet: 0,
      baseline_satir_sayisi: aiIlceler.reduce((s, x) => s + x.baseline_satir_sayisi, 0),
      son_guncelleme: simdi,
      kaynak: "ai-aggregate",
    };
    liste = aiIlceler.map((x) => ({ ...x, ilan_adet: 0 }));
  }

  if (!ozet && liste.length === 0) return VERI_YOK;
  return { durum: 200, govde: { ...ozet, ilceler: liste }, onbellek: "public, s-maxage=3600" };
}

// ── İl içi ilçe özeti (harita popup) ────────────────────────────────────────

export interface IlceOzetTamSatiri { ilce_norm: string; medyan: number; ilan_adet: number; son_guncelleme: number }

/** @param ilceler `ORDER BY medyan DESC, ilce_norm ASC` · @param mahalleSayilari ilce_norm → COUNT(*) */
export function topluIlceOzetYaniti(
  il: string,
  kategori: string,
  ilceler: IlceOzetTamSatiri[],
  mahalleSayilari: Map<string, number>,
): Yanit {
  return {
    durum: 200,
    govde: {
      il,
      kategori,
      ilceler: ilceler.map((r) => ({
        ...r,
        medyan: Math.round(r.medyan),
        mahalle_sayi: mahalleSayilari.get(r.ilce_norm) ?? 0,
      })),
    },
    onbellek: "public, s-maxage=7200",
  };
}

// ── Trend + projeksiyon ─────────────────────────────────────────────────────

/** Basit OLS lineer regresyon — saf JS, kütüphane yok. */
export function olsRegresyon(ys: number[]): { egim: number; kesim: number; r2: number; sigma: number } {
  const n = ys.length;
  if (n < 3) return { egim: 0, kesim: ys[0] ?? 0, r2: 0, sigma: 0 };

  const xOrt = (n - 1) / 2;
  const yOrt = ys.reduce((s, v) => s + v, 0) / n;

  let ssXY = 0, ssXX = 0, ssYY = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - xOrt;
    const dy = ys[i]! - yOrt;
    ssXY += dx * dy;
    ssXX += dx * dx;
    ssYY += dy * dy;
  }
  if (ssXX === 0) return { egim: 0, kesim: yOrt, r2: 0, sigma: 0 };

  const egim = ssXY / ssXX;
  const kesim = yOrt - egim * xOrt;
  const r2 = ssYY > 0 ? Math.min(1, Math.max(0, (ssXY * ssXY) / (ssXX * ssYY))) : 0;

  let ssRes = 0;
  for (let i = 0; i < n; i++) ssRes += Math.pow(ys[i]! - (kesim + egim * i), 2);
  const sigma = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;

  return { egim, kesim, r2, sigma };
}

/**
 * Seviye seçimi canlı rotayla aynı: mahalle < 3 nokta → ilçe (≥3 ise) → il (≥3 ise).
 * Hiçbiri ≥3 değilse elde ne varsa (mahalle satırları) kullanılır.
 *
 * @param mahalle `ORDER BY yil ASC, ay ASC LIMIT 18`
 * @param ilce    ağırlıklı ilçe serisi, aynı sıra ve LIMIT (ilçe verilmediyse null)
 * @param il      ağırlıklı il serisi, aynı sıra ve LIMIT
 */
export function trendYaniti(mahalle: ZamanSatiri[], ilce: ZamanSatiri[] | null, il: ZamanSatiri[] | null): Yanit {
  let gecmis = mahalle;
  let seviye: "mahalle" | "ilce" | "il" = "mahalle";

  if (gecmis.length < 3 && ilce && ilce.length >= 3) {
    gecmis = ilce;
    seviye = "ilce";
  }
  if (gecmis.length < 3 && il && il.length >= 3) {
    gecmis = il;
    seviye = "il";
  }

  if (gecmis.length === 0) return { durum: 404, govde: { error: "Trend verisi yok" } };

  // Regresyon — yalnızca son 12 ay (daha güncel eğim)
  const son12 = gecmis.slice(-12);
  const reg = olsRegresyon(son12.map((r) => r.medyan));

  const sonNokta = gecmis[gecmis.length - 1]!;
  const projeksiyon = [];
  for (let i = 1; i <= 6; i++) {
    const ay = ((sonNokta.ay - 1 + i) % 12) + 1;
    const yil = sonNokta.yil + Math.floor((sonNokta.ay - 1 + i) / 12);
    const tahmin = Math.round(reg.kesim + reg.egim * (son12.length - 1 + i));
    const guvenBand = Math.round(reg.sigma * 1.96); // %95 CI
    projeksiyon.push({
      yil,
      ay,
      tahmin: Math.max(0, tahmin),
      guven_alt: Math.max(0, tahmin - guvenBand),
      guven_ust: tahmin + guvenBand,
    });
  }

  const ilkFiyat = gecmis[0]!.medyan;
  const sonFiyat = sonNokta.medyan;
  const yillikDegisimYuzde = ilkFiyat > 0 ? Math.round(((sonFiyat - ilkFiyat) / ilkFiyat) * 1000) / 10 : 0;

  // Reel değişim: TÜFE yaklaşımı — her ay ~%3 kümülatif
  const tufeCarpani = Math.pow(1.03, gecmis.length);
  const ruelDegisimYuzde = ilkFiyat > 0 ? Math.round((sonFiyat / (ilkFiyat * tufeCarpani) - 1) * 1000) / 10 : 0;

  const trend =
    reg.egim > sonFiyat * 0.005 ? "yukseliyor"
    : reg.egim < -sonFiyat * 0.005 ? "dusuyor"
    : "duruyor";

  return {
    durum: 200,
    govde: {
      gecmis,
      projeksiyon,
      yillikDegisimYuzde,
      ruelDegisimYuzde,
      trend,
      r2: Math.round(reg.r2 * 100) / 100,
      aylikEgimTlm2: Math.round(reg.egim),
      veriAyAdet: gecmis.length,
      /** W1c: hangi seviyede veri bulundu */
      seviye,
    },
    onbellek: "public, s-maxage=21600",
  };
}
