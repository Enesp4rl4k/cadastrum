/**
 * Milli Emlak ihale seed + sorgu endpoint'leri.
 *
 *   POST /v1/admin/milli-emlak/seed       → Scraper'dan gelen ihaleleri D1'e yaz (admin)
 *   GET  /v1/milli-emlak/sorgu            → Koordinat/il/ilce bazlı ihale sonuçları (public)
 *   GET  /v1/milli-emlak/ozet/:il/:ilce   → İlçe bazlı özet istatistik (public)
 *   GET  /v1/milli-emlak/yaklasan         → Yaklaşan/aktif ihaleler (ihale_tarihi > şimdi)
 */
import { Hono } from "hono";
import type { Env } from "../index.js";
import { normalizeYerAdi } from "../lib/normalize.js";

export const milliEmlakRoutes = new Hono<{ Bindings: Env }>();

// ── Admin: SCRAPER_API_SECRET ile korunan seed endpoint ───────────────────────
// S3: timing-safe compare

milliEmlakRoutes.post("/admin/seed", async (c) => {
  const { bearerYetkilendir } = await import("../lib/security.js");
  const yetki = await bearerYetkilendir(c.req.header("Authorization"), c.env.SCRAPER_API_SECRET);
  if (!yetki) {
    return c.json({ hata: "Yetkisiz" }, 401);
  }

  let body: { ilanlar?: unknown[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ hata: "Geçersiz JSON" }, 400);
  }

  if (!Array.isArray(body.ilanlar) || body.ilanlar.length === 0) {
    return c.json({ hata: "ilanlar array boş" }, 400);
  }

  if (body.ilanlar.length > 100) {
    return c.json({ hata: "Max 100 ilan per batch" }, 400);
  }

  let eklenen = 0;
  let atlanan = 0;

  for (const ilan of body.ilanlar) {
    const r = ilan as Record<string, unknown>;

    const ilNorm = normalizeYerAdi(String(r.il_norm ?? ""));
    const ilceNorm = normalizeYerAdi(String(r.ilce_norm ?? ""));

    if (!ilNorm || !ilceNorm) { atlanan++; continue; }

    const fiyatPerM2 = typeof r.fiyat_per_m2 === "number" && r.fiyat_per_m2 > 0
      ? r.fiyat_per_m2 : null;
    const muhammenBedel = typeof r.muhammen_bedel === "number" && r.muhammen_bedel > 0
      ? r.muhammen_bedel : null;

    if (!muhammenBedel) { atlanan++; continue; }

    try {
      await c.env.DB.prepare(`
        INSERT OR IGNORE INTO milli_emlak_ihale
          (il_norm, ilce_norm, mahalle_norm, ada_no, parsel_no,
           m2, nitelik, muhammen_bedel, ihale_bedeli, fiyat_per_m2,
           ihale_tarihi, ihale_tipi, kaynak_url, yakalanma_tarihi, aktif)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
      `).bind(
        ilNorm,
        ilceNorm,
        r.mahalle_norm ? normalizeYerAdi(String(r.mahalle_norm)) : null,
        r.ada_no ? String(r.ada_no) : null,
        r.parsel_no ? String(r.parsel_no) : null,
        typeof r.m2 === "number" ? r.m2 : null,
        r.nitelik ? String(r.nitelik).slice(0, 100) : null,
        muhammenBedel,
        typeof r.ihale_bedeli === "number" ? r.ihale_bedeli : muhammenBedel,
        fiyatPerM2,
        typeof r.ihale_tarihi === "number" ? r.ihale_tarihi : null,
        r.ihale_tipi ? String(r.ihale_tipi).slice(0, 20) : "satis",
        r.kaynak_url ? String(r.kaynak_url).slice(0, 500) : null,
        Date.now(),
      ).run();
      eklenen++;
    } catch {
      atlanan++;
    }
  }

  return c.json({ eklenen, atlanan, toplam: body.ilanlar.length });
});

// ── Public: İl/ilçe bazlı Milli Emlak ihale sonuçları ────────────────────────

milliEmlakRoutes.get("/sorgu", async (c) => {
  const ilRaw = c.req.query("il");
  const ilceRaw = c.req.query("ilce");
  const mahRaw = c.req.query("mahalle");
  const limitRaw = Math.min(Number(c.req.query("limit") ?? "20"), 50);

  if (!ilRaw) return c.json({ hata: "il parametresi gerekli" }, 400);

  const ilNorm = normalizeYerAdi(ilRaw);
  const ilceNorm = ilceRaw ? normalizeYerAdi(ilceRaw) : null;
  const mahNorm = mahRaw ? normalizeYerAdi(mahRaw) : null;

  let query: string;
  let params: (string | null | number)[];

  if (mahNorm && ilceNorm) {
    query = `SELECT * FROM milli_emlak_ihale
             WHERE il_norm=? AND ilce_norm=? AND mahalle_norm=? AND aktif=1
             ORDER BY ihale_tarihi DESC LIMIT ?`;
    params = [ilNorm, ilceNorm, mahNorm, limitRaw];
  } else if (ilceNorm) {
    query = `SELECT * FROM milli_emlak_ihale
             WHERE il_norm=? AND ilce_norm=? AND aktif=1
             ORDER BY ihale_tarihi DESC LIMIT ?`;
    params = [ilNorm, ilceNorm, limitRaw];
  } else {
    query = `SELECT * FROM milli_emlak_ihale
             WHERE il_norm=? AND aktif=1
             ORDER BY ihale_tarihi DESC LIMIT ?`;
    params = [ilNorm, limitRaw];
  }

  try {
    const rows = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({
      ilanlar: rows.results ?? [],
      adet: rows.results?.length ?? 0,
    }, 200, {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    });
  } catch (e) {
    return c.json({ hata: "DB sorgu hatası" }, 500);
  }
});

// ── Public: Yaklaşan / aktif ihaleler ────────────────────────────────────────
// ihale_tarihi > now — henüz kapanmamış ihaleler
// W6 — Canlı İhale Takibi

milliEmlakRoutes.get("/yaklasan", async (c) => {
  const ilRaw = c.req.query("il");
  const ilceRaw = c.req.query("ilce");
  const limitRaw = Math.min(Number(c.req.query("limit") ?? "20"), 50);
  const gunRaw = Math.min(Number(c.req.query("gun") ?? "90"), 365); // kaç gün sonrasına kadar

  if (!ilRaw) return c.json({ hata: "il parametresi gerekli" }, 400);

  const ilNorm = normalizeYerAdi(ilRaw);
  const ilceNorm = ilceRaw ? normalizeYerAdi(ilceRaw) : null;
  const simdi = Date.now();
  const bitis = simdi + gunRaw * 24 * 60 * 60 * 1000;

  let query: string;
  let params: (string | null | number)[];

  if (ilceNorm) {
    query = `SELECT * FROM milli_emlak_ihale
             WHERE il_norm=? AND ilce_norm=? AND aktif=1
               AND ihale_tarihi >= ? AND ihale_tarihi <= ?
             ORDER BY ihale_tarihi ASC LIMIT ?`;
    params = [ilNorm, ilceNorm, simdi, bitis, limitRaw];
  } else {
    query = `SELECT * FROM milli_emlak_ihale
             WHERE il_norm=? AND aktif=1
               AND ihale_tarihi >= ? AND ihale_tarihi <= ?
             ORDER BY ihale_tarihi ASC LIMIT ?`;
    params = [ilNorm, simdi, bitis, limitRaw];
  }

  try {
    const rows = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({
      ilanlar: rows.results ?? [],
      adet: rows.results?.length ?? 0,
      sorgu_tarihi: simdi,
      gun: gunRaw,
    }, 200, {
      // Yaklaşan ihaleler sık değişebilir — kısa TTL
      "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600",
    });
  } catch {
    return c.json({ hata: "DB sorgu hatası" }, 500);
  }
});

// ── Public: İlçe özet istatistik ─────────────────────────────────────────────

milliEmlakRoutes.get("/ozet/:il/:ilce", async (c) => {
  const il = normalizeYerAdi(c.req.param("il"));
  const ilce = normalizeYerAdi(c.req.param("ilce"));

  if (!il || !ilce) return c.json({ hata: "il ve ilce gerekli" }, 400);

  try {
    const row = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as adet,
        AVG(fiyat_per_m2) as ort_fiyat_per_m2,
        MIN(fiyat_per_m2) as min_fiyat_per_m2,
        MAX(fiyat_per_m2) as max_fiyat_per_m2,
        AVG(m2) as ort_m2,
        MAX(ihale_tarihi) as son_ihale
      FROM milli_emlak_ihale
      WHERE il_norm=? AND ilce_norm=? AND aktif=1 AND fiyat_per_m2 IS NOT NULL
        AND ihale_tarihi > ?
    `).bind(il, ilce, Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).first();

    if (!row || (row.adet as number) === 0) {
      return c.json({ ozet: null, mesaj: "Bu ilçe için ihale kaydı yok" });
    }

    return c.json({ ozet: row }, 200, {
      "Cache-Control": "public, max-age=86400",
    });
  } catch (e) {
    return c.json({ hata: "DB sorgu hatası" }, 500);
  }
});
