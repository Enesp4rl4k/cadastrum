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
