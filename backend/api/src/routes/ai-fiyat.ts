/**
 * Cadastrum AI Fiyat Proxy
 *
 * Pro/Pro+ kullanıcı için fiyat tahmini:
 *   - Gemini 2.5 Flash primary (Google AI Studio)
 *   - Groq Llama 3.3 70B fallback (rate limit / hata)
 *   - 24h D1 cache (parselAnahtar + baselineHash)
 *   - Per-user günlük rate limit (Free: 3, Pro: 100, Pro+: 1000, Kurumsal: 10000)
 *
 * Güvenlik notu:
 *   Prompt artık CLIENT TARAFINDAN GÖNDERİLMİYOR. Server-side oluşturulur.
 *   Client yalnızca yapılandırılmış parsel verisi gönderir; prompt injection riski sıfırlanır.
 *
 * Endpoint:
 *   POST /v1/ai-fiyat/tahmin  Bearer auth
 *     body: { parselAnahtar, baselineHash, parselVeri }
 *     response: { altPerM2, beklenenPerM2, ustPerM2, gerekce, kaynak, modelAd, sureMs }
 *
 *   GET /v1/ai-fiyat/durum  Bearer auth
 *     response: { tier, kota, kullanilan, kalan }
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

// ── Tier'a göre günlük kota ──────────────────────────────────────
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

/**
 * Client'tan gelen yapılandırılmış parsel verisi.
 * Prompt içermez — server-side oluşturulur.
 */
interface ParselVeri {
  il: string;
  ilce: string;
  mahalle?: string;
  kategori: string;         // "arsa" | "tarla" | "konut" vs.
  m2?: number;              // Parsel alanı
  imarDurumu?: string;      // "İmarlı" | "İmarsız" | "Tarımsal" vs.
  depremZonu?: string;      // "1. Derece" | "2. Derece" vs.
  baselineTlm2?: number;    // Mahalle/ilçe medyan TL/m² (scraper'dan)
  guvenSkoru?: number;      // Baseline güven skoru (0-100)
  emsaller?: Array<{
    fiyat_per_m2: number;
    mesafe_m?: number;
    m2?: number;
  }>;
}

interface IstekGovde {
  parselAnahtar: string;    // örn: "konya-meram-cukurcimen-138-19"
  baselineHash: string;     // istatistik özet hash (cache invalidation için)
  parselVeri: ParselVeri;   // yapılandırılmış veri — prompt YOK
  modelHint?: "gemini" | "groq" | "auto";
}

// ── Prompt oluşturucu (server-side, güvenli) ─────────────────────
function promptOlustur(v: ParselVeri): string {
  const lokasyon = [v.il, v.ilce, v.mahalle].filter(Boolean).join(" / ");
  const satirlar: string[] = [
    `Türkiye'de ${lokasyon} bölgesinde bir gayrimenkul için TL/m² fiyat tahmini yap.`,
    `Kategori: ${v.kategori}`,
  ];

  if (v.m2) satirlar.push(`Parsel alanı: ${v.m2} m²`);
  if (v.imarDurumu) satirlar.push(`İmar durumu: ${v.imarDurumu}`);
  if (v.depremZonu) satirlar.push(`Deprem zonu: ${v.depremZonu}`);
  if (v.baselineTlm2 && v.baselineTlm2 > 0) {
    satirlar.push(`Bölge medyan fiyatı: ${v.baselineTlm2.toLocaleString("tr-TR")} TL/m²`);
    if (v.guvenSkoru) satirlar.push(`Baseline güven skoru: ${v.guvenSkoru}/100`);
  }

  if (v.emsaller && v.emsaller.length > 0) {
    const emsalMetni = v.emsaller
      .slice(0, 5)
      .map((e) => {
        const parcalar = [`${e.fiyat_per_m2.toLocaleString("tr-TR")} TL/m²`];
        if (e.mesafe_m) parcalar.push(`${e.mesafe_m}m uzaklıkta`);
        if (e.m2) parcalar.push(`${e.m2}m²`);
        return parcalar.join(", ");
      })
      .join(" | ");
    satirlar.push(`Yakın çevrede gerçekleşen satışlar: ${emsalMetni}`);
  }

  satirlar.push(
    "",
    "Yukarıdaki verileri analiz ederek şu alanları içeren JSON döndür:",
    '{ "altPerM2": <sayı>, "beklenenPerM2": <sayı>, "ustPerM2": <sayı>, "gerekce": "<2-3 cümle Türkçe>" }',
    "Tüm fiyat değerleri TL/m² cinsinden tam sayı olmalı.",
    "Gerekçe bölgede etkili faktörleri (imar, konum, piyasa trendi) kısaca açıklamalı.",
  );

  return satirlar.join("\n");
}

// ── Input doğrulama ──────────────────────────────────────────────
const GECERLI_KATEGORI = new Set(["arsa", "tarla", "konut", "bahce", "bag", "zeytinlik"]);
const GECERLI_MODEL_HINT = new Set(["gemini", "groq", "auto"]);

function parselVeriDogrula(v: unknown): v is ParselVeri {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  if (typeof p.il !== "string" || p.il.trim().length === 0 || p.il.length > 50) return false;
  if (typeof p.ilce !== "string" || p.ilce.trim().length === 0 || p.ilce.length > 50) return false;
  if (typeof p.kategori !== "string" || !GECERLI_KATEGORI.has(p.kategori)) return false;
  if (p.mahalle !== undefined && (typeof p.mahalle !== "string" || p.mahalle.length > 100)) return false;
  if (p.m2 !== undefined && (typeof p.m2 !== "number" || p.m2 <= 0 || p.m2 > 10_000_000)) return false;
  if (p.imarDurumu !== undefined && (typeof p.imarDurumu !== "string" || p.imarDurumu.length > 100)) return false;
  if (p.depremZonu !== undefined && (typeof p.depremZonu !== "string" || p.depremZonu.length > 50)) return false;
  if (p.baselineTlm2 !== undefined && (typeof p.baselineTlm2 !== "number" || p.baselineTlm2 < 0 || p.baselineTlm2 > 1_000_000_000)) return false;
  if (p.guvenSkoru !== undefined && (typeof p.guvenSkoru !== "number" || p.guvenSkoru < 0 || p.guvenSkoru > 100)) return false;
  if (p.emsaller !== undefined) {
    if (!Array.isArray(p.emsaller) || p.emsaller.length > 10) return false;
    for (const e of p.emsaller) {
      if (typeof e.fiyat_per_m2 !== "number" || e.fiyat_per_m2 <= 0 || e.fiyat_per_m2 > 1_000_000_000) return false;
    }
  }
  return true;
}

// ── Gemini 2.5 Flash çağrısı ─────────────────────────────────────
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

// ── Groq Llama 3.3 70B fallback ──────────────────────────────────
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
        {
          role: "system",
          content:
            "Türk gayrimenkul piyasası uzmanısın. JSON formatında yanıt veriyorsun: " +
            '{"altPerM2": sayı, "beklenenPerM2": sayı, "ustPerM2": sayı, "gerekce": "metin"}. ' +
            "Tüm değerler TL/m². Gerekçe Türkçe, 2-3 cümle.",
        },
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

// ── Ana endpoint ─────────────────────────────────────────────────
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
  if (!body?.parselAnahtar || typeof body.parselAnahtar !== "string" || body.parselAnahtar.length > 200) {
    return c.json({ hata: "Geçersiz parselAnahtar" }, 400);
  }
  if (!body?.baselineHash || typeof body.baselineHash !== "string" || body.baselineHash.length > 100) {
    return c.json({ hata: "Geçersiz baselineHash" }, 400);
  }
  if (!parselVeriDogrula(body.parselVeri)) {
    return c.json({ hata: "Geçersiz parselVeri. il, ilce ve kategori zorunlu; tüm alanlar beklenen formatta olmalı." }, 400);
  }
  if (body.modelHint !== undefined && !GECERLI_MODEL_HINT.has(body.modelHint)) {
    return c.json({ hata: "Geçersiz modelHint (gemini | groq | auto)" }, 400);
  }

  // ── Cache kontrol (24h) ──────────────────────────────────────
  const cacheTtl = 24 * 60 * 60 * 1000;
  const cacheRow = await c.env.DB.prepare(
    `SELECT model, alt_per_m2, beklenen_per_m2, ust_per_m2, gerekce, sure_ms, olusturuldu
     FROM ai_fiyat_cache
     WHERE parsel_anahtar = ? AND baseline_hash = ?
     ORDER BY olusturuldu DESC LIMIT 1`,
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

  // ── Rate limit (per-user, daily) — atomic increment ──────────
  // ai_kullanim_kota: günlük bucket (migration 0016)
  // ai_kullanim: log tablosu (her sorgu ayrı satır, eski şema)
  const gun = Math.floor(Date.now() / 86400000);
  const incRes = await c.env.DB.prepare(
    `INSERT INTO ai_kullanim_kota (kullanici_id, gun, sayi) VALUES (?, ?, 1)
     ON CONFLICT(kullanici_id, gun) DO UPDATE SET sayi = sayi + 1
     RETURNING sayi`,
  ).bind(kullaniciId, gun).first<{ sayi: number }>();
  const yeniSayi = incRes?.sayi ?? 1;
  if (yeniSayi > kota) {
    // Kota aşıldı — refund
    await c.env.DB.prepare(
      "UPDATE ai_kullanim_kota SET sayi = sayi - 1 WHERE kullanici_id = ? AND gun = ?",
    ).bind(kullaniciId, gun).run();
    const upgradeMsg =
      tier === "free"
        ? "Bugünkü 3 ücretsiz AI analiziniz doldu. Sınırsız için Pro'ya geçin."
        : tier === "pro"
        ? "Günlük 100 sorgu hakkınız doldu. Pro+ ile 1000/gün kullanabilirsiniz."
        : `Günlük kotanız doldu (${kota}/${kota}). Yarın yenilenecek.`;
    return c.json(
      {
        hata: upgradeMsg,
        kalan: 0,
        tier,
        kota,
        upgradeOner: tier === "free" ? "pro" : tier === "pro" ? "pro_plus" : null,
      },
      429,
    );
  }

  // ── Prompt server-side oluştur ────────────────────────────────
  const prompt = promptOlustur(body.parselVeri);

  // ── AI çağrısı (Gemini primary, Groq fallback) ────────────────
  const geminiKey = (c.env as any).GEMINI_API_KEY as string | undefined;
  const groqKey = (c.env as any).GROQ_API_KEY as string | undefined;

  let cevap: { sonuc: AiSonuc; model: string; sureMs: number } | null = null;
  let sonHata: string | null = null;

  const tercih = body.modelHint ?? "auto";

  if ((tercih === "auto" || tercih === "gemini") && geminiKey) {
    try {
      cevap = await geminiCagir(geminiKey, prompt);
    } catch (e) {
      sonHata = e instanceof Error ? e.message : String(e);
      console.warn("[ai-fiyat] Gemini hata:", sonHata);
    }
  }

  if (!cevap && (tercih === "auto" || tercih === "groq") && groqKey) {
    try {
      cevap = await groqCagir(groqKey, prompt);
    } catch (e) {
      sonHata = e instanceof Error ? e.message : String(e);
      console.warn("[ai-fiyat] Groq hata:", sonHata);
    }
  }

  if (!cevap) {
    // AI hata → refund
    await c.env.DB.prepare(
      "UPDATE ai_kullanim SET sayi = sayi - 1 WHERE kullanici_id = ? AND gun = ?",
    ).bind(kullaniciId, gun).run();
    return c.json(
      { hata: `AI servislerine ulaşılamadı. ${sonHata ?? "Anahtar yok."}` },
      503,
    );
  }

  // ── Cache kaydet ─────────────────────────────────────────────
  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO ai_fiyat_cache
     (parsel_anahtar, baseline_hash, model, alt_per_m2, beklenen_per_m2, ust_per_m2, gerekce, sure_ms, olusturuldu)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      body.parselAnahtar,
      body.baselineHash,
      cevap.model,
      cevap.sonuc.altPerM2,
      cevap.sonuc.beklenenPerM2,
      cevap.sonuc.ustPerM2,
      cevap.sonuc.gerekce,
      cevap.sureMs,
      Date.now(),
    )
    .run();

  return c.json({
    ...cevap.sonuc,
    kaynak: "cadastrum-proxy",
    modelAd: cevap.model,
    sureMs: cevap.sureMs,
    cached: false,
    kalanKota: Math.max(0, kota - yeniSayi),
  });
});

// ── Kullanım durumu ──────────────────────────────────────────────
aiFiyat.get("/durum", async (c) => {
  const tier = c.get("tier" as any) as string;
  const kullaniciId = c.get("kullaniciId" as any) as number;
  const kota = GUNLUK_KOTA[tier] ?? 0;
  const gun = Math.floor(Date.now() / 86400000);
  const k = await c.env.DB.prepare(
    "SELECT sayi FROM ai_kullanim_kota WHERE kullanici_id = ? AND gun = ?",
  )
    .bind(kullaniciId, gun)
    .first<{ sayi: number }>();
  const kullanilan = k?.sayi ?? 0;
  return c.json({ tier, kota, kullanilan, kalan: Math.max(0, kota - kullanilan) });
});

export { aiFiyat as aiFiyatRoutes };
