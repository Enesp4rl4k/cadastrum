import { useEffect, useRef, useState, useMemo } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { Flame as FlameIcon, Layers as LayersIcon, Mountain as MountainIcon, Thermometer as ThermometerIcon, Map as MapIcon, ExternalLink as ExternalLinkIcon, RotateCw as RetryIcon } from "lucide-react";
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
import { applyCdpWms, removeCdpWms, setCdpWmsOpacity } from "./cdp-wms-layer";
import {
  applyBelediyeWms,
  removeBelediyeWms,
  belediyeWmsKaynakBul,
} from "./belediye-wms-layer";
import { belediyeDeepLinkBul } from "../../lib/belediye-wms-tiles";
import { tucbsWmsEndpointGetir } from "../../lib/data/tucbs-wms-endpoints";
import { tucbsCdpGetir, CDP_LEJANT, type TucbsCdpSonuc } from "../../lib/tucbs";
import { useLisans } from "../../lib/lisans";
import {
  terrainEkle,
  terrainKaldir,
  egimHaritasiHesapla,
  egimHaritasiUygula,
  egimHaritasiKaldir,
  type EgimKategori,
  EGIM_RENKLERI,
} from "./terrain-egim-layer";

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
  const [cdpAcik, setCdpAcik] = useState(false);
  const cdpSlugRef = useRef<string | null>(null);
  const [cdpOpacity, setCdpOpacity] = useState(0.55);
  const [cdpInfo, setCdpInfo] = useState<TucbsCdpSonuc | null>(null);
  const [cdpInfoLoading, setCdpInfoLoading] = useState(false);
  const [belImarAcik, setBelImarAcik] = useState(false);
  const [katmanHata, setKatmanHata] = useState<string | null>(null);
  const [katmanRetryKey, setKatmanRetryKey] = useState(0);
  // Terrain + Eğim state'leri
  const [terrainAcik, setTerrainAcik] = useState(false);
  const [egimAcik, setEgimAcik] = useState(false);
  const [egimYukleniyor, setEgimYukleniyor] = useState(false);
  const [egimSonuc, setEgimSonuc] = useState<{ kategori: EgimKategori; ortEgim: number; maxEgim: number } | null>(null);
  parselRef.current = parsel;

  const lisans = useLisans();
  const heatmapYetki = lisans.can("tkgm-heatmap");
  const terrainYetki = lisans.can("uc-d-gorselleştirme");

  const cdpEndpoint = useMemo(
    () => (parsel?.ilAd ? tucbsWmsEndpointGetir(parsel.ilAd) : null),
    [parsel?.ilAd],
  );

  const belWmsKaynak = useMemo(
    () => belediyeWmsKaynakBul(parsel?.ilAd),
    [parsel?.ilAd],
  );
  const belWmsKaynakRef = useRef(belWmsKaynak);
  belWmsKaynakRef.current = belWmsKaynak;
  const belDeepLink = useMemo(
    () => belediyeDeepLinkBul(parsel?.ilAd),
    [parsel?.ilAd],
  );

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
      if (heatmapAcik && heatmapNoktalariRef.current.length > 0) {
        applyHeatmap(map, heatmapNoktalariRef.current, heatmapAnalizTip, { fitBounds: false });
      }
      if (cdpAcik && cdpSlugRef.current) {
        applyCdpWms(map, cdpSlugRef.current);
      }
      if (belImarAcik && belWmsKaynakRef.current) {
        applyBelediyeWms(map, belWmsKaynakRef.current);
      }
    });
  }, [basemap, heatmapAcik, heatmapAnalizTip, cdpAcik, belImarAcik]);

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

  // TUCBS ÇDP WMS overlay — il kapsamında ise raster katman
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!cdpAcik || !cdpEndpoint?.slug) {
      cdpSlugRef.current = null;
      removeCdpWms(map);
      setCdpInfo(null);
      return;
    }

    setKatmanHata(null);
    cdpSlugRef.current = cdpEndpoint.slug;
    try {
      applyCdpWms(map, cdpEndpoint.slug, cdpOpacity);
    } catch (e) {
      setKatmanHata(e instanceof Error ? e.message : "ÇDP katmanı yüklenemedi");
    }

    const onErr = (ev: { error?: { message?: string }; sourceId?: string }) => {
      if (ev.sourceId === "tucbs-cdp-wms-src" || String(ev.error?.message ?? "").includes("tucbs")) {
        setKatmanHata("ÇDP karoları yüklenemedi — ağ veya WMS hatası. Tekrar deneyin.");
      }
    };
    map.on("error", onErr);
    return () => {
      map.off("error", onErr);
    };
  }, [cdpAcik, cdpEndpoint?.slug, cdpOpacity, katmanRetryKey]);

  useEffect(() => {
    if (!cdpAcik) return;
    setCdpWmsOpacity(mapRef.current, cdpOpacity);
  }, [cdpOpacity, cdpAcik]);

  // İl kapsam dışına geçince overlay'i kapat
  useEffect(() => {
    if (!cdpEndpoint && cdpAcik) setCdpAcik(false);
  }, [cdpEndpoint, cdpAcik]);

  // ÇDP GetFeatureInfo — seçili parsel merkezinden
  useEffect(() => {
    if (!cdpAcik || !parsel || !cdpEndpoint) {
      if (!cdpAcik) setCdpInfo(null);
      return;
    }
    let iptal = false;
    setCdpInfoLoading(true);
    tucbsCdpGetir(parsel)
      .then((s) => {
        if (!iptal) setCdpInfo(s);
      })
      .catch(() => {
        if (!iptal) setCdpInfo(null);
      })
      .finally(() => {
        if (!iptal) setCdpInfoLoading(false);
      });
    return () => {
      iptal = true;
    };
  }, [cdpAcik, parsel, cdpEndpoint?.slug]);

  // Belediye imar WMS (pilot İBB ArcGIS)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!belImarAcik || !belWmsKaynak) {
      removeBelediyeWms(map);
      return;
    }
    setKatmanHata(null);
    try {
      applyBelediyeWms(map, belWmsKaynak);
    } catch (e) {
      setKatmanHata(e instanceof Error ? e.message : "Belediye imar katmanı yüklenemedi");
    }
    const onErr = (ev: { error?: { message?: string }; sourceId?: string }) => {
      if (ev.sourceId === "belediye-imar-wms-src") {
        setKatmanHata("Belediye imar karoları yüklenemedi. Portal linkini deneyin.");
      }
    };
    map.on("error", onErr);
    return () => {
      map.off("error", onErr);
    };
  }, [belImarAcik, belWmsKaynak, katmanRetryKey]);

  useEffect(() => {
    if (!belWmsKaynak && belImarAcik) setBelImarAcik(false);
  }, [belWmsKaynak, belImarAcik]);

  useEffect(() => {
    if (!heatmapYetki && heatmapAcik) setHeatmapAcik(false);
  }, [heatmapYetki, heatmapAcik]);

  useEffect(() => {
    if (!terrainYetki && terrainAcik) {
      setTerrainAcik(false);
      const map = mapRef.current;
      if (map) {
        terrainKaldir(map);
        map.easeTo({ pitch: 0, bearing: 0, duration: 300 });
      }
    }
  }, [terrainYetki, terrainAcik]);

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
          kilitli={!heatmapYetki}
          onMenuToggle={() => setHeatmapMenuAcik((v) => !v)}
          onToggle={() => {
            if (!heatmapYetki) return;
            setHeatmapAcik((v) => !v);
          }}
          onTipChange={(t) => {
            setHeatmapAnalizTip(t);
            setHeatmapMenuAcik(false);
          }}
        />
        <CdpKontrol
          acik={cdpAcik}
          kapsamVar={!!cdpEndpoint}
          bolgeAd={cdpEndpoint?.bolgeAd ?? null}
          ilAd={parsel?.ilAd ?? null}
          opacity={cdpOpacity}
          onOpacityChange={setCdpOpacity}
          onToggle={() => setCdpAcik((v) => !v)}
        />
        <BelediyeImarKontrol
          acik={belImarAcik}
          kaynakAd={belWmsKaynak?.ad ?? null}
          deepLink={belDeepLink}
          onToggle={() => setBelImarAcik((v) => !v)}
        />
        {katmanHata && (
          <div className="absolute left-3 right-14 top-3 z-20 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-2xs text-amber-900 shadow-sm">
            <span className="flex-1 leading-snug">{katmanHata}</span>
            <button
              type="button"
              className="shrink-0 rounded border border-amber-400 bg-white px-1.5 py-0.5 font-medium hover:bg-amber-100"
              onClick={() => {
                setKatmanHata(null);
                setKatmanRetryKey((k) => k + 1);
              }}
            >
              <RetryIcon className="inline h-3 w-3" /> Tekrar
            </button>
          </div>
        )}
        {cdpAcik && (cdpInfo || cdpInfoLoading) && (
          <div className="absolute bottom-3 left-3 z-20 max-w-[14rem] rounded-md border border-emerald-200 bg-white/95 px-2.5 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-900/95">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-emerald-700">ÇDP bu nokta</div>
            {cdpInfoLoading ? (
              <div className="mt-1 text-2xs text-slate-500">Sorgulanıyor…</div>
            ) : cdpInfo?.araziKullanimi ? (
              <div className="mt-1 space-y-0.5">
                <div className="text-2xs font-medium text-slate-800 dark:text-slate-100">
                  {cdpInfo.araziKullanimi.renkEtiket}
                </div>
                <div className="text-[10px] leading-snug text-slate-600 dark:text-slate-300">
                  {cdpInfo.araziKullanimi.metin}
                </div>
              </div>
            ) : (
              <div className="mt-1 text-2xs text-slate-500">
                {cdpInfo?.hata ?? "Bu noktada ÇDP özniteliği yok"}
              </div>
            )}
          </div>
        )}
        <Terrain3DKontrol
          terrainAcik={terrainAcik}
          egimAcik={egimAcik}
          egimYukleniyor={egimYukleniyor}
          egimSonuc={egimSonuc}
          parselSecili={!!parsel}
          kilitli={!terrainYetki}
          onTerrainToggle={() => {
            if (!terrainYetki) return;
            const map = mapRef.current;
            if (!map) return;
            const yeni = !terrainAcik;
            setTerrainAcik(yeni);
            if (yeni) {
              terrainEkle(map);
            } else {
              terrainKaldir(map);
              map.easeTo({ pitch: 0, bearing: 0, duration: 400 });
            }
          }}
          onEgimToggle={async () => {
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
            const minLat = Math.min(...lats);
            const maxLat = Math.max(...lats);
            const minLng = Math.min(...lngs);
            const maxLng = Math.max(...lngs);
            setEgimYukleniyor(true);
            try {
              const sonuc = await egimHaritasiHesapla(minLat, maxLat, minLng, maxLng);
              egimHaritasiUygula(map, sonuc.geojson);
              setEgimSonuc({ kategori: sonuc.kategori, ortEgim: sonuc.ortEgim, maxEgim: sonuc.maxEgim });
            } catch (e) {
              console.warn("[terrain] eğim hesaplama hatası:", e);
              setEgimAcik(false);
            } finally {
              setEgimYukleniyor(false);
            }
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
            onKarsilastirTabAc={onTabDegistir ? () => onTabDegistir("karsilastirma") : undefined}
          />
        )}
      </div>
    </div>
  );
}

/** TUCBS ÇDP renk katmanı toggle — heatmap butonunun altında */
function CdpKontrol({
  acik,
  kapsamVar,
  bolgeAd,
  ilAd,
  opacity,
  onOpacityChange,
  onToggle,
}: {
  acik: boolean;
  kapsamVar: boolean;
  bolgeAd: string | null;
  ilAd: string | null;
  opacity: number;
  onOpacityChange: (v: number) => void;
  onToggle: () => void;
}) {
  return (
    <div className="absolute right-3 top-[5.5rem] z-10 flex flex-col items-end gap-1">
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
              : "TUCBS Çevre Düzeni Planı (~1/100.000) renk katmanı"
            : ilAd
              ? `${ilAd}: TUCBS ÇDP WMS kapsam dışı (il-eksik)`
              : "Önce parsel seçin — ÇDP il kapsamında açılır"
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
        <div className="w-[11rem] rounded-md border border-emerald-200 bg-white px-2 py-1.5 text-left shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="text-3xs font-semibold text-emerald-800 dark:text-emerald-300">ÇDP · {bolgeAd}</div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[9px] text-slate-500">Opaklık</span>
            <input
              type="range"
              min={15}
              max={90}
              value={Math.round(opacity * 100)}
              onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
              className="h-1 flex-1 cursor-pointer accent-emerald-600"
            />
            <span className="w-6 text-right text-[9px] tabular-nums text-slate-500">{Math.round(opacity * 100)}</span>
          </div>
          <div className="mt-1.5 space-y-0.5 border-t border-slate-100 pt-1 dark:border-slate-700">
            {CDP_LEJANT.slice(0, 5).map((l) => (
              <div key={l.kategori} className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: l.renk }} />
                <span className="truncate text-[9px] text-slate-600 dark:text-slate-300">{l.etiket}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {!kapsamVar && ilAd && (
        <span className="max-w-[9rem] rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-right text-[9px] text-slate-500 shadow-sm">
          {ilAd}: ÇDP yok
        </span>
      )}
    </div>
  );
}

/** Belediye uygulama imar — İBB ArcGIS; diğer illerde deep-link */
function BelediyeImarKontrol({
  acik,
  kaynakAd,
  deepLink,
  onToggle,
}: {
  acik: boolean;
  kaynakAd: string | null;
  deepLink: { ad: string; url: string } | null;
  onToggle: () => void;
}) {
  const varMi = !!kaynakAd;
  return (
    <div className="absolute right-3 top-[8.25rem] z-10 flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          if (!varMi) return;
          onToggle();
        }}
        disabled={!varMi}
        title={
          varMi
            ? acik
              ? `${kaynakAd} katmanını kapat`
              : `${kaynakAd} — uygulama imar (ArcGIS export)`
            : deepLink
              ? `${deepLink.ad}: harita katmanı yok — portal linki kullanın`
              : "Belediye imar: şimdilik İstanbul (İBB) haritada; diğer iller portal linki"
        }
        className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          acik
            ? "border-amber-600 bg-amber-600 text-white"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        }`}
        aria-label="Belediye imar katmanı"
      >
        <MapIcon className="h-4 w-4" />
      </button>
      {acik && kaynakAd && (
        <div className="max-w-[10rem] rounded-md border border-amber-200 bg-white px-2 py-1 text-right shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="text-3xs font-semibold text-amber-800">{kaynakAd}</div>
          <div className="text-[9px] leading-tight text-slate-500">İBB CBS · 1/1000–1/5000</div>
        </div>
      )}
      {!varMi && deepLink && (
        <a
          href={deepLink.url}
          target="_blank"
          rel="noreferrer"
          className="flex max-w-[10rem] items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[9px] text-slate-700 shadow-sm hover:bg-slate-50"
          title="Belediye portalını yeni sekmede aç"
        >
          <ExternalLinkIcon className="h-3 w-3 shrink-0" />
          <span className="truncate">{deepLink.ad}</span>
        </a>
      )}
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

/** 3D Terrain + Eğim ısı haritası toggle kontrol */
function Terrain3DKontrol({
  terrainAcik,
  egimAcik,
  egimYukleniyor,
  egimSonuc,
  parselSecili,
  kilitli = false,
  onTerrainToggle,
  onEgimToggle,
}: {
  terrainAcik: boolean;
  egimAcik: boolean;
  egimYukleniyor: boolean;
  egimSonuc: { kategori: EgimKategori; ortEgim: number; maxEgim: number } | null;
  parselSecili: boolean;
  kilitli?: boolean;
  onTerrainToggle: () => void;
  onEgimToggle: () => Promise<void>;
}) {
  const egimRenk = egimSonuc ? EGIM_RENKLERI[egimSonuc.kategori] : undefined;

  return (
    <div className="absolute right-3 top-[11rem] z-10 flex flex-col items-end gap-1">
      {/* 3D Terrain toggle */}
      <button
        type="button"
        onClick={onTerrainToggle}
        disabled={kilitli}
        title={
          kilitli
            ? "3D terrain Kurumsal Pro özelliği"
            : terrainAcik
              ? "3D görünümü kapat"
              : "3D terrain aç (2D/3D)"
        }
        className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          terrainAcik
            ? "border-transparent bg-indigo-600 text-white"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        }`}
        aria-label="3D Terrain toggle"
        aria-pressed={terrainAcik}
      >
        <MountainIcon className="h-4 w-4" />
      </button>

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
  kilitli = false,
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
  kilitli?: boolean;
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
          if (kilitli || !parselSecili) return;
          onToggle();
        }}
        disabled={kilitli || !parselSecili}
        title={
          kilitli
            ? "TKGM heatmap Bireysel Pro özelliği"
            : parselSecili
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
