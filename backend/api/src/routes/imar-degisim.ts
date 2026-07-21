/**
 * İmar Değişim Sinyali Route — Faz C1/C2
 *
 * POST /v1/imar-degisim/sinyal
 *   Proxy sinyallerden imar değişikliği olasılığı hesapla.
 *   Resmi plan hükmü değildir.
 */

import { Hono } from "hono";
import type { Env } from "../index.js";
import { imarDegisimHesapla, type ImarDegisimGirdi } from "../lib/imar-degisim-sinyal.js";

export const imarDegisimRoutes = new Hono<{ Bindings: Env }>();

interface SinyalIstek {
  il: string;
  ilce: string;
  mahalle?: string;
  // Opsiyonel girdi sinyalleri
  gelisim_skoru?: number;
  tkgm_satis_yogunlugu?: number;
  komsu_emsal_degisim_yuzde?: number;
  cdp_mesafe_km?: number;
  imar_tipi?: string;
  emsal?: number;
  // Koordinat — bölgesel trend için
  lat?: number;
  lng?: number;
}

function trNorm(s: string): string {
  return s.trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "");
}

imarDegisimRoutes.post("/sinyal", async (c) => {
  const body = await c.req.json<SinyalIstek>().catch(() => null);
  if (!body?.il || !body?.ilce) {
    return c.json({ error: "il ve ilce zorunlu" }, 400);
  }

  const ilNorm   = trNorm(body.il);
  const ilceNorm = trNorm(body.ilce);

  // Bölgesel fiyat trendi — D1'den çek
  let bolgeselTrendYuzde: number | null = null;
  try {
    const trendRow = await c.env.DB.prepare(`
      SELECT
        AVG(CASE WHEN (yil * 12 + ay) >= (strftime('%Y','now') * 12 + strftime('%m','now') - 3)
                 THEN medyan END) AS son3_ort,
        AVG(CASE WHEN (yil * 12 + ay) < (strftime('%Y','now') * 12 + strftime('%m','now') - 3)
                      AND (yil * 12 + ay) >= (strftime('%Y','now') * 12 + strftime('%m','now') - 6)
                 THEN medyan END) AS once3_ort
      FROM mahalle_zaman_serisi
      WHERE il_norm = ? AND ilce_norm = ? AND kategori = 'arsa'
    `).bind(ilNorm, ilceNorm).first<{ son3_ort: number | null; once3_ort: number | null }>();

    if (trendRow?.son3_ort && trendRow?.once3_ort && trendRow.once3_ort > 0) {
      bolgeselTrendYuzde = Math.round(
        ((trendRow.son3_ort - trendRow.once3_ort) / trendRow.once3_ort) * 1000
      ) / 10;
    }
  } catch { /* D1 sorgusu başarısız — devam et */ }

  // TKGM satış yoğunluğu — tkgm_analiz_ozet'ten ilçe bazlı normalize
  let tkgmSatisYogunlugu: number | null = body.tkgm_satis_yogunlugu ?? null;
  if (tkgmSatisYogunlugu == null) {
    try {
      const tkgmRow = await c.env.DB.prepare(`
        SELECT SUM(toplam_islem) AS toplam
        FROM tkgm_analiz_ozet
        WHERE ilce_kodu IN (
          SELECT DISTINCT ilce_kodu FROM tkgm_analiz_noktalari
          LIMIT 1
        )
      `).first<{ toplam: number | null }>();
      // Normalize: 1000 işlem = 0.10 yoğunluk
      if (tkgmRow?.toplam) {
        tkgmSatisYogunlugu = Math.min(1, tkgmRow.toplam / 10_000);
      }
    } catch { /* ignore */ }
  }

  const girdi: ImarDegisimGirdi = {
    gelisimSkoru:              body.gelisim_skoru ?? null,
    tkgmSatisYogunlugu:        tkgmSatisYogunlugu,
    komsuemsalDegisimYuzde:    body.komsu_emsal_degisim_yuzde ?? null,
    cdpMesafeKm:               body.cdp_mesafe_km ?? null,
    imarTipi:                  body.imar_tipi ?? null,
    emsal:                     body.emsal ?? null,
    bolgeselTrendYuzde:        bolgeselTrendYuzde,
  };

  const sonuc = imarDegisimHesapla(girdi);

  c.header("Cache-Control", "public, s-maxage=3600");
  return c.json({
    ok: true,
    il: ilNorm,
    ilce: ilceNorm,
    mahalle: body.mahalle ? trNorm(body.mahalle) : null,
    bolgesel_trend_yuzde: bolgeselTrendYuzde,
    ...sonuc,
  });
});
