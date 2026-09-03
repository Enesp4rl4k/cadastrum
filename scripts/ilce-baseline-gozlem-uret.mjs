#!/usr/bin/env node
/**
 * Gözlemlenen ilan verisinden ilçe baseline tablosu üretir.
 *
 *   node scripts/ilce-baseline-gozlem-uret.mjs
 *   → src/lib/data/ilce-baseline-gozlem.ts
 *
 * NEDEN: elimizdeki iki statik ilçe tablosu da gözleme dayanmıyordu ve
 * ölçüldüklerinde ikisi de kötü çıktı (n>=20 gözlemi olan ilçelerde, gözlem
 * medyanına karşı, 2026-08-31):
 *
 *   ILCE_BASELINE_ARSA     (elle yazılmış)  MAPE 123 · medyan  72 · ±%20 %18,0
 *   ILCE_BASELINE_AI_ARSA  (Groq llama-3.3) MAPE 295 · medyan 187 · ±%20 % 3,4
 *   ILCE_BASELINE_TARLA    (elle yazılmış)  MAPE  43 · medyan  42 · ±%20 %32,4
 *   ILCE_BASELINE_AI_TARLA (Groq llama-3.3) MAPE  53 · medyan  49 · ±%20 %14,3
 *
 * AI arsa tablosunun ±%20 isabeti %3,4 — rastgeleden farksız. Bu tablo,
 * canlı gözlem yokken kullanıcıya gösterilen fiyatın kaynağıydı.
 *
 * Bu üreteç aynı soruyu tahminle değil sayımla cevaplıyor: ilçede gözlenmiş
 * ilanların medyanı. MIN_GOZLEM'in altındaki ilçeler tabloya HİÇ girmez —
 * eksik satır, uydurma satırdan iyidir; motor bir üst basamağa düşer.
 *
 * ⚠️ DURUM: ÜRETİLİYOR AMA MOTORA BAĞLI DEĞİL — 2026-08-31'de denendi, ölçüm
 * REDDETTİ. Çıktı dosyası bu yüzden repoda tutulmuyor; denemek isteyen bu
 * üreteci koşturup `ilceFiyatGetir` (baseline-engine.ts) ile
 * `ilceBaselineGetir` (data/ilce-baseline.ts) içine bağlar.
 *
 * Ne oldu: iki farklı öncelik sırası denendi —
 *   (a) gözlem → elle → AI :  tarla ±%20 46,5 → 42,8   (eşik kırıldı)
 *   (b) elle → gözlem → AI :  tarla ±%20 46,5 → 42,3   (eşik kırıldı)
 * Her ikisinde de YANLILIK düzeldi (tarla ilanGozlem-ilce bias +5,1 → +1,3;
 * statik mahalle basamağı +14,0 → −8,0) ama İSABET bozuldu. Yani tablo
 * sistematik kaymayı azaltıyor, dağılımı genişletiyor.
 *
 * Planın E.1 kabul ölçütü bunu açıkça yasaklıyor: "biri iyileşirken diğeri
 * bozulmamalı". Bu yüzden bağlanmadı. Bağlanabilmesi için önce dağılımın
 * neden genişlediği anlaşılmalı — ilk şüpheli, aşağıdaki sabit %12 iskonto
 * varsayımı ve ilçe medyanının mahalleye yansıtılırken kullanılan skew.
 *
 * VARSAYIM (ölçülmedi, işaretlenmiştir): ilan fiyatları ASKING, statik
 * baseline tüketicileri ise değeri KAPANIŞ seviyesi kabul ediyor. Aradaki
 * fark için sabit %12 iskonto uygulanıyor — motorun canlı emsal yolunda
 * kullandığı dinamik iskonto bandının (%6-24) orta noktası. Doğrusu bunu
 * kapanış verisiyle ölçmektir; o veri gelene kadar sabit ve görünür.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Bir ilçe-kategori çiftinin tabloya girmesi için gereken en az gözlem. */
const MIN_GOZLEM = 20;
/** Asking → kapanış iskontosu. Bkz. dosya başındaki VARSAYIM notu. */
const ASKING_KAPANIS_ISKONTO = 0.12;

const KAYNAKLAR = [
  join(ROOT, "scripts/emlakjet-data-turkiye.sql"),
  join(ROOT, "scripts/hepsiemlak-data.sql"),
];

/**
 * Gözlemlerin yakalanma zamanları. Tablonun "hangi tarihe ait" olduğunu
 * belirler; tüketiciler enflasyon düzeltmesini bu tarihten yapmalı. Sabit bir
 * BASELINE_TARIH varsaymak, güncel veriye ikinci kez enflasyon eklerdi.
 */
const tarihler = [];

/** SQL VALUES satırını kolon ADINA göre okur (sıraya güvenmez). */
function kayitlariTopla() {
  const gruplar = new Map(); // "il__ilce__kategori" → number[]
  for (const yol of KAYNAKLAR) {
    if (!existsSync(yol)) continue;
    const metin = readFileSync(yol, "utf8");
    const blokRe = /INSERT OR IGNORE INTO ilanlar\s*\(([^)]*)\)\s*VALUES([^;]+);/gs;
    let blok;
    while ((blok = blokRe.exec(metin)) !== null) {
      const kolonlar = blok[1].split(",").map((k) => k.trim());
      const iIl = kolonlar.indexOf("il_norm");
      const iIlce = kolonlar.indexOf("ilce_norm");
      const iFiyat = kolonlar.indexOf("fiyat_per_m2");
      const iKat = kolonlar.indexOf("kategori");
      const iTarih = kolonlar.indexOf("yakalanma_tarihi");
      if (iIl < 0 || iIlce < 0 || iFiyat < 0 || iKat < 0) continue;

      for (const m of blok[2].matchAll(/\(([^()]*)\)/g)) {
        const v = ayir(m[1]);
        if (v.length !== kolonlar.length) continue;
        const tlm2 = Math.round(parseFloat(v[iFiyat]));
        const kat = v[iKat];
        if (!tlm2 || tlm2 < 100 || tlm2 > 5_000_000) continue;
        if (kat !== "arsa" && kat !== "tarla") continue;
        const anahtar = `${v[iIl]}__${v[iIlce]}__${kat}`;
        const liste = gruplar.get(anahtar) ?? [];
        liste.push(tlm2);
        gruplar.set(anahtar, liste);
        const ts = iTarih >= 0 ? parseInt(v[iTarih], 10) : NaN;
        if (Number.isFinite(ts) && ts > 0) tarihler.push(ts);
      }
    }
  }
  return gruplar;
}

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

const medyan = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

function main() {
  const gruplar = kayitlariTopla();
  const tablolar = { arsa: {}, tarla: {} };
  const adetler = { arsa: {}, tarla: {} };
  let atlanan = 0;

  for (const [anahtar, liste] of gruplar) {
    const son = anahtar.lastIndexOf("__");
    const ilIlce = anahtar.slice(0, son);
    const kat = anahtar.slice(son + 2);
    if (liste.length < MIN_GOZLEM) { atlanan++; continue; }
    tablolar[kat][ilIlce] = Math.round(medyan(liste) * (1 - ASKING_KAPANIS_ISKONTO));
    adetler[kat][ilIlce] = liste.length;
  }

  const yaz = (o) =>
    Object.keys(o).sort().map((k) => `  "${k}": ${o[k]},`).join("\n");

  if (tarihler.length === 0) {
    throw new Error(
      "Hiçbir kayıtta yakalanma_tarihi yok. Tablonun tarihi bilinmeden " +
      "enflasyon düzeltmesi yapılamaz; sessizce yanlış tarih varsaymaktansa dur.",
    );
  }
  const gozlemTarihi = new Date(medyan(tarihler)).toISOString().slice(0, 7);

  const ts = `/**
 * İlçe bazlı baseline TL/m² — GÖZLEMLENEN ilan verisinden sayılarak üretildi.
 *
 * !!! BU DOSYAYI ELLE DÜZENLEME !!!
 * Yenile: node scripts/ilce-baseline-gozlem-uret.mjs
 *
 * Üretildi: ${new Date().toISOString().slice(0, 10)}
 * Kaynak: scripts/emlakjet-data-turkiye.sql (+ varsa hepsiemlak-data.sql)
 * Kural: ilçede en az ${MIN_GOZLEM} gözlem varsa medyan alınır, yoksa SATIR YAZILMAZ.
 *        Eksik satır motoru bir üst basamağa düşürür; uydurma satır ise
 *        kullanıcıya yanlış fiyatı güvenle gösterir.
 * İskonto: asking → kapanış için sabit %${Math.round(ASKING_KAPANIS_ISKONTO * 100)}
 *          (ölçülmemiş varsayım — bkz. üreteç dosyasının başı).
 *
 * Arsa: ${Object.keys(tablolar.arsa).length} ilçe · Tarla: ${Object.keys(tablolar.tarla).length} ilçe
 * Yetersiz gözlem yüzünden atlanan: ${atlanan} ilçe-kategori
 */

/** Anahtar: "il_norm__ilce_norm" (normalizeYerAdi ile uyumlu). */
export const ILCE_BASELINE_GOZLEM_ARSA: Record<string, number> = {
${yaz(tablolar.arsa)}
};

export const ILCE_BASELINE_GOZLEM_TARLA: Record<string, number> = {
${yaz(tablolar.tarla)}
};

/** Her satırın kaç gözleme dayandığı — güven hesabı ve denetim için. */
export const ILCE_BASELINE_GOZLEM_ADET_ARSA: Record<string, number> = {
${yaz(adetler.arsa)}
};

export const ILCE_BASELINE_GOZLEM_ADET_TARLA: Record<string, number> = {
${yaz(adetler.tarla)}
};

/** Bir satırın tabloya girebilmesi için gereken en az gözlem sayısı. */
export const ILCE_BASELINE_GOZLEM_MIN = ${MIN_GOZLEM};

/**
 * Tablonun ait olduğu tarih (gözlemlerin medyan yakalanma ayı).
 *
 * Enflasyon düzeltmesi BU tarihten yapılmalı — BASELINE_TARIH'ten (2025-01)
 * değil. Türkiye enflasyonunda aradaki fark %50 mertebesinde olabilir; yanlış
 * tarih, yeni tabloyu eski tablodan daha kötü hâle getirirdi.
 */
export const ILCE_BASELINE_GOZLEM_TARIH = "${gozlemTarihi}";
`;

  const cikti = join(ROOT, "src/lib/data/ilce-baseline-gozlem.ts");
  writeFileSync(cikti, ts, "utf8");
  console.log(`✓ src/lib/data/ilce-baseline-gozlem.ts`);
  console.log(`  arsa ${Object.keys(tablolar.arsa).length} ilçe · tarla ${Object.keys(tablolar.tarla).length} ilçe · atlanan ${atlanan}`);
}

main();
