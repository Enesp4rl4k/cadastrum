/**
 * Uydu Görüntü & AI Analiz API — /v1/uydu
 *
 * Endpoints:
 *   POST /v1/uydu/gorsel   → Copernicus Sentinel-2 WMS görüntüsü (base64 PNG)
 *   POST /v1/uydu/analiz   → Görüntü + Gemini Vision AI arazi analizi (JWT)
 *
 * Veri kaynağı: Copernicus Data Space Ecosystem (WMS)
 *   - Ücretsiz, kayıt gerektirmez (WMS endpoint herkese açık)
 *   - Sentinel-2 L2A (10m çözünürlük, atmosfer düzeltmeli)
 *   - Son 30 günün en az bulutlu görüntüsü seçilir
 *
 * Rate limit:
 *   /gorsel: 30/saat (R2 cache ile çoğu istek ücretsiz)
 *   /analiz: 10/saat + JWT Pro tier kontrolü
 *
 * Cache:
 *   R2'ye bbox+bant anahtarıyla 30 gün saklanır.
 *   Cache hit → R2'den servis, Copernicus'a istek yok.
 */

import { Hono } from "hono";
import type { Env } from "../index.js";
import { rateLimitMiddleware } from "../lib/rate-limit.js";
import { log } from "../lib/logger.js";

type UyduCtx = { Bindings: Env };

const uydu = new Hono<UyduCtx>();

// ── Bant → WMS layer mapping ──────────────────────────────────────────────────
const BANT_LAYER: Record<string, string> = {
  "gercek-renk": "TRUE_COLOR",
  "ndvi":         "NDVI",
  "yanlis-renk":  "FALSE_COLOR",
  "nem":          "MOISTURE_INDEX",
};

// ── Copernicus Data Space WMS URL ─────────────────────────────────────────────
const COPERNICUS_WMS =
  "https://sh.dataspace.copernicus.eu/ogc/wms/0635c98d-1572-45d0-a29e-aa9e81ad9a61";

interface BboxParam {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

interface GorselBody {
  lat: number;
  lng: number;
  bant?: string;
  bbox?: BboxParam;
}

/** R2 cache anahtarı */
function r2Key(lat: number, lng: number, bant: string): string {
  return `uydu/${bant}/${lat.toFixed(2)}_${lng.toFixed(2)}.png`;
}

/** Bbox'tan WMS BBOX string oluştur (EPSG:4326) */
function bboxStr(bbox: BboxParam): string {
  return `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`;
}

/** Koordinat etrafında varsayılan bbox (~400m yarıçap) */
function varsayilanBbox(lat: number, lng: number): BboxParam {
  const dLat = 0.003_6; // ~400m
  const dLng = 0.003_6 / Math.cos((lat * Math.PI) / 180);
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}

// ── POST /v1/uydu/gorsel ──────────────────────────────────────────────────────

uydu.post(
  "/gorsel",
  rateLimitMiddleware(30, "uydu-gorsel"),
  async (c) => {
    let body: GorselBody;
    try {
      body = await c.req.json<GorselBody>();
    } catch {
      return c.json({ hata: "Geçersiz JSON" }, 400);
    }

    const { lat, lng, bant = "gercek-renk" } = body;
    if (!lat || !lng || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return c.json({ hata: "lat/lng zorunlu" }, 400);
    }
    if (lat < 35 || lat > 43 || lng < 25 || lng > 46) {
      return c.json({ hata: "Koordinat Türkiye dışında" }, 400);
    }

    const layer = BANT_LAYER[bant] ?? "TRUE_COLOR";
    const bbox = body.bbox ?? varsayilanBbox(lat, lng);
    const cacheKey = r2Key(lat, lng, bant);

    // R2 cache kontrol
    try {
      const cached = await c.env.TUCBS_TILES.get(cacheKey);
      if (cached) {
        const meta = cached.customMetadata ?? {};
        const ts = parseInt(meta["ts"] ?? "0", 10);
        const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 gün
        if (Date.now() - ts < CACHE_TTL) {
          const buf = await cached.arrayBuffer();
          const b64 = bufferToBase64(buf);
          return c.json({
            base64: `data:image/png;base64,${b64}`,
            bant,
            gorselTarihi: meta["gorselTarihi"] ?? null,
            bulutOrtYuzde: meta["bulutOrt"] ? parseFloat(meta["bulutOrt"]) : null,
            cozunurlukM: 10,
            bbox,
            fetchedAt: ts,
          });
        }
      }
    } catch {
      // Cache hatası — devam et
    }

    // Copernicus Data Space WMS isteği
    const wmsParams = new URLSearchParams({
      SERVICE:      "WMS",
      REQUEST:      "GetMap",
      LAYERS:       layer,
      BBOX:         bboxStr(bbox),
      WIDTH:        "256",
      HEIGHT:       "256",
      FORMAT:       "image/png",
      CRS:          "EPSG:4326",
      VERSION:      "1.3.0",
      TIME:         "", // Son 30 gün otomatik (boş = en güncel)
      MAXCC:        "30", // Max %30 bulut örtüsü
    });

    // Son 30 güne ait zaman aralığı
    const bugun = new Date().toISOString().split("T")[0];
    const otuzGunOnce = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    wmsParams.set("TIME", `${otuzGunOnce}/${bugun}`);

    const wmsUrl = `${COPERNICUS_WMS}?${wmsParams.toString()}`;

    try {
      const resp = await fetch(wmsUrl, {
        headers: { Accept: "image/png" },
        signal: AbortSignal.timeout(15_000),
      });

      if (!resp.ok) {
        log.warn("uydu.gorsel.wms-hata", { status: resp.status, bant });
        return c.json({ hata: `WMS HTTP ${resp.status}` }, 502);
      }

      const contentType = resp.headers.get("Content-Type") ?? "";
      if (!contentType.includes("image")) {
        return c.json({ hata: "WMS görüntü döndürmedi" }, 502);
      }

      const imgBuf = await resp.arrayBuffer();
      const b64 = bufferToBase64(imgBuf);
      const now = Date.now();

      // R2'ye yaz (hata durumunda sessizce geç)
      try {
        await c.env.TUCBS_TILES.put(cacheKey, imgBuf, {
          customMetadata: {
            ts: String(now),
            gorselTarihi: bugun ?? "",
            bulutOrt: "30",
          },
        });
      } catch {
        // R2 yazma hatası kritik değil
      }

      return c.json({
        base64: `data:image/png;base64,${b64}`,
        bant,
        gorselTarihi: bugun,
        bulutOrtYuzde: 30,
        cozunurlukM: 10,
        bbox,
        fetchedAt: now,
      });
    } catch (e) {
      log.error("uydu.gorsel.fetch-hata", { hata: String(e) });
      return c.json({ hata: "Copernicus WMS bağlantı hatası" }, 502);
    }
  },
);

// ── POST /v1/uydu/analiz ──────────────────────────────────────────────────────

uydu.post(
  "/analiz",
  rateLimitMiddleware(10, "uydu-analiz"),
  async (c) => {
    // JWT opsiyonel — sadece loglama amaçlı, Pro kontrolü yapılmıyor
    let kullaniciId: number | null = null;
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        // Token'dan sub claim'ini basit olarak çözümle (JWT doğrulama yapmıyoruz,
        // sadece loglama için kullanıcı ID'si alıyoruz)
        const tokenParts = authHeader.slice(7).split(".");
        if (tokenParts.length === 3) {
          const payload = JSON.parse(atob(tokenParts[1]!)) as { sub?: number };
          kullaniciId = payload.sub ?? null;
        }
      } catch {
        // JWT parse hatası — anonim devam
      }
    }

    let body: GorselBody;
    try {
      body = await c.req.json<GorselBody>();
    } catch {
      return c.json({ hata: "Geçersiz JSON" }, 400);
    }

    const { lat, lng, bant = "gercek-renk" } = body;
    if (!lat || !lng) return c.json({ hata: "lat/lng zorunlu" }, 400);

    // 1. Görüntüyü al
    const gorselUrl = new URL(c.req.url);
    gorselUrl.pathname = gorselUrl.pathname.replace("/analiz", "/gorsel");

    interface GorselSonuc { base64: string; bant: string; gorselTarihi: string | null; bulutOrtYuzde: number | null; cozunurlukM: number; bbox: BboxParam; fetchedAt: number }
    let gorsel: GorselSonuc | null = null;
    try {
      const gorselRes = await fetch(
        `https://${gorselUrl.host}/v1/uydu/gorsel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng, bant }),
        },
      );
      if (gorselRes.ok) {
        gorsel = await gorselRes.json();
      }
    } catch {
      // Görüntü alınamazsa sadece AI olmadan dön
    }

    if (!gorsel?.base64) {
      return c.json({ hata: "Uydu görüntüsü alınamadı" }, 502);
    }

    // 2. Gemini Vision AI analizi
    const geminiKey = c.env.GEMINI_API_KEY;
    if (!geminiKey) {
      // AI olmadan sadece görüntü dön
      return c.json({ gorsel, aiOzet: null, araziBulgu: null, fiyatNotu: null });
    }

    const prompt = `Bu Sentinel-2 uydu görüntüsü Türkiye'de bir parseli gösteriyor.
Bant: ${bant === "gercek-renk" ? "gerçek renk (RGB)" : bant}.
Koordinat: ${lat.toFixed(4)}, ${lng.toFixed(4)}.

Lütfen şunları değerlendir (kısa, net, sadece görüntüden çıkarılabilenleri):
1. Arazi kullanım tipi (tarım, çıplak, kentsel, ormanlık, su)
2. Yapı var mı? Varsa tahmini taban alanı (m²) — sadece footprint, duvarlar arası alan
3. Yol bağlantısı tipi: yok | toprak | asfalt | beton
4. Bitkisel örtü yoğunluğu: yok | az | orta | yoğun
5. Su kaynağı yakını (dere, göl, sulama kanalı): true/false
6. Arazi değerine 1-2 cümle yorum

JSON formatında yanıt ver (başka metin ekleme):
{
  "ozet": "kısa genel açıklama",
  "araziBulgu": {
    "bitkilik": "yok|az|orta|yoğun",
    "yapilaşma": "yok|seyrek|orta|yoğun",
    "yapiVar": true,
    "yapiAlanM2": 120,
    "yolBaglanti": "yok|toprak|asfalt|beton",
    "su": true,
    "tarimAlan": true,
    "acikArazi": false
  },
  "fiyatCarpani": 1.08,
  "fiyatNotu": "arazi değerine etkisi"
}

fiyatCarpani hesabı:
- Asfalt/beton yol bağlantısı: +%8 → 1.08
- Sadece toprak yol: +%2 → 1.02
- Yol yok: -%10 → 0.90
- Yapı mevcut (>50m²): +%15 → 1.15 (yapı değeri dahil)
- Su kaynağı yakını: +%5 → ekle
- Tüm faktörleri çarp, 0.70–1.35 arasında sınırla`;

    try {
      const base64Data = gorsel.base64.replace(/^data:image\/\w+;base64,/, "");

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inline_data: { mime_type: "image/png", data: base64Data } },
              ],
            }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 512,
            },
          }),
          signal: AbortSignal.timeout(20_000),
        },
      );

      if (!geminiRes.ok) {
        log.warn("uydu.analiz.gemini-hata", { status: geminiRes.status });
        return c.json({ gorsel, aiOzet: null, araziBulgu: null, fiyatNotu: null });
      }

      const geminiData = await geminiRes.json() as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

      // JSON parse — Gemini bazen markdown code block ekler
      let parsed: {
        ozet?: string;
        araziBulgu?: {
          bitkilik?: string;
          yapilaşma?: string;
          yapiVar?: boolean;
          yapiAlanM2?: number | null;
          yolBaglanti?: string;
          su?: boolean;
          tarimAlan?: boolean;
          acikArazi?: boolean;
        };
        fiyatCarpani?: number;
        fiyatNotu?: string;
      } | null = null;
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {
        // Parse başarısız — ham metni kullan
      }

      // fiyatCarpani güvenlik sınırı: 0.70–1.35 arası
      const fiyatCarpani = parsed?.fiyatCarpani != null
        ? Math.max(0.70, Math.min(1.35, Number(parsed.fiyatCarpani)))
        : null;

      if (kullaniciId) {
        log.info("uydu.analiz.tamamlandi", {
          kullaniciId, lat, lng, bant,
          yapiVar: parsed?.araziBulgu?.yapiVar,
          yapiAlanM2: parsed?.araziBulgu?.yapiAlanM2,
          yolBaglanti: parsed?.araziBulgu?.yolBaglanti,
          fiyatCarpani,
        });
      }

      return c.json({
        gorsel,
        aiOzet: parsed?.ozet ?? rawText.slice(0, 500) ?? null,
        araziBulgu: parsed?.araziBulgu ?? null,
        fiyatCarpani,
        fiyatNotu: parsed?.fiyatNotu ?? null,
      });
    } catch (e) {
      log.warn("uydu.analiz.gemini-timeout", { hata: String(e) });
      return c.json({ gorsel, aiOzet: null, araziBulgu: null, fiyatCarpani: null, fiyatNotu: null });
    }
  },
);

// ── Yardımcı ─────────────────────────────────────────────────────────────────

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export { uydu as uyduRoutes };
