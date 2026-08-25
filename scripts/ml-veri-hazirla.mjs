#!/usr/bin/env node
/**
 * ML Fiyat Modeli — Veri Hazırlama Pipeline
 *
 * D1'deki ilan verilerini ML eğitimi için feature matrix'e dönüştürür.
 * Çıktı: data/ml-egitim-verisi.csv
 *
 * Kullanım:
 *   node scripts/ml-veri-hazirla.mjs
 *   node scripts/ml-veri-hazirla.mjs --ortam=preview   (preview DB)
 *   node scripts/ml-veri-hazirla.mjs --min-kayit=50000 (minimum satır sayısı)
 *
 * Çıktı schema (CSV başlık satırı):
 *   log_fiyat_per_m2,  ← TARGET (log transform ile normal dağılım)
 *   log_alan_m2,       ← feature
 *   imar_sinifi,       ← 0-4 (arsa/tarla/konut/bahce/diger)
 *   il_kod,            ← 1-81 (TUIK il kodu)
 *   ilce_kod,          ← hash(il_norm+ilce_norm) mod 1000
 *   nufus_yogunluk,    ← il nüfus yoğunluğu (kişi/km²)
 *   deprem_pga,        ← 0.10-0.50
 *   sahil_var,         ← 0/1 (il sahil illerden biri mi)
 *   yil,               ← 2022-2026
 *   ay                 ← 1-12
 *
 * Model eğitimi (Python gerekli):
 *   python scripts/ml-egit.py data/ml-egitim-verisi.csv
 */

import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Arg parse ────────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "1"];
  }),
);

const ORTAM = args["ortam"] ?? "production";  // "preview" veya "production"
const MIN_KAYIT = parseInt(args["min-kayit"] ?? "10000");
const CIKTI_DOSYA = join(ROOT, "data", "ml-egitim-verisi.csv");

// ── IL kodu tablosu (TUIK sıralaması) ────────────────────────────────────────

const IL_KOD = {
  adana:1, adiyaman:2, afyonkarahisar:3, agri:4, amasya:5,
  ankara:6, antalya:7, artvin:8, aydin:9, balikesir:10,
  bilecik:11, bingol:12, bitlis:13, bolu:14, burdur:15,
  bursa:16, canakkale:17, cankiri:18, corum:19, denizli:20,
  diyarbakir:21, edirne:22, elazig:23, erzincan:24, erzurum:25,
  eskisehir:26, gaziantep:27, giresun:28, gumushane:29, hakkari:30,
  hatay:31, isparta:32, mersin:33, istanbul:34, izmir:35,
  kars:36, kastamonu:37, kayseri:38, kirklareli:39, kirsehir:40,
  kocaeli:41, konya:42, kutahya:43, malatya:44, manisa:45,
  kahramanmaras:46, mardin:47, mugla:48, mus:49, nevsehir:50,
  nigde:51, ordu:52, rize:53, sakarya:54, samsun:55,
  siirt:56, sinop:57, sivas:58, tekirdag:59, tokat:60,
  trabzon:61, tunceli:62, sanliurfa:63, usak:64, van:65,
  yozgat:66, zonguldak:67, aksaray:68, bayburt:69, karaman:70,
  kirikkale:71, batman:72, sirnak:73, bartin:74, ardahan:75,
  igdir:76, yalova:77, karabuk:78, kilis:79, osmaniye:80, duzce:81,
};

// ── Nüfus yoğunluğu (kişi/km²) — il-nufus.ts'ten ────────────────────────────

const IL_NUFUS_YOGUNLUK = {
  istanbul:2988, kocaeli:548, izmir:375, bursa:303, ankara:118,
  yalova:271, hatay:172, sakarya:171, kayseri:84, antalya:119,
  adana:115, gaziantep:177, diyarbakir:97, sanliurfa:129, mersin:87,
  eskisehir:72, denizli:90, manisa:67, konya:47, balikesir:61,
  tekirdag:195, kirklareli:54, edirne:50, canakkale:46, bolu:37,
  duzce:116, zonguldak:115, karabuk:59, bartin:63, kastamonu:24,
  sinop:22, samsun:91, ordu:68, giresun:44, trabzon:113,
  rize:88, artvin:23, erzurum:26, kars:18, ardahan:13,
  igdir:42, agri:44, van:40, hakkari:30, sirnak:57,
  siirt:48, batman:107, mardin:68, mugla:44, aydin:119,
  burdur:29, isparta:42, afyonkarahisar:40, kutahya:44, bilecik:72,
  usak:54, malatya:69, elazig:49, tunceli:9, bingol:33,
  mus:42, bitlis:35, erzincan:18, gumushane:22, bayburt:15,
  sivas:22, tokat:51, amasya:44, corum:44, yozgat:26,
  kirikkale:78, kirsehir:26, nevsehir:37, nigde:30, aksaray:40,
  karaman:18, konya_il:47, cankiri:17, ankara_il:118, kilis:49,
  osmaniye:100, adiyaman:69, kahramanmaras:66, malatya_il:69,
};

// ── Deprem PGA tablosu ────────────────────────────────────────────────────────

const IL_PGA = {
  adana:0.35, adiyaman:0.40, afyonkarahisar:0.25, agri:0.30, aksaray:0.20,
  amasya:0.20, ankara:0.15, antalya:0.25, ardahan:0.25, artvin:0.30,
  aydin:0.35, balikesir:0.30, bartin:0.15, batman:0.30, bayburt:0.30,
  bilecik:0.30, bingol:0.45, bitlis:0.35, bolu:0.40, burdur:0.30,
  bursa:0.30, canakkale:0.35, cankiri:0.20, corum:0.20, denizli:0.35,
  diyarbakir:0.30, duzce:0.45, edirne:0.10, elazig:0.40, erzincan:0.50,
  erzurum:0.35, eskisehir:0.20, gaziantep:0.35, giresun:0.30, gumushane:0.30,
  hakkari:0.35, hatay:0.40, igdir:0.30, isparta:0.25, istanbul:0.35,
  izmir:0.40, kahramanmaras:0.45, karabuk:0.15, karaman:0.15, kars:0.30,
  kastamonu:0.15, kayseri:0.20, kilis:0.35, kirikkale:0.15, kirklareli:0.10,
  kirsehir:0.20, kocaeli:0.40, konya:0.15, kutahya:0.25, malatya:0.40,
  manisa:0.35, mardin:0.30, mersin:0.25, mugla:0.30, mus:0.40,
  nevsehir:0.15, nigde:0.15, ordu:0.25, osmaniye:0.35, rize:0.30,
  sakarya:0.40, samsun:0.20, sanliurfa:0.30, siirt:0.35, sinop:0.15,
  sirnak:0.35, sivas:0.25, tekirdag:0.15, tokat:0.25, trabzon:0.25,
  tunceli:0.45, usak:0.30, van:0.40, yalova:0.40, yozgat:0.20, zonguldak:0.15,
};

// ── Sahil iller ────────────────────────────────────────────────────────────────

const SAHIL_ILLER = new Set([
  "istanbul", "izmir", "antalya", "mugla", "mersin", "hatay", "adana",
  "canakkale", "balikesir", "bursa", "kocaeli", "sakarya", "zonguldak",
  "bartin", "kastamonu", "sinop", "samsun", "ordu", "giresun", "trabzon",
  "rize", "artvin", "yalova", "tekirdağ", "edirne", "kirklareli",
]);

// ── Kategori → imar sınıfı kodu ───────────────────────────────────────────────

function imarSinifi(kategori) {
  switch (kategori) {
    case "arsa":   return 0;
    case "tarla":  return 1;
    case "konut":  return 2;
    case "bahce":  return 3;
    default:       return 4;
  }
}

// ── İlçe hash (deterministik, 0-999) ─────────────────────────────────────────

function ilceKod(ilNorm, ilceNorm) {
  const s = `${ilNorm}:${ilceNorm}`;
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) + s.charCodeAt(i);
    hash = hash & 0x7FFFFFFF;
  }
  return hash % 1000;
}

// ── D1 export (wrangler d1 export) ───────────────────────────────────────────

console.log("📥 D1'den ilan verisi çekiliyor...");

const DB_NAME = "cadastrum-db";
const ORTAM_FLAG = ORTAM === "preview" ? "--local" : "--remote";

let satirlar;
try {
  const sqlSorgu = `
    SELECT
      fiyat_per_m2,
      m2,
      COALESCE(kategori, 'arsa') AS kategori,
      COALESCE(il_norm, '') AS il_norm,
      COALESCE(ilce_norm, '') AS ilce_norm,
      strftime('%Y', datetime(yakalanma_tarihi / 1000, 'unixepoch')) AS yil,
      strftime('%m', datetime(yakalanma_tarihi / 1000, 'unixepoch')) AS ay
    FROM ilanlar
    WHERE
      fiyat_per_m2 > 0
      AND fiyat_per_m2 < 5000000
      AND m2 > 0
      AND m2 < 100000
      AND il_norm IS NOT NULL
      AND aktif = 1
    ORDER BY RANDOM()
    LIMIT 200000
  `.replace(/\n/g, " ").trim();

  const sonuc = execSync(
    `npx wrangler d1 execute ${DB_NAME} ${ORTAM_FLAG} --json --command "${sqlSorgu}"`,
    { cwd: ROOT, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }
  );

  const parsed = JSON.parse(sonuc);
  satirlar = parsed?.[0]?.results ?? parsed?.results ?? [];
  console.log(`✅ ${satirlar.length} satır çekildi`);
} catch (e) {
  console.error("❌ D1 sorgu hatası:", e.message);
  console.error("💡 İpucu: wrangler login yapıldığından emin ol");
  process.exit(1);
}

if (satirlar.length < MIN_KAYIT) {
  console.warn(`⚠️  ${satirlar.length} satır < minimum ${MIN_KAYIT} — model kalitesi düşük olabilir`);
}

// ── Feature engineering ───────────────────────────────────────────────────────

console.log("⚙️  Feature engineering...");

const baslik = "log_fiyat_per_m2,log_alan_m2,imar_sinifi,il_kod,ilce_kod,nufus_yogunluk,deprem_pga,sahil_var,yil,ay";
const satirklar = [baslik];

let gercerliSayi = 0, atlanan = 0;

for (const r of satirlar) {
  const fiyat = Number(r.fiyat_per_m2);
  const alan = Number(r.m2);
  const ilNorm = String(r.il_norm ?? "").toLowerCase().trim();
  const ilceNorm = String(r.ilce_norm ?? "").toLowerCase().trim();

  // Temel validasyon
  if (!fiyat || !alan || fiyat <= 0 || alan <= 0 || !ilNorm) { atlanan++; continue; }

  // Log transform — negatif/sıfır değerler zaten filtrelendi
  const logFiyat = Math.log(fiyat);
  const logAlan = Math.log(alan);

  // Feature'lar
  const sinif = imarSinifi(r.kategori);
  const ilKod = IL_KOD[ilNorm] ?? 0;
  const ilceKodVal = ilceKod(ilNorm, ilceNorm);
  const nufusYogunluk = IL_NUFUS_YOGUNLUK[ilNorm] ?? 50;
  const pgaVal = IL_PGA[ilNorm] ?? 0.25;
  const sahilVar = SAHIL_ILLER.has(ilNorm) ? 1 : 0;
  const yil = parseInt(r.yil ?? "2024") || 2024;
  const ay = parseInt(r.ay ?? "6") || 6;

  // Aykırı değer kontrolü (IQR — basit)
  if (logFiyat < 5 || logFiyat > 18) { atlanan++; continue; } // ~150 TL - ~65M TL/m²
  if (logAlan < 2 || logAlan > 15) { atlanan++; continue; }    // ~7m² - ~3.3M m²

  satirklar.push(
    `${logFiyat.toFixed(4)},${logAlan.toFixed(4)},${sinif},${ilKod},${ilceKodVal},${nufusYogunluk},${pgaVal},${sahilVar},${yil},${ay}`
  );
  gercerliSayi++;
}

console.log(`✅ ${gercerliSayi} geçerli satır (${atlanan} aykırı/eksik atlandı)`);

// ── CSV yaz ───────────────────────────────────────────────────────────────────

mkdirSync(join(ROOT, "data"), { recursive: true });
writeFileSync(CIKTI_DOSYA, satirklar.join("\n"), "utf8");
console.log(`💾 Kaydedildi: ${CIKTI_DOSYA}`);

// ── Özet istatistikler ────────────────────────────────────────────────────────

const fiyatlar = satirklar.slice(1).map((s) => parseFloat(s.split(",")[0]));
const ortFiyat = Math.exp(fiyatlar.reduce((a, b) => a + b, 0) / fiyatlar.length);
const minFiyat = Math.exp(Math.min(...fiyatlar));
const maksFiyat = Math.exp(Math.max(...fiyatlar));

console.log("\n📊 Özet:");
console.log(`  Satır sayısı : ${gercerliSayi.toLocaleString("tr-TR")}`);
console.log(`  Ortalama TL/m²: ${Math.round(ortFiyat).toLocaleString("tr-TR")}`);
console.log(`  Min TL/m²     : ${Math.round(minFiyat).toLocaleString("tr-TR")}`);
console.log(`  Maks TL/m²    : ${Math.round(maksFiyat).toLocaleString("tr-TR")}`);

console.log("\n🚀 Sonraki adım:");
console.log(`  python scripts/ml-egit.py ${CIKTI_DOSYA}`);
console.log("  (Python + scikit-learn + xgboost + onnx gerekli)");
