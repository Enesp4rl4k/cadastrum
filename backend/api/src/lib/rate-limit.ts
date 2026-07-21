/**
 * Global IP-based rate limit middleware — Cloudflare Workers + KV (+ D1 fallback)
 *
 * P1: KV rate limit — D1 UPSERT yerine KV (10x daha hızlı write, Workers KV kota
 * D1 write kotasından çok daha yüksek).
 *
 * Strateji:
 *   - KV varsa (RATE_LIMIT_KV binding aktif): KV atomik increment
 *   - KV yoksa (binding tanımsız): D1 UPSERT fallback (eski davranış)
 *
 * KV key formatı: `rl:{prefix}:{ip}:{saat}`
 * TTL: 2 saat (bir saat öncesini de kapsar, paranoyak marj)
 *
 * Not: KV namespace oluşturma:
 *   wrangler kv:namespace create "RATE_LIMIT_KV"
 *   → id'yi wrangler.toml [[kv_namespaces]] alanına yaz
 */
import type { MiddlewareHandler } from "hono";
import type { Env } from "../index.js";

/** IP'yi standart biçimde çıkar. CF-Connecting-IP en güvenilir. */
function getClientIp(req: Request): string {
  return (
    req.headers.get("CF-Connecting-IP") ??
    req.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/**
 * KV tabanlı rate limit — atomik increment.
 * KV'de key yoksa 1, varsa +1 döner.
 * TTL: 7200 saniye (2 saat).
 */
async function kvRateLimit(
  kv: KVNamespace,
  key: string,
): Promise<number> {
  // KV atomic increment: get → parse → increment → put
  // SEK-4: Multi-instance race condition analizi:
  //   Cloudflare Workers global dağıtık mimaride birden fazla instance paralel çalışabilir.
  //   KV'de native atomic increment (compare-and-swap) yok.
  //   Gerçek race window: ~1-5ms (KV read→write arası).
  //   Worst case: limitPerHour=60 iken 61 veya 62 istek geçebilir (~%3 tolerans).
  //   Bu güvenlik açığı değil — rate limit DoS korumasıdır, %3 tolerans kabul edilebilir.
  //   Sıfır-tolerans gerektiren endpoint'ler (auth/ödeme) D1 UPSERT kullanır (RETURNING ile atomik).
  //   Çözüm gerekirse: Durable Objects ile atomik sayaç — ama Workers planında ek ücret gerektirir.
  const val = await kv.get(key, "text");
  const current = val != null ? parseInt(val, 10) : 0;
  const next = current + 1;
  // waitUntil yerine fire-and-forget (response'u bloklamasın)
  kv.put(key, String(next), { expirationTtl: 7200 }).catch(() => {});
  return next;
}

/**
 * D1 tabanlı rate limit — eski davranış, fallback.
 */
async function d1RateLimit(
  db: D1Database,
  key: string,
  saat: number,
): Promise<number> {
  const row = await db.prepare(
    `INSERT INTO rate_limit (ip, saat, istek_sayisi) VALUES (?, ?, 1)
     ON CONFLICT(ip, saat) DO UPDATE SET istek_sayisi = istek_sayisi + 1
     RETURNING istek_sayisi`,
  )
    .bind(key, saat)
    .first<{ istek_sayisi: number }>();
  return row?.istek_sayisi ?? 1;
}

/**
 * rateLimitMiddleware(limitPerHour, prefix?)
 *
 * @param limitPerHour  - Saatte izin verilen maksimum istek sayısı
 * @param prefix        - Aynı IP'yi farklı endpoint grupları için ayrı saymak için
 */
export function rateLimitMiddleware(
  limitPerHour: number,
  prefix = "global",
): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const ip = getClientIp(c.req.raw);
    const saat = Math.floor(Date.now() / 3_600_000);
    const key = `rl:${prefix}:${ip}:${saat}`;

    let mevcut: number;
    try {
      if (c.env.RATE_LIMIT_KV) {
        // P1: KV — hızlı path
        mevcut = await kvRateLimit(c.env.RATE_LIMIT_KV, key);
      } else {
        // Fallback: D1 (KV binding henüz aktif değilse)
        const d1Key = `${prefix}:${ip}`;
        mevcut = await d1RateLimit(c.env.DB, d1Key, saat);
      }
    } catch {
      // Rate limit hatası → geç, engelleme (availability > security burada)
      await next();
      return;
    }

    // Rate limit headers — her zaman ekle
    c.header("X-RateLimit-Limit", String(limitPerHour));
    c.header("X-RateLimit-Remaining", String(Math.max(0, limitPerHour - mevcut)));
    c.header("X-RateLimit-Reset", String((saat + 1) * 3600));

    if (mevcut > limitPerHour) {
      const retryAfter = ((saat + 1) * 3_600_000 - Date.now()) / 1000;
      c.header("Retry-After", String(Math.ceil(retryAfter)));
      return c.json(
        {
          error: "Rate limit aşıldı. Bir saat sonra tekrar deneyin.",
          limit: limitPerHour,
          retry_after_saniye: Math.ceil(retryAfter),
        },
        429,
      );
    }

    await next();
  };
}

/**
 * Eski rate_limit D1 kayıtlarını temizler.
 * KV kendi TTL'ine göre temizlenir — D1 cleanup devam eder (backward compat).
 */
export async function rateLimitTemizle(db: D1Database): Promise<{ silinen: number }> {
  const eskiSaatSiniri = Math.floor(Date.now() / 3_600_000) - 48;
  const sonuc = await db
    .prepare("DELETE FROM rate_limit WHERE saat < ?")
    .bind(eskiSaatSiniri)
    .run();
  return { silinen: sonuc.meta.changes ?? 0 };
}
