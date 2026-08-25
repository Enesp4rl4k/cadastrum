/**
 * Extension API sabitleri — tek merkezi kaynak.
 *
 * Tüm extension lib ve bileşenleri buradan import etmeli:
 *   import { BACKEND_API } from "../lib/api-constants";
 *
 * Geliştirme ortamında VITE_API_BASE env var ile override edilebilir.
 * Production build'de hardcoded URL kullanılır (extension'da process.env yok).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _env = (import.meta as any).env ?? {};

/** Backend Cloudflare Worker URL — tüm API istekleri buraya */
export const BACKEND_API: string =
  _env.VITE_API_BASE ?? "https://cadastrum-api.cadastrum-tr.workers.dev/v1";
