/**
 * harita-init.ts
 * Türkiye Alım-Satım Yoğunluğu Haritası — MapLibre GL heatmap + POI katmanları
 *
 * Veri akışı:
 *   TKGM (tek seferlik) → scripts/tkgm-analiz-seed.mjs → D1
 *   Site → GET /v1/harita/analiz/birlesik → D1 → heatmap
 *
 * POI Katmanları (statik JSON):
 *   - Havalimanları (DHMİ kamuya açık liste)
 *   - OSB'ler (OSBÜK kamuya açık liste)
 *   - Lojistik merkezler / limanlar
 *
 * Yatırım Skoru:
 *   İlçe bazında OSB yakınlığı + havalimanı yakınlığı + tapu yoğunluğu birleşimi
 */

const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

const TIP_RENKLERI: Record<number, string> = {
  1: "#7c3aed",
  2: "#16a34a",
  3: "#dc2626",
  4: "#0891b2",
  5: "#ea580c",
};

const TIP_ETIKETLERI: Record<number, string> = {
  1: "Alım Satım Yoğunluğu",
  2: "Ana Taşınmaz Satış",
  3: "Ana Taşınmaz İpotekli Satış",
  4: "Bağımsız Bölüm Satış",
  5: "Bağımsız Bölüm İpotekli Satış",
};

// İl merkez koordinatları — ilçe listesi viewport filtresi için
const IL_MERKEZLER: Record<number, [number, number]> = {
  1:[37.00,35.32],2:[37.76,38.28],3:[38.76,30.54],4:[39.72,43.06],5:[40.65,35.83],
  6:[39.92,32.85],7:[36.90,30.70],8:[41.18,41.82],9:[37.85,27.85],10:[39.65,27.88],
  11:[40.15,29.97],12:[39.00,40.50],13:[38.40,42.11],14:[40.74,31.61],15:[37.72,30.29],
  16:[40.19,29.06],17:[40.15,26.41],18:[40.60,33.62],19:[40.55,34.95],20:[37.78,29.09],
  21:[37.91,40.22],22:[41.67,26.56],23:[38.68,39.22],24:[39.75,39.49],25:[39.91,41.27],
  26:[39.78,30.52],27:[37.07,37.38],28:[40.91,38.39],29:[40.44,39.48],30:[37.58,43.74],
  31:[36.60,36.16],32:[37.76,30.56],33:[36.80,34.64],34:[41.01,28.95],35:[38.42,27.14],
  36:[40.61,36.10],37:[41.37,33.78],38:[38.72,35.49],39:[41.73,27.22],40:[39.15,33.52],
  41:[40.85,29.88],42:[37.87,32.49],43:[39.42,29.98],44:[38.35,38.31],45:[38.62,27.43],
  46:[37.58,36.94],47:[37.32,40.74],48:[37.21,28.37],49:[38.73,41.49],50:[38.62,34.72],
  51:[37.97,34.68],52:[40.98,37.88],53:[41.02,40.52],54:[40.69,30.43],55:[41.28,36.33],
  56:[38.00,41.95],57:[42.03,35.15],58:[39.75,37.02],59:[41.42,27.98],60:[40.31,36.55],
  61:[40.99,39.73],62:[39.11,39.55],63:[37.16,38.80],64:[38.67,29.40],65:[38.50,43.41],
  66:[39.83,34.81],67:[41.46,31.80],68:[38.35,33.99],69:[40.62,43.10],70:[37.18,33.22],
  71:[40.11,33.51],72:[37.89,41.14],73:[37.52,42.46],74:[41.63,32.34],75:[41.08,42.71],
  76:[39.89,44.04],77:[40.65,29.27],78:[41.20,32.64],79:[36.72,37.12],80:[37.07,36.23],
  81:[40.84,31.16],
};

interface D1Nokta {
  parsel_id: number;
  enlem: number;
  boylam: number;
  sayi: number;
}

interface IlceBilgi {
  ilceKodu: number;
  ilceAdi: string;
  ilKodu: number;
  lat: number;
  lng: number;
}

interface HeatPoint {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { sayi: number };
}

// ─── POI tipleri ──────────────────────────────────────────────────────────────

interface PoiNokta {
  id: string;
  ad: string;
  kisa?: string;
  il?: string;
  lat: number;
  lng: number;
  tip: string;
}

interface PoiVeri {
  havalimanları: PoiNokta[];
  osblar: PoiNokta[];
  lojistik_merkezler: PoiNokta[];
}

// Aktif katman durumu — hangi POI katmanları açık
const katmanDurum: Record<string, boolean> = {
  "hava": false,
  "osb": false,
  "lojistik": false,
  "cdp-imar": false,
};

let harita: import("maplibre-gl").Map | null = null;
let aktifTip = 1;
let yuklenenIlceler = new Set<string>();
let tumNoktalar: HeatPoint[] = [];
let yukleniyor = false;
let poiVeri: PoiVeri | null = null;

// ─── Haversine mesafe (km) ────────────────────────────────────────────────────

function kmMesafe(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── POI statik verisini yükle ────────────────────────────────────────────────

async function poiVeriYukle(): Promise<PoiVeri> {
  if (poiVeri) return poiVeri;
  const res = await fetch("/geo/poi-katmanlari.json");
  if (!res.ok) throw new Error(`POI veri HTTP ${res.status}`);
  poiVeri = await res.json() as PoiVeri;
  return poiVeri;
}

// ─── D1 backend'den ilçe verisi çek ──────────────────────────────────────────

async function ilceBirlesikCek(ilceKodu: number, tip: number): Promise<D1Nokta[]> {
  const cacheKey = `harita-d1:${ilceKodu}:${tip}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached) as D1Nokta[];
  } catch {}

  const url = `${API_BASE}/harita/analiz/birlesik?ilceKodu=${ilceKodu}&analizTip=${tip}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { noktalar?: D1Nokta[] };
  const noktalar = data.noktalar ?? [];

  try { sessionStorage.setItem(cacheKey, JSON.stringify(noktalar)); } catch {}
  return noktalar;
}

// ─── TKGM idari yapı — ilçe listesi (backend proxy) ─────────────────────────

// İdari yapı (il/ilçe) TKGM'de nadiren değişir — backend zaten 30 gün cache'liyor,
// istemci tarafında da aynı süre localStorage'da tutup ilk yüklemeyi hızlandırıyoruz.
const ILCE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function tumIlceleriCek(): Promise<IlceBilgi[]> {
  const cacheKey = "tkgm-ilce-listesi-v3";
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { veri, zaman } = JSON.parse(cached) as { veri: IlceBilgi[]; zaman: number };
      if (Date.now() - zaman < ILCE_CACHE_TTL_MS) return veri;
    }
  } catch {}

  const ilceler: IlceBilgi[] = [];
  const ilKodlari = Array.from({ length: 81 }, (_, i) => i + 1);
  const GRUP = 24;

  for (let i = 0; i < ilKodlari.length; i += GRUP) {
    const grup = ilKodlari.slice(i, i + GRUP);
    await Promise.allSettled(
      grup.map(async (ilKodu) => {
        try {
          const res = await fetch(`${API_BASE}/proxy/tkgm-idari/ilceListe/${ilKodu}`);
          if (!res.ok) return;
          const data = await res.json() as {
            features?: Array<{ properties?: Record<string, unknown> }>;
          };
          const merkez = IL_MERKEZLER[ilKodu] ?? [39.0, 35.5];
          for (const f of data.features ?? []) {
            const p = (f.properties ?? {}) as Record<string, unknown>;
            const ilceKodu = Number(p["id"] ?? 0);
            if (!ilceKodu) continue;
            const idx = ilceler.filter(x => x.ilKodu === ilKodu).length;
            ilceler.push({
              ilceKodu,
              ilceAdi: String(p["text"] ?? p["ad"] ?? ""),
              ilKodu,
              lat: merkez[0] + ((idx % 6) - 2.5) * 0.25,
              lng: merkez[1] + (Math.floor(idx / 6) - 2) * 0.35,
            });
          }
        } catch {}
      })
    );
  }

  try {
    localStorage.setItem(cacheKey, JSON.stringify({ veri: ilceler, zaman: Date.now() }));
  } catch {}
  return ilceler;
}

// ─── GeoJSON source ───────────────────────────────────────────────────────────

function sourceGuncelle() {
  if (!harita) return;
  const geojson: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: tumNoktalar,
  };
  const src = harita.getSource("heat-src") as import("maplibre-gl").GeoJSONSource | undefined;
  if (src) {
    src.setData(geojson);
  } else {
    harita.addSource("heat-src", { type: "geojson", data: geojson });
  }
}

// ─── Layer ────────────────────────────────────────────────────────────────────

function layerEkleVeyaGuncelle(maxSayi: number) {
  if (!harita) return;
  const max = Math.max(maxSayi, 1);

  if (harita.getLayer("heat-cloud")) {
    harita.setPaintProperty("heat-cloud", "heatmap-weight", [
      "interpolate", ["linear"], ["get", "sayi"], 0, 0, max, 1,
    ]);
    return;
  }

  harita.addLayer({
    id: "heat-cloud",
    type: "heatmap",
    source: "heat-src",
    maxzoom: 16,
    paint: {
      "heatmap-weight": ["interpolate", ["linear"], ["get", "sayi"], 0, 0, max, 1],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 5, 0.5, 10, 1.5, 16, 3],
      "heatmap-color": [
        "interpolate", ["linear"], ["heatmap-density"],
        0,    "rgba(255,254,179,0)",
        0.15, "rgba(255,254,179,0.55)",
        0.4,  "rgba(253,174,97,0.78)",
        0.7,  "rgba(240,59,32,0.88)",
        1,    "rgba(189,0,38,0.96)",
      ],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 5, 7, 10, 20, 16, 45],
      "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.85, 16, 0.2],
    },
  });

  harita.addLayer({
    id: "heat-circle",
    type: "circle",
    source: "heat-src",
    minzoom: 14,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["get", "sayi"], 1, 4, 10, 16],
      "circle-color": TIP_RENKLERI[aktifTip] ?? "#7c3aed",
      "circle-opacity": 0.75,
      "circle-stroke-width": 1,
      "circle-stroke-color": "rgba(255,255,255,0.8)",
    },
  });
}

// ─── Görünen ilçeleri lazy yükle ─────────────────────────────────────────────

async function gorunenIlceleriYukle(ilceler: IlceBilgi[]) {
  if (!harita || yukleniyor) return;

  const bounds = harita.getBounds();
  if (!bounds) return;

  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const latPad = (ne.lat - sw.lat) * 0.2;
  const lngPad = (ne.lng - sw.lng) * 0.2;

  const gorünenler = ilceler.filter((ilce) =>
    ilce.lat >= sw.lat - latPad && ilce.lat <= ne.lat + latPad &&
    ilce.lng >= sw.lng - lngPad && ilce.lng <= ne.lng + lngPad
  );

  const yuklenecekler = gorünenler.filter(
    (ilce) => !yuklenenIlceler.has(`${ilce.ilceKodu}:${aktifTip}`)
  );

  if (yuklenecekler.length === 0) return;

  yukleniyor = true;
  durumGuncelle(`${yuklenecekler.length} ilçe yükleniyor…`);

  const CONCURRENCY = 6; // D1 backend hızlı — daha yüksek concurrency
  for (let i = 0; i < yuklenecekler.length; i += CONCURRENCY) {
    const grup = yuklenecekler.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      grup.map(async (ilce) => {
        const key = `${ilce.ilceKodu}:${aktifTip}`;
        yuklenenIlceler.add(key);
        try {
          const noktalar = await ilceBirlesikCek(ilce.ilceKodu, aktifTip);
          tumNoktalar.push(
            ...noktalar.map((n): HeatPoint => ({
              type: "Feature",
              geometry: { type: "Point", coordinates: [n.boylam, n.enlem] },
              properties: { sayi: n.sayi },
            }))
          );
        } catch {
          // sessiz fail — seed edilmemiş ilçe
        }
      })
    );
    // Harita çizimini ilçe başına değil, batch başına güncelle — "damla damla"
    // yerine düzgün, birkaç kademeli adımda dolan bir görünüm.
    sourceGuncelle();
    const araMaxSayi = tumNoktalar.reduce((m, p) => Math.max(m, (p.properties as { sayi: number }).sayi), 1);
    layerEkleVeyaGuncelle(araMaxSayi);
  }

  const toplamNokta = tumNoktalar.length;
  durumGuncelle(`${toplamNokta.toLocaleString("tr-TR")} işlem noktası (tüm yıllar birleşik)`);
  istatistikGuncelle(toplamNokta);
  yukleniyor = false;
}

// ─── UI ───────────────────────────────────────────────────────────────────────

function durumGuncelle(metin: string) {
  const el = document.getElementById("harita-guncelleme");
  if (el) el.textContent = `⏱ ${metin}`;
}

function istatistikGuncelle(n: number) {
  const el = document.getElementById("stat-aktif");
  if (el) el.textContent = n > 0 ? n.toLocaleString("tr-TR") : "—";
}

function legendGuncelle(tip: number) {
  const legend = document.getElementById("analiz-legend");
  if (!legend) return;
  legend.innerHTML = "";
  Object.entries(TIP_ETIKETLERI).forEach(([tipNo, etiket]) => {
    const active = Number(tipNo) === tip;
    const li = document.createElement("div");
    li.className = [
      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs font-medium transition select-none",
      active
        ? "bg-white text-slate-800 shadow-sm"
        : "text-slate-400 hover:bg-slate-700 hover:text-slate-200",
    ].join(" ");
    li.dataset["tip"] = tipNo;
    li.setAttribute("role", "button");
    li.setAttribute("aria-pressed", active ? "true" : "false");
    const dot = document.createElement("span");
    dot.className = "w-2.5 h-2.5 rounded-full shrink-0";
    dot.style.background = TIP_RENKLERI[Number(tipNo)] ?? "#888";
    li.appendChild(dot);
    li.appendChild(document.createTextNode(etiket));
    legend.appendChild(li);
  });
}

// ─── POI GeoJSON source & layer yönetimi ─────────────────────────────────────

function poiSourceEkle(id: string, noktalar: PoiNokta[]) {
  if (!harita) return;
  const geojson: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: noktalar.map((n) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [n.lng, n.lat] },
      properties: { id: n.id, ad: n.ad, kisa: n.kisa ?? "", il: n.il ?? "", tip: n.tip },
    })),
  };
  if (!harita.getSource(id)) {
    harita.addSource(id, { type: "geojson", data: geojson });
  }
}

// MLPopup — dinamik import sonrası atanır
let MLPopup: typeof import("maplibre-gl").Popup | null = null;

function poiPopupGoster(lngLat: import("maplibre-gl").LngLat, html: string) {
  if (!harita || !MLPopup) return;
  new MLPopup({ closeButton: true, maxWidth: "260px" })
    .setLngLat(lngLat)
    .setHTML(`<div style="font-family:inherit;padding:2px 4px">${html}</div>`)
    .addTo(harita);
}

function havalimanıLayerEkle() {
  if (!harita || harita.getLayer("poi-hava-circle")) return;
  harita.addLayer({
    id: "poi-hava-circle",
    type: "circle",
    source: "poi-hava",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 5, 8, 10, 12, 16],
      "circle-color": ["match", ["get", "tip"], "uluslararasi", "#38bdf8", "#7dd3fc"],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#0ea5e9",
      "circle-opacity": 0.9,
    },
  });
  harita.addLayer({
    id: "poi-hava-label",
    type: "symbol",
    source: "poi-hava",
    minzoom: 6,
    layout: {
      "text-field": ["get", "kisa"],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-size": 10,
      "text-offset": [0, 1.4],
      "text-anchor": "top",
    },
    paint: { "text-color": "#e0f2fe", "text-halo-color": "#0c4a6e", "text-halo-width": 1.5 },
  });
  harita.on("click", "poi-hava-circle", (e) => {
    const p = e.features?.[0]?.properties as Record<string, string> | undefined;
    if (!p) return;
    const tip = p["tip"] === "uluslararasi" ? "Uluslararası" : "İç Hat";
    poiPopupGoster(e.lngLat,
      `<strong style="font-size:13px">${p["ad"] ?? ""}</strong><br>
       <span style="font-size:11px;color:#94a3b8">✈️ ${tip} Havalimanı</span>`);
  });
}

function osbLayerEkle() {
  if (!harita || harita.getLayer("poi-osb-circle")) return;
  harita.addLayer({
    id: "poi-osb-circle",
    type: "circle",
    source: "poi-osb",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"],
        4, ["match", ["get", "tip"], "buyuk", 6, "orta", 4, 3],
        8, ["match", ["get", "tip"], "buyuk", 12, "orta", 9, 6],
        12, ["match", ["get", "tip"], "buyuk", 18, "orta", 14, 10],
      ],
      "circle-color": ["match", ["get", "tip"],
        "buyuk", "#f59e0b", "orta", "#fbbf24", "ihtisas", "#a78bfa", "#fde68a"],
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#d97706",
      "circle-opacity": 0.85,
    },
  });
  harita.addLayer({
    id: "poi-osb-label",
    type: "symbol",
    source: "poi-osb",
    minzoom: 7,
    layout: {
      "text-field": ["get", "il"],
      "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
      "text-size": 9,
      "text-offset": [0, 1.3],
      "text-anchor": "top",
    },
    paint: { "text-color": "#fef3c7", "text-halo-color": "#78350f", "text-halo-width": 1.2 },
  });
  harita.on("click", "poi-osb-circle", (e) => {
    const p = e.features?.[0]?.properties as Record<string, string> | undefined;
    if (!p) return;
    const tipEtiket: Record<string, string> = {
      buyuk: "Büyük OSB", orta: "Orta Ölçekli OSB", kucuk: "Küçük OSB", ihtisas: "İhtisas OSB",
    };
    poiPopupGoster(e.lngLat,
      `<strong style="font-size:13px">${p["ad"] ?? ""}</strong><br>
       <span style="font-size:11px;color:#94a3b8">🏭 ${tipEtiket[p["tip"] ?? ""] ?? "OSB"} · ${p["il"] ?? ""}</span>`);
  });
}

function lojistikLayerEkle() {
  if (!harita || harita.getLayer("poi-loj-circle")) return;
  harita.addLayer({
    id: "poi-loj-circle",
    type: "circle",
    source: "poi-loj",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 5, 8, 10, 12, 15],
      "circle-color": ["match", ["get", "tip"], "liman", "#34d399", "#6ee7b7"],
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#059669",
      "circle-opacity": 0.85,
    },
  });
  harita.addLayer({
    id: "poi-loj-label",
    type: "symbol",
    source: "poi-loj",
    minzoom: 7,
    layout: {
      "text-field": ["get", "il"],
      "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
      "text-size": 9,
      "text-offset": [0, 1.3],
      "text-anchor": "top",
    },
    paint: { "text-color": "#d1fae5", "text-halo-color": "#064e3b", "text-halo-width": 1.2 },
  });
  harita.on("click", "poi-loj-circle", (e) => {
    const p = e.features?.[0]?.properties as Record<string, string> | undefined;
    if (!p) return;
    const ikon = p["tip"] === "liman" ? "⚓" : "🚛";
    poiPopupGoster(e.lngLat,
      `<strong style="font-size:13px">${p["ad"] ?? ""}</strong><br>
       <span style="font-size:11px;color:#94a3b8">${ikon} ${p["tip"] === "liman" ? "Liman" : "Lojistik Merkez"} · ${p["il"] ?? ""}</span>`);
  });
}

// ─── Katman görünürlük toggle ─────────────────────────────────────────────────

const POI_LAYER_MAP: Record<string, { layerIds: string[]; srcId: string; yukle: () => void }> = {
  hava:     { layerIds: ["poi-hava-circle", "poi-hava-label"],   srcId: "poi-hava", yukle: havalimanıLayerEkle },
  osb:      { layerIds: ["poi-osb-circle", "poi-osb-label"],     srcId: "poi-osb",  yukle: osbLayerEkle },
  lojistik: { layerIds: ["poi-loj-circle", "poi-loj-label"],     srcId: "poi-loj",  yukle: lojistikLayerEkle },
};

async function katmanToggle(katman: string) {
  if (!harita) return;
  const acik = !katmanDurum[katman];
  katmanDurum[katman] = acik;

  // CDP imar katmanı özel mantık
  if (katman === "cdp-imar") {
    if (acik) {
      cdpKatmanGuncelle();
    } else {
      if (aktifCdpSlug) {
        const eskiLayer = `cdp-layer-${aktifCdpSlug}`;
        if (harita.getLayer(eskiLayer)) {
          harita.setLayoutProperty(eskiLayer, "visibility", "none");
        }
      }
    }
    btnToggleGuncelle(katman, acik);
    return;
  }

  const cfg = POI_LAYER_MAP[katman];
  if (!cfg) return;

  if (acik) {
    if (!harita.getSource(cfg.srcId)) {
      const veri = await poiVeriYukle();
      const noktaMap: Record<string, PoiNokta[]> = {
        hava: veri.havalimanları,
        osb: veri.osblar,
        lojistik: veri.lojistik_merkezler,
      };
      poiSourceEkle(cfg.srcId, noktaMap[katman] ?? []);
    }
    cfg.yukle();
    cfg.layerIds.forEach((id) => {
      if (harita?.getLayer(id)) harita.setLayoutProperty(id, "visibility", "visible");
    });
  } else {
    cfg.layerIds.forEach((id) => {
      if (harita?.getLayer(id)) harita.setLayoutProperty(id, "visibility", "none");
    });
  }

  btnToggleGuncelle(katman, acik);
}

function btnToggleGuncelle(katman: string, acik: boolean) {
  const btn = document.querySelector(`[data-katman="${katman}"]`) as HTMLElement | null;
  if (btn) {
    btn.setAttribute("aria-pressed", acik ? "true" : "false");
    btn.classList.toggle("bg-slate-600", acik);
    btn.classList.toggle("text-white", acik);
    btn.classList.toggle("text-slate-400", !acik);
  }
}

// ─── TUCBS ÇDP İmar Katmanı (WMS tile) ───────────────────────────────────────
// Her slug bölgesel ÇDP'yi kapsar. Viewport merkezi lng'ye göre slug seçilir.
// Backend /v1/proxy/tucbs/tile?wms=SLUG&bbox=BBOX üzerinden proxy'lenir.

const CDP_SLUGLARI: Array<{ slug: string; minLng: number; maxLng: number; ad: string }> = [
  { slug: "csb_cdp_im_wms",      minLng: 26.0, maxLng: 29.5,  ad: "İstanbul ÇDP" },
  { slug: "csb_cdp_ma_wms",      minLng: 32.0, maxLng: 37.5,  ad: "Adana-Mersin ÇDP" },
  { slug: "csb_cdp_abi_wms",     minLng: 29.0, maxLng: 33.0,  ad: "Antalya ÇDP" },
  { slug: "csb_cdp_kk_wms",      minLng: 34.5, maxLng: 40.0,  ad: "Karadeniz Kıyı ÇDP" },
  { slug: "csb_cdp_ergene_wms",  minLng: 26.0, maxLng: 28.0,  ad: "Ergene ÇDP" },
  { slug: "csb_cdp_knna_wms",    minLng: 32.5, maxLng: 36.0,  ad: "Konya-Karaman ÇDP" },
  { slug: "csb_cdp_ysk_wms",     minLng: 36.5, maxLng: 43.0,  ad: "Doğu Anadolu ÇDP" },
  { slug: "csb_cdp_zbk_wms",     minLng: 31.0, maxLng: 34.5,  ad: "Zonguldak-Bartın ÇDP" },
  { slug: "csb_cdp_skc_wms",     minLng: 35.5, maxLng: 39.0,  ad: "Samsun-Çorum ÇDP" },
  { slug: "csb_cdp_asd_wms",     minLng: 27.0, maxLng: 30.5,  ad: "Aydın-Söke ÇDP" },
  { slug: "csb_cdp_mbv_wms",     minLng: 27.5, maxLng: 30.0,  ad: "Muğla-Bodrum ÇDP" },
  { slug: "csb_cdp_akia_wms",    minLng: 29.5, maxLng: 33.5,  ad: "Akdeniz İç Alan ÇDP" },
  { slug: "csb_cdp_yalova_wms",  minLng: 29.0, maxLng: 30.0,  ad: "Yalova ÇDP" },
  { slug: "csb_cdp_kirikkale_wms", minLng: 32.5, maxLng: 34.5, ad: "Kırıkkale ÇDP" },
  { slug: "csb_cdp_bolu_wms",    minLng: 30.5, maxLng: 32.5,  ad: "Bolu ÇDP" },
  { slug: "csb_cdp_amasya_wms",  minLng: 35.0, maxLng: 37.5,  ad: "Amasya ÇDP" },
  { slug: "csb_cdp_osmaniye_wms", minLng: 36.0, maxLng: 37.5, ad: "Osmaniye ÇDP" },
  { slug: "csb_cdp_kilis_wms",   minLng: 36.5, maxLng: 38.0,  ad: "Kilis ÇDP" },
];

function cdpSlugSec(lng: number): string {
  // En küçük alanı öne al — viewport merge çakışmasını önler
  const eslesme = CDP_SLUGLARI
    .filter((c) => lng >= c.minLng && lng <= c.maxLng)
    .sort((a, b) => (a.maxLng - a.minLng) - (b.maxLng - b.minLng));
  return eslesme[0]?.slug ?? "csb_cdp_im_wms";
}

function cdpImarKatmanEkle(slug: string) {
  if (!harita) return;
  const srcId = `cdp-src-${slug}`;
  const layerId = `cdp-layer-${slug}`;
  if (harita.getLayer(layerId)) {
    harita.setLayoutProperty(layerId, "visibility", "visible");
    return;
  }
  if (!harita.getSource(srcId)) {
    harita.addSource(srcId, {
      type: "raster",
      tiles: [
        `${API_BASE}/proxy/tucbs/tile?wms=${slug}&bbox={bbox-epsg-3857}`,
      ],
      tileSize: 256,
      attribution: "© TUCBS / CSB — Çevre Düzeni Planı",
    });
  }
  harita.addLayer({
    id: layerId,
    type: "raster",
    source: srcId,
    minzoom: 7,
    maxzoom: 18,
    paint: { "raster-opacity": 0.55 },
  }, "heat-cloud"); // heatmap'in altına
}

let aktifCdpSlug: string | null = null;

function cdpKatmanGuncelle() {
  if (!harita || !katmanDurum["cdp-imar"]) return;
  const center = harita.getCenter();
  const yeniSlug = cdpSlugSec(center.lng);
  if (yeniSlug === aktifCdpSlug) return;

  // Eski slug'ı gizle
  if (aktifCdpSlug) {
    const eskiLayer = `cdp-layer-${aktifCdpSlug}`;
    if (harita.getLayer(eskiLayer)) {
      harita.setLayoutProperty(eskiLayer, "visibility", "none");
    }
  }
  aktifCdpSlug = yeniSlug;
  cdpImarKatmanEkle(yeniSlug);

  // Bilgi etiketini güncelle
  const bilgi = document.getElementById("cdp-bilgi");
  const cdpInfo = CDP_SLUGLARI.find((c) => c.slug === yeniSlug);
  if (bilgi && cdpInfo) bilgi.textContent = cdpInfo.ad;
}

function tipDegistir(yeniTip: number, ilceler: IlceBilgi[]) {
  aktifTip = yeniTip;
  tumNoktalar = [];
  const temiz = new Set<string>();
  for (const k of yuklenenIlceler) {
    if (!k.endsWith(`:${yeniTip}`)) temiz.add(k);
  }
  yuklenenIlceler = temiz;
  sourceGuncelle();
  legendGuncelle(yeniTip);
  if (harita?.getLayer("heat-circle")) {
    harita.setPaintProperty("heat-circle", "circle-color", TIP_RENKLERI[yeniTip] ?? "#7c3aed");
  }
  void gorunenIlceleriYukle(ilceler);
}

// ─── Ana init ─────────────────────────────────────────────────────────────────

export async function initHarita() {
  const konteyner = document.getElementById("turkiye-harita");
  if (!konteyner) return;

  if (!document.getElementById("maplibre-css")) {
    const link = document.createElement("link");
    link.id = "maplibre-css";
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";
    document.head.appendChild(link);
  }

  document.getElementById("harita-yukleniyor")?.remove();

  const { Map: MLMap, NavigationControl, AttributionControl, Popup } = await import("maplibre-gl");
  MLPopup = Popup;

  harita = new MLMap({
    container: "turkiye-harita",
    style: {
      version: 8,
      // POI katmanlarındaki symbol/text-field layer'ları (havalimanı/OSB/liman
      // etiketleri) glyphs olmadan sessizce başarısız oluyordu (MapLibre "error"
      // event'i — throw etmiyor, log'a düşüyor). OpenMapTiles'ın açık glyphs
      // servisi ile düzeltildi.
      glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
      sources: {
        basemap: {
          type: "raster",
          tiles: [
            "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
            "https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
          ],
          tileSize: 256,
          attribution: "© CARTO · © OpenStreetMap",
        },
      },
      layers: [{ id: "bg", type: "raster", source: "basemap" }],
    },
    center: [35.5, 39.0],
    zoom: 5.5,
    minZoom: 4,
    maxZoom: 18,
    attributionControl: false,
  });

  harita.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
  harita.addControl(new AttributionControl({ compact: true }), "bottom-left");

  // Legend (yıl seçici yok — birleşik mod varsayılan)
  legendGuncelle(aktifTip);

  // Yıl seçiciyi gizle — zaten tüm yıllar birleşik
  const yilSelect = document.getElementById("zaman-filtre") as HTMLElement | null;
  if (yilSelect) {
    const parent = yilSelect.closest(".flex") as HTMLElement | null;
    if (parent) parent.style.display = "none";
  }

  // İlçe listesini çek
  durumGuncelle("İlçe listesi yükleniyor…");
  const ilceler = await tumIlceleriCek();
  document.getElementById("stat-ilce")!.textContent = String(ilceler.length);

  harita.on("load", async () => {
    sourceGuncelle();
    await gorunenIlceleriYukle(ilceler);
  });

  harita.on("moveend", () => {
    void gorunenIlceleriYukle(ilceler);
    cdpKatmanGuncelle();
  });

  // Legend tıklama — analiz tipi değiştir
  document.getElementById("analiz-legend")?.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest("[data-tip]") as HTMLElement | null;
    if (!target?.dataset["tip"]) return;
    const yeniTip = Number(target.dataset["tip"]);
    if (yeniTip === aktifTip) return;
    tipDegistir(yeniTip, ilceler);
  });

  // POI katman toggle butonları
  document.getElementById("poi-katman-panel")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("[data-katman]") as HTMLElement | null;
    if (!btn?.dataset["katman"]) return;
    void katmanToggle(btn.dataset["katman"]);
  });
}
