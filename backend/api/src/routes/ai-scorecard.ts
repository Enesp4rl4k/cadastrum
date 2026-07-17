/**
 * AI Arazi Uygunluk Scorecard — 5 boyutlu parsel analizi.
 *
 * Gemini 2.5 Flash'a tüm veri katmanlarını ver, beş boyutta 0-100 skor + kısa gerekçe üret.
 *
 * 5 Boyut:
 *   1. 🌾 Tarımsal Verimlilik — toprak tipi, yağış, sıcaklık, eğim
 *   2. 🏗️ Yapılaşma Uygunluğu — eğim, imar durumu, emsal, deprem zonu
 *   3. 🏭 Sanayi/Lojistik Potansiyeli — OSM otoyol/OSB mesafesi, il likiditesi
 *   4. ☀️ Yenilenebilir Enerji (GES) — PVGIS yıllık kWh/kWp, bakı yönü
 *   5. ⚠️ Risk Skoru — deprem PGA, taşkın, eğim (ters — düşük risk = yüksek skor)
 *
 * Güvenlik: Prompt client'tan gelmez, server-side oluşturulur.
 * Cache: 24h D1 cache (parselAnahtar üzerinden).
 * Rate limit: mevcut ai_kullanim_kota tablosunu kullanır (ai-fiyat ile aynı sayaç).
 *
 * Endpoint:
 *   POST /v1/ai-scorecard/analiz  Bearer auth
 *     body: { parselAnahtar, parselVeri }
 *     response: { skorlar, genelSkor, ozet, modelAd, sureMs, cached }
 */
import { Hono } from "hono";
import { jwtMiddleware } from "./hesap.js";
import type { Env } from "../index.js";

const aiScorecard = new Hono<{ Bindings: Env }>();
aiScorecard.use("*", jwtMiddleware);

// Tier günlük kota — ai-fiyat ile ortak sayaç
const GUNLUK_KOTA: Record<string, number> = {
  free: 3,
  pro: 100,
  pro_plus: 1000,
  kurumsal: 10000,
};

export interface ScorecardParselVeri {
  il: string;
  ilce: string;
  mahalle?: string;
  kategori: string;           // "arsa" | "tarla" | "bahce" vb.
  m2?: number;
  imarDurumu?: string;
  depremPga?: number;         // PGA g değeri (0-1 arası)
  depremZonu?: string;        // "1. Derece" vb.
  taskinRisk?: string;        // "dusuk" | "orta" | "yuksek"
  toprakTipi?: string;        // "Kil" | "Killi-Tın" vb.
  organikMadde?: number;      // % (0-10 arası)
  yillikYagis?: number;       // mm/yıl
  ortSicaklik?: number;       // °C yıllık ortalama
  pvgisKwhKwp?: number;       // Yıllık GES verimi (kWh/kWp)
  bakiYonu?: string;          // "Güney" | "Kuzey" vb.
  egimYuzde?: number;         // % eğim
  otoyolKm?: number;          // En yakın otoyola mesafe (km)
  osbKm?: number;             // En yakın OSB'ye mesafe (km)
  havalimanKm?: number;       // En yakın havalimanına mesafe (km)
  limanKm?: number;           // En yakın liman/lojistik merkeze mesafe (km)
  serbestBolgeKm?: number;    // En yakın serbest ticaret bölgesine mesafe (km)
  lisansliDepoKm?: number;    // En yakın TMO/lisanslı depoya mesafe (km)
  elektrikHattiM?: number;    // En yakın elektrik hattı mesafesi (metre)
  baselineTlm2?: number;      // Mahalle/ilçe baseline TL/m²
}

interface ScorecardIstekGovde {
  parselAnahtar: string;
  parselVeri: ScorecardParselVeri;
  modelHint?: "gemini" | "groq" | "auto";
}

export interface BoyutSkor {
  puan: number;    // 0-100
  gerekce: string; // 1-2 cümle Türkçe
}

export interface ScorecardSonuc {
  skorlar: {
    tarimsal: BoyutSkor;
    yapilasmа: BoyutSkor;
    lojistik: BoyutSkor;
    enerji: BoyutSkor;
    risk: BoyutSkor;
  };
  genelSkor: number;  // ağırlıklı ortalama
  ozet: string;       // 2-3 cümle genel değerlendirme
}

// ── Prompt oluşturucu ────────────────────────────────────────────────────────
function promptOlustur(v: ScorecardParselVeri): string {
  const lokasyon = [v.il, v.ilce, v.mahalle].filter(Boolean).join(" / ");
  const satirlar: string[] = [
    `Türkiye'de ${lokasyon} konumundaki bir arazi parseli için 5 boyutlu uygunluk skoru üret.`,
    `Arazi kategorisi: ${v.kategori}`,
  ];

  if (v.m2) satirlar.push(`Alan: ${v.m2.toLocaleString("tr-TR")} m²`);
  if (v.imarDurumu) satirlar.push(`İmar durumu: ${v.imarDurumu}`);
  if (v.egimYuzde != null) satirlar.push(`Eğim: %${v.egimYuzde}`);
  if (v.depremZonu) satirlar.push(`Deprem zonu: ${v.depremZonu}`);
  if (v.depremPga != null) satirlar.push(`Deprem PGA: ${v.depremPga.toFixed(2)}g`);
  if (v.taskinRisk) satirlar.push(`Taşkın riski: ${v.taskinRisk}`);
  if (v.toprakTipi) satirlar.push(`Toprak tipi: ${v.toprakTipi}`);
  if (v.organikMadde != null) satirlar.push(`Toprak organik madde: %${v.organikMadde}`);
  if (v.yillikYagis != null) satirlar.push(`Yıllık yağış: ${v.yillikYagis} mm`);
  if (v.ortSicaklik != null) satirlar.push(`Yıllık ortalama sıcaklık: ${v.ortSicaklik}°C`);
  if (v.pvgisKwhKwp != null) satirlar.push(`GES verimi (PVGIS): ${v.pvgisKwhKwp} kWh/kWp/yıl`);
  if (v.bakiYonu) satirlar.push(`Bakı yönü: ${v.bakiYonu}`);
  if (v.otoyolKm != null) satirlar.push(`En yakın otoyol: ${v.otoyolKm.toFixed(1)} km`);
  if (v.osbKm != null) satirlar.push(`En yakın OSB: ${v.osbKm.toFixed(1)} km`);
  if (v.havalimanKm != null) satirlar.push(`En yakın havalimanı: ${v.havalimanKm.toFixed(1)} km`);
  if (v.limanKm != null) satirlar.push(`En yakın liman/lojistik merkezi: ${v.limanKm.toFixed(1)} km`);
  if (v.serbestBolgeKm != null) satirlar.push(`En yakın serbest ticaret bölgesi: ${v.serbestBolgeKm.toFixed(1)} km`);
  if (v.lisansliDepoKm != null) satirlar.push(`En yakın TMO/lisanslı depo: ${v.lisansliDepoKm.toFixed(1)} km (hububat depolama kapasitesi)`);
  if (v.elektrikHattiM != null) satirlar.push(`En yakın elektrik hattı: ${Math.round(v.elektrikHattiM)} m`);
  if (v.baselineTlm2 && v.baselineTlm2 > 0) satirlar.push(`Bölge arsa medyanı: ${v.baselineTlm2.toLocaleString("tr-TR")} TL/m²`);

  satirlar.push(
    "",
    "Yukarıdaki verilere dayanarak aşağıdaki JSON'u üret:",
    `{
  "tarimsal":   { "puan": <0-100>, "gerekce": "<1-2 cümle>" },
  "yapilasmа":  { "puan": <0-100>, "gerekce": "<1-2 cümle>" },
  "lojistik":   { "puan": <0-100>, "gerekce": "<1-2 cümle>" },
  "enerji":     { "puan": <0-100>, "gerekce": "<1-2 cümle>" },
  "risk":       { "puan": <0-100>, "gerekce": "<1-2 cümle (düşük risk = yüksek puan)>" },
  "genelSkor":  <0-100 ağırlıklı ortalama>,
  "ozet":       "<2-3 cümle genel değerlendirme>"
}`,
    "Puan 0=çok kötü, 50=orta, 100=mükemmel. Gerekçeler Türkçe, teknik ve kısa olsun.",
    "Risk boyutunda 100 = hiç risk yok, 0 = çok tehlikeli.",
  );

  return satirlar.join("\n");
}

// ── Input doğrulama ──────────────────────────────────────────────────────────
const GECERLI_KATEGORI = new Set(["arsa", "tarla", "konut", "bahce", "bag", "zeytinlik"]);

function parselVeriDogrula(v: unknown): v is ScorecardParselVeri {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  if (typeof p.il !== "string" || p.il.trim().length === 0 || p.il.length > 50) return false;
  if (typeof p.ilce !== "string" || p.ilce.trim().length === 0 || p.ilce.length > 50) return false;
  if (typeof p.kategori !== "string" || !GECERLI_KATEGORI.has(p.kategori)) return false;
  if (p.m2 !== undefined && (typeof p.m2 !== "number" || p.m2 <= 0 || p.m2 > 10_000_000)) return false;
  if (p.depremPga !== undefined && (typeof p.depremPga !== "number" || p.depremPga < 0 || p.depremPga > 5)) return false;
  if (p.egimYuzde !== undefined && (typeof p.egimYuzde !== "number" || p.egimYuzde < 0 || p.egimYuzde > 100)) return false;
  if (p.pvgisKwhKwp !== undefined && (typeof p.pvgisKwhKwp !== "number" || p.pvgisKwhKwp < 0 || p.pvgisKwhKwp > 3000)) return false;
  return true;
}

// ── Gemini çağrısı ────────────────────────────────────────────────────────────
async function geminiCagir(
  apiKey: string,
  prompt: string,
): Promise<{ sonuc: ScorecardSonuc; model: string; sureMs: number }> {
  const t0 = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          tarimsal:  { type: "OBJECT", properties: { puan: { type: "NUMBER" }, gerekce: { type: "STRING" } }, required: ["puan", "gerekce"] },
          yapilasmа: { type: "OBJECT", properties: { puan: { type: "NUMBER" }, gerekce: { type: "STRING" } }, required: ["puan", "gerekce"] },
          lojistik:  { type: "OBJECT", properties: { puan: { type: "NUMBER" }, gerekce: { type: "STRING" } }, required: ["puan", "gerekce"] },
          enerji:    { type: "OBJECT", properties: { puan: { type: "NUMBER" }, gerekce: { type: "STRING" } }, required: ["puan", "gerekce"] },
          risk:      { type: "OBJECT", properties: { puan: { type: "NUMBER" }, gerekce: { type: "STRING" } }, required: ["puan", "gerekce"] },
          genelSkor: { type: "NUMBER" },
          ozet: { type: "STRING" },
        },
        required: ["tarimsal", "yapilasmа", "lojistik", "enerji", "risk", "genelSkor", "ozet"],
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const data = await res.json() as { candidates?: Array<{ content: { parts: Array<{ text: string }> }; finishReason: string }> };
  let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini boş yanıt");

  text = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const sonuc = JSON.parse(text) as ScorecardSonuc;
  if (typeof sonuc.genelSkor !== "number") throw new Error("Gemini geçersiz genelSkor");

  return { sonuc, model: "gemini-2.5-flash", sureMs: Date.now() - t0 };
}

// ── Groq fallback ────────────────────────────────────────────────────────────
async function groqCagir(
  apiKey: string,
  prompt: string,
): Promise<{ sonuc: ScorecardSonuc; model: string; sureMs: number }> {
  const t0 = Date.now();
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "Türk gayrimenkul ve arazi analizi uzmanısın. JSON formatında 5 boyutlu uygunluk skoru üretiyorsun.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 1000,
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json() as { choices?: Array<{ message: { content: string } }> };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq boş yanıt");
  const sonuc = JSON.parse(text) as ScorecardSonuc;
  return { sonuc, model: "llama-3.3-70b-groq", sureMs: Date.now() - t0 };
}

// ── Ana endpoint ─────────────────────────────────────────────────────────────
aiScorecard.post("/analiz", async (c) => {
  const tier = c.get("tier" as never) as string;
  const kullaniciId = c.get("kullaniciId" as never) as number;

  const kota = GUNLUK_KOTA[tier] ?? 0;
  if (kota === 0) {
    return c.json({ hata: "AI Scorecard bu hesap tipinde aktif değil.", gerekliTier: "free" }, 403);
  }

  const body = await c.req.json<ScorecardIstekGovde>().catch(() => null);
  if (!body?.parselAnahtar || typeof body.parselAnahtar !== "string" || body.parselAnahtar.length > 200) {
    return c.json({ hata: "Geçersiz parselAnahtar" }, 400);
  }
  if (!parselVeriDogrula(body.parselVeri)) {
    return c.json({ hata: "Geçersiz parselVeri. il, ilce ve kategori zorunlu." }, 400);
  }

  // Cache kontrolü (24h)
  const cacheKey = `sc_${body.parselAnahtar}`;
  const cacheTtl = 24 * 60 * 60 * 1000;
  const cached = await c.env.DB.prepare(
    `SELECT skorlar, genel_skor, ozet, model, sure_ms, olusturuldu
     FROM ai_scorecard_cache WHERE parsel_anahtar = ?
     ORDER BY olusturuldu DESC LIMIT 1`,
  ).bind(cacheKey).first<{
    skorlar: string; genel_skor: number; ozet: string;
    model: string; sure_ms: number; olusturuldu: number;
  }>();

  if (cached && (Date.now() - cached.olusturuldu) < cacheTtl) {
    return c.json({
      skorlar: JSON.parse(cached.skorlar),
      genelSkor: cached.genel_skor,
      ozet: cached.ozet,
      modelAd: cached.model,
      sureMs: cached.sure_ms,
      cached: true,
    });
  }

  // Rate limit — ai_kullanim_kota tablosunu kullan (ai-fiyat ile paylaşımlı)
  const gun = Math.floor(Date.now() / 86400000);
  const incRes = await c.env.DB.prepare(
    `INSERT INTO ai_kullanim_kota (kullanici_id, gun, sayi) VALUES (?, ?, 1)
     ON CONFLICT(kullanici_id, gun) DO UPDATE SET sayi = sayi + 1
     RETURNING sayi`,
  ).bind(kullaniciId, gun).first<{ sayi: number }>();
  const yeniSayi = incRes?.sayi ?? 1;

  if (yeniSayi > kota) {
    await c.env.DB.prepare(
      "UPDATE ai_kullanim_kota SET sayi = sayi - 1 WHERE kullanici_id = ? AND gun = ?",
    ).bind(kullaniciId, gun).run();
    return c.json({ hata: "Günlük AI kota doldu.", kalan: 0, tier, kota }, 429);
  }

  // Prompt oluştur (server-side)
  const prompt = promptOlustur(body.parselVeri);
  const geminiKey = (c.env as unknown as Record<string, unknown>).GEMINI_API_KEY as string | undefined;
  const groqKey   = (c.env as unknown as Record<string, unknown>).GROQ_API_KEY   as string | undefined;

  let cevap: { sonuc: ScorecardSonuc; model: string; sureMs: number } | null = null;
  let sonHata: string | null = null;
  const tercih = body.modelHint ?? "auto";

  if ((tercih === "auto" || tercih === "gemini") && geminiKey) {
    try { cevap = await geminiCagir(geminiKey, prompt); } catch (e) {
      sonHata = e instanceof Error ? e.message : String(e);
    }
  }
  if (!cevap && (tercih === "auto" || tercih === "groq") && groqKey) {
    try { cevap = await groqCagir(groqKey, prompt); } catch (e) {
      sonHata = e instanceof Error ? e.message : String(e);
    }
  }

  if (!cevap) {
    await c.env.DB.prepare(
      "UPDATE ai_kullanim_kota SET sayi = sayi - 1 WHERE kullanici_id = ? AND gun = ?",
    ).bind(kullaniciId, gun).run();
    return c.json({ hata: `AI servisine ulaşılamadı. ${sonHata ?? "Anahtar yok."}` }, 503);
  }

  // Cache kaydet
  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO ai_scorecard_cache
     (parsel_anahtar, skorlar, genel_skor, ozet, model, sure_ms, olusturuldu)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    cacheKey,
    JSON.stringify(cevap.sonuc.skorlar),
    cevap.sonuc.genelSkor,
    cevap.sonuc.ozet,
    cevap.model,
    cevap.sureMs,
    Date.now(),
  ).run();

  return c.json({
    ...cevap.sonuc,
    modelAd: cevap.model,
    sureMs: cevap.sureMs,
    cached: false,
    kalanKota: Math.max(0, kota - yeniSayi),
  });
});

export { aiScorecard as aiScorecardRoutes };
