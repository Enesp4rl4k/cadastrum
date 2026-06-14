/**
 * Baseline SEED SQL üreteci.
 *
 * mahalle-baseline.ts (52k mahalle ₺/m²) + mahalle-merkezleri.ts (koordinat)
 * → backend ilanlar tablosuna "baseline" kaynaklı sentetik emsal satırları.
 *
 * Çıktı: scripts/seed-baseline.sql  (wrangler d1 execute --file ile yüklenir)
 *
 * Neden: Sahibinden scraping bot korumasına takılıyor. Bu hazır AI+KNN baseline
 * datasıyla /sorgu spatial motoru TÜM Türkiye'de anında çalışır. Gerçek ilanlar
 * geldikçe (pasif toplama) bu baseline'ın üzerine biner.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/** .ts dosyasından `= {....};` arasındaki JSON objesini çıkar + parse et. */
function objeyiCikar(dosyaYolu, degiskenAdi) {
  const metin = readFileSync(dosyaYolu, "utf8");
  const isaret = metin.indexOf(degiskenAdi);
  if (isaret === -1) throw new Error(`${degiskenAdi} bulunamadı`);
  const basAcc = metin.indexOf("{", isaret);
  // Dengeli süslü parantez tarama
  let derinlik = 0, son = -1;
  for (let i = basAcc; i < metin.length; i++) {
    if (metin[i] === "{") derinlik++;
    else if (metin[i] === "}") { derinlik--; if (derinlik === 0) { son = i; break; } }
  }
  if (son === -1) throw new Error("Kapanış } bulunamadı");
  const json = metin.slice(basAcc, son + 1);
  return JSON.parse(json);
}

console.log("Baseline okunuyor...");
const baseline = objeyiCikar(join(ROOT, "src/lib/data/mahalle-baseline.ts"), "MAHALLE_BASELINE");
console.log("Merkezler okunuyor...");
const merkez = objeyiCikar(join(ROOT, "src/lib/data/mahalle-merkezleri.ts"), "MERKEZ_TUPLES");

const sqlEscape = (s) => s.replace(/'/g, "''");
const now = Date.now();

// kategori indexleri: [arsaTlm2, arsaGuven, konutTlm2, konutGuven, tarlaTlm2, tarlaGuven]
const KATEGORILER = [
  { ad: "arsa", tlmIdx: 0 },
  { ad: "konut", tlmIdx: 2 },
  { ad: "tarla", tlmIdx: 4 },
];

const satirlar = [];
let atlanan = 0, eslesme = 0;

for (const [key, tuple] of Object.entries(baseline)) {
  const koord = merkez[key];
  if (!koord) { atlanan++; continue; }
  const [lat, lng] = koord;
  if (!(lat > 35 && lat < 43 && lng > 25 && lng < 46)) { atlanan++; continue; }
  const parts = key.split("__");
  if (parts.length !== 3) { atlanan++; continue; }
  const [il, ilce, mahalle] = parts;
  eslesme++;

  for (const kat of KATEGORILER) {
    const tlm2 = tuple[kat.tlmIdx];
    if (!tlm2 || tlm2 <= 0) continue;
    // kaynak='extension' (CHECK constraint baseline'a izin vermiyor);
    // bl_ prefix'i ile baseline satırları ayırt edilir (cleanup: WHERE ilan_no LIKE 'bl_%').
    const ilanNo = `bl_${key}_${kat.ad}`;
    satirlar.push(
      `('extension','${sqlEscape(ilanNo)}','${sqlEscape(il)}','${sqlEscape(ilce)}','${sqlEscape(mahalle)}',${Math.round(tlm2)},1000,'${kat.ad}','TL',${now},${lat},${lng},'mahalle-merkez',1)`
    );
  }
}

console.log(`Eşleşen mahalle: ${eslesme}, atlanan: ${atlanan}, üretilen satır: ${satirlar.length}`);

// Çok parçalı çıktı — her dosya ~20k satır (D1 API request limitini aşmasın)
const ROW_INSERT = 500;     // statement başına satır
const DOSYA_BASINA = 20000; // dosya başına satır
let dosyaNo = 0;
const dosyalar = [];

for (let d = 0; d < satirlar.length; d += DOSYA_BASINA) {
  dosyaNo++;
  const dilim = satirlar.slice(d, d + DOSYA_BASINA);
  let sql = `-- Cadastrum baseline seed parça ${dosyaNo}\n\n`;
  for (let i = 0; i < dilim.length; i += ROW_INSERT) {
    const grup = dilim.slice(i, i + ROW_INSERT);
    sql += `INSERT OR IGNORE INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, fiyat_per_m2, m2, kategori, para_birimi, yakalanma_tarihi, lat, lng, koord_kaynagi, aktif) VALUES\n`;
    sql += grup.join(",\n") + ";\n\n";
  }
  const ad = `seed-baseline-${String(dosyaNo).padStart(2, "0")}.sql`;
  writeFileSync(join(ROOT, "scripts", ad), sql, "utf8");
  dosyalar.push(ad);
  console.log(`  ${ad} (${(sql.length / 1e6).toFixed(1)} MB, ${dilim.length} satır)`);
}

console.log(`\n${dosyalar.length} parça yazıldı. SEED-BASELINE.bat ile yükle.`);
