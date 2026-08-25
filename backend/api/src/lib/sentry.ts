/**
 * Sentry Cloudflare Workers entegrasyonu
 *
 * Kullanım:
 *   import { sentryMiddleware } from "./lib/sentry.js";
 *   app.use("/*", sentryMiddleware);
 *
 * Kurulum:
 *   1. npm install @sentry/cloudflare  (backend/api dizininde)
 *   2. wrangler secret put SENTRY_DSN   → https://...@o0.ingest.sentry.io/...
 *   3. wrangler.toml'a ekle: [vars] SENTRY_DSN = ""  (boş placeholder)
 *
 * DSN yoksa (boş veya eksik) middleware no-op olarak çalışır.
 * Bu sayede DSN olmadan da deploy edilebilir.
 */
import type { MiddlewareHandler } from "hono";
import type { Env } from "../index.js";

type AppCtx = { Bindings: Env & { SENTRY_DSN?: string } };

// Sentry SDK referansı — lazy init
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sentryRef: any = null;
let sentryInitDenendi = false;

async function sentryBaslat(dsn: string): Promise<void> {
  if (sentryInitDenendi) return;
  sentryInitDenendi = true;
  try {
    // @sentry/cloudflare opsiyonel bağımlılık
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sentryRef = await import("@sentry/cloudflare" as any);
  } catch {
    // Paket kurulmamış — sessizce atla
    sentryRef = null;
  }
}

/**
 * Hono middleware: istek/yanıt çevresinde hataları Sentry'e ilet.
 * SENTRY_DSN env var yoksa no-op.
 */
export const sentryMiddleware: MiddlewareHandler<AppCtx> = async (c, next) => {
  const dsn = (c.env as AppCtx["Bindings"]).SENTRY_DSN;
  if (!dsn) {
    await next();
    return;
  }

  // İlk istekte SDK'yı başlat
  if (!sentryInitDenendi) await sentryBaslat(dsn);

  if (!sentryRef?.withSentry) {
    // SDK kurulmamış → sadece devam et
    await next();
    return;
  }

  try {
    await next();
  } catch (err) {
    // Hata oluştuysa Sentry'e bildir, sonra yeniden fırlat
    try {
      sentryRef.captureException(err, {
        tags: {
          path: c.req.path,
          method: c.req.method,
        },
      });
    } catch {
      // Sentry bildirimi başarısız — orijinal hatayı yine fırlat
    }
    throw err;
  }
};

/**
 * Manuel hata bildirimi — route handler'lardan çağırılabilir.
 * Sentry kurulmamışsa no-op.
 */
export function sentryHataBildir(
  err: unknown,
  ctx?: Record<string, unknown>,
): void {
  try {
    if (sentryRef?.captureException) {
      sentryRef.captureException(err, { extra: ctx });
    }
  } catch {
    // sessiz
  }
}
