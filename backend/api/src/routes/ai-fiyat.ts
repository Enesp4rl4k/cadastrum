/**
 * Cadastrum AI Fiyat Proxy
 *
 * Pro/Pro+ kullanıcı için fiyat tahmini:
 *   - Gemini 2.5 Flash primary (Google AI Studio)
 *   - Groq Llama 3.3 70B fallback (rate limit / hata)
 *   - 24h D1 cache (mahalle + heuristik özet hash)
 *   - Per-user günlük rate limit (Pro: 100, Pro+: 1000)
 *
 * Endpoint:
 *   POST /v1/ai-fiyat/tahmin  Bearer auth
 *     body: { parsel, baseline, baselineHash, kontekst? }
 *     response: { altPerM2, beklenenPerM2, ustPerM2, gerekce, kaynak, modelAd, sureMs }
 *
 * Setup:
 *   wrangler secret put GEMINI_API_KEY
 *   wrangler secret put GROQ_API_KEY  (opsiyonel, fallback için)
 */
import { Hono } from "hono";
import { jwtMiddleware } from "./hesap.js";
import type { Env } from "../index.js";

const aiFiyat = new Hono<{ Bindings: Env }>();
aiFiyat.use("*", jwtMiddleware);

// ── Tier'a göre günlük kota ───────────────────────────────────
// Free user'a 3 deneme hak verilir — Pro'ya geçiş için "tadım" stratejisi.
// Cache %70+ hit oranıyla maliyet çok düşük (~$0.65/ay 1000 Free user için).
const GUNLUK_KOTA: Record<string, number> = {
  free: 3,
  pro: 100,
  pro_plus: 1000,
  kurumsal: 10000,
};

interface AiSonuc {
  altPerM2: number;
  beklenenPerM2: number;
  ustPerM2: number;
  gerekce: string;
}

interface IstekGovde {
  parselAnahtar: string;     // örn: "konya-meram-cukurcimen-138-19"
  baselineHash: string;      // istatistik özet hash (cache invalidation için)
  prompt: string;            // çağrıyı yapan tarafın hazırladığı tam prompt
  modelHint?: "gemini" | "groq" | "auto";
}

// ── Gemini 2.5 Flash çağrısı ──────────────────────────────────
async function geminiCagir(apiKey: string, prompt: string): Promise<{ sonuc: AiSonuc; model: string; sureMs: number }> {
  const t0 = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          altPerM2: { type: "NUMBER" },
          beklenenPerM2: { type: "NUMBER" },
          ustPerM2: { type: "NUMBER" },
          gerekce: { type: "STRING" },
        },
        required: ["altPerM2", "beklenenPerM2", "ustPerM2", "gerekce"],
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json() as any;
  let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const finish = data.candidates?.[0]?.finishReason;
  if (!text) {
    const promptFb = data.promptFeedback?.blockReason;
    throw new Error(`Gemini boş yanıt (finish=${finish}, block=${promptFb ?? "-"})`);
  }

  // Markdown code block temizleme (bazen ```json ... ``` ile gelir)
  text = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");

  let sonuc: AiSonuc;
  try {
    sonuc = JSON.parse(text);
  } catch (e) {
    throw new Error(`Gemini JSON parse: ${e instanceof Error ? e.message : "?"} — text: ${text.slice(0, 150)}`);
  }
  if (!sonuc.beklenenPerM2 || sonuc.beklenenPerM2 <= 0) throw new Error("Gemini geçersiz beklenenPerM2");
  return { sonuc, model: "gemini-2.5-flash", sureMs: Date.now() - t0 };
}

// ── Groq Llama 3.3 70B fallback ───────────────────────────────
async function groqCagir(apiKey: string, prompt: string): Promise<{ sonuc: AiSonuc; model: string; sureMs: number }> {
  const t0 = Date.now();
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "Türk gayrimenkul piyasası uzmanısın. JSON formatında yanıt veriyorsun: {altPerM2, beklenenPerM2, ustPerM2, gerekce}. Tüm değerler TL/m². Gerekçe Türkçe, 2-3 cümle." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 600,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json() as any;
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq boş yanıt");
  const sonuc = JSON.parse(text) as AiSonuc;
  if (!sonuc.beklenenPerM2 || sonuc.beklenenPerM2 <= 0) throw new Error("Groq geçersiz beklenenPerM2");
  return { sonuc, model: "llama-3.3-70b-groq", sureMs: Date.now() - t0 };
}

// ── Ana endpoint ──────────────────────────────────────────────
aiFiyat.post("/tahmin", async (c) => {
  const tier = c.get("tier" as any) as string;
  const kullaniciId = c.get("kullaniciId" as any) as number;

  // Tier kontrolü
  const kota = GUNLUK_KOTA[tier] ?? 0;
  if (kota === 0) {
    return c.json({ hata: "AI özelliği bu hesap tipinde aktif değil.", gerekliTier: "pro" }, 403);
  }

  // Body parse
  const body = await c.req.json<IstekGovde>().catch(() => null);
  if (!body?.parselAnahtar || !body?.baselineHash || !body?.prompt) {
    return c.json({ hata: "parselAnahtar, baselineHash ve prompt gerekli" }, 400);
  }

  // ── Cache kontrol (24h) ──────────────────────────────────
  const cacheTtl = 24 * 60 * 60 * 1000;
  const cacheRow = await c.env.DB.prepare(
    `SELECT model, alt_per_m2, beklenen_per_m2, ust_per_m2, gerekce, sure_ms, olusturuldu
     FROM ai_fiyat_cache
     WHERE parsel_anahtar = ? AND baseline_hash = ?
     ORDER BY olusturuldu DESC LIMIT 1`
  ).bind(body.parselAnahtar, body.baselineHash).first<{
    model: string; alt_per_m2: number; beklenen_per_m2: number;
    ust_per_m2: number; gerekce: string; sure_ms: number; olusturuldu: number;
  }>();

  if (cacheRow && (Date.now() - cacheRow.olusturuldu) < cacheTtl) {
    return c.json({
      altPerM2: cacheRow.alt_per_m2,
      beklenenPerM2: cacheRow.beklenen_per_m2,
      ustPerM2: cacheRow.ust_per_m2,
      gerekce: cacheRow.gerekce,
      kaynak: "cadastrum-proxy",
      modelAd: cacheRow.model,
      sureMs: cacheRow.sure_ms,
      cached: true,
    });
  }

  // ── Rate limit (per-user, daily) — atomic increment ─────
  // Race-safe: SELECT-then-INSERT yerine UPSERT RETURNING ile tek seferde sayar.
  // Eğer kota aşılırsa, ani decrement ile geri çek.
  const gun = Math.floor(Date.now() / 86400000);
  const incRes = await c.env.DB.prepare(
    `INSERT INTO ai_kullanim (kullanici_id, gun, sayi) VALUES (?, ?, 1)
     ON CONFLICT(kullanici_id, gun) DO UPDATE SET sayi = sayi + 1
     RETURNING sayi`
  ).bind(kullaniciId, gun).first<{ sayi: number }>();
  const yeniSayi = incRes?.sayi ?? 1;
  if (yeniSayi > kota) {
    // Kota aşıldı — refund
    await c.env.DB.prepare(
      "UPDATE ai_kullanim SET sayi = sayi - 1 WHERE kullanici_id = ? AND gun = ?"
    ).bind(kullaniciId, gun).run();
    const upgradeMsg = tier === "free"
      ? `Bugünkü 3 ücretsiz AI analiziniz doldu. Sınırsız için Pro'ya geçin.`
      : tier === "pro"
      ? `Günlük 100 sorgu hakkınız doldu. Pro+ ile 1000/gün kullanabilirsiniz.`
      : `Günlük kotanız doldu (${kota}/${kota}). Yarın yenilenecek.`;
    return c.json({
      hata: upgradeMsg,
      kalan: 0,
      tier,
      kota,
      upgradeOner: tier === "free" ? "pro" : tier === "pro" ? "pro_plus" : null,
    }, 429);
  }

  // ── AI çağrısı (Gemini primary, Groq fallback) ──────────
  const geminiKey = (c.env as any).GEMINI_API_KEY as string | undefined;
  const groqKey = (c.env as any).GROQ_API_KEY as string | undefined;

  let cevap: { sonuc: AiSonuc; model: string; sureMs: number } | null = null;
  let sonHata: string | null = null;

  const tercih = body.modelHint ?? "auto";

  if ((tercih === "auto" || tercih === "gemini") && geminiKey) {
    try {
      cevap = await geminiCagir(geminiKey, body.prompt);
    } catch (e) {
      sonHata = e instanceof Error ? e.message : String(e);
      console.warn("[ai-fiyat] Gemini hata:", sonHata);
    }
  }

  if (!cevap && (tercih === "auto" || tercih === "groq") && groqKey) {
    try {
      cevap = await groqCagir(groqKey, body.prompt);
    } catch (e) {
      sonHata = e instanceof Error ? e.message : String(e);
      console.warn("[ai-fiyat] Groq hata:", sonHata);
    }
  }

  if (!cevap) {
    // AI hata → refund (sayaç başta artırıldı, AI başarısız olursa düş)
    await c.env.DB.prepare(
      "UPDATE ai_kullanim SET sayi = sayi - 1 WHERE kullanici_id = ? AND gun = ?"
    ).bind(kullaniciId, gun).run();
    return c.json({
      hata: `AI servislerine ulaşılamadı. ${sonHata ?? "Anahtar yok."}`,
    }, 503);
  }

  // ── Cache kaydet (sayaç zaten başta artırıldı) ──────────
  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO ai_fiyat_cache
     (parsel_anahtar, baseline_hash, model, alt_per_m2, beklenen_per_m2, ust_per_m2, gerekce, sure_ms, olusturuldu)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    body.parselAnahtar, body.baselineHash, cevap.model,
    cevap.sonuc.altPerM2, cevap.sonuc.beklenenPerM2, cevap.sonuc.ustPerM2,
    cevap.sonuc.gerekce, cevap.sureMs, Date.now()
  ).run();

  return c.json({
    ...cevap.sonuc,
    kaynak: "cadastrum-proxy",
    modelAd: cevap.model,
    sureMs: cevap.sureMs,
    cached: false,
    kalanKota: Math.max(0, kota - yeniSayi),
  });
});

// ── Kullanım durumu ───────────────────────────────────────
aiFiyat.get("/durum", async (c) => {
  const tier = c.get("tier" as any) as string;
  const kullaniciId = c.get("kullaniciId" as any) as number;
  const kota = GUNLUK_KOTA[tier] ?? 0;
  const gun = Math.floor(Date.now() / 86400000);
  const k = await c.env.DB.prepare(
    "SELECT sayi FROM ai_kullanim WHERE kullanici_id = ? AND gun = ?"
  ).bind(kullaniciId, gun).first<{ sayi: number }>();
  const kullanilan = k?.sayi ?? 0;
  return c.json({ tier, kota, kullanilan, kalan: Math.max(0, kota - kullanilan) });
});

export { aiFiyat as aiFiyatRoutes };
