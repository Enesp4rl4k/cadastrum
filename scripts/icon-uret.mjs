/**
 * Cadastrum V3 Geometric logosundan PNG iconları üretir.
 *   public/icon-16.png, icon-48.png, icon-128.png (extension)
 *   site/public/favicon-32.png, favicon-16.png, apple-touch-icon.png
 *   site/public/og.png (1200x630 — OpenGraph)
 *
 * Kullanım: node scripts/icon-uret.mjs
 */

import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KOK = join(__dirname, "..");

// V3 Geometric SVG — favicon.svg ile aynı
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="30" fill="#1B2A4A"/>
  <path d="M 32 12 A 20 20 0 1 0 50 38"
        stroke="#FFFFFF" stroke-width="6" fill="none" stroke-linecap="round"/>
  <circle cx="50" cy="38" r="3.5" fill="#C9A86A" stroke="#1B2A4A" stroke-width="0.8"/>
  <circle cx="32" cy="32" r="27" fill="none" stroke="#C9A86A" stroke-width="0.5" opacity="0.5"/>
</svg>`;

const BOYUTLAR = [16, 48, 128];

for (const boyut of BOYUTLAR) {
  const cikti = join(KOK, "public", `icon-${boyut}.png`);
  await sharp(Buffer.from(SVG))
    .resize(boyut, boyut)
    .png({ compressionLevel: 9 })
    .toFile(cikti);
  console.log(`✓ ${cikti}`);
}

// Site favicon
const sitePublic = join(KOK, "site", "public");
await sharp(Buffer.from(SVG)).resize(32, 32).png().toFile(join(sitePublic, "favicon-32.png"));
await sharp(Buffer.from(SVG)).resize(16, 16).png().toFile(join(sitePublic, "favicon-16.png"));
await sharp(Buffer.from(SVG)).resize(180, 180).png().toFile(join(sitePublic, "apple-touch-icon.png"));

// OG image — 1200x630, V3 logo + brand text + tagline
const OG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1B2A4A"/>
      <stop offset="100%" stop-color="#0F1A33"/>
    </linearGradient>
    <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#FFFFFF" stroke-width="0.5" opacity="0.06"/>
    </pattern>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#C9A86A" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#C9A86A" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bgGrad)"/>
  <rect width="1200" height="630" fill="url(#grid)"/>

  <!-- Glow behind logo -->
  <circle cx="240" cy="315" r="220" fill="url(#glow)"/>

  <!-- V3 Logo — büyük versiyon (sol) -->
  <g transform="translate(120, 195)">
    <circle cx="120" cy="120" r="115" fill="#0F1A33" stroke="#C9A86A" stroke-width="1.5" opacity="0.8"/>
    <circle cx="120" cy="120" r="105" fill="none" stroke="#C9A86A" stroke-width="0.6" opacity="0.5"/>
    <!-- Arc "C" — büyük çap için 24px stroke -->
    <path d="M 120 25 A 95 95 0 1 0 200 175"
          stroke="#FFFFFF" stroke-width="22" fill="none" stroke-linecap="round"/>
    <!-- Champagne nokta -->
    <circle cx="200" cy="175" r="14" fill="#C9A86A" stroke="#0F1A33" stroke-width="2"/>
  </g>

  <!-- Brand text -->
  <text x="430" y="280" font-family="'Source Serif 4', Georgia, serif"
        font-size="84" font-weight="700" fill="#FFFFFF" letter-spacing="-1">
    Cadastrum
  </text>

  <!-- Tagline 1 -->
  <text x="432" y="335" font-family="Inter, sans-serif"
        font-size="28" fill="#C9A86A" letter-spacing="2">
    PARSEL ZEKÂSI
  </text>

  <!-- Tagline 2 -->
  <text x="432" y="408" font-family="Inter, sans-serif"
        font-size="22" fill="#FFFFFF" opacity="0.7" letter-spacing="0.3">
    TKGM resmi parsel · e-Plan imar · 65k mahalle baseline · AI fiyat tahmini
  </text>

  <!-- Bottom accent strip -->
  <rect x="0" y="585" width="1200" height="45" fill="#C9A86A"/>
  <text x="600" y="615" font-family="Inter, sans-serif"
        font-size="18" font-weight="600" fill="#1B2A4A" text-anchor="middle">
    cadastrum.com.tr
  </text>
</svg>`;

await sharp(Buffer.from(OG_SVG)).resize(1200, 630).png().toFile(join(sitePublic, "og.png"));

console.log("\n✓ V3 Geometric logo tüm boyutlarda üretildi.");
