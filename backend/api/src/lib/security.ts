/**
 * Güvenlik yardımcı fonksiyonları — tüm route'lardan import edilir.
 *
 * S3 — Timing-safe secret karşılaştırma:
 *   Düz string === timing attack'a açık; crypto.subtle.timingSafeEqual sabit sürede çalışır.
 *
 * S1 — Bearer token doğrulama:
 *   Secrets artık URL query param'da değil, Authorization: Bearer header'ında.
 */

/**
 * Sabit-zamanlı string karşılaştırma — timing attack önlemi.
 * crypto.subtle.timingSafeEqual Cloudflare Workers'ta mevcut.
 */
export async function secureCompare(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  try {
    return crypto.subtle.timingSafeEqual(aBytes, bBytes);
  } catch {
    // Fallback: length eşit, en azından === kullan
    return a === b;
  }
}

/**
 * Authorization: Bearer <token> header'ını güvenli çek + karşılaştır.
 * Format kontrolü + timing-safe compare.
 *
 * @param authHeader  - c.req.header("Authorization")
 * @param beklenenSecret - c.env.SCRAPER_API_SECRET vb.
 */
export async function bearerYetkilendir(
  authHeader: string | undefined,
  beklenenSecret: string | undefined,
): Promise<boolean> {
  if (!authHeader || !beklenenSecret) return false;
  if (!authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  return secureCompare(token, beklenenSecret);
}

/**
 * Content-Security-Policy header'ı ekle.
 * API endpoint'leri için minimal CSP — JSON API'si, tarayıcıda render yok.
 */
export function cspHeader(): string {
  return "default-src 'none'; frame-ancestors 'none'";
}
