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
import { scraperRoutes, scraperRunBaslat } from "./routes/scraper.js";
import { emailGonder } from "./routes/auth.js";
import { istatistikRefresh } from "./routes/istatistik.js";
import { validationRoutes } from "./routes/validation.js";
import { authRoutes } from "./routes/auth.js";
import { hesapRoutes } from "./routes/hesap.js";
import { lemonRoutes } from "./routes/lemon.js";
import { aiFiyatRoutes } from "./routes/ai-fiyat.js";
import { adminRoutes } from "./routes/admin.js";
import { newsletterRoutes } from "./routes/newsletter.js";
import { tcmbRoutes } from "./routes/tcmb.js";
import { raporRoutes } from "./routes/rapor.js";
import { telemetriRoutes } from "./routes/telemetri.js";

export interface Env {
  DB: D1Database;
  SCRAPER_API_SECRET: string;
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
app.use("/*", cors({
  origin: (origin) => {
    if (!origin) return "*";
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

// Health check
app.get("/v1/health", (c) => c.json({
  status: "ok",
  env: c.env.ENVIRONMENT,
  ts: Date.now(),
}));

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

// Otomatik scraper — aylık cron + admin manuel tetik
app.route("/v1/scraper", scraperRoutes);

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

// Cron / manuel istatistik yenileme
app.get("/v1/istatistik/refresh", async (c) => {
  const secret = c.req.query("secret");
  if (secret !== c.env.SCRAPER_API_SECRET) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const result = await istatistikRefresh(c.env.DB);
  return c.json(result);
});

// AI baseline seed — extension'ın yerel mahalle-baseline.ts'inin server kopyası
app.post("/v1/baseline/seed", async (c) => {
  const auth = c.req.header("Authorization");
  if (!auth || auth !== `Bearer ${c.env.SCRAPER_API_SECRET}`) {
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

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error("[api error]", err);
  return c.json({ error: err.message ?? "Internal error" }, 500);
});

// Cloudflare Workers entry point
export default {
  fetch: app.fetch,

  // Cron handler — wrangler.toml `crons` listesindeki her trigger'da çağrılır.
  // Üç trigger var:
  //   "0 3 * * *"   → istatistikRefresh (günde 1, mahalle istatistik agregasyonu)
  //   "0 * * * *"   → bildirimKontroluCalistir (saatlik, fiyat/emsal/eşik kontrolü)
  //   "0 2 1 * *"   → Sahibinden otomatik scraper (ayın 1'i 02:00 UTC)
  // event.cron string'i ile ayırıyoruz.
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const cron = event.cron;
    if (cron === "0 3 * * *") {
      ctx.waitUntil(
        istatistikRefresh(env.DB).then((r) => console.log("[cron-daily] istatistik:", r)),
      );
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
    } else {
      console.warn("[cron] beklenmeyen schedule:", cron);
    }
  },
};
