/**
 * Request-correlation-ID middleware.
 *
 * Şu ana kadar tek bir isteği rate-limit → route handler → D1 yavaş-sorgu
 * logu → hata_log arasında zincirlemenin yolu yoktu. Bu middleware her
 * isteğe bir kimlik atar (istemci zaten `X-Request-Id` gönderdiyse onu
 * korur — Astro site/extension zincirleme çağrılarda kullanabilir),
 * `c.set("requestId", ...)` ile route handler'ların erişimine açar ve
 * response header'ı olarak yankılar.
 */
import type { Context, Next } from "hono";

export async function requestIdMiddleware(c: Context, next: Next): Promise<void> {
  const id = c.req.header("X-Request-Id") || crypto.randomUUID();
  c.set("requestId" as never, id as never);
  await next();
  c.header("X-Request-Id", id);
}
