/**
 * GET /v1/fiyat/mahalle/:il/:ilce/:mahalle?kategori=arsa
 * GET /v1/fiyat/ilce/:il/:ilce?kategori=arsa
 * GET /v1/fiyat/il/:il?kategori=arsa
 *
 * Yanıtları KURAN mantık lib/fiyat-yanit.ts'de — statik dışa aktarma
 * (routes/statik.ts) aynı fonksiyonları kullanıyor; iki üretici ayrışamaz.
 *
 * SIRALAMA NOTU (2026-09-13): `ORDER BY ilan_adet DESC LIMIT 50` gibi
 * sıralamalara ikincil anahtar eklendi. Eşit değerlerde SQLite sırayı
 * garanti etmiyordu; statik dosya ile canlı yanıtın AYNI 50 satırı seçmesi
 * için sıra belirli olmalı. Davranış farkı yalnızca eşitliklerin sırası.
 */
import { Hono } from "hono";
import type { Env } from "../index.js";
import { olculmeyenKategoriYaniti } from "../lib/kategori-olcum.js";
import { normalizeYerAdi } from "../lib/normalize.js";
import { d1WithTimeout, isD1Timeout } from "../lib/db-timeout.js";
import {
  type Yanit,
  type MahalleIstatistik,
  type ZamanSatiri,
  type MahalleAi,
  type IlceIstatistik,
  type MahalleOzetSatiri,
  type AiMahalleSatiri,
  type IlIstatistik,
  type IlceOzetSatiri,
  type AiIlceSatiri,
  type IlceOzetTamSatiri,
  mahalleYaniti,
  mahalleIstatistikYeterli,
  ilceYaniti,
  ilceAiGerekli,
  ilYaniti,
  ilAiGerekli,
  topluIlceOzetYaniti,
  trendYaniti,
} from "../lib/fiyat-yanit.js";

export const fiyatRoutes = new Hono<{ Bindings: Env }>();

export const VALID_KATEGORI = new Set(["arsa", "tarla", "konut", "bahce", "bag", "zeytinlik"]);

// D1 timeout'ta sunucu tarafında "son bilinen iyi yanıt" yok (cache-read path'i yok);
// pratik "degraded" cevap 503 + Retry-After.
function d1TimeoutYaniti(c: import("hono").Context) {
  c.header("Retry-After", "5");
  return c.json({ error: "Sunucu şu an yoğun, birkaç saniye sonra tekrar deneyin" }, 503);
}

function yanitGonder(c: import("hono").Context, y: Yanit) {
  if (y.onbellek) c.header("Cache-Control", y.onbellek);
  return c.json(y.govde, y.durum);
}

// Mahalle bazlı sorgu
fiyatRoutes.get("/mahalle/:il/:ilce/:mahalle", async (c) => {
  const il = normalizeYerAdi(c.req.param("il"));
  const ilce = normalizeYerAdi(c.req.param("ilce"));
  const mahalle = normalizeYerAdi(c.req.param("mahalle"));
  const kategori = c.req.query("kategori") ?? "arsa";

  if (!VALID_KATEGORI.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 400);
  }
  // G4a — ölçülemeyen kategori (konut) sayı değil gerekçe döner; D1'e
  // dokunmadan önce. Gerekçe: lib/kategori-olcum.ts
  const olcumsuz = olculmeyenKategoriYaniti(c, kategori);
  if (olcumsuz) return olcumsuz;

  // Gerçek istatistik + trend paralel. AI fallback BURADA DEĞİL — eskiden her
  // istekte koşup gerçek istatistik varken bile sonucu atılıyordu.
  const sonuc = await d1WithTimeout(Promise.all([
    c.env.DB.prepare(
      `SELECT medyan, q1, q3, ortalama, ilan_adet, son_guncelleme
       FROM mahalle_istatistik
       WHERE il_norm = ? AND ilce_norm = ? AND mahalle_norm = ? AND kategori = ?`,
    ).bind(il, ilce, mahalle, kategori).first<MahalleIstatistik>(),
    c.env.DB.prepare(
      `SELECT yil, ay, medyan, ilan_adet
       FROM mahalle_zaman_serisi
       WHERE il_norm = ? AND ilce_norm = ? AND mahalle_norm = ? AND kategori = ?
       ORDER BY yil DESC, ay DESC LIMIT 6`,
    ).bind(il, ilce, mahalle, kategori).all<ZamanSatiri>(),
  ]), 4_000);
  if (isD1Timeout(sonuc)) return d1TimeoutYaniti(c);
  const [istatistik, trend] = sonuc;

  // AI yalnızca gerçek ölçüm yokken sorgulanır.
  const ai = mahalleIstatistikYeterli(istatistik)
    ? null
    : await c.env.DB.prepare(
      `SELECT tlm2 AS medyan, guven, kaynak, yakalandi AS son_guncelleme
       FROM mahalle_baseline_ai
       WHERE il_norm = ? AND ilce_norm = ? AND mahalle_norm = ? AND kategori = ?`,
    ).bind(il, ilce, mahalle, kategori).first<MahalleAi>();

  return yanitGonder(c, mahalleYaniti(istatistik, trend.results ?? [], ai));
});

// İlçe bazlı sorgu — gerçek ilan istatistiği yoksa AI baseline'dan hesapla
fiyatRoutes.get("/ilce/:il/:ilce", async (c) => {
  const il = normalizeYerAdi(c.req.param("il"));
  const ilce = normalizeYerAdi(c.req.param("ilce"));
  const kategori = c.req.query("kategori") ?? "arsa";

  if (!VALID_KATEGORI.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 400);
  }
  const olcumsuz = olculmeyenKategoriYaniti(c, kategori);
  if (olcumsuz) return olcumsuz;

  const ilceSonuc = await d1WithTimeout(Promise.all([
    c.env.DB.prepare(
      `SELECT medyan, q1, q3, ilan_adet, son_guncelleme
       FROM ilce_istatistik
       WHERE il_norm = ? AND ilce_norm = ? AND kategori = ?`,
    ).bind(il, ilce, kategori).first<IlceIstatistik>(),
    c.env.DB.prepare(
      `SELECT mahalle_norm, medyan, ilan_adet
       FROM mahalle_istatistik
       WHERE il_norm = ? AND ilce_norm = ? AND kategori = ?
       ORDER BY ilan_adet DESC, mahalle_norm ASC LIMIT 50`,
    ).bind(il, ilce, kategori).all<MahalleOzetSatiri>(),
  ]), 4_000);
  if (isD1Timeout(ilceSonuc)) return d1TimeoutYaniti(c);
  const [ilceIstatistik, mahalleSonuc] = ilceSonuc;
  const mahalleler = mahalleSonuc.results ?? [];

  const ai = ilceAiGerekli(ilceIstatistik, mahalleler)
    ? (await c.env.DB.prepare(
      `SELECT mahalle_norm, tlm2 AS medyan
       FROM mahalle_baseline_ai
       WHERE il_norm = ? AND ilce_norm = ? AND kategori = ?
       ORDER BY tlm2 DESC, mahalle_norm ASC LIMIT 50`,
    ).bind(il, ilce, kategori).all<AiMahalleSatiri>()).results ?? []
    : null;

  return yanitGonder(c, ilceYaniti(ilceIstatistik, mahalleler, ai, Date.now()));
});

// İl bazlı sorgu
fiyatRoutes.get("/il/:il", async (c) => {
  const il = normalizeYerAdi(c.req.param("il"));
  const kategori = c.req.query("kategori") ?? "arsa";

  if (!VALID_KATEGORI.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 400);
  }
  const olcumsuz = olculmeyenKategoriYaniti(c, kategori);
  if (olcumsuz) return olcumsuz;

  const ilSonuc = await d1WithTimeout(Promise.all([
    c.env.DB.prepare(
      `SELECT medyan, ilan_adet, son_guncelleme
       FROM il_istatistik WHERE il_norm = ? AND kategori = ?`,
    ).bind(il, kategori).first<IlIstatistik>(),
    c.env.DB.prepare(
      `SELECT ilce_norm, medyan, ilan_adet
       FROM ilce_istatistik
       WHERE il_norm = ? AND kategori = ?
       ORDER BY medyan DESC, ilce_norm ASC`,
    ).bind(il, kategori).all<IlceOzetSatiri>(),
  ]), 4_000);
  if (isD1Timeout(ilSonuc)) return d1TimeoutYaniti(c);
  const [ilIstatistik, ilceSonuc] = ilSonuc;
  const ilceler = ilceSonuc.results ?? [];

  const ai = ilAiGerekli(ilIstatistik, ilceler)
    ? (await c.env.DB.prepare(
      `SELECT ilce_norm, AVG(tlm2) AS medyan, COUNT(*) AS baseline_satir_sayisi
       FROM mahalle_baseline_ai
       WHERE il_norm = ? AND kategori = ?
       GROUP BY ilce_norm
       ORDER BY medyan DESC, ilce_norm ASC`,
    ).bind(il, kategori).all<AiIlceSatiri>()).results ?? []
    : null;

  return yanitGonder(c, ilYaniti(ilIstatistik, ilceler, ai, Date.now()));
});

// ── Toplu il fiyat özeti — harita choropleth için ──────────────────────────
/**
 * GET /v1/fiyat/toplu-ozet?kategori=arsa
 *
 * Tüm illerin medyan TL/m² değerlerini tek sorguda döndürür.
 */
fiyatRoutes.get("/toplu-ozet", async (c) => {
  const kategori = c.req.query("kategori") ?? "arsa";
  if (!VALID_KATEGORI.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 400);
  }
  const olcumsuz = olculmeyenKategoriYaniti(c, kategori);
  if (olcumsuz) return olcumsuz;

  // Tek sorgu, ~162 satırlık önden hesaplanmış tablo.
  //
  // ESKİDEN: `il_istatistik` taraması + `AVG(tlm2) FROM mahalle_baseline_ai
  // GROUP BY il_norm` — ikincisi 188.697 satırlık TAM TARAMA idi ve her
  // cache-miss'te koşuyordu. Ağır agregasyon artık günlük cron'da bir kez
  // yapılıp `il_fiyat_ozet`e yazılıyor (migration 0032).
  const ozetRows = await c.env.DB.prepare(
    `SELECT il_norm, medyan_ilan, adet_ilan, medyan_ai, mahalle_ai_adet
     FROM il_fiyat_ozet
     WHERE kategori = ?
     ORDER BY il_norm`,
  ).bind(kategori).all<{
    il_norm: string;
    medyan_ilan: number | null;
    adet_ilan: number;
    medyan_ai: number | null;
    mahalle_ai_adet: number;
  }>();

  const sonuc: Array<{
    il_norm: string;
    medyan: number;
    ilan_adet: number;
    baseline_satir_sayisi: number;
    kaynak: "ilan" | "ai-baseline";
  }> = [];

  // Merge: ilan verisi varsa önce o (≥5 ilan), yoksa AI baseline.
  //
  // AI satırlarında `ilan_adet` 0 — çünkü ölçülmüş ilan yok. Eskiden buraya
  // `mahalle_baseline_ai` SATIR SAYISI yazılıyordu ve uzantı haritası onu
  // "650 ilan" diye gösteriyordu; gerçekte o ilde sıfır gözlem vardı.
  for (const r of (ozetRows.results ?? [])) {
    if (r.medyan_ilan != null && r.adet_ilan >= 5) {
      sonuc.push({
        il_norm: r.il_norm,
        medyan: Math.round(r.medyan_ilan),
        ilan_adet: r.adet_ilan,
        baseline_satir_sayisi: 0,
        kaynak: "ilan",
      });
    } else if (r.medyan_ai != null && r.medyan_ai > 0) {
      sonuc.push({
        il_norm: r.il_norm,
        medyan: Math.round(r.medyan_ai),
        ilan_adet: 0,
        baseline_satir_sayisi: r.mahalle_ai_adet,
        kaynak: "ai-baseline",
      });
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
fiyatRoutes.get("/toplu-ilce-ozet/:il", async (c) => {
  const il      = normalizeYerAdi(c.req.param("il"));
  const kategori = c.req.query("kategori") ?? "arsa";

  if (!VALID_KATEGORI.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 400);
  }
  const olcumsuz = olculmeyenKategoriYaniti(c, kategori);
  if (olcumsuz) return olcumsuz;

  const ilceRows = await c.env.DB.prepare(
    `SELECT ilce_norm, medyan, ilan_adet, son_guncelleme
     FROM ilce_istatistik
     WHERE il_norm = ? AND kategori = ?
     ORDER BY medyan DESC, ilce_norm ASC`,
  ).bind(il, kategori).all<IlceOzetTamSatiri>();

  const mahalleCountRows = await c.env.DB.prepare(
    `SELECT ilce_norm, COUNT(*) AS mahalle_sayi
     FROM mahalle_istatistik
     WHERE il_norm = ? AND kategori = ?
     GROUP BY ilce_norm`,
  ).bind(il, kategori).all<{ ilce_norm: string; mahalle_sayi: number }>();

  const sayilar = new Map((mahalleCountRows.results ?? []).map((r) => [r.ilce_norm, r.mahalle_sayi]));
  return yanitGonder(c, topluIlceOzetYaniti(il, kategori, ilceRows.results ?? [], sayilar));
});

// ── Trend + Projeksiyon ─────────────────────────────────────────────────────
/**
 * GET /v1/fiyat/trend/:il/:ilce/:mahalle?kategori=arsa
 *
 * Son 18 aylık medyan + 6 aylık lineer regresyon projeksiyonu.
 */
fiyatRoutes.get("/trend/:il/:ilce/:mahalle", async (c) => {
  const il      = normalizeYerAdi(c.req.param("il"));
  const ilce    = normalizeYerAdi(c.req.param("ilce"));
  const mahalle = normalizeYerAdi(c.req.param("mahalle"));
  const kategori = c.req.query("kategori") ?? "arsa";

  if (!VALID_KATEGORI.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 400);
  }
  const olcumsuz = olculmeyenKategoriYaniti(c, kategori);
  if (olcumsuz) return olcumsuz;

  const mahalleRows = (await c.env.DB.prepare(
    `SELECT yil, ay, medyan, ilan_adet
     FROM mahalle_zaman_serisi
     WHERE il_norm = ? AND ilce_norm = ? AND mahalle_norm = ? AND kategori = ?
     ORDER BY yil ASC, ay ASC
     LIMIT 18`,
  ).bind(il, ilce, mahalle, kategori).all<ZamanSatiri>()).results ?? [];

  // W1c: mahalle verisi yetersizse ilçe, o da yetersizse il seviyesi.
  // Sorgular tembel — yeterli mahalle verisi varken hiç atılmıyor.
  const ilceRows = mahalleRows.length < 3 && ilce
    ? (await c.env.DB.prepare(
      `SELECT yil, ay,
              ROUND(SUM(medyan * ilan_adet) / SUM(ilan_adet)) AS medyan,
              SUM(ilan_adet) AS ilan_adet
       FROM mahalle_zaman_serisi
       WHERE il_norm = ? AND ilce_norm = ? AND kategori = ?
       GROUP BY yil, ay
       ORDER BY yil ASC, ay ASC
       LIMIT 18`,
    ).bind(il, ilce, kategori).all<ZamanSatiri>()).results ?? []
    : null;

  const ilceYeterli = (ilceRows?.length ?? 0) >= 3;
  const ilRows = mahalleRows.length < 3 && !ilceYeterli && il
    ? (await c.env.DB.prepare(
      `SELECT yil, ay,
              ROUND(SUM(medyan * ilan_adet) / SUM(ilan_adet)) AS medyan,
              SUM(ilan_adet) AS ilan_adet
       FROM mahalle_zaman_serisi
       WHERE il_norm = ? AND kategori = ?
       GROUP BY yil, ay
       ORDER BY yil ASC, ay ASC
       LIMIT 18`,
    ).bind(il, kategori).all<ZamanSatiri>()).results ?? []
    : null;

  return yanitGonder(c, trendYaniti(mahalleRows, ilceRows, ilRows));
});
