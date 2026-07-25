/**
 * Ücretsiz AI fiyat tahmini.
 *
 * 3 sağlayıcı destekleniyor (yelpaze: kalite ↑ — kurulum karmaşası ↑):
 *   1. Chrome built-in AI (Gemini Nano) — Chrome 127+, lokal, sıfır kurulum
 *   2. Ollama localhost (Llama 3.2 / Mistral) — kullanıcı kurar, lokal, daha iyi
 *   3. Google AI Studio (Gemini Flash) — ücretsiz API key, online, en iyi
 *
 * Kullanıcı Ayarlar'dan birini seçer. Hiçbiri ayarlı değilse
 * "Chrome built-in AI" deneme yapılır, yoksa hata.
 */

import type { Parsel } from "../types/tkgm";
import type { CevreAnalizi } from "./osm";
import type { EgimAnalizi } from "./elevation";
import type { FiyatTahmini } from "./fiyat-tahmin";
import type { IlanBilgisi } from "../types/ilan";
import { db } from "./db";
import { PromptBudget, emsalleriBudgetlaFormatla } from "./prompt-budget";

// AI cache — aynı parselin aynı baseline ile tekrar sorulmasında 0 maliyet
const AI_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat

/** Composite cache key — parsel + heuristic özet + sağlayıcı */
function aiCacheKey(parsel: Parsel, heuristic: FiyatTahmini, saglayici: AiSaglayici): string {
  // Heuristic değiştiyse (yeni emsal eklendi vb.) cache invalidate olur
  const baselineHash = `${heuristic.baselineKaynak}-${heuristic.baselineAdet}-${heuristic.guvenSkoru}`;
  return `${parsel.adaNo}-${parsel.parselNo}-${parsel.mahalleKodu ?? "x"}|${baselineHash}|${saglayici}`;
}

export type AiSaglayici = "cadastrum-proxy" | "chrome-builtin" | "ollama" | "gemini-free" | "yok";

export interface AiFiyatSonucu {
  altPerM2: number;
  beklenenPerM2: number;
  ustPerM2: number;
  gerekce: string;
  kaynak: AiSaglayici;
  modelAd: string;
  sureMs: number;
}

// ----- Chrome built-in AI (Gemini Nano) -----
// API stable değil — eski + yeni surface ikisini de dene

interface ChromeAiNew {
  create(opts?: { systemPrompt?: string }): Promise<ChromeAiSession>;
}
interface ChromeAiSession {
  prompt(text: string): Promise<string>;
  destroy?(): void;
}

/**
 * Chrome built-in AI (Gemini Nano) tarayıcıda mevcut mu kontrolü.
 * Vendor-free + sıfır kurulum option — kullanıcıya öne çıkarılır.
 * Chrome 127+ ve "Optimization Guide On Device Model" indirilmiş olmalı.
 */
export function chromeBuiltinAiVarMi(): boolean {
  const lm = (self as { LanguageModel?: unknown }).LanguageModel;
  if (lm) return true;
  const aiOld = (self as { ai?: { languageModel?: unknown; assistant?: unknown } }).ai;
  return !!(aiOld?.languageModel ?? aiOld?.assistant);
}

async function chromeAiCalistir(systemPrompt: string, userPrompt: string): Promise<string> {
  // Chrome 138+
  const lm = (self as { LanguageModel?: ChromeAiNew }).LanguageModel;
  if (lm) {
    const session = await lm.create({ systemPrompt });
    try {
      return await session.prompt(userPrompt);
    } finally {
      session.destroy?.();
    }
  }
  // Chrome 127-137
  const aiOld = (
    self as {
      ai?: { languageModel?: ChromeAiNew; assistant?: ChromeAiNew };
    }
  ).ai;
  const oldLm = aiOld?.languageModel ?? aiOld?.assistant;
  if (oldLm) {
    const session = await oldLm.create({ systemPrompt });
    try {
      return await session.prompt(userPrompt);
    } finally {
      session.destroy?.();
    }
  }
  throw new Error(
    "Chrome built-in AI bulunamadı. Chrome 127+ + chrome://flags/#optimization-guide-on-device-model 'Enabled BypassPerfRequirement' + chrome://components 'Optimization Guide On Device Model' güncel olmalı.",
  );
}

// ----- Ollama (localhost) -----

async function ollamaCalistir(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  baseUrl = "http://localhost:11434",
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: userPrompt,
      system: systemPrompt,
      stream: false,
      options: { temperature: 0.3 },
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Ollama bağlantısı başarısız (HTTP ${res.status}). 'ollama serve' çalışıyor mu?`,
    );
  }
  const data = (await res.json()) as { response?: string; error?: string };
  if (data.error) throw new Error(`Ollama: ${data.error}`);
  return data.response ?? "";
}

// ----- Google AI Studio (Gemini Flash, free tier) -----

// Free tier'da hangi modeller geçerli olduğu zamanla değişiyor.
// Sırayla dene — biri 429 verirse diğerine geç.
const GEMINI_MODELLERI = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash",
] as const;

async function geminiFreeCalistir(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  // Structured JSON output zorla — Gemini markdown sarmaz, doğrudan {...} döner
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          altPerM2: { type: "integer" },
          beklenenPerM2: { type: "integer" },
          ustPerM2: { type: "integer" },
          gerekce: { type: "string" },
        },
        required: ["altPerM2", "beklenenPerM2", "ustPerM2", "gerekce"],
        propertyOrdering: ["altPerM2", "beklenenPerM2", "ustPerM2", "gerekce"],
      },
    },
  };
  const hatalar: string[] = [];

  for (const model of GEMINI_MODELLERI) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 429) {
        const errText = await res.text();
        hatalar.push(`${model}: 429 quota`);
        // Quota dolduysa bir sonraki modelle dene (her modelin ayrı kotası var)
        continue;
      }
      if (res.status === 404) {
        hatalar.push(`${model}: 404 (bu bölgede yok)`);
        continue;
      }
      if (!res.ok) {
        const err = await res.text();
        // Diğer hatalar için de devam et
        hatalar.push(`${model}: ${res.status} ${err.slice(0, 80)}`);
        continue;
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
      hatalar.push(`${model}: boş yanıt`);
    } catch (e) {
      hatalar.push(`${model}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  throw new Error(
    `Tüm Gemini modelleri başarısız:\n${hatalar.join("\n")}\n\nİpucu: API key doğru mu? https://aistudio.google.com/app/apikey'den yeni key dene.`,
  );
}

// ----- Prompt + parser -----

const SYSTEM_PROMPT = `Sen Türkiye'de gayrimenkul fiyat değerlendirme uzmanısın. Sana TKGM parsel bilgisi + bölge analizi + heuristic baseline veriyorum.

ÇIKTI KURALLARI (kesin):
- Sadece tek bir JSON nesnesi döndür. Markdown kod bloğu (\`\`\`json) KULLANMA.
- Anahtar isimleri TAM olarak şunlar olsun (Türkçe varyant kabul edilmiyor):
  {"altPerM2": <int>, "beklenenPerM2": <int>, "ustPerM2": <int>, "gerekce": "<2-3 cümle Türkçe gerekçe>"}
- Değerler mantıklı bir aralıkta olsun. Heuristic motoru sadece bir referanstır; eğer emsaller ve saha verileri aksini söylüyorsa heuristic'ten sapabilirsin (serbestsin).
- gerekce bölümünde emsalleri nasıl tarttığını ve hangi faktörlerin (yol, su, imar) fiyata nasıl yön verdiğini teknik bir dille açıkla.`;

function promptOlustur(
  parsel: Parsel,
  cevre: CevreAnalizi | null,
  egim: EgimAnalizi | null,
  heuristic: FiyatTahmini,
  ilan: IlanBilgisi | null = null,
): string {
  // ── Token Budget — sabit bölümler önce ayrılır ─────────────────────────────
  const budget = new PromptBudget(8_000); // Fiyat tahmini için 8K token yeterli

  // ── Sabit bölümler ──────────────────────────────────────────────────────────
  const cevreNot = cevre
    ? `Çevre (1.5km): ${cevre.poi.okul} eğitim, ${cevre.poi.duraklar} ulaşım, ${cevre.poi.hastane} sağlık. Toplam ${cevre.elementSayisi} OSM elementi.${
        cevre.enYakinlar.length > 0
          ? ` En yakınlar: ${cevre.enYakinlar
              .slice(0, 4)
              .map((y) => `${y.tip}@${(y.mesafeM / 1000).toFixed(1)}km`)
              .join(", ")}.`
          : ""
      }`
    : "Çevre verisi yok.";

  const egimNot = egim
    ? `Eğim: %${egim.ortEgimYuzde} (${egim.egimKategori}). Yükseklik: ${egim.merkezYukseklikM}m. Bakı: ${egim.bakiYonu}.`
    : "Eğim verisi yok.";

  let ilanBolumu = "";
  if (ilan) {
    const fiyatPerM2 =
      ilan.fiyat != null && ilan.m2 != null && ilan.m2 > 0
        ? Math.round(ilan.fiyat / ilan.m2)
        : null;
    ilanBolumu = `

SAHİBİNDEN İLAN VERİSİ (asking — istek fiyatı, kapanış değil):
- Başlık: ${ilan.baslik ?? "—"}
- İlan fiyatı: ${ilan.fiyatStr ?? "—"} ${ilan.paraBirimi ?? ""}
- İlan TL/m²: ${fiyatPerM2 != null ? fiyatPerM2.toLocaleString("tr-TR") : "—"}
- İlandaki m²: ${ilan.m2 ?? "—"}
- İmar durumu: ${ilan.imarDurumu ?? "—"}
- İlan no: ${ilan.ilanNo ?? "—"}
NOT: Sahibinden = asking. Türkiye'de ortalama %10-15 indirimli kapanır.`;
  }

  // Sabit metin bloğu — budget'tan ayır
  const sabitBlok = `Parsel (TKGM):
- Konum: ${parsel.ilAd} / ${parsel.ilceAd} / ${parsel.mahalleAd}
- Ada/Parsel: ${parsel.adaNo}/${parsel.parselNo}
- Alan: ${parsel.alan} m²
- Nitelik: ${parsel.nitelik}
- Pafta: ${parsel.pafta}

Saha analizi:
- ${cevreNot}
- ${egimNot}${ilanBolumu}

Heuristic motorum (lokal sahibinden gözlem + statik baseline + nitelik/alan/konum/çevre/eğim çarpanları):
- Beklenen: ${heuristic.beklenenPerM2.toLocaleString("tr-TR")} TL/m² (${heuristic.altPerM2.toLocaleString("tr-TR")}–${heuristic.ustPerM2.toLocaleString("tr-TR")} aralığı)
- Baseline kaynağı: ${heuristic.baselineKaynak} (${heuristic.baselineDeger.toLocaleString("tr-TR")} TL/m²)
- Güven: ${heuristic.guven}

Senin görevin: Bu tüm sinyalleri tartarak (özellikle SAHİBİNDEN İLAN VERİSİ varsa, asking → kapanış correction uygulayarak) gerçekçi alt/beklenen/üst TL/m² ver. Gerekçede bölgenin özelliklerini, niteliği, ilan-tahmin farkını yorumla. Sadece JSON döndür.`;

  try {
    budget.rezervEt("sabit", sabitBlok);
  } catch {
    // Sabit blok bile sığmıyor — budget olmadan devam et (güvenli fallback)
    return sabitBlok;
  }

  // ── Dinamik bölüm: emsal listesi — kalan bütçeye sığdır ───────────────────
  const emsalBlok = heuristic.emsalListesi && heuristic.emsalListesi.length > 0
    ? emsalleriBudgetlaFormatla(
        heuristic.emsalListesi.map((e) => ({
          fiyatPerM2: e.fiyatPerM2,
          alan: e.alan,
          benzerlik: e.benzerlik,
          tazelikGun: e.tazelikGun,
          ilanNo: e.ilanNo,
        })),
        budget,
        10,
      )
    : "Bölgede taze emsal bulunamadı.";

  return `Parsel (TKGM):
- Konum: ${parsel.ilAd} / ${parsel.ilceAd} / ${parsel.mahalleAd}
- Ada/Parsel: ${parsel.adaNo}/${parsel.parselNo}
- Alan: ${parsel.alan} m²
- Nitelik: ${parsel.nitelik}
- Pafta: ${parsel.pafta}

Saha analizi:
- ${cevreNot}
- ${egimNot}

BÖLGEDEKİ CANLI EMSALLER (Sahibinden/Hepsiemlak - Ham Veri):
${emsalBlok}
${ilanBolumu}

Heuristic motorum (lokal sahibinden gözlem + statik baseline + nitelik/alan/konum/çevre/eğim çarpanları):
- Beklenen: ${heuristic.beklenenPerM2.toLocaleString("tr-TR")} TL/m² (${heuristic.altPerM2.toLocaleString("tr-TR")}–${heuristic.ustPerM2.toLocaleString("tr-TR")} aralığı)
- Baseline kaynağı: ${heuristic.baselineKaynak} (${heuristic.baselineDeger.toLocaleString("tr-TR")} TL/m²)
- Güven: ${heuristic.guven}

Senin görevin: Bu tüm sinyalleri tartarak (özellikle SAHİBİNDEN İLAN VERİSİ varsa, asking → kapanış correction uygulayarak) gerçekçi alt/beklenen/üst TL/m² ver. Gerekçede bölgenin özelliklerini, niteliği, ilan-tahmin farkını yorumla. Sadece JSON döndür.`;
}

/** Anahtar normalizasyon: AI bazen Türkçe/snake_case anahtar döner.
 *  Tüm varyantları kanonik kamelCase'e map et. */
const ANAHTAR_ALIAS: Record<string, "altPerM2" | "beklenenPerM2" | "ustPerM2" | "gerekce"> = {
  // alt
  altperm2: "altPerM2",
  alt_per_m2: "altPerM2",
  alt: "altPerM2",
  altfiyat: "altPerM2",
  alt_fiyat: "altPerM2",
  altbeklenenfiyat: "altPerM2",
  alt_beklenen_fiyat: "altPerM2",
  minfiyat: "altPerM2",
  min_fiyat: "altPerM2",
  minimum: "altPerM2",
  dusukfiyat: "altPerM2",
  dusuk_fiyat: "altPerM2",
  // beklenen
  beklenenperm2: "beklenenPerM2",
  beklenen_per_m2: "beklenenPerM2",
  beklenen: "beklenenPerM2",
  beklenenfiyat: "beklenenPerM2",
  beklenen_fiyat: "beklenenPerM2",
  realistik: "beklenenPerM2",
  realistikfiyat: "beklenenPerM2",
  realistik_fiyat: "beklenenPerM2",
  gercek: "beklenenPerM2",
  gercekfiyat: "beklenenPerM2",
  gercek_fiyat: "beklenenPerM2",
  ortafiyat: "beklenenPerM2",
  orta_fiyat: "beklenenPerM2",
  ortalama: "beklenenPerM2",
  // üst
  ustperm2: "ustPerM2",
  ust_per_m2: "ustPerM2",
  ust: "ustPerM2",
  ustfiyat: "ustPerM2",
  ust_fiyat: "ustPerM2",
  ustbeklenenfiyat: "ustPerM2",
  ust_beklenen_fiyat: "ustPerM2",
  maxfiyat: "ustPerM2",
  max_fiyat: "ustPerM2",
  maksimum: "ustPerM2",
  yuksekfiyat: "ustPerM2",
  yuksek_fiyat: "ustPerM2",
  // gerekce
  gerekce: "gerekce",
  aciklama: "gerekce",
  yorum: "gerekce",
  not: "gerekce",
  reasoning: "gerekce",
  explanation: "gerekce",
};

/** Türkçe karakterleri ve süslemeleri sıyır → "ÜST_Beklenen_Fiyat" → "ustbeklenenfiyat" */
function anahtarNormalize(k: string): string {
  return k
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9_]/g, "");
}

/** Object'in anahtarlarını kanonik isimlerine map et. */
function anahtarlarKanonikle(obj: Record<string, unknown>): {
  altPerM2?: number;
  beklenenPerM2?: number;
  ustPerM2?: number;
  gerekce?: string;
} {
  const sonuc: { altPerM2?: number; beklenenPerM2?: number; ustPerM2?: number; gerekce?: string } = {};
  for (const [k, v] of Object.entries(obj)) {
    const norm = anahtarNormalize(k);
    const kanonik = ANAHTAR_ALIAS[norm] ?? (["altPerM2", "beklenenPerM2", "ustPerM2", "gerekce"].includes(norm) ? (norm as keyof typeof sonuc) : null);
    if (!kanonik) continue;
    if (kanonik === "gerekce") {
      if (typeof v === "string") sonuc.gerekce = v;
    } else if (typeof v === "number") {
      sonuc[kanonik] = v;
    } else if (typeof v === "string") {
      const n = Number(v.replace(/[^\d.-]/g, ""));
      if (Number.isFinite(n)) sonuc[kanonik] = n;
    }
  }
  return sonuc;
}

function parseAiSonuc(text: string): {
  altPerM2: number;
  beklenenPerM2: number;
  ustPerM2: number;
  gerekce: string;
} {
  // 1. Markdown kod bloğu sıyır — kapanış ``` opsiyonel (truncate olabilir)
  let temiz = text.trim();
  // ```json veya ``` başlangıcını kaldır (newline opsiyonel)
  temiz = temiz.replace(/^```(?:json|JSON)?\s*\n?/, "");
  // Sondaki ``` varsa kaldır
  temiz = temiz.replace(/\n?```\s*$/, "").trim();

  // 2. Tam JSON parse dene
  const ilk = temiz.indexOf("{");
  const son = temiz.lastIndexOf("}");
  let data: { altPerM2?: number; beklenenPerM2?: number; ustPerM2?: number; gerekce?: string } | null = null;

  if (ilk !== -1 && son !== -1 && son > ilk) {
    const jsonStr = temiz.slice(ilk, son + 1);
    try {
      const ham = JSON.parse(jsonStr) as Record<string, unknown>;
      data = anahtarlarKanonikle(ham);
    } catch {
      // Devam — regex fallback'e geç
    }
  }

  // 3. Regex fallback — yarım/truncated yanıtlar veya alias key'ler için
  const tamMi = (d: typeof data): boolean =>
    !!d &&
    typeof d.altPerM2 === "number" &&
    typeof d.beklenenPerM2 === "number" &&
    typeof d.ustPerM2 === "number";

  if (!tamMi(data)) {
    const partial: Record<string, number | string> = data ?? {};
    // Tüm "ANAHTAR": deger çiftlerini regex ile yakala (Türkçe karakter dahil)
    const cifteRe = /"([^"\n]+?)"\s*:\s*(?:(-?\d+(?:\.\d+)?)|"((?:\\"|[^"])*?)")/g;
    let m: RegExpExecArray | null;
    while ((m = cifteRe.exec(temiz)) !== null) {
      const rawKey = m[1] ?? "";
      const numVal = m[2];
      const strVal = m[3];
      const norm = anahtarNormalize(rawKey);
      const kanonik = ANAHTAR_ALIAS[norm] ?? (["altPerM2", "beklenenPerM2", "ustPerM2", "gerekce"].includes(norm) ? norm : null);
      if (!kanonik) continue;
      if (kanonik === "gerekce" && strVal != null && partial.gerekce == null) {
        partial.gerekce = strVal;
      } else if (kanonik !== "gerekce" && numVal != null && partial[kanonik] == null) {
        partial[kanonik] = Number(numVal);
      }
    }
    if (
      typeof partial.altPerM2 === "number" &&
      typeof partial.beklenenPerM2 === "number" &&
      typeof partial.ustPerM2 === "number"
    ) {
      data = {
        altPerM2: partial.altPerM2,
        beklenenPerM2: partial.beklenenPerM2,
        ustPerM2: partial.ustPerM2,
        gerekce: typeof partial.gerekce === "string" ? partial.gerekce : "(gerekçe alınamadı)",
      };
    } else {
      throw new Error(
        `AI yanıtı parse edilemedi (ilk 200 kr): ${text.slice(0, 200)}`,
      );
    }
  }

  return {
    altPerM2: Math.round(data!.altPerM2!),
    beklenenPerM2: Math.round(data!.beklenenPerM2!),
    ustPerM2: Math.round(data!.ustPerM2!),
    gerekce: typeof data!.gerekce === "string" ? data!.gerekce : "",
  };
}

// ----- Cadastrum Backend Proxy (Pro/Pro+ varsayılan) -----

/**
 * Cadastrum kendi Gemini 2.5 Flash key'iyle çalışıyor — kullanıcının kendi
 * API key girmesi gerekmiyor. JWT auth zorunlu (Pro tier kontrolü backend'de).
 *
 * Backend: POST /v1/ai-fiyat/tahmin
 *   body: { parselAnahtar, baselineHash, parselVeri }   ← prompt YOK, server-side oluşturulur
 *   response: { altPerM2, beklenenPerM2, ustPerM2, gerekce, modelAd, sureMs, cached, kalanKota }
 *
 * Güvenlik notu: prompt artık client'tan gelmiyor. Injection riski = 0.
 */
const CADASTRUM_API = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

async function cadastrumProxyCagir(
  parsel: Parsel,
  heuristic: FiyatTahmini,
  cevre: import("./osm").CevreAnalizi | null,
  egim: import("./elevation").EgimAnalizi | null,
): Promise<{ altPerM2: number; beklenenPerM2: number; ustPerM2: number; gerekce: string; modelAd: string }> {
  const token = await tokenAl();
  if (!token) {
    throw new Error("Cadastrum hesabınıza giriş yapın — Pro/Pro+ planı gerekli.");
  }

  const parselAnahtar = `${parsel.mahalleKodu ?? "x"}-${parsel.adaNo}-${parsel.parselNo}`;
  const baselineHash = `${heuristic.baselineKaynak}-${heuristic.guvenSkoru}-${Math.round(heuristic.beklenenPerM2)}`;

  // Yapılandırılmış parsel verisi — prompt içermez, server-side oluşturulur
  const parselVeri = {
    il:           parsel.ilAd ?? "",
    ilce:         parsel.ilceAd ?? "",
    mahalle:      parsel.mahalleAd ?? undefined,
    kategori:     parsel.nitelik ?? "arsa",
    m2:           parsel.alan ?? undefined,
    baselineTlm2: heuristic.baselineDeger,
    guvenSkoru:   heuristic.guvenSkoru,
    emsaller:     heuristic.emsalListesi?.slice(0, 5).map((e) => ({
      fiyat_per_m2: e.fiyatPerM2,
      m2:           e.alan,
    })) ?? [],
    // Çevre ve eğim — opsiyonel zenginleştirme
    egimYuzde:    egim?.ortEgimYuzde ?? undefined,
    yukseklikM:   egim?.merkezYukseklikM ?? undefined,
    osmElementSayisi: cevre?.elementSayisi ?? undefined,
  };

  const res = await fetch(`${CADASTRUM_API}/ai-fiyat/tahmin`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ parselAnahtar, baselineHash, parselVeri }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ hata: "Sunucu hatası" })) as { hata?: string; gerekliTier?: string };
    if (res.status === 403) {
      throw new Error(err.hata ?? "Bu özellik Pro plan gerektirir");
    }
    if (res.status === 429) {
      throw new Error(err.hata ?? "Günlük AI kotanız doldu");
    }
    if (res.status === 401) {
      throw new Error("Oturum süresi dolmuş — siteye yeniden giriş yapın");
    }
    throw new Error(err.hata ?? `Sunucu hatası (${res.status})`);
  }

  const data = await res.json() as {
    altPerM2: number; beklenenPerM2: number; ustPerM2: number;
    gerekce: string; modelAd: string;
  };
  return data;
}

/** Token chrome.storage.local'da saklanan Cadastrum JWT'sini okur. */
async function tokenAl(): Promise<string | null> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
  const data = await chrome.storage.local.get("cadastrum_token");
  return (data.cadastrum_token as string | undefined) ?? null;
}

/**
 * Cadastrum AI günlük kota durumu (kalan / kota / tier)
 * UI'da kalan hakkı göstermek için periyodik çağrılır.
 */
export interface AiDurum {
  tier: string;
  kota: number;
  kullanilan: number;
  kalan: number;
}

export async function aiDurumGetir(): Promise<AiDurum | null> {
  const token = await tokenAl();
  if (!token) return null;
  try {
    const res = await fetch(`${CADASTRUM_API}/ai-fiyat/durum`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json() as AiDurum;
  } catch {
    return null;
  }
}

// ----- Public API -----

export interface AiAyarlari {
  saglayici: AiSaglayici;
  ollamaModel: string; // "llama3.2", "mistral", "phi3" vs
  ollamaUrl: string; // default http://localhost:11434
  geminiApiKey: string;
}

export const AI_DEFAULT: AiAyarlari = {
  // Cadastrum'un kendi backend proxy'si — Gemini 2.5 Flash + Groq fallback.
  // Kullanıcı hiçbir API key girmiyor, sıfır setup.
  saglayici: "cadastrum-proxy",
  ollamaModel: "llama3.2",
  ollamaUrl: "http://localhost:11434",
  geminiApiKey: "",
};

export async function aiTahmin(
  parsel: Parsel,
  cevre: CevreAnalizi | null,
  egim: EgimAnalizi | null,
  heuristic: FiyatTahmini,
  ayar: AiAyarlari,
  ilan: IlanBilgisi | null = null,
): Promise<AiFiyatSonucu> {
  const baslangic = Date.now();

  // Cache hit? — Aynı parsel + aynı baseline + aynı sağlayıcı
  // 24 saat TTL: kullanıcı ilanı 24 saat içinde tekrar açarsa 0 AI çağrısı, 0 maliyet.
  const cacheKey = aiCacheKey(parsel, heuristic, ayar.saglayici);
  try {
    const cached = await db.aiFiyatCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < AI_CACHE_TTL_MS) {
      return {
        ...cached.sonuc,
        // sureMs: cache'ten geldi, gerçek hesap süresi değil
        sureMs: 0,
      };
    }
  } catch (e) {
    console.debug("[arsa-ai] aiFiyatCache okuma hatası — cache atlandı:", e);
  }

  const userPrompt = promptOlustur(parsel, cevre, egim, heuristic, ilan);

  let raw: string;
  let modelAd: string;

  switch (ayar.saglayici) {
    case "cadastrum-proxy": {
      // Backend Gemini 2.5 Flash + Groq fallback. Pro/Pro+ için varsayılan.
      // Prompt backend'de oluşturuluyor — injection güvenli.
      const proxySonuc = await cadastrumProxyCagir(parsel, heuristic, cevre, egim);
      const sonucP: AiFiyatSonucu = {
        ...proxySonuc,
        kaynak: "cadastrum-proxy",
        sureMs: Date.now() - baslangic,
      };
      // Cache (UI'da hızlı tekrar)
      db.aiFiyatCache.put({ key: cacheKey, sonuc: sonucP, fetchedAt: Date.now() }).catch(() => {});
      return sonucP;
    }
    case "chrome-builtin":
      raw = await chromeAiCalistir(SYSTEM_PROMPT, userPrompt);
      modelAd = "Gemini Nano (Chrome lokal)";
      break;
    case "ollama":
      if (!ayar.ollamaModel) throw new Error("Ollama model adı boş.");
      raw = await ollamaCalistir(
        ayar.ollamaModel,
        SYSTEM_PROMPT,
        userPrompt,
        ayar.ollamaUrl,
      );
      modelAd = `Ollama ${ayar.ollamaModel}`;
      break;
    case "gemini-free":
      if (!ayar.geminiApiKey) throw new Error("Gemini API anahtarı girilmemiş.");
      raw = await geminiFreeCalistir(ayar.geminiApiKey, SYSTEM_PROMPT, userPrompt);
      modelAd = "Gemini 2.0 Flash (Google free)";
      break;
    case "yok":
    default:
      throw new Error(
        "AI sağlayıcı seçilmedi. ⚙ Ayarlar'dan birini seçin: Chrome built-in / Ollama / Gemini.",
      );
  }

  const parsed = parseAiSonuc(raw);
  const sonuc: AiFiyatSonucu = {
    ...parsed,
    kaynak: ayar.saglayici,
    modelAd,
    sureMs: Date.now() - baslangic,
  };

  // Cache'e yaz — silently fail (UI'ı bloklamasın)
  db.aiFiyatCache
    .put({ key: cacheKey, sonuc, fetchedAt: Date.now() })
    .catch(() => {});

  return sonuc;
}

export async function chromeAiDestekleniyor(): Promise<boolean> {
  const newApi = (self as { LanguageModel?: unknown }).LanguageModel;
  if (newApi) return true;
  const oldAi = (self as { ai?: { languageModel?: unknown; assistant?: unknown } }).ai;
  return !!(oldAi?.languageModel || oldAi?.assistant);
}

/**
 * AI Sanity Check — hafif prompt, sadece tahmin makul mu kontrol eder.
 *
 * Tam analiz yerine tek soru: "Bu fiyat aralığı bu bölge için makul mu?"
 * Referans veriler: il ortalaması, Milli Emlak ihale ortalaması.
 *
 * Döndürdüğü:
 *   makul: true/false
 *   sapmaYuzde: AI'ın tahmin ettiği sapma (negatif = tahmin çok yüksek)
 *   uyari: kullanıcıya gösterilecek uyarı metni (null = uyarı yok)
 */
export interface AiSanityCheckSonuc {
  makul: boolean;
  sapmaYuzde: number | null;
  uyari: string | null;
  sureMs: number;
}

export async function aiSanityCheck(
  parsel: { ilAd: string; ilceAd: string; nitelik: string; alan: number },
  tahminPerM2: number,
  referanslar: {
    ilOrtalamaPerM2?: number | null;
    milliEmlakOrtPerM2?: number | null;
    ilceStatistikPerM2?: number | null;
  },
  opts: { saglayici?: AiSaglayici } = {},
): Promise<AiSanityCheckSonuc | null> {
  // En az bir referans gerekli, aksi halde kontrol anlamsız
  const refDegerler = [
    referanslar.ilOrtalamaPerM2,
    referanslar.milliEmlakOrtPerM2,
    referanslar.ilceStatistikPerM2,
  ].filter((v): v is number => v != null && v > 0);

  if (refDegerler.length === 0) return null;

  const refOrtalama = refDegerler.reduce((s, v) => s + v, 0) / refDegerler.length;
  const sapma = ((tahminPerM2 - refOrtalama) / refOrtalama) * 100;

  // ±%50'den az sapma — AI'ya sormaya gerek yok, heuristic yeterli
  if (Math.abs(sapma) < 50) {
    return {
      makul: true,
      sapmaYuzde: Math.round(sapma),
      uyari: null,
      sureMs: 0,
    };
  }

  // Sapma büyük — AI'ya sor (eğer sağlayıcı ayarlıysa)
  const saglayici = opts.saglayici ?? "yok";
  if (saglayici === "yok") {
    // AI yok ama heuristik uyarı yap
    return {
      makul: Math.abs(sapma) < 100,
      sapmaYuzde: Math.round(sapma),
      uyari: Math.abs(sapma) >= 100
        ? `Tahmin bölge ortalamasından %${Math.round(Math.abs(sapma))} ${sapma > 0 ? "yüksek" : "düşük"} — olağandışı yüksek sapma.`
        : null,
      sureMs: 0,
    };
  }

  const baslangic = Date.now();
  const sistemPrompt = "Türkiye gayrimenkul değerleme uzmanısın. Kısa ve net yanıt ver.";
  const userPrompt = `Türkiye'de ${parsel.ilAd}/${parsel.ilceAd} bölgesinde ${parsel.nitelik} kategorisinde ${parsel.alan.toLocaleString("tr-TR")} m² arsa için hesaplanan tahmini fiyat ${tahminPerM2.toLocaleString("tr-TR")} TL/m². Bölge referans ortalaması yaklaşık ${Math.round(refOrtalama).toLocaleString("tr-TR")} TL/m² (${refDegerler.length} kaynaktan). Bu tahmin makul mu? Sadece "makul" veya "yüksek" veya "düşük" yaz, ardından kısa gerekçe (max 1 cümle).`;

  try {
    let yanit = "";

    switch (saglayici) {
      case "chrome-builtin": {
        yanit = await chromeAiCalistir(sistemPrompt, userPrompt);
        break;
      }
      case "ollama": {
        // opts.ollamaModel / ollamaUrl opsiyonel — yoksa default kullan
        const model = (opts as { ollamaModel?: string }).ollamaModel ?? "llama3.2";
        const url   = (opts as { ollamaUrl?: string }).ollamaUrl ?? "http://localhost:11434";
        yanit = await ollamaCalistir(model, sistemPrompt, userPrompt, url);
        break;
      }
      case "gemini-free": {
        const apiKey = (opts as { geminiApiKey?: string }).geminiApiKey ?? "";
        if (!apiKey) {
          // Key yok — heuristic fallback
          return {
            makul: Math.abs(sapma) < 100,
            sapmaYuzde: Math.round(sapma),
            uyari: Math.abs(sapma) >= 100
              ? `Tahmin bölge ortalamasından %${Math.round(Math.abs(sapma))} ${sapma > 0 ? "yüksek" : "düşük"}.`
              : null,
            sureMs: 0,
          };
        }
        // Gemini structured output yerine serbest metin — sanity check için daha hızlı
        const body = {
          systemInstruction: { parts: [{ text: sistemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 100 },
        };
        for (const model of ["gemini-2.0-flash", "gemini-1.5-flash-latest"] as const) {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) continue;
          const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
          const t = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (t) { yanit = t; break; }
        }
        break;
      }
      case "cadastrum-proxy": {
        // Cadastrum proxy sanity check için ayrı endpoint yok — heuristic yeterli
        return {
          makul: Math.abs(sapma) < 100,
          sapmaYuzde: Math.round(sapma),
          uyari: Math.abs(sapma) >= 100
            ? `Tahmin bölge ortalamasından %${Math.round(Math.abs(sapma))} ${sapma > 0 ? "yüksek" : "düşük"}.`
            : null,
          sureMs: 0,
        };
      }
      default:
        yanit = "";
    }

    // Yanıt parse — "makul" / "yüksek" / "düşük" başlangıcı kontrol et
    const yanitLower = yanit.toLocaleLowerCase("tr");
    let makul = true;
    if (yanitLower.startsWith("yüksek") || yanitLower.startsWith("yuksek")) makul = false;
    else if (yanitLower.startsWith("düşük") || yanitLower.startsWith("dusuk")) makul = false;

    // Yanıt boşsa (desteklenmeyen sağlayıcı edge case) heuristic sonuç ver
    if (!yanit) {
      return {
        makul: Math.abs(sapma) < 100,
        sapmaYuzde: Math.round(sapma),
        uyari: Math.abs(sapma) >= 100
          ? `Tahmin bölge ortalamasından %${Math.round(Math.abs(sapma))} ${sapma > 0 ? "yüksek" : "düşük"}.`
          : null,
        sureMs: Date.now() - baslangic,
      };
    }

    const uyari = !makul
      ? `AI analizi: tahmin ${sapma > 0 ? "yüksek" : "düşük"} görünüyor. ${yanit.split("\n")[0]?.slice(0, 100) ?? ""}`
      : null;

    return {
      makul,
      sapmaYuzde: Math.round(sapma),
      uyari,
      sureMs: Date.now() - baslangic,
    };
  } catch {
    // AI hata — heuristic sonucu döndür
    return {
      makul: Math.abs(sapma) < 100,
      sapmaYuzde: Math.round(sapma),
      uyari: Math.abs(sapma) >= 100
        ? `Tahmin bölge ortalamasından %${Math.round(Math.abs(sapma))} ${sapma > 0 ? "yüksek" : "düşük"}.`
        : null,
      sureMs: Date.now() - baslangic,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Açıklanabilir AI Değerleme — "Bu arsanın değeri neden X TL/m²?"
// ─────────────────────────────────────────────────────────────────────────────

/** Backend /v1/ai-fiyat/acikla yanıtındaki tek faktör */
export interface AciklamaFaktoru {
  ad: string;
  etki: "pozitif" | "negatif" | "nötr";
  yuzde: number;       // 1–100 etki büyüklüğü
  aciklama: string;    // kısa açıklama metni
}

/** aciklamaGetir() dönüş tipi */
export interface FiyatAciklamaSonucu {
  aciklama: string;            // 2–3 cümle Türkçe doğal dil özeti
  ozet: string;                // 1 cümle — en etkili 3 faktör
  faktorler: AciklamaFaktoru[];
  modelAd: string;
  sureMs: number;
  cached: boolean;
}

/**
 * Backend /v1/ai-fiyat/acikla endpoint'ini çağırır.
 * "Bu arsanın değeri neden X TL/m²?" sorusuna sayısal gerekçeli yanıt üretir.
 *
 * Sadece cadastrum-proxy sağlayıcısıyla çalışır (server-side Gemini key).
 * Client'tan API key çıkmaz — güvenli.
 *
 * @param parsel     TKGM parsel verisi
 * @param tahmin     Heuristic fiyat tahmini (bileşenler + güven)
 * @param cevre      OSM çevre analizi (opsiyonel — lojistik skorları için)
 * @param egim       Eğim analizi (opsiyonel)
 */
export async function aciklamaGetir(
  parsel: Parsel,
  tahmin: FiyatTahmini,
  cevre: import("./osm").CevreAnalizi | null = null,
  egim: import("./elevation").EgimAnalizi | null = null,
): Promise<FiyatAciklamaSonucu> {
  const token = await tokenAl();
  if (!token) {
    throw new Error("Cadastrum hesabınıza giriş yapın — açıklama özelliği giriş gerektiriyor.");
  }

  const parselAnahtar = `${parsel.mahalleKodu ?? "x"}-${parsel.adaNo}-${parsel.parselNo}`;

  // Çevre analizinden faktör skorlarını çıkar
  const enYakinOsb = cevre?.enYakinlar.find((y) => y.tip === "osb" || y.tip === "sanayi");
  const enYakinOtoyol = cevre?.enYakinlar.find(
    (y) => y.tip === "otoyol" || y.tip === "karayolu" || y.tip === "highway",
  );
  const enYakinHavaalani = cevre?.enYakinlar.find(
    (y) => y.tip === "havaalani" || y.tip === "airport",
  );

  const res = await fetch(`${CADASTRUM_API}/ai-fiyat/acikla`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parselAnahtar,
      beklenenPerM2: tahmin.beklenenPerM2,
      parselVeri: {
        il: parsel.ilAd ?? "",
        ilce: parsel.ilceAd ?? "",
        mahalle: parsel.mahalleAd ?? "",
        kategori: parsel.nitelik ?? "arsa",
        m2: parsel.alan,
        imarDurumu: tahmin.imarOzeti?.sinif ?? null,
        baselineTlm2: tahmin.baselineDeger ?? null,
      },
      faktorler: {
        guvenSkoru: tahmin.guvenSkoru,
        trendYuzde: null,                                  // ileride trend verisi eklenecek
        egimYuzde: egim?.ortEgimYuzde ?? null,
        osbKm: enYakinOsb ? enYakinOsb.mesafeM / 1000 : null,
        otoyolKm: enYakinOtoyol ? enYakinOtoyol.mesafeM / 1000 : null,
        havalimanKm: enYakinHavaalani ? enYakinHavaalani.mesafeM / 1000 : null,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ hata: "Sunucu hatası" })) as { hata?: string };
    if (res.status === 401) throw new Error("Oturum süresi dolmuş — yeniden giriş yapın");
    if (res.status === 403) throw new Error(err.hata ?? "Bu özellik Pro plan gerektirir");
    if (res.status === 429) throw new Error(err.hata ?? "Günlük AI kotanız doldu");
    throw new Error(err.hata ?? `Sunucu hatası (${res.status})`);
  }

  const data = await res.json() as {
    aciklama: string;
    faktorler: AciklamaFaktoru[];
    ozet: string;
    modelAd: string;
    sureMs: number;
    cached: boolean;
  };

  return {
    aciklama: data.aciklama ?? "",
    faktorler: Array.isArray(data.faktorler) ? data.faktorler : [],
    ozet: data.ozet ?? "",
    modelAd: data.modelAd ?? "bilinmiyor",
    sureMs: data.sureMs ?? 0,
    cached: data.cached ?? false,
  };
}
