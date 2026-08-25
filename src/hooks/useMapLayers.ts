/**
 * useMapLayers — MapView'daki tüm harita katmanı state ve logic'ini kapsüller.
 *
 * Yönettiği katmanlar:
 *   - Basemap (stil değişimi)
 *   - Heatmap (TKGM analiz noktaları)
 *   - CDP WMS overlay (TUCBS Çevre Düzeni Planı)
 *   - Fiyat Choropleth (il bazlı TL/m²)
 *   - 3D Terrain + Eğim ısı haritası
 *
 * MapView sadece bu hook'u çağırıp sonuçları render'a geçirir.
 */

import { useEffect, useRef, useState, useMemo } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import maplibregl from "maplibre-gl";
import {
  type BasemapId,
  getBasemap,
  loadSavedBasemap,
  saveBasemap,
} from "../lib/basemaps";
import {
  type AnalizNoktasi,
  type AnalizTip,
  YIL_SECENEKLERI,
  tkgmAnalizGetir,
} from "../lib/tkgm-analiz";
import { HEAT_TIP_RENKLERI, applyHeatmap, removeHeatmap } from "../sidepanel/views/heatmap-layer";
import { applyCdpWms, removeCdpWms } from "../sidepanel/views/cdp-wms-layer";
import { tucbsWmsEndpointGetir } from "../lib/data/tucbs-wms-endpoints";
import {
  fiyatChoroplethEkle,
  fiyatChoroplethGorunurluk,
} from "../sidepanel/views/fiyat-choropleth-layer";
import {
  terrainEkle,
  terrainKaldir,
  terrainExaggerationGuncelle,
  egimHaritasiHesapla,
  egimHaritasiUygula,
  egimHaritasiKaldir,
  type EgimKategori,
} from "../sidepanel/views/terrain-egim-layer";
import type { Parsel } from "../types/tkgm";

export interface EgimSonuc {
  kategori: EgimKategori;
  ortEgim: number;
  maxEgim: number;
}

export interface MapLayersState {
  basemap: BasemapId;
  heatmapAcik: boolean;
  heatmapAnalizTip: AnalizTip;
  heatmapYukleniyor: boolean;
  heatmapNoktaSayisi: number;
  heatmapMenuAcik: boolean;
  cdpAcik: boolean;
  cdpEndpoint: ReturnType<typeof tucbsWmsEndpointGetir>;
  fiyatAcik: boolean;
  fiyatYukleniyor: boolean;
  terrainAcik: boolean;
  egimAcik: boolean;
  egimYukleniyor: boolean;
  egimSonuc: EgimSonuc | null;
}

export interface MapLayersActions {
  setBasemap: (id: BasemapId) => void;
  toggleHeatmap: () => void;
  setHeatmapAnalizTip: (t: AnalizTip) => void;
  setHeatmapMenuAcik: (v: boolean | ((prev: boolean) => boolean)) => void;
  toggleCdp: () => void;
  toggleFiyat: () => Promise<void>;
  toggleTerrain: () => void;
  toggleEgim: () => Promise<void>;
  setTerrainExaggeration: (v: number) => void;
}

interface Options {
  mapRef: React.MutableRefObject<MapLibreMap | null>;
  parsel: Parsel | null;
}

export function useMapLayers({ mapRef, parsel }: Options): MapLayersState & MapLayersActions {
  const [basemap, setBasemapState] = useState<BasemapId>(() => loadSavedBasemap());
  const [heatmapAcik, setHeatmapAcik] = useState(false);
  const [heatmapAnalizTip, setHeatmapAnalizTip] = useState<AnalizTip>(1);
  const [heatmapYukleniyor, setHeatmapYukleniyor] = useState(false);
  const [heatmapNoktaSayisi, setHeatmapNoktaSayisi] = useState(0);
  const [heatmapMenuAcik, setHeatmapMenuAcik] = useState(false);
  const [cdpAcik, setCdpAcik] = useState(false);
  const [fiyatAcik, setFiyatAcik] = useState(false);
  const [fiyatYukleniyor, setFiyatYukleniyor] = useState(false);
  const [terrainAcik, setTerrainAcik] = useState(false);
  const [egimAcik, setEgimAcik] = useState(false);
  const [egimYukleniyor, setEgimYukleniyor] = useState(false);
  const [egimSonuc, setEgimSonuc] = useState<EgimSonuc | null>(null);

  const heatmapNoktalariRef = useRef<AnalizNoktasi[]>([]);
  const heatmapOncekiAcikRef = useRef(false);
  const cdpSlugRef = useRef<string | null>(null);
  const fiyatPopupClassRef = useRef<typeof maplibregl.Popup | null>(null);
  const oncekiBasemap = useRef(basemap);

  const cdpEndpoint = useMemo(
    () => (parsel?.ilAd ? tucbsWmsEndpointGetir(parsel.ilAd) : null),
    [parsel?.ilAd],
  );

  // ── Basemap değişimi ──────────────────────────────────────────────────────
  const setBasemap = (id: BasemapId) => {
    setBasemapState(id);
  };

  useEffect(() => {
    if (oncekiBasemap.current === basemap) return;
    oncekiBasemap.current = basemap;
    const map = mapRef.current;
    if (!map) return;
    saveBasemap(basemap);
    map.setStyle(getBasemap(basemap).style);
    map.once("styledata", () => {
      if (heatmapAcik && heatmapNoktalariRef.current.length > 0) {
        applyHeatmap(map, heatmapNoktalariRef.current, heatmapAnalizTip, { fitBounds: false });
      }
      if (cdpAcik && cdpSlugRef.current) {
        applyCdpWms(map, cdpSlugRef.current);
      }
    });
  }, [basemap, heatmapAcik, heatmapAnalizTip, cdpAcik, mapRef]);

  // ── Heatmap ───────────────────────────────────────────────────────────────
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
    const ilkAcilis = !heatmapOncekiAcikRef.current;
    heatmapOncekiAcikRef.current = true;
    const ctrl = new AbortController();
    setHeatmapYukleniyor(true);
    tkgmAnalizGetir(
      { ilceKodu: parsel.ilceKodu, analizTip: heatmapAnalizTip, yil: YIL_SECENEKLERI[0] ?? 2024 },
      ctrl.signal,
    )
      .then((noktalar) => {
        if (ctrl.signal.aborted) return;
        heatmapNoktalariRef.current = noktalar;
        setHeatmapNoktaSayisi(noktalar.length);
        if (map) applyHeatmap(map, noktalar, heatmapAnalizTip, { fitBounds: ilkAcilis });
      })
      .catch((e) => { if (!ctrl.signal.aborted) console.warn("[heatmap]", e); })
      .finally(() => { if (!ctrl.signal.aborted) setHeatmapYukleniyor(false); });
    return () => ctrl.abort();
  }, [heatmapAcik, heatmapAnalizTip, parsel?.ilceKodu, mapRef]);

  const toggleHeatmap = () => {
    if (!parsel?.ilceKodu) return;
    setHeatmapAcik((v) => !v);
  };

  // ── CDP WMS ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!cdpAcik || !cdpEndpoint?.slug) {
      cdpSlugRef.current = null;
      removeCdpWms(map);
      return;
    }
    cdpSlugRef.current = cdpEndpoint.slug;
    applyCdpWms(map, cdpEndpoint.slug);
  }, [cdpAcik, cdpEndpoint?.slug, mapRef]);

  useEffect(() => {
    if (!cdpEndpoint && cdpAcik) setCdpAcik(false);
  }, [cdpEndpoint, cdpAcik]);

  const toggleCdp = () => {
    if (!cdpEndpoint) return;
    setCdpAcik((v) => !v);
  };

  // ── Fiyat Choropleth ──────────────────────────────────────────────────────
  const toggleFiyat = async () => {
    const map = mapRef.current;
    if (!map) return;
    const yeni = !fiyatAcik;
    setFiyatAcik(yeni);
    if (!yeni) {
      fiyatChoroplethGorunurluk(map, false);
      return;
    }
    setFiyatYukleniyor(true);
    try {
      const PopupClass = fiyatPopupClassRef.current ?? maplibregl.Popup;
      await fiyatChoroplethEkle(map, PopupClass, "arsa");
    } catch (e) {
      console.warn("[fiyat-choropleth]", e);
      setFiyatAcik(false);
    } finally {
      setFiyatYukleniyor(false);
    }
  };

  // ── Terrain ───────────────────────────────────────────────────────────────
  const toggleTerrain = () => {
    const map = mapRef.current;
    if (!map) return;
    const yeni = !terrainAcik;
    setTerrainAcik(yeni);
    if (yeni) {
      if (basemap !== "esri-sat") {
        setBasemap("esri-sat");
        map.once("styledata", () => {
          terrainEkle(map);
          map.easeTo({ pitch: 45, bearing: -15, duration: 800 });
        });
      } else {
        terrainEkle(map);
        map.easeTo({ pitch: 45, bearing: -15, duration: 800 });
      }
    } else {
      terrainKaldir(map);
      map.easeTo({ pitch: 0, bearing: 0, duration: 400 });
    }
  };

  const setTerrainExaggeration = (v: number) => {
    if (mapRef.current) terrainExaggerationGuncelle(mapRef.current, v);
  };

  // ── Eğim ─────────────────────────────────────────────────────────────────
  const toggleEgim = async () => {
    const map = mapRef.current;
    if (!map || !parsel) return;
    const yeni = !egimAcik;
    setEgimAcik(yeni);
    if (!yeni) {
      egimHaritasiKaldir(map);
      setEgimSonuc(null);
      return;
    }
    const coords = parsel.koordinatlar;
    if (!coords.length) return;
    const lats = coords.map(c => c.lat);
    const lngs = coords.map(c => c.lng);
    setEgimYukleniyor(true);
    try {
      const sonuc = await egimHaritasiHesapla(
        Math.min(...lats), Math.max(...lats),
        Math.min(...lngs), Math.max(...lngs),
      );
      egimHaritasiUygula(map, sonuc.geojson);
      setEgimSonuc({ kategori: sonuc.kategori, ortEgim: sonuc.ortEgim, maxEgim: sonuc.maxEgim });
    } catch (e) {
      console.warn("[terrain-egim]", e);
      setEgimAcik(false);
    } finally {
      setEgimYukleniyor(false);
    }
  };

  return {
    // state
    basemap,
    heatmapAcik,
    heatmapAnalizTip,
    heatmapYukleniyor,
    heatmapNoktaSayisi,
    heatmapMenuAcik,
    cdpAcik,
    cdpEndpoint,
    fiyatAcik,
    fiyatYukleniyor,
    terrainAcik,
    egimAcik,
    egimYukleniyor,
    egimSonuc,
    // actions
    setBasemap,
    toggleHeatmap,
    setHeatmapAnalizTip,
    setHeatmapMenuAcik,
    toggleCdp,
    toggleFiyat,
    toggleTerrain,
    toggleEgim,
    setTerrainExaggeration,
  };
}
