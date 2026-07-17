/**
 * GET /v1/fiyat/mahalle/:il/:ilce/:mahalle?kategori=arsa
 * GET /v1/fiyat/ilce/:il/:ilce?kategori=arsa
 * GET /v1/fiyat/il/:il?kategori=arsa
 *
 * Cache-Control: public, s-maxage=3600 (CDN'de 1 saat tutulur)
 */
import { Hono } from "hono";
import type { Env } from "../index.js";
import { normalizeYerAdi } from "../lib/normalize.js";

export const fiyatRoutes = new Hono<{ Bindings: Env }>();

const VALID_KATEGORI = new Set(["arsa", "tarla", "konut", "bahce", "bag", "zeytinlik"]);

// Mahalle bazlı sorgu
fiyatRoutes.get("/mahalle/:il/:ilce/:mahalle", async (c) => {
  const il = normalizeYerAdi(c.req.param("il"));
  const ilce = normalizeYerAdi(c.req.param("ilce"));
  const mahalle = normalizeYerAdi(c.req.param("mahalle"));
  const kategori = c.req.query("kategori") ?? "arsa";

  if (!VALID_KATEGORI.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 400);
  }

  // İstatistik + trend + AI fallback'i paralel yap — yoksa boş döner.
  // Tek round-trip yerine concurrent (D1 connection pool).
  const [istatistik, trend, aiBaseline] = await Promise.all([
    c.env.DB.prepare(
      `SELECT medyan, q1, q3, ortalama, ilan_adet, son_guncelleme
       FROM mahalle_istatistik
       WHERE il_norm = ? AND ilce_norm = ? AND mahalle_norm = ? AND kategori = ?`,
    ).bind(il, ilce, mahalle, kategori)
      .first<{ medyan: number; q1: number; q3: number; ortalama: number; ilan_adet: number; son_guncelleme: number }>(),
    c.env.DB.prepare(
      `SELECT yil, ay, medyan, ilan_adet
       FROM mahalle_zaman_serisi
       WHERE il_norm = ? AND ilce_norm = ? AND mahalle_norm = ? AND kategori = ?
       ORDER BY yil DESC, ay DESC LIMIT 6`,
    ).bind(il, ilce, mahalle, kategori).all(),
    c.env.DB.prepare(
      `SELECT tlm2 as medyan, guven, kaynak, yakalandi as son_guncelleme
       FROM mahalle_baseline_ai
       WHERE il_norm = ? AND ilce_norm = ? AND mahalle_norm = ? AND kategori = ?`,
    ).bind(il, ilce, mahalle, kategori).first(),
  ]);

  if (istatistik && istatistik.ilan_adet > 0) {
    c.header("Cache-Control", "public, s-maxage=3600");
    return c.json({
      kaynak: "ilan-istatistik",
      ...istatistik,
      trend: trend.results ?? [],
    });
  }

  // Fallback: AI baseline (zaten paralel yüklendi yukarıda)
  if (aiBaseline) {
    c.header("Cache-Control", "public, s-maxage=86400"); // AI baseline 1 gün cache
    return c.json({ ...aiBaseline, trend: [] });
  }

  return c.json({ error: "Veri bulunamadı" }, 404);
});

// İlçe bazlı sorgu — gerçek ilan istatistiği yoksa AI baseline'dan hesapla
fiyatRoutes.get("/ilce/:il/:ilce", async (c) => {
  const il = normalizeYerAdi(c.req.param("il"));
  const ilce = normalizeYerAdi(c.req.param("ilce"));
  const kategori = c.req.query("kategori") ?? "arsa";

  if (!VALID_KATEGORI.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 400);
  }

  // Paralel — sequential await yerine
  let [ilceIstatistik, mahalleler] = await Promise.all([
    c.env.DB.prepare(
      `SELECT medyan, q1, q3, ilan_adet, son_guncelleme, 'ilan-istatistik' AS kaynak
       FROM ilce_istatistik
       WHERE il_norm = ? AND ilce_norm = ? AND kategori = ?`,
    ).bind(il, ilce, kategori)
      .first<{ medyan: number; q1: number; q3: number; ilan_adet: number; son_guncelleme: number; kaynak: string }>(),
    c.env.DB.prepare(
      `SELECT mahalle_norm, medyan, ilan_adet
       FROM mahalle_istatistik
       WHERE il_norm = ? AND ilce_norm = ? AND kategori = ?
       ORDER BY ilan_adet DESC LIMIT 50`,
    ).bind(il, ilce, kategori)
      .all<{ mahalle_norm: string; medyan: number; ilan_adet: number }>(),
  ]);

  // Fallback: AI baseline tablosundan ilçe ortalaması + mahalle listesi
  if (!ilceIstatistik || (mahalleler.results?.length ?? 0) === 0) {
    const aiMahalleler = await c.env.DB.prepare(
      `SELECT mahalle_norm, tlm2 AS medyan
       FROM mahalle_baseline_ai
       WHERE il_norm = ? AND ilce_norm = ? AND kategori = ?
       ORDER BY tlm2 DESC LIMIT 50`,
    )
      .bind(il, ilce, kategori)
      .all<{ mahalle_norm: string; medyan: number }>();

    const aiList = aiMahalleler.results ?? [];
    if (aiList.length > 0) {
      const fiyatlar = aiList.map(m => m.medyan).sort((a, b) => a - b);
      const medyan = fiyatlar[Math.floor(fiyatlar.length / 2)] ?? 0;
      const q1 = fiyatlar[Math.floor(fiyatlar.length * 0.25)] ?? 0;
      const q3 = fiyatlar[Math.floor(fiyatlar.length * 0.75)] ?? 0;
      ilceIstatistik = {
        medyan,
        q1,
        q3,
        ilan_adet: aiList.length,
        son_guncelleme: Date.now(),
        kaynak: "ai-aggregate",
      };
      mahalleler = { results: aiList.map(m => ({ ...m, ilan_adet: 0 })), success: true } as never;
    }
  }

  c.header("Cache-Control", "public, s-maxage=3600");
  return c.json({
    ...ilceIstatistik,
    mahalleler: mahalleler.results ?? [],
  });
});

// İl bazlı sorgu
fiyatRoutes.get("/il/:il", async (c) => {
  const il = normalizeYerAdi(c.req.param("il"));
  const kategori = c.req.query("kategori") ?? "arsa";

  if (!VALID_KATEGORI.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 400);
  }

  // Paralel
  let [ilIstatistik, ilceler] = await Promise.all([
    c.env.DB.prepare(
      `SELECT medyan, ilan_adet, son_guncelleme, 'ilan-istatistik' AS kaynak
       FROM il_istatistik WHERE il_norm = ? AND kategori = ?`,
    ).bind(il, kategori)
      .first<{ medyan: number; ilan_adet: number; son_guncelleme: number; kaynak: string }>(),
    c.env.DB.prepare(
      `SELECT ilce_norm, medyan, ilan_adet
       FROM ilce_istatistik
       WHERE il_norm = ? AND kategori = ?
       ORDER BY medyan DESC`,
    ).bind(il, kategori)
      .all<{ ilce_norm: string; medyan: number; ilan_adet: number }>(),
  ]);

  // Fallback: AI baseline tablosundan il agregesi (ilçe başına AI medyan)
  if (!ilIstatistik || (ilceler.results?.length ?? 0) === 0) {
    const aiIlceler = await c.env.DB.prepare(
      `SELECT ilce_norm, AVG(tlm2) AS medyan, COUNT(*) AS ilan_adet
       FROM mahalle_baseline_ai
       WHERE il_norm = ? AND kategori = ?
       GROUP BY ilce_norm
       ORDER BY medyan DESC`,
    )
      .bind(il, kategori)
      .all<{ ilce_norm: string; medyan: number; ilan_adet: number }>();

    const aiList = aiIlceler.results ?? [];
    if (aiList.length > 0) {
      const ilFiyatlar = aiList.map(x => x.medyan).sort((a, b) => a - b);
      const ilMedyan = ilFiyatlar[Math.floor(ilFiyatlar.length / 2)] ?? 0;
      ilIstatistik = {
        medyan: ilMedyan,
        ilan_adet: aiList.reduce((s, x) => s + x.ilan_adet, 0),
        son_guncelleme: Date.now(),
        kaynak: "ai-aggregate",
      };
      ilceler = { results: aiList, success: true } as never;
    }
  }

  c.header("Cache-Control", "public, s-maxage=3600");
  return c.json({
    ...ilIstatistik,
    ilceler: ilceler.results ?? [],
  });
});

// ── Toplu il fiyat özeti — harita choropleth için ──────────────────────────
/**
 * GET /v1/fiyat/toplu-ozet?kategori=arsa
 *
 * Tüm illerin medyan TL/m² değerlerini tek sorguda döndürür.
 * Site harita katmanı bu endpoint'ten beslenecek.
 *
 * Cache-Control: public, s-maxage=7200 (2 saat CDN)
 */
fiyatRoutes.get("/toplu-ozet", async (c) => {
  const kategori = c.req.query("kategori") ?? "arsa";
  if (!VALID_KATEGORI.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 400);
  }

  // 1. Gerçek ilan istatistiğinden il özeti
  const ilanRows = await c.env.DB.prepare(
    `SELECT il_norm, medyan, ilan_adet, son_guncelleme
     FROM il_istatistik
     WHERE kategori = ?
     ORDER BY il_norm`,
  ).bind(kategori).all<{ il_norm: string; medyan: number; ilan_adet: number; son_guncelleme: number }>();

  const ilanMap = new Map<string, { medyan: number; ilan_adet: number; kaynak: string }>();
  for (const r of (ilanRows.results ?? [])) {
    ilanMap.set(r.il_norm, { medyan: r.medyan, ilan_adet: r.ilan_adet, kaynak: "ilan" });
  }

  // 2. Eksik iller için AI baseline agregesi
  const aiRows = await c.env.DB.prepare(
    `SELECT il_norm, AVG(tlm2) AS medyan, COUNT(*) AS ilan_adet
     FROM mahalle_baseline_ai
     WHERE kategori = ?
     GROUP BY il_norm
     ORDER BY il_norm`,
  ).bind(kategori).all<{ il_norm: string; medyan: number; ilan_adet: number }>();

  const sonuc: Array<{
    il_norm: string;
    medyan: number;
    ilan_adet: number;
    kaynak: "ilan" | "ai-baseline";
  }> = [];

  // Merge: ilan verisi varsa önce o, yoksa AI
  const tumIller = new Set([
    ...ilanMap.keys(),
    ...(aiRows.results ?? []).map(r => r.il_norm),
  ]);

  for (const ilNorm of tumIller) {
    const ilan = ilanMap.get(ilNorm);
    if (ilan && ilan.ilan_adet >= 5) {
      sonuc.push({ il_norm: ilNorm, medyan: Math.round(ilan.medyan), ilan_adet: ilan.ilan_adet, kaynak: "ilan" });
    } else {
      const ai = (aiRows.results ?? []).find(r => r.il_norm === ilNorm);
      if (ai && ai.medyan > 0) {
        sonuc.push({ il_norm: ilNorm, medyan: Math.round(ai.medyan), ilan_adet: ai.ilan_adet, kaynak: "ai-baseline" });
      }
    }
  }

  sonuc.sort((a, b) => a.il_norm.localeCompare(b.il_norm));

  c.header("Cache-Control", "public, s-maxage=7200");
  return c.json({
    kategori,
    ilSayisi: sonuc.length,
    iller: sonuc,
    guncelleme: new Date().toISOString(),
  });
});

// ── Toplu ilçe fiyat özeti — il bazlı choropleth için ─────────────────────
/**
 * GET /v1/fiyat/toplu-ilce-ozet/:il?kategori=arsa
 *
 * Tek ilin tüm ilçelerinin medyan TL/m² değerlerini döndürür.
 * Haritada ilçeye yakınlaştırınca popup'ta gösterilir.
 *
 * Cache-Control: public, s-maxage=7200
 */
fiyatRoutes.get("/toplu-ilce-ozet/:il", async (c) => {
  const il      = normalizeYerAdi(c.req.param("il"));
  const kategori = c.req.query("kategori") ?? "arsa";

  if (!VALID_KATEGORI.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 400);
  }

  // İlçe istatistik tablosundan çek
  const ilceRows = await c.env.DB.prepare(
    `SELECT ilce_norm, medyan, ilan_adet, son_guncelleme
     FROM ilce_istatistik
     WHERE il_norm = ? AND kategori = ?
     ORDER BY medyan DESC`,
  ).bind(il, kategori).all<{ ilce_norm: string; medyan: number; ilan_adet: number; son_guncelleme: number }>();

  // Mahalle sayısını da ekle (popup'ta göstermek için)
  const mahalleCountRows = await c.env.DB.prepare(
    `SELECT ilce_norm, COUNT(*) AS mahalle_sayi
     FROM mahalle_istatistik
     WHERE il_norm = ? AND kategori = ?
     GROUP BY ilce_norm`,
  ).bind(il, kategori).all<{ ilce_norm: string; mahalle_sayi: number }>();

  const mahalleMap = new Map<string, number>();
  for (const r of (mahalleCountRows.results ?? [])) {
    mahalleMap.set(r.ilce_norm, r.mahalle_sayi);
  }

  const ilceler = (ilceRows.results ?? []).map(r => ({
    ...r,
    medyan: Math.round(r.medyan),
    mahalle_sayi: mahalleMap.get(r.ilce_norm) ?? 0,
  }));

  c.header("Cache-Control", "public, s-maxage=7200");
  return c.json({ il, kategori, ilceler });
});

// ── Trend + Projeksiyon ─────────────────────────────────────────────────────
/**
 * GET /v1/fiyat/trend/:il/:ilce/:mahalle?kategori=arsa
 *
 * Son 18 aylık medyan + 6 aylık lineer regresyon projeksiyonu.
 * TÜFE yaklaşımı (aylık %3) ile reel değişim de hesaplanır.
 *
 * Cache-Control: public, s-maxage=21600 (6 saat CDN)
 */

interface ZamanNoktasi {
  yil: number;
  ay: number;
  medyan: number;
  ilan_adet: number;
}

/** Basit OLS lineer regresyon — saf JS, kütüphane yok. */
function olsRegresyon(ys: number[]): {
  egim: number;   // TL/m² / ay
  kesim: number;  // y-intercept
  r2: number;
  sigma: number;  // artık std sapma — güven bandı için
} {
  const n = ys.length;
  if (n < 3) return { egim: 0, kesim: ys[0] ?? 0, r2: 0, sigma: 0 };

  const xs = ys.map((_, i) => i);
  const xOrt = (n - 1) / 2;
  const yOrt = ys.reduce((s, v) => s + v, 0) / n;

  let ssXY = 0, ssXX = 0, ssYY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - xOrt;
    const dy = ys[i]! - yOrt;
    ssXY += dx * dy;
    ssXX += dx * dx;
    ssYY += dy * dy;
  }

  if (ssXX === 0) return { egim: 0, kesim: yOrt, r2: 0, sigma: 0 };

  const egim = ssXY / ssXX;
  const kesim = yOrt - egim * xOrt;
  const r2 = ssYY > 0 ? Math.min(1, Math.max(0, (ssXY * ssXY) / (ssXX * ssYY))) : 0;

  // Artık std sapma (σ)
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const tahmin = kesim + egim * i;
    ssRes += Math.pow(ys[i]! - tahmin, 2);
  }
  const sigma = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;

  return { egim, kesim, r2, sigma };
}

fiyatRoutes.get("/trend/:il/:ilce/:mahalle", async (c) => {
  const il      = normalizeYerAdi(c.req.param("il"));
  const ilce    = normalizeYerAdi(c.req.param("ilce"));
  const mahalle = normalizeYerAdi(c.req.param("mahalle"));
  const kategori = c.req.query("kategori") ?? "arsa";

  if (!VALID_KATEGORI.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 400);
  }

  // Son 18 ay — mahalle seviyesi
  let rows = await c.env.DB.prepare(
    `SELECT yil, ay, medyan, ilan_adet
     FROM mahalle_zaman_serisi
     WHERE il_norm = ? AND ilce_norm = ? AND mahalle_norm = ? AND kategori = ?
     ORDER BY yil ASC, ay ASC
     LIMIT 18`,
  ).bind(il, ilce, mahalle, kategori).all<ZamanNoktasi>();

  let seviye: "mahalle" | "ilce" | "il" = "mahalle";

  // W1c: Mahalle verisi yetersizse ilçe seviyesine fallback
  if ((rows.results ?? []).length < 3 && ilce) {
    const ilceRows = await c.env.DB.prepare(
      `SELECT yil, ay,
              ROUND(SUM(medyan * ilan_adet) / SUM(ilan_adet)) AS medyan,
              SUM(ilan_adet) AS ilan_adet
       FROM mahalle_zaman_serisi
       WHERE il_norm = ? AND ilce_norm = ? AND kategori = ?
       GROUP BY yil, ay
       ORDER BY yil ASC, ay ASC
       LIMIT 18`,
    ).bind(il, ilce, kategori).all<ZamanNoktasi>();

    if ((ilceRows.results ?? []).length >= 3) {
      rows = ilceRows;
      seviye = "ilce";
    }
  }

  // İlçe verisi de yetersizse il seviyesine fallback
  if ((rows.results ?? []).length < 3 && il) {
    const ilRows = await c.env.DB.prepare(
      `SELECT yil, ay,
              ROUND(SUM(medyan * ilan_adet) / SUM(ilan_adet)) AS medyan,
              SUM(ilan_adet) AS ilan_adet
       FROM mahalle_zaman_serisi
       WHERE il_norm = ? AND kategori = ?
       GROUP BY yil, ay
       ORDER BY yil ASC, ay ASC
       LIMIT 18`,
    ).bind(il, kategori).all<ZamanNoktasi>();

    if ((ilRows.results ?? []).length >= 3) {
      rows = ilRows;
      seviye = "il";
    }
  }

  const gecmis = rows.results ?? [];
  if (gecmis.length === 0) {
    return c.json({ error: "Trend verisi yok" }, 404);
  }

  // Regresyon — sadece son 12 ay üzerinden (daha güncel eğimi yakalar)
  const son12 = gecmis.slice(-12);
  const ys = son12.map(r => r.medyan);
  const reg = olsRegresyon(ys);

  // 6 ay ilerisi projeksiyon
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

  // Yıllık değişim
  const ilkFiyat = gecmis[0]!.medyan;
  const sonFiyat = sonNokta.medyan;
  const yillikDegisimYuzde = ilkFiyat > 0
    ? Math.round(((sonFiyat - ilkFiyat) / ilkFiyat) * 1000) / 10
    : 0;

  // Reel değişim: TÜFE yaklaşımı — her ay için ~%3 kümülatif enflasyon
  const aySayisi = gecmis.length;
  const tufeCarpani = Math.pow(1.03, aySayisi);
  const ruelDegisimYuzde = ilkFiyat > 0
    ? Math.round(((sonFiyat / (ilkFiyat * tufeCarpani)) - 1) * 1000) / 10
    : 0;

  const trend =
    reg.egim > sonFiyat * 0.005 ? "yukseliyor"
    : reg.egim < -sonFiyat * 0.005 ? "dusuyor"
    : "duruyor";

  c.header("Cache-Control", "public, s-maxage=21600");
  return c.json({
    gecmis,
    projeksiyon,
    yillikDegisimYuzde,
    ruelDegisimYuzde,
    trend,
    r2: Math.round(reg.r2 * 100) / 100,
    aylikEgimTlm2: Math.round(reg.egim),
    veriAyAdet: gecmis.length,
    /** W1c: hangi seviyede veri bulundu — "mahalle" | "ilce" | "il" */
    seviye,
  });
});
