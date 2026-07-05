/**
 * Cinematic hero media — Higgsfield (veya başka) asset'leri buraya bağlanır.
 *
 * Akış:
 * 1. Higgsfield MCP ile ilk kare / son kare / kısa video üret
 * 2. Dosyaları site/public/hero/ altına koy (hero.webm + poster.webp)
 * 3. Aşağıdaki path'leri doldur — scroll-scrub otomatik video'yu kullanır
 *
 * VIDEO boşken prosedürel kadastro animasyonu (SVG) devreye girer.
 */
export const HERO_VIDEO: string | null = "/hero/hero.webm";
export const HERO_VIDEO_FALLBACK: string | null = "/hero/hero.mp4";
export const HERO_POSTER: string | null = "/hero/poster.webp";

/** Scroll scrub yüksekliği (viewport katı). 1.6 = kısa, 2.2 = daha sinematik */
export const HERO_SCRUB_VH = 1.85;
