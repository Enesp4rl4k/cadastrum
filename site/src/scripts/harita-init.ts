/**
 * harita-init.ts
 * Türkiye Alım-Satım Yoğunluğu Haritası — MapLibre GL heatmap
 *
 * Veri akışı:
 *   TKGM (tek seferlik) → scripts/tkgm-analiz-seed.mjs → D1
 *   Site → GET /v1/harita/analiz/birlesik → D1 → heatmap
 *
 * Ek katman: TUCBS Çevre Düzeni Planı WMS — backend proxy tile endpoint'i.
 * Zoom 8+'dan itibaren imar renkleri görünür, toggle ile açılıp kapanır.
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

let harita: import("maplibre-gl").Map | null = null;
let aktifTip = 1;
let yuklenenIlceler = new Set<string>();
let tumNoktalar: HeatPoint[] = [];
let yukleniyor = false;

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

  const { Map: MLMap, NavigationControl, AttributionControl } = await import("maplibre-gl");

  harita = new MLMap({
    container: "turkiye-harita",
    style: {
      version: 8,
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
  });

  // Legend tıklama
  document.getElementById("analiz-legend")?.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest("[data-tip]") as HTMLElement | null;
    if (!target?.dataset["tip"]) return;
    const yeniTip = Number(target.dataset["tip"]);
    if (yeniTip === aktifTip) return;
    tipDegistir(yeniTip, ilceler);
  });
}
