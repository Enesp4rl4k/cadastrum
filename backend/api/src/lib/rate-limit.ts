/**
 * Global IP-based rate limit middleware — Cloudflare Workers + D1
 *
 * Kullanım:
 *   import { rateLimitMiddleware } from "../lib/rate-limit.js";
 *   app.use("/v1/fiyat/*", rateLimitMiddleware(60));   // saatte 60 istek
 *   app.use("/v1/proxy/*", rateLimitMiddleware(100));  // saatte 100 istek
 *
 * Nasıl çalışır:
 *   - rate_limit tablosunda (ip, saat) anahtarlıyla istek sayısı tutulur.
 *   - Her istek atomik UPSERT ile sayacı artırır.
 *   - Limit aşılınca 429 döner, Retry-After header'ı ile saat sonunu bildirir.
 *   - Cloudflare Workers'da module-level değişken instance'lar arası paylaşılmaz,
 *     bu yüzden cleanup tamamen DB tarafında cron ile yapılır (bkz. index.ts scheduled).
 *
 * Güvenlik notları:
 *   - IP, CF-Connecting-IP header'ından alınır (Cloudflare edge'de güvenilir).
 *   - JWT token'ı olan kullanıcılara opsiyonel olarak yüksek limit verilebilir.
 *   - rate_limit tablosu: CREATE TABLE rate_limit (ip TEXT, saat INTEGER, istek_sayisi INTEGER,
 *       PRIMARY KEY(ip, saat))
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
 * rateLimitMiddleware(limitPerHour, prefix?)
 *
 * @param limitPerHour  - Saatte izin verilen maksimum istek sayısı
 * @param prefix        - rate_limit tablosundaki IP anahtarı öneki (aynı IP'yi
 *                        farklı endpoint grupları için ayrı saymak için).
 *                        Örn: "fiyat", "proxy", "sorgu"
 */
export function rateLimitMiddleware(
  limitPerHour: number,
  prefix = "global",
): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const ip = getClientIp(c.req.raw);
    const saat = Math.floor(Date.now() / 3_600_000);
    const key = `${prefix}:${ip}`;

    // Atomik increment — SELECT + INSERT/UPDATE yerine tek sorgu
    const row = await c.env.DB.prepare(
      `INSERT INTO rate_limit (ip, saat, istek_sayisi) VALUES (?, ?, 1)
       ON CONFLICT(ip, saat) DO UPDATE SET istek_sayisi = istek_sayisi + 1
       RETURNING istek_sayisi`,
    )
      .bind(key, saat)
      .first<{ istek_sayisi: number }>();

    const mevcut = row?.istek_sayisi ?? 1;

    // Rate limit headers — her zaman ekle (izleme için)
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
 * Eski rate_limit kayıtlarını temizler.
 * Cron handler'dan (scheduled) çağrılır — "0 3 * * *" günlük temizlik.
 * Module-level state kullanmaz, tamamen DB tabanlı.
 */
export async function rateLimitTemizle(db: D1Database): Promise<{ silinen: number }> {
  // 48 saatten eski kayıtları sil (güvenli marj — 24 yeterli ama 48 daha güvenli)
  const eskiSaatSiniri = Math.floor(Date.now() / 3_600_000) - 48;
  const sonuc = await db
    .prepare("DELETE FROM rate_limit WHERE saat < ?")
    .bind(eskiSaatSiniri)
    .run();
  return { silinen: sonuc.meta.changes ?? 0 };
}
