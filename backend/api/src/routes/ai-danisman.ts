/**
 * AI Yatırım Danışmanı Chat — Faz B3/B4
 *
 * POST /v1/ai-danisman/sohbet  (JWT zorunlu)
 *   Parsel bağlamlı RAG sohbet. Prompt client'tan gelmez — server-side oluşturulur.
 *   Context: son sorgu JSON (imar, fiyat, risk, fizibilite, gelecek skor).
 *   Guardrails: kaynak zorunlu alıntı, uydurma yasak, yatırım tavsiyesi reddi.
 *
 * GET /v1/ai-danisman/gecmis   (JWT zorunlu)
 *   Son 20 sohbet mesajı.
 *
 * Rate limit: ai_kullanim_kota tablosunu kullanır (ai-fiyat + ai-scorecard ile paylaşımlı).
 *
 * Tier kota: free=3/gün, pro=50/gün, pro_plus=200/gün
 */

import { Hono } from "hono";
import { jwtMiddleware } from "./hesap.js";
import type { Env } from "../index.js";

export const aiDanismanRoutes = new Hono<{ Bindings: Env }>();
aiDanismanRoutes.use("*", jwtMiddleware);

const GUNLUK_KOTA: Record<string, number> = {
  free: 3,
  pro: 50,
  pro_plus: 200,
  kurumsal: 500,
};

// ── Tip tanımları ─────────────────────────────────────────────────────────────

export interface ParselBaglam {
  il: string;
  ilce: string;
  mahalle?: string;
  kategori?: string;
  m2?: number;
  // Fiyat
  medyan_tlm2?: number;
  alt_tlm2?: number;
  ust_tlm2?: number;
  guven_skoru?: number;
  // İmar
  imar_tipi?: string;
  emsal?: number;
  taks?: number;
  maks_kat?: number;
  // Risk
  deprem_zonu?: string;
  deprem_pga?: number;
  taskin_risk?: string;
  // Gelecek değer
  gelecek_skor?: number;
  gelecek_etiket?: string;
  yillik_nominal_beklenti?: number;
  // Yatırım skoru
  yatirim_skoru?: number;
  yatirim_etiket?: string;
  // Fizibilite
  insaat_m2?: number;
  taban_m2?: number;
}

interface SohbetIstek {
  mesaj: string;           // kullanıcı sorusu
  parsel_baglam?: ParselBaglam;
  sohbet_gecmisi?: Array<{ rol: "kullanici" | "asistan"; icerik: string }>;
}

// ── Sistem promptu (guardrails dahil) ────────────────────────────────────────

const SISTEM_PROMPT = `Sen Cadastrum'un AI arazi ve gayrimenkul analiz asistanısın.
SADECE aşağıdaki konularda yardımcı ol:
- Parsel ve arazi analizi (imar, fiyat, risk, fizibilite)
- Türkiye arazi mevzuatı hakkında genel bilgi
- Yatırım senaryosu hesaplamaları (sayısal, açıklanabilir)
- Tarımsal arazi değerlendirmesi
- İmar durumu ve yapılaşma potansiyeli

YASAK:
- Kesin yatırım tavsiyesi verme ("şunu al", "şimdi al/sat" gibi)
- Verilen bağlam dışında bilgi uydurma
- Hukuki tavsiye (avukat yönlendir)
- Gerçek tapu/kadastro değeri taahhüdü
- Politik veya kişisel yorumlar

Her yanıtta:
1. Verilen bağlam verilerini temel al
2. Belirsizlik varsa "veri yetersiz" belirt
3. Hesaplamaları adım adım göster
4. Yanıt sonunda kısa disclaimer ekle: "Bu analiz bilgilendirme amaçlıdır; yatırım tavsiyesi değildir."

Yanıtlar Türkçe, teknik ama anlaşılır, maksimum 400 kelime.`;

// ── Context string üretici ────────────────────────────────────────────────────

function baglamOlustur(b: ParselBaglam): string {
  const satirlar: string[] = [
    `=== PARSEL BAĞLAM VERİSİ ===`,
    `Lokasyon: ${[b.il, b.ilce, b.mahalle].filter(Boolean).join(" / ")}`,
  ];
  if (b.kategori)     satirlar.push(`Kategori: ${b.kategori}`);
  if (b.m2)           satirlar.push(`Alan: ${b.m2.toLocaleString("tr-TR")} m²`);
  if (b.medyan_tlm2)  satirlar.push(`Medyan fiyat: ${b.medyan_tlm2.toLocaleString("tr-TR")} TL/m²`);
  if (b.alt_tlm2 && b.ust_tlm2)
    satirlar.push(`Fiyat bandı: ${b.alt_tlm2.toLocaleString("tr-TR")} – ${b.ust_tlm2.toLocaleString("tr-TR")} TL/m²`);
  if (b.guven_skoru)  satirlar.push(`Veri güveni: %${b.guven_skoru}`);
  if (b.imar_tipi)    satirlar.push(`İmar tipi: ${b.imar_tipi}`);
  if (b.emsal)        satirlar.push(`Emsal (KAKS): ${b.emsal}`);
  if (b.taks)         satirlar.push(`TAKS: ${b.taks}`);
  if (b.maks_kat)     satirlar.push(`Maks kat: ${b.maks_kat}`);
  if (b.deprem_zonu)  satirlar.push(`Deprem zonu: ${b.deprem_zonu}`);
  if (b.deprem_pga)   satirlar.push(`Deprem PGA: ${b.deprem_pga.toFixed(2)}g`);
  if (b.taskin_risk)  satirlar.push(`Taşkın riski: ${b.taskin_risk}`);
  if (b.gelecek_skor) satirlar.push(`AI gelecek skor: ${b.gelecek_skor}/100 (${b.gelecek_etiket ?? ""})`);
  if (b.yillik_nominal_beklenti)
    satirlar.push(`Yıllık nominal büyüme beklentisi: %${b.yillik_nominal_beklenti}`);
  if (b.yatirim_skoru)
    satirlar.push(`Yatırım skoru: ${b.yatirim_skoru}/100 (${b.yatirim_etiket ?? ""})`);
  if (b.insaat_m2)    satirlar.push(`Fizibilite inşaat m²: ${b.insaat_m2.toLocaleString("tr-TR")} m²`);
  if (b.taban_m2)     satirlar.push(`Fizibilite taban m²: ${b.taban_m2.toLocaleString("tr-TR")} m²`);
  satirlar.push("=== BAĞLAM SONU ===");
  return satirlar.join("\n");
}

// ── Gemini çağrısı ────────────────────────────────────────────────────────────

async function geminiSohbet(
  apiKey: string,
  sistem: string,
  mesajlar: Array<{ role: string; parts: Array<{ text: string }> }>,
): Promise<{ yanit: string; model: string; sureMs: number }> {
  const t0 = Date.now();
  // BUG-1 fix: API key Authorization header'ında — URL'de query param olarak log'a sızmaz
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;

  const body = {
    system_instruction: { parts: [{ text: sistem }] },
    contents: mesajlar,
    generationConfig: { temperature: 0.3, maxOutputTokens: 1200 },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Gemini v1beta destekliyor: https://ai.google.dev/api/generate-content#method-models.generatecontent
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = (await res.text().catch(() => "")).slice(0, 120);
    throw new Error(`Gemini ${res.status}: ${errText}`);
  }

  const data = await res.json() as {
    candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  const yanit = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!yanit) throw new Error("Gemini boş yanıt");
  return { yanit: yanit.trim(), model: "gemini-2.5-flash", sureMs: Date.now() - t0 };
}

// ── Groq fallback ─────────────────────────────────────────────────────────────

async function groqSohbet(
  apiKey: string,
  sistem: string,
  mesajlar: Array<{ role: string; content: string }>,
): Promise<{ yanit: string; model: string; sureMs: number }> {
  const t0 = Date.now();
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: sistem }, ...mesajlar],
      temperature: 0.3,
      max_tokens: 1000,
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json() as { choices?: Array<{ message: { content: string } }> };
  const yanit = data.choices?.[0]?.message?.content;
  if (!yanit) throw new Error("Groq boş yanıt");
  return { yanit: yanit.trim(), model: "llama-3.3-70b-groq", sureMs: Date.now() - t0 };
}

// ── POST /v1/ai-danisman/sohbet ───────────────────────────────────────────────

aiDanismanRoutes.post("/sohbet", async (c) => {
  const tier        = c.get("tier" as never) as string;
  const kullaniciId = c.get("kullaniciId" as never) as number;

  const kota = GUNLUK_KOTA[tier] ?? 0;
  if (kota === 0) {
    return c.json({ hata: "AI Danışman bu hesap tipinde aktif değil.", gerekliTier: "free" }, 403);
  }

  const body = await c.req.json<SohbetIstek>().catch(() => null);
  if (!body?.mesaj || typeof body.mesaj !== "string" || body.mesaj.trim().length === 0) {
    return c.json({ hata: "Mesaj boş olamaz" }, 400);
  }
  if (body.mesaj.length > 1000) {
    return c.json({ hata: "Mesaj maksimum 1000 karakter" }, 400);
  }

  // SEK-1: Parsel bağlam sanitizasyonu — prompt injection önlemi
  // Client-side veri güvenilmez; string alanları sınırla + tehlikeli karakter temizle
  const baglamSanitize = (v: unknown, maxLen = 200): string | undefined => {
    if (typeof v !== "string") return undefined;
    return v.replace(/[<>{}[\]\\]/g, "").slice(0, maxLen).trim() || undefined;
  };
  const numSanitize = (v: unknown, min: number, max: number): number | undefined => {
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
  };

  let baglamTemiz: ParselBaglam | undefined;
  if (body.parsel_baglam && typeof body.parsel_baglam === "object") {
    const b = body.parsel_baglam as unknown as Record<string, unknown>;
    baglamTemiz = {
      il:               baglamSanitize(b.il, 60) ?? "—",
      ilce:             baglamSanitize(b.ilce, 60) ?? "—",
      mahalle:          baglamSanitize(b.mahalle, 80),
      kategori:         ["arsa","tarla","konut","bahce"].includes(String(b.kategori)) ? String(b.kategori) : undefined,
      m2:               numSanitize(b.m2, 0, 10_000_000),
      medyan_tlm2:      numSanitize(b.medyan_tlm2, 0, 1_000_000_000),
      alt_tlm2:         numSanitize(b.alt_tlm2, 0, 1_000_000_000),
      ust_tlm2:         numSanitize(b.ust_tlm2, 0, 1_000_000_000),
      guven_skoru:      numSanitize(b.guven_skoru, 0, 100),
      imar_tipi:        baglamSanitize(b.imar_tipi, 30),
      emsal:            numSanitize(b.emsal, 0, 20),
      taks:             numSanitize(b.taks, 0, 1),
      maks_kat:         numSanitize(b.maks_kat, 0, 100),
      deprem_zonu:      baglamSanitize(b.deprem_zonu, 20),
      deprem_pga:       numSanitize(b.deprem_pga, 0, 5),
      taskin_risk:      ["dusuk","orta","yuksek"].includes(String(b.taskin_risk)) ? String(b.taskin_risk) : undefined,
      gelecek_skor:     numSanitize(b.gelecek_skor, 0, 100),
      gelecek_etiket:   baglamSanitize(b.gelecek_etiket, 40),
      yillik_nominal_beklenti: numSanitize(b.yillik_nominal_beklenti, 0, 200),
      yatirim_skoru:    numSanitize(b.yatirim_skoru, 0, 100),
      yatirim_etiket:   baglamSanitize(b.yatirim_etiket, 40),
      insaat_m2:        numSanitize(b.insaat_m2, 0, 100_000_000),
      taban_m2:         numSanitize(b.taban_m2, 0, 100_000_000),
    };
  }

  // SEK-2: Sohbet geçmişi doğrulama — max 6 mesaj, her biri max 500 karakter
  const GECMIS_LIMIT = 6;
  const GECMIS_MAX_ICERIK = 500;
  const GECERLI_ROLLER = new Set(["kullanici", "asistan"]);
  const gecmisHam = Array.isArray(body.sohbet_gecmisi) ? body.sohbet_gecmisi : [];
  const gecmis = gecmisHam
    .filter((m) =>
      m && typeof m === "object" &&
      GECERLI_ROLLER.has(m.rol) &&
      typeof m.icerik === "string" &&
      m.icerik.trim().length > 0
    )
    .slice(-GECMIS_LIMIT)
    .map((m) => ({
      rol: m.rol as "kullanici" | "asistan",
      icerik: m.icerik.replace(/[<>{}[\]\\]/g, "").slice(0, GECMIS_MAX_ICERIK),
    }));

  // Rate limit kontrolü
  const gun = Math.floor(Date.now() / 86_400_000);
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

  // Sistem promptu + sanitize edilmiş bağlam oluştur
  const baglamStr = baglamTemiz ? baglamOlustur(baglamTemiz) : "";
  const sistemTam = baglamStr ? `${SISTEM_PROMPT}\n\n${baglamStr}` : SISTEM_PROMPT;

  // Sohbet geçmişi + yeni mesaj (Gemini format)
  const geminiMesajlar = [
    ...gecmis.map((m) => ({
      role: m.rol === "kullanici" ? "user" : "model",
      parts: [{ text: m.icerik }],
    })),
    { role: "user", parts: [{ text: body.mesaj.trim() }] },
  ];

  const groqMesajlar = [
    ...gecmis.map((m) => ({ role: m.rol === "kullanici" ? "user" : "assistant", content: m.icerik })),
    { role: "user", content: body.mesaj.trim() },
  ];

  const geminiKey = (c.env as unknown as Record<string, unknown>).GEMINI_API_KEY as string | undefined;
  const groqKey   = (c.env as unknown as Record<string, unknown>).GROQ_API_KEY as string | undefined;

  let cevap: { yanit: string; model: string; sureMs: number } | null = null;
  let sonHata: string | null = null;

  if (geminiKey) {
    try { cevap = await geminiSohbet(geminiKey, sistemTam, geminiMesajlar); }
    catch (e) { sonHata = e instanceof Error ? e.message : String(e); }
  }
  if (!cevap && groqKey) {
    try { cevap = await groqSohbet(groqKey, sistemTam, groqMesajlar); }
    catch (e) { sonHata = e instanceof Error ? e.message : String(e); }
  }

  if (!cevap) {
    await c.env.DB.prepare(
      "UPDATE ai_kullanim_kota SET sayi = sayi - 1 WHERE kullanici_id = ? AND gun = ?",
    ).bind(kullaniciId, gun).run();
    return c.json({ hata: `AI servisine ulaşılamadı. ${sonHata ?? "Anahtar yok."}` }, 503);
  }

  // Sohbet geçmişini kaydet
  try {
    await c.env.DB.prepare(
      `INSERT INTO ai_sohbet_gecmisi
       (kullanici_id, kullanici_mesaj, asistan_yanit, model, sure_ms, tarih)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      kullaniciId,
      body.mesaj.trim().slice(0, 1000),
      cevap.yanit.slice(0, 4000),
      cevap.model,
      cevap.sureMs,
      Date.now(),
    ).run();
  } catch {
    // Tablo yoksa sessizce geç (migration henüz uygulanmamış olabilir)
  }

  return c.json({
    yanit: cevap.yanit,
    modelAd: cevap.model,
    sureMs: cevap.sureMs,
    kalanKota: Math.max(0, kota - yeniSayi),
  });
});

// ── GET /v1/ai-danisman/gecmis ────────────────────────────────────────────────

aiDanismanRoutes.get("/gecmis", async (c) => {
  const kullaniciId = c.get("kullaniciId" as never) as number;
  try {
    const rows = await c.env.DB.prepare(
      `SELECT kullanici_mesaj, asistan_yanit, model, sure_ms, tarih
       FROM ai_sohbet_gecmisi
       WHERE kullanici_id = ?
       ORDER BY tarih DESC LIMIT 20`,
    ).bind(kullaniciId).all<{
      kullanici_mesaj: string; asistan_yanit: string;
      model: string; sure_ms: number; tarih: number;
    }>();
    return c.json({ gecmis: (rows.results ?? []).reverse() });
  } catch {
    return c.json({ gecmis: [] });
  }
});
