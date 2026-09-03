#!/usr/bin/env node
/**
 * Emsal kapsamı raporu — taramanın NEREYE yapılacağını sayıyla söyler.
 *
 *   node scripts/kapsam-raporu.mjs                 # rapor + data/kapsam-raporu.json
 *   node scripts/kapsam-raporu.mjs --is-listesi    # tarama iş listesi (ilçe sırası)
 *   node scripts/kapsam-raporu.mjs --kategori=arsa
 *
 * NEDEN: mevcut tarayıcı 973 ilçeyi alfabetik geziyor ve bir ilçeyi "tamamlandı"
 * işaretledikten sonra bir daha dönmüyor (emlakjet-scrape-turkiye.mjs). Yani
 * tarama hacmi, doğruluğun en çok arttığı yere değil, listenin başına gidiyor.
 *
 * Backtest (test/backtest/real-engine.spec.ts) hatanın emsal yoğunluğuyla
 * nasıl çöktüğünü ölçtü — ARSA:
 *
 *   emsal adedi     n     MAPE   ±%20   bias
 *   0 (emsal yok)  198   178,3   14,1  +115,7
 *   1-4            442    93,9   22,4   +41,2
 *   5-19           453    50,4   28,7    +4,6
 *   20+            107    60,1   27,1   +18,6
 *
 * Okunuşu: asıl sıçrama 1-4 → 5-19 geçişinde. 20+ bandında kazanç duruyor
 * (hatta MAPE bir miktar geri geliyor, n=107 ile temkinli okunmalı). Yani
 * hedef "her mahalleyi doldurmak" değil, MAHALLE BAŞINA 5 GÖZLEME ULAŞMAK.
 *
 * Bu araç iki soruyu ayırıyor:
 *   DERİNLİK — 1-4 gözlemli mahalleler: az iş, büyük kazanç (MAPE 94 → 50)
 *   GENİŞLİK — hiç gözlemi olmayan mahalleler: çok iş, kazanç 178 → 94
 * İş listesi derinliği önceliklendirir; sebebi yukarıdaki tablo.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Motorun mahalle emsalini "havuz" saymaya başladığı eşik (fiyat/constants.ts). */
const HAVUZ_ESIGI = 5;

const KAYNAKLAR = [
  join(ROOT, "scripts/emlakjet-data-turkiye.sql"),
  join(ROOT, "scripts/hepsiemlak-data.sql"),
];

const args = process.argv.slice(2);
const arg = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const isListesiModu = args.includes("--is-listesi");
const kategoriFiltre = arg("kategori");

function ayir(satir) {
  const out = [];
  let cur = "", tirnakta = false;
  for (let i = 0; i < satir.length; i++) {
    const c = satir[i];
    if (tirnakta) {
      if (c === "'" && satir[i + 1] === "'") { cur += "'"; i++; continue; }
      if (c === "'") { tirnakta = false; continue; }
      cur += c;
    } else if (c === "'") tirnakta = true;
    else if (c === ",") { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** Gözlemleri "il__ilce__mahalle__kategori" → adet olarak topla. */
function gozlemleriTopla() {
  const mahalle = new Map();
  for (const yol of KAYNAKLAR) {
    if (!existsSync(yol)) continue;
    const metin = readFileSync(yol, "utf8");
    const blokRe = /INSERT OR IGNORE INTO ilanlar\s*\(([^)]*)\)\s*VALUES([^;]+);/gs;
    let blok;
    while ((blok = blokRe.exec(metin)) !== null) {
      const kolonlar = blok[1].split(",").map((k) => k.trim());
      const iIl = kolonlar.indexOf("il_norm");
      const iIlce = kolonlar.indexOf("ilce_norm");
      const iMah = kolonlar.indexOf("mahalle_norm");
      const iKat = kolonlar.indexOf("kategori");
      if (iIl < 0 || iIlce < 0 || iMah < 0 || iKat < 0) continue;
      for (const m of blok[2].matchAll(/\(([^()]*)\)/g)) {
        const v = ayir(m[1]);
        if (v.length !== kolonlar.length) continue;
        const kat = v[iKat];
        if (kat !== "arsa" && kat !== "tarla") continue;
        if (v[iMah] === "NULL" || !v[iMah]) continue;
        const k = `${v[iIl]}__${v[iIlce]}__${v[iMah]}__${kat}`;
        mahalle.set(k, (mahalle.get(k) ?? 0) + 1);
      }
    }
  }
  return mahalle;
}

/** Türkiye'nin tam mahalle listesi — "genişlik" boşluğunun paydası. */
function tumMahalleler() {
  const yol = join(ROOT, "data/mahalleler.json");
  if (!existsSync(yol)) return null;
  const liste = JSON.parse(readFileSync(yol, "utf8"));
  const set = new Set();
  const ilceMahalle = new Map();
  for (const m of liste) {
    if (!m.ilNorm || !m.ilceNorm || !m.mahalleNorm) continue;
    set.add(`${m.ilNorm}__${m.ilceNorm}__${m.mahalleNorm}`);
    const ik = `${m.ilNorm}__${m.ilceNorm}`;
    ilceMahalle.set(ik, (ilceMahalle.get(ik) ?? 0) + 1);
  }
  return { set, ilceMahalle };
}

export const bant = (n) => (n === 0 ? "0" : n < HAVUZ_ESIGI ? `1-${HAVUZ_ESIGI - 1}` : n < 20 ? `${HAVUZ_ESIGI}-19` : "20+");

/**
 * Ilce basina kapsam boslugunu hesaplar ve onceligi belirler.
 *
 * Saf fonksiyon — dosya okumadan test edilebilsin diye ayri duruyor. Onceligi
 * belirleyen sey KISMI (1..4 gozlemli) mahalle sayisi; gerekce dosya basinda.
 */
export function ilceBoslugunuHesapla(mahalleler, gozlemAdet) {
  const ilce = new Map();
  for (const mKey of mahalleler) {
    const ik = mKey.slice(0, mKey.lastIndexOf("__"));
    const adet = gozlemAdet(mKey) ?? 0;
    const k = ilce.get(ik) ?? { ilce: ik, toplamMahalle: 0, havuzlu: 0, kismi: 0, bos: 0, gozlem: 0 };
    k.toplamMahalle++;
    k.gozlem += adet;
    if (adet >= HAVUZ_ESIGI) k.havuzlu++;
    else if (adet > 0) k.kismi++;
    else k.bos++;
    ilce.set(ik, k);
  }
  const hepsi = [...ilce.values()].map((x) => ({ ...x, oncelik: x.kismi }));
  return {
    // Is listesi: yalnizca yapilacak isi olanlar, onceliğe gore.
    liste: hepsi
      .filter((x) => x.oncelik > 0)
      .sort((a, b) => b.oncelik - a.oncelik || b.gozlem - a.gozlem),
    // Ozet TUM ilcelerden — filtrelenmis listeden toplam cikarmak, kapsami
    // oldugundan kucuk gosterirdi.
    ozet: {
      havuzlu: hepsi.reduce((t, x) => t + x.havuzlu, 0),
      kismi: hepsi.reduce((t, x) => t + x.kismi, 0),
      bos: hepsi.reduce((t, x) => t + x.bos, 0),
    },
  };
}

export { HAVUZ_ESIGI };

function main() {
  const gozlem = gozlemleriTopla();
  const tum = tumMahalleler();
  if (!tum) throw new Error("data/mahalleler.json yok — genişlik boşluğu hesaplanamaz.");

  const kategoriler = kategoriFiltre ? [kategoriFiltre] : ["arsa", "tarla"];
  const rapor = { olusturuldu: new Date().toISOString(), havuzEsigi: HAVUZ_ESIGI, kategoriler: {} };

  for (const kat of kategoriler) {
    // Mahalle bantları
    const bantlar = { "0": 0, [`1-${HAVUZ_ESIGI - 1}`]: 0, [`${HAVUZ_ESIGI}-19`]: 0, "20+": 0 };
    const gorulen = new Set();
    for (const [k, adet] of gozlem) {
      if (!k.endsWith(`__${kat}`)) continue;
      const mKey = k.slice(0, -(kat.length + 2));
      gorulen.add(mKey);
      bantlar[bant(adet)]++;
    }
    bantlar["0"] = tum.set.size - gorulen.size;

    // İlçe bazlı boşluk: havuz eşiğine ULAŞMAYAN mahalle sayısı.
    // Tarama ilçe seviyesinde yapıldığı için iş listesi de ilçe seviyesinde.
    const { liste, ozet } = ilceBoslugunuHesapla(tum.set, (mKey) => gozlem.get(`${mKey}__${kat}`));

    /**
     * Kanonik listede olmayan gozlem — normalizasyon boslugu.
     *
     * Gozlem tarafinda >=5 ilanli mahalle sayisi ile kanonik listeye dusen
     * sayi arasindaki fark, mahalle adinin data/mahalleler.json ile
     * eslesmedigi kayitlari verir. Bu kayitlar motorda da eslesmiyordur —
     * yani toplanmis ama KULLANILAMAYAN emsal. Sessizce yutulmasin diye
     * ayrica raporlaniyor.
     */
    const eslesmeyenHavuz = (bantlar[`${HAVUZ_ESIGI}-19`] + bantlar["20+"]) - ozet.havuzlu;

    /**
     * Öncelik puanı = kısmi mahalle sayısı (1..4 gözlemli).
     *
     * Neden yalnızca kısmi: backtest'e göre en büyük tek sıçrama 1-4 → 5-19
     * geçişinde (MAPE 94 → 50) ve o geçiş mahalle başına ~4 ilan istiyor.
     * Hiç gözlemi olmayan mahalleyi 5'e çıkarmak ~5 ilan isteyip daha küçük
     * kazanç veriyor (178 → 94 zaten ilk ilanla geliyor). Boş mahalleler
     * raporlanıyor ama sıralamayı belirlemiyor.
     */
    const havuzlu = ozet.havuzlu;
    rapor.kategoriler[kat] = {
      toplamMahalle: tum.set.size,
      gozlemliMahalle: gorulen.size,
      havuzluMahalle: havuzlu,
      havuzKapsamiYuzde: +((100 * havuzlu) / tum.set.size).toFixed(2),
      bantlar,
      eslesmeyenHavuzluMahalle: eslesmeyenHavuz,
      ilceIsListesi: liste.slice(0, 200),
    };

    console.log(`\n── ${kat.toUpperCase()} emsal kapsamı ──`);
    console.log(`  Türkiye mahalle sayısı        : ${tum.set.size}`);
    console.log(`  En az 1 gözlemi olan          : ${gorulen.size} (%${((100 * gorulen.size) / tum.set.size).toFixed(1)})`);
    console.log(`  Havuz eşiğine (>=${HAVUZ_ESIGI}) ulaşan  : ${havuzlu} (%${((100 * havuzlu) / tum.set.size).toFixed(2)})  ← ASIL KAPSAM`);
    console.log(`  Bantlar: ${Object.entries(bantlar).map(([b, n]) => `${b}=${n}`).join("  ")}`);
    console.log(`  Eşiğe yakın (1-${HAVUZ_ESIGI - 1}) mahalle : ${bantlar[`1-${HAVUZ_ESIGI - 1}`]} — iş listesinin hedefi`);
    if (eslesmeyenHavuz > 0) {
      console.log(
        `  ⚠ Kanonik listeye oturmayan   : ${eslesmeyenHavuz} havuzlu mahalle ` +
        `— toplanmış ama motorda eşleşmeyen emsal (mahalle adı uyuşmuyor)`,
      );
    }
  }

  writeFileSync(join(ROOT, "data/kapsam-raporu.json"), JSON.stringify(rapor, null, 2) + "\n", "utf8");
  console.log("\n✓ data/kapsam-raporu.json");

  if (isListesiModu) {
    console.log("\n── TARAMA İŞ LİSTESİ (öncelik sırası) ──");
    console.log("   ilçe                          kısmi  boş  havuzlu  gözlem");
    for (const kat of kategoriler) {
      console.log(`  ${kat}:`);
      for (const x of rapor.kategoriler[kat].ilceIsListesi.slice(0, 25)) {
        console.log(
          `    ${x.ilce.padEnd(30).slice(0, 30)}` +
          `${String(x.kismi).padStart(5)}${String(x.bos).padStart(6)}` +
          `${String(x.havuzlu).padStart(8)}${String(x.gozlem).padStart(9)}`,
        );
      }
    }
    console.log("\n  Kullanım: node scripts/emlakjet-scrape-turkiye.mjs --hedef-listesi");
  }
}

if (process.argv[1] && process.argv[1].endsWith("kapsam-raporu.mjs")) main();
