#!/usr/bin/env node
/**
 * scripts/tkgm-analiz-eksik-ayir.mjs
 *
 * NEDEN BU SCRIPT VAR
 * ───────────────────
 * Ölçüm (2026-09-12): yerel `tkgm-analiz-data-1-2025.sql` dosyasında 540 ilçe /
 * 1.065.407 nokta satırı VAR, ama D1'de yalnızca 170 ilçe / 264.475 nokta
 * duruyor. Yani veri aylardır çekilip depoya commit ediliyor ama üretime hiç
 * yüklenmemiş — harita ilçelerin %82'sinde boş görünüyordu.
 *
 * Tek seferde yüklemek mümkün DEĞİL: D1 ücretsiz katmanda günlük yazma limiti
 * 100.000 satır. Bu script 80 MB'lık dosyayı üretime yüklenebilir parçalara
 * ayırır; haritada hiç noktası olmayan ilçeleri ÖNE alır.
 *
 * Çıktı sırası önemli:
 *   1. `-ozet.sql`   — 548 satır. TEK BAŞINA genel görünümü 170 → 548 ilçeye
 *                      çıkarır. En yüksek fayda / en düşük kota.
 *   2. `-nokta-NN.sql` — ayrıntı noktaları, her parça limitin altında.
 *                      Parçalar ilçenin işlem sayısına göre ÇOKTAN AZA sıralı:
 *                      kota biterse en çok bakılan yerler yüklenmiş olur.
 *
 * Kullanım:
 *   node scripts/tkgm-analiz-eksik-ayir.mjs --d1-liste <json> [--parca 90000]
 *   (--d1-liste: D1'de BAŞKA YIL verisi olan ilce_kodu dizisi — bunlar atlanmaz,
 *    sıranın sonuna alınır. Aynı yıl zaten yüklüyse INSERT OR IGNORE korur.)
 */

import { createReadStream, writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";

const args = process.argv.slice(2);
const getArg = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : null;
};

const KAYNAK = getArg("kaynak") ?? "scripts/tkgm-analiz-data-1-2025.sql";
const CIKTI_DIZIN = getArg("cikti") ?? "scripts/tkgm-yukleme";
/** Parça başına nokta satırı. D1 günlük yazma limiti 100.000 — altında kal. */
const PARCA_BOYUT = Number(getArg("parca") ?? 90000);
const D1_LISTE = getArg("d1-liste");
/**
 * İlçe başına en fazla bu kadar nokta yüklenir.
 *
 * NEDEN 5000: harita uçları (`/v1/harita/analiz`, `/analiz/birlesik`) ilçe
 * başına `LIMIT 5000` ile ve SIRALAMASIZ okuyor — 5000'in üstü hiçbir zaman
 * gösterilmiyor. Yüklemek yalnızca yazma kotası harcıyordu (satır başına ~3
 * yazma: tablo + 2 indeks). Ölçüm (yerel dosya, 540 ilçe): sınır 1.065.407
 * satırın 878.946'sını (%82,5) tutuyor, yalnızca 49 büyük ilçe kırpılıyor.
 * Tam veri depodaki kaynak SQL'de duruyor — kayıp yok, yalnızca üretime
 * gönderilmiyor.
 */
const ILCE_MAX = Number(getArg("ilce-max") ?? 5000);

const d1Mevcut = new Set(
  D1_LISTE && existsSync(D1_LISTE)
    ? JSON.parse(readFileSync(D1_LISTE, "utf8")).map(String)
    : [],
);

if (!existsSync(CIKTI_DIZIN)) mkdirSync(CIKTI_DIZIN, { recursive: true });

/**
 * Bir INSERT satırındaki VALUES demetlerini ilçeye göre ayırır.
 * Demet biçimi: (ilce_kodu,analiz_tip,yil,parsel_id,enlem,boylam,sayi,seed_at)
 * Alan sayısı sabit değilse demet ATLANMAZ, hata verilir — sessizce veri
 * düşürmek bu hattın daha önce yaşadığı kayıp sınıfı.
 */
function demetleriAyikla(satir) {
  const bas = satir.indexOf("VALUES");
  if (bas < 0) return [];
  const govde = satir.slice(bas + 6);
  const demetler = govde.match(/\([^()]*\)/g) ?? [];
  return demetler.map((d) => {
    const m = /^\((\d+),(\d+),(\d+),(\d+),/.exec(d);
    if (!m) throw new Error(`demet biçimi tanınmadı: ${d.slice(0, 60)}`);
    return { ilce: m[1], anahtar: `${m[1]}:${m[2]}:${m[3]}:${m[4]}`, demet: d };
  });
}

async function main() {
  const ozetSatirlari = [];
  /** ilce_kodu → demet dizisi */
  const noktaGrup = new Map();
  let okunanNokta = 0;
  let atlananIlce = new Set();
  /**
   * TEKRAR AYIKLAMA. Kaynakta aynı (ilçe, tip, yıl, parsel) çok kez geçiyor —
   * ölçüm: 400 demetlik blokta 166 tekrar (%41). D1'in benzersiz indeksi
   * bunları zaten reddediyor (INSERT OR IGNORE, ilk gelen kalır), ama
   * ayıklamadan ilçe sınırı ve kota hesabı şişkin sayıya göre yapılırdı.
   * İlk geleni tutmak D1 davranışıyla birebir aynı.
   */
  const gorulen = new Set();
  let tekrar = 0;
  /**
   * İlçe merkezi — TÜM benzersiz parsellerden (kırpmadan ÖNCE) ortalama.
   * /harita/ilceler eskiden bunu her çağrıda nokta tablosunu tarayarak
   * hesaplıyordu; bkz. backend/api/src/db/0041_tkgm_ilce_merkez.sql.
   */
  const merkez = new Map();

  const rl = createInterface({ input: createReadStream(KAYNAK), crlfDelay: Infinity });
  // Seed script'i INSERT'i ÜÇ satıra bölüyor: tablo adı / kolonlar / VALUES.
  // Tablo adı VALUES satırında yok — hangi tabloda olduğumuz önceki satırdan
  // taşınıyor. (İlk sürüm tablo adını VALUES satırında aradı ve 80 MB'tan
  // SIFIR satır okudu — sessizce "yüklenecek bir şey yok" dedi.)
  let sonTablo = null;
  for await (const satir of rl) {
    if (satir.includes("INTO tkgm_analiz_ozet")) { sonTablo = "ozet"; continue; }
    if (satir.includes("INTO tkgm_analiz_noktalari")) { sonTablo = "nokta"; continue; }
    if (!satir.includes("VALUES")) continue;

    if (sonTablo === "ozet") {
      // Özet HER ZAMAN yüklenir (INSERT OR REPLACE — güncel sayıyı taşır).
      const deger = satir.trim().replace(/;$/, "");
      ozetSatirlari.push(
        "INSERT OR REPLACE INTO tkgm_analiz_ozet (ilce_kodu, analiz_tip, yil, nokta_sayisi, toplam_islem, seed_at) " +
        deger + ";",
      );
      continue;
    }
    if (sonTablo !== "nokta") continue;

    for (const { ilce, anahtar, demet } of demetleriAyikla(satir)) {
      okunanNokta++;
      if (gorulen.has(anahtar)) { tekrar++; continue; }
      gorulen.add(anahtar);
      const alan = demet.slice(1, -1).split(",");
      const enlem = Number(alan[4]);
      const boylam = Number(alan[5]);
      if (Number.isFinite(enlem) && Number.isFinite(boylam)) {
        const m = merkez.get(ilce) ?? { lat: 0, lng: 0, n: 0 };
        m.lat += enlem; m.lng += boylam; m.n++;
        merkez.set(ilce, m);
      }
      // ATLAMA YOK, yalnızca SONA AL. İlk sürüm bu ilçeleri atlıyordu; ama
      // D1'deki kayıtlar 2024 yılına aitti, bu dosya 2025 — ilçe anahtarı
      // yıl taşımadığı için 170 ilçenin 2025 noktaları sessizce düşüyordu
      // (özet yüklemesinden sonra satır sayısı 548 değil 718 çıkınca görüldü).
      // Bu ilçelerin haritada zaten 2024 noktası var → öncelikleri düşük.
      if (d1Mevcut.has(ilce)) atlananIlce.add(ilce);
      if (!noktaGrup.has(ilce)) noktaGrup.set(ilce, []);
      noktaGrup.get(ilce).push(demet);
    }
  }

  // ── 0. Merkez dosyası ──────────────────────────────────────────────────────
  const merkezYol = join(CIKTI_DIZIN, "00-merkez.sql");
  const simdi = Date.now();
  const merkezSatir = [...merkez.entries()].map(([k, m]) =>
    `INSERT OR REPLACE INTO tkgm_ilce_merkez (ilce_kodu, lat, lng, nokta_adet, guncellendi) VALUES (${k}, ${(m.lat / m.n).toFixed(6)}, ${(m.lng / m.n).toFixed(6)}, ${m.n}, ${simdi});`);
  writeFileSync(merkezYol, merkezSatir.join("\n") + "\n", "utf8");

  // ── 1. Özet dosyası ────────────────────────────────────────────────────────
  const ozetYol = join(CIKTI_DIZIN, "00-ozet.sql");
  writeFileSync(ozetYol, ozetSatirlari.join("\n") + "\n", "utf8");

  // ── 2. Nokta parçaları — çok işlemli ilçe önce ─────────────────────────────
  // Önce hiç noktası olmayan ilçeler, sonra D1'de başka yılı olanlar;
  // her grup içinde çok işlemliden aza.
  const sirali = [...noktaGrup.entries()].sort((a, b) =>
    (Number(d1Mevcut.has(a[0])) - Number(d1Mevcut.has(b[0]))) || (b[1].length - a[1].length));

  const BASLIK = "INSERT OR IGNORE INTO tkgm_analiz_noktalari\n" +
    "  (ilce_kodu,analiz_tip,yil,parsel_id,enlem,boylam,sayi,seed_at)\nVALUES ";

  let parcaNo = 0;
  let tampon = [];
  const parcalar = [];
  const parcaYaz = () => {
    if (tampon.length === 0) return;
    parcaNo++;
    const yol = join(CIKTI_DIZIN, `${String(parcaNo).padStart(2, "0")}-nokta.sql`);
    // Tek dev INSERT yerine 400'lük gruplar — D1 tek ifadede sınırsız demet
    // kabul etmiyor (seed script'i de 400'lük yazıyor).
    const govde = [];
    for (let i = 0; i < tampon.length; i += 400) {
      govde.push(BASLIK + tampon.slice(i, i + 400).join(",") + ";");
    }
    writeFileSync(yol, govde.join("\n") + "\n", "utf8");
    parcalar.push({ yol, satir: tampon.length });
    tampon = [];
  };

  let kirpilanIlce = 0;
  let kirpilanSatir = 0;
  for (const [, tumDemetler] of sirali) {
    // Kırpma İLK N değil EŞİT ADIMLI örnek: kaynak parsel_id sırasında ve
    // parsel_id mahalleye göre kümeleniyor — ilk 5000 ilçenin bir köşesini
    // gösterirdi, ısı haritası yanlış yere yığılırdı.
    let demetler = tumDemetler;
    if (tumDemetler.length > ILCE_MAX) {
      const adim = tumDemetler.length / ILCE_MAX;
      demetler = Array.from({ length: ILCE_MAX }, (_, i) => tumDemetler[Math.floor(i * adim)]);
      kirpilanIlce++;
      kirpilanSatir += tumDemetler.length - ILCE_MAX;
    }
    for (const d of demetler) {
      tampon.push(d);
      if (tampon.length >= PARCA_BOYUT) parcaYaz();
    }
  }
  parcaYaz();

  // Sessiz sıfır olmasın: kaynakta veri var ama hiçbir şey okunmadıysa ayrıştırma bozuktur.
  if (okunanNokta === 0 || ozetSatirlari.length === 0) {
    console.error(`HATA: kaynaktan nokta=${okunanNokta} özet=${ozetSatirlari.length} okundu — ayrıştırıcı biçimi tanımıyor.`);
    process.exit(1);
  }

  const eksikNokta = [...noktaGrup.values()].reduce((s, v) => s + Math.min(v.length, ILCE_MAX), 0);
  console.log(`kaynak            : ${KAYNAK}`);
  console.log(`okunan nokta satırı: ${okunanNokta.toLocaleString("tr-TR")} (tekrar: ${tekrar.toLocaleString("tr-TR")}, benzersiz: ${(okunanNokta - tekrar).toLocaleString("tr-TR")})`);
  console.log(`D1'de başka yılı olan ilçe: ${d1Mevcut.size} (sona alınan: ${atlananIlce.size})`);
  console.log(`yüklenecek ilçe    : ${noktaGrup.size}`);
  console.log(`yüklenecek nokta   : ${eksikNokta.toLocaleString("tr-TR")}`);
  console.log(`ilçe sınırı        : ${ILCE_MAX} — kırpılan ilçe ${kirpilanIlce}, gönderilmeyen satır ${kirpilanSatir.toLocaleString("tr-TR")}`);
  console.log(`merkez dosyası     : ${merkezYol} (${merkezSatir.length} ilçe)`);
  console.log(`özet dosyası       : ${ozetYol} (${ozetSatirlari.length} satır)`);
  console.log(`nokta parçası      : ${parcalar.length} adet × ≤${PARCA_BOYUT.toLocaleString("tr-TR")}`);
  for (const p of parcalar) console.log(`  ${p.yol} — ${p.satir.toLocaleString("tr-TR")} satır`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
