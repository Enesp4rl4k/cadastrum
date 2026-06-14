#!/usr/bin/env node
/**
 * Gemini Flash 2.0 ile Türkiye mahalleleri için baseline TL/m² araştırması.
 *
 * Akış:
 *   1. data/mahalleler.json'u oku (67k mahalle)
 *   2. Top N mahalleyi seç (büyükşehir + neighbourhood/suburb/quarter)
 *      → village/hamlet kırsal, AI'nın bilgisi sınırlı
 *   3. Her mahalle için 3 segment (arsa, konut, tarla) için fiyat sor
 *   4. Resume desteği (cache file ile, kesinti olursa kaldığı yerden devam)
 *   5. data/mahalle-ai-arastirma.json — { key: { arsa, konut, tarla } }
 *
 * Çalıştırma:
 *   GEMINI_API_KEY=xxx node scripts/ai-mahalle-arastir.mjs [--limit 100]
 *
 * Free tier: 1.500 req/dakika, 1M req/gün
 * Aiston: 5.000 mahalle × 3 segment = 15.000 req → ~10 dakika (free tier'da)
 *
 * API key: https://aistudio.google.com/apikey
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAHALLE_DOSYA = `${__dirname}/../data/mahalleler.json`;
const ÇIKTI = `${__dirname}/../data/mahalle-ai-arastirma.json`;

// CLI argümanları
const args = process.argv.slice(2);

// Provider: groq (ücretsiz, 30 RPM, Türkiye'de çalışır) | gemini (Google)
const PROVIDER = (args.find(a => a.startsWith("--provider="))?.split("=")[1] ?? "groq").toLowerCase();

const API_KEY = PROVIDER === "groq"
  ? (process.env.GROQ_API_KEY ?? process.env.GEMINI_API_KEY)
  : process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error(`HATA: ${PROVIDER === "groq" ? "GROQ_API_KEY" : "GEMINI_API_KEY"} environment variable gerekli.`);
  console.error("Groq: https://console.groq.com/keys (ücretsiz, kart yok)");
  console.error("Gemini: https://aistudio.google.com/apikey");
  process.exit(1);
}

const MODEL = args.find(a => a.startsWith("--model="))?.split("=")[1]
  ?? (PROVIDER === "groq" ? "llama-3.3-70b-versatile" : "gemini-1.5-flash");

const LIMIT = +(args.find(a => a.startsWith("--limit="))?.split("=")[1] ?? args[args.indexOf("--limit") + 1] ?? 5000);
const ONLY_BIG_CITIES = !args.includes("--all-cities");
// Groq: 30 RPM = 2sn gap (güvenli)
// Gemini Flash 2.0 free: 15 RPM = 4.5sn gap
const RATE_LIMIT_MS = +(args.find(a => a.startsWith("--rate="))?.split("=")[1] ?? (PROVIDER === "groq" ? 2000 : 4500));

// Top 30 büyükşehir (büyük şehir + sahil + turistik)
const BUYUKSEHIRLER = new Set([
  "İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Adana", "Konya",
  "Gaziantep", "Mersin", "Diyarbakır", "Kayseri", "Samsun", "Eskişehir",
  "Denizli", "Şanlıurfa", "Trabzon", "Hatay", "Manisa", "Kahramanmaraş",
  "Balıkesir", "Aydın", "Tekirdağ", "Sakarya", "Muğla", "Kocaeli",
  "Malatya", "Erzurum", "Van", "Ordu", "Yalova", "Çanakkale", "Edirne",
  "Bodrum", "Çeşme", // Bunlar ilçe ama yatırım baskısı yüksek
]);

const SEGMENTLER = ["arsa", "konut", "tarla"];

const PROMPT_TEMPLATE = ({ il, ilce, mahalle, tip }) => `
Sen bir Türk gayrimenkul piyasası uzmanısın. Görev: aşağıdaki yer için Sahibinden/Hepsiemlak'taki güncel medyan TL/m² asking fiyatlarını tahmin et.

İl: ${il}
İlçe: ${ilce}
Mahalle: ${mahalle}
Yerleşim tipi: ${tip} (neighbourhood/suburb/quarter=şehir, village/hamlet=köy)

Bağlam:
- Tarih: 2026 başı
- Türkiye'de 2025 yıllık enflasyon ~%35-45
- 2025 başında: İstanbul Beşiktaş arsa ~65k TL/m², Ankara Çankaya ~12k, İzmir Konak ~18k, Bandırma merkez ~3.5k, kıyı (Bodrum, Çeşme) ~45k+
- 2026 başına %35 enflasyon eklenmiş hâli yansıt

Tahmin stratejisi:
1. Mahalle adını tanıyorsan: o mahallenin spesifik karakterine göre tahmin et (lüks/orta/popüler)
2. Tanımıyorsan: ilçenin genel ortalaması + yerleşim tipine göre tahmin et
   - quarter/neighbourhood: ilçe ortalaması
   - suburb: ilçe ortalaması × 0.85
   - village: ilçe ortalaması × 0.4 (köy)
   - hamlet: ilçe ortalaması × 0.25 (küçük köy)
3. ASLA null dönme — her zaman bir tahmin yap (güven düşük olsa da)

Güven skoru:
- 80+ : mahalleyi spesifik biliyorsun
- 50-79: ilçe ortalamasından tahmin
- 30-49: yerleşim tipinden tahmin
- 10-29: sadece il ortalamasından

ÖNEMLİ KISITLAMALAR:
- arsa fiyatı genelde konut fiyatından %20-50 düşüktür (arsa = boş zemin, konut = bina+arsa kombo m² değeri)
- tarla, arsa'nın 1/5 - 1/15 katı arasıdır (tarımsal kullanım)
- Köy yerleşimlerinde arsa 800-3000 TL/m², ilçe merkezinde 3000-15000, büyük şehir merkez 15000-100000

Sadece JSON dön:
{
  "arsa": { "tlm2": <pozitif sayı>, "guven": <10-95> },
  "konut": { "tlm2": <pozitif sayı, arsadan yüksek olmalı>, "guven": <10-95> },
  "tarla": { "tlm2": <pozitif sayı, arsadan düşük olmalı>, "guven": <10-95> },
  "not": "<10 kelimelik açıklama>"
}
`.trim();

async function geminiSor(mahalle) {
  const prompt = PROMPT_TEMPLATE(mahalle);
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

async function groqSor(mahalle) {
  const prompt = PROMPT_TEMPLATE(mahalle);
  const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: "Türk gayrimenkul piyasası uzmanısın. Sadece JSON döner, başka şey yazmazsın." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 500,
  };
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
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

async function aiSor(mahalle) {
  return PROVIDER === "groq" ? groqSor(mahalle) : geminiSor(mahalle);
}

function mahalleKey(m) {
  return `${m.ilNorm}__${m.ilceNorm}__${m.mahalleNorm}`;
}

async function main() {
  process.stderr.write(`[ai] Provider: ${PROVIDER}, Model: ${MODEL}, Rate: ${RATE_LIMIT_MS}ms\n`);
  process.stderr.write(`[ai] ${MAHALLE_DOSYA} okunuyor...\n`);
  const tum = JSON.parse(readFileSync(MAHALLE_DOSYA, "utf8"));
  process.stderr.write(`[ai] Toplam: ${tum.length} mahalle\n`);

  // 2. Filtrele — sadece şehir mahalleleri (neighbourhood/suburb/quarter) + büyükşehirler
  const sehirTipleri = new Set(["neighbourhood", "suburb", "quarter"]);
  let aday = tum.filter(m => {
    if (!m.il || !m.ilceNorm || !m.mahalleNorm) return false;
    if (!sehirTipleri.has(m.tip)) return false;
    if (ONLY_BIG_CITIES && !BUYUKSEHIRLER.has(m.il)) return false;
    return true;
  });
  process.stderr.write(`[ai] Filtre sonrası: ${aday.length} aday (büyükşehir+şehir mahalleleri)\n`);

  // Limit uygula
  aday = aday.slice(0, LIMIT);
  process.stderr.write(`[ai] Limit (${LIMIT}) sonrası: ${aday.length} mahalle\n`);

  // 3. Resume desteği — mevcut cache'i oku
  let sonuclar = {};
  if (existsSync(ÇIKTI)) {
    sonuclar = JSON.parse(readFileSync(ÇIKTI, "utf8"));
    process.stderr.write(`[ai] Mevcut cache: ${Object.keys(sonuclar).length} sonuç\n`);
  }

  // 4. Her mahalleyi sor (cache'de varsa atla)
  let yapildi = 0, atlandi = 0, hata = 0;
  const başlangıç = Date.now();

  for (const m of aday) {
    const key = mahalleKey(m);
    if (sonuclar[key]) {
      atlandi++;
      continue;
    }

    try {
      const sonuc = await aiSor(m);
      sonuclar[key] = {
        ...sonuc,
        il: m.il,
        ilce: m.ilce,
        mahalle: m.ad,
        tip: m.tip,
        zaman: Date.now(),
      };
      yapildi++;

      // Her 50 sonuçta bir cache'e yaz
      if (yapildi % 50 === 0) {
        writeFileSync(ÇIKTI, JSON.stringify(sonuclar, null, 2), "utf8");
        const sure = ((Date.now() - başlangıç) / 1000).toFixed(0);
        const oran = (yapildi / (Date.now() - başlangıç) * 1000).toFixed(1);
        process.stderr.write(
          `[ai] ${yapildi}/${aday.length - atlandi} (${sure}s, ${oran} req/sn, hata: ${hata})\n`,
        );
      }
    } catch (e) {
      hata++;
      if (hata > 50) {
        process.stderr.write(`[ai] 50+ hata, durduruldu. Son hata: ${e.message}\n`);
        break;
      }
      // Rate limit hatasıysa biraz bekle
      if (e.message.includes("429") || e.message.includes("RESOURCE_EXHAUSTED")) {
        process.stderr.write(`[ai] Rate limit, 60s bekleniyor...\n`);
        await new Promise(r => setTimeout(r, 60_000));
      }
      process.stderr.write(`[ai] HATA (${m.il}/${m.ilce}/${m.ad}): ${e.message}\n`);
    }

    await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
  }

  // Final yazma
  writeFileSync(ÇIKTI, JSON.stringify(sonuclar, null, 2), "utf8");
  const sure = ((Date.now() - başlangıç) / 1000 / 60).toFixed(1);
  process.stderr.write(`\n[ai] ✓ Tamamlandı: ${yapildi} yeni, ${atlandi} cache, ${hata} hata, ${sure}dk\n`);
  process.stderr.write(`[ai] Çıktı: ${ÇIKTI} (${(JSON.stringify(sonuclar).length / 1024).toFixed(0)} KB)\n`);
}

main().catch((e) => {
  console.error(`HATA: ${e.message}\n${e.stack}`);
  process.exit(1);
});
