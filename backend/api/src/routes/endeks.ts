/**
 * Cadastrum Fiyat Endeksi — /v1/api/endeks
 *
 * Türkiye arsa/tarla fiyat endeksi. D1'deki mahalle_zaman_serisi
 * tablosundan il bazlı ağırlıklı medyan hesaplar; TCMB KFE'den
 * bağımsız, crowdsource + scraper ilan verisine dayalı.
 *
 * Endpoints:
 *   GET /v1/api/endeks
 *     ?il=istanbul          — İl filtresi (opsiyonel, yoksa Türkiye geneli)
 *     ?kategori=arsa        — arsa | tarla | konut (varsayılan: arsa)
 *     ?baslangic=2024-01    — YYYY-MM (varsayılan: 12 ay öncesi)
 *     ?bitis=2025-06        — YYYY-MM (varsayılan: son mevcut ay)
 *
 * Response:
 *   {
 *     il: "istanbul" | null,
 *     kategori: "arsa",
 *     noktalar: [{ yil: 2024, ay: 1, medyan_tl_m2: 18500, endeks: 100.0, ilan_adet: 1240 }, ...]
 *     baz_donem: "2024-01",
 *     son_guncelleme: 1700000000
 *   }
 *
 * Endeks hesabı: MIN_BAZ_ILAN_ADET eşiğini geçen ilk noktayı 100 kabul eder
 * (kronolojik ilk satır değil — düşük hacimli bir ay yanlışlıkla taban
 * olmasın diye), sonrakiler buna göre normalize edilir. Bu sayede farklı
 * iller ve kategoriler karşılaştırılabilir hale gelir.
 *
 * Rate limit: API key gerekmez (public), ancak IP bazlı 30/saat sınırı uygulanır.
 */

import { Hono } from "hono";
import type { Env } from "../index.js";
import { normalizeYerAdi } from "../lib/normalize.js";
import { rateLimitMiddleware } from "../lib/rate-limit.js";

export const endeksRoutes = new Hono<{ Bindings: Env }>();

interface ZamanNoktasi {
  yil: number;
  ay: number;
  medyan: number;
  ilan_adet: number;
}

function donemStr(yil: number, ay: number): string {
  return `${yil}-${String(ay).padStart(2, "0")}`;
}

// Taban dönem (endeks=100) için minimum ilan sayısı. Bunsuz, veri toplamanın
// henüz başladığı/az olduğu bir ay (ör. 16 ilan) kronolojik olarak "ilk satır"
// diye taban alınabiliyordu — sonraki ayların binlerce ilanlık gerçek medyanı
// bu istatistiksel olarak anlamsız küçük örnekleme bölünüp yanıltıcı ("-%93")
// bir endeks üretiyordu. Bkz. gerçek olay: 2026-05 (16 ilan) taban alınmış,
// 2026-06 (882 ilan) endeks=7.2 çıkmıştı — piyasa çökmedi, taban bozuktu.
const MIN_BAZ_ILAN_ADET = 50;

function donemParse(s: string): { yil: number; ay: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  const yil = parseInt(m[1]!, 10);
  const ay  = parseInt(m[2]!, 10);
  if (ay < 1 || ay > 12) return null;
  return { yil, ay };
}

/**
 * GET /v1/api/endeks
 */
endeksRoutes.get("/", rateLimitMiddleware(30, "endeks"), async (c) => {
  const db = c.env.DB;

  // Query params
  const ilRaw    = c.req.query("il") ?? "";
  const kategori = ["arsa", "tarla", "konut"].includes(c.req.query("kategori") ?? "")
    ? (c.req.query("kategori") as string)
    : "arsa";

  const ilNorm = ilRaw.trim() ? normalizeYerAdi(ilRaw.trim()) : null;

  // Tarih aralığı
  const simdi      = new Date();
  const simdiYil   = simdi.getUTCFullYear();
  const simdiAy    = simdi.getUTCMonth() + 1;

  // Varsayılan: 12 ay öncesinden bu aya
  let baslangicYil = simdiYil;
  let baslangicAy  = simdiAy - 11;
  if (baslangicAy <= 0) { baslangicYil -= 1; baslangicAy += 12; }

  let bitisYil = simdiYil;
  let bitisAy  = simdiAy;

  const baslangicParam = c.req.query("baslangic");
  const bitisParam     = c.req.query("bitis");

  if (baslangicParam) {
    const p = donemParse(baslangicParam);
    if (p) { baslangicYil = p.yil; baslangicAy = p.ay; }
  }
  if (bitisParam) {
    const p = donemParse(bitisParam);
    if (p) { bitisYil = p.yil; bitisAy = p.ay; }
  }

  try {
    let rows: ZamanNoktasi[];

    if (ilNorm) {
      // İl bazlı — tüm mahalle/ilçe verilerini ağırlıklı medyan ile birleştir
      const result = await db.prepare(
        `SELECT yil, ay,
                CAST(SUM(medyan * ilan_adet) AS REAL) / NULLIF(SUM(ilan_adet), 0) AS medyan,
                SUM(ilan_adet) AS ilan_adet
         FROM mahalle_zaman_serisi
         WHERE il_norm = ?
           AND kategori = ?
           AND (yil > ? OR (yil = ? AND ay >= ?))
           AND (yil < ? OR (yil = ? AND ay <= ?))
         GROUP BY yil, ay
         ORDER BY yil ASC, ay ASC
         LIMIT 60`,
      ).bind(
        ilNorm, kategori,
        baslangicYil, baslangicYil, baslangicAy,
        bitisYil, bitisYil, bitisAy,
      ).all<ZamanNoktasi>();
      rows = result.results ?? [];
    } else {
      // Türkiye geneli — tüm iller ağırlıklı medyan
      const result = await db.prepare(
        `SELECT yil, ay,
                CAST(SUM(medyan * ilan_adet) AS REAL) / NULLIF(SUM(ilan_adet), 0) AS medyan,
                SUM(ilan_adet) AS ilan_adet
         FROM mahalle_zaman_serisi
         WHERE kategori = ?
           AND (yil > ? OR (yil = ? AND ay >= ?))
           AND (yil < ? OR (yil = ? AND ay <= ?))
         GROUP BY yil, ay
         ORDER BY yil ASC, ay ASC
         LIMIT 60`,
      ).bind(
        kategori,
        baslangicYil, baslangicYil, baslangicAy,
        bitisYil, bitisYil, bitisAy,
      ).all<ZamanNoktasi>();
      rows = result.results ?? [];
    }

    if (rows.length === 0) {
      return c.json({
        il: ilNorm,
        kategori,
        noktalar: [],
        baz_donem: null,
        son_guncelleme: Math.floor(Date.now() / 1000),
      });
    }

    // Endeks hesabı — taban dönem olarak MIN_BAZ_ILAN_ADET eşiğini geçen ilk
    // noktayı kabul et (kronolojik ilk satır değil — bkz. yukarıdaki not).
    // Hiçbir satır eşiği geçmiyorsa (tüm dönem düşük hacimli) yine de en
    // yüksek hacimli satırı taban al — boş/null endeks dönmektense en az kötü seçenek.
    const bazSatir =
      rows.find((r) => r.ilan_adet >= MIN_BAZ_ILAN_ADET) ??
      rows.reduce((en, r) => (r.ilan_adet > en.ilan_adet ? r : en), rows[0]!);
    const bazMedyan = bazSatir.medyan;
    const noktalar = rows.map((r) => ({
      donem: donemStr(r.yil, r.ay),
      yil: r.yil,
      ay: r.ay,
      medyan_tl_m2: Math.round(r.medyan),
      endeks: bazMedyan > 0 ? Math.round((r.medyan / bazMedyan) * 1000) / 10 : null,
      ilan_adet: r.ilan_adet,
    }));

    return c.json(
      {
        il: ilNorm,
        kategori,
        noktalar,
        baz_donem: donemStr(bazSatir.yil, bazSatir.ay),
        son_guncelleme: Math.floor(Date.now() / 1000),
      },
      200,
      { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
    );
  } catch (err) {
    console.error("[endeks]", err);
    return c.json({ error: "Sunucu hatası" }, 500);
  }
});
/**
 * Aylık fiyat endeksi hesaplama servisi (Cron job tarafından çağrılır)
 */
export async function endeksHesapla(db: D1Database): Promise<{ hesaplanan: number }> {
  const simdi = new Date();
  const yil = simdi.getUTCFullYear();
  const ay = simdi.getUTCMonth() + 1;

  try {
    // 1. İlanlar tablosundan son 30 günün medyanlarını grupla
    const res = await db.prepare(`
      INSERT OR REPLACE INTO fiyat_endeksi (il_norm, kategori, yil, ay, medyan, adet, hesaplandi)
      SELECT
        COALESCE(il_norm, 'turkiye_geneli') as il_norm,
        COALESCE(kategori, 'arsa') as kategori,
        ? as yil,
        ? as ay,
        CAST(AVG(fiyat_per_m2) as INTEGER) as medyan,
        COUNT(*) as adet,
        unixepoch()
      FROM ilanlar
      WHERE
        fiyat_per_m2 > 0
        AND fiyat_per_m2 < 10000000
        AND il_norm IS NOT NULL
      GROUP BY il_norm, kategori
      HAVING COUNT(*) >= 1
    `).bind(yil, ay).run();

    // 2. Baz endeks güncelle (Ocak 2024 = 100 veya ilk kayıt)
    await db.prepare(`
      UPDATE fiyat_endeksi
      SET baz_endeks = ROUND(
        (medyan * 100.0) / COALESCE(
          (SELECT b.medyan FROM fiyat_endeksi b
           WHERE b.il_norm = fiyat_endeksi.il_norm AND b.kategori = fiyat_endeksi.kategori
           AND b.yil = 2024 AND b.ay = 1), medyan
        ), 1
      )
      WHERE yil = ? AND ay = ?
    `).bind(yil, ay).run();

    return { hesaplanan: res.meta.changes ?? 0 };
  } catch (err) {
    console.error("[endeksHesapla] Hata:", err);
    return { hesaplanan: 0 };
  }
}

