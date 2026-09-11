#!/usr/bin/env node
/**
 * Cadastrum Smoke Test
 *
 * Hızlı dağıtım ve bütünlük testi (CI/CD ve deploy sonrası doğrulama).
 * 
 * Kontroller:
 *  1. Manifest & Proje Bütünlüğü (manifest.json, dosya varlığı, izinler)
 *  2. Canlı API Sağlık Kontrolleri (/v1/health, /v1/fiyat/il/istanbul)
 *
 * Kullanım:
 *   node scripts/smoke-test.mjs
 *   node scripts/smoke-test.mjs --local-only
 *   API_BASE=http://127.0.0.1:8787/v1 node scripts/smoke-test.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const localOnly = args.includes("--local-only") || args.includes("--offline");
const apiBase = process.env.API_BASE || "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

const rootDir = process.cwd();
let basarili = true;
let passedCount = 0;
let totalCount = 0;

function assert(condition, message) {
  totalCount++;
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedCount++;
  } else {
    console.error(`  ✗ HATA: ${message}`);
    basarili = false;
  }
}

console.log("==================================================");
console.log("             CADASTRUM SMOKE TEST                 ");
console.log("==================================================");

// ── 1. Yerel Bütünlük Kontrolleri ──
console.log("\n[1] Yerel Bütünlük & Konfigürasyon");
try {
  const manifestConfigPath = resolve(rootDir, "manifest.config.ts");
  const distManifestPath = resolve(rootDir, "dist", "manifest.json");

  assert(existsSync(manifestConfigPath), "manifest.config.ts kaynak konfigürasyonu mevcut");

  if (existsSync(distManifestPath)) {
    const manifest = JSON.parse(readFileSync(distManifestPath, "utf-8"));
    assert(manifest.manifest_version === 3, "dist/manifest.json V3 formatında");
    assert(typeof manifest.name === "string" && manifest.name.length > 0, `Eklenti adı tanımlı: "${manifest.name}"`);
    assert(typeof manifest.version === "string" && /^\d+\.\d+\.\d+/.test(manifest.version), `Geçerli sürüm: ${manifest.version}`);
    assert(Array.isArray(manifest.permissions) && manifest.permissions.includes("storage"), "'storage' izni mevcut");
  } else {
    // dist henüz derlenmemişse package.json sürüm ve name kontrolü
    const pkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf-8"));
    assert(typeof pkg.version === "string" && /^\d+\.\d+\.\d+/.test(pkg.version), `package.json geçerli sürüm: ${pkg.version}`);
    assert(typeof pkg.name === "string", `package.json adı: ${pkg.name}`);
  }
} catch (err) {
  assert(false, `Manifest/Paket okunamadı: ${err.message}`);
}

const kritikDosyalar = [
  "src/background/service-worker.ts",
  "src/content/sahibinden.ts",
  "src/content/hepsiemlak.ts",
  "src/content/emlakjet.ts",
  "src/lib/api-constants.ts",
  "src/lib/spatial-emsal.ts",
  "src/lib/fiyat/guven-motoru.ts",
  "backend/api/src/index.ts",
  "backend/api/src/routes/fiyat.ts",
  "backend/api/src/routes/gercek-satis.ts",
];

for (const dosya of kritikDosyalar) {
  assert(existsSync(resolve(rootDir, dosya)), `Kritik dosya mevcut: ${dosya}`);
}

// ── 2. Canlı API Sağlık Kontrolleri ──
async function runApiSmoke() {
  if (localOnly) {
    console.log("\n[2] Canlı API Kontrolleri (--local-only bayrağı ile atlandı)");
    return;
  }

  console.log(`\n[2] Canlı API Kontrolleri (Hedef: ${apiBase})`);

  // /v1/health
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${apiBase}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);

    assert(res.status === 200, `GET /health HTTP 200 döndü (Alınan: ${res.status})`);
    const data = await res.json();
    assert(data && data.status === "ok", `GET /health yanıtında status: "ok" mevcut (env: ${data?.env ?? "belirsiz"})`);
  } catch (err) {
    if (err.name === "AbortError") {
      console.warn("  ⚠ UYARI: GET /health zaman aşımına uğradı (6s). Çevrimdışı veya ağ engeli olabilir.");
    } else {
      console.warn(`  ⚠ UYARI: Canlı API'ye erişilemedi (${err.message}).`);
    }
  }

  // /v1/fiyat/il/istanbul?kategori=arsa
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${apiBase}/fiyat/il/istanbul?kategori=arsa`, { signal: controller.signal });
    clearTimeout(timeoutId);

    // ESKİ HÂLİ 200 dışındaki her yanıtı `console.warn` ile geçiştiriyordu ve
    // `basarili`'yi düşürmüyordu. 2026-09-11 deploy'unun ardından bu uç canlı
    // olarak 500 döndü ve smoke test "17 / 17 kontrol başarılı ✅" dedi.
    //
    // Bir smoke test'in tek işi "deploy sonrası çekirdek uç çalışıyor mu"
    // sorusuna cevap vermek. 500'ü uyarıya indiren smoke test, bu projede
    // tekrar tekrar ayıkladığımız sınıfın bir örneği: var görünen ama
    // ölçmeyen kontrol. Artık assert — 500 KIRMIZI.
    //
    // NOT: `?kategori=arsa` KASITLI. Parametresiz URL edge önbelleğinden
    // dönebiliyor ve D1'e hiç dokunmadan 200 veriyor — aynı gün parametresiz
    // hâli 200, parametreli hâli 500 döndü. Önbellekten gelen 200, canlı yolun
    // çalıştığını kanıtlamaz.
    assert(res.status === 200, `GET /fiyat/il/istanbul?kategori=arsa HTTP 200 döndü (Alınan: ${res.status})`);
  } catch (err) {
    console.warn(`  ⚠ UYARI: Fiyat endpoint'ine erişilemedi (${err.message})`);
  }
}

await runApiSmoke();

console.log("\n==================================================");
console.log(`Sonuç: ${passedCount} / ${totalCount} kontrol başarılı.`);
if (basarili) {
  console.log("✅ SMOKE TEST BAŞARIYLA TAMAMLANDI");
  process.exit(0);
} else {
  console.error("❌ SMOKE TESTTE KRİTİK HATALAR TESPİT EDİLDİ");
  process.exit(1);
}
