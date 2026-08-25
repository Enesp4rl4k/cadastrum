/**
 * fiyat-choropleth-layer.ts
 *
 * Extension MapView için TL/m² fiyat choropleth katmanı.
 * Site harita-init.ts'teki fiyat choropleth mantığından adapte edildi.
 *
 * API kaynağı:
 *   - IL seviyesi:   GET /v1/fiyat/toplu-ozet?kategori=arsa
 *   - İLÇE seviyesi: GET /v1/fiyat/toplu-ilce-ozet/:il?kategori=arsa
 *
 * Katmanlar:
 *   - "fiyat-il-circle"   — il merkezi daireler (düşük zoom)
 *   - "fiyat-il-label"    — TL/m² etiketi
 *   - "fiyat-ilce-circle" — ilçe merkezi daireler (yüksek zoom)
 *   - "fiyat-ilce-label"  — ilçe TL/m² etiketi
 *
 * Zoom breakpoint: 7.5 — altında il, üstünde ilçe gösterilir.
 */

import type { Map as MapLibreMap, Popup } from "maplibre-gl";

// ── Sabitler ──────────────────────────────────────────────────────────────────

const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

/** Fiyat renk skalası (TL/m² log skala) */
const FIYAT_SKALA = [
  { esik: 500,      renk: "#f1f5f9" },
  { esik: 1500,     renk: "#bfdbfe" },
  { esik: 4000,     renk: "#60a5fa" },
  { esik: 10000,    renk: "#2563eb" },
  { esik: 25000,    renk: "#1d4ed8" },
  { esik: 60000,    renk: "#1e3a8a" },
  { esik: Infinity, renk: "#0f172a" },
];

/** İl merkez koordinatları [lat, lng] */
const IL_CENTROID: Record<string, [number, number]> = {
  adana:[37.00,35.32],adiyaman:[37.76,38.28],afyonkarahisar:[38.76,30.54],agri:[39.72,43.06],
  amasya:[40.65,35.83],ankara:[39.92,32.85],antalya:[36.90,30.70],artvin:[41.18,41.82],
  aydin:[37.85,27.85],balikesir:[39.65,27.88],bilecik:[40.15,29.97],bingol:[39.00,40.50],
  bitlis:[38.40,42.11],bolu:[40.74,31.61],burdur:[37.72,30.29],bursa:[40.19,29.06],
  canakkale:[40.15,26.41],cankiri:[40.60,33.62],corum:[40.55,34.95],denizli:[37.78,29.09],
  diyarbakir:[37.91,40.22],edirne:[41.67,26.56],elazig:[38.68,39.22],erzincan:[39.75,39.49],
  erzurum:[39.91,41.27],eskisehir:[39.78,30.52],gaziantep:[37.07,37.38],giresun:[40.91,38.39],
  gumushane:[40.44,39.48],hakkari:[37.58,43.74],hatay:[36.60,36.16],isparta:[37.76,30.56],
  mersin:[36.80,34.64],istanbul:[41.01,28.95],izmir:[38.42,27.14],kars:[40.61,36.10],
  kastamonu:[41.37,33.78],kayseri:[38.72,35.49],kirklareli:[41.73,27.22],kirsehir:[39.15,33.52],
  kocaeli:[40.85,29.88],konya:[37.87,32.49],kutahya:[39.42,29.98],malatya:[38.35,38.31],
  manisa:[38.62,27.43],kahramanmaras:[37.58,36.94],mardin:[37.32,40.74],mugla:[37.21,28.37],
  mus:[38.73,41.49],nevsehir:[38.62,34.72],nigde:[37.97,34.68],ordu:[40.98,37.88],
  rize:[41.02,40.52],sakarya:[40.69,30.43],samsun:[41.28,36.33],siirt:[38.00,41.95],
  sinop:[42.03,35.15],sivas:[39.75,37.02],tekirdag:[41.42,27.98],tokat:[40.31,36.55],
  trabzon:[40.99,39.73],tunceli:[39.11,39.55],sanliurfa:[37.16,38.80],usak:[38.67,29.40],
  van:[38.50,43.41],yozgat:[39.83,34.81],zonguldak:[41.46,31.80],aksaray:[38.35,33.99],
  bayburt:[40.26,40.22],karaman:[37.18,33.22],kirikkale:[40.11,33.51],batman:[37.89,41.14],
  sirnak:[37.52,42.46],bartin:[41.63,32.34],ardahan:[41.11,42.70],igdir:[39.89,44.04],
  yalova:[40.65,29.27],karabuk:[41.20,32.64],kilis:[36.72,37.12],osmaniye:[37.07,36.23],
  duzce:[40.84,31.16],
};

// ── Yardımcı fonksiyonlar ─────────────────────────────────────────────────────

function fiyatRenk(tlm2: number): string {
  for (const { esik, renk } of FIYAT_SKALA) {
    if (tlm2 < esik) return renk;
  }
  return FIYAT_SKALA[FIYAT_SKALA.length - 1]!.renk;
}

function fmtTLM2(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M TL/m²`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K TL/m²`;
  return `${n.toLocaleString("tr-TR")} TL/m²`;
}

// ── Veri tipleri ──────────────────────────────────────────────────────────────

export interface FiyatChoroplethOzet {
  il_norm: string;
  medyan: number;
  ilan_adet: number;
  kaynak: "ilan" | "ai-baseline";
}

export interface IlceFiyatOzet {
  ilce_norm: string;
  medyan: number;
  ilan_adet: number;
  mahalle_sayi?: number;
}

// ── State ─────────────────────────────────────────────────────────────────────

let ilFiyatVerisi: FiyatChoroplethOzet[] = [];
let aktifIlNorm: string | null = null;
let ilceFiyatCache: Map<string, IlceFiyatOzet[]> = new Map();
let aktifPopup: Popup | null = null;

// ── API ───────────────────────────────────────────────────────────────────────

async function ilFiyatCek(kategori: "arsa" | "tarla"): Promise<FiyatChoroplethOzet[]> {
  const cacheKey = `ext-fiyat-il-v1:${kategori}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { veri, ts } = JSON.parse(cached) as { veri: FiyatChoroplethOzet[]; ts: number };
      if (Date.now() - ts < 7_200_000) return veri; // 2 saat
    }
  } catch { /* ignore */ }

  const res = await fetch(`${API_BASE}/fiyat/toplu-ozet?kategori=${kategori}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`toplu-ozet HTTP ${res.status}`);
  const data = await res.json() as { iller: FiyatChoroplethOzet[] };
  const veri = data.iller ?? [];
  try { sessionStorage.setItem(cacheKey, JSON.stringify({ veri, ts: Date.now() })); } catch { /* ignore */ }
  return veri;
}

async function ilceFiyatCek(ilNorm: string, kategori: "arsa" | "tarla"): Promise<IlceFiyatOzet[]> {
  const key = `${ilNorm}:${kategori}`;
  if (ilceFiyatCache.has(key)) return ilceFiyatCache.get(key)!;

  const res = await fetch(`${API_BASE}/fiyat/toplu-ilce-ozet/${ilNorm}?kategori=${kategori}`, {
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return [];
  const data = await res.json() as { ilceler: IlceFiyatOzet[] };
  const veri = data.ilceler ?? [];
  ilceFiyatCache.set(key, veri);
  return veri;
}

// ── Layer yönetimi ────────────────────────────────────────────────────────────

function ilLayerEkle(
  map: MapLibreMap,
  PopupClass: typeof Popup,
  veri: FiyatChoroplethOzet[],
  kategori: "arsa" | "tarla",
): void {
  const fiyatMap = new Map(veri.map(d => [d.il_norm, d]));
  const features: GeoJSON.Feature[] = [];

  for (const [ilNorm, centroid] of Object.entries(IL_CENTROID)) {
    const bilgi = fiyatMap.get(ilNorm);
    if (!bilgi || bilgi.medyan <= 0) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [centroid[1], centroid[0]] },
      properties: {
        il_norm: ilNorm,
        medyan: bilgi.medyan,
        ilan_adet: bilgi.ilan_adet,
        kaynak: bilgi.kaynak,
        renk: fiyatRenk(bilgi.medyan),
        etiket: fmtTLM2(bilgi.medyan),
      },
    });
  }

  const geojson: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
  const srcId = "fiyat-il-src";

  const src = map.getSource(srcId) as import("maplibre-gl").GeoJSONSource | undefined;
  if (src) {
    src.setData(geojson);
    return;
  }

  map.addSource(srcId, { type: "geojson", data: geojson });

  map.addLayer({
    id: "fiyat-il-circle",
    type: "circle",
    source: srcId,
    maxzoom: 7.5,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 14, 6, 20, 7.5, 26],
      "circle-color": ["get", "renk"],
      "circle-opacity": 0.82,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "rgba(255,255,255,0.55)",
    },
  });

  map.addLayer({
    id: "fiyat-il-label",
    type: "symbol",
    source: srcId,
    minzoom: 5,
    maxzoom: 7.5,
    layout: {
      "text-field": ["get", "etiket"],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 5, 8, 7.5, 11],
      "text-offset": [0, 1.6],
      "text-anchor": "top",
      "text-allow-overlap": false,
      "text-optional": true,
    },
    paint: {
      "text-color": "#f1f5f9",
      "text-halo-color": "#0f172a",
      "text-halo-width": 1.5,
    },
  });

  // Tıklama → il popup + ilçe listesi lazy yükle
  map.on("click", "fiyat-il-circle", async (e) => {
    const p = e.features?.[0]?.properties as Record<string, unknown> | undefined;
    if (!p) return;

    aktifPopup?.remove();
    const ilNorm = String(p["il_norm"]);
    const ilAd = ilNorm.charAt(0).toUpperCase() + ilNorm.slice(1);
    const kaynakBadge = p["kaynak"] === "ilan"
      ? `<span style="color:#4ade80">● Gerçek ilan</span>`
      : `<span style="color:#fb923c">● AI tahmin</span>`;
    const popupId = `popup-ext-${ilNorm.replace(/[^a-z]/g, "")}`;

    aktifIlNorm = ilNorm;
    aktifPopup = new PopupClass({ closeButton: true, maxWidth: "260px" })
      .setLngLat(e.lngLat)
      .setHTML(`
        <div id="${popupId}" style="font-family:Inter,sans-serif;padding:2px 4px;min-width:220px">
          <div style="font-weight:700;font-size:13px;color:#1e293b;margin-bottom:4px">${ilAd}</div>
          <div style="font-size:17px;font-weight:800;color:${String(p["renk"])};font-variant-numeric:tabular-nums">
            ${String(p["etiket"])}
          </div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px;margin-bottom:6px">
            ${Number(p["ilan_adet"])} ilan · ${kaynakBadge}
          </div>
          <div id="${popupId}-ilceler" style="font-size:10px;color:#64748b">
            <span style="color:#94a3b8">İlçeler yükleniyor…</span>
          </div>
        </div>
      `)
      .addTo(map);

    // İlçe listesi lazy yükle
    try {
      await new Promise<void>(r => setTimeout(r, 40));
      const ilcelerEl = document.getElementById(`${popupId}-ilceler`);
      if (!ilcelerEl) return;
      const ilceler = await ilceFiyatCek(ilNorm, kategori);
      if (ilceler.length === 0) { ilcelerEl.textContent = "İlçe verisi yok"; return; }
      const maxMedyan = Math.max(...ilceler.map(i => i.medyan));
      ilcelerEl.innerHTML = [
        `<div style="font-weight:600;color:#94a3b8;font-size:9px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">En Pahalı İlçeler</div>`,
        ...ilceler.slice(0, 6).map(ilce => {
          const bar = Math.round((ilce.medyan / maxMedyan) * 100);
          const renk = fiyatRenk(ilce.medyan);
          const ad = ilce.ilce_norm.charAt(0).toUpperCase() + ilce.ilce_norm.slice(1);
          return `<div style="margin-bottom:4px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
              <span style="color:#e2e8f0;font-size:10px">${ad}</span>
              <span style="color:${renk};font-size:10px;font-weight:700">${fmtTLM2(ilce.medyan)}</span>
            </div>
            <div style="height:3px;background:#334155;border-radius:2px;overflow:hidden">
              <div style="height:100%;width:${bar}%;background:${renk};border-radius:2px"></div>
            </div>
          </div>`;
        }),
      ].join("");
    } catch { /* sessiz */ }
  });

  map.on("mouseenter", "fiyat-il-circle", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "fiyat-il-circle", () => { map.getCanvas().style.cursor = ""; });
}

function ilcelerLayerGuncelle(
  map: MapLibreMap,
  PopupClass: typeof Popup,
  ilceler: IlceFiyatOzet[],
  ilNorm: string,
): void {
  const features: GeoJSON.Feature[] = (ilceler.map((ilce, idx) => {
    // İlçe merkezi gerçek koordinat yok — il merkezi etrafında spiral dağıl
    const centroid = IL_CENTROID[ilNorm];
    if (!centroid) return null;
    const row = Math.floor(idx / 5);
    const col = idx % 5;
    return {
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [
          centroid[1] + (col - 2) * 0.22,
          centroid[0] + (row - 2) * 0.18,
        ],
      },
      properties: {
        ilce_norm: ilce.ilce_norm,
        medyan: ilce.medyan,
        ilan_adet: ilce.ilan_adet,
        renk: fiyatRenk(ilce.medyan),
        etiket: fmtTLM2(ilce.medyan),
        il_norm: ilNorm,
      },
    } as GeoJSON.Feature;
  }) as (GeoJSON.Feature | null)[]).filter((f): f is GeoJSON.Feature => f !== null);

  const geojson: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
  const srcId = "fiyat-ilce-src";

  const src = map.getSource(srcId) as import("maplibre-gl").GeoJSONSource | undefined;
  if (src) {
    src.setData(geojson);
    return;
  }

  map.addSource(srcId, { type: "geojson", data: geojson });

  map.addLayer({
    id: "fiyat-ilce-circle",
    type: "circle",
    source: srcId,
    minzoom: 7.5,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 7.5, 10, 9, 16, 11, 22],
      "circle-color": ["get", "renk"],
      "circle-opacity": 0.85,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "rgba(255,255,255,0.6)",
    },
  });

  map.addLayer({
    id: "fiyat-ilce-label",
    type: "symbol",
    source: srcId,
    minzoom: 8,
    layout: {
      "text-field": ["get", "etiket"],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 8, 9, 11, 12],
      "text-offset": [0, 1.5],
      "text-anchor": "top",
      "text-allow-overlap": false,
      "text-optional": true,
    },
    paint: {
      "text-color": "#f1f5f9",
      "text-halo-color": "#0f172a",
      "text-halo-width": 1.5,
    },
  });

  map.on("click", "fiyat-ilce-circle", (e) => {
    const p = e.features?.[0]?.properties as Record<string, unknown> | undefined;
    if (!p) return;
    aktifPopup?.remove();
    const ilceNorm = String(p["ilce_norm"]);
    const ilceAd = ilceNorm.charAt(0).toUpperCase() + ilceNorm.slice(1);
    aktifPopup = new PopupClass({ closeButton: true, maxWidth: "220px" })
      .setLngLat(e.lngLat)
      .setHTML(`
        <div style="font-family:Inter,sans-serif;padding:2px 4px">
          <div style="font-weight:700;font-size:13px;color:#1e293b;margin-bottom:4px">${ilceAd}</div>
          <div style="font-size:17px;font-weight:800;color:${String(p["renk"])}">
            ${String(p["etiket"])}
          </div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px">${Number(p["ilan_adet"])} ilan</div>
        </div>
      `)
      .addTo(map);
  });

  map.on("mouseenter", "fiyat-ilce-circle", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "fiyat-ilce-circle", () => { map.getCanvas().style.cursor = ""; });
}

// ── Public API ────────────────────────────────────────────────────────────────

const LAYER_IDS = [
  "fiyat-il-circle", "fiyat-il-label",
  "fiyat-ilce-circle", "fiyat-ilce-label",
];
const SOURCE_IDS = ["fiyat-il-src", "fiyat-ilce-src"];

/**
 * Fiyat choropleth katmanını yükle ve görünür yap.
 * İlk çağrıda API'den veri çekip layer'ları oluşturur.
 * Sonraki çağrılar sadece görünürlüğü açar.
 */
export async function fiyatChoroplethEkle(
  map: MapLibreMap,
  PopupClass: typeof Popup,
  kategori: "arsa" | "tarla" = "arsa",
): Promise<void> {
  if (ilFiyatVerisi.length === 0) {
    ilFiyatVerisi = await ilFiyatCek(kategori);
  }
  ilLayerEkle(map, PopupClass, ilFiyatVerisi, kategori);
  fiyatChoroplethGorunurluk(map, true);

  // İl centroid yok ama "moveend"de ilçe yükle
  map.on("moveend", async () => {
    const zoom = map.getZoom();
    if (zoom < 7.5 || !aktifIlNorm) return;
    const ilceler = await ilceFiyatCek(aktifIlNorm, kategori);
    if (ilceler.length > 0) ilcelerLayerGuncelle(map, PopupClass, ilceler, aktifIlNorm);
  });
}

/**
 * Tüm fiyat choropleth layer'larının görünürlüğünü ayarla.
 */
export function fiyatChoroplethGorunurluk(map: MapLibreMap, gorünür: boolean): void {
  const vis = gorünür ? "visible" : "none";
  for (const id of LAYER_IDS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
  }
}

/**
 * Tüm fiyat choropleth layer ve source'larını kaldır (temizlik).
 */
export function fiyatChoroplethKaldir(map: MapLibreMap): void {
  aktifPopup?.remove();
  aktifPopup = null;
  aktifIlNorm = null;
  ilFiyatVerisi = [];
  ilceFiyatCache = new Map();

  for (const id of LAYER_IDS) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of SOURCE_IDS) {
    if (map.getSource(id)) map.removeSource(id);
  }
}

/** Aktif il normunu set et (harita tıklama dışından da tetiklenebilir) */
export function fiyatChoroplethIlSec(ilNorm: string | null): void {
  aktifIlNorm = ilNorm;
}
