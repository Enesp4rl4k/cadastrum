/**
 * Twitter/X profil banner — 1500×500
 * Üretim: node scripts/twitter-banner.mjs
 */
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KOK = join(__dirname, "..");
const OUT = join(KOK, "marketing");
await mkdir(OUT, { recursive: true });

const LOGO_SVG = `
  <circle cx="32" cy="32" r="30" fill="#1B2A4A"/>
  <path d="M 32 12 A 20 20 0 1 0 50 38" stroke="#FFFFFF" stroke-width="6" fill="none" stroke-linecap="round"/>
  <circle cx="50" cy="38" r="3.5" fill="#C9A86A" stroke="#1B2A4A" stroke-width="0.8"/>
  <circle cx="32" cy="32" r="27" fill="none" stroke="#C9A86A" stroke-width="0.5" opacity="0.5"/>
`;

const banner = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 500">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1B2A4A"/>
      <stop offset="50%" stop-color="#0F1A33"/>
      <stop offset="100%" stop-color="#070E1E"/>
    </linearGradient>
    <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M60 0 L0 0 0 60" fill="none" stroke="#FFFFFF" stroke-width="0.5" opacity="0.06"/>
    </pattern>
    <radialGradient id="glow" cx="0.7" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#C9A86A" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#C9A86A" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1500" height="500" fill="url(#bg)"/>
  <rect width="1500" height="500" fill="url(#grid)"/>
  <circle cx="1100" cy="250" r="350" fill="url(#glow)"/>

  <!-- Topographic lines (subtle decoration) -->
  <g opacity="0.08" stroke="#C9A86A" stroke-width="1" fill="none">
    <path d="M0,200 Q400,150 800,200 T1500,180"/>
    <path d="M0,250 Q400,200 800,250 T1500,230"/>
    <path d="M0,300 Q400,250 800,300 T1500,280"/>
    <path d="M0,350 Q400,300 800,350 T1500,330"/>
  </g>

  <!-- Logo (büyük) -->
  <g transform="translate(150, 150)">
    <svg width="180" height="180" viewBox="0 0 64 64">${LOGO_SVG}</svg>
  </g>

  <!-- Brand -->
  <text x="380" y="245" font-family="Georgia, serif"
        font-size="84" font-weight="700" fill="#FFFFFF" letter-spacing="-1">
    Cadastrum
  </text>
  <text x="382" y="295" font-family="Inter, sans-serif"
        font-size="26" fill="#C9A86A" letter-spacing="3">
    PARSEL ZEKÂSI
  </text>

  <!-- Tagline -->
  <text x="382" y="360" font-family="Inter, sans-serif"
        font-size="22" fill="#FFFFFF" opacity="0.85">
    TKGM • e-Plan imar • AI fiyat • 65.000 mahalle
  </text>

  <!-- Bottom strip -->
  <rect x="0" y="465" width="1500" height="35" fill="#C9A86A"/>
  <text x="750" y="488" font-family="Inter, sans-serif"
        font-size="16" font-weight="600" fill="#1B2A4A" text-anchor="middle">
    cadastrum.com.tr — Türkiye gayrimenkul yatırımcısı için Chrome eklentisi
  </text>
</svg>`;

await sharp(Buffer.from(banner)).resize(1500, 500).png({ compressionLevel: 9 }).toFile(join(OUT, "twitter-banner-1500x500.png"));

// Profil fotosu (400x400) — Twitter PFP
const pfp = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <defs>
    <linearGradient id="pfpbg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1B2A4A"/>
      <stop offset="100%" stop-color="#0F1A33"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" fill="url(#pfpbg)"/>
  <g transform="translate(50, 50)">
    <svg width="300" height="300" viewBox="0 0 64 64">${LOGO_SVG}</svg>
  </g>
</svg>`;

await sharp(Buffer.from(pfp)).resize(400, 400).png({ compressionLevel: 9 }).toFile(join(OUT, "twitter-pfp-400x400.png"));

console.log("✓ marketing/twitter-banner-1500x500.png");
console.log("✓ marketing/twitter-pfp-400x400.png");
