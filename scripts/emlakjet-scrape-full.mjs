/**
 * Emlakjet 81 İL tam tarama — baseline genişletme.
 *
 * il-bazlı URL: /satilik-arsa/{il}?sayfa=N  (tüm ilçeleri kapsar)
 * Çıktı: scripts/emlakjet-data-full.sql
 *
 * Çalıştır: node scripts/emlakjet-scrape-full.mjs
 * 10-il scraper'dan (emlakjet-scrape.mjs) bağımsız, ayrı çıktı dosyası.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  objeyiCikar,
  sqlYaz,
  sqlKayitlariYukle,
  progressYukle,
  progressKaydet,
  ilTara,
} from "./emlakjet-lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CIKTI = join(ROOT, "scripts", "emlakjet-data-full.sql");
const PROGRESS_81 = join(ROOT, "data", "emlakjet-progress-81il.json");
console.log("Mahalle merkezleri yükleniyor...");
const MERKEZ = objeyiCikar(join(ROOT, "src/lib/data/mahalle-merkezleri.ts"), "MERKEZ_TUPLES");
console.log(`  ${Object.keys(MERKEZ).length} merkez yüklendi.`);

// 81 il (plaka sırası, emlakjet slug formatı)
const ILLER = [
  "adana","adiyaman","afyonkarahisar","agri","amasya","ankara","antalya","artvin","aydin","balikesir",
  "bilecik","bingol","bitlis","bolu","burdur","bursa","canakkale","cankiri","corum","denizli",
  "diyarbakir","edirne","elazig","erzincan","erzurum","eskisehir","gaziantep","giresun","gumushane","hakkari",
  "hatay","isparta","mersin","istanbul","izmir","kars","kastamonu","kayseri","kirklareli","kirsehir",
  "kocaeli","konya","kutahya","malatya","manisa","kahramanmaras","mardin","mugla","mus","nevsehir",
  "nigde","ordu","rize","sakarya","samsun","siirt","sinop","sivas","tekirdag","tokat",
  "trabzon","tunceli","sanliurfa","usak","van","yozgat","zonguldak","aksaray","bayburt","karaman",
  "kirikkale","batman","sirnak","bartin","ardahan","igdir","yalova","karabuk","kilis","osmaniye","duzce",
];

const MAX_SAYFA = parseInt(process.env.EMLAKJET_MAX_SAYFA ?? "12", 10); // il+kategori (~30/sayfa)

(async () => {
  const prog = progressYukle(PROGRESS_81);
  const doneIl = new Set(prog.completedIl ?? []);
  const kayitlar = sqlKayitlariYukle(CIKTI);
  const gorulenler = new Set(kayitlar.map((k) => k.id));
  console.log(`  Resume 81il: ${kayitlar.length} ilan, ${doneIl.size} il tamam`);
  let skipIl = parseInt(process.env.RESUME_SKIP_IL ?? "0", 10);
  if (kayitlar.length > 7000 && skipIl === 0) skipIl = 69;
  if (kayitlar.length > 3000 && skipIl > 0) {
    for (let s = 0; s < Math.min(skipIl, ILLER.length); s++) doneIl.add(ILLER[s]);
    console.log(`  Mevcut SQL var — ilk ${skipIl} il atlanıyor`);
  }

  let i = 0;
  for (const il of ILLER) {
    i++;
    if (doneIl.has(il)) {
      console.log(`[${i}/81] ${il} — atlandı (tamam)`);
      continue;
    }
    for (const kat of ["arsa", "tarla"]) {
      process.stdout.write(`[${i}/81 ${il}/${kat}] `);
      const n = await ilTara(il, kat, MAX_SAYFA, kayitlar, gorulenler, MERKEZ);
      console.log(`+${n} (toplam ${kayitlar.length}, koordlu ${kayitlar.filter((k) => k.lat).length})`);
    }
    doneIl.add(il);
    prog.completedIl = [...doneIl];
    prog.toplamIlan = kayitlar.length;
    progressKaydet(PROGRESS_81, prog);
    sqlYaz(kayitlar, CIKTI, "Emlakjet 81 il");
  }
  sqlYaz(kayitlar, CIKTI, "Emlakjet 81 il — FINAL");
  console.log(`\n✅ ${kayitlar.length} gerçek ilan → ${CIKTI}`);
})();
