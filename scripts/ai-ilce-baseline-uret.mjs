#!/usr/bin/env node
/**
 * Groq / Gemini ile Türkiye ilçeleri için ARSA + TARLA TL/m² baseline araştırması.
 *
 * Mevcut src/lib/data/ilce-baseline.ts elle ~200 ilçe içeriyor. Türkiye'de
 * toplam 973 ilçe var → ~770 ilçe için AI ile doldurulmalı.
 *
 * Akış:
 *   1. data/mahalleler.json'u oku, unique il/ilçe listesi çıkar
 *   2. src/lib/data/ilce-baseline.ts'deki manuel ARSA + TARLA anahtarlarını oku
 *      → manuel girilenleri *atla* (insan girdisi AI'dan daha güvenilir)
 *   3. Eksik her ilçe için AI'ya sor (arsa + tarla)
 *   4. Resume desteği — data/ilce-baseline-ai.json'a 30'da bir yaz
 *
 * Çalıştırma:
 *   GROQ_API_KEY=xxx node scripts/ai-ilce-baseline-uret.mjs [--limit 200] [--only=arsa|tarla|both]
 *
 * Hız: Groq 30 RPM → 2sn rate limit → 970 ilçe ~32 dk
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAHALLE_DOSYA = `${__dirname}/../data/mahalleler.json`;
const ILCE_BASELINE_TS = `${__dirname}/../src/lib/data/ilce-baseline.ts`;
const ÇIKTI = `${__dirname}/../data/ilce-baseline-ai.json`;

const args = process.argv.slice(2);
const PROVIDER = (args.find((a) => a.startsWith("--provider="))?.split("=")[1] ?? "groq").toLowerCase();

const API_KEY = PROVIDER === "groq"
  ? (process.env.GROQ_API_KEY ?? process.env.GEMINI_API_KEY)
  : process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error(`HATA: ${PROVIDER === "groq" ? "GROQ_API_KEY" : "GEMINI_API_KEY"} environment variable gerekli.`);
  console.error("Groq: https://console.groq.com/keys (ücretsiz, kart yok)");
  console.error("Gemini: https://aistudio.google.com/apikey");
  process.exit(1);
}

const MODEL =
  args.find((a) => a.startsWith("--model="))?.split("=")[1] ??
  (PROVIDER === "groq" ? "llama-3.3-70b-versatile" : "gemini-1.5-flash");

const LIMIT = +(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 5000);
const RATE_LIMIT_MS = +(args.find((a) => a.startsWith("--rate="))?.split("=")[1] ?? (PROVIDER === "groq" ? 2000 : 4500));
const FORCE = args.includes("--force"); // mevcut manuel ilçeleri de yeniden sor

// ── 1. Manuel ilçe anahtarlarını oku — bunları atlayacağız (insan girdisi öncelikli) ──
function manuelIlceAnahtarlariOku() {
  const src = readFileSync(ILCE_BASELINE_TS, "utf8");
  const arsa = new Set();
  const tarla = new Set();
  const arsaBloku = src.match(/export const ILCE_BASELINE_ARSA[^{]*\{([\s\S]*?)\n\};/);
  const tarlaBloku = src.match(/export const ILCE_BASELINE_TARLA[^{]*\{([\s\S]*?)\n\};/);
  for (const m of (arsaBloku?.[1] ?? "").matchAll(/"([^"]+__[^"]+)":/g)) arsa.add(m[1]);
  for (const m of (tarlaBloku?.[1] ?? "").matchAll(/"([^"]+__[^"]+)":/g)) tarla.add(m[1]);
  return { arsa, tarla };
}

const PROMPT_TEMPLATE = ({ il, ilce }) => `
Sen bir Türk gayrimenkul piyasası uzmanısın. Görev: aşağıdaki ilçenin geneli için
2026 başı ortalama TL/m² asking fiyatları.

İl: ${il}
İlçe: ${ilce}

Bağlam:
- Tarih: 2026 başı
- Türkiye'de 2025 yıllık enflasyon ~%35-45
- 2025 başı referans değerler (İlçe merkezi):
  İstanbul Beşiktaş 65k, Şişli 52k, Esenyurt 14k
  Ankara Çankaya 12k, Polatlı 2.5k
  İzmir Konak 18k, Çeşme 35k
  Antalya Muratpaşa 12k, Alanya 10k, Manavgat 7k
  Muğla Bodrum 38k, Marmaris 18k
  Konya Selçuklu 3.5k, Akşehir 1.5k
  Kayseri Melikgazi 3k, Develi 800
  Erzurum Yakutiye 1.5k, Şenkaya 300
  Van Tuşba 1.2k, Başkale 200

- 2026 başı: yukarıdakilere %30-40 enflasyon ekle.
- ARSA = imara açık, boş parsel m² fiyatı
- TARLA = tarımsal, ilçe kırsalı (ilçe merkezinden değil köyler ortalamasından)

ÖNEMLİ:
- arsa fiyatı genelde ilçe merkezi seviyesinde (ilçe = ilçe merkezi varsayımı)
- tarla fiyatı, arsa'nın 1/5 ile 1/15 katı arasıdır
- Köy/kırsal ağırlıklı ilçelerde arsa 1000-4000, tarla 100-500 TL/m²
- Sahil/turistik ilçelerde arsa 15000-50000, tarla 2000-8000
- Büyük şehir merkez ilçesi: arsa 15000-100000, tarla yok ya da 1500-5000
- ASLA null dönme — düşük güvenli de olsa tahmin et

Güven (10-95):
- 80+: ilçeyi spesifik tanıyorsun
- 50-79: il bağlamından tahmin
- 30-49: yerleşim tipinden tahmin
- 10-29: sadece coğrafi bölgeden

Sadece JSON dön:
{
  "arsa": { "tlm2": <pozitif tamsayı>, "guven": <10-95> },
  "tarla": { "tlm2": <pozitif tamsayı, arsadan düşük>, "guven": <10-95> },
  "not": "<10-15 kelimelik açıklama>"
}
`.trim();

async function geminiSor(ilce) {
  const prompt = PROMPT_TEMPLATE(ilce);
  const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
  };
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}: ${txt}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini boş yanıt");
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(cleaned);
}

async function groqSor(ilce) {
  const prompt = PROMPT_TEMPLATE(ilce);
  const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: "Türk gayrimenkul piyasası uzmanısın. Sadece JSON döner, başka şey yazmazsın." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 400,
  };
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Groq HTTP ${res.status}: ${txt}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq boş yanıt");
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(cleaned);
}

const aiSor = (ilce) => (PROVIDER === "groq" ? groqSor(ilce) : geminiSor(ilce));

function sanityCheck(sonuc) {
  if (!sonuc || typeof sonuc !== "object") return false;
  const a = sonuc.arsa?.tlm2,
    t = sonuc.tarla?.tlm2;
  if (typeof a !== "number" || a < 100 || a > 500_000) return false;
  if (typeof t !== "number" || t < 20 || t > 100_000) return false;
  if (t >= a) return false; // tarla < arsa olmalı
  return true;
}

async function main() {
  process.stderr.write(`[ilce-ai] Provider: ${PROVIDER}, Model: ${MODEL}, Rate: ${RATE_LIMIT_MS}ms\n`);

  const tum = JSON.parse(readFileSync(MAHALLE_DOSYA, "utf8"));
  const ilceMap = new Map(); // key → { il, ilce, ilNorm, ilceNorm }
  for (const m of tum) {
    if (!m.il || !m.ilce || !m.ilNorm || !m.ilceNorm) continue;
    const key = `${m.ilNorm}__${m.ilceNorm}`;
    if (!ilceMap.has(key)) {
      ilceMap.set(key, { il: m.il, ilce: m.ilce, ilNorm: m.ilNorm, ilceNorm: m.ilceNorm });
    }
  }
  process.stderr.write(`[ilce-ai] Toplam unique ilçe: ${ilceMap.size}\n`);

  const { arsa: manuelArsa, tarla: manuelTarla } = manuelIlceAnahtarlariOku();
  process.stderr.write(`[ilce-ai] Manuel: ${manuelArsa.size} arsa, ${manuelTarla.size} tarla anahtarı\n`);

  let cache = {};
  if (existsSync(ÇIKTI)) {
    cache = JSON.parse(readFileSync(ÇIKTI, "utf8"));
    process.stderr.write(`[ilce-ai] Mevcut cache: ${Object.keys(cache).length} ilçe\n`);
  }

  const aday = [];
  for (const [key, info] of ilceMap) {
    if (cache[key]) continue;
    // Manuel hem arsa hem tarla'da varsa atla. Sadece birinde varsa yine sor
    // (eksik segmenti tamamlamak için).
    if (!FORCE && manuelArsa.has(key) && manuelTarla.has(key)) continue;
    aday.push({ key, ...info });
    if (aday.length >= LIMIT) break;
  }
  process.stderr.write(`[ilce-ai] Hedef: ${aday.length} ilçe (cache+manuel atlandı)\n`);

  let yapildi = 0,
    hata = 0,
    sanityHata = 0;
  const başlangıç = Date.now();

  for (const ilce of aday) {
    try {
      const sonuc = await aiSor(ilce);
      if (!sanityCheck(sonuc)) {
        sanityHata++;
        process.stderr.write(
          `[ilce-ai] SANITY (${ilce.il}/${ilce.ilce}): ${JSON.stringify(sonuc).slice(0, 120)}\n`,
        );
      } else {
        cache[ilce.key] = {
          arsa: sonuc.arsa,
          tarla: sonuc.tarla,
          not: sonuc.not ?? "",
          il: ilce.il,
          ilce: ilce.ilce,
          zaman: Date.now(),
        };
        yapildi++;
      }

      if ((yapildi + sanityHata) % 30 === 0 && (yapildi + sanityHata) > 0) {
        writeFileSync(ÇIKTI, JSON.stringify(cache, null, 2), "utf8");
        const sure = ((Date.now() - başlangıç) / 1000).toFixed(0);
        const oran = ((yapildi + sanityHata) / (Date.now() - başlangıç) * 1000).toFixed(2);
        process.stderr.write(
          `[ilce-ai] ${yapildi}+${sanityHata}sanity/${aday.length} (${sure}s, ${oran} req/sn, http hata: ${hata})\n`,
        );
      }
    } catch (e) {
      hata++;
      if (hata > 50) {
        process.stderr.write(`[ilce-ai] 50+ hata, durduruldu. Son: ${e.message}\n`);
        break;
      }
      if (e.message.includes("429") || e.message.includes("RESOURCE_EXHAUSTED")) {
        process.stderr.write(`[ilce-ai] Rate limit, 60s bekleniyor...\n`);
        await new Promise((r) => setTimeout(r, 60_000));
      }
      process.stderr.write(`[ilce-ai] HATA (${ilce.il}/${ilce.ilce}): ${e.message}\n`);
    }

    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  writeFileSync(ÇIKTI, JSON.stringify(cache, null, 2), "utf8");
  const sureDk = ((Date.now() - başlangıç) / 1000 / 60).toFixed(1);
  process.stderr.write(
    `\n[ilce-ai] ✓ Tamamlandı: ${yapildi} yeni (${sanityHata} sanity-fail, ${hata} http hata), ${sureDk}dk\n`,
  );
  process.stderr.write(`[ilce-ai] Çıktı: ${ÇIKTI} (${(JSON.stringify(cache).length / 1024).toFixed(0)} KB)\n`);
  process.stderr.write(`[ilce-ai] Sonraki adım: node scripts/ilce-baseline-ai-ts-uret.mjs\n`);
}

main().catch((e) => {
  console.error(`HATA: ${e.message}\n${e.stack}`);
  process.exit(1);
});
