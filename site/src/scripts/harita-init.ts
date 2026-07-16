/**
 * harita-init.ts
 * Türkiye Alım-Satım Yoğunluğu Haritası — MapLibre GL heatmap + POI katmanları + Otoyol/D-yol
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

// ─── Fiyat choropleth renk paleti (TL/m² log skala) ──────────────────────────
// Logaritmik interpolasyon: 500 TL/m² (kırsal) → 100.000 TL/m² (İstanbul merkez)

const FIYAT_SKALA = [
  { eşik: 500,    renk: "#f1f5f9", etiket: "< 500" },
  { eşik: 1500,   renk: "#bfdbfe", etiket: "500 – 1.5K" },
  { eşik: 4000,   renk: "#60a5fa", etiket: "1.5K – 4K" },
  { eşik: 10000,  renk: "#2563eb", etiket: "4K – 10K" },
  { eşik: 25000,  renk: "#1d4ed8", etiket: "10K – 25K" },
  { eşik: 60000,  renk: "#1e3a8a", etiket: "25K – 60K" },
  { eşik: Infinity, renk: "#0f172a", etiket: "> 60K" },
];

function fiyatRenk(tlm2: number): string {
  for (const { eşik, renk } of FIYAT_SKALA) {
    if (tlm2 < eşik) return renk;
  }
  return FIYAT_SKALA[FIYAT_SKALA.length - 1]!.renk;
}

function fmtTLM2(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M TL/m²`;
  if (n >= 1_000)    return `${(n / 1_000).toFixed(0)}K TL/m²`;
  return `${n.toLocaleString("tr-TR")} TL/m²`;
}

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

// ─── Fiyat choropleth state ────────────────────────────────────────────────────

interface IlFiyatOzet {
  il_norm: string;
  medyan: number;
  ilan_adet: number;
  kaynak: "ilan" | "ai-baseline";
}

let fiyatKategori: "arsa" | "tarla" = "arsa";
let fiyatKatmanAcik = false;
let fiyatVerisi: IlFiyatOzet[] = [];

async function fiyatVerisiCek(kategori: "arsa" | "tarla"): Promise<IlFiyatOzet[]> {
  const cacheKey = `fiyat-ozet-v1:${kategori}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { veri, ts } = JSON.parse(cached) as { veri: IlFiyatOzet[]; ts: number };
      // 2 saat cache
      if (Date.now() - ts < 7_200_000) return veri;
    }
  } catch {}

  const res = await fetch(`${API_BASE}/fiyat/toplu-ozet?kategori=${kategori}`);
  if (!res.ok) throw new Error(`fiyat/toplu-ozet HTTP ${res.status}`);
  const data = await res.json() as { iller: IlFiyatOzet[] };
  const veri = data.iller ?? [];

  try { sessionStorage.setItem(cacheKey, JSON.stringify({ veri, ts: Date.now() })); } catch {}
  return veri;
}

/** İl centroid koordinatları — choropleth daireler için (il kodu → [lat, lng]) */
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

function fiyatKatmanEkle(veri: IlFiyatOzet[]) {
  if (!harita) return;

  // Fiyat verisini il_norm → medyan eşlemesine çevir
  const fiyatMap = new Map(veri.map(d => [d.il_norm, d]));

  // GeoJSON Feature'larını centroid üzerinden oluştur
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

  const srcId = "fiyat-src";
  const circleId = "fiyat-circle";
  const labelId  = "fiyat-label";

  const src = harita.getSource(srcId) as import("maplibre-gl").GeoJSONSource | undefined;
  if (src) {
    src.setData(geojson);
  } else {
    harita.addSource(srcId, { type: "geojson", data: geojson });

    harita.addLayer({
      id: circleId,
      type: "circle",
      source: srcId,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 16, 6, 22, 8, 30],
        "circle-color": ["get", "renk"],
        "circle-opacity": 0.82,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "rgba(255,255,255,0.6)",
      },
    });

    harita.addLayer({
      id: labelId,
      type: "symbol",
      source: srcId,
      minzoom: 5,
      layout: {
        "text-field": ["get", "etiket"],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 5, 9, 8, 11],
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

    // Tıklama popup
    harita.on("click", circleId, (e) => {
      const p = e.features?.[0]?.properties as Record<string, unknown> | undefined;
      if (!p || !MLPopup || !harita) return;
      const ilNorm = String(p["il_norm"]);
      const ilAd = ilNorm.charAt(0).toUpperCase() + ilNorm.slice(1);
      const kaynakBadge = p["kaynak"] === "ilan"
        ? `<span style="color:#4ade80">● Gerçek ilan</span>`
        : `<span style="color:#fb923c">● AI tahmin</span>`;
      const popupId = `popup-il-${ilNorm.replace(/[^a-z]/g, "")}`;

      const popup = new MLPopup({ closeButton: true, maxWidth: "280px" })
        .setLngLat(e.lngLat)
        .setHTML(`
          <div id="${popupId}" style="font-family:Inter,sans-serif;padding:2px 4px;min-width:220px">
            <div style="font-weight:700;font-size:14px;color:#1e293b;margin-bottom:4px">${ilAd}</div>
            <div style="font-size:18px;font-weight:800;color:${String(p["renk"])};font-variant-numeric:tabular-nums">
              ${String(p["etiket"])}
            </div>
            <div style="font-size:10px;color:#94a3b8;margin-top:2px;margin-bottom:8px">
              ${Number(p["ilan_adet"])} ilan · ${kaynakBadge}
            </div>
            <div id="${popupId}-ilceler" style="font-size:10px;color:#64748b">
              <span style="color:#94a3b8">İlçe detayları yükleniyor…</span>
            </div>
          </div>
        `)
        .addTo(harita);

      // Popup açıldıktan sonra ilçe listesini lazy yükle
      void (async () => {
        await new Promise<void>(r => setTimeout(r, 50));
        const ilcelerEl = document.getElementById(`${popupId}-ilceler`);
        if (!ilcelerEl) return;
        try {
          const res = await fetch(`${API_BASE}/fiyat/ilce/${ilNorm}?kategori=${fiyatKategori}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json() as {
            mahalleler?: Array<{ ilce_norm: string; medyan: number; ilan_adet: number }>;
          };
          const ilceler = (data.mahalleler ?? []).slice(0, 8);
          if (ilceler.length === 0) {
            ilcelerEl.textContent = "İlçe verisi yok";
            return;
          }
          const maxMedyan = Math.max(...ilceler.map(i => i.medyan));
          ilcelerEl.innerHTML = [
            `<div style="font-weight:600;color:#94a3b8;font-size:9px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">En Pahalı İlçeler</div>`,
            ...ilceler.map(ilce => {
              const bar = Math.round((ilce.medyan / maxMedyan) * 100);
              const renk = fiyatRenk(ilce.medyan);
              const ad = ilce.ilce_norm.charAt(0).toUpperCase() + ilce.ilce_norm.slice(1);
              return `<div style="margin-bottom:5px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
                  <span style="color:#e2e8f0;font-size:10px">${ad}</span>
                  <span style="color:${renk};font-size:10px;font-weight:700;font-variant-numeric:tabular-nums">${fmtTLM2(ilce.medyan)}</span>
                </div>
                <div style="height:3px;background:#334155;border-radius:2px;overflow:hidden">
                  <div style="height:100%;width:${bar}%;background:${renk};border-radius:2px"></div>
                </div>
              </div>`;
            }),
            `<div style="text-align:right;margin-top:4px">
              <a href="/veri/${ilNorm}" style="color:#60a5fa;font-size:9px;text-decoration:none">Tüm mahalleler →</a>
            </div>`,
          ].join("");
        } catch {
          if (ilcelerEl) ilcelerEl.textContent = "İlçe verisi alınamadı";
        }
      })();

      void popup;
    });

    harita.on("mouseenter", circleId, () => {
      if (harita) harita.getCanvas().style.cursor = "pointer";
    });
    harita.on("mouseleave", circleId, () => {
      if (harita) harita.getCanvas().style.cursor = "";
    });
  }
}

function fiyatKatmanGorunurluk(gorünür: boolean) {
  if (!harita) return;
  const vis = gorünür ? "visible" : "none";
  if (harita.getLayer("fiyat-circle")) harita.setLayoutProperty("fiyat-circle", "visibility", vis);
  if (harita.getLayer("fiyat-label"))  harita.setLayoutProperty("fiyat-label",  "visibility", vis);
}

async function fiyatToggle(kategori: "arsa" | "tarla" = "arsa") {
  if (!harita) return;

  // Kategori değiştiyse veriye yeniden çek
  if (kategori !== fiyatKategori || fiyatVerisi.length === 0) {
    fiyatKategori = kategori;
    try {
      fiyatVerisi = await fiyatVerisiCek(kategori);
      fiyatKatmanEkle(fiyatVerisi);
    } catch (e) {
      console.warn("[choropleth] fiyat verisi alınamadı:", e);
      return;
    }
  } else {
    fiyatKatmanEkle(fiyatVerisi);
  }

  fiyatKatmanAcik = true;
  fiyatKatmanGorunurluk(true);
  fiyatLegendGuncelle();
}

function fiyatKatmanKapat() {
  fiyatKatmanAcik = false;
  fiyatKatmanGorunurluk(false);
}

// ─── Likidite choropleth ───────────────────────────────────────────────────────

interface IlLikiditeSonuc {
  il_norm: string;
  skor: number;
  yillik_satis: number;
  ipotekli_oran: number;
  nufus_m: number;
  etiket: string;
}

let likiditKatmanAcik = false;
let likiditKategori: "arsa" | "tarla" = "arsa";
let likiditVerisi: IlLikiditeSonuc[] = [];

const LIKIDITE_SKALA = [
  { esik: 0.30, renk: "#1e293b", etiket: "Düşük" },
  { esik: 0.50, renk: "#334155", etiket: "Normal" },
  { esik: 0.70, renk: "#0369a1", etiket: "Aktif" },
  { esik: 0.85, renk: "#0ea5e9", etiket: "Çok Aktif" },
  { esik: Infinity, renk: "#38bdf8", etiket: "En Likit" },
];

function likiditRenk(skor: number): string {
  for (const { esik, renk } of LIKIDITE_SKALA) {
    if (skor < esik) return renk;
  }
  return LIKIDITE_SKALA[LIKIDITE_SKALA.length - 1]!.renk;
}

async function likiditVerisiCek(kategori: "arsa" | "tarla"): Promise<IlLikiditeSonuc[]> {
  const cacheKey = `likidite-v1:${kategori}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { veri, ts } = JSON.parse(cached) as { veri: IlLikiditeSonuc[]; ts: number };
      if (Date.now() - ts < 86_400_000) return veri; // 24 saat cache
    }
  } catch {}
  const res = await fetch(`${API_BASE}/harita/likidite?kategori=${kategori}`);
  if (!res.ok) throw new Error(`likidite HTTP ${res.status}`);
  const data = await res.json() as { iller: IlLikiditeSonuc[] };
  const veri = data.iller ?? [];
  try { sessionStorage.setItem(cacheKey, JSON.stringify({ veri, ts: Date.now() })); } catch {}
  return veri;
}

function likiditKatmanEkle(veri: IlLikiditeSonuc[]) {
  if (!harita) return;
  const fiyatMap = new Map(veri.map(d => [d.il_norm, d]));
  const features: GeoJSON.Feature[] = [];
  for (const [ilNorm, centroid] of Object.entries(IL_CENTROID)) {
    const bilgi = fiyatMap.get(ilNorm);
    if (!bilgi) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [centroid[1], centroid[0]] },
      properties: {
        il_norm: ilNorm,
        skor: bilgi.skor,
        yillik_satis: bilgi.yillik_satis,
        etiket: bilgi.etiket,
        renk: likiditRenk(bilgi.skor),
        boyut: Math.round(10 + bilgi.skor * 20), // 10-30px arası
      },
    });
  }
  const geojson: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
  const srcId = "likidite-src";
  const src = harita.getSource(srcId) as import("maplibre-gl").GeoJSONSource | undefined;
  if (src) {
    src.setData(geojson);
  } else {
    harita.addSource(srcId, { type: "geojson", data: geojson });
    harita.addLayer({
      id: "likidite-circle",
      type: "circle",
      source: srcId,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, ["get", "boyut"], 6, ["+", ["get", "boyut"], 8], 8, ["+", ["get", "boyut"], 18]],
        "circle-color": ["get", "renk"],
        "circle-opacity": 0.80,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "rgba(255,255,255,0.5)",
      },
    });
    harita.addLayer({
      id: "likidite-label",
      type: "symbol",
      source: srcId,
      minzoom: 5,
      layout: {
        "text-field": ["get", "etiket"],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 5, 8, 8, 10],
        "text-offset": [0, 1.8],
        "text-anchor": "top",
        "text-allow-overlap": false,
        "text-optional": true,
      },
      paint: {
        "text-color": "#e0f2fe",
        "text-halo-color": "#0c4a6e",
        "text-halo-width": 1.5,
      },
    });
    harita.on("click", "likidite-circle", (e) => {
      const p = e.features?.[0]?.properties as Record<string, unknown> | undefined;
      if (!p || !MLPopup || !harita) return;
      const ilAd = String(p["il_norm"]);
      const skor = Number(p["skor"]);
      const renk = String(p["renk"]);
      new MLPopup({ closeButton: true, maxWidth: "260px" })
        .setLngLat(e.lngLat)
        .setHTML(`
          <div style="font-family:Inter,sans-serif;padding:2px 4px;min-width:200px">
            <div style="font-weight:700;font-size:14px;color:#1e293b;margin-bottom:4px">
              ${ilAd.charAt(0).toUpperCase() + ilAd.slice(1)}
            </div>
            <div style="font-size:18px;font-weight:800;color:${renk}">${String(p["etiket"])}</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px">
              Likidite skoru: <strong>${Math.round(skor * 100)}%</strong><br>
              Yıllık satış: <strong>${Number(p["yillik_satis"]).toLocaleString("tr-TR")}</strong>
            </div>
          </div>
        `)
        .addTo(harita);
    });
    harita.on("mouseenter", "likidite-circle", () => { if (harita) harita.getCanvas().style.cursor = "pointer"; });
    harita.on("mouseleave", "likidite-circle", () => { if (harita) harita.getCanvas().style.cursor = ""; });
  }
}

function likiditKatmanGorunurluk(gorünür: boolean) {
  if (!harita) return;
  const vis = gorünür ? "visible" : "none";
  if (harita.getLayer("likidite-circle")) harita.setLayoutProperty("likidite-circle", "visibility", vis);
  if (harita.getLayer("likidite-label"))  harita.setLayoutProperty("likidite-label",  "visibility", vis);
}

async function likiditToggle(kategori: "arsa" | "tarla" = "arsa") {
  if (!harita) return;
  if (kategori !== likiditKategori || likiditVerisi.length === 0) {
    likiditKategori = kategori;
    try {
      likiditVerisi = await likiditVerisiCek(kategori);
      likiditKatmanEkle(likiditVerisi);
    } catch (e) {
      console.warn("[likidite] veri alınamadı:", e);
      return;
    }
  } else {
    likiditKatmanEkle(likiditVerisi);
  }
  likiditKatmanAcik = true;
  likiditKatmanGorunurluk(true);
}

// ─── Trend / sıcaklık choropleth ───────────────────────────────────────────────

interface IlTrendSonuc {
  il_norm: string;
  degisim_yuzde: number;
  son3_ort: number | null;
  once3_ort: number | null;
  veri_var: boolean;
  etiket: string;
}

let trendKatmanAcik = false;
let trendKategori: "arsa" | "tarla" = "arsa";
let trendVerisi: IlTrendSonuc[] = [];

function trendRenk(degisim: number): string {
  if (degisim > 15)  return "#dc2626"; // kırmızı — çok ısınıyor
  if (degisim > 5)   return "#f97316"; // turuncu — ısınıyor
  if (degisim > -5)  return "#94a3b8"; // gri — stabil
  if (degisim > -15) return "#22d3ee"; // cyan — soğuyor
  return "#0891b2";                    // koyu mavi — çok soğuyor
}

async function trendVerisiCek(kategori: "arsa" | "tarla"): Promise<IlTrendSonuc[]> {
  const cacheKey = `trend-v1:${kategori}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { veri, ts } = JSON.parse(cached) as { veri: IlTrendSonuc[]; ts: number };
      if (Date.now() - ts < 3_600_000) return veri; // 1 saat cache
    }
  } catch {}
  const res = await fetch(`${API_BASE}/harita/trend?kategori=${kategori}`);
  if (!res.ok) throw new Error(`trend HTTP ${res.status}`);
  const data = await res.json() as { iller: IlTrendSonuc[] };
  const veri = data.iller ?? [];
  try { sessionStorage.setItem(cacheKey, JSON.stringify({ veri, ts: Date.now() })); } catch {}
  return veri;
}

function trendKatmanEkle(veri: IlTrendSonuc[]) {
  if (!harita) return;
  const trendMap = new Map(veri.map(d => [d.il_norm, d]));
  const features: GeoJSON.Feature[] = [];
  for (const [ilNorm, centroid] of Object.entries(IL_CENTROID)) {
    const bilgi = trendMap.get(ilNorm);
    const degisim = bilgi?.veri_var ? bilgi.degisim_yuzde : 0;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [centroid[1], centroid[0]] },
      properties: {
        il_norm: ilNorm,
        degisim: degisim,
        veri_var: bilgi?.veri_var ?? false,
        etiket: bilgi?.etiket ?? "Veri Yok",
        son3_ort: bilgi?.son3_ort ?? null,
        once3_ort: bilgi?.once3_ort ?? null,
        renk: trendRenk(degisim),
        degisim_text: degisim > 0 ? `+${degisim.toFixed(1)}%` : `${degisim.toFixed(1)}%`,
      },
    });
  }
  const geojson: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
  const srcId = "trend-src";
  const src = harita.getSource(srcId) as import("maplibre-gl").GeoJSONSource | undefined;
  if (src) {
    src.setData(geojson);
  } else {
    harita.addSource(srcId, { type: "geojson", data: geojson });
    harita.addLayer({
      id: "trend-circle",
      type: "circle",
      source: srcId,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 14, 6, 20, 8, 28],
        "circle-color": ["get", "renk"],
        "circle-opacity": ["case", ["get", "veri_var"], 0.85, 0.30],
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "rgba(255,255,255,0.4)",
      },
    });
    harita.addLayer({
      id: "trend-label",
      type: "symbol",
      source: srcId,
      minzoom: 5,
      layout: {
        "text-field": ["case", ["get", "veri_var"], ["get", "degisim_text"], ""],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 5, 8, 8, 11],
        "text-offset": [0, 0],
        "text-anchor": "center",
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": "#f8fafc",
        "text-halo-color": "#0f172a",
        "text-halo-width": 1.5,
      },
    });
    harita.on("click", "trend-circle", (e) => {
      const p = e.features?.[0]?.properties as Record<string, unknown> | undefined;
      if (!p || !MLPopup || !harita) return;
      const ilAd = String(p["il_norm"]);
      const renk = String(p["renk"]);
      const veriVar = Boolean(p["veri_var"]);
      new MLPopup({ closeButton: true, maxWidth: "260px" })
        .setLngLat(e.lngLat)
        .setHTML(`
          <div style="font-family:Inter,sans-serif;padding:2px 4px;min-width:220px">
            <div style="font-weight:700;font-size:14px;color:#1e293b;margin-bottom:4px">
              ${ilAd.charAt(0).toUpperCase() + ilAd.slice(1)}
            </div>
            ${veriVar ? `
              <div style="font-size:22px;font-weight:800;color:${renk}">${String(p["degisim_text"])}</div>
              <div style="font-size:11px;color:#64748b;margin-top:2px">${String(p["etiket"])} (son 3 ay)</div>
              <div style="font-size:10px;color:#94a3b8;margin-top:4px">
                Son 3 ay ort: <strong>${Number(p["son3_ort"]).toLocaleString("tr-TR")} TL/m²</strong><br>
                Önceki 3 ay: <strong>${Number(p["once3_ort"]).toLocaleString("tr-TR")} TL/m²</strong>
              </div>
            ` : `<div style="font-size:12px;color:#94a3b8">Bu il için yeterli trend verisi yok</div>`}
          </div>
        `)
        .addTo(harita);
    });
    harita.on("mouseenter", "trend-circle", () => { if (harita) harita.getCanvas().style.cursor = "pointer"; });
    harita.on("mouseleave", "trend-circle", () => { if (harita) harita.getCanvas().style.cursor = ""; });
  }
}

function trendKatmanGorunurluk(gorünür: boolean) {
  if (!harita) return;
  const vis = gorünür ? "visible" : "none";
  if (harita.getLayer("trend-circle")) harita.setLayoutProperty("trend-circle", "visibility", vis);
  if (harita.getLayer("trend-label"))  harita.setLayoutProperty("trend-label",  "visibility", vis);
}

async function trendToggle(kategori: "arsa" | "tarla" = "arsa") {
  if (!harita) return;
  if (kategori !== trendKategori || trendVerisi.length === 0) {
    trendKategori = kategori;
    try {
      trendVerisi = await trendVerisiCek(kategori);
      trendKatmanEkle(trendVerisi);
    } catch (e) {
      console.warn("[trend] veri alınamadı:", e);
      return;
    }
  } else {
    trendKatmanEkle(trendVerisi);
  }
  trendKatmanAcik = true;
  trendKatmanGorunurluk(true);
}

function fiyatLegendGuncelle() {
  const el = document.getElementById("fiyat-legend");
  if (!el) return;
  el.innerHTML = FIYAT_SKALA.slice(0, -1).map(s =>
    `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;color:#94a3b8">
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.renk};border:1px solid rgba(255,255,255,0.3)"></span>
      ${s.etiket}
    </span>`
  ).join("") + `<span style="font-size:9px;color:#94a3b8"> TL/m²</span>`;
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
  serbest_bolgeler?: PoiNokta[];
  tmo_depolari?: PoiNokta[];
  buyuk_barajlar?: PoiNokta[];
  enerji_santralleri?: PoiNokta[];
}

// Aktif katman durumu — hangi POI katmanları açık
const katmanDurum: Record<string, boolean> = {
  "hava": false,
  "osb": false,
  "lojistik": false,
  "cdp-imar": false,
  "tmo": false,
  "stb": false,
  "baraj": false,
  "enerji": false,
  "otoyol": false,
};

// ─── Otoyol & D-yol layer ─────────────────────────────────────────────────────
// /geo/otoyollar.geojson — extract-otoyollar.mjs ile üretilir

let otoyolVeriYuklendi = false;

async function otoyolLayerEkle() {
  if (!harita) return;
  if (harita.getLayer("otoyol-motorway")) return;

  // GeoJSON henüz yüklenmemişse fetch et
  if (!harita.getSource("otoyol-src")) {
    durumGuncelle("Otoyol verisi yükleniyor…");
    try {
      const res = await fetch("/geo/otoyollar.geojson");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as GeoJSON.FeatureCollection;
      harita.addSource("otoyol-src", { type: "geojson", data });
      otoyolVeriYuklendi = true;
    } catch (e) {
      console.warn("[otoyol] GeoJSON yüklenemedi:", e);
      durumGuncelle("Otoyol verisi alınamadı");
      return;
    } finally {
      durumGuncelle("");
    }
  }

  // Motorway — kırmızı, kalın
  harita.addLayer({
    id: "otoyol-motorway",
    type: "circle",
    source: "otoyol-src",
    filter: ["==", ["get", "tip"], "motorway"],
    minzoom: 5,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2, 8, 3.5, 12, 5],
      "circle-color": "#ef4444",
      "circle-opacity": 0.75,
      "circle-stroke-width": 0,
    },
  });

  // Trunk — turuncu, ince
  harita.addLayer({
    id: "otoyol-trunk",
    type: "circle",
    source: "otoyol-src",
    filter: ["==", ["get", "tip"], "trunk"],
    minzoom: 6,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 1.5, 8, 2.5, 12, 4],
      "circle-color": "#f97316",
      "circle-opacity": 0.65,
      "circle-stroke-width": 0,
    },
  });

  // Label — yol adı (yüksek zoom)
  harita.addLayer({
    id: "otoyol-label",
    type: "symbol",
    source: "otoyol-src",
    filter: ["==", ["get", "tip"], "motorway"],
    minzoom: 9,
    layout: {
      "text-field": ["get", "ad"],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-size": 9,
      "text-offset": [0, 1.2],
      "text-anchor": "top",
      "text-allow-overlap": false,
      "text-optional": true,
    },
    paint: {
      "text-color": "#fca5a5",
      "text-halo-color": "#1f2937",
      "text-halo-width": 1.2,
    },
  });

  harita.on("click", "otoyol-motorway", (e) => {
    const p = e.features?.[0]?.properties as Record<string, string> | undefined;
    if (!p || !MLPopup || !harita) return;
    new MLPopup({ closeButton: true, maxWidth: "220px" })
      .setLngLat(e.lngLat)
      .setHTML(`<div style="font-family:Inter,sans-serif;padding:2px 4px">
        <strong style="font-size:13px">🛣️ ${p["ad"] ?? "Otoyol"}</strong><br>
        <span style="font-size:11px;color:#94a3b8">Motorway</span>
      </div>`)
      .addTo(harita);
  });

  harita.on("click", "otoyol-trunk", (e) => {
    const p = e.features?.[0]?.properties as Record<string, string> | undefined;
    if (!p || !MLPopup || !harita) return;
    new MLPopup({ closeButton: true, maxWidth: "220px" })
      .setLngLat(e.lngLat)
      .setHTML(`<div style="font-family:Inter,sans-serif;padding:2px 4px">
        <strong style="font-size:13px">🛤️ ${p["ad"] ?? "Devlet Yolu"}</strong><br>
        <span style="font-size:11px;color:#94a3b8">Devlet Yolu (D-yol)</span>
      </div>`)
      .addTo(harita);
  });
}

function otoyolGorunurluk(gorünür: boolean) {
  if (!harita) return;
  const vis = gorünür ? "visible" : "none";
  for (const id of ["otoyol-motorway", "otoyol-trunk", "otoyol-label"]) {
    if (harita.getLayer(id)) harita.setLayoutProperty(id, "visibility", vis);
  }
}

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

// ─── TMO Depoları layer ───────────────────────────────────────────────────────

function tmoLayerEkle() {
  if (!harita || harita.getLayer("poi-tmo-circle")) return;
  harita.addLayer({
    id: "poi-tmo-circle",
    type: "circle",
    source: "poi-tmo",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 5, 8, 9, 12, 13],
      "circle-color": "#facc15",
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ca8a04",
      "circle-opacity": 0.85,
    },
  });
  harita.addLayer({
    id: "poi-tmo-label",
    type: "symbol",
    source: "poi-tmo",
    minzoom: 7,
    layout: {
      "text-field": ["get", "il"],
      "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
      "text-size": 9,
      "text-offset": [0, 1.3],
      "text-anchor": "top",
    },
    paint: { "text-color": "#fef9c3", "text-halo-color": "#713f12", "text-halo-width": 1.2 },
  });
  harita.on("click", "poi-tmo-circle", (e) => {
    const p = e.features?.[0]?.properties as Record<string, string> | undefined;
    if (!p) return;
    poiPopupGoster(e.lngLat,
      `<strong style="font-size:13px">${p["ad"] ?? ""}</strong><br>
       <span style="font-size:11px;color:#94a3b8">🌾 TMO Alım Merkezi · ${p["il"] ?? ""}</span>`);
  });
  harita.on("mouseenter", "poi-tmo-circle", () => { if (harita) harita.getCanvas().style.cursor = "pointer"; });
  harita.on("mouseleave", "poi-tmo-circle", () => { if (harita) harita.getCanvas().style.cursor = ""; });
}

// ─── Serbest Bölgeler layer ───────────────────────────────────────────────────

function stbLayerEkle() {
  if (!harita || harita.getLayer("poi-stb-circle")) return;
  harita.addLayer({
    id: "poi-stb-circle",
    type: "circle",
    source: "poi-stb",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 6, 8, 11, 12, 16],
      "circle-color": "#a855f7",
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#7e22ce",
      "circle-opacity": 0.85,
    },
  });
  harita.addLayer({
    id: "poi-stb-label",
    type: "symbol",
    source: "poi-stb",
    minzoom: 6,
    layout: {
      "text-field": ["get", "il"],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-size": 9,
      "text-offset": [0, 1.5],
      "text-anchor": "top",
    },
    paint: { "text-color": "#e9d5ff", "text-halo-color": "#3b0764", "text-halo-width": 1.5 },
  });
  harita.on("click", "poi-stb-circle", (e) => {
    const p = e.features?.[0]?.properties as Record<string, string> | undefined;
    if (!p) return;
    poiPopupGoster(e.lngLat,
      `<strong style="font-size:13px">${p["ad"] ?? ""}</strong><br>
       <span style="font-size:11px;color:#94a3b8">🏛️ Serbest Ticaret Bölgesi · ${p["il"] ?? ""}</span>`);
  });
  harita.on("mouseenter", "poi-stb-circle", () => { if (harita) harita.getCanvas().style.cursor = "pointer"; });
  harita.on("mouseleave", "poi-stb-circle", () => { if (harita) harita.getCanvas().style.cursor = ""; });
}

// ─── Büyük Barajlar layer ─────────────────────────────────────────────────────

function barajLayerEkle() {
  if (!harita || harita.getLayer("poi-baraj-circle")) return;
  harita.addLayer({
    id: "poi-baraj-circle",
    type: "circle",
    source: "poi-baraj",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"],
        4, ["interpolate", ["linear"], ["get", "kapasite_mw"], 0, 4, 2400, 12],
        8, ["interpolate", ["linear"], ["get", "kapasite_mw"], 0, 7, 2400, 20],
      ],
      "circle-color": "#38bdf8",
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#0369a1",
      "circle-opacity": 0.80,
    },
  });
  harita.addLayer({
    id: "poi-baraj-label",
    type: "symbol",
    source: "poi-baraj",
    minzoom: 6,
    layout: {
      "text-field": ["get", "ad"],
      "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
      "text-size": 9,
      "text-offset": [0, 1.6],
      "text-anchor": "top",
    },
    paint: { "text-color": "#e0f2fe", "text-halo-color": "#0c4a6e", "text-halo-width": 1.5 },
  });
  harita.on("click", "poi-baraj-circle", (e) => {
    const p = e.features?.[0]?.properties as Record<string, unknown> | undefined;
    if (!p) return;
    poiPopupGoster(e.lngLat,
      `<strong style="font-size:13px">${String(p["ad"] ?? "")}</strong><br>
       <span style="font-size:11px;color:#94a3b8">💧 Baraj · ${String(p["il"] ?? "")}</span><br>
       <span style="font-size:11px;color:#38bdf8">⚡ ${Number(p["kapasite_mw"] ?? 0).toLocaleString("tr-TR")} MW</span>`);
  });
  harita.on("mouseenter", "poi-baraj-circle", () => { if (harita) harita.getCanvas().style.cursor = "pointer"; });
  harita.on("mouseleave", "poi-baraj-circle", () => { if (harita) harita.getCanvas().style.cursor = ""; });
}

// ─── Enerji Santralleri layer ─────────────────────────────────────────────────

const ENERJI_RENK: Record<string, string> = {
  termik: "#f97316",
  nukleer: "#dc2626",
  res: "#86efac",
  ges: "#fde047",
};

const ENERJI_IKON: Record<string, string> = {
  termik: "🏭", nukleer: "⚛️", res: "💨", ges: "☀️",
};

function enerjiLayerEkle() {
  if (!harita || harita.getLayer("poi-enerji-circle")) return;
  harita.addLayer({
    id: "poi-enerji-circle",
    type: "circle",
    source: "poi-enerji",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 5, 8, 9, 12, 14],
      "circle-color": [
        "match", ["get", "tip"],
        "termik", "#f97316",
        "nukleer", "#dc2626",
        "res", "#86efac",
        "ges", "#fde047",
        "#94a3b8",
      ],
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "rgba(255,255,255,0.5)",
      "circle-opacity": 0.85,
    },
  });
  harita.addLayer({
    id: "poi-enerji-label",
    type: "symbol",
    source: "poi-enerji",
    minzoom: 7,
    layout: {
      "text-field": ["get", "il"],
      "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
      "text-size": 8,
      "text-offset": [0, 1.3],
      "text-anchor": "top",
    },
    paint: { "text-color": "#f8fafc", "text-halo-color": "#0f172a", "text-halo-width": 1.2 },
  });
  harita.on("click", "poi-enerji-circle", (e) => {
    const p = e.features?.[0]?.properties as Record<string, unknown> | undefined;
    if (!p) return;
    const tip = String(p["tip"] ?? "");
    const ikon = ENERJI_IKON[tip] ?? "⚡";
    poiPopupGoster(e.lngLat,
      `<strong style="font-size:13px">${String(p["ad"] ?? "")}</strong><br>
       <span style="font-size:11px;color:#94a3b8">${ikon} ${tip.charAt(0).toUpperCase() + tip.slice(1)} Santrali · ${String(p["il"] ?? "")}</span><br>
       <span style="font-size:11px;color:${ENERJI_RENK[tip] ?? "#94a3b8"}">⚡ ${Number(p["kapasite_mw"] ?? 0).toLocaleString("tr-TR")} MW</span>`);
  });
  harita.on("mouseenter", "poi-enerji-circle", () => { if (harita) harita.getCanvas().style.cursor = "pointer"; });
  harita.on("mouseleave", "poi-enerji-circle", () => { if (harita) harita.getCanvas().style.cursor = ""; });
}

const POI_LAYER_MAP: Record<string, { layerIds: string[]; srcId: string; yukle: () => void }> = {
  hava:     { layerIds: ["poi-hava-circle", "poi-hava-label"],   srcId: "poi-hava", yukle: havalimanıLayerEkle },
  osb:      { layerIds: ["poi-osb-circle", "poi-osb-label"],     srcId: "poi-osb",  yukle: osbLayerEkle },
  lojistik: { layerIds: ["poi-loj-circle", "poi-loj-label"],     srcId: "poi-loj",  yukle: lojistikLayerEkle },
  tmo:      { layerIds: ["poi-tmo-circle", "poi-tmo-label"],     srcId: "poi-tmo",  yukle: tmoLayerEkle },
  stb:      { layerIds: ["poi-stb-circle", "poi-stb-label"],     srcId: "poi-stb",  yukle: stbLayerEkle },
  baraj:    { layerIds: ["poi-baraj-circle", "poi-baraj-label"], srcId: "poi-baraj", yukle: barajLayerEkle },
  enerji:   { layerIds: ["poi-enerji-circle", "poi-enerji-label"], srcId: "poi-enerji", yukle: enerjiLayerEkle },
};

async function katmanToggle(katman: string) {
  if (!harita) return;
  const acik = !katmanDurum[katman];
  katmanDurum[katman] = acik;

  // Otoyol & D-yol katmanı — GeoJSON'dan özel yükleme
  if (katman === "otoyol") {
    if (acik) {
      await otoyolLayerEkle();
      otoyolGorunurluk(true);
    } else {
      otoyolGorunurluk(false);
    }
    btnToggleGuncelle(katman, acik);
    return;
  }

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
        hava:     veri.havalimanları,
        osb:      veri.osblar,
        lojistik: veri.lojistik_merkezler,
        tmo:      veri.tmo_depolari ?? [],
        stb:      veri.serbest_bolgeler ?? [],
        baraj:    veri.buyuk_barajlar ?? [],
        enerji:   veri.enerji_santralleri ?? [],
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
        `${API_BASE}/proxy/tucbs/tile/${slug}/{z}/{x}/{y}`,
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

  // ── Fiyat choropleth toggle ──────────────────────────────────────────────
  const fiyatBtn = document.getElementById("fiyat-katman-btn") as HTMLButtonElement | null;
  const fiyatKategoriWrap = document.getElementById("fiyat-kategori-wrap") as HTMLElement | null;
  const fiyatLegendWrap   = document.getElementById("fiyat-legend-wrap") as HTMLElement | null;

  let seciliFiyatKat: "arsa" | "tarla" = "arsa";

  async function fiyatKatmanAc(kat: "arsa" | "tarla") {
    seciliFiyatKat = kat;
    document.querySelectorAll<HTMLButtonElement>(".fiyat-kat-btn").forEach((b) => {
      const aktif = b.dataset["fiyatKategori"] === kat;
      b.setAttribute("aria-pressed", aktif ? "true" : "false");
      b.classList.toggle("text-blue-300", aktif);
      b.classList.toggle("font-semibold", aktif);
      b.classList.toggle("bg-slate-700", aktif);
      b.classList.toggle("text-slate-400", !aktif);
      b.classList.toggle("bg-slate-800", !aktif);
    });
    await fiyatToggle(kat);
  }

  fiyatBtn?.addEventListener("click", async () => {
    const acik = fiyatBtn.getAttribute("aria-pressed") === "true";
    if (acik) {
      fiyatBtn.setAttribute("aria-pressed", "false");
      fiyatBtn.classList.remove("bg-slate-600", "text-white", "border-blue-400");
      fiyatBtn.classList.add("text-slate-400");
      fiyatKategoriWrap?.classList.replace("flex", "hidden");
      fiyatLegendWrap?.classList.add("hidden");
      fiyatKatmanKapat();
    } else {
      fiyatBtn.setAttribute("aria-pressed", "true");
      fiyatBtn.classList.add("bg-slate-600", "text-white", "border-blue-400");
      fiyatBtn.classList.remove("text-slate-400");
      fiyatKategoriWrap?.classList.replace("hidden", "flex");
      fiyatLegendWrap?.classList.remove("hidden");
      await fiyatKatmanAc(seciliFiyatKat);
    }
  });

  document.querySelectorAll<HTMLButtonElement>(".fiyat-kat-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const kat = btn.dataset["fiyatKategori"] as "arsa" | "tarla" | undefined;
      if (!kat) return;
      const legendLabel = fiyatLegendWrap?.querySelector("span");
      if (legendLabel) legendLabel.textContent = `${kat.charAt(0).toUpperCase() + kat.slice(1)} TL/m²:`;
      await fiyatKatmanAc(kat);
    });
  });

  // ── Likidite katman toggle ────────────────────────────────────────────────
  const likiditBtn = document.getElementById("likidite-katman-btn") as HTMLButtonElement | null;
  const likiditKatWrap = document.getElementById("likidite-kat-wrap") as HTMLElement | null;
  let seciliLikiditKat: "arsa" | "tarla" = "arsa";

  async function likiditKatmanAc(kat: "arsa" | "tarla") {
    seciliLikiditKat = kat;
    document.querySelectorAll<HTMLButtonElement>(".likidite-kat-btn").forEach((b) => {
      const aktif = b.dataset["likiditKategori"] === kat;
      b.setAttribute("aria-pressed", aktif ? "true" : "false");
      b.classList.toggle("text-cyan-300", aktif);
      b.classList.toggle("font-semibold", aktif);
      b.classList.toggle("bg-slate-700", aktif);
      b.classList.toggle("text-slate-400", !aktif);
    });
    await likiditToggle(kat);
  }

  likiditBtn?.addEventListener("click", async () => {
    const acik = likiditBtn.getAttribute("aria-pressed") === "true";
    if (acik) {
      likiditBtn.setAttribute("aria-pressed", "false");
      likiditBtn.classList.remove("bg-slate-600", "text-white", "border-cyan-400");
      likiditBtn.classList.add("text-slate-400");
      likiditKatWrap?.classList.replace("flex", "hidden");
      likiditKatmanAcik = false;
      likiditKatmanGorunurluk(false);
    } else {
      likiditBtn.setAttribute("aria-pressed", "true");
      likiditBtn.classList.add("bg-slate-600", "text-white", "border-cyan-400");
      likiditBtn.classList.remove("text-slate-400");
      likiditKatWrap?.classList.replace("hidden", "flex");
      await likiditKatmanAc(seciliLikiditKat);
    }
  });

  document.querySelectorAll<HTMLButtonElement>(".likidite-kat-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const kat = btn.dataset["likiditKategori"] as "arsa" | "tarla" | undefined;
      if (!kat) return;
      await likiditKatmanAc(kat);
    });
  });

  // ── Trend / sıcaklık katman toggle ───────────────────────────────────────
  const trendBtn = document.getElementById("trend-katman-btn") as HTMLButtonElement | null;
  const trendKatWrap = document.getElementById("trend-kat-wrap") as HTMLElement | null;
  const trendLegendWrap = document.getElementById("trend-legend-wrap") as HTMLElement | null;
  let seciliTrendKat: "arsa" | "tarla" = "arsa";

  async function trendKatmanAc(kat: "arsa" | "tarla") {
    seciliTrendKat = kat;
    document.querySelectorAll<HTMLButtonElement>(".trend-kat-btn").forEach((b) => {
      const aktif = b.dataset["trendKategori"] === kat;
      b.setAttribute("aria-pressed", aktif ? "true" : "false");
      b.classList.toggle("text-orange-300", aktif);
      b.classList.toggle("font-semibold", aktif);
      b.classList.toggle("bg-slate-700", aktif);
      b.classList.toggle("text-slate-400", !aktif);
    });
    await trendToggle(kat);
  }

  trendBtn?.addEventListener("click", async () => {
    const acik = trendBtn.getAttribute("aria-pressed") === "true";
    if (acik) {
      trendBtn.setAttribute("aria-pressed", "false");
      trendBtn.classList.remove("bg-slate-600", "text-white", "border-orange-400");
      trendBtn.classList.add("text-slate-400");
      trendKatWrap?.classList.replace("flex", "hidden");
      trendLegendWrap?.classList.add("hidden");
      trendKatmanAcik = false;
      trendKatmanGorunurluk(false);
    } else {
      trendBtn.setAttribute("aria-pressed", "true");
      trendBtn.classList.add("bg-slate-600", "text-white", "border-orange-400");
      trendBtn.classList.remove("text-slate-400");
      trendKatWrap?.classList.replace("hidden", "flex");
      trendLegendWrap?.classList.remove("hidden");
      await trendKatmanAc(seciliTrendKat);
    }
  });

  document.querySelectorAll<HTMLButtonElement>(".trend-kat-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const kat = btn.dataset["trendKategori"] as "arsa" | "tarla" | undefined;
      if (!kat) return;
      await trendKatmanAc(kat);
    });
  });
}
