/**
 * Merkezi config — API endpoint, LemonSqueezy variant, vb. tek noktadan yönetim.
 *
 * Production'da `PUBLIC_API_BASE` env var ile override edilebilir; default
 * yeni Cloudflare Worker URL'si.
 *
 * Eski hardcoded `https://api.cadastrum.com.tr/v1` referansları bu config'i
 * import edecek (S2.2 refactor).
 */

export const PUBLIC_API_BASE =
  import.meta.env.PUBLIC_API_BASE ??
  "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

/**
 * LemonSqueezy ödeme variant ID'leri. Production'da .env'den gelmeli.
 * Free tier checkout linki yok; Pro/Pro+ için variant ID gerekir.
 */
export const LEMON_PRO_VARIANT = import.meta.env.PUBLIC_LEMON_PRO_VARIANT ?? "";
export const LEMON_PROPLUS_VARIANT = import.meta.env.PUBLIC_LEMON_PROPLUS_VARIANT ?? "";

/**
 * Brand sabitleri — manifest, theme-color, OG image vb. ile sync.
 */
export const BRAND = {
  name: "Cadastrum",
  themeColor: "#1B2A4A", // Imperial Blue
  accentColor: "#C9A875", // Champagne
  domain: "cadastrum.com.tr",
} as const;
