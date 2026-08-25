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
    else if (metin[i] === "}") {
      derinlik--;
      if (derinlik === 0) {
        son = i;
        break;
      }
    }
  }
  if (son === -1) throw new Error("Kapanış } bulunamadı");
  const json = metin.slice(basAcc, son + 1);
  return JSON.parse(json);
}

console.log("Baseline okunuyor...");
const baseline = objeyiCikar(join(ROOT, "src/lib/data/mahalle-baseline.ts"), "MAHALLE_BASELINE");

const sqlEscape = (s) => s.replace(/'/g, "''");
const now = Date.now();

// kategori indexleri: [arsaTlm2, arsaGuven, konutTlm2, konutGuven, tarlaTlm2, tarlaGuven]
const KATEGORILER = [
  { ad: "arsa", tlmIdx: 0, guvenIdx: 1 },
  { ad: "konut", tlmIdx: 2, guvenIdx: 3 },
  { ad: "tarla", tlmIdx: 4, guvenIdx: 5 },
];

const satirlar = [];
let atlanan = 0, islenen = 0;

for (const [key, tuple] of Object.entries(baseline)) {
  const parts = key.split("__");
  if (parts.length !== 3) {
    atlanan++;
    continue;
  }
  const [il, ilce, mahalle] = parts;
  islenen++;

  for (const kat of KATEGORILER) {
    const tlm2 = tuple[kat.tlmIdx];
    const guven = tuple[kat.guvenIdx];
    
    if (!tlm2 || tlm2 <= 0) continue;
    
    satirlar.push(
      `('${sqlEscape(il)}','${sqlEscape(ilce)}','${sqlEscape(mahalle)}','${kat.ad}',${Math.round(tlm2)},${Math.round(guven)},'knn-smoothing',${now})`
    );
  }
}

console.log(`İşlenen mahalle: ${islenen}, atlanan: ${atlanan}, üretilen satır: ${satirlar.length}`);

// Çok parçalı çıktı — her dosya ~20k satır (D1 API request limitini aşmasın)
const ROW_INSERT = 500;     // statement başına satır
const DOSYA_BASINA = 20000; // dosya başına satır
let dosyaNo = 0;
const dosyalar = [];

for (let d = 0; d < satirlar.length; d += DOSYA_BASINA) {
  dosyaNo++;
  const dilim = satirlar.slice(d, d + DOSYA_BASINA);
  let sql = `-- Cadastrum AI baseline seed parça ${dosyaNo}\n\n`;
  for (let i = 0; i < dilim.length; i += ROW_INSERT) {
    const grup = dilim.slice(i, i + ROW_INSERT);
    sql += `INSERT OR REPLACE INTO mahalle_baseline_ai (il_norm, ilce_norm, mahalle_norm, kategori, tlm2, guven, kaynak, yakalandi) VALUES\n`;
    sql += grup.join(",\n") + ";\n\n";
  }
  const ad = `seed-ai-baseline-${String(dosyaNo).padStart(2, "0")}.sql`;
  writeFileSync(join(ROOT, "scripts", ad), sql, "utf8");
  dosyalar.push(ad);
  console.log(`  ${ad} (${(sql.length / 1e6).toFixed(1)} MB, ${dilim.length} satır)`);
}

console.log(`\n${dosyalar.length} parça yazıldı. SEED-AI-BASELINE.bat ile yükle.`);
