#!/usr/bin/env node
/**
 * data/ilce-baseline-ai.json → src/lib/data/ilce-baseline-ai.ts
 *
 * AI'dan üretilmiş ilçe baseline'larını TypeScript dosyasına çevirir.
 * Manuel ILCE_BASELINE_ARSA / ILCE_BASELINE_TARLA'ya DOKUNMAZ — bu sadece
 * fallback amaçlı ek tablo. ilceFiyatGetir önce manuel'e bakar, sonra AI'ya.
 *
 * Çalıştırma:
 *   node scripts/ilce-baseline-ai-ts-uret.mjs
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GIRDI = `${__dirname}/../data/ilce-baseline-ai.json`;
const ÇIKTI = `${__dirname}/../src/lib/data/ilce-baseline-ai.ts`;

if (!existsSync(GIRDI)) {
  console.error(`HATA: ${GIRDI} yok. Önce 'node scripts/ai-ilce-baseline-uret.mjs' çalıştır.`);
  process.exit(1);
}

const cache = JSON.parse(readFileSync(GIRDI, "utf8"));
const keys = Object.keys(cache).sort();

const arsaSatirlar = [];
const tarlaSatirlar = [];
let arsaSayi = 0,
  tarlaSayi = 0;
let dusukGuvenAtilan = 0;

const MIN_GUVEN = 25; // 25 altı → güvenilmez, atla

for (const key of keys) {
  const r = cache[key];
  if (!r) continue;
  const aT = r.arsa?.tlm2,
    aG = r.arsa?.guven ?? 0;
  const tT = r.tarla?.tlm2,
    tG = r.tarla?.guven ?? 0;

  if (typeof aT === "number" && aT >= 100 && aT <= 500_000 && aG >= MIN_GUVEN) {
    arsaSatirlar.push(`  "${key}": ${Math.round(aT)}, /* g${aG} */`);
    arsaSayi++;
  } else if (typeof aT === "number") {
    dusukGuvenAtilan++;
  }
  if (typeof tT === "number" && tT >= 20 && tT <= 100_000 && tG >= MIN_GUVEN) {
    tarlaSatirlar.push(`  "${key}": ${Math.round(tT)}, /* g${tG} */`);
    tarlaSayi++;
  } else if (typeof tT === "number") {
    dusukGuvenAtilan++;
  }
}

const içerik = `/**
 * Otomatik üretildi: ${new Date().toISOString()}
 * Kaynak: data/ilce-baseline-ai.json (AI araştırma — Groq llama-3.3-70b)
 *
 * !!! BU DOSYAYI ELLE DÜZENLEME !!!
 * Yenile: node scripts/ilce-baseline-ai-ts-uret.mjs
 *
 * Hiyerarşi: ilceFiyatGetir önce manuel ILCE_BASELINE_ARSA/TARLA'ya bakar,
 * bulamazsa BURAYA düşer. ILCE_BASELINE_AI_TARIH ile enflasyon düzeltmesi yapılır.
 *
 * Toplam: ${arsaSayi} ilçe arsa, ${tarlaSayi} ilçe tarla
 * (Düşük güven (${MIN_GUVEN}'den az) → ${dusukGuvenAtilan} kayıt atıldı)
 */

/** AI baseline'ın üretildiği tarih (enflasyon düzeltmesi referansı) */
export const ILCE_BASELINE_AI_TARIH = ${JSON.stringify(new Date().toISOString().slice(0, 10))};

/** İlçe bazlı ARSA TL/m² baseline — AI fallback (manuel tablodan sonra başvurulur) */
export const ILCE_BASELINE_AI_ARSA: Record<string, number> = {
${arsaSatirlar.join("\n")}
};

/** İlçe bazlı TARLA TL/m² baseline — AI fallback */
export const ILCE_BASELINE_AI_TARLA: Record<string, number> = {
${tarlaSatirlar.join("\n")}
};
`;

writeFileSync(ÇIKTI, içerik, "utf8");
process.stderr.write(`[ts-uret] ✓ ${ÇIKTI}\n`);
process.stderr.write(`[ts-uret] Arsa: ${arsaSayi}, Tarla: ${tarlaSayi}, atılan: ${dusukGuvenAtilan}\n`);
