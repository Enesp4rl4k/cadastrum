/**
 * Chrome Web Store görsel asset'leri üretir.
 *
 * Çıktılar (chrome-store/ klasöründe):
 *   - promo-tile-440x280.png    (Small Promo Tile — zorunlu)
 *   - promo-tile-1400x560.png   (Marquee — opsiyonel ama önerilir)
 *   - screenshot-1-1280x800.png (Hero shot — sidepanel)
 *   - screenshot-2-1280x800.png (TKGM doğrulama)
 *   - screenshot-3-1280x800.png (AI fiyat tahmini)
 *   - screenshot-4-1280x800.png (Mahalle data)
 *
 * Kullanım: node scripts/store-assets-uret.mjs
 */
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KOK = join(__dirname, "..");
const OUT = join(KOK, "chrome-store");
await mkdir(OUT, { recursive: true });

// V3 Logo SVG — favicon ile aynı
const LOGO_SVG = `
  <circle cx="32" cy="32" r="30" fill="#1B2A4A"/>
  <path d="M 32 12 A 20 20 0 1 0 50 38" stroke="#FFFFFF" stroke-width="6" fill="none" stroke-linecap="round"/>
  <circle cx="50" cy="38" r="3.5" fill="#C9A86A" stroke="#1B2A4A" stroke-width="0.8"/>
  <circle cx="32" cy="32" r="27" fill="none" stroke="#C9A86A" stroke-width="0.5" opacity="0.5"/>
`;

// ─── Small Promo Tile 440x280 ───────────────────────────────────
const promoSmall = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 280">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1B2A4A"/>
      <stop offset="100%" stop-color="#0F1A33"/>
    </linearGradient>
    <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
      <path d="M30 0 L0 0 0 30" fill="none" stroke="#FFFFFF" stroke-width="0.4" opacity="0.05"/>
    </pattern>
    <radialGradient id="glow" cx="0.2" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#C9A86A" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#C9A86A" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="440" height="280" fill="url(#bg)"/>
  <rect width="440" height="280" fill="url(#grid)"/>
  <circle cx="100" cy="140" r="120" fill="url(#glow)"/>

  <!-- Logo -->
  <g transform="translate(50, 90)">
    <svg width="100" height="100" viewBox="0 0 64 64">${LOGO_SVG}</svg>
  </g>

  <!-- Brand -->
  <text x="180" y="125" font-family="Georgia, 'Source Serif 4', serif"
        font-size="42" font-weight="700" fill="#FFFFFF">Cadastrum</text>
  <text x="180" y="155" font-family="Inter, sans-serif"
        font-size="14" fill="#C9A86A" letter-spacing="2.5">PARSEL ZEKÂSI</text>

  <!-- Tagline -->
  <text x="180" y="195" font-family="Inter, sans-serif"
        font-size="13" fill="#FFFFFF" opacity="0.85">TKGM • e-Plan • AI fiyat</text>
  <text x="180" y="215" font-family="Inter, sans-serif"
        font-size="13" fill="#FFFFFF" opacity="0.85">65.000 mahalle baseline</text>

  <!-- Bottom strip -->
  <rect x="0" y="260" width="440" height="20" fill="#C9A86A"/>
  <text x="220" y="274" font-family="Inter, sans-serif"
        font-size="11" font-weight="600" fill="#1B2A4A" text-anchor="middle">cadastrum.com.tr</text>
</svg>`;

await sharp(Buffer.from(promoSmall)).resize(440, 280).png().toFile(join(OUT, "promo-tile-440x280.png"));

// ─── Marquee Promo Tile 1400x560 ────────────────────────────────
const promoLarge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 560">
  <defs>
    <linearGradient id="bg2" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1B2A4A"/>
      <stop offset="100%" stop-color="#0F1A33"/>
    </linearGradient>
    <pattern id="grid2" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M60 0 L0 0 0 60" fill="none" stroke="#FFFFFF" stroke-width="0.5" opacity="0.06"/>
    </pattern>
    <radialGradient id="glow2" cx="0.25" cy="0.5" r="0.4">
      <stop offset="0%" stop-color="#C9A86A" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#C9A86A" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1400" height="560" fill="url(#bg2)"/>
  <rect width="1400" height="560" fill="url(#grid2)"/>
  <circle cx="350" cy="280" r="320" fill="url(#glow2)"/>

  <g transform="translate(180, 180)">
    <svg width="200" height="200" viewBox="0 0 64 64">${LOGO_SVG}</svg>
  </g>

  <text x="430" y="270" font-family="Georgia, serif"
        font-size="92" font-weight="700" fill="#FFFFFF">Cadastrum</text>
  <text x="432" y="320" font-family="Inter, sans-serif"
        font-size="28" fill="#C9A86A" letter-spacing="3">PARSEL ZEKÂSI</text>
  <text x="432" y="380" font-family="Inter, sans-serif"
        font-size="22" fill="#FFFFFF" opacity="0.85">TKGM resmi parsel · e-Plan imar · AI fiyat tahmini</text>
  <text x="432" y="412" font-family="Inter, sans-serif"
        font-size="22" fill="#FFFFFF" opacity="0.85">65.000 mahalle baseline · Sahibinden + Hepsiemlak emsal</text>

  <rect x="0" y="520" width="1400" height="40" fill="#C9A86A"/>
  <text x="700" y="546" font-family="Inter, sans-serif"
        font-size="18" font-weight="600" fill="#1B2A4A" text-anchor="middle">cadastrum.com.tr — Türkiye gayrimenkul yatırımcısı için</text>
</svg>`;

await sharp(Buffer.from(promoLarge)).resize(1400, 560).png().toFile(join(OUT, "promo-tile-1400x560.png"));

// ─── Screenshot template — feature highlight ────────────────────
function screenshotSVG(title, subtitle, emoji, bullets) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 800">
  <defs>
    <linearGradient id="ssbg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F8FAFC"/>
      <stop offset="100%" stop-color="#EEF1F8"/>
    </linearGradient>
    <radialGradient id="sshalo" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="#C9A86A" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#C9A86A" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1280" height="800" fill="url(#ssbg)"/>

  <!-- Top brand bar -->
  <rect x="0" y="0" width="1280" height="64" fill="#1B2A4A"/>
  <g transform="translate(32, 16)">
    <svg width="32" height="32" viewBox="0 0 64 64">${LOGO_SVG}</svg>
  </g>
  <text x="78" y="40" font-family="Georgia, serif" font-size="22" font-weight="700" fill="#FFFFFF">Cadastrum</text>
  <text x="80" y="56" font-family="Inter, sans-serif" font-size="11" fill="#C9A86A" letter-spacing="1.5">PARSEL ZEKÂSI</text>

  <!-- Emoji as soft halo background (decorative, alt katman) -->
  <circle cx="1080" cy="240" r="180" fill="url(#sshalo)"/>
  <text x="1080" y="320" font-size="200" text-anchor="middle" opacity="0.85">${emoji}</text>

  <!-- Hero text (emoji'nin solunda, max-width 850) -->
  <text x="80" y="180" font-family="Inter, sans-serif" font-size="14" fill="#1B2A4A" font-weight="600" letter-spacing="2">CADASTRUM ÖZELLİĞİ</text>
  <text x="80" y="240" font-family="Georgia, serif" font-size="52" font-weight="700" fill="#1B2A4A">${title}</text>
  <text x="80" y="290" font-family="Inter, sans-serif" font-size="20" fill="#475569">${subtitle}</text>

  <!-- Bullet box -->
  <rect x="80" y="380" width="1120" height="310" rx="20" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
  ${bullets.map((b, i) => `
    <circle cx="120" cy="${440 + i * 60}" r="6" fill="#C9A86A"/>
    <text x="148" y="${446 + i * 60}" font-family="Inter, sans-serif" font-size="20" fill="#1B2A4A">${b}</text>
  `).join("")}

  <!-- Bottom CTA -->
  <text x="640" y="745" font-family="Inter, sans-serif" font-size="16" fill="#64748B" text-anchor="middle">cadastrum.com.tr · Ücretsiz dene, Pro ile sınırsız erişim</text>
</svg>`;
}

const screenshots = [
  {
    name: "screenshot-1-tkgm",
    title: "TKGM Resmi Parsel Doğrulama",
    subtitle: "Sahibinden ve Hepsiemlak ilanlarını saniyeler içinde doğrulayın",
    emoji: "🗺️",
    bullets: [
      "İlan üzerinde tek tıkla TKGM kayıt sorgusu",
      "Ada, parsel, alan, niteliği TKGM kaynağından",
      "Resmi sınırlar harita üzerinde gösterilir",
      "Sahte ilan tespiti — TKGM'de olmayan yer = uyarı",
    ],
  },
  {
    name: "screenshot-2-eplan",
    title: "e-Plan İmar Sorgusu",
    subtitle: "Bağlı olduğu plan, kullanım kararı, TAKS/Emsal otomatik",
    emoji: "📐",
    bullets: [
      "Tüm Türkiye için e-Plan portal entegrasyonu",
      "Kullanım kararı: konut / ticaret / tarım / sit",
      "TAKS, Emsal, Maks Kat sayısı çekilir",
      "Plan değişikliği geçmişi ve revizyonlar",
    ],
  },
  {
    name: "screenshot-3-ai",
    title: "AI Fiyat Tahmini",
    subtitle: "65.000 mahalle baseline + Gemini 2.5 Flash + KNN",
    emoji: "🤖",
    bullets: [
      "Mahalle bazlı medyan + IQR güven aralığı",
      "Sahil/metro/anayol özniteliği bazlı çarpan",
      "TCMB Konut Fiyat Endeksi ile düzeltme",
      "Cross-validation — her ilçe için bias düzeltmesi",
    ],
  },
  {
    name: "screenshot-4-emsal",
    title: "Canlı Emsal Verisi",
    subtitle: "Sahibinden + Hepsiemlak'tan topluluk verisi, anonim",
    emoji: "📊",
    bullets: [
      "İlanlar gezilirken mahalle medyanı güncel kalır",
      "Tukey IQR ile aykırı değer temizliği",
      "Aylık trend grafiği, 6 ay geçmiş",
      "Komşu mahalle / ilçe karşılaştırması",
    ],
  },
];

for (const s of screenshots) {
  const svg = screenshotSVG(s.title, s.subtitle, s.emoji, s.bullets);
  await sharp(Buffer.from(svg)).resize(1280, 800).png({ compressionLevel: 9 }).toFile(join(OUT, `${s.name}.png`));
  console.log(`✓ ${s.name}.png`);
}

console.log(`\n✓ Tüm Chrome Web Store assetleri ${OUT}/ klasöründe.`);
console.log("Listing'e yüklemek için:");
console.log("  - promo-tile-440x280.png (Small promo tile)");
console.log("  - promo-tile-1400x560.png (Marquee — Featured listings için)");
console.log("  - screenshot-1..4.png (en az 1 zorunlu, 5'e kadar yükleyebilirsin)");
