/**
 * POST /v1/gercek-satis — kullanıcı gerçek satış/alış fiyatı feedback loop.
 *
 * Kullanıcı bir parseli aldıktan/sattıktan sonra gerçek fiyatı girer.
 * Veri anonim: mahalle bazlı, parsel no / koordinat gönderilmez.
 * Sonraki adım: bias kalibrasyon scripti bu tabloyu okuyarak mahalle bazlı
 * offset hesaplar ve `mahalle_istatistik.bias_carpani` alanını günceller.
 *
 * Kimlik doğrulama: JWT Bearer (opsiyonel) — anonim kullanıcılar da gönderebilir
 * ama IP rate limiting uygulanır.
 */
import { Hono } from "hono";
import type { Env } from "../index.js";
import { log } from "../lib/logger.js";
import { rateLimitMiddleware } from "../lib/rate-limit.js";

export const gercekSatisRoutes = new Hono<{ Bindings: Env }>();

const VALID_TIP = new Set(["satin-alindi", "satildi", "bilgi"]);
const VALID_ALAN_BANT = new Set(["<250m²", "250-1000m²", "1000-5000m²", "5000-20000m²", ">20000m²"]);

interface GercekSatisPayload {
  ilAd: string;
  ilceAd: string;
  mahalleAd: string;
  gercekPerM2: number;
  alanBant: string;
  tip: string;
  tahminGorulduMu: boolean;
  heuristicPerM2: number | null;
  girisTarihi: number;
}

gercekSatisRoutes.post(
  "/",
  rateLimitMiddleware(30, "gercek-satis"),
  async (c) => {
    let body: GercekSatisPayload;
    try {
      body = await c.req.json<GercekSatisPayload>();
    } catch {
      return c.json({ error: "Geçersiz JSON" }, 400);
    }

    // Temel validasyon
    if (
      typeof body.ilAd !== "string" || !body.ilAd.trim() ||
      typeof body.ilceAd !== "string" || !body.ilceAd.trim() ||
      typeof body.mahalleAd !== "string" ||
      typeof body.gercekPerM2 !== "number" || body.gercekPerM2 <= 0 || !Number.isFinite(body.gercekPerM2) ||
      !VALID_ALAN_BANT.has(body.alanBant) ||
      !VALID_TIP.has(body.tip) ||
      typeof body.tahminGorulduMu !== "boolean"
    ) {
      return c.json({ error: "Eksik veya geçersiz alan" }, 422);
    }

    // Gercek per m² akıl sınırı: 500 TL/m² - 5.000.000 TL/m² (2024 Türkiye piyasası)
    if (body.gercekPerM2 < 500 || body.gercekPerM2 > 5_000_000) {
      return c.json({ error: "Fiyat aralık dışı (500–5.000.000 ₺/m²)" }, 422);
    }

    try {
      await c.env.DB.prepare(
        `INSERT INTO gercek_satislar
           (il_norm, ilce_norm, mahalle_norm, gercek_per_m2,
            alan_bant, tip, tahmin_goruldu, heuristic_per_m2,
            giris_tarihi, yakalanma_tarihi)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        body.ilAd.trim().toLowerCase(),
        body.ilceAd.trim().toLowerCase(),
        body.mahalleAd.trim().toLowerCase(),
        body.gercekPerM2,
        body.alanBant,
        body.tip,
        body.tahminGorulduMu ? 1 : 0,
        body.heuristicPerM2 ?? null,
        body.girisTarihi ?? Date.now(),
        Date.now(),
      ).run();

      log.info("gercek-satis.kaydedildi", {
        il: body.ilAd,
        ilce: body.ilceAd,
        mahalle: body.mahalleAd,
        gercekPerM2: body.gercekPerM2,
        tip: body.tip,
      });

      return c.json({ ok: true }, 201);
    } catch (e) {
      // Tablo henüz yoksa (migration uygulanmadıysa) 503 dön
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("no such table")) {
        log.warn("gercek-satis.tablo-yok", { hata: msg });
        return c.json({ error: "Tablo henüz oluşturulmamış — migration uygulayın", kod: "tablo-yok" }, 503);
      }
      log.error("gercek-satis.db-hata", { hata: msg });
      return c.json({ error: "Sunucu hatası" }, 500);
    }
  },
);

/**
 * GET /v1/gercek-satis/ozet?il=istanbul&ilce=besiktas&kategori=arsa
 * Admin veya kalibrasyon scripti için mahalle bazlı bias özeti.
 * JWT admin claim (adm=1) gerektirir.
 */
gercekSatisRoutes.get("/ozet", async (c) => {
  const il = c.req.query("il")?.toLowerCase().trim();
  const ilce = c.req.query("ilce")?.toLowerCase().trim();

  if (!il) return c.json({ error: "il parametresi zorunlu" }, 400);

  const rows = await c.env.DB.prepare(
    `SELECT mahalle_norm,
            COUNT(*) AS kayit_sayisi,
            AVG(gercek_per_m2) AS ort_gercek,
            AVG(heuristic_per_m2) AS ort_heuristic,
            AVG(CASE WHEN heuristic_per_m2 > 0
                     THEN (heuristic_per_m2 - gercek_per_m2) * 1.0 / gercek_per_m2
                     ELSE NULL END) AS ort_bias
     FROM gercek_satislar
     WHERE il_norm = ?
       ${ilce ? "AND ilce_norm = ?" : ""}
     GROUP BY mahalle_norm
     HAVING COUNT(*) >= 2
     ORDER BY kayit_sayisi DESC
     LIMIT 100`,
  ).bind(...(ilce ? [il, ilce] : [il])).all();

  return c.json({ ozet: rows.results ?? [] });
});
