#!/usr/bin/env node
/**
 * Milli Emlak ilk doldurma SQL üreteci.
 *
 * Haftalık cron (backend/api/src/lib/milli-emlak-scraper.ts) bu işi kendi
 * yapıyor; bu script yalnızca İLK DOLDURMAYI hızlandırmak için — cron'u
 * beklemeden tabloyu doldurup endpoint'leri canlıya almak istediğimizde.
 * Üretilen SQL upsert olduğundan cron'un sonraki turlarıyla çakışmaz.
 *
 * Normalize kuralları TS modülüyle aynı tutulmalı; ayrışırsa aynı ihale iki
 * ayrı satır olarak görünür (UNIQUE anahtarı il/ilce/ada/parsel/tarih).
 *
 * Kullanım:
 *   node scripts/milli-emlak-seed-uret.mjs > scripts/milli-emlak-seed.sql
 *   cd backend/api && npx wrangler d1 execute cadastrum-db --remote \
 *     --file ../../scripts/milli-emlak-seed.sql
 */

const API = "https://mebis-s-p.csb.gov.tr/api/MileWeb/GetSatisIlanList";
const ORIGIN = "https://milliemlak.gov.tr";
const ARAZI = /arsa|arazi|tarla|bağ|bahçe|zeytinlik|çayır|mera|fundalık/i;

const norm = (s) =>
  !s ? "" : s.toLocaleLowerCase("tr")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
    .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/â/g, "a").replace(/î/g, "i").replace(/û/g, "u")
    .replace(/\s+/g, " ").trim();

const mahalleNorm = (s) => {
  const t = norm(s).replace(/\s+(koyu|mahallesi|mah|mh)\.?$/u, "").trim();
  return t || null;
};

const q = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const n = (v) => (v == null || !Number.isFinite(v) ? "NULL" : String(v));

const satirlar = [];
let gorulen = 0, atlanan = 0;
const anahtarlar = new Set();

for (let p = 0; p < 8; p++) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, Referer: `${ORIGIN}/` },
    // `offset` = SAYFA indeksi. pageIndex/page/pageNumber/skip/start sessizce
    // yok sayılıp hep 0. sayfayı döndürüyor — bkz. milli-emlak-scraper.ts notu.
    body: JSON.stringify({ offset: p, pageSize: 100 }),
  });
  if (!res.ok) { process.stderr.write(`sayfa ${p}: HTTP ${res.status}\n`); break; }
  const j = await res.json();
  const liste = j.response_object ?? [];
  if (liste.length === 0) break;

  for (const ilan of liste) {
    for (const t of ilan.tasinmazlar ?? []) {
      gorulen++;
      if (!ARAZI.test(t.tasinmaz_cinsi ?? "")) { atlanan++; continue; }
      const ilN = norm(t.il), ilceN = norm(t.ilce);
      if (!ilN || !ilceN) { atlanan++; continue; }

      const m2raw = t.satilacak_yuzolcumu ?? t.yuzolcumu ?? null;
      const m2 = typeof m2raw === "number" && m2raw > 0 ? m2raw : null;
      const bedel = typeof t.toplam_tahmini_bedel === "number" && t.toplam_tahmini_bedel > 0
        ? t.toplam_tahmini_bedel : null;
      let ppm = null;
      if (bedel && m2) {
        const x = bedel / m2;
        if (x >= 1 && x <= 5_000_000) ppm = Math.round(x);
      }
      const tarih = t.ihale_tarihi ? Date.parse(t.ihale_tarihi) : null;
      const ada = t.ada?.trim() || null;
      const parsel = t.parsel?.trim() || null;

      // UNIQUE(il,ilce,ada,parsel,ihale_tarihi) — aynı anahtar SQL içinde iki
      // kez geçerse ON CONFLICT tek satıra indirir; burada da tekilleştirip
      // üretilen satır sayısının gerçekle uyuşmasını sağlıyoruz.
      const k = `${ilN}|${ilceN}|${ada}|${parsel}|${tarih}`;
      if (anahtarlar.has(k)) { atlanan++; continue; }
      anahtarlar.add(k);

      satirlar.push(
        `(${q(ilN)}, ${q(ilceN)}, ${q(mahalleNorm(t.mahalle))}, ${q(ada)}, ${q(parsel)}, ` +
        `${n(m2)}, ${q(t.tasinmaz_cinsi?.trim() || null)}, ${n(bedel)}, ${n(ppm)}, ${n(tarih)}, ` +
        `'satis', ${q(ilan.id ? `${ORIGIN}/#/ilan-detay/20/${ilan.id}` : null)}, ${Date.now()}, 1)`,
      );
    }
  }
  await new Promise((r) => setTimeout(r, 500));
}

const out = [
  "-- Otomatik üretildi: scripts/milli-emlak-seed-uret.mjs",
  `-- ${satirlar.length} satır (${gorulen} taşınmaz görüldü, ${atlanan} elendi)`,
  "",
];
const PARTI = 200;
for (let i = 0; i < satirlar.length; i += PARTI) {
  out.push(
    "INSERT INTO milli_emlak_ihale\n" +
    "  (il_norm, ilce_norm, mahalle_norm, ada_no, parsel_no, m2, nitelik,\n" +
    "   muhammen_bedel, fiyat_per_m2, ihale_tarihi, ihale_tipi, kaynak_url,\n" +
    "   yakalanma_tarihi, aktif)\n" +
    "VALUES\n  " + satirlar.slice(i, i + PARTI).join(",\n  ") +
    "\nON CONFLICT(il_norm, ilce_norm, ada_no, parsel_no, ihale_tarihi) DO UPDATE SET\n" +
    "  m2 = excluded.m2, muhammen_bedel = excluded.muhammen_bedel,\n" +
    "  fiyat_per_m2 = excluded.fiyat_per_m2, nitelik = excluded.nitelik,\n" +
    "  yakalanma_tarihi = excluded.yakalanma_tarihi, aktif = 1;",
  );
  out.push("");
}

process.stderr.write(`${satirlar.length} satır üretildi (${gorulen} görüldü, ${atlanan} elendi)\n`);
process.stdout.write(out.join("\n"));
