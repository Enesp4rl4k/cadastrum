/**
 * Hepsiemlak Aylık Scraper Cron Yönetimi
 *
 * Hepsiemlak, bot koruması nedeniyle Worker içinde fetch ile çekilemiyor.
 * Strateji: GitHub Actions üzerinde Puppeteer + Stealth ile yerel çalışır,
 * sonuçlar bu endpoint'e POST edilir. Worker sadece takip + tetik sağlar.
 *
 *   GET  /v1/hepsiemlak/durum         → son run durumu + kapsama (admin)
 *   POST /v1/hepsiemlak/run-kayit     → GitHub Actions run sonucunu kayıt (secret key)
 *   POST /v1/hepsiemlak/ilan-ekle     → batch ilan insert (GitHub Actions, secret key)
 *   GET  /v1/hepsiemlak/son-runlar    → son 20 run log (admin)
 *
 * Güvenlik:
 *   - /run-kayit ve /ilan-ekle: SCRAPER_API_SECRET header zorunlu
 *   - /durum ve /son-runlar: Admin JWT zorunlu
 *
 * GitHub Actions cron: her ayın 1'i 04:00 UTC
 * (bkz. .github/workflows/hepsiemlak-aylik.yml)
 */

import { Hono } from "hono";
import type { Env } from "../index.js";
import { jwtMiddleware } from "./hesap.js";

export const hepsiemlakCronRoutes = new Hono<{ Bindings: Env }>();

// ── Kimlik doğrulama yardımcıları ──────────────────────────────────────

function scraperSecretDogrula(c: Parameters<typeof jwtMiddleware>[0], env: Env): boolean {
  const secret = c.req.header("X-Scraper-Secret") ?? c.req.header("Authorization")?.replace("Bearer ", "");
  return !!secret && secret === env.SCRAPER_API_SECRET;
}

function adminMi(c: Parameters<typeof jwtMiddleware>[0]): boolean {
  const payload = c.get("jwtPayload" as never) as { adm?: number } | null | undefined;
  return payload?.adm === 1;
}

// ── GET /v1/hepsiemlak/durum ──────────────────────────────────────────

hepsiemlakCronRoutes.get("/durum", jwtMiddleware, async (c) => {
  if (!adminMi(c)) return c.json({ hata: "Admin gerekli" }, 403);

  const [sonRun, ilanSayisi, ilceSayisi, ilSayisi] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, baslangic, bitis, tetik, islenen_ilce, toplam_insert, durum, son_hata
       FROM hepsiemlak_run ORDER BY baslangic DESC LIMIT 1`,
    ).first<{
      id: number; baslangic: number; bitis: number | null;
      tetik: string; islenen_ilce: number; toplam_insert: number;
      durum: string; son_hata: string | null;
    }>().catch(() => null),

    c.env.DB.prepare(
      "SELECT COUNT(*) as n FROM ilanlar WHERE kaynak = 'hepsiemlak' AND aktif = 1",
    ).first<{ n: number }>().catch(() => ({ n: 0 })),

    c.env.DB.prepare(
      "SELECT COUNT(DISTINCT ilce_norm) as n FROM ilanlar WHERE kaynak = 'hepsiemlak' AND aktif = 1",
    ).first<{ n: number }>().catch(() => ({ n: 0 })),

    c.env.DB.prepare(
      "SELECT COUNT(DISTINCT il_norm) as n FROM ilanlar WHERE kaynak = 'hepsiemlak' AND aktif = 1",
    ).first<{ n: number }>().catch(() => ({ n: 0 })),
  ]);

  const kategori = await c.env.DB.prepare(
    "SELECT kategori, COUNT(*) as n FROM ilanlar WHERE kaynak = 'hepsiemlak' AND aktif = 1 GROUP BY kategori",
  ).all<{ kategori: string; n: number }>().catch(() => ({ results: [] as { kategori: string; n: number }[] }));

  // Bir sonraki cron zamanı: her ayın 1'i 04:00 UTC
  const simdi = new Date();
  const sonrakiAy = new Date(simdi.getFullYear(), simdi.getMonth() + 1, 1, 4, 0, 0, 0);

  return c.json({
    son_run: sonRun,
    ilan: {
      toplam: ilanSayisi?.n ?? 0,
      il_sayisi: ilSayisi?.n ?? 0,
      ilce_sayisi: ilceSayisi?.n ?? 0,
      kategori: kategori.results ?? [],
    },
    hedef: { toplam_ilce: 80, kaplanan_ilce: ilceSayisi?.n ?? 0 },
    sonraki_cron: sonrakiAy.toISOString(),
  });
});

// ── GET /v1/hepsiemlak/son-runlar ─────────────────────────────────────

hepsiemlakCronRoutes.get("/son-runlar", jwtMiddleware, async (c) => {
  if (!adminMi(c)) return c.json({ hata: "Admin gerekli" }, 403);

  const rows = await c.env.DB.prepare(
    `SELECT id, baslangic, bitis, tetik, islened_ilce, toplam_insert, durum, son_hata
     FROM hepsiemlak_run ORDER BY baslangic DESC LIMIT 20`,
  ).all().catch(() => ({ results: [] as unknown[] }));

  return c.json({ runlar: rows.results ?? [] });
});

// ── POST /v1/hepsiemlak/run-kayit ─────────────────────────────────────
// GitHub Actions run başladığında ve bittiğinde çağırır

hepsiemlakCronRoutes.post("/run-kayit", async (c) => {
  if (!scraperSecretDogrula(c, c.env)) return c.json({ hata: "Yetkisiz" }, 403);

  interface RunKayit {
    aksiyon: "baslat" | "bitir";
    run_id?: string;         // GitHub Actions run ID (string olarak)
    tetik?: string;
    islenen_ilce?: number;
    toplam_insert?: number;
    durum?: "tamam" | "hata" | "kısmi";
    son_hata?: string | null;
  }

  const body = await c.req.json<RunKayit>().catch(() => null);
  if (!body) return c.json({ hata: "Geçersiz JSON" }, 400);

  const simdi = Date.now();

  if (body.aksiyon === "baslat") {
    await c.env.DB.prepare(
      `INSERT INTO hepsiemlak_run (baslangic, tetik, durum, run_ref)
       VALUES (?, ?, 'calisiyor', ?)`,
    ).bind(simdi, body.tetik ?? "github-actions-cron", body.run_id ?? null).run()
      .catch(() => {/* tablo yoksa sessiz */ });

    return c.json({ ok: true, ts: simdi });
  }

  if (body.aksiyon === "bitir") {
    // Son çalışan run'ı kapat
    await c.env.DB.prepare(
      `UPDATE hepsiemlak_run
       SET bitis = ?, islenen_ilce = ?, toplam_insert = ?, durum = ?, son_hata = ?
       WHERE durum = 'calisiyor' AND run_ref = ?`,
    ).bind(
      simdi,
      body.islenen_ilce ?? 0,
      body.toplam_insert ?? 0,
      body.durum ?? "tamam",
      body.son_hata ?? null,
      body.run_id ?? null,
    ).run().catch(() => {/* sessiz */ });

    return c.json({ ok: true, ts: simdi });
  }

  return c.json({ hata: "Geçersiz aksiyon" }, 400);
});

// ── POST /v1/hepsiemlak/ilan-ekle ─────────────────────────────────────
// GitHub Actions her ilçe bittikten sonra batch insert yapar

hepsiemlakCronRoutes.post("/ilan-ekle", async (c) => {
  if (!scraperSecretDogrula(c, c.env)) return c.json({ hata: "Yetkisiz" }, 403);

  interface IlanEkleBody {
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
    }[];
  }

  const body = await c.req.json<IlanEkleBody>().catch(() => null);
  if (!body?.ilanlar?.length) return c.json({ hata: "ilanlar boş" }, 400);

  const maks = 200; // batch başına max
  const liste = body.ilanlar.slice(0, maks);
  const simdi = Date.now();
  let insertSayisi = 0;

  // Batch insert — UNIQUE constraint duplicate'leri yutar
  for (const ilan of liste) {
    try {
      const res = await c.env.DB.prepare(
        `INSERT OR IGNORE INTO ilanlar
         (kaynak, ilan_no, url, baslik, il_norm, ilce_norm, mahalle_norm,
          kategori, fiyat_tlm2, m2, lat, lng, aktif, yakalanma_tarihi)
         VALUES ('hepsiemlak', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
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
      if (res.meta?.changes ?? 0 > 0) insertSayisi++;
    } catch { /* duplicate veya schema hatası — devam */ }
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
           son_insert_adet = excluded.son_insert_adet,
           son_durum = excluded.son_durum`,
    ).bind(ilN, ilceN, simdi, insertSayisi).run().catch(() => {});
  }

  return c.json({ ok: true, gelen: liste.length, insert: insertSayisi });
});
