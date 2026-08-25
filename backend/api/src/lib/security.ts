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
  // GÜVENLIK: length karşılaştırmasını da constant-time yapıyoruz.
  // Erken "false" dönmek, uzunluk farkını timing side-channel ile sızdırırdı.
  // Her iki string'i aynı uzunluğa pad'leyip XOR yapıyoruz; length uyuşmazlığı
  // sonda ayrıca OR'lanıyor — toplam süre sabit kalır.
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  const maxLen = Math.max(aBytes.length, bBytes.length);
  const aPad = new Uint8Array(maxLen);
  const bPad = new Uint8Array(maxLen);
  aPad.set(aBytes);
  bPad.set(bBytes);
  try {
    const equal = crypto.subtle.timingSafeEqual(aPad, bPad);
    // Uzunluk farkı varsa false; ama bunu yukarıdaki işlem bittikten sonra OR'la
    return equal && aBytes.length === bBytes.length;
  } catch {
    // Fallback: padding sonrası manuel XOR — still constant-time for maxLen
    let diff = aBytes.length ^ bBytes.length;
    for (let i = 0; i < maxLen; i++) diff |= (aPad[i] ?? 0) ^ (bPad[i] ?? 0);
    return diff === 0;
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
