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
import { istatistikRefresh, ilanArchiveEt } from "./routes/istatistik.js";
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
import { seedRoutes } from "./routes/seed.js";
import { ajan as ajanRoutes } from "./routes/ai-ajan.js";
import { portfoyRoutes } from "./routes/portfoy.js";
import { endeksRoutes } from "./routes/endeks.js";
import { uyduRoutes } from "./routes/uydu.js";
import { apiV2Routes } from "./routes/api-v2.js";
import { takipRoutes, parselTakipCalistir } from "./routes/takip.js";
import { rateLimitMiddleware, rateLimitTemizle } from "./lib/rate-limit.js";
import { bearerYetkilendir, cspHeader } from "./lib/security.js";
import { pipelineHealthKontrol, pipelineAlarmEmailGonder } from "./routes/pipeline-health.js";
import { sentryMiddleware } from "./lib/sentry.js";

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

/**
 * Hono context Variables — JWT middleware tarafından set edilen değerler.
 * jwtMiddleware (hesap.ts) bu alanları c.set() ile yazar;
 * route handler'lar c.get() ile okur.
 *
 * Bu tip tanımı sayesinde tüm route dosyalarındaki `c.get("kullaniciId" as any)`
 * kalıpları tip güvenli `c.get("kullaniciId")` hâline gelebilir.
 * Mevcut `as any` cast'leri bu PR'da kaldırılmıyor (kapsam kontrolü),
 * ancak yeni kod bu tipten yararlanabilir.
 */
export interface AppVariables {
  kullaniciId: number;
  tier: string;
  jwtPayload: {
    sub: number;
    email: string;
    tier: string;
    adm?: number;
    iat: number;
    exp: number;
  };
  /** Admin route'larında set edilir */
  adminId?: number;
}

export const app = new Hono<{ Bindings: Env }>();

// Sentry hata izleme — SENTRY_DSN env var varsa etkinleşir, yoksa no-op
app.use("/*", sentryMiddleware);

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
  // Kurumsal Public API, tarayıcı istemcilerinden X-API-Key ile çağrılabiliyor.
  // Bu başlık burada izinli değilse, geçerli anahtarı olan istek bile preflight'ta
  // engellenir.
  allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  maxAge: 86400,
}));

// Global CSP header — tüm API response'larında (S4)
app.use("/*", async (c, next) => {
  await next();
  c.header("Content-Security-Policy", cspHeader());
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
});

// Standart 404 & Hata Yakalama (Unhandled Exception Guard)
app.notFound((c) => {
  return c.json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `İstenen endpoint bulunamadı: ${c.req.method} ${c.req.path}`,
    },
  }, 404);
});

app.onError((err, c) => {
  console.error(`[unhandled-error] ${c.req.method} ${c.req.path}:`, err);
  return c.json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: c.env.ENVIRONMENT === "development" ? (err.message || String(err)) : "Sunucu hatası oluştu",
    },
  }, 500);
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

// Emsal spatial: DB-ağır sorgu — saatte 60 istek/IP
app.use("/v1/emsal/*", rateLimitMiddleware(60, "emsal"));

// Sorgu: sorgu.ts içinde kendi rate limit'i var (20/saat) ama double-check için
// burada daha yüksek tutuyoruz, sorgu.ts'nin kendi kontrolü daha sıkı davranacak
app.use("/v1/sorgu/*", rateLimitMiddleware(100, "sorgu"));

// Harita: GeoJSON ağır veri — saatte 30 istek/IP
app.use("/v1/harita/*", rateLimitMiddleware(30, "harita"));

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
// POST sıkı rate limit: rapor.ts içindeki middleware (5/saat) + global buradaki (30/saat)
app.use("/v1/rapor", rateLimitMiddleware(30, "rapor"));
app.route("/v1/rapor", raporRoutes);

// Hata telemetrisi (observability — extension + backend runtime hataları)
app.route("/v1/telemetri", telemetriRoutes);

// Cron / manuel istatistik yenileme (Bearer STATS_SECRET)
app.post("/v1/istatistik/refresh", async (c) => {
  const yetki = await bearerYetkilendir(
    c.req.header("Authorization"),
    c.env.STATS_SECRET,
  );
  if (!yetki) return c.json({ error: "Unauthorized" }, 401);
  const result = await istatistikRefresh(c.env.DB);
  return c.json(result);
});

// Pipeline health check (Bearer STATS_SECRET)
app.get("/v1/admin/pipeline-health", async (c) => {
  const yetki = await bearerYetkilendir(
    c.req.header("Authorization"),
    c.env.STATS_SECRET,
  );
  if (!yetki) return c.json({ error: "Unauthorized" }, 401);
  const sonuc = await pipelineHealthKontrol(c.env.DB);
  if (c.req.query("email") === "1" && !sonuc.saglikli) {
    sonuc.emailGonderildi = await pipelineAlarmEmailGonder(c.env, sonuc);
  }
  return c.json(sonuc, sonuc.saglikli ? 200 : 503);
});

// AI Ajan — Fırsat Avcısı + Portföy Optimizasyonu + Bölge Analizi (JWT auth, Gemini)
app.use("/v1/ai-ajan/firsat",         rateLimitMiddleware(10, "ai-ajan-firsat"));
app.use("/v1/ai-ajan/portfoy-optimize", rateLimitMiddleware(5, "ai-ajan-portfoy")); // DB-heavy
app.use("/v1/ai-ajan/bolge-analiz",   rateLimitMiddleware(20, "ai-ajan-bolge")); // hafif
app.route("/v1/ai-ajan", ajanRoutes);

// Portföy — sunucu taraflı kayıtlı parsel listesi (JWT, Pro tier için sınırsız)
app.use("/v1/portfoy/*", rateLimitMiddleware(60, "portfoy"));
app.route("/v1/portfoy", portfoyRoutes);

// Uydu görüntü & AI analizi (Copernicus + Gemini Vision)
app.use("/v1/uydu/*", rateLimitMiddleware(10, "uydu"));
app.route("/v1/uydu", uyduRoutes);

// Cadastrum Fiyat Endeksi — public, rate limit 30/saat
app.route("/v1/api/endeks", endeksRoutes);

// Kurumsal API v2 — POST /v2/degerle, /v2/batch, GET /v2/batch/:id
// X-API-Key zorunlu (cdrm_ prefix), token bazlı rate limit
app.use("/v2/degerle", rateLimitMiddleware(60, "api-v2-degerle"));
app.use("/v2/batch",   rateLimitMiddleware(5, "api-v2-batch"));
app.route("/v2", apiV2Routes);

// Parsel değişiklik takibi (JWT zorunlu)
app.use("/v1/takip/*", rateLimitMiddleware(30, "takip"));
app.route("/v1/takip", takipRoutes);

// Seed & istatistik endpoint'leri — routes/seed.ts (SRP refactor)
// /v1/baseline/seed   POST  → AI mahalle baseline yükle
// /v1/ilan/batch-seed POST  → Emlakjet toplu ilan yükle
// /v1/istatistik/sayim GET  → D1 sayım raporu
app.route("/v1", seedRoutes);

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

        // 2) Pipeline health check — D1 satır sayısı kontrol + alarm email
        try {
          const health = await pipelineHealthKontrol(env.DB);
          console.log("[cron-daily] pipeline-health:", health.saglikli ? "OK" : `ALARM (${health.alarmSayisi} kontrol başarısız)`);
          if (!health.saglikli) {
            const emailGonderildi = await pipelineAlarmEmailGonder(env, health);
            console.log("[cron-daily] alarm email:", emailGonderildi ? "gönderildi" : "gönderilemedi");
          }
        } catch (e) {
          console.error("[cron-daily] pipeline-health hatası:", e);
        }

        // 2) İlan archive — 18 ay+ eski ilanları archive_ilanlar'a taşı
        try {
          const ar = await ilanArchiveEt(env.DB);
          console.log("[cron-daily] ilan-archive:", ar.tasınan, "satır taşındı,", ar.sure_ms, "ms");
        } catch (e) {
          console.error("[cron-daily] ilan-archive hatası:", e);
        }

        // 3) rate_limit tablosu temizliği (48 saatten eski satırlar)
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
    } else if (cron === "0 4 1 * *") {
      // Aylık Cadex Fiyat Endeksi hesaplama — ayın 1'i 04:00 UTC
      ctx.waitUntil((async () => {
        const { endeksHesapla } = await import("./routes/endeks.js");
        const r = await endeksHesapla(env.DB);
        console.log("[cron-endeks] hesaplandi:", r.hesaplanan, "satır");
      })());
    } else if (cron === "0 5 * * 1") {
      // Haftalık parsel polygon takip — Pazartesi 05:00 UTC
      ctx.waitUntil((async () => {
        const baseUrl = "https://cadastrum-api.cadastrum-tr.workers.dev";
        const r = await parselTakipCalistir(env, baseUrl, 100);
        console.log("[cron-haftalik] parsel-takip:", r);
      })());
    } else {
      console.warn("[cron] beklenmeyen schedule:", cron);
    }
  },
};
