/**
 * Dış servisler için CORS proxy.
 *
 * Mevcut endpoint'ler:
 *   GET /v1/proxy/eplan?ilceKodu=&mahalleKodu=&adaNo=&parselNo=
 *   GET /v1/proxy/tucbs?wms=csb_cdp_im_wms&lat=&lng=
 *
 * NOT (S1.4): AFAD TDTH proxy'si kaldırıldı. Sebep: AFAD'ın public API'si
 * stabil değil, /api/v1/sismik/ endpoint'i 404 dönüyor. Mevcut il-bazlı
 * IL_DEPREM tablosu (src/lib/data/deprem-zonlari.ts) 81 il PGA değerleri
 * ile yeterli kalite veriyor. Koord-bazlı PGA gelecekte resmi API çıkarsa
 * eklenebilir.
 */
import { Hono } from "hono";
import type { Env } from "../index.js";
import { rateLimitMiddleware } from "../lib/rate-limit.js";

const TUCBS_WMS_SLUGS = new Set([
  "csb_cdp_im_wms",
  "csb_cdp_ma_wms",
  "csb_cdp_abi_wms",
  "csb_cdp_kk_wms",
  "csb_cdp_ergene_wms",
  "csb_cdp_knna_wms",
  "csb_cdp_ysk_wms",
  "csb_cdp_zbk_wms",
  "csb_cdp_skc_wms",
  "csb_cdp_asd_wms",
  "csb_cdp_mbv_wms",
  "csb_cdp_akia_wms",
  "csb_cdp_yalova_wms",
  "csb_cdp_kirikkale_wms",
  "csb_cdp_bolu_wms",
  "csb_cdp_amasya_wms",
  "csb_cdp_osmaniye_wms",
  "csb_cdp_kilis_wms",
]);

export const proxyRoutes = new Hono<{ Bindings: Env }>();

// ── e-Plan (imar) ─────────────────────────────────────────────────────────────
// eplan.csb.gov.tr — misafir oturumu + kadastroParsel (eski e-plan.gov.tr/proxy kaldırıldı)

const EPLAN_BASE = "https://eplan.csb.gov.tr";
const EPLAN_REFERER = `${EPLAN_BASE}/e-plan/html/imarDurumu.html`;

function mergeSetCookie(existing: string, setCookie: string | null): string {
  const jar = new Map<string, string>();
  for (const part of existing.split("; ").filter(Boolean)) {
    const [k, ...v] = part.split("=");
    jar.set(k, v.join("="));
  }
  if (setCookie) {
    for (const sc of setCookie.split(/,(?=[^;]+?=)/)) {
      const pair = sc.split(";")[0]?.trim();
      if (!pair) continue;
      const [k, ...v] = pair.split("=");
      jar.set(k, v.join("="));
    }
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function eplanGuestFetch(path: string, cookie = ""): Promise<{ res: Response; cookie: string }> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${EPLAN_BASE}/${path}${sep}preventCache=${Date.now()}`, {
    headers: {
      Accept: "application/json",
      Cookie: cookie,
      Origin: EPLAN_BASE,
      Referer: EPLAN_REFERER,
      "User-Agent": "Mozilla/5.0 (compatible; Cadastrum/1.0)",
    },
  });
  const nextCookie = mergeSetCookie(cookie, res.headers.get("set-cookie"));
  return { res, cookie: nextCookie };
}

proxyRoutes.get("/eplan", async (c) => {
  const ilceKodu = c.req.query("ilceKodu");
  const mahalleKodu = c.req.query("mahalleKodu");
  const adaNo = c.req.query("adaNo");
  const parselNo = c.req.query("parselNo");
  if (!ilceKodu || !mahalleKodu || !adaNo || !parselNo) {
    return c.json({ error: "ilceKodu, mahalleKodu, adaNo, parselNo zorunlu" }, 400);
  }
  if (
    !/^\d+$/.test(ilceKodu) || !/^\d+$/.test(mahalleKodu) ||
    !/^\d+$/.test(adaNo) || !/^\d+$/.test(parselNo)
  ) {
    return c.json({ error: "Tüm parametreler numeric olmalı" }, 400);
  }

  try {
    const login = await eplanGuestFetch("fSession/loginAsGuest");
    if (!login.res.ok) {
      return c.json({ error: `e-Plan oturum ${login.res.status}`, status: login.res.status }, 502);
    }

    const { res, cookie } = await eplanGuestFetch(
      `ePlanIntegration/kadastroParsel?mahalleID=${mahalleKodu}&adaNo=${adaNo}&parselNo=${parselNo}`,
      login.cookie,
    );
    if (!res.ok) {
      return c.json({ error: `e-Plan ${res.status}`, status: res.status }, 502);
    }
    const text = await res.text();
    // GÜVENLIK: ACAO "*" yerine gelen origin'i reflect ediyoruz.
    // Bu proxy endpoint'i extension + site'dan çağrılıyor; wildcard gerekmiyor,
    // index.ts'deki CORS allowlist zaten yeterli filtrelemeyi yapıyor.
    const origin = c.req.header("Origin") ?? "";
    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": origin || "null",
        "Vary": "Origin",
      },
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

// ── TUCBS ÇDP WMS ─────────────────────────────────────────────────────────────

proxyRoutes.get("/tucbs", async (c) => {
  const wms = c.req.query("wms");
  const lat = Number(c.req.query("lat"));
  const lng = Number(c.req.query("lng"));
  if (!wms || !TUCBS_WMS_SLUGS.has(wms)) {
    return c.json({ error: "Geçersiz wms slug" }, 400);
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return c.json({ error: "lat ve lng zorunlu" }, 400);
  }
  if (lat < 35 || lat > 43 || lng < 25 || lng > 46) {
    return c.json({ error: "Koordinat Türkiye sınırları dışında" }, 400);
  }

  const delta = 0.001;
  const bbox = `${lat - delta},${lng - delta},${lat + delta},${lng + delta}`;
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetFeatureInfo",
    LAYERS: "2",
    QUERY_LAYERS: "2,9,8",
    CRS: "EPSG:4326",
    BBOX: bbox,
    WIDTH: "101",
    HEIGHT: "101",
    I: "50",
    J: "50",
    INFO_FORMAT: "application/geojson",
  });
  const url = `https://tucbs-public-api.csb.gov.tr/${wms}?${params.toString()}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Cadastrum/1.0)",
        Accept: "application/geojson, application/json",
      },
      cf: { cacheTtl: 86_400 * 7, cacheEverything: true } as never,
    });
    if (!res.ok) {
      return c.json({ error: `TUCBS WMS ${res.status}` }, 502);
    }
    const text = await res.text();
    const origin2 = c.req.header("Origin") ?? "";
    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": "application/geojson",
        "Cache-Control": "public, max-age=604800",
        "Access-Control-Allow-Origin": origin2 || "null",
        "Vary": "Origin",
      },
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

// WMS GetMap tile — MapLibre {bbox-epsg-3857} placeholder'ı client'ta doldurulur
/** Standart XYZ tile → EPSG:3857 bbox (Web Mercator tam daire: ±20037508.342789244m) */
function xyzToBbox3857(z: number, x: number, y: number): string {
  const WORLD = 20037508.342789244;
  const tileSize = (WORLD * 2) / 2 ** z;
  const minX = -WORLD + x * tileSize;
  const maxX = minX + tileSize;
  const maxY = WORLD - y * tileSize;
  const minY = maxY - tileSize;
  return `${minX},${minY},${maxX},${maxY}`;
}

// TUCBS'in kendi sunucusu Cloudflare Worker IP aralığını yavaşlatıyor/engelliyor
// (canlı istekler 522/timeout ile sonuçlanıyor). Bu yüzden tile'lar R2'de
// write-through cache'leniyor: önce R2'ye bak, yoksa TUCBS'ten çek + R2'ye yaz.
// z/x/y standart slippy-map şeması — hem R2 anahtarı hem MapLibre tile source'u
// için tutarlı (bkz. site/src/scripts/harita-init.ts).
proxyRoutes.get("/tucbs/tile/:wms/:z/:x/:y", async (c) => {
  const wms = c.req.param("wms");
  const z = Number(c.req.param("z"));
  const x = Number(c.req.param("x"));
  const y = Number(c.req.param("y").replace(/\.png$/, ""));

  if (!wms || !TUCBS_WMS_SLUGS.has(wms)) {
    return c.json({ error: "Geçersiz wms slug" }, 400);
  }
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > 20) {
    return c.json({ error: "Geçersiz z/x/y" }, 400);
  }

  const r2Key = `${wms}/${z}/${x}/${y}.png`;

  // 1) R2'den dene
  const cached = await c.env.TUCBS_TILES.get(r2Key);
  if (cached) {
    const tileOrigin = c.req.header("Origin") ?? "";
    return new Response(cached.body, {
      status: 200,
      headers: {
        "Content-Type": cached.httpMetadata?.contentType ?? "image/png",
        "Cache-Control": "public, max-age=2592000, immutable",
        "Access-Control-Allow-Origin": tileOrigin || "null",
        "Vary": "Origin",
        "X-Tile-Cache": "r2-hit",
      },
    });
  }

  // 2) R2'de yok — TUCBS'ten canlı çek (yavaş/engelli olabilir, bu yüzden kısa timeout)
  const bbox = xyzToBbox3857(z, x, y);
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    FORMAT: "image/png",
    TRANSPARENT: "true",
    LAYERS: "2",
    CRS: "EPSG:3857",
    STYLES: "",
    WIDTH: "256",
    HEIGHT: "256",
    BBOX: bbox,
  });
  const url = `https://tucbs-public-api.csb.gov.tr/${wms}?${params.toString()}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Cadastrum/1.0)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return c.json({ error: `TUCBS tile ${res.status}` }, 502);
    }
    const buf = await res.arrayBuffer();

    // 3) Write-through — bir daha kimse bu tile için TUCBS'e gitmesin
    c.executionCtx.waitUntil(
      c.env.TUCBS_TILES.put(r2Key, buf, {
        httpMetadata: { contentType: res.headers.get("Content-Type") ?? "image/png" },
      }),
    );

    const tileOrigin2 = c.req.header("Origin") ?? "";
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "image/png",
        "Cache-Control": "public, max-age=2592000, immutable",
        "Access-Control-Allow-Origin": tileOrigin2 || "null",
        "Vary": "Origin",
        "X-Tile-Cache": "miss-fetched",
      },
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

// ── TKGM İdari Yapı (il/ilçe listesi) ────────────────────────────────────────
// cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/idariYapi/ilceListe/{ilKodu}
// Harita sayfasında ilçe kodlarını çekmek için — CORS engeli var, proxy gerekli.

const TKGM_API_BASE = "https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api";
const VALID_IDARI_TIP = new Set(["ilListe", "ilceListe", "mahalleListe"]);

proxyRoutes.get("/tkgm-idari/:tip/:kod?", async (c) => {
  const tip = c.req.param("tip");
  const kod = c.req.param("kod");

  if (!VALID_IDARI_TIP.has(tip)) {
    return c.json({ error: "Geçersiz idari tip (ilListe | ilceListe | mahalleListe)" }, 400);
  }

  // ilListe kod gerektirmez; ilceListe ve mahalleListe gerektirir
  if (tip !== "ilListe") {
    if (!kod || !/^\d{1,6}$/.test(kod)) {
      return c.json({ error: "Geçerli sayısal kod gerekli" }, 400);
    }
  }

  const path = kod ? `${tip}/${kod}` : tip;
  const url = `${TKGM_API_BASE}/idariYapi/${path}`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Cadastrum/1.0)",
        Origin: "https://parselsorgu.tkgm.gov.tr",
        Referer: "https://parselsorgu.tkgm.gov.tr/",
      },
      cf: { cacheTtl: 86_400 * 30, cacheEverything: true } as never,
    });
    if (!res.ok) {
      return c.json({ error: `TKGM idari HTTP ${res.status}` }, 502);
    }
    const text = await res.text();
    const idariOrigin = c.req.header("Origin") ?? "";
    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=2592000", // 30 gün — idari yapı nadiren değişir
        "Access-Control-Allow-Origin": idariOrigin || "null",
        "Vary": "Origin",
      },
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

// ── TKGM Analiz (alım-satım yoğunluğu) ───────────────────────────────────────
// cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/analiz?AnalizTip=1&Yil=2025&IlceId=XXX
// Extension'daki LabView heatmap verisi — site haritasında da kullanmak için proxy.
// Auth gerektirmiyor ama browser'dan CORS engeli var; Worker IP'sinden çözülür.

const TKGM_ANALIZ_BASE = "https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/analiz";
const VALID_ANALIZ_TIP = new Set([1, 2, 3, 4, 5]);
const ANALIZ_YIL_MIN = 2003;
const ANALIZ_YIL_MAX = new Date().getFullYear();

proxyRoutes.get("/tkgm-analiz", async (c) => {
  const analizTipRaw = c.req.query("analizTip");
  const yilRaw = c.req.query("yil");
  const ilceKoduRaw = c.req.query("ilceKodu");

  if (!analizTipRaw || !yilRaw || !ilceKoduRaw) {
    return c.json({ error: "analizTip, yil, ilceKodu zorunlu" }, 400);
  }

  const analizTip = Number(analizTipRaw);
  const yil = Number(yilRaw);
  const ilceKodu = Number(ilceKoduRaw);

  if (!VALID_ANALIZ_TIP.has(analizTip)) {
    return c.json({ error: "analizTip 1–5 arasında olmalı" }, 400);
  }
  if (!Number.isInteger(yil) || yil < ANALIZ_YIL_MIN || yil > ANALIZ_YIL_MAX) {
    return c.json({ error: `yil ${ANALIZ_YIL_MIN}–${ANALIZ_YIL_MAX} arasında olmalı` }, 400);
  }
  if (!Number.isInteger(ilceKodu) || ilceKodu <= 0 || ilceKodu > 99999) {
    return c.json({ error: "ilceKodu geçersiz" }, 400);
  }

  const url = `${TKGM_ANALIZ_BASE}?AnalizTip=${analizTip}&Yil=${yil}&IlceId=${ilceKodu}`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Cadastrum/1.0)",
        // TKGM analiz endpoint'i parselsorgu.tkgm.gov.tr'den çağrılıyor
        Origin: "https://parselsorgu.tkgm.gov.tr",
        Referer: "https://parselsorgu.tkgm.gov.tr/",
      },
      // Cloudflare Cache: analiz verisi yıllık — 7 gün TTL yeterli
      cf: { cacheTtl: 86_400 * 7, cacheEverything: true } as never,
    });

    if (!res.ok) {
      return c.json({ error: `TKGM analiz HTTP ${res.status}` }, 502);
    }

    const text = await res.text();
    const analizOrigin = c.req.header("Origin") ?? "";
    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // 7 günlük public cache — CDN kenarında tutulur, backend'e istek gelmez
        "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": analizOrigin || "null",
        "Vary": "Origin",
      },
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

// ── Sentinel-2 / ESRI World Imagery tile proxy ────────────────────────────────
// Kullanıcıya herhangi bir API key gerektirmeyen kamuya açık uydu görüntüsü.
//
// Kaynak seçimi:
//   1. ESRI World Imagery (arcgisonline.com) — zoom 0-23, gerçek uydu görüntüsü,
//      API key gerektirmez, ücretsiz tile servisi, küresel kapsam.
//   2. Fallback: OpenStreetMap tile (harita — uydu değil)
//
// Endpoint: GET /v1/proxy/uydu-tile/{z}/{x}/{y}
// Cloudflare'de cache'lenir (30 gün) — repeated requests ücretsiz.

const ESRI_TILE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";

proxyRoutes.get("/uydu-tile/:z/:x/:y", async (c) => {
  const z = parseInt(c.req.param("z"), 10);
  const x = parseInt(c.req.param("x"), 10);
  const y = parseInt(c.req.param("y"), 10);

  // Zoom sınır — 18+ ESRI'de çok yavaş
  if (!Number.isInteger(z) || z < 0 || z > 19) {
    return c.json({ error: "z 0–19 arasında olmalı" }, 400);
  }
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) {
    return c.json({ error: "x ve y pozitif tam sayı olmalı" }, 400);
  }

  const url = `${ESRI_TILE}/${z}/${y}/${x}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Cadastrum/1.0)",
        "Referer": "https://www.arcgis.com/",
      },
      cf: { cacheTtl: 86_400 * 30, cacheEverything: true } as never,
    });

    if (!res.ok) {
      return new Response(null, { status: res.status });
    }

    const imgOrigin = c.req.header("Origin") ?? "";
    const imgData = await res.arrayBuffer();
    return new Response(imgData, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=2592000",
        "Access-Control-Allow-Origin": imgOrigin || "*",
        "Vary": "Origin",
      },
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

// ── AI Uydu Analizi ───────────────────────────────────────────────────────────
// POST /v1/proxy/uydu-analiz
// body: { lat: number, lng: number, zoom: number }
// Gemini Vision ile uydu görüntüsünden arazi değişim analizi yapar.
// Gemini Flash multimodal — görüntü URL'sini doğrudan işler.

proxyRoutes.post("/uydu-analiz", rateLimitMiddleware(5, "uydu-analiz"), async (c) => {
  const body = await c.req.json<{ lat?: number; lng?: number; zoom?: number }>();
  const lat = Number(body.lat ?? 0);
  const lng = Number(body.lng ?? 0);
  const zoom = Math.min(Math.max(Number(body.zoom ?? 15), 10), 18);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
    return c.json({ error: "Geçerli lat/lng gerekli" }, 400);
  }

  // Cache key — koordinatı 3 ondalığa yuvarlayarak benzer konumları birleştir (~100m hassasiyet)
  const cacheKey = `uydu:${lat.toFixed(3)}:${lng.toFixed(3)}:${zoom}`;
  const kv = c.env.RATE_LIMIT_KV;

  // KV cache'den oku (24 saat TTL)
  if (kv) {
    try {
      const cached = await kv.get(cacheKey, "text");
      if (cached) {
        const uyduOrigin = c.req.header("Origin") ?? "";
        return new Response(cached, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=86400",
            "X-Cache": "HIT",
            "Access-Control-Allow-Origin": uyduOrigin || "*",
            "Vary": "Origin",
          },
        });
      }
    } catch { /* KV hata → devam et, fresh analiz yap */ }
  }

  // Web Mercator tile koordinatları hesapla
  function latLngToTile(lat: number, lng: number, z: number): { x: number; y: number } {
    const n = Math.pow(2, z);
    const x = Math.floor((lng + 180) / 360 * n);
    const latRad = lat * Math.PI / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x, y };
  }

  const { x, y } = latLngToTile(lat, lng, zoom);
  const tileUrl = `${ESRI_TILE}/${zoom}/${y}/${x}`;

  // Gemini Vision API key
  const geminiKey = c.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return c.json({ error: "Gemini API key eksik" }, 500);
  }

  try {
    // Uydu görüntüsünü fetch et
    const tileRes = await fetch(tileUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Cadastrum/1.0)" },
    });
    if (!tileRes.ok) {
      return c.json({ error: `Uydu tile alınamadı: HTTP ${tileRes.status}` }, 502);
    }
    const imgBytes = await tileRes.arrayBuffer();
    // btoa(String.fromCharCode(...spread)) büyük tile'larda call stack overflow verir.
    // Chunk'lara bölerek güvenli base64 encode.
    const bytes = new Uint8Array(imgBytes);
    let imgB64 = "";
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      imgB64 += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    imgB64 = btoa(imgB64);
    const mimeType = tileRes.headers.get("Content-Type") ?? "image/jpeg";

    // Gemini Vision multimodal analiz
    const prompt = `Bu bir Türkiye'deki arazi/parsel bölgesinin uydu görüntüsüdür (koordinat: ${lat.toFixed(5)}, ${lng.toFixed(5)}).

Lütfen aşağıdaki konularda kısa ve net bir analiz yap (JSON formatında dön):
1. arazi_tipi: Görüntüdeki arazi kullanım türü (arsa/tarla/konut/sanayi/tarım/orman/karma)
2. yapilasma_yogunlugu: Yapılaşma yoğunluğu (0=boş, 100=tam dolu)
3. yesil_alan_orani: Yeşil/bitki örtüsü oranı (0-100)
4. ulasim_erisimi: Görünür yol/cadde erişimi (yok/zayıf/orta/iyi/çok iyi)
5. yakin_tesisler: Görünen önemli tesisler (liste, en fazla 5 madde)
6. degerlenme_potansiyeli: Bu görüntüye göre arazi değerlenme potansiyeli (düşük/orta/yüksek)
7. gozlemler: Önemli gözlemler (2-3 cümle, Türkçe)

Sadece JSON döndür, başka açıklama ekleme.`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType, data: imgB64 } },
              { text: prompt },
            ],
          }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: 512 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return c.json({ error: `Gemini API hatası: ${errText.slice(0, 200)}` }, 502);
    }

    const geminiData = await geminiRes.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

    let analiz: Record<string, unknown>;
    try {
      analiz = JSON.parse(rawText);
    } catch {
      analiz = { gozlemler: rawText.slice(0, 300) };
    }

    const uyduOrigin = c.req.header("Origin") ?? "";
    const responseBody = JSON.stringify({
      ok: true,
      koordinat: { lat, lng, zoom },
      tile: { z: zoom, x, y },
      tileUrl: `${c.req.url.split("/v1/")[0]}/v1/proxy/uydu-tile/${zoom}/${x}/${y}`,
      analiz,
    });

    // KV'ye 24 saat cache'le (fire-and-forget)
    if (kv) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c as any).executionCtx?.waitUntil(
        kv.put(cacheKey, responseBody, { expirationTtl: 86400 }).catch(() => {})
      );
    }

    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=82800",
        "X-Cache": "MISS",
        "Access-Control-Allow-Origin": uyduOrigin || "*",
        "Vary": "Origin",
      },
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

// ── Sağlık ────────────────────────────────────────────────────────────────────

proxyRoutes.get("/health", (c) =>
  c.json({ ok: true, services: ["eplan", "tucbs", "tkgm-analiz", "uydu-tile", "uydu-analiz"] }),
);
