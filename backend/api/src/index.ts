/**
 * Cadastrum API — Hono.js on Cloudflare Workers + D1
 *
 * Endpoint'ler:
 *   GET  /v1/health
 *   GET  /v1/fiyat/mahalle/:il/:ilce/:mahalle?kategori=arsa
 *   GET  /v1/fiyat/ilce/:il/:ilce?kategori=arsa
 *   GET  /v1/fiyat/il/:il?kategori=arsa
 *   POST /v1/ilan  (extension crowdsource ingest)
 *   GET  /v1/istatistik/refresh?secret=XXX  (Cron — manuel tetikleme)
 *
 * Deploy:
 *   1. wrangler login
 *   2. npm run db:create  → wrangler.toml'a database_id koy
 *   3. npm run db:migrate
 *   4. wrangler secret put SCRAPER_API_SECRET
 *   5. npm run deploy
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { fiyatRoutes } from "./routes/fiyat.js";
import { ilanRoutes } from "./routes/ilan.js";
import { emsalSpatialRoutes } from "./routes/emsal-spatial.js";
import { sorguRoutes } from "./routes/sorgu.js";
import { bildirimRoutes } from "./routes/bildirim.js";
import { bildirimKontroluCalistir } from "./routes/bildirim-cron.js";
import { crmRoutes } from "./routes/crm.js";
import { publicApiRoutes } from "./routes/public-api.js";
import { proxyRoutes } from "./routes/proxy.js";
import { scraperRoutes, scraperRunBaslat, emlakjetCronBaslat } from "./routes/scraper.js";
import { emailGonder } from "./routes/auth.js";
import { istatistikRefresh } from "./routes/istatistik.js";
import { validationRoutes } from "./routes/validation.js";
import { authRoutes } from "./routes/auth.js";
import { hesapRoutes } from "./routes/hesap.js";
import { lemonRoutes } from "./routes/lemon.js";
import { aiFiyatRoutes } from "./routes/ai-fiyat.js";
import { aiScorecardRoutes } from "./routes/ai-scorecard.js";
import { adminRoutes } from "./routes/admin.js";
import { milliEmlakRoutes } from "./routes/milli-emlak.js";
import { newsletterRoutes } from "./routes/newsletter.js";
import { tcmbRoutes } from "./routes/tcmb.js";
import { raporRoutes } from "./routes/rapor.js";
import { telemetriRoutes } from "./routes/telemetri.js";
import { haritaRoutes } from "./routes/harita.js";
import { araziAvciRoutes } from "./routes/arazi-avci.js";
import { araziAvciCronCalistir } from "./routes/arazi-avci-cron.js";
import { aiDanismanRoutes } from "./routes/ai-danisman.js";
import { imarDegisimRoutes } from "./routes/imar-degisim.js";
import { rateLimitMiddleware, rateLimitTemizle } from "./lib/rate-limit.js";
import { bearerYetkilendir, cspHeader } from "./lib/security.js";

export interface Env {
  DB: D1Database;
  /** TUCBS ÇDP tile kalıcı cache'i — write-through, TUCBS'e canlı bağımlılığı azaltır */
  TUCBS_TILES: R2Bucket;
  /** Rate limit sayaçları — D1 yerine KV (10x daha hızlı write, aylık kota D1'den çok düşük) */
  RATE_LIMIT_KV?: KVNamespace;
  /** Scraper ingest auth — sadece /v1/ilan ve /v1/scraper için */
  SCRAPER_API_SECRET: string;
  /** Baseline seed auth — sadece /v1/baseline/seed için (SCRAPER_API_SECRET'tan ayrı) */
  SEED_SECRET: string;
  /** İstatistik refresh auth — sadece /v1/istatistik/refresh için */
  STATS_SECRET: string;
  JWT_SECRET: string;
  RESEND_API_KEY?: string;
  LEMON_WEBHOOK_SECRET?: string;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  TCMB_EVDS_KEY?: string;
  RATE_LIMIT_PER_HOUR: string;
  ENVIRONMENT: string;
}

const app = new Hono<{ Bindings: Env }>();

// CORS — extension + Cloudflare Pages site + localhost dev
// S4: null origin → reject (Postman/cURL'den gelince "*" dönmemeli)
app.use("/*", cors({
  origin: (origin) => {
    // S4: origin yoksa (null/undefined) → reject — sadece tarayıcı isteklerini kabul et
    if (!origin) return null;
    if (origin.startsWith("chrome-extension://")) return origin;
    // Cloudflare Pages production + preview URL'leri
    if (origin.endsWith(".cadastrum-site.pages.dev")) return origin;
    if (origin === "https://cadastrum-site.pages.dev") return origin;
    // Production custom domain
    if (origin === "https://cadastrum.com.tr" || origin === "https://www.cadastrum.com.tr") return origin;
    // Future-proof (ileride .com alınırsa)
    if (origin === "https://cadastrum.com" || origin === "https://www.cadastrum.com") return origin;
    if (origin.startsWith("http://localhost:")) return origin;
    return null;
  },
  // DELETE/PATCH/PUT: hesap yönetimi ve gelecekteki CRUD endpoint'leri için gerekli.
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
}));

// Global CSP header — tüm API response'larında (S4)
app.use("/*", async (c, next) => {
  await next();
  c.header("Content-Security-Policy", cspHeader());
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
});

// Health check
app.get("/v1/health", (c) => c.json({
  status: "ok",
  env: c.env.ENVIRONMENT,
  ts: Date.now(),
}));

// ── Public endpoint rate limitleri ───────────────────────────────────────────
// Fiyat sorguları: saatte 120 istek/IP (CDN cache sayesinde çoğu buraya ulaşmaz)
app.use("/v1/fiyat/*", rateLimitMiddleware(120, "fiyat"));

// Proxy — alt route'lara göre farklı limit:
//   tkgm-idari: harita sayfası tek yüklemede 81 il için ayrı istek atıyor (30 gün
//     edge cache'li, ucuz) — cömert limit.
//   tucbs/tile: harita gezinirken (pan/zoom) onlarca tile isteği atılıyor (7 gün
//     edge cache'li) — cömert limit, aksi halde ÇDP katmanı 429 ile kırılıyordu.
//   diğerleri (eplan, tucbs legend, tkgm-analiz): kullanıcı aksiyonu başına bir
//     istek, düşük hacim — eski 60/saat korunuyor.
app.use("/v1/proxy/tkgm-idari/*", rateLimitMiddleware(400, "proxy-idari"));
app.use("/v1/proxy/tucbs/tile/*", rateLimitMiddleware(600, "proxy-tile"));
app.use("/v1/proxy/eplan", rateLimitMiddleware(60, "proxy-eplan"));
app.use("/v1/proxy/tucbs", rateLimitMiddleware(60, "proxy-tucbs"));
app.use("/v1/proxy/tkgm-analiz", rateLimitMiddleware(60, "proxy-analiz"));
// Wayback: sorgu başına 4 kare — saatte ~30 sorgu × 4 = 120; kenar cache ile ucuz
app.use("/v1/proxy/wayback", rateLimitMiddleware(200, "proxy-wayback"));

// Emsal spatial: DB-ağır sorgu — saatte 60 istek/IP
app.use("/v1/emsal/*", rateLimitMiddleware(60, "emsal"));

// Sorgu: sorgu.ts içinde kendi rate limit'i var (20/saat) ama double-check için
// burada daha yüksek tutuyoruz, sorgu.ts'nin kendi kontrolü daha sıkı davranacak
app.use("/v1/sorgu/*", rateLimitMiddleware(100, "sorgu"));

// Harita — site tek/az istek atar (heatmap/ilceler/likidite); legacy analiz/* ayrı kova
app.use("/v1/harita/heatmap", rateLimitMiddleware(120, "harita-heatmap"));
app.use("/v1/harita/ilceler", rateLimitMiddleware(120, "harita-ilceler"));
app.use("/v1/harita/analiz/*", rateLimitMiddleware(200, "harita-analiz"));
app.use("/v1/harita/likidite", rateLimitMiddleware(200, "harita-likidite"));
app.use("/v1/harita/trend", rateLimitMiddleware(200, "harita-trend"));
app.use("/v1/harita/*", rateLimitMiddleware(200, "harita"));

// Newsletter kayıt: spam önleme — saatte 5 istek/IP
app.use("/v1/newsletter/*", rateLimitMiddleware(5, "newsletter"));

// Telemetri: saatte 200 istek/IP (extension her hata için çağırabilir)
app.use("/v1/telemetri/*", rateLimitMiddleware(200, "telemetri"));

// Fiyat sorgu endpoint'leri (public, cache-friendly)
app.route("/v1/fiyat", fiyatRoutes);

// İlan ingest endpoint'i (extension/scraper'dan POST)
app.route("/v1/ilan", ilanRoutes);

// Faz 2 Spatial emsal — koord bazlı sorgu + opt-in upload + doğrulama
app.route("/v1/emsal", emsalSpatialRoutes);

// Faz 4 Web App sorgu — extension'sız kullanıcı için lat/lng → fiyat
app.route("/v1/sorgu", sorguRoutes);

// Faz 4 Sprint G — Bildirim sistemi (JWT bearer zorunlu)
app.route("/v1/bildirim", bildirimRoutes);

// Faz 5 Sprint I — CRM Lite (Kurumsal Standart+ tier)
app.route("/v1/crm", crmRoutes);

// Faz 5 Sprint J — Public API (X-API-Key token bazlı, Kurumsal Pro)
app.route("/v1/api", publicApiRoutes);

// CORS proxy — AFAD TDTH ve e-Plan extension'dan direkt çağrılamıyor (CORS)
app.route("/v1/proxy", proxyRoutes);

// Harita — TKGM analiz verisi D1'den (tek seferlik seed, site buradan okur)
app.route("/v1/harita", haritaRoutes);

// Otomatik scraper — aylık cron + admin manuel tetik
app.route("/v1/scraper", scraperRoutes);

// Milli Emlak ihale fiyatları — gerçek satış referans verisi
// POST /v1/milli-emlak/admin/seed (SCRAPER_API_SECRET korumalı)
// GET  /v1/milli-emlak/sorgu?il=&ilce= (public, cached)
// GET  /v1/milli-emlak/ozet/:il/:ilce (public, cached)
app.use("/v1/milli-emlak/sorgu", rateLimitMiddleware(60, "milli-emlak"));
app.route("/v1/milli-emlak", milliEmlakRoutes);

// Cross-validation rapor + bias kalibrasyon
app.route("/v1/validation", validationRoutes);

// Auth (kayıt/giriş/me)
app.route("/v1/auth", authRoutes);

// Hesap yönetimi (KVKK uyumlu — silme, export, şifre değiştir)
app.route("/v1/hesap", hesapRoutes);

// LemonSqueezy webhook (abonelik olayları)
app.route("/v1/lemon", lemonRoutes);

// AI fiyat proxy (Pro+ kullanıcı için Gemini 2.5 Flash + Groq fallback)
app.route("/v1/ai-fiyat", aiFiyatRoutes);
// AI Arazi Uygunluk Scorecard (5 boyut — tüm tier, kota paylaşımlı)
app.route("/v1/ai-scorecard", aiScorecardRoutes);

// Admin dashboard (JWT + admin=1 zorunlu)
app.route("/v1/admin", adminRoutes);

// Newsletter (Erken Erişim listesi, public)
app.route("/v1/newsletter", newsletterRoutes);

// TCMB EVDS Konut Fiyat Endeksi
// NOT: EVDS3 yeni sisteminde endpoint format'ı dokümandan farklı çalışıyor.
// TÜFE × 1.15 fallback (extension içinde) yeterli — ileride TCMB destek netleşince açılacak.
app.route("/v1/tcmb", tcmbRoutes);

// Paylaşılabilir yatırımcı raporu (public shareable link)
app.route("/v1/rapor", raporRoutes);

// Hata telemetrisi (observability — extension + backend runtime hataları)
app.route("/v1/telemetri", telemetriRoutes);

// Faz A3/A4 — Arazi Avcısı (arama + kriter kayıt + uyarı)
app.use("/v1/arazi-avci/ara", rateLimitMiddleware(30, "arazi-avci"));
app.route("/v1/arazi-avci", araziAvciRoutes);

// Faz B3/B4 — AI Yatırım Danışmanı (RAG chat)
app.use("/v1/ai-danisman/*", rateLimitMiddleware(20, "ai-danisman"));
app.route("/v1/ai-danisman", aiDanismanRoutes);

// Faz C1/C2 — İmar Değişim Sinyali
app.use("/v1/imar-degisim/*", rateLimitMiddleware(60, "imar-degisim"));
app.route("/v1/imar-degisim", imarDegisimRoutes);

// Cron / manuel istatistik yenileme
// S1: secret artık URL param değil, Authorization: Bearer header'ında
// S3: timing-safe karşılaştırma
app.post("/v1/istatistik/refresh", async (c) => {
  const yetki = await bearerYetkilendir(
    c.req.header("Authorization"),
    c.env.STATS_SECRET,
  );
  if (!yetki) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const result = await istatistikRefresh(c.env.DB);
  return c.json(result);
});
// Backward-compat: eski GET + query param desteği kaldırıldı (güvenlik)

// AI baseline seed — extension'ın yerel mahalle-baseline.ts'inin server kopyası
// S3: timing-safe secret karşılaştırma
app.post("/v1/baseline/seed", async (c) => {
  const yetki = await bearerYetkilendir(
    c.req.header("Authorization"),
    c.env.SEED_SECRET,
  );
  if (!yetki) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const body = await c.req.json<{ rows: Array<{
    il_norm: string; ilce_norm: string; mahalle_norm: string; kategori: string;
    tlm2: number; guven?: number; kaynak?: string; yakalandi?: number;
  }> }>().catch(() => null);
  if (!body?.rows || !Array.isArray(body.rows)) {
    return c.json({ error: "Geçersiz body" }, 400);
  }
  let inserted = 0;
  for (const r of body.rows) {
    if (!r.il_norm || !r.ilce_norm || !r.mahalle_norm || !r.kategori || !r.tlm2 || r.tlm2 <= 0) continue;
    try {
      await c.env.DB.prepare(
        `INSERT INTO mahalle_baseline_ai (il_norm, ilce_norm, mahalle_norm, kategori, tlm2, guven, kaynak, yakalandi)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(il_norm, ilce_norm, mahalle_norm, kategori) DO UPDATE SET
           tlm2 = excluded.tlm2, guven = excluded.guven, kaynak = excluded.kaynak, yakalandi = excluded.yakalandi`,
      ).bind(
        r.il_norm, r.ilce_norm, r.mahalle_norm, r.kategori,
        r.tlm2, r.guven ?? 30, r.kaynak ?? "knn-smoothing", r.yakalandi ?? Date.now(),
      ).run();
      inserted++;
    } catch {
      // Skip malformed rows
    }
  }
  return c.json({ inserted, requested: body.rows.length });
});

/**
 * POST /v1/ilan/batch-seed
 * Emlakjet manuel scrape çıktısını (emlakjet-data-turkiye.sql içindeki ilanları)
 * JSON chunk'lar halinde D1'a yükler.
 *
 * Neden gerekli:
 *   wrangler d1 execute --file=emlakjet-data-turkiye.sql bazen timeout veya
 *   boyut limitine takılıyor. Bu endpoint chunk'larla göndermeyi sağlar.
 *
 * Body: {
 *   rows: Array<{
 *     ilan_no: string;       // "ej_12345678"
 *     il_norm: string;
 *     ilce_norm: string;
 *     mahalle_norm?: string | null;
 *     fiyat_per_m2: number;
 *     m2?: number | null;
 *     kategori: string;      // "arsa" | "tarla"
 *     lat?: number | null;
 *     lng?: number | null;
 *   }>;
 * }
 * Auth: Bearer SEED_SECRET
 * Max rows per request: 500 (D1 batch limit için güvenli)
 */
const GECERLI_ILAN_KATEGORI = new Set(["arsa", "tarla", "konut", "bahce", "bag", "zeytinlik"]);

app.post("/v1/ilan/batch-seed", async (c) => {
  const yetki = await bearerYetkilendir(
    c.req.header("Authorization"),
    c.env.SEED_SECRET,
  );
  if (!yetki) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json<{
    rows: Array<{
      ilan_no: string;
      il_norm: string;
      ilce_norm: string;
      mahalle_norm?: string | null;
      fiyat_per_m2: number;
      m2?: number | null;
      kategori: string;
      lat?: number | null;
      lng?: number | null;
    }>;
  }>().catch(() => null);

  if (!body?.rows || !Array.isArray(body.rows)) {
    return c.json({ error: "Geçersiz body — rows dizisi gerekli" }, 400);
  }
  if (body.rows.length > 500) {
    return c.json({ error: "Maksimum 500 satır/istek. Chunk'layarak gönderin." }, 400);
  }

  const ts = Date.now();
  let inserted = 0;
  let skipped = 0;
  let hatali = 0;

  for (const r of body.rows) {
    // Zorunlu alan kontrolü
    if (
      !r.ilan_no || typeof r.ilan_no !== "string" || r.ilan_no.length > 50 ||
      !r.il_norm || typeof r.il_norm !== "string" || r.il_norm.length > 50 ||
      !r.ilce_norm || typeof r.ilce_norm !== "string" || r.ilce_norm.length > 50 ||
      !r.kategori || !GECERLI_ILAN_KATEGORI.has(r.kategori) ||
      typeof r.fiyat_per_m2 !== "number" || r.fiyat_per_m2 <= 0 || r.fiyat_per_m2 > 1_000_000_000
    ) {
      hatali++;
      continue;
    }

    // Koordinat sınır kontrolü (Türkiye bbox)
    const lat = r.lat ?? null;
    const lng = r.lng ?? null;
    if (lat !== null && (lat < 35 || lat > 43)) { hatali++; continue; }
    if (lng !== null && (lng < 25 || lng > 46)) { hatali++; continue; }

    try {
      const result = await c.env.DB.prepare(
        `INSERT OR IGNORE INTO ilanlar
         (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm,
          fiyat_per_m2, m2, kategori, para_birimi, yakalanma_tarihi,
          lat, lng, koord_kaynagi, aktif)
         VALUES ('emlakjet', ?, ?, ?, ?, ?, ?, ?, 'TL', ?, ?, ?, ?, 1)`,
      ).bind(
        r.ilan_no,
        r.il_norm,
        r.ilce_norm,
        r.mahalle_norm ?? null,
        r.fiyat_per_m2,
        r.m2 ?? null,
        r.kategori,
        ts,
        lat,
        lng,
        lat !== null ? "mahalle-merkez" : null,
      ).run();
      // INSERT OR IGNORE: changes=0 ise zaten vardı (skip)
      if ((result.meta.changes ?? 0) > 0) inserted++;
      else skipped++;
    } catch {
      hatali++;
    }
  }

  return c.json({
    ok: true,
    requested: body.rows.length,
    inserted,
    skipped,
    hatali,
  });
});

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error("[api error]", err);
  return c.json({ error: err.message ?? "Internal error" }, 500);
});

// Cloudflare Workers entry point
export default {
  fetch: app.fetch,

  // Cron handler — wrangler.toml `crons` listesindeki her trigger'da çağrılır.
  // Dört trigger:
  //   "0 3 * * *"   → istatistikRefresh (günde 1, mahalle istatistik agregasyonu)
  //   "0 * * * *"   → bildirimKontroluCalistir (saatlik, fiyat/emsal/eşik kontrolü)
  //   "0 2 1 * *"   → Sahibinden otomatik scraper (ayın 1'i 02:00 UTC)
  //   "0 3 15 * *"  → Emlakjet otomatik scraper (ayın 15'i 03:00 UTC) [YENİ]
  // event.cron string'i ile ayırıyoruz.
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const cron = event.cron;
    if (cron === "0 3 * * *") {
      ctx.waitUntil((async () => {
        // 1) İstatistik agregasyonu
        const r = await istatistikRefresh(env.DB);
        console.log("[cron-daily] istatistik:", r);

        // 2) rate_limit tablosu temizliği (48 saatten eski satırlar)
        const rl = await rateLimitTemizle(env.DB);
        console.log("[cron-daily] rate_limit temizlendi:", rl);

        // 3) giris_denemesi tablosu temizliği (24 saatten eski satırlar)
        // auth.ts'deki module-level _lastCleanupHour kaldırıldı, bu cron üstlendi.
        const dakikaSiniri = Math.floor(Date.now() / 60_000) - 60 * 24;
        const gd = await env.DB.prepare(
          "DELETE FROM giris_denemesi WHERE dakika < ?"
        ).bind(dakikaSiniri).run().catch(() => ({ meta: { changes: 0 } }));
        console.log("[cron-daily] giris_denemesi temizlendi:", gd.meta.changes, "satır");
      })());
    } else if (cron === "0 * * * *") {
      ctx.waitUntil(
        bildirimKontroluCalistir(env).then((r) =>
          console.log("[cron-hourly] bildirim:", r, "ts:", event.scheduledTime),
        ),
      );
    } else if (cron === "0 8 * * *") {
      // YENI-1: Arazi Avcısı günlük uyarı — kriterleri tara + email gönder
      ctx.waitUntil((async () => {
        const r = await araziAvciCronCalistir(env);
        console.log("[cron-arazi-avci]", r);
      })());
    } else if (cron === "0 2 1 * *") {
      // Aylık scraper hatırlatma (A+E hibrit):
      //   1) Worker'dan Sahibinden fetch'i dener (PerimeterX engelliyor — beklenen)
      //   2) Sonuç ne olursa olsun admin'lere email at: "manuel Bootstrap çalıştır"
      ctx.waitUntil((async () => {
        const ilceler = await env.DB.prepare(
          `SELECT il_norm, ilce_norm FROM scraper_ilce_durum
           WHERE kategori = 'arsa' ORDER BY son_tarama ASC NULLS FIRST LIMIT 5`,
        ).all<{ il_norm: string; ilce_norm: string }>();
        let hedefler = (ilceler.results ?? []).map((r) => ({ ilNorm: r.il_norm, ilceNorm: r.ilce_norm }));
        if (hedefler.length === 0) {
          hedefler = [
            { ilNorm: "istanbul", ilceNorm: "beykoz" },
            { ilNorm: "istanbul", ilceNorm: "sile" },
            { ilNorm: "istanbul", ilceNorm: "catalca" },
            { ilNorm: "istanbul", ilceNorm: "silivri" },
            { ilNorm: "istanbul", ilceNorm: "tuzla" },
          ];
        }
        const r = await scraperRunBaslat(env.DB, hedefler, "arsa", "cron-aylik");
        console.log("[cron-monthly] scraper:", r);

        // Admin'lere "manuel başlat" hatırlatma
        const adminler = await env.DB.prepare(
          `SELECT email, ad FROM kullanicilar WHERE admin = 1`,
        ).all<{ email: string; ad: string | null }>();
        const konu = `[Cadastrum] Aylık scraper hatırlatma — ${new Date().toLocaleDateString("tr-TR")}`;
        const otomatikDurum = r.bot_engel >= 3
          ? `<strong>Otomatik scraper PerimeterX tarafından engellendi</strong> (bot_engel=${r.bot_engel}). Beklenen davranış — Chrome bootstrap manuel başlatılmalı.`
          : `Otomatik scraper kısmen çalıştı: <strong>${r.toplam_insert} yeni ilan</strong> eklendi (${r.islenen_ilce} ilçe). Manuel bootstrap ile genişletebilirsin.`;
        const html = `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
            <h2 style="color:#1B2A4A">📊 Aylık Scraper Hatırlatma</h2>
            <p>${otomatikDurum}</p>
            <p><strong>Sıradaki adım:</strong> Chrome'da Cadastrum extension'ı aç → <em>Boot</em> sekmesi → İstanbul (veya istediğin il) seç → <strong>Başlat</strong>.</p>
            <p>Tahmini 7 dk liste tarama, 30-60 dk detay zenginleştirme. Cihazını açık bırak.</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
            <p style="font-size:12px;color:#64748b">Bu mail her ayın 1'inde 02:00 UTC'de otomatik gönderilir.</p>
          </div>`;
        const metin = `Aylık scraper hatırlatma — ${otomatikDurum.replace(/<[^>]+>/g, "")}\n\nChrome'da Cadastrum extension > Boot tab > Başlat`;
        for (const a of adminler.results ?? []) {
          await emailGonder(env, a.email, konu, html, metin).catch(() => {});
        }
      })());
    } else if (cron === "0 3 15 * *") {
      // Emlakjet aylık scraper — ayın 15'i 03:00 UTC
      // Sahibinden'in aksine PerimeterX yok — Worker'dan direkt çalışır.
      // Worker CPU 30s limiti: maxIlce=8, maxSayfa=3 → ~20-25s içinde tamamlar.
      ctx.waitUntil((async () => {
        // En eski taranan ilçeleri seç (veya hiç taranmamışları)
        const ilceler = await env.DB.prepare(
          `SELECT il_norm, ilce_norm FROM scraper_ilce_durum
           WHERE kategori = 'arsa' ORDER BY son_tarama ASC NULLS FIRST LIMIT 8`,
        ).all<{ il_norm: string; ilce_norm: string }>();

        let hedefler = (ilceler.results ?? []).map((r) => ({
          ilN: r.il_norm,
          ilceN: r.ilce_norm,
        }));

        // İlk run — mahalle_baseline_ai'dan ilçe seç (geniş kapsam için)
        if (hedefler.length === 0) {
          const fb = await env.DB.prepare(
            `SELECT DISTINCT il_norm, ilce_norm FROM mahalle_baseline_ai
             ORDER BY RANDOM() LIMIT 8`,
          ).all<{ il_norm: string; ilce_norm: string }>();
          hedefler = (fb.results ?? []).map((r) => ({ ilN: r.il_norm, ilceN: r.ilce_norm }));
        }

        const r = await emlakjetCronBaslat(env.DB, hedefler, 8, 3, "cron-aylik");
        console.log("[cron-emlakjet] run tamamlandı:", r);

        // İstatistikleri hemen güncelle
        const ist = await istatistikRefresh(env.DB);
        console.log("[cron-emlakjet] istatistik refresh:", ist);
      })());
    } else {
      console.warn("[cron] beklenmeyen schedule:", cron);
    }
  },
};
