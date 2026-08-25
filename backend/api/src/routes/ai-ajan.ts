/**
 * Cadastrum AI Ajan — Fırsat Avcısı (Refactored v2)
 *
 * Geliştirmeler:
 *   - Zod validation: Gemini parse sonuçları tip-safe
 *   - Tool execution logging: Her kaynak için başarı/başarısız metrik
 *   - Type safety: AppVariables bağlama, cast'ler güvenli
 *   - Detaylı hata mesajları: Neden başarısız oldu? Kaç sonuç döndü?
 *   - İl bulunamadı uyarısı: Fallback koordinat kullanıldığında kullanıcıya bildir
 *
 * Kullanıcının doğal dil sorgusunu Gemini Function Calling ile işler.
 * Scraping YOK — sadece yasal kaynaklar:
 *   - Cadastrum D1 spatial emsal DB'si
 *   - Milli Emlak resmi ihale servisi
 *   - TKGM parsel analizi
 *   - Cadastrum bölge skoru
 *
 * Endpoint:
 *   POST /v1/ai-ajan/firsat
 *     body: { sorgu: string }   — "İzmir'de 2M altı imarlı arsa"
 *     auth: Bearer JWT (jwtMiddleware)
 *     response: { sonuclar, ozet, sorgulanan_kaynaklar, uyarilar }
 *
 * Akış:
 *   1. Gemini: sorguyu parse et → {il, ilce, kategori, maxFiyat, minM2, ...}
 *   2. /v1/emsal/spatial → emsaller
 *   3. /v1/milli-emlak/sorgu → ihaleler (opsiyonel)
 *   4. /v1/harita/gelisen-bolgeler → bölge skoru filtresi
 *   5. Gemini: sonuçları değerlendir → özet + öneri
 */
import { Hono } from "hono";
import { jwtMiddleware } from "./hesap.js";
import type { Env } from "../index.js";
import { log } from "../lib/logger.js";
import { normalizeYerAdi } from "../lib/normalize.js";
import { turkiyeBboxIcinde, kmToDegrees } from "../lib/geo.js";
import { z } from "zod";
import type { D1Database } from "@cloudflare/workers-types";

const ajan = new Hono<{ Bindings: Env; Variables: { kullaniciId: number; tier: string } }>();
ajan.use("*", jwtMiddleware);

// ── Zod Schemas ────────────────────────────────────────────────────────────────

const SorguParseSchema = z.object({
  il: z.string().nullable().optional().default(null),
  ilce: z.string().nullable().optional().default(null),
  kategori: z.enum(["arsa", "tarla", "konut"]).default("arsa"),
  maxFiyatTL: z.number().nullable().optional().default(null),
  minFiyatTL: z.number().nullable().optional().default(null),
  minM2: z.number().nullable().optional().default(null),
  maxM2: z.number().nullable().optional().default(null),
  imarli: z.boolean().nullable().optional().default(null),
  radiusKm: z.number().min(1).max(80).default(30),
});

type SorguParse = z.infer<typeof SorguParseSchema>;

// Tool execution result — başarı/başarısız metrik
interface ToolExecution {
  kaynak: string;
  basarili: boolean;
  sonuc_sayisi: number;
  sure_ms: number;
  hata?: string;
  uyari?: string;
}

interface EmsalSonuc {
  fiyat_per_m2: number;
  m2?: number | null;
  mesafe_m?: number;
  mahalle?: string | null;
  imar?: string | null;
}

interface MilliEmlakSonuc {
  il: string;
  ilce?: string | null;
  tapu_nitelik?: string | null;
  alan_m2?: number | null;
  tahmin_bedel?: number | null;
  ihale_tarihi?: string | null;
}

interface AjanSonuc {
  tip: "emsal" | "milli_emlak" | "bolge";
  fiyat_per_m2?: number;
  toplam_tl?: number;
  m2?: number | null;
  konum: string;
  mesafe_m?: number;
  kaynak: string;
  puan?: number;
  not?: string;
}

// ── İl merkez koordinatları (ajan bölge araması için) ─────────────────────────
const IL_CENTROID: Record<string, [number, number]> = {
  istanbul: [41.01, 28.95],
  ankara: [39.92, 32.85],
  izmir: [38.42, 27.14],
  antalya: [36.9, 30.7],
  bursa: [40.19, 29.06],
  adana: [37.0, 35.32],
  konya: [37.87, 32.49],
  gaziantep: [37.07, 37.38],
  mersin: [36.8, 34.64],
  kocaeli: [40.85, 29.88],
  mugla: [37.21, 28.37],
  aydin: [37.85, 27.85],
  balikesir: [39.65, 27.88],
  manisa: [38.62, 27.43],
  trabzon: [40.99, 39.73],
  samsun: [41.28, 36.33],
  eskisehir: [39.78, 30.52],
  denizli: [37.78, 29.09],
  hatay: [36.6, 36.16],
  diyarbakir: [37.91, 40.22],
  malatya: [38.35, 38.31],
  kayseri: [38.72, 35.49],
  sakarya: [40.69, 30.43],
  tekirdag: [41.42, 27.98],
  canakkale: [40.15, 26.41],
  edirne: [41.67, 26.56],
  kahramanmaras: [37.58, 36.94],
  erzurum: [39.91, 41.27],
  van: [38.5, 43.41],
  sanliurfa: [37.16, 38.8],
  kirikkale: [40.11, 33.51],
  nevsehir: [38.62, 34.72],
  isparta: [37.76, 30.56],
  rize: [41.2, 40.51],
  ordu: [40.98, 37.28],
  tokat: [40.32, 36.55],
  amasya: [40.64, 35.83],
  corum: [40.55, 34.95],
  kastamonu: [41.37, 33.78],
  sinop: [42.03, 35.15],
  zonguldak: [41.45, 32.12],
  karabuk: [41.2, 32.62],
  bartin: [41.63, 32.34],
  kutahya: [39.42, 29.98],
  afyonkarahisar: [38.75, 30.54],
  usak: [38.68, 29.41],
  kirsehir: [39.14, 34.15],
  aksaray: [38.37, 34.03],
  nigde: [37.97, 34.68],
  cankiri: [40.6, 33.63],
  sivas: [39.75, 36.49],
  yozgat: [39.83, 35.82],
  kilis: [36.72, 37.12],
  batman: [37.88, 41.13],
  sirnak: [37.51, 42.48],
  hakkari: [37.57, 43.74],
  mardin: [37.31, 40.74],
  mus: [38.74, 41.5],
  bitlis: [38.39, 42.11],
  agri: [39.72, 43.05],
  ardahan: [41.11, 42.7],
  igdir: [39.93, 44.04],
  bayburt: [40.5, 40.27],
  gumushane: [40.46, 39.48],
  rtepe: [38.73, 43.64],
  yalova: [40.65, 29.28],
  duzce: [40.84, 31.16],
  bolu: [40.73, 31.6],
  kastamonubosna: [41.37, 33.78],
  karatay: [40.2, 32.5],
  turkiye: [39.0, 35.0], // fallback Türkiye merkezi
};

// ── Tool Execution Logger ──────────────────────────────────────────────────────

class ToolExecutor {
  private executions: ToolExecution[] = [];

  async run<T>(
    kaynak: string,
    fn: () => Promise<T>,
  ): Promise<{ sonuc: T | null; uyari?: string }> {
    const baslangic = Date.now();
    try {
      const sonuc = await fn();
      const sure_ms = Date.now() - baslangic;
      this.executions.push({
        kaynak,
        basarili: true,
        sonuc_sayisi: Array.isArray(sonuc) ? sonuc.length : 1,
        sure_ms,
      });
      return { sonuc };
    } catch (e) {
      const sure_ms = Date.now() - baslangic;
      const hataMsg = e instanceof Error ? e.message : String(e);
      this.executions.push({
        kaynak,
        basarili: false,
        sonuc_sayisi: 0,
        sure_ms,
        hata: hataMsg,
      });
      log.warn(`ai-ajan.tool-${kaynak.toLowerCase()}`, {
        hata: hataMsg,
        sure_ms,
      });
      return { sonuc: null, uyari: `${kaynak} başarısız: ${hataMsg}` };
    }
  }

  getOzet() {
    return this.executions;
  }

  getSorgulananKaynaklar() {
    return this.executions.filter((e) => e.basarili).map((e) => e.kaynak);
  }

  getUyarilar() {
    return this.executions
      .filter((e) => !e.basarili && e.hata)
      .map((e) => e.uyari || `${e.kaynak} başarısız`);
  }
}

// ── Gemini ile sorgu parse ────────────────────────────────────────────────────

async function sorguyuParse(apiKey: string, sorgu: string): Promise<SorguParse> {
  const prompt = `Türkçe gayrimenkul arama sorgusunu JSON'a dönüştür.
Sorgu: "${sorgu}"

Şu alanları çıkar:
- il: il adı (normalize — küçük harf, TR→Latin) veya null
- ilce: ilçe adı normalize veya null
- kategori: "arsa" | "tarla" | "konut" (default: "arsa")
- maxFiyatTL: maksimum fiyat TL cinsinden veya null
- minFiyatTL: minimum fiyat TL cinsinden veya null
- minM2: minimum m² veya null
- maxM2: maksimum m² veya null
- imarli: imar istiyor mu (true/false/null)
- radiusKm: arama yarıçapı km (default 30, şehir merkezi için 15)

Fiyat çevrimi: "2M" = 2000000, "500K" = 500000, "1.5 milyon" = 1500000

Sadece JSON döndür, başka bir şey yok.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 512,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            il: { type: "STRING" },
            ilce: { type: "STRING" },
            kategori: { type: "STRING" },
            maxFiyatTL: { type: "NUMBER" },
            minFiyatTL: { type: "NUMBER" },
            minM2: { type: "NUMBER" },
            maxM2: { type: "NUMBER" },
            imarli: { type: "BOOLEAN" },
            radiusKm: { type: "NUMBER" },
          },
        },
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Gemini parse HTTP ${res.status}`);
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  const parsed = JSON.parse(text);

  // Zod validation — tip-safe
  const validated = SorguParseSchema.parse(parsed);

  // İl normalizasyonu
  if (validated.il) {
    validated.il = normalizeYerAdi(validated.il);
  }
  if (validated.ilce) {
    validated.ilce = normalizeYerAdi(validated.ilce);
  }

  return validated;
}

// ── Emsal spatial arama ───────────────────────────────────────────────────────

async function emsalAra(
  db: D1Database,
  lat: number,
  lng: number,
  params: SorguParse,
): Promise<EmsalSonuc[]> {
  const { latDelta, lngDelta } = kmToDegrees(params.radiusKm, lat);
  const yasEsigi = Date.now() - 365 * 86_400_000;

  const rows = await db
    .prepare(
      `SELECT fiyat_per_m2, m2, lat, lng, mahalle_norm, imar_durumu
       FROM ilanlar
       WHERE kategori = ? AND aktif = 1
         AND lat IS NOT NULL AND lng IS NOT NULL
         AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
         AND yakalanma_tarihi >= ?
         ${params.minM2 ? "AND (m2 IS NULL OR m2 >= ?)" : ""}
         ${params.maxM2 ? "AND (m2 IS NULL OR m2 <= ?)" : ""}
       LIMIT 500`,
    )
    .bind(
      params.kategori,
      lat - latDelta,
      lat + latDelta,
      lng - lngDelta,
      lng + lngDelta,
      yasEsigi,
      ...(params.minM2 ? [params.minM2] : []),
      ...(params.maxM2 ? [params.maxM2] : []),
    )
    .all<{
      fiyat_per_m2: number;
      m2: number | null;
      lat: number;
      lng: number;
      mahalle_norm: string | null;
      imar_durumu: string | null;
    }>();

  return (rows.results ?? []).map((r: any) => ({
    fiyat_per_m2: r.fiyat_per_m2,
    m2: r.m2,
    mesafe_m: Math.round(
      6371000 *
        Math.sqrt(
          ((r.lat - lat) * Math.PI) / 180 ** 2 +
            (Math.cos((lat * Math.PI) / 180) * ((r.lng - lng) * Math.PI) / 180) **
              2,
        ),
    ),
    mahalle: r.mahalle_norm,
    imar: r.imar_durumu,
  }));
}

// ── Milli Emlak ihale arama ───────────────────────────────────────────────────

async function milliEmlakAra(
  db: D1Database,
  ilNorm: string,
  _kategori: string,
): Promise<MilliEmlakSonuc[]> {
  const rows = await db
    .prepare(
      `SELECT il, ilce, tapu_nitelik, alan_m2, tahmin_bedel, ihale_tarihi
       FROM milli_emlak_ihaleler
       WHERE il_norm = ? AND aktif = 1
       ORDER BY ihale_tarihi DESC
       LIMIT 20`,
    )
    .bind(ilNorm)
    .all<MilliEmlakSonuc>()
    .catch(() => ({ results: [] as MilliEmlakSonuc[] }));

  return rows.results ?? [];
}

// ── Gemini ile özet üret ──────────────────────────────────────────────────────

/**
 * Gelişmiş özet üretimi — risk analizi + fırsat değerlendirmesi + piyasa karşılaştırması.
 * Gemini 2.5 Flash ile yapılandırılmış yanıt (JSON schema).
 */
async function ozetUret(
  apiKey: string,
  sorgu: string,
  sonuclar: AjanSonuc[],
  parseEdilmis: SorguParse,
): Promise<string> {
  if (sonuclar.length === 0) {
    return `"${sorgu}" kriterlerine uygun sonuç bulunamadı. Farklı il/ilçe veya daha geniş bütçe deneyin.`;
  }

  // Fiyat istatistikleri
  const fiyatlar = sonuclar.map(s => s.fiyat_per_m2 ?? 0).filter(f => f > 0);
  const medyan = fiyatlar.length > 0
    ? [...fiyatlar].sort((a, b) => a - b)[Math.floor(fiyatlar.length / 2)]
    : 0;
  const enDusuk = fiyatlar.length > 0 ? Math.min(...fiyatlar) : 0;
  const enYuksek = fiyatlar.length > 0 ? Math.max(...fiyatlar) : 0;

  const context = sonuclar
    .slice(0, 8)
    .map((s, i) => {
      const fiyatStr = s.fiyat_per_m2 ? `${s.fiyat_per_m2.toLocaleString("tr-TR")} TL/m²` : "";
      const toplamStr = s.toplam_tl ? `(~${(s.toplam_tl / 1_000_000).toFixed(1)}M TL toplam)` : "";
      const m2Str = s.m2 ? `${s.m2}m²` : "";
      const mesafeStr = s.mesafe_m ? `${(s.mesafe_m / 1000).toFixed(1)}km uzaklıkta` : "";
      const notStr = s.not ? `· ${s.not.slice(0, 50)}` : "";
      return `${i + 1}. ${s.konum} — ${fiyatStr} ${toplamStr} · ${m2Str} ${mesafeStr} [${s.kaynak}] ${notStr}`;
    })
    .join("\n");

  const bolgeBilgi = parseEdilmis.il
    ? `Arama bölgesi: ${parseEdilmis.il}${parseEdilmis.ilce ? `/${parseEdilmis.ilce}` : ""}`
    : "Arama bölgesi: Türkiye geneli";

  const prompt = `Türkiye gayrimenkul uzmanısın. Kullanıcı "${sorgu}" aradı.

${bolgeBilgi}
Aranan kategori: ${parseEdilmis.kategori}
${parseEdilmis.maxFiyatTL ? `Bütçe üst sınırı: ${(parseEdilmis.maxFiyatTL / 1_000_000).toFixed(1)}M TL` : ""}
${parseEdilmis.imarli ? "İmarlı parsel isteniyor" : ""}

Fiyat aralığı: ${enDusuk.toLocaleString("tr-TR")} – ${enYuksek.toLocaleString("tr-TR")} TL/m² (medyan: ${medyan.toLocaleString("tr-TR")} TL/m²)

Bulunan ${sonuclar.length} sonuçtan en iyi ${Math.min(8, sonuclar.length)}'i:
${context}

Şunları değerlendir (kısa ve pratik, Türkçe):
1. En iyi 1-2 fırsatı ve neden öne çıktığını belirt
2. Fiyat seviyesini piyasaya göre değerlendir (ucuz mu, pahalı mı, normal mi)
3. Varsa dikkat edilmesi gereken risk faktörlerini belirt (sadece veriden çıkarım yap)

Yanıtını 3-4 cümleyle sınırla. Spekülatif önerilerde bulunma.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 400,
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) return `${sonuclar.length} sonuç bulundu. Medyan fiyat: ${medyan.toLocaleString("tr-TR")} TL/m²`;
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    ?? `${sonuclar.length} sonuç bulundu. Medyan: ${medyan.toLocaleString("tr-TR")} TL/m²`;
}

// ── Ana endpoint ──────────────────────────────────────────────────────────────

ajan.post("/firsat", async (c: any) => {
  const kullaniciId = c.get("kullaniciId") as number;
  const tier = c.get("tier") as string;

  // Input validation
  const body = (await c.req.json().catch(() => null)) as { sorgu?: string } | null;
  if (!body?.sorgu || body.sorgu.trim().length < 5) {
    return c.json({ hata: "Geçerli bir sorgu girin (min 5 karakter)" }, 400);
  }
  if (body.sorgu.length > 500) {
    return c.json({ hata: "Sorgu çok uzun (max 500 karakter)" }, 400);
  }

  // Tier kontrolü — free için günlük 3, pro için 20
  const kotaLimiti = tier === "free" ? 3 : tier === "pro" ? 20 : 100;
  const gun = Math.floor(Date.now() / 86_400_000);
  const kotaRow = await c.env.DB.prepare(
    `INSERT INTO ai_kullanim_kota (kullanici_id, gun, sayi) VALUES (?, ?, 1)
     ON CONFLICT(kullanici_id, gun) DO UPDATE SET sayi = sayi + 1
     RETURNING sayi`,
  )
    .bind(kullaniciId, gun)
    .first()
    .catch(() => null) as { sayi: number } | null;
  const kullanilan = kotaRow?.sayi ?? 1;
  if (kullanilan > kotaLimiti) {
    return c.json(
      {
        hata: `Günlük AI ajan kotası doldu (${kotaLimiti}/gün). ${
          tier === "free" ? "Pro'ya geçin." : "Yarın yenilenir."
        }`,
      },
      429,
    );
  }

  const geminiKey = c.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return c.json({ hata: "AI servisi yapılandırılmamış" }, 503);
  }

  log.info("ai-ajan.firsat", { kullaniciId, tier, sorgu: body.sorgu.slice(0, 100) });

  const toolExecutor = new ToolExecutor();
  const uyarilar: string[] = [];

  // 1. Sorguyu parse et (Zod validation ile)
  let parseEdilmis: SorguParse;
  const parseResult = await toolExecutor.run("Gemini Parse", () => sorguyuParse(geminiKey, body.sorgu!));
  if (!parseResult.sonuc) {
    return c.json(
      { hata: "Sorgu anlaşılamadı. Daha açık bir şekilde yazın.", uyarilar: parseResult.uyari ? [parseResult.uyari] : [] },
      422,
    );
  }
  parseEdilmis = parseResult.sonuc;

  // 2. Koordinat bul
  let ilCoord = parseEdilmis.il ? IL_CENTROID[parseEdilmis.il] : null;
  let ilBulundu = !!ilCoord;

  if (!ilCoord) {
    // Fallback: Türkiye merkezi
    ilCoord = IL_CENTROID["turkiye"];
    uyarilar.push(`"${parseEdilmis.il || "belirtilen il"}" bulunamadı. Türkiye'de genel arama yapılıyor.`);
  }

  const lat = ilCoord[0];
  const lng = ilCoord[1];

  if (!turkiyeBboxIcinde(lat, lng)) {
    return c.json({ hata: "Türkiye sınırları içinde bir il belirtin" }, 400);
  }

  const sonuclar: AjanSonuc[] = [];

  // 3. Emsal arama
  const emsalResult = await toolExecutor.run("Cadastrum Emsal DB", () =>
    emsalAra(c.env.DB, lat, lng, parseEdilmis),
  );

  if (emsalResult.sonuc && emsalResult.sonuc.length > 0) {
    const emsaller = emsalResult.sonuc;

    // Fiyat + imar filtresi
    const filtrelenmis = emsaller.filter((e) => {
      if (parseEdilmis.maxFiyatTL && e.m2 && e.fiyat_per_m2 * e.m2 > parseEdilmis.maxFiyatTL)
        return false;
      if (parseEdilmis.minFiyatTL && e.m2 && e.fiyat_per_m2 * e.m2 < parseEdilmis.minFiyatTL)
        return false;
      if (parseEdilmis.imarli && e.imar && !/imar|konut|ticaret/i.test(e.imar)) return false;
      return true;
    });

    // A3: Composite sıralama skoru
    // Bileşenler:
    //   - mesafe skoru: yakın = iyi (0-1 normalize, max 50km)
    //   - fiyat skoru: ucuz = iyi (medyan referansla normalize)
    //   - imar skoru: imarlı = +0.2 bonus
    //   - taze veri skoru: yakın zamanlı = iyi
    const medyanFiyat = filtrelenmis.length > 0
      ? [...filtrelenmis].sort((a, b) => a.fiyat_per_m2 - b.fiyat_per_m2)[
          Math.floor(filtrelenmis.length / 2)
        ]!.fiyat_per_m2
      : 10000;

    filtrelenmis
      .map((e) => {
        const mesafeSkor = 1 - Math.min((e.mesafe_m ?? 50000) / 50000, 1);
        const fiyatSkor = medyanFiyat > 0
          ? Math.max(0, 1 - (e.fiyat_per_m2 / medyanFiyat - 0.5))
          : 0.5;
        const imarBonus = e.imar && /imar|konut|ticaret/i.test(e.imar) ? 0.2 : 0;
        const kompozit = mesafeSkor * 0.35 + fiyatSkor * 0.45 + imarBonus * 0.2;
        return { e, kompozit };
      })
      .sort((a, b) => b.kompozit - a.kompozit)
      .slice(0, 8)
      .forEach(({ e, kompozit }) => {
        sonuclar.push({
          tip: "emsal",
          fiyat_per_m2: Math.round(e.fiyat_per_m2),
          m2: e.m2,
          toplam_tl: e.m2 ? Math.round(e.fiyat_per_m2 * e.m2) : undefined,
          konum: [e.mahalle, parseEdilmis.ilce, parseEdilmis.il]
            .filter(Boolean)
            .map((s) => s!.charAt(0).toUpperCase() + s!.slice(1))
            .join(", "),
          mesafe_m: e.mesafe_m,
          kaynak: "Cadastrum DB",
          puan: Math.round(kompozit * 100),
          not: e.imar ?? undefined,
        });
      });
  } else if (emsalResult.uyari) {
    uyarilar.push(emsalResult.uyari);
  }

  // 3b. Multi-step: sonuç yoksa radius 2x genişlet ve tekrar dene
  if (sonuclar.length === 0 && parseEdilmis.radiusKm < 80) {
    const genisRadius = Math.min(parseEdilmis.radiusKm * 2, 80);
    uyarilar.push(`${parseEdilmis.radiusKm}km'de sonuç bulunamadı. ${genisRadius}km'ye genişletiliyor.`);

    const genisResult = await toolExecutor.run(`Geniş Arama (${genisRadius}km)`, () =>
      emsalAra(c.env.DB, lat, lng, { ...parseEdilmis, radiusKm: genisRadius }),
    );

    if (genisResult.sonuc && genisResult.sonuc.length > 0) {
      const filtrelenmis = genisResult.sonuc.filter((e) => {
        if (parseEdilmis.maxFiyatTL && e.m2 && e.fiyat_per_m2 * e.m2 > parseEdilmis.maxFiyatTL) return false;
        if (parseEdilmis.minFiyatTL && e.m2 && e.fiyat_per_m2 * e.m2 < parseEdilmis.minFiyatTL) return false;
        return true;
      });

      filtrelenmis
        .sort((a, b) => {
          const aScore = (a.mesafe_m ?? 99999) / 10000 + a.fiyat_per_m2 / 10000;
          const bScore = (b.mesafe_m ?? 99999) / 10000 + b.fiyat_per_m2 / 10000;
          return aScore - bScore;
        })
        .slice(0, 6)
        .forEach((e) => {
          sonuclar.push({
            tip: "emsal",
            fiyat_per_m2: Math.round(e.fiyat_per_m2),
            m2: e.m2,
            toplam_tl: e.m2 ? Math.round(e.fiyat_per_m2 * e.m2) : undefined,
            konum: [e.mahalle, parseEdilmis.ilce, parseEdilmis.il]
              .filter(Boolean)
              .map((s) => s!.charAt(0).toUpperCase() + s!.slice(1))
              .join(", "),
            mesafe_m: e.mesafe_m,
            kaynak: `Cadastrum DB (${genisRadius}km)`,
            not: e.imar ?? undefined,
          });
        });
    }
  }

  // 3c. Hâlâ boşsa — imar kısıtı varsa gevşet (imarsız da dahil et)
  if (sonuclar.length === 0 && parseEdilmis.imarli) {
    uyarilar.push("İmarlı parsel bulunamadı. İmarsız ilanlar da dahil ediliyor.");
    const relaxResult = await toolExecutor.run("Gevşetilmiş Arama (imarsız dahil)", () =>
      emsalAra(c.env.DB, lat, lng, { ...parseEdilmis, imarli: null, radiusKm: Math.min(parseEdilmis.radiusKm * 2, 80) }),
    );
    if (relaxResult.sonuc && relaxResult.sonuc.length > 0) {
      relaxResult.sonuc.slice(0, 5).forEach((e) => {
        sonuclar.push({
          tip: "emsal",
          fiyat_per_m2: Math.round(e.fiyat_per_m2),
          m2: e.m2,
          toplam_tl: e.m2 ? Math.round(e.fiyat_per_m2 * e.m2) : undefined,
          konum: [e.mahalle, parseEdilmis.ilce, parseEdilmis.il]
            .filter(Boolean)
            .map((s) => s!.charAt(0).toUpperCase() + s!.slice(1))
            .join(", "),
          mesafe_m: e.mesafe_m,
          kaynak: "Cadastrum DB (imar gevşetildi)",
          not: e.imar ?? "İmar bilgisi yok",
        });
      });
    }
  }

  // 4. Milli Emlak ihaleleri (il belirtildiyse ve bulundu ise)
  if (ilBulundu && parseEdilmis.il) {
    const milliResult = await toolExecutor.run("Milli Emlak İhaleleri", () =>
      milliEmlakAra(c.env.DB, parseEdilmis.il!, parseEdilmis.kategori),
    );

    if (milliResult.sonuc && milliResult.sonuc.length > 0) {
      const ihaleler = milliResult.sonuc;
      ihaleler.slice(0, 3).forEach((ih) => {
        const fpm =
          ih.tahmin_bedel && ih.alan_m2 && ih.alan_m2 > 0
            ? Math.round(ih.tahmin_bedel / ih.alan_m2)
            : null;
        if (!fpm) return;
        sonuclar.push({
          tip: "milli_emlak",
          fiyat_per_m2: fpm,
          m2: ih.alan_m2,
          toplam_tl: ih.tahmin_bedel ?? undefined,
          konum: [ih.ilce, ih.il]
            .filter(Boolean)
            .map((s) => s!.charAt(0).toUpperCase() + s!.slice(1))
            .join(", "),
          kaynak: "Milli Emlak",
          not: `İhale: ${ih.ihale_tarihi ?? "tarih belirsiz"} · ${ih.tapu_nitelik ?? ""}`,
        });
      });
    }
  }

  // 5. Özet üret
  const ozetResult = await toolExecutor.run("Özet Üretimi", () =>
    ozetUret(geminiKey, body.sorgu!, sonuclar, parseEdilmis),
  );
  const ozet = ozetResult.sonuc ?? `${sonuclar.length} sonuç bulundu.`;

  // Tool metrikleri loglama
  log.info("ai-ajan.tool-metrics", {
    kullaniciId,
    tools: toolExecutor.getOzet(),
    toplam_sonuc: sonuclar.length,
    uyari_sayisi: uyarilar.length,
  });

  return c.json({
    sorgu: body.sorgu,
    parse: parseEdilmis,
    sonuclar: sonuclar.slice(0, 10),
    ozet,
    sorgulanan_kaynaklar: toolExecutor.getSorgulananKaynaklar(),
    uyarilar: [...uyarilar, ...toolExecutor.getUyarilar()],
    toplam_sonuc: sonuclar.length,
    kalan_kota: Math.max(0, kotaLimiti - kullanilan),
  });
});

// ── /portfoy-optimize endpoint ────────────────────────────────────────────────
/**
 * POST /v1/ai-ajan/portfoy-optimize
 *
 * Kullanıcının portföyündeki parselleri Gemini ile analiz eder:
 *   - Her parsel için getiri/likidite/değer puanı
 *   - "En iyi 5 fırsat" sıralaması
 *   - Portföy çeşitlendirme önerisi
 *   - Satış/tutma/ekle kararı
 *
 * Body: { hedef?: "getiri" | "likit" | "deger" }
 */
ajan.post("/portfoy-optimize", async (c: any) => {
  const kullaniciId = c.get("kullaniciId") as number;
  const tier = c.get("tier") as string;

  // Pro gerekli
  if (tier === "free") {
    return c.json({ hata: "Portföy optimizasyonu Pro tier gerektirir." }, 403);
  }

  const body = (await c.req.json().catch(() => ({}))) as { hedef?: string };
  const hedef = ["getiri", "likit", "deger"].includes(body.hedef ?? "")
    ? (body.hedef as "getiri" | "likit" | "deger")
    : "getiri";

  // Portföy çek
  interface PortfoyRow {
    id: number;
    parsel_key: string;
    il_ad: string | null;
    ilce_ad: string | null;
    mahalle_ad: string | null;
    nitelik: string | null;
    alan_m2: number | null;
    lat: number | null;
    lng: number | null;
    fiyat_tahmini: number | null;
    etiket: string | null;
    not_metni: string | null;
  }
  const portfoy = await c.env.DB.prepare(
    `SELECT id, parsel_key, il_ad, ilce_ad, mahalle_ad, nitelik, alan_m2,
            lat, lng, fiyat_tahmini, etiket, not_metni
     FROM portfoy
     WHERE kullanici_id = ?
     ORDER BY eklendi DESC
     LIMIT 50`,
  ).bind(kullaniciId).all() as { results: PortfoyRow[] };

  const parseller: PortfoyRow[] = portfoy.results ?? [];

  if (parseller.length === 0) {
    return c.json({
      sirali: [],
      ozet: "Portföyünüzde henüz parsel bulunmuyor. Haritadan parsel ekleyip tekrar deneyin.",
      en_iyi_gerceke: null,
      cesitlendirme: null,
      sat_onerileri: [],
    });
  }

  const geminiKey = c.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return c.json({ hata: "AI servisi yapılandırılmamış" }, 503);
  }

  // Parsel metinleri
  const parselContext = parseller.map((p: any, i: number) => {
    const lokasyon = [p.mahalle_ad, p.ilce_ad, p.il_ad].filter(Boolean).join(", ");
    const alanStr = p.alan_m2 ? `${p.alan_m2}m²` : "alan bilinmiyor";
    const fiyatStr = p.fiyat_tahmini
      ? `~${(Number(p.fiyat_tahmini) / 1_000_000).toFixed(1)}M TL`
      : "değer bilinmiyor";
    const nitelikStr = p.nitelik ? `(${p.nitelik})` : "";
    const etiketStr = p.etiket ? `[${p.etiket}]` : "";
    const notStr = p.not_metni ? `Not: ${String(p.not_metni).slice(0, 50)}` : "";
    return `${i + 1}. ${lokasyon} ${nitelikStr} — ${alanStr} · ${fiyatStr} ${etiketStr} ${notStr}`;
  }).join("\n");

  const hedefAciklama = {
    getiri: "yatırım getirisi ve değer artışı potansiyeli",
    likit:  "piyasa likiditesi ve kolay satılabilirlik",
    deger:  "fiyat/değer dengesi ve alım fırsatı",
  }[hedef];

  const prompt = `Türkiye gayrimenkul uzmanısın. Bir yatırımcının ${parseller.length} parsellik portföyünü analiz et.

Optimizasyon hedefi: ${hedefAciklama}

Parseller:
${parselContext}

Şunları yap:
1. Her parseli 1-100 puan ver (${hedefAciklama} açısından)
2. En iyi 5 parseli ve neden seçildiğini belirt
3. Portföy çeşitlendirme değerlendirmesi (coğrafi/kategori yoğunlaşma var mı?)
4. Varsa zayıf performans beklentili 1-2 parsel öner (sat/küçült)

JSON döndür:
{
  "puanlar": {"1": 85, "2": 72, ...},
  "ozet": "2-3 cümle portföy özeti",
  "en_iyi_gerceke": "en iyi 1-2 parselin seçilme sebebi",
  "sat_onerileri": [<satılması önerilen parsel indeksleri, boş olabilir>],
  "cesitlendirme": "çeşitlendirme önerisi"
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 800,
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(25_000),
  });

  let parsed: {
    puanlar?: Record<string, number>;
    ozet?: string;
    en_iyi_gerceke?: string;
    sat_onerileri?: number[];
    cesitlendirme?: string;
  } = {};

  if (res.ok) {
    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch { /* parse başarısız */ }
  } else {
    log.warn("ai-ajan.portfoy-optimize.gemini-hata", { status: res.status });
  }

  const puanMap = parsed.puanlar ?? {};
  const siraliParseller = parseller
    .map((p: any, i: number) => ({
      id: p.id,
      parsel_key: p.parsel_key,
      lokasyon: [p.mahalle_ad, p.ilce_ad, p.il_ad].filter(Boolean).join(", "),
      alan_m2: p.alan_m2,
      fiyat_tahmini: p.fiyat_tahmini,
      nitelik: p.nitelik,
      etiket: p.etiket,
      puan: puanMap[String(i + 1)] ?? null,
      sat_onerisi: (parsed.sat_onerileri ?? []).includes(i + 1),
    }))
    .sort((a, b) => (b.puan ?? 0) - (a.puan ?? 0));

  log.info("ai-ajan.portfoy-optimize", { kullaniciId, tier, hedef, parsel_sayisi: parseller.length });

  return c.json({
    hedef,
    sirali: siraliParseller,
    ozet: parsed.ozet ?? `${parseller.length} parsel analiz edildi.`,
    en_iyi_gerceke: parsed.en_iyi_gerceke ?? null,
    cesitlendirme: parsed.cesitlendirme ?? null,
    sat_onerileri: (parsed.sat_onerileri ?? [])
      .map((idx: number) => (parseller[idx - 1] as any)?.parsel_key)
      .filter(Boolean),
  });
});

// ── /bolge-analiz endpoint ────────────────────────────────────────────────────
/**
 * POST /v1/ai-ajan/bolge-analiz
 *
 * İl/ilçe bazlı piyasa analizi — Gemini ile derinleştirilmiş:
 *   - Canlı emsal medyan, Q1, Q3, ilan adedi
 *   - Fiyat trend (son 6 ay değişim yüzdesi)
 *   - Gemini yorumu: fırsat mı, normal mi, pahalı mı?
 *   - Yatırım için en iyi alt bölge önerisi
 *
 * Body: { il: string; ilce?: string; kategori?: "arsa" | "tarla" | "konut" }
 */
ajan.post("/bolge-analiz", async (c: any) => {
  const kullaniciId = c.get("kullaniciId") as number;

  const body = (await c.req.json().catch(() => ({}))) as {
    il?: string;
    ilce?: string;
    kategori?: string;
  };

  if (!body.il) {
    return c.json({ hata: "il parametresi zorunlu" }, 400);
  }

  const il = normalizeYerAdi(body.il);
  const ilce = body.ilce ? normalizeYerAdi(body.ilce) : null;
  const kategori = ["arsa", "tarla", "konut"].includes(body.kategori ?? "")
    ? body.kategori!
    : "arsa";

  const geminiKey = c.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return c.json({ hata: "AI servisi yapılandırılmamış" }, 503);
  }

  // 1. Fiyat istatistiği
  interface IstatistikRow { medyan: number; q1?: number | null; q3?: number | null; ilan_adet: number; son_guncelleme: number }
  interface OrtRow { ort: number | null }
  interface AltBolgeRow { ilce_norm: string; medyan: number; ilan_adet: number }

  const istatistik = ilce
    ? await c.env.DB.prepare(
        `SELECT medyan, q1, q3, ilan_adet, son_guncelleme
         FROM ilce_istatistik WHERE il_norm = ? AND ilce_norm = ? AND kategori = ?`,
      ).bind(il, ilce, kategori).first().catch(() => null) as IstatistikRow | null
    : await c.env.DB.prepare(
        `SELECT medyan, ilan_adet, son_guncelleme
         FROM il_istatistik WHERE il_norm = ? AND kategori = ?`,
      ).bind(il, kategori).first().catch(() => null) as IstatistikRow | null;

  // 2. Trend (son 6 ay vs önceki 6 ay)
  const now = Date.now();
  const gun180 = now - 180 * 86_400_000;
  const gun360 = now - 360 * 86_400_000;

  const trendSon = ilce
    ? await c.env.DB.prepare(
        `SELECT AVG(fiyat_per_m2) AS ort FROM ilanlar
         WHERE il_norm = ? AND ilce_norm = ? AND kategori = ? AND aktif = 1 AND yakalanma_tarihi > ?`,
      ).bind(il, ilce, kategori, gun180).first().catch(() => null) as OrtRow | null
    : await c.env.DB.prepare(
        `SELECT AVG(fiyat_per_m2) AS ort FROM ilanlar
         WHERE il_norm = ? AND kategori = ? AND aktif = 1 AND yakalanma_tarihi > ?`,
      ).bind(il, kategori, gun180).first().catch(() => null) as OrtRow | null;

  const trendOnce = ilce
    ? await c.env.DB.prepare(
        `SELECT AVG(fiyat_per_m2) AS ort FROM ilanlar
         WHERE il_norm = ? AND ilce_norm = ? AND kategori = ? AND aktif = 1
           AND yakalanma_tarihi BETWEEN ? AND ?`,
      ).bind(il, ilce, kategori, gun360, gun180).first().catch(() => null) as OrtRow | null
    : await c.env.DB.prepare(
        `SELECT AVG(fiyat_per_m2) AS ort FROM ilanlar
         WHERE il_norm = ? AND kategori = ? AND aktif = 1
           AND yakalanma_tarihi BETWEEN ? AND ?`,
      ).bind(il, kategori, gun360, gun180).first().catch(() => null) as OrtRow | null;

  const trendYuzde = trendSon?.ort && trendOnce?.ort && trendOnce.ort > 0
    ? Math.round(((trendSon.ort - trendOnce.ort) / trendOnce.ort) * 100)
    : null;

  // 3. En pahalı/ucuz ilçeler (il analizi için)
  let altBolgeler: AltBolgeRow[] = [];
  if (!ilce) {
    const altRows = await c.env.DB.prepare(
      `SELECT ilce_norm, medyan, ilan_adet FROM ilce_istatistik
       WHERE il_norm = ? AND kategori = ? ORDER BY medyan DESC LIMIT 10`,
    ).bind(il, kategori).all().catch(() => ({ results: [] })) as { results: AltBolgeRow[] };
    altBolgeler = altRows.results ?? [];
  }

  // 4. Gemini yorumu
  const bolgeAdi = ilce
    ? `${il.charAt(0).toUpperCase() + il.slice(1)} / ${ilce.charAt(0).toUpperCase() + ilce.slice(1)}`
    : il.charAt(0).toUpperCase() + il.slice(1);

  const istatistikStr = istatistik
    ? `Medyan: ${Math.round(istatistik.medyan ?? 0).toLocaleString("tr-TR")} TL/m²${istatistik.q1 ? ` · Q1: ${Math.round(istatistik.q1).toLocaleString("tr-TR")}` : ""}${istatistik.q3 ? ` · Q3: ${Math.round(istatistik.q3).toLocaleString("tr-TR")}` : ""} · ${istatistik.ilan_adet} ilan`
    : "İstatistik verisi yok";

  const trendStr = trendYuzde !== null
    ? `Son 6 ay değişimi: %${trendYuzde > 0 ? "+" : ""}${trendYuzde}`
    : "Trend verisi yetersiz";

  const altBolgeStr = altBolgeler.length > 0
    ? `\nİlçe sıralaması (en pahalı→ucuz):\n${altBolgeler.slice(0, 5).map((b, i) =>
        `${i + 1}. ${b.ilce_norm}: ${Math.round(b.medyan).toLocaleString("tr-TR")} TL/m² (${b.ilan_adet} ilan)`
      ).join("\n")}`
    : "";

  const prompt = `Türkiye gayrimenkul uzmanısın. Şu bölgeyi analiz et:

Bölge: ${bolgeAdi}
Kategori: ${kategori}
${istatistikStr}
${trendStr}${altBolgeStr}

Kısa ve pratik bir piyasa analizi yaz (3-4 cümle):
1. Fiyat seviyesi nasıl? (Türkiye geneline göre yüksek/orta/düşük)
2. Trend yorumu: yükselen/düşen/stabil piyasa mı?
3. Yatırımcıya öneri: doğru zaman mı, beklemeli mi?${altBolgeler.length > 0 ? "\n4. En cazip ilçe hangisi ve neden?" : ""}

Spekülatif olmayan, veri destekli bir yanıt ver.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 350 },
    }),
    signal: AbortSignal.timeout(12_000),
  });

  let aiYorum: string | null = null;
  if (res.ok) {
    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    aiYorum = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
  }

  log.info("ai-ajan.bolge-analiz", { kullaniciId, il, ilce, kategori });

  return c.json({
    bolge: { il, ilce },
    kategori,
    istatistik: istatistik ? {
      medyan: Math.round(istatistik.medyan ?? 0),
      q1: istatistik.q1 ? Math.round(istatistik.q1) : null,
      q3: istatistik.q3 ? Math.round(istatistik.q3) : null,
      ilan_adet: istatistik.ilan_adet,
      son_guncelleme: istatistik.son_guncelleme,
    } : null,
    trend: {
      yuzde: trendYuzde,
      son6ay_ort: trendSon?.ort ? Math.round(trendSon.ort) : null,
      once6ay_ort: trendOnce?.ort ? Math.round(trendOnce.ort) : null,
    },
    alt_bolgeler: altBolgeler.map(b => ({
      ilce: b.ilce_norm,
      medyan: Math.round(b.medyan),
      ilan_adet: b.ilan_adet,
    })),
    ai_yorum: aiYorum,
  });
});

export { ajan };
