#!/usr/bin/env node
/**
 * MANZARA PoC — bir parselden deniz/su manzarası görünüp görünmediğini, açısını ve
 * genişliğini DEM üzerinde ışın-izleme (ray-casting) ile ölçer.
 *
 *   node scripts/manzara-poc.mjs <lat> <lng> [--goz=1.6] [--rmax=12000]
 *   node scripts/manzara-poc.mjs 38.3215 26.3210            # Çeşme yamaç (deniz var)
 *   node scripts/manzara-poc.mjs 37.8713 32.4846 --goz=10   # Konya merkez (deniz yok)
 *
 * Yöntem:
 *   - Gözlemci çevresinde 36 ışın (her 10°), her ışında 150m adımla RMAX'e kadar örnek.
 *   - Yükseklikler Open-Meteo elevation (batch, ücretsiz, anahtarsız) — projede zaten kullanılan kaynak.
 *   - Her ışında "horizon" açısı yürütülür: bir nokta, kendinden YAKIN tüm arazinin
 *     oluşturduğu ufuk açısının üstündeyse GÖRÜNÜR (klasik profil-viewshed).
 *   - Dünya eğriliği + atmosferik kırılma (k=0.13) düşüşü: drop = d²/(2·R_eff).
 *   - Su yüzeyi = elevation ≤ SEA_THRESH; görünür + yeterince uzaktaysa "manzara".
 *
 * NOT: Su tespiti yükseklik eşiğine dayanır → kıyı denizinde sağlam; büyük göller de yakalanır.
 *      İç bölgede dere/taşkın düzlüğünü su sanmamak için ileride OSM su-maskesi eklenecek.
 */

const R_EARTH = 6_371_000;            // m
const K_REFRAKSIYON = 0.13;           // standart atmosferik kırılma
const R_EFF = R_EARTH / (1 - K_REFRAKSIYON);
const ELEVATION_API = "https://api.open-meteo.com/v1/elevation";

const RAY_STEP_DEG = 15;              // ışın açısal çözünürlüğü (24 yön)
const STEP_M = 300;                   // ışın boyu örnekleme adımı
const SEA_THRESH = 2;                 // m — bu yüksekliğin altı "su yüzeyi" sayılır
const MIN_SEA_DIST = 300;             // m — parselin kendi alçak zeminini sayma
const API_CHUNK = 100;                // Open-Meteo tek istekte nokta sınırı

// ── CLI ──
const args = process.argv.slice(2);
const lat = parseFloat(args[0]);
const lng = parseFloat(args[1]);
const gozH = parseFloat(args.find((a) => a.startsWith("--goz="))?.split("=")[1] ?? "1.6");
const RMAX = parseInt(args.find((a) => a.startsWith("--rmax="))?.split("=")[1] ?? "12000", 10);
if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
  console.error("Kullanım: node scripts/manzara-poc.mjs <lat> <lng> [--goz=1.6] [--rmax=12000]");
  process.exit(1);
}

// ── Geodezi: başlangıçtan verilen yön+mesafede hedef nokta (küresel) ──
function hedef(lat, lng, brgDeg, dM) {
  const δ = dM / R_EARTH;
  const θ = (brgDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
  );
  return { lat: (φ2 * 180) / Math.PI, lng: (((λ2 * 180) / Math.PI + 540) % 360) - 180 };
}

const YON_AD = ["K", "KKD", "KD", "DKD", "D", "DGD", "GD", "GGD", "G", "GGB", "GB", "BGB", "B", "BKB", "KB", "KKB"];
const yonAdi = (brg) => YON_AD[Math.round(brg / 22.5) % 16];

const uyu = (ms) => new Promise((r) => setTimeout(r, ms));

async function elevationBatch(noktalar) {
  const out = new Array(noktalar.length);
  for (let i = 0; i < noktalar.length; i += API_CHUNK) {
    const dilim = noktalar.slice(i, i + API_CHUNK);
    const lats = dilim.map((p) => p.lat.toFixed(6)).join(",");
    const lngs = dilim.map((p) => p.lng.toFixed(6)).join(",");
    const url = `${ELEVATION_API}?latitude=${lats}&longitude=${lngs}`;

    // 429'a karşı exponential backoff (free tier dakikalık limiti aşmak için sabırlı)
    let elevation = null;
    for (let deneme = 0; deneme < 7; deneme++) {
      const res = await fetch(url);
      if (res.ok) { ({ elevation } = await res.json()); break; }
      if (res.status === 429) { await uyu(8000 * (deneme + 1)); continue; }
      throw new Error(`Open-Meteo HTTP ${res.status}`);
    }
    if (!elevation) throw new Error("Open-Meteo 429 — rate limit (backoff tükendi)");
    for (let j = 0; j < dilim.length; j++) out[i + j] = elevation?.[j] ?? null;
    await uyu(400); // istekler arası nazik aralık
  }
  return out;
}

async function main() {
  // 1) Örnek noktalarını üret: [origin, ray0_s0, ray0_s1, ...]
  const noktalar = [{ lat, lng }];
  const rays = [];
  for (let b = 0; b < 360; b += RAY_STEP_DEG) {
    const samples = [];
    for (let d = STEP_M; d <= RMAX; d += STEP_M) {
      const h = hedef(lat, lng, b, d);
      samples.push({ d, idx: noktalar.length });
      noktalar.push(h);
    }
    rays.push({ bearing: b, samples });
  }

  process.stderr.write(`${noktalar.length} nokta için yükseklik çekiliyor (${Math.ceil(noktalar.length / API_CHUNK)} istek)…\n`);
  const elevs = await elevationBatch(noktalar);
  const h0 = elevs[0] ?? 0;
  const eye = h0 + gozH;

  // 2) Her ışında viewshed → su görünürlüğü
  const visRays = [];
  for (const ray of rays) {
    let horizon = -Infinity;
    let seaDist = null, seaAngleRad = null;
    for (const s of ray.samples) {
      const t = elevs[s.idx];
      if (t == null) continue;
      const drop = (s.d * s.d) / (2 * R_EFF);
      const tCorr = t - drop;
      const ang = Math.atan2(tCorr - eye, s.d); // rad, negatif = göz altı
      const gorunur = ang >= horizon - 1e-9;
      if (gorunur && t <= SEA_THRESH && s.d >= MIN_SEA_DIST && seaDist == null) {
        seaDist = s.d;
        seaAngleRad = ang;
      }
      if (ang > horizon) horizon = ang;
    }
    if (seaDist != null) {
      visRays.push({ bearing: ray.bearing, dist: seaDist, angleDeg: (seaAngleRad * 180) / Math.PI });
    }
  }

  // 3) Skor + sınıflandırma
  const arcDeg = visRays.length * RAY_STEP_DEG;
  const nearest = visRays.length ? Math.min(...visRays.map((r) => r.dist)) : null;
  const avgAngle = visRays.length ? visRays.reduce((s, r) => s + r.angleDeg, 0) / visRays.length : null;

  const arcScore = Math.min(arcDeg / 120, 1);
  const proxScore = nearest == null ? 0 : nearest < 1000 ? 1 : nearest > 10000 ? 0.2 : 1 - (nearest - 1000) / 9000 * 0.8;
  // Daha fazla "aşağı bakış" (negatif açı) = hâkim/yüksek manzara
  const elevBonus = avgAngle == null ? 0 : avgAngle <= -5 ? 1 : avgAngle >= 0 ? 0.3 : 0.3 + (-avgAngle / 5) * 0.7;
  const skor = Math.round(100 * (0.5 * arcScore + 0.3 * proxScore + 0.2 * elevBonus));

  let sinif;
  if (arcDeg === 0) sinif = "❌ Deniz/su manzarası YOK";
  else if (arcDeg < 40) sinif = "🟡 Kısmi / dar manzara";
  else sinif = "✅ Açık deniz manzarası";

  // ── Rapor ──
  console.log(`\n📍 Parsel: ${lat.toFixed(5)}, ${lng.toFixed(5)}  ·  zemin ${Math.round(h0)} m  ·  göz +${gozH} m  ·  tarama ${RMAX / 1000} km`);
  console.log(`${"─".repeat(58)}`);
  console.log(`${sinif}   ·   Manzara skoru: ${skor}/100`);
  if (visRays.length) {
    console.log(`   Açık ufuk yayı : ${arcDeg}°  (${visRays.length}/${rays.length} yön)`);
    console.log(`   En yakın su    : ${(nearest / 1000).toFixed(2)} km`);
    console.log(`   Ort. bakış açısı: ${avgAngle.toFixed(1)}°  (${avgAngle < 0 ? "aşağı bakış — hâkim" : "yatay/yukarı"})`);
    const yonler = [...new Set(visRays.map((r) => yonAdi(r.bearing)))].join(", ");
    console.log(`   Yönler         : ${yonler}`);
    console.log(`\n   Görünür su (yön · mesafe · açı):`);
    for (const r of visRays.sort((a, b) => a.dist - b.dist).slice(0, 8)) {
      console.log(`     ${yonAdi(r.bearing).padEnd(4)} ${String(r.bearing).padStart(3)}°  ·  ${(r.dist / 1000).toFixed(2)} km  ·  ${r.angleDeg.toFixed(1)}°`);
    }
  }
  console.log("");
}

main().catch((e) => { console.error("HATA:", e.message); process.exit(1); });
