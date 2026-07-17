/**
 * Otomatik scraper endpoint'leri.
 *
 *   GET  /v1/scraper/run-log              → son scraper run'ları (admin)
 *   POST /v1/scraper/manuel-tetik         → Sahibinden manuel tetik (admin)
 *   GET  /v1/scraper/ilce-durum           → ilçe bazlı son tarama tarihleri
 *   POST /v1/scraper/emlakjet-tetik       → Emlakjet manuel tetik (admin) [YENİ]
 *   GET  /v1/scraper/emlakjet-kapsam      → Emlakjet kapsama istatistikleri [YENİ]
 *
 * Cron: ayın 1'i 02:00 UTC — index.ts scheduled() içinde.
 *       15'i 03:00 UTC — Emlakjet aylık run [YENİ]
 */
import { Hono } from "hono";
import type { Env } from "../index.js";
import { jwtMiddleware } from "./hesap.js";
import { emlakjetRunBaslat } from "../lib/emlakjet-scraper.js";

export const scraperRoutes = new Hono<{ Bindings: Env }>();

scraperRoutes.use("/*", jwtMiddleware);

// JWT payload inline decode (admin claim kontrolü için)
function decodeJwtPayload(token: string | undefined): { adm?: number; admin?: number } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/")
      .padEnd(parts[1]!.length + ((4 - (parts[1]!.length % 4)) % 4), "=");
    return JSON.parse(atob(b64));
  } catch { return null; }
}

// Admin gate — JWT `adm` veya `admin` claim
function adminMi(c: { req: { header(name: string): string | undefined } }): boolean {
  const authH = c.req.header("Authorization");
  if (!authH?.startsWith("Bearer ")) return false;
  const payload = decodeJwtPayload(authH.slice(7));
  return payload?.admin === 1 || payload?.adm === 1;
}

scraperRoutes.get("/run-log", async (c) => {
  if (!adminMi(c)) return c.json({ hata: "Admin gerekli" }, 403);
  const rows = await c.env.DB.prepare(
    `SELECT id, baslangic, bitis, tetik, islenen_ilce, toplam_link,
            toplam_insert, bot_engel_adet, hata_adet, durum, son_hata
     FROM scraper_run ORDER BY baslangic DESC LIMIT 20`,
  ).all();
  return c.json({ runs: rows.results ?? [] });
});

scraperRoutes.get("/ilce-durum", async (c) => {
  if (!adminMi(c)) return c.json({ hata: "Admin gerekli" }, 403);
  const rows = await c.env.DB.prepare(
    `SELECT il_norm, ilce_norm, kategori, son_tarama, son_insert_adet, son_durum
     FROM scraper_ilce_durum
     ORDER BY son_tarama ASC NULLS FIRST LIMIT 50`,
  ).all();
  return c.json({ ilceler: rows.results ?? [] });
});

scraperRoutes.post("/manuel-tetik", async (c) => {
  if (!adminMi(c)) return c.json({ hata: "Admin gerekli" }, 403);

  interface TetikBody {
    ilNorm?: string;
    ilceNorm?: string;
    kategori?: "arsa" | "tarla";
    sayi?: number;
  }
  const body = await c.req.json<TetikBody>().catch(() => ({} as TetikBody));

  const kategori = body.kategori ?? "arsa";
  const sayi = Math.min(Math.max(body.sayi ?? 5, 1), 20);

  // Tek ilçe testi
  if (body.ilNorm && body.ilceNorm) {
    const { ilceTarama } = await import("../lib/sahibinden-scraper.js");
    const r = await ilceTarama(c.env.DB, body.ilNorm, body.ilceNorm, kategori, 10);
    return c.json({ ok: true, tek_ilce: r });
  }

  // Çoklu ilçe — son taranan en eski olanları seç
  const ilceler = await c.env.DB.prepare(
    `SELECT il_norm, ilce_norm FROM scraper_ilce_durum
     WHERE kategori = ? ORDER BY son_tarama ASC NULLS FIRST LIMIT ?`,
  ).bind(kategori, sayi).all<{ il_norm: string; ilce_norm: string }>();

  let hedefler: Array<{ ilNorm: string; ilceNorm: string }>;
  if ((ilceler.results?.length ?? 0) > 0) {
    hedefler = ilceler.results!.map((r) => ({ ilNorm: r.il_norm, ilceNorm: r.ilce_norm }));
  } else {
    // İlk run — bilinen mahalle_istatistik'ten ilçe çek
    const fb = await c.env.DB.prepare(
      `SELECT DISTINCT il_norm, ilce_norm FROM mahalle_istatistik LIMIT ?`,
    ).bind(sayi).all<{ il_norm: string; ilce_norm: string }>();
    hedefler = (fb.results ?? []).map((r) => ({ ilNorm: r.il_norm, ilceNorm: r.ilce_norm }));
    // İlk run için hâlâ boşsa, popüler İstanbul ilçeleri ile başla
    if (hedefler.length === 0) {
      hedefler = [
        { ilNorm: "istanbul", ilceNorm: "beykoz" },
        { ilNorm: "istanbul", ilceNorm: "sile" },
        { ilNorm: "istanbul", ilceNorm: "catalca" },
        { ilNorm: "istanbul", ilceNorm: "silivri" },
        { ilNorm: "istanbul", ilceNorm: "tuzla" },
      ].slice(0, sayi);
    }
  }

  const sonuc = await scraperRunBaslat(c.env.DB, hedefler, kategori, "manuel-admin");
  return c.json(sonuc);
});

/**
 * Cron'dan veya manuel tetikten çağrılır.
 * Worker 5dk timeout — sayi kontrollü tutulmalı.
 */
export async function scraperRunBaslat(
  db: Env["DB"],
  hedefler: Array<{ ilNorm: string; ilceNorm: string }>,
  kategori: "arsa" | "tarla",
  tetik: "cron-aylik" | "manuel-admin",
) {
  const baslangic = Date.now();
  const ins = await db.prepare(
    `INSERT INTO scraper_run (baslangic, tetik, durum) VALUES (?, ?, 'calisiyor') RETURNING id`,
  ).bind(baslangic, tetik).first<{ id: number }>();
  const runId = ins?.id;

  const { tumIlceleri } = await import("../lib/sahibinden-scraper.js");
  const sonuc = await tumIlceleri(db, hedefler, kategori);

  let durum: "tamam" | "hata" | "bot-bloke" = "tamam";
  if (sonuc.toplamBotEngel >= 3) durum = "bot-bloke";
  else if (sonuc.toplamHata > 0 && sonuc.toplamInsert === 0) durum = "hata";

  await db.prepare(
    `UPDATE scraper_run
     SET bitis = ?, islenen_ilce = ?, toplam_link = ?, toplam_insert = ?,
         bot_engel_adet = ?, hata_adet = ?, durum = ?
     WHERE id = ?`,
  ).bind(
    Date.now(), sonuc.islenenIlce, sonuc.toplamLink, sonuc.toplamInsert,
    sonuc.toplamBotEngel, sonuc.toplamHata, durum, runId,
  ).run();

  // İlçe durum güncelle
  for (let i = 0; i < sonuc.islenenIlce; i++) {
    const h = hedefler[i];
    if (!h) continue;
    await db.prepare(
      `INSERT INTO scraper_ilce_durum (il_norm, ilce_norm, kategori, son_tarama, son_durum)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(il_norm, ilce_norm, kategori) DO UPDATE
       SET son_tarama = excluded.son_tarama, son_durum = excluded.son_durum`,
    ).bind(h.ilNorm, h.ilceNorm, kategori, Date.now(), durum).run();
  }

  return {
    ok: true,
    runId,
    durum,
    islenen_ilce: sonuc.islenenIlce,
    toplam_link: sonuc.toplamLink,
    toplam_insert: sonuc.toplamInsert,
    bot_engel: sonuc.toplamBotEngel,
    hata: sonuc.toplamHata,
  };
}

// ── Emlakjet manuel tetik ─────────────────────────────────────────────────────
// POST /v1/scraper/emlakjet-tetik
// Body: { ilNorm?, ilceNorm?, sayi?, maxSayfa? }
// Admin JWT zorunlu. Worker 30s CPU — sayi küçük tut (default 5 ilçe).
scraperRoutes.post("/emlakjet-tetik", async (c) => {
  if (!adminMi(c)) return c.json({ hata: "Admin gerekli" }, 403);

  interface EjBody {
    ilNorm?: string;
    ilceNorm?: string;
    sayi?: number;
    maxSayfa?: number;
  }
  const body = await c.req.json<EjBody>().catch(() => ({} as EjBody));
  const maxSayfa = Math.min(Math.max(body.maxSayfa ?? 3, 1), 6);

  // Tek ilçe testi
  if (body.ilNorm && body.ilceNorm) {
    const sonuc = await emlakjetRunBaslat(
      c.env.DB,
      [{ ilN: body.ilNorm, ilceN: body.ilceNorm }],
      1,
      maxSayfa,
      "manuel-admin",
    );
    return c.json({ ok: true, ...sonuc });
  }

  // Çoklu ilçe — en eski tarananları seç
  const sayi = Math.min(Math.max(body.sayi ?? 5, 1), 15);
  const ilceler = await c.env.DB.prepare(
    `SELECT il_norm, ilce_norm FROM scraper_ilce_durum
     WHERE kategori = 'arsa' ORDER BY son_tarama ASC NULLS FIRST LIMIT ?`,
  ).bind(sayi).all<{ il_norm: string; ilce_norm: string }>();

  let hedefler = (ilceler.results ?? []).map((r) => ({
    ilN: r.il_norm,
    ilceN: r.ilce_norm,
  }));

  // İlk run — mahalle_baseline_ai'dan ilçe çek (veri olan ilçeler)
  if (hedefler.length === 0) {
    const fb = await c.env.DB.prepare(
      `SELECT DISTINCT il_norm, ilce_norm FROM mahalle_baseline_ai LIMIT ?`,
    ).bind(sayi).all<{ il_norm: string; ilce_norm: string }>();
    hedefler = (fb.results ?? []).map((r) => ({ ilN: r.il_norm, ilceN: r.ilce_norm }));
  }

  // Son fallback — büyük şehir taşra ilçeleri
  if (hedefler.length === 0) {
    hedefler = [
      { ilN: "konya", ilceN: "meram" },
      { ilN: "ankara", ilceN: "polatli" },
      { ilN: "bursa", ilceN: "inegol" },
      { ilN: "izmir", ilceN: "tire" },
      { ilN: "antalya", ilceN: "manavgat" },
    ].slice(0, sayi);
  }

  const sonuc = await emlakjetRunBaslat(
    c.env.DB,
    hedefler,
    sayi,
    maxSayfa,
    "manuel-admin",
  );
  return c.json({ ok: true, hedef_sayi: hedefler.length, ...sonuc });
});

// ── Emlakjet kapsama istatistikleri ──────────────────────────────────────────
// GET /v1/scraper/emlakjet-kapsam
// Emlakjet kaynaklı ilan sayısı, kapsanan mahalle/ilçe/il sayıları.
scraperRoutes.get("/emlakjet-kapsam", async (c) => {
  if (!adminMi(c)) return c.json({ hata: "Admin gerekli" }, 403);

  const [toplamIlan, ilceSayisi, mahalleSayisi, ilSayisi, enYeniTarih, enEskiTarih] = await Promise.all([
    c.env.DB.prepare(
      "SELECT COUNT(*) as n FROM ilanlar WHERE kaynak = 'emlakjet' AND aktif = 1",
    ).first<{ n: number }>(),
    c.env.DB.prepare(
      "SELECT COUNT(DISTINCT ilce_norm) as n FROM ilanlar WHERE kaynak = 'emlakjet' AND aktif = 1",
    ).first<{ n: number }>(),
    c.env.DB.prepare(
      "SELECT COUNT(DISTINCT mahalle_norm) as n FROM ilanlar WHERE kaynak = 'emlakjet' AND aktif = 1 AND mahalle_norm IS NOT NULL",
    ).first<{ n: number }>(),
    c.env.DB.prepare(
      "SELECT COUNT(DISTINCT il_norm) as n FROM ilanlar WHERE kaynak = 'emlakjet' AND aktif = 1",
    ).first<{ n: number }>(),
    c.env.DB.prepare(
      "SELECT MAX(yakalanma_tarihi) as t FROM ilanlar WHERE kaynak = 'emlakjet'",
    ).first<{ t: number | null }>(),
    c.env.DB.prepare(
      "SELECT MIN(yakalanma_tarihi) as t FROM ilanlar WHERE kaynak = 'emlakjet'",
    ).first<{ t: number | null }>(),
  ]);

  // Kategori dağılımı
  const kategori = await c.env.DB.prepare(
    "SELECT kategori, COUNT(*) as n FROM ilanlar WHERE kaynak = 'emlakjet' AND aktif = 1 GROUP BY kategori",
  ).all<{ kategori: string; n: number }>();

  // Son run'lar
  const sonRunlar = await c.env.DB.prepare(
    `SELECT id, baslangic, bitis, islened_ilce, toplam_insert, durum
     FROM scraper_run WHERE tetik LIKE 'emlakjet%' ORDER BY baslangic DESC LIMIT 10`,
  ).all().catch(() => ({ results: [] as any[] }));

  return c.json({
    ilan: {
      toplam: toplamIlan?.n ?? 0,
      il_sayisi: ilSayisi?.n ?? 0,
      ilce_sayisi: ilceSayisi?.n ?? 0,
      mahalle_sayisi: mahalleSayisi?.n ?? 0,
      en_yeni: enYeniTarih?.t ?? null,
      en_eski: enEskiTarih?.t ?? null,
      kategori: kategori.results ?? [],
    },
    hedef: {
      toplam_ilce: 973,
      kaplanan_ilce: ilceSayisi?.n ?? 0,
      kaplama_yuzde: Math.round(((ilceSayisi?.n ?? 0) / 973) * 1000) / 10,
    },
    son_runlar: sonRunlar.results ?? [],
  });
});

// Emlakjet run fonksiyonunu dışa aktar (cron için)
export { emlakjetRunBaslat as emlakjetCronBaslat };
