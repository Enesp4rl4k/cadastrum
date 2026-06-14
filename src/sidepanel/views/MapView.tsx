import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { Flame as FlameIcon } from "lucide-react";
import { getParselByLatLng } from "../../lib/tkgm-api";
import { db } from "../../lib/db";
import type { Parsel } from "../../types/tkgm";
import { ParselDetay } from "../components/ParselDetay";
import type { YakinNoktaMesafesi } from "../../lib/osm";
import { BasemapSecici } from "../components/BasemapSecici";
import {
  type BasemapId,
  getBasemap,
  loadSavedBasemap,
  saveBasemap,
} from "../../lib/basemaps";
import {
  type AnalizNoktasi,
  type AnalizTip,
  ANALIZ_TIPI_ETIKETLERI,
  YIL_SECENEKLERI,
  tkgmAnalizGetir,
} from "../../lib/tkgm-analiz";
import {
  HEAT_TIP_RENKLERI,
  applyHeatmap,
  removeHeatmap,
} from "./heatmap-layer";

interface MapViewProps {
  flyTo?: { lat: number; lng: number; parsel?: Parsel } | null;
  onConsumed?: () => void;
}

export function MapView({ flyTo, onConsumed }: MapViewProps) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const parselRef = useRef<Parsel | null>(null);
  const [parsel, setParsel] = useState<Parsel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [basemap, setBasemap] = useState<BasemapId>(() => loadSavedBasemap());
  const [heatmapAcik, setHeatmapAcik] = useState(false);
  const [heatmapAnalizTip, setHeatmapAnalizTip] = useState<AnalizTip>(1);
  const [heatmapYukleniyor, setHeatmapYukleniyor] = useState(false);
  const [heatmapNoktaSayisi, setHeatmapNoktaSayisi] = useState(0);
  /** Açık ilçe için cache'lenmiş heatmap noktaları — basemap swap sonrası repaint için */
  const heatmapNoktalariRef = useRef<AnalizNoktasi[]>([]);
  /** Önceki heatmapAcik durumu — true→false→true geçişlerinde fitBounds yapmak için */
  const heatmapOncekiAcikRef = useRef(false);
  const [heatmapMenuAcik, setHeatmapMenuAcik] = useState(false);
  parselRef.current = parsel;

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapEl.current,
      style: getBasemap(basemap).style,
      center: [35.0, 39.0],
      zoom: 5.5,
    });
    mapRef.current = map;

    map.on("click", async (e) => {
      const { lat, lng } = e.lngLat;
      await runQuery(lat, lng);
    });

    // Container boyutu değiştiğinde MapLibre'a haber ver — flex layout
    // ilk render'da 0 yükseklikle başlayabiliyor, yoksa harita siyah kalır.
    const ro = new ResizeObserver(() => {
      mapRef.current?.resize();
    });
    ro.observe(mapEl.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Basemap değişince stili swap et + parsel polygon'unu yeniden çiz.
  // İlk render'da (basemap zaten init style'ı) setStyle çağırmıyoruz —
  // MapLibre "Style is not done loading" uyarısını önler.
  const oncekiBasemap = useRef(basemap);
  useEffect(() => {
    if (oncekiBasemap.current === basemap) return;
    oncekiBasemap.current = basemap;
    const map = mapRef.current;
    if (!map) return;
    saveBasemap(basemap);
    map.setStyle(getBasemap(basemap).style);
    map.once("styledata", () => {
      if (parselRef.current) drawParsel(map, parselRef.current);
      // Basemap değişince heatmap layer'ı kaybolur; açıksa yeniden çiz
      if (heatmapAcik && heatmapNoktalariRef.current.length > 0) {
        applyHeatmap(map, heatmapNoktalariRef.current, heatmapAnalizTip, { fitBounds: false });
      }
    });
  }, [basemap, heatmapAcik, heatmapAnalizTip]);

  // Heatmap toggle / parsel ilçe değişimi → TKGM analiz noktalarını çek + render
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!heatmapAcik || !parsel?.ilceKodu) {
      heatmapNoktalariRef.current = [];
      heatmapOncekiAcikRef.current = false;
      setHeatmapNoktaSayisi(0);
      removeHeatmap(map);
      return;
    }

    // İlk kez açılıyor mu? (kapalıdan açığa geçiş) → veriyi gösterebilmek için fit
    const ilkAcilis = !heatmapOncekiAcikRef.current;
    heatmapOncekiAcikRef.current = true;

    const ctrl = new AbortController();
    setHeatmapYukleniyor(true);
    tkgmAnalizGetir(
      // YIL_SECENEKLERI[0] = en güncel yayımlanmış yıl (currentYear - 1)
      // TKGM ilgili yıl tamamlanana kadar veri yayımlamıyor → 400 yememek için
      { ilceKodu: parsel.ilceKodu, analizTip: heatmapAnalizTip, yil: YIL_SECENEKLERI[0] ?? 2024 },
      ctrl.signal,
    )
      .then((noktalar) => {
        if (ctrl.signal.aborted) return;
        heatmapNoktalariRef.current = noktalar;
        setHeatmapNoktaSayisi(noktalar.length);
        applyHeatmap(map, noktalar, heatmapAnalizTip, { fitBounds: ilkAcilis });
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) console.warn("[arsa-map] heatmap fetch hata:", e);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setHeatmapYukleniyor(false);
      });

    return () => ctrl.abort();
  }, [heatmapAcik, heatmapAnalizTip, parsel?.ilceKodu]);

  useEffect(() => {
    if (!flyTo || !mapRef.current) return;
    if (flyTo.parsel) {
      setParsel(flyTo.parsel);
      drawParsel(mapRef.current, flyTo.parsel);
      mapRef.current.flyTo({
        center: [flyTo.parsel.merkezNokta.lng, flyTo.parsel.merkezNokta.lat],
        zoom: Math.max(mapRef.current.getZoom(), 17),
      });
    } else {
      mapRef.current.flyTo({
        center: [flyTo.lng, flyTo.lat],
        zoom: 17,
      });
      runQuery(flyTo.lat, flyTo.lng);
    }
    onConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo]);

  async function runQuery(lat: number, lng: number) {
    if (!mapRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getParselByLatLng(lat, lng);
      setParsel(result);
      drawParsel(mapRef.current, result);
      await db.gecmis.add({
        lat,
        lng,
        zaman: Date.now(),
        basarili: true,
        parsel: result,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setParsel(null);
      await db.gecmis.add({
        lat,
        lng,
        zaman: Date.now(),
        basarili: false,
        hata: msg,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1">
        {/* MapLibre kendi container'ına position:relative enjekte ettiği için
            absolute+inset-0 ile sıfır yükseklik problemi yaşanıyor — h-full w-full
            kullanıp pozisyonu MapLibre'a bırakıyoruz. */}
        <div ref={mapEl} className="h-full w-full" />
        <BasemapSecici active={basemap} onChange={setBasemap} />
        <HeatmapKontrol
          acik={heatmapAcik}
          analizTip={heatmapAnalizTip}
          yukleniyor={heatmapYukleniyor}
          parselSecili={!!parsel?.ilceKodu}
          noktaSayisi={heatmapNoktaSayisi}
          menuAcik={heatmapMenuAcik}
          onMenuToggle={() => setHeatmapMenuAcik((v) => !v)}
          onToggle={() => setHeatmapAcik((v) => !v)}
          onTipChange={(t) => {
            setHeatmapAnalizTip(t);
            setHeatmapMenuAcik(false);
          }}
        />
        {loading && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded bg-black/70 px-3 py-1 text-xs text-white">
            Sorgulanıyor…
          </div>
        )}
      </div>

      <div className="max-h-[45%] overflow-y-auto border-t border-slate-200 bg-slate-50 p-3 text-xs">
        {error && (
          <div className="rounded border border-red-300 bg-red-50 p-2 text-red-700">
            {error}
          </div>
        )}
        {!error && !parsel && (
          <p className="text-tkgm-muted">
            Haritada bir noktaya tıkla, parsel bilgisi burada görünecek.
          </p>
        )}
        {parsel && (
          <ParselDetay
            parsel={parsel}
            onYakinPoiler={(poiler) => {
              if (mapRef.current && parsel) {
                drawYakinPoiler(mapRef.current, parsel.merkezNokta, poiler);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Yakın POI'leri (okul, durak, otoyol, vb.) parselin merkezinden çizgiyle bağla.
 * Her POI noktası daire + ikon + mesafe etiketiyle görünür.
 * `poiler === null` → katmanları temizle.
 */
function drawYakinPoiler(
  map: MapLibreMap,
  merkez: { lat: number; lng: number },
  poiler: { tip: string; ad: string; lat: number; lng: number; mesafeM: number; ikon?: string }[] | null,
): void {
  const LINE_SRC = "yakin-line-src";
  const POINT_SRC = "yakin-point-src";
  const LINE_LAYER = "yakin-line-layer";
  const POINT_LAYER = "yakin-point-layer";
  const LABEL_LAYER = "yakin-label-layer";

  // Temizle — TÜM türetilmiş layer'lar (halo, ikon dahil) source'tan ÖNCE silinmeli.
  // Aksi halde "Source cannot be removed while layer is using it" hatası oluşur.
  if (poiler === null || poiler.length === 0) {
    for (const id of [
      "yakin-line-label-layer",
      LABEL_LAYER,
      POINT_LAYER + "-ikon",
      POINT_LAYER,
      POINT_LAYER + "-halo",
      LINE_LAYER,
    ]) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    for (const id of ["yakin-line-label-src", POINT_SRC, LINE_SRC]) {
      if (map.getSource(id)) map.removeSource(id);
    }
    return;
  }

  // Her POI için: parselden POI'ye LineString
  const lineFeatures: GeoJSON.Feature[] = poiler.map((p) => ({
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [
        [merkez.lng, merkez.lat],
        [p.lng, p.lat],
      ],
    },
    properties: { tip: p.tip, ad: p.ad, mesafeM: p.mesafeM },
  }));

  const pointFeatures: GeoJSON.Feature[] = poiler.map((p) => {
    const km = p.mesafeM >= 1000 ? `${(p.mesafeM / 1000).toFixed(1)}km` : `${p.mesafeM}m`;
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: {
        tip: p.tip,
        ad: p.ad,
        mesafeM: p.mesafeM,
        ikon: p.ikon ?? "📍",
        etiket: `${p.ikon ?? "📍"} ${p.ad}\n${km}`,
      },
    };
  });

  // Mesafe etiketleri için LineString'in ortasına nokta hesapla
  const labelFeatures: GeoJSON.Feature[] = poiler.map((p) => {
    const midLng = (merkez.lng + p.lng) / 2;
    const midLat = (merkez.lat + p.lat) / 2;
    const km = p.mesafeM >= 1000 ? `${(p.mesafeM / 1000).toFixed(1)}km` : `${p.mesafeM}m`;
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [midLng, midLat] },
      properties: { mesafe: km, tip: p.tip },
    };
  });
  const labelData: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: labelFeatures,
  };
  const LINE_LABEL_SRC = "yakin-line-label-src";
  const LINE_LABEL_LAYER = "yakin-line-label-layer";

  const lineData: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: lineFeatures,
  };
  const pointData: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: pointFeatures,
  };

  const lineSrc = map.getSource(LINE_SRC) as maplibregl.GeoJSONSource | undefined;
  const pointSrc = map.getSource(POINT_SRC) as maplibregl.GeoJSONSource | undefined;

  // POI tipine göre renk paleti
  const renkMap: any = ["match", ["get", "tip"],
    "okul", "#3B82F6",         // mavi (eğitim)
    "saglik", "#DC2626",       // kırmızı (sağlık)
    "durak", "#10B981",        // yeşil (toplu taşıma)
    "motorway", "#F59E0B",     // turuncu (otoyol)
    "trunk", "#F59E0B",
    "primary", "#FBBF24",      // sarı-turuncu
    "secondary", "#FBBF24",
    "havalimani", "#8B5CF6",   // mor (havalimanı)
    "airport", "#8B5CF6",
    "tren", "#6366F1",         // indigo (raylı sistem)
    "railway", "#6366F1",
    "liman", "#0EA5E9",        // gök mavi (deniz)
    "port", "#0EA5E9",
    "ferry", "#0EA5E9",
    "endustri", "#71717A",     // gri (sanayi)
    "osb", "#71717A",
    "su_yolu", "#06B6D4",      // cyan (su)
    "river", "#06B6D4",
    "koy", "#A78BFA",          // lavanta (köy/yerleşim)
    /* default */ "#F59E0B",
  ];

  if (lineSrc) {
    lineSrc.setData(lineData);
  } else {
    map.addSource(LINE_SRC, { type: "geojson", data: lineData });
    map.addLayer({
      id: LINE_LAYER,
      type: "line",
      source: LINE_SRC,
      paint: {
        "line-color": renkMap as any,
        "line-width": 1.5,
        "line-dasharray": [2, 2],
        "line-opacity": 0.65,
      },
    });
  }

  if (pointSrc) {
    pointSrc.setData(pointData);
  } else {
    map.addSource(POINT_SRC, { type: "geojson", data: pointData });
    // Halo (dış halka)
    map.addLayer({
      id: POINT_LAYER + "-halo",
      type: "circle",
      source: POINT_SRC,
      paint: {
        "circle-radius": 12,
        "circle-color": renkMap as any,
        "circle-opacity": 0.18,
      },
    });
    // Asıl daire
    map.addLayer({
      id: POINT_LAYER,
      type: "circle",
      source: POINT_SRC,
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          10, 5,
          14, 7,
          18, 10,
        ],
        "circle-color": renkMap as any,
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 2,
      },
    });
    // İkon (emoji) — circle üstünde. text-font Noto Sans demotiles fontstack'i ile uyumlu.
    map.addLayer({
      id: POINT_LAYER + "-ikon",
      type: "symbol",
      source: POINT_SRC,
      layout: {
        "text-field": ["get", "ikon"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
    });
    // İsim + mesafe (alt etiket)
    map.addLayer({
      id: LABEL_LAYER,
      type: "symbol",
      source: POINT_SRC,
      layout: {
        "text-field": ["get", "etiket"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 10,
        "text-offset": [0, 1.4],
        "text-anchor": "top",
        "text-allow-overlap": false,
        "text-optional": true,
        "text-max-width": 8,
      },
      paint: {
        "text-color": "#1B2A4A",
        "text-halo-color": "#fff",
        "text-halo-width": 2,
      },
    });

    // Popup (tıklayınca detay)
    map.on("click", POINT_LAYER, (e) => {
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") return;
      const props = f.properties as { ad: string; tip: string; mesafeM: number; ikon: string };
      const km = props.mesafeM >= 1000
        ? `${(props.mesafeM / 1000).toFixed(2)} km`
        : `${props.mesafeM} m`;
      const tipAd: Record<string, string> = {
        okul: "Eğitim", saglik: "Sağlık", durak: "Toplu taşıma",
        motorway: "Otoyol", trunk: "Devlet yolu", primary: "Anayol", secondary: "İkincil yol",
        havalimani: "Havalimanı", airport: "Havalimanı",
        tren: "Tren / metro", railway: "Demiryolu",
        liman: "Liman", port: "Liman", ferry: "Feribot",
        endustri: "Sanayi", osb: "OSB",
        su_yolu: "Su yolu", river: "Nehir",
        koy: "Yerleşim",
      };
      const popup = new (window as any).maplibregl.Popup({ offset: 16, closeButton: true })
        .setLngLat((f.geometry as any).coordinates)
        .setHTML(`
          <div style="font-family:Inter,sans-serif;min-width:160px">
            <div style="font-size:9pt;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">
              ${tipAd[props.tip] ?? props.tip}
            </div>
            <div style="font-size:12pt;font-weight:600;color:#1B2A4A;margin-bottom:4px">
              ${props.ikon} ${props.ad}
            </div>
            <div style="font-size:10pt;color:#475569;display:flex;align-items:center;gap:6px">
              <span>📏</span>
              <span>${km}</span>
            </div>
          </div>
        `)
        .addTo(map as any);
      void popup;
    });
    map.on("mouseenter", POINT_LAYER, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", POINT_LAYER, () => { map.getCanvas().style.cursor = ""; });
  }

  // Mesafe etiketi line üzerinde (km)
  const lineLabelSrc = map.getSource(LINE_LABEL_SRC) as maplibregl.GeoJSONSource | undefined;
  if (lineLabelSrc) {
    lineLabelSrc.setData(labelData);
  } else {
    map.addSource(LINE_LABEL_SRC, { type: "geojson", data: labelData });
    map.addLayer({
      id: LINE_LABEL_LAYER,
      type: "symbol",
      source: LINE_LABEL_SRC,
      layout: {
        "text-field": ["get", "mesafe"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 9,
        "text-allow-overlap": false,
        "text-optional": true,
      },
      paint: {
        "text-color": "#475569",
        "text-halo-color": "#fff",
        "text-halo-width": 2,
      },
    });
  }
}

function drawParsel(map: MapLibreMap, parsel: Parsel) {
  const SRC = "parsel-src";
  const FILL = "parsel-fill";
  const LINE = "parsel-line";

  const geojson: GeoJSON.Feature = {
    type: "Feature",
    geometry: parsel.geometri as GeoJSON.Geometry,
    properties: {},
  };

  const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
  if (src) {
    src.setData(geojson);
  } else {
    map.addSource(SRC, { type: "geojson", data: geojson });
    map.addLayer({
      id: FILL,
      type: "fill",
      source: SRC,
      paint: { "fill-color": "#0d6efd", "fill-opacity": 0.25 },
    });
    map.addLayer({
      id: LINE,
      type: "line",
      source: SRC,
      paint: { "line-color": "#0d6efd", "line-width": 2 },
    });
  }
}

/**
 * Heatmap kontrol — BasemapSecici altında küçük floating button + dropdown.
 * Parsel açık değilken disabled (heatmap ilçe bazlı çalışıyor).
 */
function HeatmapKontrol({
  acik,
  analizTip,
  yukleniyor,
  parselSecili,
  noktaSayisi,
  menuAcik,
  onMenuToggle,
  onToggle,
  onTipChange,
}: {
  acik: boolean;
  analizTip: AnalizTip;
  yukleniyor: boolean;
  parselSecili: boolean;
  noktaSayisi: number;
  menuAcik: boolean;
  onMenuToggle: () => void;
  onToggle: () => void;
  onTipChange: (t: AnalizTip) => void;
}) {
  const aktifRenk = HEAT_TIP_RENKLERI[analizTip];

  return (
    <div className="absolute right-3 top-14 z-10 flex flex-col gap-1">
      <button
        type="button"
        onClick={() => {
          if (!parselSecili) return;
          onToggle();
        }}
        disabled={!parselSecili}
        title={
          parselSecili
            ? acik
              ? "TKGM heatmap'i kapat"
              : "TKGM heatmap'i aç"
            : "Önce haritada bir parsel seç"
        }
        className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          acik
            ? "border-transparent text-white"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        }`}
        style={acik ? { backgroundColor: aktifRenk } : undefined}
        aria-label="Heatmap toggle"
      >
        <FlameIcon className={`h-4 w-4 ${yukleniyor ? "animate-pulse" : ""}`} />
      </button>

      {acik && (
        <button
          type="button"
          onClick={onMenuToggle}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-3xs text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          title="Analiz tipini değiştir"
        >
          {ANALIZ_TIPI_ETIKETLERI[analizTip]}
          {!yukleniyor && noktaSayisi > 0 && (
            <span className="ml-1 text-slate-400">· {noktaSayisi}</span>
          )}
          {!yukleniyor && noktaSayisi === 0 && (
            <span className="ml-1 italic text-amber-600">· veri yok</span>
          )}
          {" ▾"}
        </button>
      )}

      {acik && menuAcik && (
        <div className="rounded-md border border-slate-200 bg-white p-1 text-3xs shadow-md dark:border-slate-700 dark:bg-slate-800">
          {([1, 2, 3, 4, 5] as AnalizTip[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTipChange(t)}
              className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left transition-colors ${
                t === analizTip
                  ? "bg-slate-100 font-semibold text-slate-800 dark:bg-slate-700 dark:text-slate-100"
                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: HEAT_TIP_RENKLERI[t] }}
              />
              {ANALIZ_TIPI_ETIKETLERI[t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
