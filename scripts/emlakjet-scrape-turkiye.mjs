#!/usr/bin/env node
/**
 * Türkiye 973 ilçe × (arsa + tarla) — mahalle breadcrumb ile gerçek fiyat.
 *
 *   node scripts/emlakjet-scrape-turkiye.mjs
 *   node scripts/emlakjet-scrape-turkiye.mjs --il=istanbul
 *   node scripts/emlakjet-scrape-turkiye.mjs --basla=200 --maks-ilce=50
 *
 * HEDEFLI TARAMA (kapsam bosluguna gore, alfabetik degil):
 *   node scripts/kapsam-raporu.mjs
 *   node scripts/emlakjet-scrape-turkiye.mjs --hedef-listesi --maks-ilce=20
 *
 * GECELIK KOSU (npm run tarama:gece):
 *   --hedef-listesi --max-sayfa=25 --tazele-gun=180
 *   Derinlik burada; Worker cron yalnizca sig tazeleme yapar (index.ts).
 *   Emsal omru 180 gun oldugu icin tazeleme penceresi de 180.
 *
 * Resume: data/emlakjet-scrape-progress.json
 * Çıktı:  scripts/emlakjet-data-turkiye.sql
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  objeyiCikar,
  ilceListesiYukle,
  sqlYaz,
  sqlIdleriYukle,
  sqlKayitlariYukle,
  progressYukle,
  progressKaydet,
  ilceTara,
} from "./emlakjet-lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CIKTI = join(ROOT, "scripts", "emlakjet-data-turkiye.sql");
const PROGRESS = join(ROOT, "data", "emlakjet-scrape-progress.json");

const args = process.argv.slice(2);
const get = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const filtreIl = get("il");
const basla = parseInt(get("basla") ?? "0", 10);
const maksIlce = get("maks-ilce") ? parseInt(get("maks-ilce"), 10) : null;
const hedefListesi = args.includes("--hedef-listesi");
/**
 * Bir ilcenin "tamamlandi" damgasinin gecerlilik suresi (gun).
 *
 * NEDEN: `progress.completed` suresiz bir liste. Bir kez taranan ilce bir daha
 * hic ziyaret edilmiyordu. Oysa emsaller MAX_ILAN_YASI_GUN=180 ile dusuyor;
 * yani damga, emsal omrunden uzun yasayan bir "tamamlandi" iddiasi uretiyordu.
 * 0 = kapali (eski davranis).
 */
const tazeleGun = parseInt(get("tazele-gun") ?? "0", 10);
// Hedefli modda daha derin sayfala: amac yeni ilce gormek degil, gorulmus
// mahalleleri havuz esiginin ustune cikarmak — bu da sayfa derinligi ister.
const MAX_SAYFA = parseInt(
  process.env.EMLAKJET_ILCE_MAX_SAYFA ?? get("max-sayfa") ?? (hedefListesi ? "10" : "4"),
  10,
);

console.log("Mahalle merkezleri yükleniyor...");
const MERKEZ = objeyiCikar(join(ROOT, "src/lib/data/mahalle-merkezleri.ts"), "MERKEZ_TUPLES");
console.log(`  ${Object.keys(MERKEZ).length} merkez`);

let ilceler = ilceListesiYukle(join(ROOT, "data/mahalleler.json"));
console.log(`  ${ilceler.length} ilçe (973 hedef)`);

/**
 * HEDEFLİ TARAMA — alfabetik sıra yerine kapsam boşluğuna göre.
 *
 * Varsayılan davranış 973 ilçeyi listedeki sırayla geziyor ve bir ilçeyi bir
 * kez "tamamlandı" işaretledikten sonra bir daha dönmüyor. Yani tarama hacmi,
 * doğruluğun en çok arttığı yere değil, listenin başına gidiyor.
 *
 * Backtest ölçtü (ARSA): emsal adedi 1-4 olan mahallede MAPE %94, 5-19
 * olanda %50. En büyük tek sıçrama o geçişte ve mahalle başına ~4 ilan
 * istiyor. `--hedef-listesi`, ilçeleri "eşiğe yakın mahalle sayısı"na göre
 * sıralar ve `completed` işaretini yok sayar — çünkü buradaki amaç ilçeyi
 * ilk kez görmek değil, zaten görülmüş mahalleleri eşiğin üstüne çıkarmak.
 *
 * Listeyi üret: node scripts/kapsam-raporu.mjs
 */
if (hedefListesi) {
  const raporYolu = join(ROOT, "data/kapsam-raporu.json");
  if (!existsSync(raporYolu)) {
    console.error("data/kapsam-raporu.json yok. Önce: node scripts/kapsam-raporu.mjs");
    process.exit(1);
  }
  const rapor = JSON.parse(readFileSync(raporYolu, "utf8"));
  const sira = new Map();
  for (const kat of Object.keys(rapor.kategoriler)) {
    for (const x of rapor.kategoriler[kat].ilceIsListesi ?? []) {
      sira.set(x.ilce, Math.max(sira.get(x.ilce) ?? 0, x.oncelik));
    }
  }
  const oncelikli = ilceler
    .filter((x) => sira.has(`${x.ilNorm}__${x.ilceNorm}`))
    .sort((a, b) => sira.get(`${b.ilNorm}__${b.ilceNorm}`) - sira.get(`${a.ilNorm}__${a.ilceNorm}`));
  if (oncelikli.length === 0) {
    console.error("Kapsam raporu iş listesi boş — tarayacak ilçe yok.");
    process.exit(1);
  }
  ilceler = oncelikli;
  console.log(`  HEDEFLİ MOD: ${ilceler.length} ilçe kapsam boşluğuna göre sıralandı`);
  console.log(`  En üstteki: ${ilceler.slice(0, 3).map((x) => `${x.ilNorm}/${x.ilceNorm}`).join(", ")}`);
}

if (filtreIl) {
  ilceler = ilceler.filter((x) => x.ilNorm === filtreIl);
  console.log(`  Filtre il=${filtreIl} → ${ilceler.length} ilçe`);
}
if (basla > 0) ilceler = ilceler.slice(basla);
if (maksIlce) ilceler = ilceler.slice(0, maksIlce);

const progress = progressYukle(PROGRESS);
const completedSet = new Set(progress.completed ?? []);
/**
 * Tamamlanma zaman damgalari. Eski progress dosyalarinda YOK — o kayitlar
 * "yasi bilinmiyor" sayilir ve tazeleme modunda yeniden taranir. Bilinmeyen
 * yasi taze varsaymak, tam da kacindigimiz sessiz eskime.
 */
const completedAt = progress.completedAt ?? {};
if (tazeleGun > 0) {
  const sinir = Date.now() - tazeleGun * 24 * 60 * 60 * 1000;
  let dusen = 0;
  for (const key of [...completedSet]) {
    const ts = completedAt[key];
    if (!ts || ts < sinir) { completedSet.delete(key); dusen++; }
  }
  console.log(`  TAZELEME: ${tazeleGun} günden eski ${dusen} hedef yeniden sıraya alındı`);
}
const kayitlar = sqlKayitlariYukle(CIKTI);
const gorulenler = new Set(kayitlar.map((k) => k.id));
for (const id of sqlIdleriYukle(CIKTI)) gorulenler.add(id);
console.log(
  `  Resume: ${gorulenler.size} ilan id, ${kayitlar.length} kayıt bellekte, ${completedSet.size} tamamlanmış ilçe/kategori`,
);

const toplamIs = ilceler.length * 2;
let is = 0;
/**
 * Bot engelleri. Ust uste birikiyorsa kaynak bizi kisitliyor demektir ve
 * gecelik kosuyu surdurmek engelin kalicilasmasina yol acar.
 *
 * Eskiden hata TURU yutuluyordu (`catch { continue; }`): 404, 429 ve ag
 * hatasi ayni muameleyi goruyordu. 429 alirken devam etmek en kotu secim.
 */
const botEngelleri = [];
const MAX_BOT_ENGEL = 5;

for (const { ilNorm, ilceNorm, il, ilce } of ilceler) {
  for (const kat of ["arsa", "tarla"]) {
    is++;
    const key = `${ilNorm}__${ilceNorm}__${kat}`;
    if (!hedefListesi && completedSet.has(key)) {
      if (is % 50 === 0) console.log(`[${is}/${toplamIs}] skip ${key}`);
      continue;
    }
    process.stdout.write(`[${is}/${toplamIs}] ${il}/${ilce}/${kat} `);
    let tamamlanan = 0;
    const n = await ilceTara(ilNorm, ilceNorm, kat, MAX_SAYFA, kayitlar, gorulenler, MERKEZ, {
      delayMs: 500,
      botEngelBildir: (hedef, sebep) => { botEngelleri.push({ hedef, sebep }); },
      tamamlananBildir: (adet) => { tamamlanan += adet; },
    });
    const koordlu = kayitlar.filter((k) => k.lat).length;
    const baslikli = kayitlar.filter((k) => k.baslik).length;
    // `~n` = bilinen ilanlarda geriye doldurulan alan. Yeni ilan sayisindan
    // AYRI gosteriliyor: ikisini toplamak "kac yeni emsal geldi"yi bozar.
    console.log(
      `+${n}${tamamlanan ? ` ~${tamamlanan}` : ""} ` +
      `(toplam ${kayitlar.length}, koordlu ${koordlu}, başlıklı ${baslikli}, ` +
      `mahalle ${new Set(kayitlar.filter((k) => k.mahN).map((k) => `${k.ilN}__${k.ilceN}__${k.mahN}`)).size})`,
    );

    completedSet.add(key);
    completedAt[key] = Date.now();
    progress.completed = [...completedSet];
    progress.completedAt = completedAt;
    progress.stats = {
      toplamIlan: kayitlar.length,
      koordlu,
      uniqueMahalle: new Set(
        kayitlar.filter((k) => k.mahN).map((k) => `${k.ilN}__${k.ilceN}__${k.mahN}`),
      ).size,
      sonGuncelleme: new Date().toISOString(),
    };
    progressKaydet(PROGRESS, progress);
    sqlYaz(kayitlar, CIKTI, "Emlakjet 973 ilçe");

    if (botEngelleri.length >= MAX_BOT_ENGEL) {
      const son = botEngelleri.slice(-5)
        .map((b) => `    ${b.hedef}: ${b.sebep}`)
        .join("\n");
      console.warn(
        `\n⚠ ${botEngelleri.length} bot engeli — koşu durduruluyor. ` +
        `Toplanan ${kayitlar.length} ilan korundu.\n${son}`,
      );
      break;
    }
  }
  if (botEngelleri.length >= MAX_BOT_ENGEL) break;
}

sqlYaz(kayitlar, CIKTI, "Emlakjet 973 ilçe — FINAL");
console.log(`\n✅ ${kayitlar.length} ilan → ${CIKTI}`);
console.log(`   ${progress.stats?.uniqueMahalle ?? "?"} mahalle eşleşmeli`);
console.log(`   D1: SEED-EMLAKJET-TURKIYE.bat`);
