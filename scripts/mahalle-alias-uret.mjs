#!/usr/bin/env node
/**
 * Mahalle Alias Seed Üretici — Mahalle Faz 4
 *
 * Akış:
 *   1. data/mahalleler.json (OSM ~70k mahalle) oku
 *   2. OSM mahallelerini il+ilçe bazında grupla
 *   3. Her il+ilçe çifti için TKGM mahalle listesini çek
 *   4. Fuzzy match: OSM adı → TKGM (mahalleKodu, mahalleAdi) — skor ≥ 80
 *   5. Çıktılar:
 *      - data/mahalle-alias-seed.json    (tüm eşleşmeler, debug/rerun için)
 *      - src/lib/data/mahalle-alias-seed.ts  (extension'a gömülü seed)
 *
 * Kullanım:
 *   node scripts/mahalle-alias-uret.mjs
 *   node scripts/mahalle-alias-uret.mjs --il=istanbul        # tek il
 *   node scripts/mahalle-alias-uret.mjs --min-skor=85        # daha katı eşleşme
 *   node scripts/mahalle-alias-uret.mjs --sadece-ts          # sadece TS çıktısı (JSON'dan)
 *
 * Rate limit: TKGM ilçe başına ~200ms bekleme (3x retry), batch=5 paralel.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Argüman parse ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argMap = Object.fromEntries(
  argv
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v] = a.slice(2).split("=");
      return [k, v ?? "true"];
    }),
);
const FILTRE_IL = argMap["il"] ?? null;            // örn: "istanbul"
const MIN_SKOR = Number(argMap["min-skor"] ?? 80); // minimum eşleşme skoru
const SADECE_TS = argMap["sadece-ts"] === "true";  // JSON'dan TS üret, TKGM çağrısı yapma

// ── Dosya yolları ──────────────────────────────────────────────────────────────
const MAHALLE_JSON = `${__dirname}/../data/mahalleler.json`;
const SEED_JSON    = `${__dirname}/../data/mahalle-alias-seed.json`;
const SEED_TS      = `${__dirname}/../src/lib/data/mahalle-alias-seed.ts`;
const TKGM_CACHE   = `${__dirname}/../data/.cache-tkgm-mahalle`;

// ── TKGM API ───────────────────────────────────────────────────────────────────
const TKGM_BASE = "https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api";
const HEADERS = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (Cadastrum-MahalleAlias/1.0)",
};

/** Basit sleep */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** TKGM'den JSON çek (3x retry, exponential backoff) */
async function tkgmFetch(url, label = "") {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15_000) });
      if (res.status === 403) throw new Error("TKGM 403 — limit dolmuş olabilir");
      if (res.status === 503) {
        await sleep(3000 * (i + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.startsWith("<")) throw new Error("XML cevap — TKGM geçici hata");
      return JSON.parse(text);
    } catch (e) {
      if (i === 2) throw new Error(`[${label}] ${e.message}`);
      await sleep(1000 * (i + 1));
    }
  }
}

/** Disk cache'li TKGM il listesi */
async function getIlListesi() {
  const cacheFile = `${TKGM_CACHE}/il-liste.json`;
  if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, "utf8"));
  const data = await tkgmFetch(`${TKGM_BASE}/idariYapi/ilListe`, "il-liste");
  const iller = (data.features ?? []).map((f) => ({
    kod: Number(f.properties?.id),
    ad: String(f.properties?.text ?? f.properties?.ad ?? ""),
  }));
  mkdirSync(TKGM_CACHE, { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(iller), "utf8");
  return iller;
}

/** Disk cache'li TKGM ilçe listesi (il kodu bazında) */
async function getIlceListesi(ilKodu) {
  const cacheFile = `${TKGM_CACHE}/ilce-${ilKodu}.json`;
  if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, "utf8"));
  const data = await tkgmFetch(
    `${TKGM_BASE}/idariYapi/ilceListe/${ilKodu}`,
    `ilce-${ilKodu}`,
  );
  const ilceler = (data.features ?? []).map((f) => ({
    ilceKodu: Number(f.properties?.id),
    ilceAdi: String(f.properties?.text ?? f.properties?.ilceAdi ?? ""),
    ilKodu,
  }));
  writeFileSync(cacheFile, JSON.stringify(ilceler), "utf8");
  return ilceler;
}

/** Disk cache'li TKGM mahalle listesi (ilçe kodu bazında) */
async function getMahalleListesi(ilceKodu) {
  const cacheFile = `${TKGM_CACHE}/mahalle-${ilceKodu}.json`;
  if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, "utf8"));
  await sleep(200); // TKGM rate-limit: ilçe başına 200ms
  const data = await tkgmFetch(
    `${TKGM_BASE}/idariYapi/mahalleListe/${ilceKodu}`,
    `mahalle-${ilceKodu}`,
  );
  const mahalleler = (data.features ?? []).map((f) => ({
    mahalleKodu: Number(f.properties?.id),
    mahalleAdi: String(f.properties?.text ?? f.properties?.mahalleAdi ?? ""),
    ilceKodu,
  }));
  if (mahalleler.length > 0) {
    writeFileSync(cacheFile, JSON.stringify(mahalleler), "utf8");
  }
  return mahalleler;
}

// ── Normalizasyon (tkgm-api.ts ile birebir aynı) ──────────────────────────────
const MAHALLE_GURULTU_RE =
  /\b(mahallesi|mahalle|mah\.?|köyü|koyu|koy|beldesi|belde|semti|semt|mh\.?)\b/gi;

function normalizeTr(s) {
  return s
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (c) =>
      ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" })[c] ?? c,
    )
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeYerAdi(s) {
  return normalizeTr(s)
    .replace(
      /\b(ilcesi|ilce|il|district|province|county|city|town)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMahalleAra(s) {
  return normalizeYerAdi(
    s.replace(MAHALLE_GURULTU_RE, " ").replace(/\s+/g, " ").trim(),
  );
}

// ── Fuzzy matching (tkgm-api.ts levenshtein ile aynı mantık) ──────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = Array.from({ length: n + 1 }, (_, j) => j);
  const cur  = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
    }
    prev.splice(0, prev.length, ...cur);
  }
  return prev[n];
}

function yerAdiEslesir(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const minLen = Math.min(a.length, b.length);
  if (minLen <= 4) return a === b;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  const maxDist = minLen >= 8 ? 2 : 1;
  return levenshtein(a, b) <= maxDist;
}

function tumTokenlerEslesir(ilanHam, tkgmN) {
  const tokens = normalizeTr(ilanHam)
    .split(" ")
    .filter((t) => t.length >= 3);
  return tokens.length > 0 && tokens.every((t) => tkgmN.includes(t));
}

/**
 * OSM mahalle adını TKGM listesinde arar.
 * Döner: { mahalleKodu, mahalleAdi, skor } | null
 */
function mahalleEsle(osmAd, tkgmMahalleler) {
  const ilanN = normalizeMahalleAra(osmAd);
  if (!ilanN) return null;

  let enIyi = null;
  let enIyiSkor = 0;

  for (const m of tkgmMahalleler) {
    const tkgmHam = m.mahalleAdi;
    const tkgmN   = normalizeMahalleAra(tkgmHam);
    if (!tkgmN) continue;

    let skor = 0;
    if (normalizeTr(tkgmHam) === normalizeTr(osmAd)) skor = 100;
    else if (tkgmN === ilanN) skor = 95;
    else if (yerAdiEslesir(tkgmN, ilanN)) skor = 88;
    else if (tumTokenlerEslesir(osmAd, tkgmN)) skor = 82;
    else if (tkgmN.length >= 4 && (ilanN.includes(tkgmN) || tkgmN.includes(ilanN))) skor = 72;

    if (skor > enIyiSkor) {
      enIyiSkor = skor;
      enIyi = m;
    }
  }

  if (!enIyi || enIyiSkor < MIN_SKOR) return null;
  return { ...enIyi, skor: enIyiSkor };
}

// ── Ana işlem ─────────────────────────────────────────────────────────────────

/**
 * Batch işleyici: eşzamanlı max N Promise çalıştır.
 */
async function batchRun(items, batchSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

/**
 * TS çıktısını JSON'dan üret (--sadece-ts modu veya son adım olarak).
 */
function tsCiktiUret(kayitlar) {
  const tarih = new Date().toISOString().slice(0, 10);

  // MahalleAliasKayit tipine uygun obje formatı
  const satirlar = kayitlar.map((k) => {
    const key = `${k.ilNorm}|${k.ilceNorm}|${k.mahalleNorm}`;
    return `  ${JSON.stringify(key)}: { mahalleKodu: ${k.mahalleKodu}, tkgmMahalleAd: ${JSON.stringify(k.tkgmMahalleAdi)}, skor: ${k.skor} }`;
  });

  return `/**
 * Mahalle alias seed — gömülü ön eşleşme tablosu.
 *
 * Bu dosya \`scripts/mahalle-alias-uret.mjs\` tarafından üretilir.
 * **Manuel düzenleme YAPMAYIN** — script tekrar çalıştırıldığında üzerine yazılır.
 *
 * Kullanım: Extension başlarken bu seed Dexie mahalleAlias tablosuna yüklenir;
 * kullanıcı hiç ilan görmemiş olsa bile otomatik eşleşme oranı artar.
 *
 * Toplam ${kayitlar.length} alias. Üretim: ${tarih}.
 * Kaynak: TKGM idariYapi API × OSM mahalleler.json fuzzy match (min skor ${MIN_SKOR}).
 */

export interface MahalleAliasSeedKayit {
  mahalleKodu: number;
  tkgmMahalleAd: string;
  skor: number;
}

/** key = \`\${ilNorm}|\${ilceNorm}|\${mahalleNorm}\` */
export const MAHALLE_ALIAS_SEED: Readonly<Record<string, MahalleAliasSeedKayit>> = {
${satirlar.join(",\n")},
};

export const ALIAS_SEED_TARIHI = "${tarih}";
export const ALIAS_SEED_SAYI = ${kayitlar.length};
`;
}

async function main() {
  mkdirSync(TKGM_CACHE, { recursive: true });

  // ── Sadece TS modu: mevcut JSON'dan TS üret ────────────────────────────────
  if (SADECE_TS) {
    if (!existsSync(SEED_JSON)) {
      process.stderr.write(`HATA: ${SEED_JSON} bulunamadı. Önce tam çalıştırın.\n`);
      process.exit(1);
    }
    const kayitlar = JSON.parse(readFileSync(SEED_JSON, "utf8"));
    const ts = tsCiktiUret(kayitlar);
    mkdirSync(dirname(SEED_TS), { recursive: true });
    writeFileSync(SEED_TS, ts, "utf8");
    process.stdout.write(`✓ ${SEED_TS} (${kayitlar.length} alias)\n`);
    return;
  }

  // ── OSM mahalleler.json oku ────────────────────────────────────────────────
  process.stdout.write(`[1/4] data/mahalleler.json okunuyor...\n`);
  const osmMahalleler = JSON.parse(readFileSync(MAHALLE_JSON, "utf8"));
  process.stdout.write(`      ${osmMahalleler.length} OSM kayıt\n`);

  // ── İl+ilçe bazında grupla ─────────────────────────────────────────────────
  /** @type {Map<string, Array<{osmAd: string, ilNorm: string, ilceNorm: string}>>} */
  const gruplar = new Map();
  for (const m of osmMahalleler) {
    if (!m.ilNorm || !m.ilceNorm || !m.ad) continue;
    if (FILTRE_IL && m.ilNorm !== normalizeTr(FILTRE_IL)) continue;
    const key = `${m.ilNorm}||${m.ilceNorm}`;
    if (!gruplar.has(key)) gruplar.set(key, []);
    gruplar.get(key).push({
      osmAd: m.ad,
      osmAdTam: m.adTam ?? m.ad,
      ilNorm: m.ilNorm,
      ilceNorm: m.ilceNorm,
      il: m.il,
      ilce: m.ilce,
    });
  }
  process.stdout.write(`[2/4] ${gruplar.size} il+ilçe grubu oluşturuldu\n`);

  // ── TKGM il kodu haritası ──────────────────────────────────────────────────
  process.stdout.write(`[3/4] TKGM il listesi çekiliyor...\n`);
  const tkgmIller = await getIlListesi();
  /** @type {Map<string, number>} ilNorm → ilKodu */
  const ilKoduMap = new Map(tkgmIller.map((il) => [normalizeTr(il.ad), il.kod]));
  process.stdout.write(`      ${tkgmIller.length} TKGM il\n`);

  // ── Her il+ilçe için TKGM mahalle listesi çek & eşleştir ──────────────────
  process.stdout.write(`[4/4] TKGM mahalle eşleştirme başlıyor...\n`);

  const grupListesi = [...gruplar.entries()];
  let ilerleme = 0;
  let eslesenToplam = 0;
  let hataGrubu = 0;

  /** @type {Array<{key: string, ilNorm: string, ilceNorm: string, mahalleNorm: string, mahalleKodu: number, tkgmMahalleAdi: string, skor: number}>} */
  const tumKayitlar = [];

  // Batch=5 paralel (TKGM rate-limit dikkate alınarak)
  await batchRun(grupListesi, 5, async ([grupKey, osmGrup]) => {
    ilerleme++;
    if (ilerleme % 50 === 0) {
      process.stdout.write(
        `      ${ilerleme}/${grupListesi.length} grup işlendi, ${eslesenToplam} eşleşme\n`,
      );
    }

    const [ilNorm, ilceNorm] = grupKey.split("||");
    const ornekGrup = osmGrup[0];

    // TKGM il kodu bul
    const ilKodu = ilKoduMap.get(ilNorm);
    if (!ilKodu) return; // TKGM'de bulunmayan il (OSM normalizasyon farkı)

    // TKGM ilçe listesi
    let tkgmIlceler;
    try {
      tkgmIlceler = await getIlceListesi(ilKodu);
    } catch (e) {
      hataGrubu++;
      process.stderr.write(`  ⚠ İlçe listesi alınamadı: ${ornekGrup.il} — ${e.message}\n`);
      return;
    }

    // OSM ilçe adını TKGM'de bul (fuzzy)
    const osmIlceN = normalizeYerAdi(ornekGrup.ilce ?? "");
    const tkgmIlce =
      tkgmIlceler.find((x) => normalizeYerAdi(x.ilceAdi) === osmIlceN) ??
      tkgmIlceler.find((x) => yerAdiEslesir(normalizeYerAdi(x.ilceAdi), osmIlceN));

    if (!tkgmIlce) return; // TKGM'de eşleşmeyen ilçe adı

    // TKGM mahalle listesi
    let tkgmMahalleler;
    try {
      tkgmMahalleler = await getMahalleListesi(tkgmIlce.ilceKodu);
    } catch (e) {
      hataGrubu++;
      process.stderr.write(
        `  ⚠ Mahalle listesi alınamadı: ${ornekGrup.ilce} (${tkgmIlce.ilceKodu}) — ${e.message}\n`,
      );
      return;
    }

    if (!tkgmMahalleler.length) return;

    // Her OSM mahallesi için eşleştir
    const grupKayitlar = [];
    const gorulenNorm = new Set(); // aynı normalden tekrar alias yazma

    for (const osm of osmGrup) {
      const mahalleNorm = normalizeMahalleAra(osm.osmAd);
      if (!mahalleNorm || gorulenNorm.has(mahalleNorm)) continue;
      gorulenNorm.add(mahalleNorm);

      const eslesen = mahalleEsle(osm.osmAd, tkgmMahalleler);
      if (!eslesen) continue;

      grupKayitlar.push({
        key: `${ilNorm}|${ilceNorm}|${mahalleNorm}`,
        ilNorm,
        ilceNorm,
        mahalleNorm,
        il: ornekGrup.il,
        ilce: ornekGrup.ilce,
        osmAd: osm.osmAd,
        mahalleKodu: eslesen.mahalleKodu,
        tkgmMahalleAdi: eslesen.mahalleAdi,
        skor: eslesen.skor,
      });
    }

    eslesenToplam += grupKayitlar.length;
    tumKayitlar.push(...grupKayitlar);
  });

  process.stdout.write(
    `\n✓ Tamamlandı: ${eslesenToplam} eşleşme, ${hataGrubu} hatalı grup\n`,
  );

  // Skora göre sırala (yüksekten düşüğe)
  tumKayitlar.sort((a, b) => b.skor - a.skor || a.key.localeCompare(b.key));

  // ── JSON çıktısı ───────────────────────────────────────────────────────────
  writeFileSync(SEED_JSON, JSON.stringify(tumKayitlar, null, 2), "utf8");
  process.stdout.write(`✓ ${SEED_JSON} (${(JSON.stringify(tumKayitlar).length / 1024).toFixed(0)} KB)\n`);

  // ── TS seed çıktısı ────────────────────────────────────────────────────────
  mkdirSync(dirname(SEED_TS), { recursive: true });
  const ts = tsCiktiUret(tumKayitlar);
  writeFileSync(SEED_TS, ts, "utf8");
  process.stdout.write(`✓ ${SEED_TS} (${tumKayitlar.length} alias)\n`);

  // ── Özet istatistik ────────────────────────────────────────────────────────
  const skorDagilim = { "100": 0, "95-99": 0, "88-94": 0, "82-87": 0, "80-81": 0 };
  for (const k of tumKayitlar) {
    if (k.skor === 100) skorDagilim["100"]++;
    else if (k.skor >= 95) skorDagilim["95-99"]++;
    else if (k.skor >= 88) skorDagilim["88-94"]++;
    else if (k.skor >= 82) skorDagilim["82-87"]++;
    else skorDagilim["80-81"]++;
  }
  process.stdout.write(`\nSkor dağılımı:\n`);
  for (const [bant, sayi] of Object.entries(skorDagilim)) {
    process.stdout.write(`  ${bant}: ${sayi}\n`);
  }
}

main().catch((e) => {
  process.stderr.write(`HATA: ${e.message}\n${e.stack}\n`);
  process.exit(1);
});
