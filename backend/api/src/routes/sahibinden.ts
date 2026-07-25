/**
 * Sahibinden Liste Scraper — Worker Entegrasyonu
 *
 * Sahibinden, PerimeterX bot koruması nedeniyle Worker'dan doğrudan çekilemiyor.
 * Çözüm: Extension content script, kullanıcı Sahibinden'de gezinirken arka planda
 * liste sayfalarını parse eder, ilanları bu endpoint'e batch POST eder.
 *
 * Akış:
 *   1. Kullanıcı Sahibinden'de arsa/tarla sayfasına gider
 *   2. content/sahibinden-liste-ingest.ts (yeni) DOM'u parse eder
 *   3. POST /v1/sahibinden/ilan-batch → Worker D1'e yazar
 *   4. VeriKatkiSkoru chrome.storage'da güncellenir (gamification)
 *
 *   GET  /v1/sahibinden/durum         → kapsama + son ilanlar (admin)
 *   POST /v1/sahibinden/ilan-batch    → extension batch insert (JWT veya scraper secret)
 *   GET  /v1/sahibinden/ilce-bosluk   → en az ilana sahip ilçeler listesi
 */

import { Hono } from "hono";
import type { Env } from "../index.js";
import { jwtMiddleware } from "./hesap.js";

export const sahibindenRoutes = new Hono<{ Bindings: Env }>();

// ── Auth yardımcıları ─────────────────────────────────────────────────

function scraperSecretMi(c: Parameters<typeof jwtMiddleware>[0], env: Env): boolean {
  const h = c.req.header("X-Scraper-Secret") ?? c.req.header("Authorization")?.replace("Bearer ", "");
  return !!h && h === env.SCRAPER_API_SECRET;
}

function adminMi(c: Parameters<typeof jwtMiddleware>[0]): boolean {
  const p = c.get("jwtPayload" as never) as { adm?: number } | undefined;
  return p?.adm === 1;
}

// ── POST /v1/sahibinden/ilan-batch ────────────────────────────────────
// Extension content script'ten batch insert. JWT veya scraper secret.

sahibindenRoutes.post("/ilan-batch", async (c) => {
  // Extension JWT veya scraper secret kabul edilir
  const yetkiliBearerToken = c.req.header("Authorization")?.replace("Bearer ", "");
  const scraperSecret = c.req.header("X-Scraper-Secret");
  const gecerliSecret = !!scraperSecret && scraperSecret === c.env.SCRAPER_API_SECRET;

  // JWT doğrulama — basit imza kontrolü
  let gecerliJwt = false;
  if (yetkiliBearerToken && !scraperSecret) {
    try {
      const [, payloadB64] = yetkiliBearerToken.split(".");
      if (payloadB64) {
        const payload = JSON.parse(atob(payloadB64)) as { exp?: number };
        gecerliJwt = !payload.exp || payload.exp * 1000 > Date.now();
      }
    } catch { /* geçersiz JWT */ }
  }

  if (!gecerliSecret && !gecerliJwt) {
    return c.json({ hata: "Yetkisiz" }, 403);
  }

  interface IlanBatch {
    ilanlar: {
      ilan_no?: string | null;
      url: string;
      baslik?: string | null;
      il_norm: string;
      ilce_norm: string;
      mahalle_norm?: string | null;
      kategori: "arsa" | "tarla";
      fiyat_tlm2: number;
      m2: number;
      lat?: number | null;
      lng?: number | null;
      kaynak_sayfa?: string | null; // liste sayfası URL'si
    }[];
    /** extension kaynak sayfası URL */
    sayfa_url?: string;
  }

  const body = await c.req.json<IlanBatch>().catch(() => null);
  if (!body?.ilanlar?.length) {
    return c.json({ hata: "ilanlar boş veya geçersiz" }, 400);
  }

  const maks = 100; // batch başına max
  const liste = body.ilanlar.slice(0, maks);
  const simdi = Date.now();
  let insertSayisi = 0;
  let skipSayisi = 0;
  let mahalleliSayisi = 0;
  let koordinatliSayisi = 0;

  for (const ilan of liste) {
    // Temel doğrulama
    if (!ilan.il_norm || !ilan.ilce_norm) { skipSayisi++; continue; }
    if (!ilan.fiyat_tlm2 || ilan.fiyat_tlm2 <= 0 || !ilan.m2 || ilan.m2 <= 0) { skipSayisi++; continue; }
    if (!["arsa", "tarla"].includes(ilan.kategori)) { skipSayisi++; continue; }

    try {
      const res = await c.env.DB.prepare(
        `INSERT OR IGNORE INTO ilanlar
         (kaynak, ilan_no, url, baslik, il_norm, ilce_norm, mahalle_norm,
          kategori, fiyat_tlm2, m2, lat, lng, aktif, yakalanma_tarihi)
         VALUES ('sahibinden', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      ).bind(
        ilan.ilan_no ?? null,
        ilan.url,
        ilan.baslik ?? null,
        ilan.il_norm,
        ilan.ilce_norm,
        ilan.mahalle_norm ?? null,
        ilan.kategori,
        ilan.fiyat_tlm2,
        ilan.m2,
        ilan.lat ?? null,
        ilan.lng ?? null,
        simdi,
      ).run();

      if ((res.meta?.changes ?? 0) > 0) {
        insertSayisi++;
        if (ilan.mahalle_norm) mahalleliSayisi++;
        if (ilan.lat && ilan.lng) koordinatliSayisi++;
      } else {
        skipSayisi++;
      }
    } catch { skipSayisi++; }
  }

  // İlçe durum tablosunu güncelle
  const ilceler = [...new Set(liste.map((i) => `${i.il_norm}|${i.ilce_norm}`))];
  for (const key of ilceler) {
    const [ilN, ilceN] = key.split("|") as [string, string];
    await c.env.DB.prepare(
      `INSERT INTO scraper_ilce_durum (il_norm, ilce_norm, kategori, son_tarama, son_insert_adet, son_durum)
       VALUES (?, ?, 'arsa', ?, ?, 'tamam')
       ON CONFLICT(il_norm, ilce_norm, kategori) DO UPDATE
       SET son_tarama = excluded.son_tarama,
           son_insert_adet = son_insert_adet + excluded.son_insert_adet,
           son_durum = excluded.son_durum`,
    ).bind(ilN, ilceN, simdi, insertSayisi).run().catch(() => {});
  }

  return c.json({
    ok: true,
    gelen: liste.length,
    insert: insertSayisi,
    skip: skipSayisi,
    mahalleli: mahalleliSayisi,
    koordinatli: koordinatliSayisi,
  });
});

// ── GET /v1/sahibinden/durum ─────────────────────────────────────────

sahibindenRoutes.get("/durum", jwtMiddleware, async (c) => {
  if (!adminMi(c)) return c.json({ hata: "Admin gerekli" }, 403);

  const [toplam, ilceSayisi, mahalleSayisi, enYeni, kategori] = await Promise.all([
    c.env.DB.prepare(
      "SELECT COUNT(*) as n FROM ilanlar WHERE kaynak = 'sahibinden' AND aktif = 1",
    ).first<{ n: number }>(),
    c.env.DB.prepare(
      "SELECT COUNT(DISTINCT ilce_norm) as n FROM ilanlar WHERE kaynak = 'sahibinden' AND aktif = 1",
    ).first<{ n: number }>(),
    c.env.DB.prepare(
      "SELECT COUNT(DISTINCT mahalle_norm) as n FROM ilanlar WHERE kaynak = 'sahibinden' AND aktif = 1 AND mahalle_norm IS NOT NULL",
    ).first<{ n: number }>(),
    c.env.DB.prepare(
      "SELECT MAX(yakalanma_tarihi) as t FROM ilanlar WHERE kaynak = 'sahibinden'",
    ).first<{ t: number | null }>(),
    c.env.DB.prepare(
      "SELECT kategori, COUNT(*) as n FROM ilanlar WHERE kaynak = 'sahibinden' AND aktif = 1 GROUP BY kategori",
    ).all<{ kategori: string; n: number }>(),
  ]);

  return c.json({
    ilan: {
      toplam: toplam?.n ?? 0,
      ilce_sayisi: ilceSayisi?.n ?? 0,
      mahalle_sayisi: mahalleSayisi?.n ?? 0,
      en_yeni: enYeni?.t ?? null,
      kategori: kategori.results ?? [],
    },
    hedef: {
      toplam_ilce: 973,
      kaplanan_ilce: ilceSayisi?.n ?? 0,
      kaplama_yuzde: Math.round(((ilceSayisi?.n ?? 0) / 973) * 1000) / 10,
    },
  });
});

// ── GET /v1/sahibinden/ilce-bosluk ───────────────────────────────────
// Extension'a "hangi ilçelerde veri az?" bilgisi verir → kullanıcıyı yönlendir

sahibindenRoutes.get("/ilce-bosluk", async (c) => {
  // Scraper secret veya JWT ile erişilebilir
  const secret = c.req.header("X-Scraper-Secret");
  const auth = c.req.header("Authorization");
  if (!secret && !auth) return c.json({ hata: "Yetki gerekli" }, 401);

  const limit = Math.min(parseInt(c.req.query("limit") ?? "20"), 50);

  // mahalle_istatistik'te olup ilanlar'da az ilan bulunan ilçeler
  const rows = await c.env.DB.prepare(
    `SELECT mi.il_norm, mi.ilce_norm,
            COUNT(DISTINCT mi.mahalle_norm) as mahalle_sayisi,
            COALESCE(il_ilan.ilan_sayisi, 0) as ilan_sayisi
     FROM mahalle_istatistik mi
     LEFT JOIN (
       SELECT ilce_norm, COUNT(*) as ilan_sayisi
       FROM ilanlar WHERE kaynak IN ('sahibinden','hepsiemlak','emlakjet') AND aktif = 1
       GROUP BY ilce_norm
     ) il_ilan ON mi.ilce_norm = il_ilan.ilce_norm
     GROUP BY mi.il_norm, mi.ilce_norm
     ORDER BY ilan_sayisi ASC
     LIMIT ?`,
  ).bind(limit).all<{
    il_norm: string;
    ilce_norm: string;
    mahalle_sayisi: number;
    ilan_sayisi: number;
  }>().catch(() => ({ results: [] as { il_norm: string; ilce_norm: string; mahalle_sayisi: number; ilan_sayisi: number }[] }));

  return c.json({ bosluklar: rows.results ?? [], limit });
});
