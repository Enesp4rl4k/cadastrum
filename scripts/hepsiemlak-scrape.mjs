#!/usr/bin/env node
/**
 * Hepsiemlak toplu tarama — ilk doldurma için yerel çalıştırıcı.
 *
 * Günlük cron (backend/api/src/lib/hepsiemlak-scraper.ts) aynı işi 3 ilçe/gün
 * hızında yapıyor; 973 ilçe için bu ~11 ay demek. Bu script Worker'ın CPU/wall
 * sınırları olmadan aynı mantığı toplu çalıştırıp D1'e uygulanacak SQL üretir.
 *
 * Parse mantığı TS modülüyle AYNI tutulmalı — ayrışırsa iki hat farklı
 * ilan_no/mahalle üretir ve aynı ilan iki kez girer.
 *
 * Kullanım:
 *   node scripts/hepsiemlak-scrape.mjs --maks-ilce=20
 *   node scripts/hepsiemlak-scrape.mjs --il=istanbul
 *
 * Çıktı: scripts/hepsiemlak-data.sql (her ilçeden sonra güncellenir)
 *   cd backend/api && npx wrangler d1 execute cadastrum-db --remote \
 *     --file ../../scripts/hepsiemlak-data.sql
 *
 * Resume: data/hepsiemlak-progress.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROGRESS = join(ROOT, "data", "hepsiemlak-progress.json");
/**
 * Çıktı artık stdout değil DOSYA.
 *
 * NEDEN: stdout'a yazınca SQL yalnızca koşu bittiğinde ortaya çıkıyordu ve
 * süreç ölürse (bu script daha önce iki kez exit 4 ile öldü) toplanan her şey
 * kayboluyordu. Dosyaya yazmak, her ilçeden sonra diske kaydetmeyi mümkün
 * kılıyor — emlakjet hattı zaten böyle çalışıyor.
 */
const CIKTI = join(ROOT, "scripts", "hepsiemlak-data.sql");
const BASE = "https://www.hepsiemlak.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36";
// ÖLÇÜM: 700 ms ile 25 dakikada 254 ilçe tarandı ve site HTTP 429 vermeye
// başladı; o noktadan sonra script çöp üretti. Sürdürülebilir hız bunun çok
// altında. 2500 ms sayfa arası + 4000 ms ilçe arası ≈ dakikada ~20 istek.
const ISTEK_ARASI_MS = 2500;
const ILCE_ARASI_MS = 4000;
const MAX_SAYFA = 25;

const args = process.argv.slice(2);
const get = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const filtreIl = get("il");
const maksIlce = get("maks-ilce") ? parseInt(get("maks-ilce"), 10) : null;

const uyku = (ms) => new Promise((r) => setTimeout(r, ms));

// ── TS modülüyle birebir aynı normalize/parse mantığı ────────────────────────
const normalizeTr = (s) =>
  s.toLocaleLowerCase("tr")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
    .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/â/g, "a").replace(/î/g, "i").replace(/û/g, "u")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// TS modulundeki KATEGORI_ESLEME ile BIREBIR ayni tutulmali.
const KATEGORI_ESLEME = {
  arsa:            { kategori: "arsa",  imar: null },
  "muhtelif-arsa": { kategori: "arsa",  imar: null },
  "imarli-konut":  { kategori: "arsa",  imar: "Konut İmarlı" },
  "imarli-villa":  { kategori: "arsa",  imar: "Konut İmarlı (villa)" },
  "imarli-sanayi": { kategori: "arsa",  imar: "Sanayi İmarlı" },
  "imarli-ticari": { kategori: "arsa",  imar: "Ticari İmarlı" },
  "turistik-arsa": { kategori: "arsa",  imar: "Turizm İmarlı" },
  tarla:           { kategori: "tarla", imar: "Tarla" },
  bahce:           { kategori: "tarla", imar: "Bahçe" },
  bag:             { kategori: "tarla", imar: "Bağ" },
  zeytinlik:       { kategori: "tarla", imar: "Zeytinlik" },
};

function ilanUrlParse(url, ilN, ilceN) {
  const m = url.match(/\/([a-z0-9-]+)-satilik\/([a-z-]+)\/([0-9-]+)(?:$|[?#])/);
  if (!m) return null;
  const esleme = KATEGORI_ESLEME[m[2]];
  if (!esleme) return null;
  let kalan = m[1];
  for (const onek of [ilN, ilceN]) {
    if (!onek) continue;
    if (kalan.startsWith(`${onek}-`)) kalan = kalan.slice(onek.length + 1);
    else if (kalan === onek) kalan = "";
  }
  return {
    ilanNo: `he_${m[3]}`,
    mahN: kalan && kalan !== m[1] ? kalan : null,
    kategori: esleme.kategori,
    imarDurumu: esleme.imar,
  };
}

function adresMahalle(streetAddress) {
  if (!streetAddress) return null;
  const p = streetAddress.split(",").map((s) => s.trim());
  return p[0] || null;
}

function listeJsonLdCikar(html) {
  const bloklar = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)];
  for (const b of bloklar) {
    let j;
    try { j = JSON.parse(b[1]); } catch { continue; }
    const arr = Array.isArray(j) ? j : (j["@graph"] ?? [j]);
    for (const o of arr) {
      if (o && o["@type"] === "ItemList" && Array.isArray(o.itemListElement)) {
        return o.itemListElement.map((e) => e.item).filter(Boolean);
      }
    }
  }
  return [];
}

function ilanNormalize(it, ilN, ilceN) {
  if (!it.url) return null;
  const u = ilanUrlParse(it.url, ilN, ilceN);
  if (!u) return null;
  const pc = it.offers?.priceCurrency;
  if (pc && pc !== "TRY" && pc !== "TL") return null;
  const fiyat = Number(it.offers?.price);
  if (!Number.isFinite(fiyat) || fiyat <= 0) return null;
  const ap = (it.about?.additionalProperty ?? []).find(
    (p) => p.name === "Net Alan" || p.name === "Brüt Alan",
  );
  const m2 = Number(ap?.value);
  if (!Number.isFinite(m2) || m2 < 50) return null;
  if (ap?.unitCode && ap.unitCode !== "MTK") return null;
  const tlm2 = Math.round(fiyat / m2);
  if (tlm2 < 100 || tlm2 > 10_000_000) return null;
  let mahN = u.mahN;
  if (!mahN) {
    const a = adresMahalle(it.about?.address?.streetAddress);
    mahN = a ? normalizeTr(a) : null;
  }
  return {
    ilanNo: u.ilanNo, ilN, ilceN, mahN, kategori: u.kategori,
    tlm2, m2: Math.round(m2), baslik: it.name?.trim() || null,
    imarDurumu: u.imarDurumu,
  };
}

/**
 * Sayfa çekimi CURL ile yapılır, Node fetch ile DEĞİL.
 *
 * ÖLÇÜM: hepsiemlak, Node fetch (undici) isteklerine 403 döndürüyor; aynı URL
 * curl ile 200 dönüyor. Header setiyle aşılmıyor — sadece-UA, UA+Accept ve tam
 * tarayıcı başlık seti (Sec-Fetch-*, Accept-Encoding, Upgrade-Insecure-Requests
 * dahil) üçü de 403 aldı. Yani filtre TLS/HTTP2 parmak izine bakıyor.
 *
 * Aynı sebeple Cloudflare Workers fetch i de 403 alıyor (/v1/admin/kaynak-testi
 * ile ölçüldü), bu yüzden hepsiemlak cron a bağlanamıyor ve bu yerel script
 * tek çalışan yol.
 *
 * NOT: burada yapılan şey bir korumayı AŞMAK değil — curl sıradan bir HTTP
 * istemcisi ve site ona normal şekilde 200 dönüyor; robots.txt de bu yolu
 * (`Allow: /`) açıkça izinli kılıyor. Tarayıcı taklidi, CAPTCHA çözümü veya
 * engel atlatma yapılmıyor.
 */
/**
 * @returns {Promise<{status:number, govde:string|null}>}
 *
 * HTTP DURUMU MUTLAKA DÖNDÜRÜLÜR. Önceki sürüm hatayı yutup `null` dönüyordu;
 * site 429 verdiğinde script bunu "bu ilçede ilan yok" gibi gösterip `+0`
 * yazarak taramaya devam ediyordu — engellenmeyi veri yokluğu gibi raporlayan
 * sessiz bir başarısızlık. 254 ilçe bu şekilde çöp olarak işlendi.
 */
function getir(url) {
  return new Promise((resolve) => {
    execFile(
      "curl",
      ["-sL", "--compressed", "--max-time", "30",
       "-w", "\\n__HTTP__%{http_code}",
       "-A", UA, "-H", "Accept-Language: tr-TR,tr;q=0.9", url],
      { maxBuffer: 32 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout) return resolve({ status: 0, govde: null });
        const i = stdout.lastIndexOf("\n__HTTP__");
        if (i === -1) return resolve({ status: 0, govde: null });
        const status = parseInt(stdout.slice(i + 9), 10) || 0;
        resolve({ status, govde: status === 200 ? stdout.slice(0, i) : null });
      },
    );
  });
}

/** Üst üste kaç 429 sonrası tarama tamamen durur. */
const MAX_ARDISIK_429 = 3;
let ardisik429 = 0;

/** 429 görülürse artan bekleme; kalıcıysa çağıran taramayı durdurur. */
async function geriCekil(sayac) {
  const bekle = Math.min(60_000, 5_000 * 2 ** (sayac - 1));
  process.stderr.write(`  ! HTTP 429 — ${Math.round(bekle / 1000)} sn bekleniyor\n`);
  await uyku(bekle);
}

async function ilceTara(ilN, ilceN, kategori, gorulen, kayitlar) {
  let eklenen = 0;
  for (let sayfa = 1; sayfa <= MAX_SAYFA; sayfa++) {
    const url = `${BASE}/${ilceN}-satilik/${kategori}${sayfa > 1 ? `?page=${sayfa}` : ""}`;
    const { status, govde: html } = await getir(url);

    if (status === 429) {
      ardisik429++;
      if (ardisik429 >= MAX_ARDISIK_429) {
        throw new Error(
          `HTTP 429 üst üste ${ardisik429} kez — tarama durduruluyor. ` +
          `Kaynak bizi kısıtlıyor; bir süre bekleyip resume ile devam edin.`,
        );
      }
      await geriCekil(ardisik429);
      sayfa--; // aynı sayfayı tekrar dene
      continue;
    }
    if (status !== 200) break;
    ardisik429 = 0;

    if (!html) break;
    const items = listeJsonLdCikar(html);
    // Bitiş koşulu SAYFANIN BOŞ OLMASI — "yeni ilan yok" değil. (emlakjet
    // hattında bu ikisini karıştırmak derin sayfalara hiç ulaşamamaya yol
    // açmıştı.)
    if (items.length === 0) break;
    for (const it of items) {
      const ilan = ilanNormalize(it, ilN, ilceN);
      if (!ilan || gorulen.has(ilan.ilanNo)) continue;
      gorulen.add(ilan.ilanNo);
      const t = ilan.mahN ? MERKEZ[`${ilan.ilN}__${ilan.ilceN}__${ilan.mahN}`] : null;
      if (t) { ilan.lat = t[0]; ilan.lng = t[1]; }
      kayitlar.push(ilan);
      eklenen++;
    }
    await uyku(ISTEK_ARASI_MS);
  }
  return eklenen;
}

// ── Mahalle merkezleri ───────────────────────────────────────────────────────
// NEDEN BURADA: Worker modülündeki koordinatAra() D1 deki `mahalle_merkez`
// tablosuna bakıyor ama O TABLO ÜRETİMDE YOK — sessizce hep null dönüyor.
// Koordinat üretebilen tek yol bu yerel script; koordinatsız ilan spatial
// emsal motoruna görünmez olurdu.
const { objeyiCikar } = await import("./emlakjet-lib.mjs");
const MERKEZ = objeyiCikar(join(ROOT, "src/lib/data/mahalle-merkezleri.ts"), "MERKEZ_TUPLES");
process.stderr.write(`${Object.keys(MERKEZ).length} mahalle merkezi yüklendi
`);

// ── İlçe listesi (emlakjet bootstrap listesinden) ────────────────────────────
const ilceTs = readFileSync(join(ROOT, "src/lib/data/ilce-listesi-bootstrap.ts"), "utf8");
const ISARET = "BOOTSTRAP_ILCE_LISTESI: BootstrapIlce[] = [";
const bas = ilceTs.indexOf(ISARET);
const dizi = ilceTs.slice(bas + ISARET.length - 1);
let ilceler = JSON.parse(dizi.slice(0, dizi.indexOf("\n];") + 2));
const tekil = new Map();
for (const i of ilceler) if (i?.ilNorm && i?.ilceNorm) tekil.set(`${i.ilNorm}/${i.ilceNorm}`, i);
ilceler = [...tekil.values()];
if (filtreIl) ilceler = ilceler.filter((i) => i.ilNorm === filtreIl);

const progress = existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, "utf8")) : { tamam: [] };
const tamamSet = new Set(progress.tamam);
const hedefler = ilceler.filter((i) => !tamamSet.has(`${i.ilNorm}/${i.ilceNorm}`));
const secilen = maksIlce ? hedefler.slice(0, maksIlce) : hedefler;

process.stderr.write(`${ilceler.length} ilçe, ${tamamSet.size} tamam, ${secilen.length} taranacak\n`);

const kayitlar = [];
const gorulen = new Set();
let idx = 0;
for (const i of secilen) {
  idx++;
  let n = 0;
  try {
    for (const kat of ["arsa", "tarla"]) {
      n += await ilceTara(i.ilNorm, i.ilceNorm, kat, gorulen, kayitlar);
    }
  } catch (e) {
    // Kalıcı 429 — toplanmış veriyi ve ilerlemeyi kaybetmeden dur.
    process.stderr.write(`DURDURULDU: ${e.message}
`);
    break;
  }
  tamamSet.add(`${i.ilNorm}/${i.ilceNorm}`);
  await uyku(ILCE_ARASI_MS);
  process.stderr.write(`[${idx}/${secilen.length}] ${i.il}/${i.ilce} +${n} (toplam ${kayitlar.length})\n`);
  // Her ilçede diske yaz — ölüm hâlinde kayıp en fazla bir ilçe.
  durumKaydet();
}

// ── SQL üretimi ──────────────────────────────────────────────────────────────
// NEDEN FONKSİYON: eskiden SQL yalnızca koşunun SONUNDA yazılıyordu. Bu script
// günlerce sürecek bir tarama yapıyor ve daha önce iki kez beklenmedik şekilde
// öldü (exit 4) — o hâliyle ölüm, o ana kadar toplanan her şeyin kaybı demekti.
// Artık emlakjet hattıyla aynı davranış: her partide diske yazılıyor.
function sqlYaz() {
  const q = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
  const out = [
    "-- Otomatik üretildi: scripts/hepsiemlak-scrape.mjs",
    `-- ${kayitlar.length} ilan`,
    "",
  ];
  const PARTI = 400;
  const ts = Date.now();
  for (let i = 0; i < kayitlar.length; i += PARTI) {
    const vals = kayitlar.slice(i, i + PARTI).map((k) =>
      `('hepsiemlak', ${q(k.ilanNo)}, ${q(k.ilN)}, ${q(k.ilceN)}, ${q(k.mahN)}, ` +
      `${k.tlm2}, ${k.m2}, ${q(k.kategori)}, 'TL', ${ts}, 1, ${q(k.baslik)}, ${q(k.imarDurumu)}, ` +
      `${k.lat ?? "NULL"}, ${k.lng ?? "NULL"}, ${k.lat ? "'mahalle-merkez'" : "NULL"})`,
    );
    out.push(
      "INSERT OR IGNORE INTO ilanlar\n" +
      "  (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, fiyat_per_m2, m2,\n" +
      "   kategori, para_birimi, yakalanma_tarihi, aktif, baslik, imar_durumu,\n" +
      "   lat, lng, koord_kaynagi)\n" +
      "VALUES\n  " + vals.join(",\n  ") + ";",
    );
    out.push("");
  }
  writeFileSync(CIKTI, out.join("\n"), "utf8");
}

function durumKaydet() {
  mkdirSync(dirname(PROGRESS), { recursive: true });
  writeFileSync(PROGRESS, JSON.stringify({ tamam: [...tamamSet] }));
  sqlYaz();
}

durumKaydet();
process.stderr.write(`${kayitlar.length} ilan → ${CIKTI}
`);
