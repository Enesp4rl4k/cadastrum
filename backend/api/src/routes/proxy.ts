/**
 * Dış servisler için CORS proxy.
 *
 * Mevcut endpoint'ler:
 *   GET /v1/proxy/eplan?ilceKodu=&mahalleKodu=&adaNo=&parselNo=
 *   GET /v1/proxy/tucbs?wms=csb_cdp_im_wms&lat=&lng=
 *   GET /v1/proxy/wayback?minLng=&minLat=&maxLng=&maxLat=&releaseId=
 *
 * NOT (S1.4): AFAD TDTH proxy'si kaldırıldı. Sebep: AFAD'ın public API'si
 * stabil değil, /api/v1/sismik/ endpoint'i 404 dönüyor. Mevcut il-bazlı
 * IL_DEPREM tablosu (src/lib/data/deprem-zonlari.ts) 81 il PGA değerleri
 * ile yeterli kalite veriyor. Koord-bazlı PGA gelecekte resmi API çıkarsa
 * eklenebilir.
 */
import { Hono } from "hono";
import type { Env } from "../index.js";

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
    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
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
    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": "application/geojson",
        "Cache-Control": "public, max-age=604800",
        "Access-Control-Allow-Origin": "*",
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
    return new Response(cached.body, {
      status: 200,
      headers: {
        "Content-Type": cached.httpMetadata?.contentType ?? "image/png",
        "Cache-Control": "public, max-age=2592000, immutable",
        "Access-Control-Allow-Origin": "*",
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

    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "image/png",
        "Cache-Control": "public, max-age=2592000, immutable",
        "Access-Control-Allow-Origin": "*",
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
    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=2592000", // 30 gün — idari yapı nadiren değişir
        "Access-Control-Allow-Origin": "*",
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
    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // 7 günlük public cache — CDN kenarında tutulur, backend'e istek gelmez
        "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

// ── Esri Wayback uydu karesi (site CORS) ───────────────────────────────────────
// Client-side gelişim trendi analizi için JPEG; Worker canvas decode yapmaz.

const WAYBACK_EXPORT =
  "https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/export";
const WAYBACK_RELEASE_IDS = new Set([10, 36, 60, 92]); // 2014, 2017, 2020, 2024

proxyRoutes.get("/wayback", async (c) => {
  const minLng = Number(c.req.query("minLng"));
  const minLat = Number(c.req.query("minLat"));
  const maxLng = Number(c.req.query("maxLng"));
  const maxLat = Number(c.req.query("maxLat"));
  const releaseId = Number(c.req.query("releaseId"));
  const w = Math.min(256, Math.max(32, Math.round(Number(c.req.query("w") || 160) || 160)));
  const h = Math.min(256, Math.max(32, Math.round(Number(c.req.query("h") || 120) || 120)));

  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) {
    return c.json({ error: "bbox parametreleri gerekli (minLng,minLat,maxLng,maxLat)" }, 400);
  }
  if (minLng >= maxLng || minLat >= maxLat) {
    return c.json({ error: "bbox geçersiz" }, 400);
  }
  // Türkiye + yakın tampon
  if (minLat < 35 || maxLat > 43.5 || minLng < 25 || maxLng > 45.5) {
    return c.json({ error: "bbox Türkiye sınırları dışında" }, 400);
  }
  if ((maxLng - minLng) > 0.08 || (maxLat - minLat) > 0.08) {
    return c.json({ error: "bbox çok büyük (max ~0.08°)" }, 400);
  }
  if (!Number.isInteger(releaseId) || !WAYBACK_RELEASE_IDS.has(releaseId)) {
    return c.json({ error: "releaseId geçersiz (10|36|60|92)" }, 400);
  }

  const bbox = `${minLng.toFixed(6)},${minLat.toFixed(6)},${maxLng.toFixed(6)},${maxLat.toFixed(6)}`;
  const url =
    `${WAYBACK_EXPORT}` +
    `?bbox=${bbox}&bboxSR=4326&imageSR=4326` +
    `&size=${w},${h}&format=jpg&f=image&time=${releaseId}`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "image/jpeg,*/*",
        "User-Agent": "Mozilla/5.0 (compatible; Cadastrum/1.0)",
      },
      cf: { cacheTtl: 86_400 * 30, cacheEverything: true } as never,
    });
    if (!res.ok) {
      return c.json({ error: `Wayback HTTP ${res.status}` }, 502);
    }
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "public, max-age=2592000, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

// ── Sağlık ────────────────────────────────────────────────────────────────────

proxyRoutes.get("/health", (c) =>
  c.json({ ok: true, services: ["eplan", "tucbs", "tkgm-analiz", "wayback"] }),
);
