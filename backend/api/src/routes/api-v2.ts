/**
 * Cadastrum Kurumsal API v2
 *
 * Endpoints (X-API-Key: cdrm_xxx zorunlu):
 *   POST /v2/degerle        — tek koordinat, senkron değerleme (<500ms)
 *   POST /v2/batch          — 1–500 koordinat, async job
 *   GET  /v2/batch/:id      — job durumu + sonuç URL'i
 *   GET  /v2/health         — API sağlık
 *
 * Authentication: public-api.ts'teki apiKeyMiddleware ile aynı mekanizma.
 * Bu route'lar index.ts'e şu şekilde bağlanır:
 *   app.route("/v2", apiV2Routes);
 *
 * Rate limit:
 *   /v2/degerle  → 60/dk (token bazlı, public-api.ts ile paylaşılan tablo)
 *   /v2/batch    → 5/dk  (heavy job, ayrı sınır)
 */

import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { Env } from "../index.js";
import { kmToDegrees, turkiyeBboxIcinde } from "../lib/geo.js";
import { normalizeYerAdi } from "../lib/normalize.js";
import { log } from "../lib/logger.js";
import { rateLimitMiddleware } from "../lib/rate-limit.js";
import { wrapD1 } from "../lib/db-timing.js";

export const apiV2Routes = new Hono<{ Bindings: Env }>();

// ── Tipler ───────────────────────────────────────────────────────────────────

interface DegerleIstek {
  lat: number;
  lng: number;
  /** m² (opsiyonel — emsal hesabı için) */
  alan_m2?: number | null;
  /** arsa | tarla | konut (varsayılan: arsa) */
  kategori?: string | null;
}

interface BatchIstek {
  /** 1–500 koordinat */
  koordinatlar: DegerleIstek[];
  /** Webhook URL — job tamamlanınca POST edilir (opsiyonel) */
  webhook_url?: string | null;
}

interface JobRow {
  id: string;
  durum: "bekliyor" | "isleniyor" | "tamamlandi" | "hata";
  istek_sayisi: number;
  tamamlanan: number;
  hata_sayisi: number;
  sonuc_json: string | null;
  olusturuldu: number;
  tamamlandi_ts: number | null;
  webhook_url: string | null;
  api_key_hash: string;
}

// ── SHA-256 (public-api.ts ile aynı — DRY olması için lib'e taşınabilir) ────

async function sha256(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── API Key Middleware ────────────────────────────────────────────────────────

interface TokenRow {
  id: number;
  kullanici_id: number;
  rate_limit_per_min: number;
  iptal_edildi: number;
}

const apiKeyMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const apiKey = c.req.header("X-API-Key");
  if (!apiKey?.startsWith("cdrm_")) {
    return c.json({ error: "Missing or invalid X-API-Key" }, 401);
  }
  const hash = await sha256(apiKey);
  const tok = await c.env.DB.prepare(
    `SELECT id, kullanici_id, rate_limit_per_min, iptal_edildi
     FROM api_tokens WHERE token_hash = ?`,
  ).bind(hash).first<TokenRow>();

  if (!tok || tok.iptal_edildi) {
    return c.json({ error: "Invalid or revoked API key" }, 401);
  }

  // Token bazlı rate limit — public-api.ts ile aynı tablo
  const dakika = Math.floor(Date.now() / 60000);
  const rr = await c.env.DB.prepare(
    `INSERT INTO api_token_rate (token_id, dakika, istek_sayisi) VALUES (?, ?, 1)
     ON CONFLICT(token_id, dakika) DO UPDATE SET istek_sayisi = istek_sayisi + 1
     RETURNING istek_sayisi`,
  ).bind(tok.id, dakika).first<{ istek_sayisi: number }>();

  if ((rr?.istek_sayisi ?? 1) > tok.rate_limit_per_min) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  await c.env.DB.prepare(`UPDATE api_tokens SET son_kullanim = ? WHERE id = ?`)
    .bind(Date.now(), tok.id).run();

  c.set("tokenId" as never, tok.id);
  c.set("apiKullaniciId" as never, tok.kullanici_id);
  c.set("apiKeyHash" as never, hash);
  await next();
};

// ── Yardımcı: Koordinat bazlı değerleme hesabı ───────────────────────────────

interface DegerlemeSonuc {
  lat: number;
  lng: number;
  kategori: string;
  alan_m2: number | null;
  /** Medyan TL/m² */
  medyan_tl_m2: number | null;
  /** Alt band (Q1 veya medyan*0.75) */
  alt_tl_m2: number | null;
  /** Üst band (Q3 veya medyan*1.30) */
  ust_tl_m2: number | null;
  /** Toplam tahmini değer (alan_m2 varsa) */
  toplam_tl: number | null;
  /** Veri güven skoru 0–100 */
  guven: number;
  /** Kaç emsal kullanıldı */
  emsal_adet: number;
  /** Risk bilgileri */
  risk: {
    deprem_zon: string | null;
    deprem_pga: number | null;
    taskin_risk: "yuksek" | "orta" | "dusuk" | null;
  };
  /** En yakın mahalle/ilçe */
  konum: {
    il_norm: string | null;
    ilce_norm: string | null;
    mahalle_norm: string | null;
  };
  hesaplama_ms: number;
}

// Deprem PGA tablosu — public-api.ts ile senkron
const IL_PGA: Record<string, number> = {
  adana: 0.35, adiyaman: 0.40, afyonkarahisar: 0.25, agri: 0.30, aksaray: 0.20,
  amasya: 0.20, ankara: 0.15, antalya: 0.25, ardahan: 0.25, artvin: 0.30,
  aydin: 0.35, balikesir: 0.30, bartin: 0.15, batman: 0.30, bayburt: 0.30,
  bilecik: 0.30, bingol: 0.45, bitlis: 0.35, bolu: 0.40, burdur: 0.30,
  bursa: 0.30, canakkale: 0.35, cankiri: 0.20, corum: 0.20, denizli: 0.35,
  diyarbakir: 0.30, duzce: 0.45, edirne: 0.10, elazig: 0.40, erzincan: 0.50,
  erzurum: 0.35, eskisehir: 0.20, gaziantep: 0.35, giresun: 0.30, gumushane: 0.30,
  hakkari: 0.35, hatay: 0.40, igdir: 0.30, isparta: 0.25, istanbul: 0.35,
  izmir: 0.40, kahramanmaras: 0.45, karabuk: 0.15, karaman: 0.15, kars: 0.30,
  kastamonu: 0.15, kayseri: 0.20, kilis: 0.35, kirikkale: 0.15, kirklareli: 0.10,
  kirsehir: 0.20, kocaeli: 0.40, konya: 0.15, kutahya: 0.25, malatya: 0.40,
  manisa: 0.35, mardin: 0.30, mersin: 0.25, mugla: 0.30, mus: 0.40,
  nevsehir: 0.15, nigde: 0.15, ordu: 0.25, osmaniye: 0.35, rize: 0.30,
  sakarya: 0.40, samsun: 0.20, sanliurfa: 0.30, siirt: 0.35, sinop: 0.15,
  sirnak: 0.35, sivas: 0.25, tekirdag: 0.15, tokat: 0.25, trabzon: 0.25,
  tunceli: 0.45, usak: 0.30, van: 0.40, yalova: 0.40, yozgat: 0.20, zonguldak: 0.15,
};

const IL_TASKIN: Record<string, "yuksek" | "orta"> = {
  rize: "yuksek", artvin: "yuksek", giresun: "yuksek",
  ordu: "orta", trabzon: "orta", kastamonu: "orta", sinop: "orta",
  bartin: "orta", zonguldak: "orta", duzce: "orta", bolu: "orta",
  sakarya: "orta", samsun: "orta", hatay: "orta", adana: "orta", mersin: "orta",
};

async function koordinatDegerle(
  db: D1Database,
  istek: DegerleIstek,
): Promise<DegerlemeSonuc> {
  const baslangic = Date.now();
  const { lat, lng } = istek;
  const kategori = ["arsa", "tarla", "konut"].includes(istek.kategori ?? "")
    ? (istek.kategori as string)
    : "arsa";
  const alanM2 = istek.alan_m2 && istek.alan_m2 > 0 ? Math.round(istek.alan_m2) : null;

  // 1. Spatial emsal — 3km radius, son 12 ay
  const { latDelta, lngDelta } = kmToDegrees(3, lat);
  const yasEsigi = Date.now() - 365 * 86_400_000;

  const emsalRows = await db.prepare(
    `SELECT fiyat_per_m2, m2, lat, lng
     FROM ilanlar
     WHERE kategori = ? AND aktif = 1
       AND lat IS NOT NULL AND lat BETWEEN ? AND ?
       AND lng BETWEEN ? AND ?
       AND yakalanma_tarihi >= ?
     ORDER BY ABS(lat - ?) + ABS(lng - ?) ASC
     LIMIT 100`,
  ).bind(
    kategori,
    lat - latDelta, lat + latDelta,
    lng - lngDelta, lng + lngDelta,
    yasEsigi,
    lat, lng,
  ).all<{ fiyat_per_m2: number; m2: number | null; lat: number; lng: number }>();

  const emsaller = (emsalRows.results ?? []).filter(
    (e) => e.fiyat_per_m2 > 0 && e.fiyat_per_m2 < 10_000_000,
  );

  // 2. En yakın mahalle/ilçe tespiti — ilanlardan reverse-geocode benzeri
  let ilNorm: string | null = null;
  let ilceNorm: string | null = null;
  let mahalleNorm: string | null = null;

  const yakinIl = await db.prepare(
    `SELECT il_norm, ilce_norm, mahalle_norm
     FROM ilanlar
     WHERE lat IS NOT NULL AND lat BETWEEN ? AND ?
       AND lng BETWEEN ? AND ?
     LIMIT 1`,
  ).bind(
    lat - latDelta / 2, lat + latDelta / 2,
    lng - lngDelta / 2, lng + lngDelta / 2,
  ).first<{ il_norm: string; ilce_norm: string; mahalle_norm: string }>();

  if (yakinIl) {
    ilNorm = yakinIl.il_norm;
    ilceNorm = yakinIl.ilce_norm;
    mahalleNorm = yakinIl.mahalle_norm;
  }

  // 3. Medyan hesapla — IQR ile aykırı değer temizliği
  let medyan: number | null = null;
  let altBand: number | null = null;
  let ustBand: number | null = null;
  let guven = 0;

  if (emsaller.length > 0) {
    const fiyatlar = emsaller.map((e) => e.fiyat_per_m2).sort((a, b) => a - b);
    const n = fiyatlar.length;
    const q1Idx = Math.floor(n * 0.25);
    const q3Idx = Math.floor(n * 0.75);
    const q1 = fiyatlar[q1Idx] ?? fiyatlar[0]!;
    const q3 = fiyatlar[q3Idx] ?? fiyatlar[n - 1]!;
    const iqr = q3 - q1;
    const alt = q1 - 1.5 * iqr;
    const ust = q3 + 1.5 * iqr;

    const temiz = fiyatlar.filter((f) => f >= alt && f <= ust);
    if (temiz.length > 0) {
      const midIdx = Math.floor(temiz.length / 2);
      medyan = temiz.length % 2 === 1
        ? temiz[midIdx]!
        : Math.round((temiz[midIdx - 1]! + temiz[midIdx]!) / 2);
      altBand = Math.round(q1);
      ustBand = Math.round(q3);

      // Güven skoru: emsal adedi + yaş dağılımı
      guven = Math.min(100, Math.round(
        (temiz.length >= 20 ? 40 : temiz.length * 2) +
        (temiz.length >= 5 ? 30 : temiz.length * 6) +
        (ilNorm ? 20 : 0) +
        (mahalleNorm ? 10 : 0),
      ));
    }
  }

  // Fallback: mahalle_istatistik tablosundan
  if (!medyan && ilNorm && ilceNorm && mahalleNorm) {
    const stat = await db.prepare(
      `SELECT medyan, q1, q3 FROM mahalle_istatistik
       WHERE il_norm = ? AND ilce_norm = ? AND mahalle_norm = ? AND kategori = ?`,
    ).bind(ilNorm, ilceNorm, mahalleNorm, kategori)
      .first<{ medyan: number; q1: number | null; q3: number | null }>();

    if (stat?.medyan) {
      medyan = stat.medyan;
      altBand = stat.q1 ?? Math.round(stat.medyan * 0.75);
      ustBand = stat.q3 ?? Math.round(stat.medyan * 1.30);
      guven = 35; // Statik tablo — düşük güven
    }
  }

  // 4. Risk bilgileri
  const normalIl = ilNorm ?? "";
  const pga = IL_PGA[normalIl] ?? null;
  const depremZon = pga
    ? pga >= 0.40 ? "Z1" : pga >= 0.20 ? "Z2" : pga >= 0.10 ? "Z3" : "Z4"
    : null;
  const taskinRisk: "yuksek" | "orta" | "dusuk" =
    IL_TASKIN[normalIl] ?? "dusuk";

  return {
    lat,
    lng,
    kategori,
    alan_m2: alanM2,
    medyan_tl_m2: medyan,
    alt_tl_m2: altBand,
    ust_tl_m2: ustBand,
    toplam_tl: medyan && alanM2 ? Math.round(medyan * alanM2) : null,
    guven,
    emsal_adet: emsaller.length,
    risk: {
      deprem_zon: depremZon,
      deprem_pga: pga,
      taskin_risk: taskinRisk,
    },
    konum: {
      il_norm: ilNorm,
      ilce_norm: ilceNorm,
      mahalle_norm: mahalleNorm,
    },
    hesaplama_ms: Date.now() - baslangic,
  };
}

// ── GET /v2/health ────────────────────────────────────────────────────────────

apiV2Routes.get(
  "/health",
  apiKeyMiddleware,
  (c) => c.json({ ok: true, version: "2", ts: Date.now() }),
);

// ── POST /v2/degerle ─────────────────────────────────────────────────────────

apiV2Routes.post(
  "/degerle",
  apiKeyMiddleware,
  rateLimitMiddleware(60, "api-v2-degerle"),
  async (c) => {
    let body: DegerleIstek;
    try {
      body = await c.req.json<DegerleIstek>();
    } catch {
      return c.json({ error: "Geçersiz JSON gövdesi" }, 400);
    }

    const { lat, lng } = body;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return c.json({ error: "lat ve lng sayısal olmalı" }, 400);
    }
    if (!turkiyeBboxIcinde(lat, lng)) {
      return c.json({ error: "Koordinat Türkiye sınırları dışında" }, 422);
    }

    try {
      const sonuc = await koordinatDegerle(c.env.DB, body);
      log.info("api-v2.degerle", {
        lat: sonuc.lat,
        lng: sonuc.lng,
        medyan: sonuc.medyan_tl_m2,
        guven: sonuc.guven,
        ms: sonuc.hesaplama_ms,
      });
      return c.json(sonuc, 200, {
        "Cache-Control": "no-store",
      });
    } catch (e) {
      log.error("api-v2.degerle.hata", { hata: e instanceof Error ? e.message : String(e) });
      return c.json({ error: "Değerleme hesaplanamadı" }, 500);
    }
  },
);

// ── POST /v2/batch ────────────────────────────────────────────────────────────

apiV2Routes.post(
  "/batch",
  apiKeyMiddleware,
  rateLimitMiddleware(5, "api-v2-batch"),
  async (c) => {
    let body: BatchIstek;
    try {
      body = await c.req.json<BatchIstek>();
    } catch {
      return c.json({ error: "Geçersiz JSON gövdesi" }, 400);
    }

    const koordinatlar = body.koordinatlar;
    if (!Array.isArray(koordinatlar) || koordinatlar.length === 0) {
      return c.json({ error: "koordinatlar dizisi zorunlu" }, 400);
    }
    if (koordinatlar.length > 500) {
      return c.json({ error: "Maksimum 500 koordinat" }, 400);
    }

    // Türkiye bbox kontrolü — geçersizler için hata
    const gecersiz = koordinatlar.findIndex(
      (k) => !Number.isFinite(k.lat) || !Number.isFinite(k.lng) || !turkiyeBboxIcinde(k.lat, k.lng),
    );
    if (gecersiz >= 0) {
      return c.json({ error: `koordinatlar[${gecersiz}] geçersiz veya Türkiye dışında` }, 400);
    }

    const jobId = crypto.randomUUID();
    const apiKeyHash = c.get("apiKeyHash" as never) as string;
    const webhookUrl = body.webhook_url?.startsWith("https://") ? body.webhook_url : null;

    // Job kaydı oluştur
    await c.env.DB.prepare(
      `INSERT INTO api_jobs (id, api_key_hash, durum, istek_sayisi, tamamlanan, hata_sayisi, webhook_url, olusturuldu)
       VALUES (?, ?, 'bekliyor', ?, 0, 0, ?, ?)`,
    ).bind(jobId, apiKeyHash, koordinatlar.length, webhookUrl ?? null, Date.now()).run();

    // Arka planda işle (Workers CPU 30s limiti gözetilerek chunked)
    // waitUntil içinde çalışır, response kritik yolunun dışında — yavaş-sorgu
    // loglama maliyeti çağıranın gecikmesine yansımıyor.
    const timedDb = wrapD1(c.env.DB, "api-v2.batch");
    const asyncIslem = (async () => {
      try {
        await c.env.DB.prepare(`UPDATE api_jobs SET durum = 'isleniyor' WHERE id = ?`)
          .bind(jobId).run();

        const sonuclar: DegerlemeSonuc[] = [];
        let hataSayisi = 0;
        let tamamlanan = 0;

        // 50'lik chunk'lar — her chunk arası yield
        const CHUNK = 50;
        for (let i = 0; i < koordinatlar.length; i += CHUNK) {
          const dilim = koordinatlar.slice(i, i + CHUNK);
          const dilimSonuclar = await Promise.allSettled(
            dilim.map((k) => koordinatDegerle(timedDb, k)),
          );

          for (const s of dilimSonuclar) {
            if (s.status === "fulfilled") {
              sonuclar.push(s.value);
              tamamlanan++;
            } else {
              hataSayisi++;
              tamamlanan++;
            }
          }

          // Ara durum güncelle
          await c.env.DB.prepare(
            `UPDATE api_jobs SET tamamlanan = ?, hata_sayisi = ? WHERE id = ?`,
          ).bind(tamamlanan, hataSayisi, jobId).run().catch(() => {});
        }

        const sonucJson = JSON.stringify({
          toplam: koordinatlar.length,
          tamamlanan,
          hatalar: hataSayisi,
          sonuclar,
        });

        await c.env.DB.prepare(
          `UPDATE api_jobs SET durum = 'tamamlandi', sonuc_json = ?, tamamlandi_ts = ? WHERE id = ?`,
        ).bind(sonucJson, Date.now(), jobId).run().catch(() => {});

        log.info("api-v2.batch.tamamlandi", { jobId, tamamlanan, hataSayisi });

        // Webhook bildirimi
        if (webhookUrl) {
          try {
            await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                event: "batch.completed",
                job_id: jobId,
                tamamlanan,
                hatalar: hataSayisi,
              }),
              signal: AbortSignal.timeout(10_000),
            });
          } catch (e) {
            log.warn("api-v2.batch.webhook-hata", { jobId, hata: String(e) });
          }
        }
      } catch (e) {
        log.error("api-v2.batch.hata", { jobId, hata: String(e) });
        await c.env.DB.prepare(
          `UPDATE api_jobs SET durum = 'hata', tamamlandi_ts = ? WHERE id = ?`,
        ).bind(Date.now(), jobId).run().catch(() => {});
      }
    })();

    try {
      if (c.executionCtx && typeof c.executionCtx.waitUntil === "function") {
        c.executionCtx.waitUntil(asyncIslem);
      }
    } catch {
      // Direct request environment without ExecutionContext
    }

    return c.json(
      {
        job_id: jobId,
        durum: "bekliyor",
        istek_sayisi: koordinatlar.length,
        tahmini_sure_sn: Math.ceil(koordinatlar.length * 0.1),
      },
      202,
    );
  },
);

// ── GET /v2/batch/:id ─────────────────────────────────────────────────────────

apiV2Routes.get(
  "/batch/:id",
  apiKeyMiddleware,
  async (c) => {
    const id = c.req.param("id");
    const apiKeyHash = c.get("apiKeyHash" as never) as string;

    const job = await c.env.DB.prepare(
      `SELECT id, durum, istek_sayisi, tamamlanan, hata_sayisi,
              sonuc_json, olusturuldu, tamamlandi_ts, webhook_url
       FROM api_jobs WHERE id = ? AND api_key_hash = ?`,
    ).bind(id, apiKeyHash).first<JobRow>();

    if (!job) {
      return c.json({ error: "Job bulunamadı" }, 404);
    }

    const yanit: Record<string, unknown> = {
      job_id: job.id,
      durum: job.durum,
      istek_sayisi: job.istek_sayisi,
      tamamlanan: job.tamamlanan,
      hata_sayisi: job.hata_sayisi,
      olusturuldu: job.olusturuldu,
      tamamlandi_ts: job.tamamlandi_ts,
    };

    // Tamamlandıysa sonuçları ekle
    if (job.durum === "tamamlandi" && job.sonuc_json) {
      try {
        yanit.sonuclar = JSON.parse(job.sonuc_json);
      } catch {
        yanit.sonuclar = null;
      }
    }

    return c.json(yanit);
  },
);

/**
 * Reaper — POST /v2/batch, Worker instance `ctx.waitUntil()` ortasında evict edilirse
 * job'u sonsuza kadar `isleniyor` durumunda takılı bırakabilir (retry/dead-letter yok).
 * Cron'dan periyodik çağrılır: TTL'i aşan `isleniyor` job'ları `hata`ya çevirir, böylece
 * `GET /v2/batch/:id` çağıran istemci sonsuza kadar beklemek yerine net bir durum görür.
 */
export async function apiJobsReaperCalistir(
  db: D1Database,
  ttlMs = 10 * 60 * 1000,
): Promise<{ temizlenen: number }> {
  const esik = Date.now() - ttlMs;
  const r = await db
    .prepare(
      `UPDATE api_jobs SET durum = 'hata', tamamlandi_ts = ?
       WHERE durum = 'isleniyor' AND olusturuldu < ?`,
    )
    .bind(Date.now(), esik)
    .run();
  return { temizlenen: r.meta.changes ?? 0 };
}
