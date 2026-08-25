import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { Flame as FlameIcon, Layers as LayersIcon, Mountain as MountainIcon, Thermometer as ThermometerIcon, TrendingUp as TrendingUpIcon } from "lucide-react";
import { BottomSheet, type SheetState } from "../components/BottomSheet";
import { IlanKarti } from "../components/IlanKarti";
import { getParselByLatLng } from "../../lib/tkgm-api";
import { db } from "../../lib/db";
import type { Parsel } from "../../types/tkgm";
import { ParselDetay } from "../components/ParselDetay";
import { ErrorBoundary } from "../components/ErrorBoundary";
import type { YakinNoktaMesafesi } from "../../lib/osm";
import { BasemapSecici } from "../components/BasemapSecici";
import { getBasemap } from "../../lib/basemaps";
import { ANALIZ_TIPI_ETIKETLERI, type AnalizTip } from "../../lib/tkgm-analiz";
import { HEAT_TIP_RENKLERI } from "./heatmap-layer";
import { EGIM_RENKLERI, type EgimKategori } from "./terrain-egim-layer";
import { useMapLayers } from "../../hooks/useMapLayers";
import { drawYakinPoiler } from "../../lib/map-poi-layer";

interface MapViewProps {
  flyTo?: { lat: number; lng: number; parsel?: Parsel } | null;
  onConsumed?: () => void;
  /** Karşılaştır butonuna tıklandığında karşılaştırma tabına geç */
  onTabDegistir?: (tab: string) => void;
}

export function MapView({ flyTo, onConsumed, onTabDegistir }: MapViewProps) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const parselRef = useRef<Parsel | null>(null);
  const [parsel, setParsel] = useState<Parsel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bottom sheet state
  const [sheetState, setSheetState] = useState<SheetState>("closed");
  // ── Tüm layer state/logic hook'a devredildi ──────────────────────────────
  const layers = useMapLayers({ mapRef, parsel });
  parselRef.current = parsel;

  // ── Basemap değişince parsel polygon'unu yeniden çiz ─────────────────────
  const oncekiBasemap = useRef(layers.basemap);
  useEffect(() => {
    if (oncekiBasemap.current === layers.basemap) return;
    oncekiBasemap.current = layers.basemap;
    const map = mapRef.current;
    if (!map) return;
    map.once("styledata", () => {
      if (parselRef.current) drawParsel(map, parselRef.current);
    });
  }, [layers.basemap]);

  // ── Harita init ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: getBasemap(layers.basemap).style,
      center: [35.0, 39.0],
      zoom: 5.5,
    });
    mapRef.current = map;
    map.on("click", async (e) => {
      const { lat, lng } = e.lngLat;
      await runQuery(lat, lng);
    });
    const ro = new ResizeObserver(() => { mapRef.current?.resize(); });
    ro.observe(mapEl.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!flyTo || !mapRef.current) return;
    if (flyTo.parsel) {
      handleParselSet(flyTo.parsel);
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

  // Parsel değişince sheet'i aç
  const handleParselSet = useCallback((p: Parsel | null) => {
    setParsel(p);
    setSheetState(p ? "peek" : "closed");
  }, []);

  // İlan tespit edilince:
  //   1. Sheet'i half'a aç — kullanıcı "TKGM'de doğrula" butonunu görsün
  //   2. İlan koordinatı varsa haritayı o noktaya fly et (ama yakın zoom'a gitme, bölgesel bak)
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome?.storage?.session) return;
    const dinleyici = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== "session" || !changes["sonIlan"]?.newValue) return;
      const yeniIlan = changes["sonIlan"].newValue as import("../../types/ilan").IlanBilgisi;

      // Sheet: parsel açık değilse half yap
      setSheetState((prev) => {
        if (prev === "closed" || prev === "peek") return "half";
        return prev;
      });

      // Koordinat fly — sadece parsel henüz seçili değilse ve koordinat yüksek güvenliyse
      const { lat, lng, koordDogruluk } = yeniIlan;
      if (
        lat != null && lng != null &&
        koordDogruluk === "yuksek" &&
        mapRef.current &&
        !parselRef.current  // zaten açık parsel varsa fly etme
      ) {
        mapRef.current.flyTo({
          center: [lng, lat],
          zoom: 14,   // bölgesel zoom — parseli görmek için yeterli ama fazla yakın değil
          duration: 1200,
        });
      }
    };
    chrome.storage.onChanged.addListener(dinleyici);
    return () => chrome.storage.onChanged.removeListener(dinleyici);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runQuery(lat: number, lng: number) {
    if (!mapRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getParselByLatLng(lat, lng);
      handleParselSet(result);
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
      handleParselSet(null);
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
    <div className="relative h-full w-full overflow-hidden">
      {/* ── Harita container — tam ekran, sheet'in altında kalır ── */}
      <div ref={mapEl} className="h-full w-full" />

      {/* ── Harita overlay kontroller — sağ kenarda dikey stack ── */}
      <BasemapSecici active={layers.basemap} onChange={layers.setBasemap} />

      {/* Basemap secici altında dikey sıralanmış katman kontrolleri */}
      <div className="absolute right-3 top-14 z-10 flex flex-col items-end gap-1">
        <HeatmapKontrol
          acik={layers.heatmapAcik}
          analizTip={layers.heatmapAnalizTip}
          yukleniyor={layers.heatmapYukleniyor}
          parselSecili={!!parsel?.ilceKodu}
          noktaSayisi={layers.heatmapNoktaSayisi}
          menuAcik={layers.heatmapMenuAcik}
          onMenuToggle={() => layers.setHeatmapMenuAcik((v) => !v)}
          onToggle={layers.toggleHeatmap}
          onTipChange={(t) => {
            layers.setHeatmapAnalizTip(t);
            layers.setHeatmapMenuAcik(false);
          }}
        />
        <CdpKontrol
          acik={layers.cdpAcik}
          kapsamVar={!!layers.cdpEndpoint}
          bolgeAd={layers.cdpEndpoint?.bolgeAd ?? null}
          onToggle={layers.toggleCdp}
        />
        <FiyatChoroplethKontrol
          acik={layers.fiyatAcik}
          yukleniyor={layers.fiyatYukleniyor}
          onToggle={layers.toggleFiyat}
        />
        <Terrain3DKontrol
          terrainAcik={layers.terrainAcik}
          egimAcik={layers.egimAcik}
          egimYukleniyor={layers.egimYukleniyor}
          egimSonuc={layers.egimSonuc}
          parselSecili={!!parsel}
          onExaggerationChange={layers.setTerrainExaggeration}
          onTerrainToggle={layers.toggleTerrain}
          onEgimToggle={layers.toggleEgim}
        />
      </div>

      {/* ── Yükleniyor göstergesi ── */}
      {loading && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
          Sorgulanıyor…
        </div>
      )}

      {/* ── Haritaya tıkla ipucu — parsel seçilmemiş ve sheet kapalıysa ── */}
      {sheetState === "closed" && !loading && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 hint-float">
          <div className="flex items-center gap-1.5 rounded-full border border-white/30 bg-black/50 px-3 py-1.5 text-xs text-white backdrop-blur-sm">
            <span aria-hidden="true">📍</span>
            Haritada bir noktaya tıkla
          </div>
        </div>
      )}

      {/* ── Bottom Sheet — parsel detay + ilan kartı ── */}
      <BottomSheet
        state={sheetState}
        onStateChange={setSheetState}
        closeable
      >
        {/* Hata durumu */}
        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </div>
        )}

        {/* İlan kartı — sheet içinde, header'da değil */}
        {parsel && (
          <div className="mb-2">
            <IlanKarti
              acikParsel={parsel}
              onParselDogrula={(p) => {
                handleParselSet(p);
                if (mapRef.current) {
                  drawParsel(mapRef.current, p);
                  mapRef.current.flyTo({
                    center: [p.merkezNokta.lng, p.merkezNokta.lat],
                    zoom: Math.max(mapRef.current.getZoom(), 17),
                  });
                }
              }}
            />
          </div>
        )}

        {/* Parsel detay */}
        {parsel && (
          <ErrorBoundary etiket="Parsel detay">
            <ParselDetay
              parsel={parsel}
              onYakinPoiler={(poiler) => {
                if (mapRef.current && parsel) {
                  drawYakinPoiler(mapRef.current, parsel.merkezNokta, poiler);
                }
              }}
              onAltyapiPoiler={(poiler) => {
                if (mapRef.current && parsel) {
                  drawYakinPoiler(mapRef.current, parsel.merkezNokta, poiler);
                }
              }}
              onKarsilastirTabAc={onTabDegistir ? () => onTabDegistir("karsilastirma") : undefined}
            />
          </ErrorBoundary>
        )}
      </BottomSheet>
    </div>
  );
}

/** TUCBS ÇDP renk katmanı toggle */
function CdpKontrol({
  acik,
  kapsamVar,
  bolgeAd,
  onToggle,
}: {
  acik: boolean;
  kapsamVar: boolean;
  bolgeAd: string | null;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          if (!kapsamVar) return;
          onToggle();
        }}
        disabled={!kapsamVar}
        title={
          kapsamVar
            ? acik
              ? "ÇDP plan katmanını kapat"
              : "TUCBS Çevre Düzeni Planı renk katmanı"
            : "Bu il için TUCBS ÇDP verisi yok"
        }
        className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          acik
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        }`}
        aria-label="ÇDP katmanı"
      >
        <LayersIcon className="h-4 w-4" />
      </button>
      {acik && bolgeAd && (
        <span className="max-w-[9rem] rounded-md border border-slate-200 bg-white px-2 py-0.5 text-right text-3xs text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {bolgeAd}
        </span>
      )}
    </div>
  );
}

/** Fiyat choropleth katmanı toggle butonu */
function FiyatChoroplethKontrol({
  acik,
  yukleniyor,
  onToggle,
}: {
  acik: boolean;
  yukleniyor: boolean;
  onToggle: () => Promise<void>;
}) {
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => { void onToggle(); }}
        title={acik ? "Fiyat haritasını kapat" : "TL/m² il fiyat haritasını aç"}
        className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border shadow-sm transition-colors ${
          acik
            ? "border-blue-600 bg-blue-600 text-white"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        }`}
        aria-label="Fiyat choropleth toggle"
        aria-pressed={acik}
      >
        <TrendingUpIcon className={`h-4 w-4 ${yukleniyor ? "animate-pulse" : ""}`} />
      </button>
      {acik && (
        <span className="max-w-[9rem] rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-right text-3xs text-blue-700 shadow-sm dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
          TL/m² Arsa
        </span>
      )}
    </div>
  );
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

/** 3D Terrain + Eğim ısı haritası toggle kontrol */
function Terrain3DKontrol({
  terrainAcik,
  egimAcik,
  egimYukleniyor,
  egimSonuc,
  parselSecili,
  onTerrainToggle,
  onEgimToggle,
  onExaggerationChange,
}: {
  terrainAcik: boolean;
  egimAcik: boolean;
  egimYukleniyor: boolean;
  egimSonuc: { kategori: EgimKategori; ortEgim: number; maxEgim: number } | null;
  parselSecili: boolean;
  onTerrainToggle: () => void;
  onEgimToggle: () => Promise<void>;
  onExaggerationChange: (v: number) => void;
}) {
  const egimRenk = egimSonuc ? EGIM_RENKLERI[egimSonuc.kategori] : undefined;
  const [exaggeration, setExaggeration] = useState(1.5);

  return (
    <div className="flex flex-col items-end gap-1">
      {/* 3D Terrain toggle */}
      <button
        type="button"
        onClick={onTerrainToggle}
        title={terrainAcik ? "3D görünümü kapat" : "3D terrain aç — Dijital Twin"}
        className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border shadow-sm transition-colors ${
          terrainAcik
            ? "border-transparent bg-indigo-600 text-white"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        }`}
        aria-label="3D Terrain Dijital Twin toggle"
        aria-pressed={terrainAcik}
      >
        <MountainIcon className="h-4 w-4" />
      </button>

      {/* Exaggeration slider — terrain açıkken göster */}
      {terrainAcik && (
        <div className="flex flex-col items-end gap-0.5 rounded-md border border-indigo-200 bg-white/95 px-2 py-1.5 shadow-sm dark:border-indigo-800 dark:bg-slate-800/95">
          <span className="text-[9px] font-medium text-indigo-700 dark:text-indigo-300">
            3D Yükseklik ×{exaggeration.toFixed(1)}
          </span>
          <input
            type="range"
            min={1}
            max={5}
            step={0.5}
            value={exaggeration}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setExaggeration(v);
              onExaggerationChange(v);
            }}
            className="w-20 accent-indigo-600"
            aria-label="Terrain yükseklik çarpanı"
          />
          <div className="flex w-full justify-between text-[8px] text-slate-400">
            <span>Gerçek</span><span>5×</span>
          </div>
        </div>
      )}

      {/* Eğim ısı haritası toggle — sadece parsel seçiliyken aktif */}
      <button
        type="button"
        onClick={() => { void onEgimToggle(); }}
        disabled={!parselSecili}
        title={
          !parselSecili
            ? "Önce haritada bir parsel seç"
            : egimAcik
              ? "Eğim haritasını kapat"
              : "Eğim ısı haritasını göster"
        }
        className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          egimAcik
            ? "border-transparent text-white"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        }`}
        style={egimAcik && egimRenk ? { backgroundColor: egimRenk } : undefined}
        aria-label="Eğim haritası toggle"
        aria-pressed={egimAcik}
      >
        <ThermometerIcon className={`h-4 w-4 ${egimYukleniyor ? "animate-pulse" : ""}`} />
      </button>

      {/* Eğim özet badge — açıkken göster */}
      {egimAcik && egimSonuc && (
        <div
          className="rounded border border-slate-200 bg-white/90 px-1.5 py-0.5 text-[9px] font-medium shadow-sm dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200"
          title={`Ortalama eğim: %${egimSonuc.ortEgim} · Max: %${egimSonuc.maxEgim}`}
        >
          <span style={{ color: egimRenk }}>⬛</span>{" "}
          %{egimSonuc.ortEgim} ort · %{egimSonuc.maxEgim} max
        </div>
      )}

      {/* Eğim renk açıklaması — açıkken göster */}
      {egimAcik && (
        <div className="rounded border border-slate-200 bg-white/90 p-1 text-[8px] shadow-sm dark:border-slate-700 dark:bg-slate-800/90">
          {(["duz", "hafif", "orta", "dik"] as EgimKategori[]).map((k) => (
            <div key={k} className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ backgroundColor: EGIM_RENKLERI[k] }}
              />
              <span className="text-slate-600 dark:text-slate-400">
                {k === "duz" ? "Düz (<2%)" : k === "hafif" ? "Hafif (2-5%)" : k === "orta" ? "Orta (5-15%)" : "Dik (>15%)"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
    <div className="flex flex-col gap-1">
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
