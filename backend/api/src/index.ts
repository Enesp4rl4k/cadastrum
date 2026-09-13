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
import { bodyLimit } from "hono/body-limit";
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
import { ilFiyatOzetiKur, zenginlestirmeKuyruguKur } from "./lib/ozet-tablolari.js";
import { validationRoutes, biasRaporuYenile } from "./routes/validation.js";
import { authRoutes } from "./routes/auth.js";
import { hesapRoutes } from "./routes/hesap.js";
import { lemonRoutes } from "./routes/lemon.js";
import { aiFiyatRoutes } from "./routes/ai-fiyat.js";
import { aiScorecardRoutes } from "./routes/ai-scorecard.js";
import { wrapD1 } from "./lib/db-timing.js";
import { butceyiBosalt } from "./lib/okuma-butcesi.js";
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
import { gercekSatisRoutes } from "./routes/gercek-satis.js";
import { endeksRoutes } from "./routes/endeks.js";
import { uyduRoutes } from "./routes/uydu.js";
import { apiV2Routes, apiJobsReaperCalistir } from "./routes/api-v2.js";
import { takipRoutes, parselTakipCalistir } from "./routes/takip.js";
import { rateLimitMiddleware, rateLimitTemizle } from "./lib/rate-limit.js";
import { bearerYetkilendir, cspHeader } from "./lib/security.js";
import { pipelineHealthKontrol, pipelineAlarmEmailGonder } from "./routes/pipeline-health.js";
import { sentryMiddleware } from "./lib/sentry.js";
import { requestIdMiddleware } from "./lib/request-id.js";
import { sunucuHatasiKaydet } from "./lib/hata-kaydet.js";
import { d1KotaHatasiMi, kotaSifirlanmasinaSaniye, kotaGunlugeYazilsinMi } from "./lib/d1-kota.js";

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
  /** requestIdMiddleware tarafından her istekte set edilir — log/hata_log zincirleme için */
  requestId: string;
}

export const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Request correlation ID — en erken kaydedilir, sonraki her middleware/route
// c.get("requestId") ile log/hata_log zincirlemesi için kullanabilir.
app.use("/*", requestIdMiddleware);

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
  // Rate-limit header'ları default'ta tarayıcı JS'ine görünmez (CORS safelist
  // dışında) — sorgu.astro gibi client'lar gerçek kalan-kota'yı gösterebilsin.
  exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "X-Request-Id"],
  maxAge: 86400,
}));

// Global CSP header — tüm API response'larında (S4)
app.use("/*", async (c, next) => {
  await next();
  c.header("Content-Security-Policy", cspHeader());
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  // Her zaman Cloudflare üzerinden HTTPS servis ediliyor — HSTS standart sıkılaştırma.
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
});

// Blanket request body-size limiti — route-level ad hoc alan uzunluğu kontrolleri
// devrede kalıyor, bu sadece dev/kötü niyetli bir istemcinin route mantığına
// ulaşmadan önce büyük bir gövdeyle parse CPU'sunu yakmasını engelliyor.
app.use("/*", bodyLimit({
  maxSize: 1 * 1024 * 1024, // 1MB
  onError: (c) => c.json({ error: "İstek gövdesi çok büyük (maks 1MB)" }, 413),
}));

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
  const requestId = c.get("requestId" as never) as string | undefined;

  // D1 GÜNLÜK KOTASI — beklenen, süresi belli durum; "sunucu hatası" değil.
  // Hata kaydı YAZILMIYOR: kilitli D1'e yazılamaz, KV'ye düşüş ise yoğun
  // trafikte günlük 1.000 KV yazmasını dakikalar içinde bitirirdi.
  // Gerekçe: lib/d1-kota.ts başı.
  if (d1KotaHatasiMi(err)) {
    const saniye = kotaSifirlanmasinaSaniye();
    if (kotaGunlugeYazilsinMi()) {
      console.error(`[d1-kota-doldu] ${c.req.method} ${c.req.path} — sıfırlanmaya ${saniye} sn`);
    }
    c.header("Retry-After", String(saniye));
    c.header("Cache-Control", "no-store");
    return c.json({
      success: false,
      error: {
        code: "GUNLUK_KOTA_DOLDU",
        message: `Veri servisi bugünlük kullanım sınırına ulaştı; yaklaşık ${Math.ceil(saniye / 3600)} saat içinde yeniden açılacak.`,
        retry_after_saniye: saniye,
        requestId,
      },
    }, 503);
  }

  console.error(`[unhandled-error] ${c.req.method} ${c.req.path} (requestId=${requestId ?? "?"}):`, err);

  // Kalıcı kayıt — console.error yalnızca `wrangler tail` açıkken görülüyor,
  // dolayısıyla üretimde sunucu hatalarının görünürlüğü yoktu. waitUntil ile
  // arka plana atılıyor: 500 yanıtı D1 yazmasını beklemez.
  try {
    c.executionCtx.waitUntil(
      sunucuHatasiKaydet(c.env.DB, err, {
        method: c.req.method,
        path: c.req.path,
        requestId,
      }, c.env.RATE_LIMIT_KV),
    );
  } catch {
    // beklenen yokluk: executionCtx bazı bağlamlarda (ör. test, doğrudan
    // fetch çağrısı) tanımlı değil. Hata kaydı best-effort; asıl 500 yanıtı
    // aşağıda zaten dönüyor, buradan atılan hata onu maskelerdi.
  }

  return c.json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: c.env.ENVIRONMENT === "development" ? (err.message || String(err)) : "Sunucu hatası oluştu",
      requestId,
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
// HARİTA SINIRI — 2026-09-12'de düzeltildi.
//
// Eskiden tüm /v1/harita/* uçları saatte 30 istek paylaşıyordu. Oysa harita
// sayfası (site/src/scripts/harita-init.ts) GÖRÜNEN HER İLÇE İÇİN ayrı bir
// /harita/analiz/birlesik isteği atıyordu ve Türkiye görünümünde yüzlerce ilçe
// görünür. İlk açılışta ~30 istekten sonra her şey 429 alıyor, sayfa bunu
// "seed edilmemiş ilçe" diye yutuyordu → kullanıcı BOŞ HARİTA görüyordu.
// Fan-out 2026-07-10'da, 30/saat sınırı 2026-07-16'da geldi: sayfa yaklaşık
// iki aydır ilk açılışta çalışmıyordu.
//
// İki değişiklik:
//  1. /harita/likidite sınırdan MUAF — D1'e hiç dokunmuyor, statik tablo.
//     Maliyetsiz bir isteği sınırlamak yalnızca sayfayı bozuyordu.
//  2. D1 uçları 300/saat. Site artık uzak görünümde TEK /harita/ozet isteği
//     atıyor, ayrıntıyı yalnızca ≤40 ilçe görünürken yüklüyor; bir gezinme
//     oturumu bu sınırın rahatça altında kalıyor.
const haritaSinir = rateLimitMiddleware(300, "harita");
app.use("/v1/harita/*", async (c, next) => {
  if (c.req.path === "/v1/harita/likidite") return next();
  // Tip dönüşümü: uygulama Context'i AppVariables taşıyor, sınır ara katmanı
  // yalnızca { Bindings: Env } bekliyor — davranış aynı, yalnızca tip.
  return haritaSinir(c as unknown as Parameters<typeof haritaSinir>[0], next);
});

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

// ── Bearer-secret ile korunan /v1/admin endpoint'leri ───────────────────────
//
// DİKKAT — SIRALAMA KRİTİK: bu üç endpoint, aşağıdaki
// `app.route("/v1/admin", adminRoutes)` mount'undan ÖNCE tanımlanmak zorunda.
// adminRoutes `admin.use("*", jwtMiddleware)` ile TÜM /v1/admin/* yollarına
// JWT zorunluluğu koyuyor (routes/admin.ts:50). Hono ilk eşleşeni çalıştırdığı
// için mount'tan sonra tanımlanan bu handler'lara istek hiç ulaşmıyor, JWT
// middleware 401 "Geçersiz token" döndürüyordu — üçü de fiilen erişilemezdi.
// Bunlar cron/scraper tarafından Bearer secret ile çağrılıyor, JWT oturumu yok.

// İlan zenginleştirme — manuel tetikleme (Bearer SCRAPER_API_SECRET).
// Saatlik cron'da da çalışıyor; bu endpoint backfill'i hızlandırmak ve
// deploy sonrası doğrulama yapmak için. ?limit= ile parti boyutu ayarlanır.
app.post("/v1/admin/zenginlestir", async (c) => {
  const yetki = await bearerYetkilendir(
    c.req.header("Authorization"),
    c.env.SCRAPER_API_SECRET,
  );
  if (!yetki) return c.json({ error: "Unauthorized" }, 401);
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 20, 1), 200);
  const { emlakjetZenginlestirmeTuru } = await import("./lib/emlakjet-zenginlestirme.js");
  const sonuc = await emlakjetZenginlestirmeTuru(c.env.DB, limit);
  return c.json(sonuc);
});

// Milli Emlak ihale taraması — manuel tetikleme (Bearer SCRAPER_API_SECRET).
//
// UYARI: kaynak Cloudflare Workers ten 522 (timeout) veriyor, yerel makineden
// 200. Bu endpoint şu an pratikte çalışmıyor; veri scripts/milli-emlak-seed-uret.mjs
// ile yerelden toplanıyor. Kaynak CF egress ini kabul etmeye başlarsa çalışır
// hâle gelir, bu yüzden silinmedi. Durumu /v1/admin/kaynak-testi ile ölçün.
app.post("/v1/admin/milli-emlak-tara", async (c) => {
  const yetki = await bearerYetkilendir(
    c.req.header("Authorization"),
    c.env.SCRAPER_API_SECRET,
  );
  if (!yetki) return c.json({ error: "Unauthorized" }, 401);
  const { milliEmlakTaramaTuru } = await import("./lib/milli-emlak-scraper.js");
  const sonuc = await milliEmlakTaramaTuru(c.env.DB);
  return c.json(sonuc);
});

// Hepsiemlak taraması — manuel tetikleme (Bearer SCRAPER_API_SECRET).
//
// UYARI: kaynak Cloudflare Workers fetch ine 403 döndürüyor (TLS parmak izi
// filtresi). Bu endpoint şu an pratikte çalışmıyor; veri
// scripts/hepsiemlak-scrape.mjs ile yerelden (curl) toplanıyor. Erişim açılırsa
// çalışır hâle gelir, bu yüzden silinmedi. Durumu /v1/admin/kaynak-testi ile ölçün.
// ?ilce= ile tek ilçe, ?limit= ile parti boyutu.
app.post("/v1/admin/hepsiemlak-tara", async (c) => {
  const yetki = await bearerYetkilendir(
    c.req.header("Authorization"),
    c.env.SCRAPER_API_SECRET,
  );
  if (!yetki) return c.json({ error: "Unauthorized" }, 401);
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 3, 1), 20);
  const tekIlce = c.req.query("ilce");

  const sorgu = tekIlce
    ? c.env.DB.prepare(
        `SELECT il_norm, ilce_norm FROM tarama_durum
         WHERE kaynak = 'hepsiemlak' AND ilce_norm = ? LIMIT 1`,
      ).bind(tekIlce)
    : c.env.DB.prepare(
        `SELECT il_norm, ilce_norm FROM tarama_durum
         WHERE kaynak = 'hepsiemlak'
         ORDER BY son_tarama ASC NULLS FIRST LIMIT ?`,
      ).bind(limit);

  const hedef = await sorgu.all<{ il_norm: string; ilce_norm: string }>();
  const liste = (hedef.results ?? []).map((r) => ({ ilN: r.il_norm, ilceN: r.ilce_norm }));
  if (liste.length === 0) return c.json({ hata: "Hedef ilçe bulunamadı" }, 404);

  const { hepsiemlakRunBaslat } = await import("./lib/hepsiemlak-scraper.js");
  const sonuc = await hepsiemlakRunBaslat(c.env.DB, liste, liste.length, 25);
  return c.json(sonuc);
});

// Kaynak erişilebilirlik testi (Bearer STATS_SECRET).
//
// NEDEN: hepsiemlak, Node.js fetch e 403 döndürürken curl a 200 dönüyor —
// yani TLS/HTTP2 parmak izine göre filtreleme yapıyor, header ile aşılmıyor.
// Cloudflare Workers fetch inin hangi tarafta olduğu kaynağın kullanılabilir
// olup olmadığını belirliyor. Bu endpoint onu ölçer ve ileride kaynak
// erişimi sessizce bozulduğunda tespit etmeyi sağlar.
//
// Allowlist DIŞINDA URL kabul etmiyor — açık proxy hâline gelmesin.
const KAYNAK_TEST_URL: Record<string, string> = {
  hepsiemlak: "https://www.hepsiemlak.com/ceyhan-satilik/arsa",
  emlakjet: "https://www.emlakjet.com/satilik-arsa/istanbul-catalca",
  milliemlak: "https://mebis-s-p.csb.gov.tr/api/MileWeb/GetSatisIlanList",
};

app.get("/v1/admin/kaynak-testi", async (c) => {
  const yetki = await bearerYetkilendir(
    c.req.header("Authorization"),
    c.env.STATS_SECRET,
  );
  if (!yetki) return c.json({ error: "Unauthorized" }, 401);

  const sonuclar: Record<string, unknown> = {};
  for (const [ad, url] of Object.entries(KAYNAK_TEST_URL)) {
    try {
      const res = await fetch(url, {
        method: ad === "milliemlak" ? "POST" : "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
          "Accept-Language": "tr-TR,tr;q=0.9",
          ...(ad === "milliemlak"
            ? { "Content-Type": "application/json", Origin: "https://milliemlak.gov.tr" }
            : { Accept: "text/html,application/xhtml+xml" }),
        },
        body: ad === "milliemlak" ? JSON.stringify({ offset: 0, pageSize: 1 }) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
      const govde = await res.text();
      sonuclar[ad] = {
        status: res.status,
        ok: res.ok,
        boyut: govde.length,
        // Liste sayfalarında JSON-LD ilan bloğu var mı — 200 dönüp boş sayfa
        // servis edilmesi de bir başarısızlık türü.
        ilanIzi: /RealEstateListing|response_object/.test(govde),
      };
    } catch (e) {
      sonuclar[ad] = { hata: e instanceof Error ? e.message : String(e) };
    }
  }
  return c.json(sonuclar);
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



// AI Ajan — Fırsat Avcısı + Portföy Optimizasyonu + Bölge Analizi (JWT auth, Gemini)
app.use("/v1/ai-ajan/firsat",         rateLimitMiddleware(10, "ai-ajan-firsat"));
app.use("/v1/ai-ajan/portfoy-optimize", rateLimitMiddleware(5, "ai-ajan-portfoy")); // DB-heavy
app.use("/v1/ai-ajan/bolge-analiz",   rateLimitMiddleware(20, "ai-ajan-bolge")); // hafif
app.route("/v1/ai-ajan", ajanRoutes);

// Portföy — sunucu taraflı kayıtlı parsel listesi (JWT, Pro tier için sınırsız)
app.use("/v1/portfoy/*", rateLimitMiddleware(60, "portfoy"));
app.route("/v1/portfoy", portfoyRoutes);

// Gerçek satış feedback loop — anonim, mahalle bazlı kalibrasyon verisi
app.route("/v1/gercek-satis", gercekSatisRoutes);

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

/**
 * Cron ifadesi → bütçe tablosundaki okunabilir kaynak adı.
 *
 * Ham cron string'i (`"0 3 * * *"`) tabloya yazılsa rapor okunmaz olurdu:
 * "bugün limiti kim yedi" sorusunun cevabı bir zamanlama ifadesi değil, bir
 * iş adı olmalı. Listede olmayan bir cron gelirse `cron:<ifade>` ile yine de
 * kaydediliyor — sessizce kaybolmasın.
 */
const CRON_KAYNAK_ADI: Record<string, string> = {
  "0 3 * * *": "cron-gunluk",
  "0 * * * *": "cron-saatlik",
  "0 2 1 * *": "cron-aylik-sahibinden-endeks",
  "0 3 15 * *": "cron-aylik-emlakjet",
  "0 5 * * 1": "cron-haftalik-polygon",
};

// Cloudflare Workers entry point
export default {
  fetch: app.fetch,

  // Cron handler — wrangler.toml `crons` listesindeki her trigger'da çağrılır.
  // Workers Free plan hesap başına 5 trigger ile sınırlı — yeni işler (endeks,
  // api_jobs reaper) ayrı trigger yerine mevcut 5 slot'a gömülü çalışır:
  //   "0 3 * * *"   → istatistik + health + archive + temizlik
  //                   + EMLAKJET İLÇE TARAMASI (3 ilçe/gün)
  //   "0 * * * *"   → bildirim + api_jobs reaper + ilan zenginleştirme (120/tur)
  //   "0 2 1 * *"   → Sahibinden otomatik scraper + Cadex Fiyat Endeksi (ayın 1'i 02:00 UTC)
  //                   NOT: Sahibinden yolu 3 aydır her koşuda 'bot-bloke'
  //                   (PerimeterX). Endeks kısmı çalışıyor.
  //   "0 3 15 * *"  → Emlakjet aylık tarama (günlük tarama devreye girdi,
  //                   bu artık yedek/yakalama turu)
  //   "0 5 * * 1"   → parsel polygon değişiklik takibi
  // event.cron string'i ile ayırıyoruz.
  async scheduled(event: ScheduledEvent, envHam: Env, ctxHam: ExecutionContext) {
    const cron = event.cron;

    // ── OKUMA BÜTÇESİ ÖLÇÜMÜ ────────────────────────────────────────────────
    //
    // D1 ücretsiz katmanının 5M/gün okuma limiti iki kez doldu (2026-09-04 ve
    // 09-09) ve ikisinde de sistem 500 vermeye başlayana kadar hiçbir uyarı
    // olmadı. Üretimde günde 4 kullanıcı sorgusu var (`fiyat_katman_gunluk`),
    // yani yükün TAMAMI buradan — cron'lardan — geliyor. Hangisinden olduğu
    // bilinmiyordu.
    //
    // İki yerel gölgeleme, gövdedeki onlarca `env.DB` / `ctx.waitUntil`
    // çağrısına dokunmadan ölçümü açıyor:
    //
    //   env → DB'si `wrapD1` ile sarılmış kopya; her sorgunun meta'sı sayılıyor
    //   ctx → waitUntil'i, iş BİTTİKTEN SONRA sayacı tabloya boşaltan sarmalayıcı
    //
    // `butceyiBosalt` SARILMAMIŞ binding ile çağrılıyor (envHam.DB): sarılmış
    // olanla çağrılsa flush'ın kendisi sayaca eklenir ve sayaç asla boşalmazdı.
    const kaynak = CRON_KAYNAK_ADI[cron] ?? `cron:${cron}`;
    const env: Env = { ...envHam, DB: wrapD1(envHam.DB, kaynak) };
    const ctx: ExecutionContext = {
      waitUntil: (p: Promise<unknown>) =>
        ctxHam.waitUntil(
          // `finally`: iş hata verse de ölçüm yazılmalı. Bütçeyi en çok yiyen
          // koşum, yarıda patlayan koşum olabilir.
          p.finally(() => butceyiBosalt(envHam.DB)),
        ),
      passThroughOnException: () => ctxHam.passThroughOnException(),
    } as ExecutionContext;
    if (cron === "0 3 * * *") {
      ctx.waitUntil((async () => {
        // 1) İstatistik agregasyonu
        const r = await istatistikRefresh(env.DB);
        console.log("[cron-daily] istatistik:", r);

        // 1b) Özet tabloları — sıcak yoldaki tam taramaları buraya taşıyor.
        // Ücretsiz katmanın 5M/gün okuma limiti 2026-09-04'te doldu; sebebi
        // /toplu-ozet'in 188k satırlık taraması ve saatlik zenginleştirme
        // kuyruğunun iki CTE taraması idi. Ayrıntı: lib/ozet-tablolari.ts
        // İstatistik agregasyonundan SONRA koşmalı — il_fiyat_ozet onun
        // çıktısını okuyor.
        try {
          const ozet = await ilFiyatOzetiKur(env.DB);
          console.log("[cron-daily] il_fiyat_ozet:", ozet.yazilan, "satır,", ozet.sure_ms, "ms");
        } catch (e) {
          console.error("[cron-daily] il_fiyat_ozet hatası:", e);
        }
        // 1c) Doğrulama (bias) raporu — KV'ye. Eskiden kimliksiz /validation/public
        // ve /bias her çağrıda 47k satır tarıyordu; 24 saatte 4,57M okuma (limitin
        // %91'i). Ayrıntı: routes/validation.ts biasRaporuYenile üstü.
        try {
          const rapor = await biasRaporuYenile(env);
          console.log("[cron-daily] bias raporu KV'ye yazıldı:", rapor.toplamIlan, "ilan");
        } catch (e) {
          console.error("[cron-daily] bias raporu hatası:", e);
        }
        try {
          const kuyruk = await zenginlestirmeKuyruguKur(env.DB);
          console.log("[cron-daily] zenginlestirme_kuyruk:", kuyruk.yazilan, "mahalle,", kuyruk.sure_ms, "ms");
        } catch (e) {
          console.error("[cron-daily] zenginlestirme_kuyruk hatası:", e);
        }

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

        // 4) Emlakjet ilçe taraması — WORKER SIĞ TAZELEME YAPAR, DERİNLİK YEREL.
        //
        // ROL AYRIMI (2026-09-05'te netleştirildi):
        //   Worker cron : GENİŞLİK — çok ilçe × az sayfa. Mevcut ilanları taze
        //                 tutar. 15 dk wall limiti ve okuma bütçesi derinliğe
        //                 elvermiyor.
        //   Yerel koşu  : DERİNLİK — `npm run tarama:gece`, kapsam boşluğuna
        //                 göre sıralı, 25 sayfa. Süre sınırı yok.
        //
        // NEDEN AYRILDI: yorum ile kod ayrışmıştı. Yorumda "günde 8 → 4 ilçe,
        // tam tur ~7 ay" yazıyordu, kodda `LIMIT 3` + maxSayfa 25 vardı:
        // 871 ilçe / 3 = ~9,7 ay. Emsaller MAX_ILAN_YASI_GUN=180 ile düşüyor,
        // yani tam tur bitmeden veri eskiyordu. Worker'ı derinlik motoru
        // yapmaya çalışmak bu çelişkiyi çözmüyor — 15 dk'da 871 ilçe taranamaz.
        //
        // Wall time: Ağustos ölçümü 3 ilçe × 3 sayfa = 118 sn. 8 ilçe × 3
        // sayfa ≈ 5 dk, 15 dk limitin içinde.
        //
        // Derinlik damgası ayrı (migration 0033): bu sığ tur `son_tarama`yı
        // ilerletir ama `son_derin_tarama`ya dokunmaz, böylece derin
        // rotasyonun sırasını bozmaz.
        try {
          const hedefler = await env.DB.prepare(
            `SELECT il_norm, ilce_norm FROM tarama_durum
             WHERE kaynak = 'emlakjet' AND kategori = 'arsa'
             ORDER BY son_tarama ASC NULLS FIRST LIMIT 8`,
          ).all<{ il_norm: string; ilce_norm: string }>();
          const liste = (hedefler.results ?? []).map((r) => ({
            ilN: r.il_norm, ilceN: r.ilce_norm,
          }));
          if (liste.length > 0) {
            const r = await emlakjetCronBaslat(env.DB, liste, 8, 3, "cron-gunluk-siğ");
            console.log("[cron-daily] emlakjet tarama:", r);
          }
        } catch (e) {
          console.error("[cron-daily] emlakjet tarama hatası:", e);
        }

        // 5) HEPSİEMLAK CRON A BAĞLANAMIYOR — bilinçli olarak yok.
        //
        // ÖLÇÜM (/v1/admin/kaynak-testi): hepsiemlak Cloudflare Workers fetch ine
        // 403 döndürüyor. Node.js fetch de 403 alıyor; curl 200 alıyor. Header
        // setiyle aşılmıyor (sadece-UA, UA+Accept, tam tarayıcı başlık seti —
        // üçü de 403), yani filtre TLS/HTTP2 parmak izine bakıyor.
        //
        // Bu yüzden hepsiemlak verisi YEREL script ile toplanıyor:
        //   node scripts/hepsiemlak-scrape.mjs --maks-ilce=50 > scripts/hepsiemlak-data.sql
        //   npx wrangler d1 execute cadastrum-db --remote --file ../../scripts/hepsiemlak-data.sql
        // Parser mantığı lib/hepsiemlak-scraper.ts ile ortak ve test edilmiş
        // durumda; Worker tarafı erişim açılırsa buraya tek çağrıyla bağlanır.
      })());
    } else if (cron === "0 * * * *") {
      ctx.waitUntil((async () => {
        const r = await bildirimKontroluCalistir(env);
        console.log("[cron-hourly] bildirim:", r, "ts:", event.scheduledTime);

        // api_jobs reaper — POST /v2/batch job'ları waitUntil ortasında evict
        // edilirse sonsuza kadar 'isleniyor' durumunda takılı kalabilir.
        try {
          const rp = await apiJobsReaperCalistir(env.DB);
          console.log("[cron-hourly] api_jobs reaper:", rp.temizlenen, "job temizlendi");
        } catch (e) {
          console.error("[cron-hourly] api_jobs reaper hatası:", e);
        }

        // İlan zenginleştirme — detay sayfasından imar durumu + GERÇEK parsel
        // koordinatı + tapu durumu çeker. Kademeli backfill: her turda küçük
        // bir parti, kaynağa yük bindirmemek için istekler arası beklemeli.
        // Ayrı cron trigger'ı açılamıyor (Workers Free plan 5 trigger limiti),
        // bu yüzden saatlik slota gömülü.
        try {
          const { emlakjetZenginlestirmeTuru } = await import("./lib/emlakjet-zenginlestirme.js");
          // Parti 40 → 120: bu hızda 33.7k ilanlık backfill 35 günden ~12 güne
          // iniyor. İstekler arası 350ms bekleme DEĞİŞMEDİ — anlık yük aynı,
          // sadece her turda daha uzun süre çalışıyor (120 × ~0.85s ≈ 100 sn,
          // cron wall limiti 15 dk).
          const z = await emlakjetZenginlestirmeTuru(env.DB, 120);
          console.log(
            `[cron-hourly] zenginlestirme: ${z.zenginlesen}/${z.denenen} ilan ` +
            `(imar ${z.imarBulunan}, koord ${z.koordBulunan}, tapu ${z.tapuBulunan}, hata ${z.hata}, ${z.sure_ms}ms)`,
          );
        } catch (e) {
          console.error("[cron-hourly] zenginlestirme hatası:", e);
        }
      })());
    } else if (cron === "0 2 1 * *") {
      // Aylık scraper hatırlatma (A+E hibrit):
      //   1) Worker'dan Sahibinden fetch'i dener (PerimeterX engelliyor — beklenen)
      //   2) Sonuç ne olursa olsun admin'lere email at: "manuel Bootstrap çalıştır"
      ctx.waitUntil((async () => {
        const ilceler = await env.DB.prepare(
          `SELECT il_norm, ilce_norm FROM tarama_durum
           WHERE kaynak = 'emlakjet' AND kategori = 'arsa'
           ORDER BY son_tarama ASC NULLS FIRST LIMIT 5`,
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

        // Aylık Cadex Fiyat Endeksi hesaplama — aynı ayın-1'i slotuna gömülü
        // (ayrı bir "0 4 1 * *" trigger'ı Workers Free plan'ın 5 cron limitini aşardı)
        try {
          const { endeksHesapla } = await import("./routes/endeks.js");
          const er = await endeksHesapla(env.DB);
          console.log("[cron-monthly] endeks:", er.hesaplanan, "satır");
        } catch (e) {
          console.error("[cron-monthly] endeks hatası:", e);
        }
      })());
    } else if (cron === "0 3 15 * *") {
      // Emlakjet aylık scraper — ayın 15'i 03:00 UTC
      // Sahibinden'in aksine PerimeterX yok — Worker'dan direkt çalışır.
      // Worker CPU 30s limiti: maxIlce=8, maxSayfa=3 → ~20-25s içinde tamamlar.
      ctx.waitUntil((async () => {
        // En eski taranan ilçeleri seç (veya hiç taranmamışları)
        const ilceler = await env.DB.prepare(
          `SELECT il_norm, ilce_norm FROM tarama_durum
           WHERE kaynak = 'emlakjet' AND kategori = 'arsa'
           ORDER BY son_tarama ASC NULLS FIRST LIMIT 8`,
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
    } else if (cron === "0 5 * * 1") {
      // Haftalık parsel polygon takip — Pazartesi 05:00 UTC
      ctx.waitUntil((async () => {
        const baseUrl = "https://cadastrum-api.cadastrum-tr.workers.dev";
        const r = await parselTakipCalistir(env, baseUrl, 100);
        console.log("[cron-haftalik] parsel-takip:", r);

        // MİLLİ EMLAK CRON A BAĞLANAMIYOR — bilinçli olarak yok.
        //
        // ÖLÇÜM (/v1/admin/kaynak-testi): mebis-s-p.csb.gov.tr Cloudflare
        // Workers ten 522 (connection timed out) veriyor, üst üste denemelerde
        // de aynı. Yerel makineden 200 dönüyor. Kaynak, CF egress ini kabul
        // etmiyor gibi görünüyor.
        //
        // Veri YEREL script ile toplanıyor:
        //   node scripts/milli-emlak-seed-uret.mjs > scripts/milli-emlak-seed.sql
        //   npx wrangler d1 execute cadastrum-db --remote --file ../../scripts/milli-emlak-seed.sql
      })());
      // NOT: "*/30 * * * *" dalı kaldırıldı — o trigger wrangler.toml'da hiç
      // tanımlı değildi (Workers Free plan 5 trigger limiti), dolayısıyla dal
      // asla çalışmıyordu. api_jobs reaper zaten saatlik slotta koşuyor.
    } else {
      console.warn("[cron] beklenmeyen schedule:", cron);
    }
  },
};
