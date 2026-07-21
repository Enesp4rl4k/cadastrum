/**
 * harita-init.ts
 * Türkiye Alım-Satım Yoğunluğu Haritası — MapLibre GL heatmap + POI katmanları + Otoyol/D-yol
 *
 * Veri akışı:
 *   TKGM (tek seferlik) → scripts/tkgm-analiz-seed.mjs → D1
 *   Site → GET /v1/harita/heatmap → D1 (tek istek). Kullanıcı TKGM'ye gitmez.
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
const CHROME_STORE_URL =
  "https://chromewebstore.google.com/detail/cadastrum-arsa-tkgm-parsel-zekasi/aelbnillaapmecnopkoojcolecbdhiej";
const CHROME_CTA_HTML = `<a href="${CHROME_STORE_URL}" target="_blank" rel="noopener" style="color:#C9A86A;font-size:10px;text-decoration:none;font-weight:600">Chrome'a ekle →</a>`;

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
  mersin:[36.80,34.64],istanbul:[41.01,28.95],izmir:[38.42,27.14],kars:[40.60,43.10],
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
          const res = await fetch(`${API_BASE}/fiyat/il/${ilNorm}?kategori=${fiyatKategori}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json() as {
            ilceler?: Array<{ ilce_norm: string; medyan: number; ilan_adet: number }>;
          };
          const ilceler = (data.ilceler ?? []).slice(0, 8);
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
            `<div style="text-align:right;margin-top:4px;display:flex;justify-content:flex-end;gap:10px">
              <a href="/veri/${ilNorm}" style="color:#60a5fa;font-size:9px;text-decoration:none">Tüm mahalleler →</a>
              ${CHROME_CTA_HTML}
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
  per_capita?: number;
  ilan_adet?: number;
  kaynak?: string;
}

let likiditKatmanAcik = false;
let likiditKategori: "arsa" | "tarla" = "arsa";
let likiditVerisi: IlLikiditeSonuc[] = [];
let likiditMeta: { tkgm_ilce_kapsam?: number; tkgm_hedef_ilce?: number; guncelleme?: string } = {};

// Koyu basemap üzerinde okunur cyan ölçeği (#1e293b/#334155 neredeyse görünmezdi)
const LIKIDITE_SKALA = [
  { esik: 0.50, renk: "#94a3b8", etiket: "Düşük" },
  { esik: 0.70, renk: "#38bdf8", etiket: "Normal" },
  { esik: 0.85, renk: "#0ea5e9", etiket: "Aktif" },
  { esik: 0.95, renk: "#22d3ee", etiket: "Çok Aktif" },
  { esik: Infinity, renk: "#a5f3fc", etiket: "En Likit" },
];

function likiditRenk(skor: number): string {
  for (const { esik, renk } of LIKIDITE_SKALA) {
    if (skor < esik) return renk;
  }
  return LIKIDITE_SKALA[LIKIDITE_SKALA.length - 1]!.renk;
}

async function likiditVerisiCek(kategori: "arsa" | "tarla"): Promise<IlLikiditeSonuc[]> {
  const cacheKey = `likidite-v3:${kategori}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { veri, meta, ts } = JSON.parse(cached) as {
        veri: IlLikiditeSonuc[];
        meta?: typeof likiditMeta;
        ts: number;
      };
      if (Date.now() - ts < 3_600_000 && veri.length > 0) {
        if (meta) likiditMeta = meta;
        return veri;
      }
    }
  } catch {}
  const res = await fetch(`${API_BASE}/harita/likidite?kategori=${kategori}`);
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`likidite HTTP ${res.status}${errBody.includes("Rate") ? " (rate limit)" : ""}`);
  }
  const data = await res.json() as {
    iller: IlLikiditeSonuc[];
    tkgm_ilce_kapsam?: number;
    tkgm_hedef_ilce?: number;
    guncelleme?: string;
  };
  const veri = data.iller ?? [];
  likiditMeta = {
    tkgm_ilce_kapsam: data.tkgm_ilce_kapsam,
    tkgm_hedef_ilce: data.tkgm_hedef_ilce,
    guncelleme: data.guncelleme,
  };
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({ veri, meta: likiditMeta, ts: Date.now() }));
  } catch {}
  return veri;
}

function likiditKatmanEkle(veri: IlLikiditeSonuc[]) {
  if (!harita) return;
  const fiyatMap = new Map(veri.map(d => [d.il_norm, d]));
  const features: GeoJSON.Feature[] = [];
  for (const [ilNorm, centroid] of Object.entries(IL_CENTROID)) {
    const bilgi = fiyatMap.get(ilNorm);
    if (!bilgi) continue;
    const skorPct = Math.round(bilgi.skor * 100);
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [centroid[1], centroid[0]] },
      properties: {
        il_norm: ilNorm,
        skor: bilgi.skor,
        skor_pct: skorPct,
        yillik_satis: bilgi.yillik_satis,
        ipotekli_oran: bilgi.ipotekli_oran,
        nufus_m: bilgi.nufus_m,
        ilan_adet: bilgi.ilan_adet ?? 0,
        etiket: bilgi.etiket,
        etiket_skor: `${bilgi.etiket} · ${skorPct}`,
        renk: likiditRenk(bilgi.skor),
        // Ülke zoomunda bile görünsün (min ~14px)
        boyut: Math.round(14 + bilgi.skor * 22),
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
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          4, ["get", "boyut"],
          6, ["+", ["get", "boyut"], 10],
          8, ["+", ["get", "boyut"], 20],
        ],
        "circle-color": ["get", "renk"],
        "circle-opacity": 0.92,
        "circle-stroke-width": 2,
        "circle-stroke-color": "rgba(255,255,255,0.75)",
        "circle-blur": 0.05,
      },
    });
    harita.addLayer({
      id: "likidite-label",
      type: "symbol",
      source: srcId,
      minzoom: 4.2,
      layout: {
        "text-field": ["get", "etiket_skor"],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 4, 9, 7, 11],
        "text-offset": [0, 1.6],
        "text-anchor": "top",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": "#ecfeff",
        "text-halo-color": "#0c4a6e",
        "text-halo-width": 1.8,
      },
    });
    harita.on("click", "likidite-circle", (e) => {
      const p = e.features?.[0]?.properties as Record<string, unknown> | undefined;
      if (!p || !MLPopup || !harita) return;
      const ilAd = String(p["il_norm"]);
      const skor = Number(p["skor"]);
      const renk = String(p["renk"]);
      const ipotek = Number(p["ipotekli_oran"] ?? 0);
      const ilanAdet = Number(p["ilan_adet"] ?? 0);
      new MLPopup({ closeButton: true, maxWidth: "280px" })
        .setLngLat(e.lngLat)
        .setHTML(`
          <div style="font-family:Inter,sans-serif;padding:2px 4px;min-width:210px">
            <div style="font-weight:700;font-size:14px;color:#1e293b;margin-bottom:4px">
              ${ilAd.charAt(0).toUpperCase() + ilAd.slice(1)}
            </div>
            <div style="font-size:18px;font-weight:800;color:${renk}">${String(p["etiket"])}</div>
            <div style="font-size:11px;color:#64748b;margin-top:6px;line-height:1.55">
              Likidite skoru: <strong style="color:#0f172a">${Math.round(skor * 100)}</strong>/100<br>
              Yıllık tapu satışı: <strong style="color:#0f172a">${Number(p["yillik_satis"]).toLocaleString("tr-TR")}</strong><br>
              İpotekli oran: <strong style="color:#0f172a">%${Math.round(ipotek * 100)}</strong><br>
              ${ilanAdet > 0 ? `İlan havuzu: <strong style="color:#0f172a">${ilanAdet.toLocaleString("tr-TR")}</strong><br>` : ""}
            </div>
            <div style="margin-top:8px;text-align:right;display:flex;justify-content:flex-end;gap:10px">
              <a href="/veri/${ilAd}" style="color:#0891b2;font-size:10px;text-decoration:none;font-weight:600">İl detayı →</a>
              ${CHROME_CTA_HTML}
            </div>
          </div>
        `)
        .addTo(harita);
    });
    harita.on("mouseenter", "likidite-circle", () => { if (harita) harita.getCanvas().style.cursor = "pointer"; });
    harita.on("mouseleave", "likidite-circle", () => { if (harita) harita.getCanvas().style.cursor = ""; });
  }
  // Heatmap / POI üstünde kalsın
  try {
    if (harita.getLayer("likidite-circle")) harita.moveLayer("likidite-circle");
    if (harita.getLayer("likidite-label")) harita.moveLayer("likidite-label");
  } catch { /* ignore */ }
}

function likiditKatmanGorunurluk(gorünür: boolean) {
  if (!harita) return;
  const vis = gorünür ? "visible" : "none";
  if (harita.getLayer("likidite-circle")) harita.setLayoutProperty("likidite-circle", "visibility", vis);
  if (harita.getLayer("likidite-label"))  harita.setLayoutProperty("likidite-label",  "visibility", vis);
}

function likiditeLegendGuncelle() {
  const el = document.getElementById("likidite-legend");
  if (!el) return;
  el.innerHTML = LIKIDITE_SKALA.map(s =>
    `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;color:#94a3b8">
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.renk};border:1px solid rgba(255,255,255,0.3)"></span>
      ${s.etiket}
    </span>`
  ).join("");
  const metaEl = document.getElementById("likidite-meta");
  if (metaEl && likiditMeta.tkgm_ilce_kapsam != null) {
    const hedef = likiditMeta.tkgm_hedef_ilce ?? 957;
    metaEl.textContent = `TKGM ısı haritası seed: ${likiditMeta.tkgm_ilce_kapsam}/${hedef} ilçe`;
  }
}

async function likiditToggle(kategori: "arsa" | "tarla" = "arsa") {
  if (!harita) return;
  durumGuncelle("Likidite verisi yükleniyor…");
  if (kategori !== likiditKategori || likiditVerisi.length === 0) {
    likiditKategori = kategori;
    try {
      likiditVerisi = await likiditVerisiCek(kategori);
      if (likiditVerisi.length === 0) {
        durumGuncelle("Likidite verisi boş döndü");
        return;
      }
      likiditKatmanEkle(likiditVerisi);
    } catch (e) {
      console.warn("[likidite] veri alınamadı:", e);
      const msg = e instanceof Error ? e.message : String(e);
      durumGuncelle(
        msg.includes("429") || msg.includes("rate")
          ? "Likidite: istek limiti — 1 dk sonra tekrar açın"
          : "Likidite verisi alınamadı — tekrar deneyin",
      );
      return;
    }
  } else {
    likiditKatmanEkle(likiditVerisi);
  }
  likiditKatmanAcik = true;
  likiditKatmanGorunurluk(true);
  likiditeLegendGuncelle();
  durumGuncelle("");
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
  "belediye-imar": false,
  "tmo": false,
  "stb": false,
  "baraj": false,
  "enerji": false,
  "otoyol": false,
};

/** İBB Plan ArcGIS export — görsel katman (ada/parsel sorgu değil) */
const IBB_PLAN_TILE =
  "https://cbsmapws.ibb.gov.tr/arcgis/rest/services/KAZI_RUHSAT/QueryMap/MapServer/export" +
  "?bboxSR=3857&imageSR=3857&size=256,256&dpi=96&format=png32&transparent=true" +
  "&layers=show:12,13,14&f=image&bbox={bbox-epsg-3857}";

function belediyeImarLayerEkle() {
  if (!harita) return;
  if (!harita.getSource("belediye-ibb-src")) {
    harita.addSource("belediye-ibb-src", {
      type: "raster",
      tiles: [IBB_PLAN_TILE],
      tileSize: 256,
      attribution: "© İBB CBS — Plan 1/1000–1/5000 (görsel)",
      maxzoom: 18,
    });
  }
  if (!harita.getLayer("belediye-ibb-layer")) {
    const before = harita.getLayer("heat-cloud") ? "heat-cloud" : undefined;
    harita.addLayer(
      {
        id: "belediye-ibb-layer",
        type: "raster",
        source: "belediye-ibb-src",
        minzoom: 10,
        maxzoom: 18,
        paint: { "raster-opacity": 0.65 },
      },
      before,
    );
  } else {
    harita.setLayoutProperty("belediye-ibb-layer", "visibility", "visible");
  }
  const bilgi = document.getElementById("cdp-bilgi");
  if (bilgi) {
    bilgi.classList.remove("hidden");
    bilgi.textContent = "İBB plan (İstanbul · zoom ≥10)";
  }
}

function belediyeImarLayerKapat() {
  if (!harita?.getLayer("belediye-ibb-layer")) return;
  harita.setLayoutProperty("belediye-ibb-layer", "visibility", "none");
}

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
let tumNoktalar: HeatPoint[] = [];
let yukleniyor = false;
let poiVeri: PoiVeri | null = null;
/** tip → cache (session) */
const heatmapCache = new Map<number, HeatPoint[]>();
let seedIlceKapsam = 0;

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

// ─── D1 heatmap — tek istek, TKGM yok ────────────────────────────────────────

async function heatmapYukle(tip: number): Promise<void> {
  if (!harita || yukleniyor) return;
  if (heatmapCache.has(tip)) {
    tumNoktalar = heatmapCache.get(tip)!;
    sourceGuncelle();
    const maxSayi = tumNoktalar.reduce((m, p) => Math.max(m, p.properties.sayi), 1);
    layerEkleVeyaGuncelle(maxSayi);
    durumGuncelle(`${tumNoktalar.length.toLocaleString("tr-TR")} ısı hücresi (D1)`);
    istatistikGuncelle(tumNoktalar.length);
    return;
  }

  yukleniyor = true;
  durumGuncelle("Isı haritası yükleniyor (kendi veritabanımız)…");
  try {
    const res = await fetch(`${API_BASE}/harita/heatmap?analizTip=${tip}`);
    if (!res.ok) throw new Error(`heatmap HTTP ${res.status}`);
    const data = await res.json() as {
      noktalar?: Array<{ enlem: number; boylam: number; sayi: number }>;
      ilce_kapsam?: number;
      nokta_adet?: number;
    };
    seedIlceKapsam = data.ilce_kapsam ?? 0;
    const features: HeatPoint[] = (data.noktalar ?? []).map((n) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [n.boylam, n.enlem] },
      properties: { sayi: n.sayi },
    }));
    heatmapCache.set(tip, features);
    tumNoktalar = features;
    sourceGuncelle();
    const maxSayi = features.reduce((m, p) => Math.max(m, p.properties.sayi), 1);
    layerEkleVeyaGuncelle(maxSayi);
    const ilceEl = document.getElementById("stat-ilce");
    if (ilceEl) ilceEl.textContent = String(seedIlceKapsam || "—");
    durumGuncelle(
      `${features.length.toLocaleString("tr-TR")} ısı hücresi · ${seedIlceKapsam}/957 ilçe seed`,
    );
    istatistikGuncelle(features.length);
  } catch (e) {
    console.warn("[heatmap] D1 yükleme hatası:", e);
    durumGuncelle("Isı haritası yüklenemedi — sayfayı yenileyin");
  } finally {
    yukleniyor = false;
  }
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

// (eski lazy ilçe yükleme kaldırıldı — TKGM idari + N×birlesik yasak)

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

  // Belediye imar — İBB raster (İstanbul); diğer iller portal deep-link
  if (katman === "belediye-imar") {
    if (acik) {
      belediyeImarLayerEkle();
      const center = harita.getCenter();
      // İstanbul yaklaşık bbox dışıysa kullanıcıyı bilgilendir
      if (center.lng < 27.5 || center.lng > 30.2 || center.lat < 40.7 || center.lat > 41.6) {
        harita.flyTo({ center: [29.0, 41.05], zoom: 11, duration: 1200 });
      }
    } else {
      belediyeImarLayerKapat();
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

function tipDegistir(yeniTip: number) {
  aktifTip = yeniTip;
  tumNoktalar = [];
  sourceGuncelle();
  legendGuncelle(yeniTip);
  if (harita?.getLayer("heat-circle")) {
    harita.setPaintProperty("heat-circle", "circle-color", TIP_RENKLERI[yeniTip] ?? "#7c3aed");
  }
  void heatmapYukle(yeniTip);
}

/** ÇDP katmanı açıkken tıklama → GetFeatureInfo ipucu (üst plan; 1/1000 değil). */
async function cdpImarTiklama(lng: number, lat: number) {
  if (!harita || !MLPopup || !katmanDurum["cdp-imar"]) return;
  const slug = aktifCdpSlug ?? cdpSlugSec(lng);
  const ad = CDP_SLUGLARI.find((c) => c.slug === slug)?.ad ?? "ÇDP";
  const popup = new MLPopup({ closeButton: true, maxWidth: "260px" })
    .setLngLat([lng, lat])
    .setHTML(
      `<div style="font-family:Inter,sans-serif;font-size:12px;padding:2px">
        <div style="font-weight:600;color:#1B2A4A;margin-bottom:4px">ÇDP ipucu · ${ad}</div>
        <div id="cdp-fi-metin" style="color:#64748b">Sorgulanıyor…</div>
        <p style="font-size:10px;color:#94a3b8;margin:8px 0 0;line-height:1.35">
          Üst ölçek TUCBS. Resmi KAKS/TAKS için Chrome eklentisi.
        </p>
      </div>`,
    )
    .addTo(harita);
  try {
    const res = await fetch(
      `${API_BASE}/proxy/tucbs?wms=${encodeURIComponent(slug)}&lat=${lat}&lng=${lng}`,
      { signal: AbortSignal.timeout(8000) },
    );
    const el = document.getElementById("cdp-fi-metin");
    if (!el) return;
    if (!res.ok) {
      el.textContent = "Yanıt alınamadı veya kapsam dışı.";
      return;
    }
    const data = (await res.json()) as {
      features?: Array<{ properties?: Record<string, unknown> }>;
    };
    const feats = data.features;
    if (!feats?.length) {
      el.textContent = "Bu noktada ÇDP özelliği yok / kapsam dışı.";
      return;
    }
    const p = feats[0].properties ?? {};
    const keys = ["KULLANIM", "kullanim", "SINIF", "sinif", "ADI", "adi", "PLAN_ADI"];
    let ozet: string | null = null;
    for (const k of keys) {
      if (p[k] != null && String(p[k]).trim()) {
        ozet = String(p[k]).trim();
        break;
      }
    }
    if (!ozet) {
      const first = Object.entries(p).find(([, v]) => v != null && String(v).length < 80);
      ozet = first ? `${first[0]}: ${first[1]}` : "Katman bulundu";
    }
    el.style.color = "#334155";
    el.textContent = ozet;
  } catch {
    const el = document.getElementById("cdp-fi-metin");
    if (el) el.textContent = "Sorgu zaman aşımı.";
  }
  void popup;
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

  // Isı haritası — D1 tek paket (TKGM idari / ilçe-ilçe yok)
  document.getElementById("stat-ilce")!.textContent = "…";

  harita.on("load", async () => {
    sourceGuncelle();
    await heatmapYukle(aktifTip);
  });

  harita.on("moveend", () => {
    cdpKatmanGuncelle();
  });

  harita.on("click", (e) => {
    if (!katmanDurum["cdp-imar"]) return;
    void cdpImarTiklama(e.lngLat.lng, e.lngLat.lat);
  });

  // Legend tıklama — analiz tipi değiştir
  document.getElementById("analiz-legend")?.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest("[data-tip]") as HTMLElement | null;
    if (!target?.dataset["tip"]) return;
    const yeniTip = Number(target.dataset["tip"]);
    if (yeniTip === aktifTip) return;
    tipDegistir(yeniTip);
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
  const likiditeLegendWrap = document.getElementById("likidite-legend-wrap") as HTMLElement | null;
  let seciliLikiditKat: "arsa" | "tarla" = "arsa";

  async function likiditKatmanAc(kat: "arsa" | "tarla") {
    seciliLikiditKat = kat;
    document.querySelectorAll<HTMLButtonElement>(".likidite-kat-btn").forEach((b) => {
      const aktif = b.dataset["likiditeKategori"] === kat;
      b.setAttribute("aria-pressed", aktif ? "true" : "false");
      b.classList.toggle("text-cyan-300", aktif);
      b.classList.toggle("font-semibold", aktif);
      b.classList.toggle("bg-slate-700", aktif);
      b.classList.toggle("text-slate-400", !aktif);
    });
    await likiditToggle(kat);
    likiditeLegendWrap?.classList.remove("hidden");
    likiditeLegendWrap?.classList.add("flex");
  }

  likiditBtn?.addEventListener("click", async () => {
    const acik = likiditBtn.getAttribute("aria-pressed") === "true";
    if (acik) {
      likiditBtn.setAttribute("aria-pressed", "false");
      likiditBtn.classList.remove("bg-slate-600", "text-white", "border-cyan-400");
      likiditBtn.classList.add("text-slate-400");
      likiditKatWrap?.classList.replace("flex", "hidden");
      likiditeLegendWrap?.classList.add("hidden");
      likiditeLegendWrap?.classList.remove("flex");
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
      const kat = (btn.dataset["likiditeKategori"] ?? btn.dataset["likiditeKat"]) as "arsa" | "tarla" | undefined;
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
