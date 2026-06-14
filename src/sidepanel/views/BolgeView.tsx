import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import {
  bboxAreaM2,
  bolgeyiTara,
  gridPoints,
  nitelikRenkBul,
  statsHesapla,
  type BBox,
  type BolgeStats,
  type TaramaProgress,
} from "../../lib/bolge-profili";
import { PieChart, PieLegend, Histogram } from "../components/Charts";
import {
  Save as SaveIcon,
  Square as SquareIcon,
  Circle as CircleIcon,
  Maximize as MaximizeIcon,
  Sun as SunIcon,
  Sprout as SproutIcon,
  X as XIcon,
} from "lucide-react";
import {
  gunesAnalizGetir,
  gunesKalitesiSiniflandir,
} from "../../lib/gunes-enerjisi";
import { tarimAnalizGetir } from "../../lib/tarim-analiz";
import { KayitliTaramalar } from "../components/KayitliTaramalar";
import {
  tkgmAnalizGetir,
  type AnalizNoktasi,
  type AnalizTip,
} from "../../lib/tkgm-analiz";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../lib/db";
import type { Parsel } from "../../types/tkgm";
import { BasemapSecici } from "../components/BasemapSecici";
import {
  type BasemapId,
  getBasemap,
  loadSavedBasemap,
  saveBasemap,
} from "../../lib/basemaps";
import { normalizeYerAdi } from "../../lib/tkgm-api";
import {
  BolgeFiltreler,
  filtreUygula,
  VARSAYILAN_FILTRE,
  type BolgeFiltreState,
} from "../components/BolgeFiltreler";

export function BolgeView() {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const bboxRef = useRef<BBox | null>(null);
  const parsellerRef = useRef<Parsel[]>([]);
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [gridSize, setGridSize] = useState(50);
  const [taraniyor, setTaraniyor] = useState(false);
  const [progress, setProgress] = useState<TaramaProgress | null>(null);
  const [stats, setStats] = useState<BolgeStats | null>(null);
  const [parseller, setParseller] = useState<Parsel[]>([]);
  const [filtre, setFiltre] = useState<BolgeFiltreState>(VARSAYILAN_FILTRE);
  const filtrelenmisPars = useMemo(() => filtreUygula(parseller, filtre), [parseller, filtre]);
  const cancelRef = useRef<AbortController | null>(null);
  const [basemap, setBasemap] = useState<BasemapId>(() => loadSavedBasemap());

  // Çizim modu
  const [cizimModu, setCizimModu] = useState<"yok" | "dikdortgen" | "daire">("yok");
  const cizimModuRef = useRef(cizimModu);
  cizimModuRef.current = cizimModu;
  const ilkKoseRef = useRef<{ lat: number; lng: number } | null>(null);
  const [daireMerkez, setDaireMerkez] = useState<{ lat: number; lng: number } | null>(null);
  const [daireYaricapKm, setDaireYaricapKm] = useState(1);

  // Bölgesel modüler analiz seçimi
  const [analizSecimleri, setAnalizSecimleri] = useState({
    parselTara: true,
    gunesOzeti: false,
    tarimOzeti: false,
    tkgmHeatmap: false,
    sahibindenJoin: false,
  });
  const [bolgeGunes, setBolgeGunes] = useState<{ kwhKwp: number; sinif: string } | null>(null);
  const [bolgeTarim, setBolgeTarim] = useState<{
    kusak: string;
    yagis: number;
    sicaklik: number;
    enUygunUrunler: string[];
  } | null>(null);
  const [tkgmHeatNoktalari, setTkgmHeatNoktalari] = useState<
    AnalizNoktasi[] | null
  >(null);
  const [sahibindenJoin, setSahibindenJoin] = useState<
    { mahalle: string; ortPerM2: number; adet: number; renkSiniri: number }[] | null
  >(null);
  bboxRef.current = bbox;
  parsellerRef.current = parseller;

  // BBox içindeki sahibinden gözlemlerini çek
  const ilanGozlemBolge = useLiveQuery(
    async () => {
      if (!bbox) return [];
      // Tüm ilan gözlemleri lat/lng içermiyor; sadece mahalleAd / ilceAd üzerinden filtreleyebiliriz
      // — bu basit versiyonda sadece sayı veriyoruz, parsellerle birleştirme sonraki adıma
      return db.ilanGozlem.toArray();
    },
    [bbox],
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

    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(mapEl.current);

    // Çizim handler — mode'a göre tıklama davranışı
    map.on("click", (e) => {
      const mod = cizimModuRef.current;
      if (mod === "yok") return;
      const { lat, lng } = e.lngLat;

      if (mod === "dikdortgen") {
        if (!ilkKoseRef.current) {
          ilkKoseRef.current = { lat, lng };
          // Geçici bir nokta göster
          drawBbox(map, {
            guneyLat: lat,
            kuzeyLat: lat + 0.0001,
            batiLng: lng,
            doguLng: lng + 0.0001,
          });
        } else {
          const yeni: BBox = {
            guneyLat: Math.min(ilkKoseRef.current.lat, lat),
            kuzeyLat: Math.max(ilkKoseRef.current.lat, lat),
            batiLng: Math.min(ilkKoseRef.current.lng, lng),
            doguLng: Math.max(ilkKoseRef.current.lng, lng),
          };
          ilkKoseRef.current = null;
          setBbox(yeni);
          setStats(null);
          setParseller([]);
          setCizimModu("yok");
          drawBbox(map, yeni);
        }
      } else if (mod === "daire") {
        setDaireMerkez({ lat, lng });
        setCizimModu("yok");
        // BBox'ı daireden oluştur (yarıçap km'de)
        const dLat = daireYaricapKm / 111;
        const dLng = daireYaricapKm / (111 * Math.cos((lat * Math.PI) / 180));
        const yeni: BBox = {
          guneyLat: lat - dLat,
          kuzeyLat: lat + dLat,
          batiLng: lng - dLng,
          doguLng: lng + dLng,
        };
        setBbox(yeni);
        setStats(null);
        setParseller([]);
        drawBbox(map, yeni);
      }
    });

    map.on("mousemove", (e) => {
      const mod = cizimModuRef.current;
      if (mod === "dikdortgen" && ilkKoseRef.current) {
        const { lat, lng } = e.lngLat;
        drawBbox(map, {
          guneyLat: Math.min(ilkKoseRef.current.lat, lat),
          kuzeyLat: Math.max(ilkKoseRef.current.lat, lat),
          batiLng: Math.min(ilkKoseRef.current.lng, lng),
          doguLng: Math.max(ilkKoseRef.current.lng, lng),
        });
      }
    });

    // Cursor güncelleme
    const updateCursor = () => {
      const mod = cizimModuRef.current;
      map.getCanvas().style.cursor = mod !== "yok" ? "crosshair" : "";
    };
    map.on("mousemove", updateCursor);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Basemap swap + overlay'leri yeniden çiz (ilk render'da skip)
  const oncekiBasemap = useRef(basemap);
  useEffect(() => {
    if (oncekiBasemap.current === basemap) return;
    oncekiBasemap.current = basemap;
    const map = mapRef.current;
    if (!map) return;
    saveBasemap(basemap);
    map.setStyle(getBasemap(basemap).style);
    map.once("styledata", () => {
      if (bboxRef.current) drawBbox(map, bboxRef.current);
      if (parsellerRef.current.length > 0)
        drawParseller(map, parsellerRef.current);
    });
  }, [basemap]);

  function bboxOlustur() {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const yeni: BBox = {
      guneyLat: b.getSouth(),
      batiLng: b.getWest(),
      kuzeyLat: b.getNorth(),
      doguLng: b.getEast(),
    };
    // Görünüm çok büyükse %30 daralt (orta alana zoom)
    const dLat = (yeni.kuzeyLat - yeni.guneyLat) * 0.35;
    const dLng = (yeni.doguLng - yeni.batiLng) * 0.35;
    yeni.guneyLat += dLat;
    yeni.kuzeyLat -= dLat;
    yeni.batiLng += dLng;
    yeni.doguLng -= dLng;
    setBbox(yeni);
    setStats(null);
    setParseller([]);
    drawBbox(map, yeni);
  }

  function bboxSil() {
    setBbox(null);
    setStats(null);
    setParseller([]);
    setBolgeGunes(null);
    setBolgeTarim(null);
    setDaireMerkez(null);
    ilkKoseRef.current = null;
    eraseBbox(mapRef.current);
  }

  function cizimBaslat(mod: "dikdortgen" | "daire") {
    ilkKoseRef.current = null;
    setBbox(null);
    setStats(null);
    setParseller([]);
    eraseBbox(mapRef.current);
    setCizimModu(mod);
  }

  async function tara() {
    if (!bbox) return;
    cancelRef.current = new AbortController();
    setTaraniyor(true);
    setProgress({ done: 0, total: 0, bulunan: 0, cacheHit: 0 });
    setStats(null);
    setParseller([]);
    const baslangic = Date.now();
    try {
      const sonuc = await bolgeyiTara(bbox, gridSize, {
        signal: cancelRef.current.signal,
        onProgress: (p) => setProgress(p),
      });
      const sureSn = (Date.now() - baslangic) / 1000;
      const istat = statsHesapla(
        sonuc.parseller,
        bbox,
        sonuc.toplamSorgu,
        sonuc.basariliSorgu,
        sonuc.cacheHit,
        sureSn,
      );
      setStats(istat);
      setParseller(sonuc.parseller);
      drawParseller(mapRef.current, sonuc.parseller);

      // Modüler ek analizler — paralel
      const merkezLat = (bbox.guneyLat + bbox.kuzeyLat) / 2;
      const merkezLng = (bbox.batiLng + bbox.doguLng) / 2;

      if (analizSecimleri.gunesOzeti) {
        try {
          const ges = await gunesAnalizGetir(merkezLat, merkezLng);
          const sinif = gunesKalitesiSiniflandir(ges.yillikKwhPerKwp).sinif;
          setBolgeGunes({ kwhKwp: ges.yillikKwhPerKwp, sinif });
        } catch (e) {
          console.warn("[bolge-gunes] hata:", e);
        }
      }
      if (analizSecimleri.tarimOzeti) {
        try {
          const trm = await tarimAnalizGetir(merkezLat, merkezLng);
          setBolgeTarim({
            kusak: trm.iklimKusagi,
            yagis: trm.iklim.yillikYagisMm,
            sicaklik: trm.iklim.ortSicaklikC,
            enUygunUrunler: trm.oneriUrunler
              .filter((u) => u.uygunluk === "yuksek")
              .slice(0, 3)
              .map((u) => `${u.ikon} ${u.urun}`),
          });
        } catch (e) {
          console.warn("[bolge-tarim] hata:", e);
        }
      }

      // TKGM Resmi Analiz heatmap — bbox içindeki ilçelerin satış yoğunluğu
      if (analizSecimleri.tkgmHeatmap && sonuc.parseller.length > 0) {
        try {
          // En çok bulunan ilçenin kodu
          const ilceMap = new Map<number, number>();
          for (const p of sonuc.parseller) {
            if (p.ilceKodu) ilceMap.set(p.ilceKodu, (ilceMap.get(p.ilceKodu) ?? 0) + 1);
          }
          const sortedIlce = [...ilceMap.entries()].sort(([, a], [, b]) => b - a);
          const enCokIlceKodu = sortedIlce[0]?.[0];
          if (enCokIlceKodu) {
            const yil = new Date().getFullYear() - 2; // 2 yıl önce stabil veri
            const noktalar = await tkgmAnalizGetir({
              analizTip: 1 as AnalizTip,
              yil,
              ilceKodu: enCokIlceKodu,
            });
            // bbox içine düşenleri filtrele
            const bboxIcindekiler = noktalar.filter(
              (n) =>
                n.enlem >= bbox.guneyLat &&
                n.enlem <= bbox.kuzeyLat &&
                n.boylam >= bbox.batiLng &&
                n.boylam <= bbox.doguLng,
            );
            setTkgmHeatNoktalari(bboxIcindekiler);
            if (mapRef.current) drawTkgmHeatmap(mapRef.current, bboxIcindekiler);
          }
        } catch (e) {
          console.warn("[bolge-tkgm-heat] hata:", e);
        }
      }

      // Sahibinden join — bbox içindeki parsellerin mahalleleri × ilanGozlem
      if (analizSecimleri.sahibindenJoin && sonuc.parseller.length > 0) {
        try {
          const mahalleSet = new Set(
            sonuc.parseller
              .map((p) => p.mahalleAd)
              .filter(Boolean)
              .map((mahalle) => normalizeYerAdi(mahalle)),
          );
          const tumIlanlar = await db.ilanGozlem.toArray();
          const grup = new Map<string, number[]>();
          for (const ilan of tumIlanlar) {
            const mahalleNorm =
              ilan.mahalleNorm ?? (ilan.mahalleAd ? normalizeYerAdi(ilan.mahalleAd) : null);
            if (
              ilan.mahalleAd &&
              mahalleNorm &&
              mahalleSet.has(mahalleNorm) &&
              ilan.fiyatPerM2 != null &&
              ilan.fiyatPerM2 > 0 &&
              ilan.paraBirimi === "TL"
            ) {
              const arr = grup.get(ilan.mahalleAd) ?? [];
              arr.push(ilan.fiyatPerM2);
              grup.set(ilan.mahalleAd, arr);
            }
          }
          const sonuclar = [...grup.entries()].map(([mahalle, fiyatlar]) => ({
            mahalle,
            ortPerM2: Math.round(
              fiyatlar.reduce((s, v) => s + v, 0) / fiyatlar.length,
            ),
            adet: fiyatlar.length,
            renkSiniri: 0,
          }));
          // Renk sınırı: ortalamayı 3 grup'a böl (alt/orta/üst)
          if (sonuclar.length > 0) {
            const sortedFiyat = sonuclar.map((s) => s.ortPerM2).sort((a, b) => a - b);
            const altSinir = sortedFiyat[Math.floor(sortedFiyat.length / 3)] ?? 0;
            const ustSinir =
              sortedFiyat[Math.floor((sortedFiyat.length * 2) / 3)] ?? Infinity;
            for (const s of sonuclar) {
              s.renkSiniri =
                s.ortPerM2 <= altSinir ? 1 : s.ortPerM2 >= ustSinir ? 3 : 2;
            }
          }
          setSahibindenJoin(sonuclar.sort((a, b) => b.ortPerM2 - a.ortPerM2));
        } catch (e) {
          console.warn("[bolge-sahibinden] hata:", e);
        }
      }
    } finally {
      setTaraniyor(false);
    }
  }

  function kayitliTaramayiYukle(t: import("../../lib/db").BolgeTaramasi) {
    const map = mapRef.current;
    if (!map) return;
    setBbox(t.bbox);
    setStats(t.stats);
    setParseller(t.parseller);
    setBolgeGunes(null);
    setBolgeTarim(null);
    setTkgmHeatNoktalari(null);
    setSahibindenJoin(null);
    drawBbox(map, t.bbox);
    drawParseller(map, t.parseller);
    // BBox merkezine fly
    map.flyTo({
      center: [
        (t.bbox.batiLng + t.bbox.doguLng) / 2,
        (t.bbox.guneyLat + t.bbox.kuzeyLat) / 2,
      ],
      zoom: 14,
    });
  }

  function durdur() {
    cancelRef.current?.abort();
  }

  const tahminiPunto = bbox ? gridPoints(bbox, gridSize).length : 0;
  const tahminiSure = Math.round((tahminiPunto * 0.25) / 60);
  const alanKm2 = bbox ? bboxAreaM2(bbox) / 1_000_000 : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1">
        <div ref={mapEl} className="h-full w-full" />
        <BasemapSecici active={basemap} onChange={setBasemap} />
        {cizimModu !== "yok" && (
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded bg-tkgm-primary/95 px-3 py-1 text-xs font-medium text-white shadow-lg">
            {cizimModu === "dikdortgen"
              ? ilkKoseRef.current
                ? "İkinci köşeye tıkla"
                : "İlk köşeye tıkla"
              : "Daire merkezine tıkla"}
          </div>
        )}
        {cizimModu === "yok" && !bbox && (
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded bg-black/70 px-3 py-1 text-xs text-white">
            Aşağıdan çizim aracı seç veya görünür alanı kullan
          </div>
        )}
      </div>

      <div className="max-h-[55%] overflow-y-auto border-t border-slate-200 bg-slate-50 p-3 text-xs">
        {/* Kayıtlı taramalar - her durumda görünsün */}
        <KayitliTaramalar
          onAc={kayitliTaramayiYukle}
          aktifStats={stats}
        />

        {!bbox && (
          <div className="mt-2 space-y-2">
            <div className="text-2xs font-semibold text-slate-700">
              Bölge sınırını seç:
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={bboxOlustur}
                disabled={cizimModu !== "yok"}
                className="flex cursor-pointer flex-col items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-2 text-2xs font-medium text-slate-700 transition-colors hover:border-tkgm-primary hover:bg-tkgm-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <MaximizeIcon className="h-4 w-4" />
                Görünür alan
              </button>
              <button
                type="button"
                onClick={() => cizimBaslat("dikdortgen")}
                className={`flex cursor-pointer flex-col items-center gap-1 rounded-md border px-2 py-2 text-2xs font-medium transition-colors ${
                  cizimModu === "dikdortgen"
                    ? "border-tkgm-primary bg-tkgm-primary/10 text-tkgm-primary"
                    : "border-slate-300 bg-white text-slate-700 hover:border-tkgm-primary hover:bg-tkgm-primary/5"
                }`}
              >
                <SquareIcon className="h-4 w-4" />
                Dikdörtgen çiz
              </button>
              <button
                type="button"
                onClick={() => cizimBaslat("daire")}
                className={`flex cursor-pointer flex-col items-center gap-1 rounded-md border px-2 py-2 text-2xs font-medium transition-colors ${
                  cizimModu === "daire"
                    ? "border-tkgm-primary bg-tkgm-primary/10 text-tkgm-primary"
                    : "border-slate-300 bg-white text-slate-700 hover:border-tkgm-primary hover:bg-tkgm-primary/5"
                }`}
              >
                <CircleIcon className="h-4 w-4" />
                Daire (radius)
              </button>
            </div>

            {cizimModu === "daire" && (
              <label className="flex flex-col gap-0.5 rounded-md border border-tkgm-primary/30 bg-tkgm-primary/5 p-2">
                <span className="text-3xs text-slate-600">
                  Yarıçap: {daireYaricapKm} km
                </span>
                <input
                  type="range"
                  min={0.2}
                  max={10}
                  step={0.1}
                  value={daireYaricapKm}
                  onChange={(e) => setDaireYaricapKm(Number(e.target.value))}
                  className="w-full accent-tkgm-primary"
                />
              </label>
            )}
            {cizimModu !== "yok" && (
              <button
                type="button"
                onClick={() => {
                  setCizimModu("yok");
                  ilkKoseRef.current = null;
                  eraseBbox(mapRef.current);
                }}
                className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-2xs text-slate-600 hover:bg-slate-50"
              >
                <XIcon className="h-3 w-3" />
                Çizimi iptal et
              </button>
            )}
          </div>
        )}

        {bbox && !taraniyor && !stats && (
          <div className="space-y-2">
            <div className="rounded border border-slate-200 bg-white p-2">
              <div className="font-medium">BBox tanımlı</div>
              <div className="text-tkgm-muted">
                Alan: {alanKm2.toFixed(2)} km² · Grid: {gridSize}m × {gridSize}m
              </div>
              <div className="text-tkgm-muted">
                Tahmini sorgu: <strong>{tahminiPunto}</strong> nokta · Süre ~{tahminiSure} dk
              </div>
            </div>

            <label className="flex items-center gap-2">
              <span className="font-medium text-tkgm-muted">Grid boyutu:</span>
              <select
                value={gridSize}
                onChange={(e) => setGridSize(Number(e.target.value))}
                className="rounded border border-slate-300 bg-white px-2 py-1"
              >
                <option value={25}>25 m (en hassas, çok yavaş)</option>
                <option value={50}>50 m (önerilen)</option>
                <option value={100}>100 m (hızlı, kaba)</option>
                <option value={200}>200 m (çok hızlı, sadece büyük parseller)</option>
              </select>
            </label>

            {tahminiPunto > 500 && (
              <div className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-800">
                ⚠ Çok fazla nokta. TKGM'ye nazik ol — 500'ün altına düşürmek için zoom'u
                yakınlaştır veya grid'i büyüt.
              </div>
            )}

            {/* Modüler analiz seçimi */}
            <div className="rounded-md border border-slate-200 bg-white p-2">
              <div className="mb-1 text-2xs font-semibold text-slate-700">
                Tarama içeriği
              </div>
              <label className="flex cursor-pointer items-center gap-2 py-0.5 hover:bg-slate-50 rounded px-1">
                <input
                  type="checkbox"
                  checked={analizSecimleri.parselTara}
                  onChange={(e) =>
                    setAnalizSecimleri((s) => ({
                      ...s,
                      parselTara: e.target.checked,
                    }))
                  }
                  className="h-3 w-3 cursor-pointer accent-tkgm-primary"
                />
                <span className="text-2xs">📍 Parsel taraması (TKGM)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 py-0.5 hover:bg-slate-50 rounded px-1">
                <input
                  type="checkbox"
                  checked={analizSecimleri.gunesOzeti}
                  onChange={(e) =>
                    setAnalizSecimleri((s) => ({
                      ...s,
                      gunesOzeti: e.target.checked,
                    }))
                  }
                  className="h-3 w-3 cursor-pointer accent-amber-500"
                />
                <span className="flex items-center gap-1 text-2xs">
                  <SunIcon className="h-3 w-3 text-accent-warning" />
                  Bölge güneş enerjisi özeti (PVGIS)
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 py-0.5 hover:bg-slate-50 rounded px-1">
                <input
                  type="checkbox"
                  checked={analizSecimleri.tarimOzeti}
                  onChange={(e) =>
                    setAnalizSecimleri((s) => ({
                      ...s,
                      tarimOzeti: e.target.checked,
                    }))
                  }
                  className="h-3 w-3 cursor-pointer accent-emerald-500"
                />
                <span className="flex items-center gap-1 text-2xs">
                  <SproutIcon className="h-3 w-3 text-accent-success" />
                  Bölge tarım analizi (5-yıl iklim)
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 py-0.5 hover:bg-slate-50 rounded px-1">
                <input
                  type="checkbox"
                  checked={analizSecimleri.tkgmHeatmap}
                  onChange={(e) =>
                    setAnalizSecimleri((s) => ({
                      ...s,
                      tkgmHeatmap: e.target.checked,
                    }))
                  }
                  className="h-3 w-3 cursor-pointer accent-purple-500"
                />
                <span className="flex items-center gap-1 text-2xs">
                  <span className="text-purple-600">🔥</span>
                  TKGM resmi alım-satım heatmap
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 py-0.5 hover:bg-slate-50 rounded px-1">
                <input
                  type="checkbox"
                  checked={analizSecimleri.sahibindenJoin}
                  onChange={(e) =>
                    setAnalizSecimleri((s) => ({
                      ...s,
                      sahibindenJoin: e.target.checked,
                    }))
                  }
                  className="h-3 w-3 cursor-pointer accent-orange-500"
                />
                <span className="flex items-center gap-1 text-2xs">
                  <span className="text-orange-600">📡</span>
                  Sahibinden mahalle TL/m² join
                </span>
              </label>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={tara}
                disabled={tahminiPunto === 0 || tahminiPunto > 2000}
                className="flex-1 rounded bg-tkgm-primary py-2 font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
              >
                ▶ Bölgeyi tara
              </button>
              <button
                type="button"
                onClick={bboxSil}
                className="rounded border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50"
              >
                Temizle
              </button>
            </div>
          </div>
        )}

        {taraniyor && progress && (
          <div className="space-y-2">
            <div className="font-medium">Taranıyor…</div>
            <div className="h-1.5 w-full overflow-hidden rounded bg-slate-200">
              <div
                className="h-full bg-tkgm-primary transition-all"
                style={{
                  width: `${(progress.done / Math.max(progress.total, 1)) * 100}%`,
                }}
              />
            </div>
            <div className="text-tkgm-muted">
              {progress.done}/{progress.total} sorgu · {progress.bulunan} parsel bulundu
            </div>
            <button
              type="button"
              onClick={durdur}
              className="rounded bg-red-600 px-3 py-1 font-medium text-white"
            >
              Durdur
            </button>
          </div>
        )}

        {stats && (
          <StatsBlogu
            stats={stats}
            ilanSayisi={ilanGozlemBolge?.length ?? 0}
            parsellerForSave={parseller}
            bolgeGunes={bolgeGunes}
            bolgeTarim={bolgeTarim}
            tkgmHeatNoktalari={tkgmHeatNoktalari}
            sahibindenJoin={sahibindenJoin}
          />
        )}

        {/* Prospecting filtreleri — taranan parselleri daraltma */}
        {parseller.length > 0 && (
          <div className="mt-3">
            <BolgeFiltreler
              filtre={filtre}
              setFiltre={setFiltre}
              toplamSayi={parseller.length}
              filtrelenmisSayi={filtrelenmisPars.length}
            />
          </div>
        )}

        {stats && (
          <div className="mt-3 flex gap-2 border-t border-slate-200 pt-2">
            <button
              type="button"
              onClick={tara}
              className="rounded border border-slate-300 bg-white px-3 py-1 text-[11px]"
            >
              ↻ Yeniden tara
            </button>
            <button
              type="button"
              onClick={bboxSil}
              className="rounded border border-slate-300 bg-white px-3 py-1 text-[11px]"
            >
              Temizle
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatsBlogu({
  stats,
  ilanSayisi,
  parsellerForSave,
  bolgeGunes,
  bolgeTarim,
  tkgmHeatNoktalari,
  sahibindenJoin,
}: {
  stats: BolgeStats;
  ilanSayisi: number;
  parsellerForSave: Parsel[];
  bolgeGunes: { kwhKwp: number; sinif: string } | null;
  bolgeTarim: {
    kusak: string;
    yagis: number;
    sicaklik: number;
    enUygunUrunler: string[];
  } | null;
  tkgmHeatNoktalari: AnalizNoktasi[] | null;
  sahibindenJoin: { mahalle: string; ortPerM2: number; adet: number; renkSiniri: number }[] | null;
}) {
  const verim =
    stats.toplamSorgu > 0
      ? Math.round((stats.basariliSorgu / stats.toplamSorgu) * 100)
      : 0;

  return (
    <div className="space-y-2">
      <div className="rounded border border-slate-200 bg-white p-2">
        <div className="font-semibold text-tkgm-ink">📊 Bölge Profili</div>
        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
          <KV k="Eşsiz parsel" v={String(stats.parselSayisi)} />
          <KV k="Toplam alan" v={`${(stats.toplamAlanM2 / 10_000).toFixed(1)} ha`} />
          <KV k="Ortalama" v={`${stats.ortalamaAlanM2.toLocaleString("tr-TR")} m²`} />
          <KV k="Medyan" v={`${stats.medyanAlanM2.toLocaleString("tr-TR")} m²`} />
          <KV k="En küçük" v={`${stats.enKucukAlanM2.toLocaleString("tr-TR")} m²`} />
          <KV k="En büyük" v={`${stats.enBuyukAlanM2.toLocaleString("tr-TR")} m²`} />
          <KV k="Tarama süresi" v={`${Math.round(stats.taramaSureSn)} sn`} />
          <KV k="Sorgu verimi" v={`%${verim}`} />
          <KV k="Cache hit" v={`${stats.cacheHit} parsel`} />
        </div>
      </div>

      {ilanSayisi > 0 && (
        <div className="rounded border border-orange-200 bg-orange-50 p-2">
          <div className="font-medium text-orange-800">
            💡 İlan gözlemi: {ilanSayisi} sahibinden ilanı kayıtlı
          </div>
          <div className="text-[10px] text-orange-700">
            Bu bbox'taki TKGM parsellerini ilanlarla eşleyip TL/m² heatmap'i v0.5'te gelecek.
          </div>
        </div>
      )}

      {stats.nitelikDagilimi.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-card">
          <div className="mb-2 text-2xs font-semibold text-slate-700">
            Nitelik dağılımı
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <PieChart
                size={90}
                strokeWidth={16}
                toplamLabel={String(stats.parselSayisi)}
                dilimler={stats.nitelikDagilimi.map((n) => {
                  const { renk } = nitelikRenkBul(n.nitelik);
                  return { label: n.nitelik || "—", value: n.sayi, renk };
                })}
              />
            </div>
            <div className="min-w-0 flex-1">
              <PieLegend
                dilimler={stats.nitelikDagilimi.map((n) => {
                  const { renk } = nitelikRenkBul(n.nitelik);
                  return { label: n.nitelik || "—", value: n.sayi, renk };
                })}
              />
            </div>
          </div>
        </div>
      )}

      {stats.alanHistogram.some((h) => h.sayi > 0) && (
        <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-card">
          <div className="mb-2 text-2xs font-semibold text-slate-700">
            Alan dağılımı (m²)
          </div>
          <Histogram
            bins={stats.alanHistogram.map((h) => ({
              label: h.aralik,
              value: h.sayi,
            }))}
            color="#3b82f6"
          />
        </div>
      )}

      {stats.mahalleDagilimi.length > 1 && (
        <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-card">
          <div className="mb-1 text-2xs font-semibold text-slate-700">
            Mahalle dağılımı
          </div>
          <div className="space-y-0.5 text-2xs">
            {stats.mahalleDagilimi.slice(0, 5).map((m) => (
              <div key={m.mahalle} className="flex items-baseline justify-between">
                <span className="truncate text-slate-600">{m.mahalle}</span>
                <span className="font-medium tabular-nums text-slate-700">
                  {m.sayi}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bölgesel ek analizler */}
      {bolgeGunes && (
        <div className="rounded-lg border-2 border-amber-200 bg-amber-50/60 p-2 shadow-card">
          <div className="mb-1 flex items-center gap-1.5 text-2xs font-semibold text-accent-warning">
            <SunIcon className="h-3.5 w-3.5" />
            Bölge güneş enerjisi
          </div>
          <div className="grid grid-cols-2 gap-x-3 text-2xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Yıllık üretim</span>
              <span className="font-semibold tabular-nums text-slate-800">
                {bolgeGunes.kwhKwp.toLocaleString("tr-TR")} kWh/kWp
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Sınıf</span>
              <span className="font-semibold text-accent-warning">
                {bolgeGunes.sinif}
              </span>
            </div>
          </div>
        </div>
      )}

      {bolgeTarim && (
        <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50/60 p-2 shadow-card">
          <div className="mb-1 flex items-center gap-1.5 text-2xs font-semibold text-accent-success">
            <SproutIcon className="h-3.5 w-3.5" />
            Bölge tarım profili
          </div>
          <div className="grid grid-cols-2 gap-x-3 text-2xs">
            <div className="flex justify-between">
              <span className="text-slate-500">İklim kuşağı</span>
              <span className="font-semibold text-slate-800">
                {bolgeTarim.kusak}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Sıcaklık</span>
              <span className="font-semibold tabular-nums text-slate-800">
                {bolgeTarim.sicaklik}°C
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Yıllık yağış</span>
              <span className="font-semibold tabular-nums text-slate-800">
                {bolgeTarim.yagis} mm
              </span>
            </div>
          </div>
          {bolgeTarim.enUygunUrunler.length > 0 && (
            <div className="mt-1 text-2xs">
              <span className="text-slate-500">En uygun ürünler: </span>
              <span className="font-medium text-accent-success">
                {bolgeTarim.enUygunUrunler.join(", ")}
              </span>
            </div>
          )}
        </div>
      )}

      {/* TKGM resmi alım-satım heatmap özeti */}
      {tkgmHeatNoktalari && tkgmHeatNoktalari.length > 0 && (
        <div className="rounded-lg border-2 border-purple-200 bg-purple-50/60 p-2 shadow-card">
          <div className="mb-1 flex items-center gap-1.5 text-2xs font-semibold text-accent-ai">
            🔥 TKGM resmi alım-satım heatmap
          </div>
          <div className="text-2xs">
            <span className="text-slate-500">Bbox içinde:</span>{" "}
            <span className="font-semibold tabular-nums text-slate-800">
              {tkgmHeatNoktalari.length} parsel
            </span>{" "}
            <span className="text-slate-500">·</span>{" "}
            <span className="font-semibold tabular-nums text-slate-800">
              {tkgmHeatNoktalari.reduce((s, n) => s + n.sayi, 0)} işlem
            </span>{" "}
            <span className="text-slate-500">son 2 yıl</span>
          </div>
          <p className="mt-1 text-3xs italic text-slate-500">
            Harita üstünde mor→kırmızı gradient. Yoğunluk yüksek = likit bölge.
          </p>
        </div>
      )}

      {/* Sahibinden mahalle join */}
      {sahibindenJoin && sahibindenJoin.length > 0 && (
        <div className="rounded-lg border-2 border-orange-200 bg-orange-50/60 p-2 shadow-card">
          <div className="mb-1 flex items-center gap-1.5 text-2xs font-semibold text-accent-ilan">
            📡 Sahibinden mahalle TL/m² join
          </div>
          <div className="space-y-0.5 text-3xs">
            {sahibindenJoin.map((s) => {
              const renkClass =
                s.renkSiniri === 3
                  ? "bg-red-100 text-red-700"
                  : s.renkSiniri === 1
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700";
              return (
                <div
                  key={s.mahalle}
                  className="flex items-baseline justify-between gap-2"
                >
                  <span className="truncate text-slate-700">{s.mahalle}</span>
                  <span className="flex-shrink-0 text-slate-500">
                    n={s.adet}
                  </span>
                  <span
                    className={`flex-shrink-0 rounded px-1.5 py-0.5 font-bold tabular-nums ${renkClass}`}
                  >
                    {s.ortPerM2.toLocaleString("tr-TR")} TL/m²
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-3xs italic text-slate-500">
            Yeşil = ucuz bölge, kırmızı = pahalı (3-tile bölünmüş). Sahibinden
            ilan gözlemlerinden lokal birikim.
          </p>
        </div>
      )}

      {/* Kayıtlı tarama olarak sakla */}
      <SaveScanDugmesi stats={stats} parseller={stats.parselSayisi > 0 ? parsellerForSave : []} />
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2 py-0.5 text-[11px]">
      <span className="text-tkgm-muted">{k}</span>
      <span className="font-medium text-tkgm-ink">{v}</span>
    </div>
  );
}

function drawBbox(map: MapLibreMap, bbox: BBox) {
  const SRC = "bbox-src";
  const FILL = "bbox-fill";
  const LINE = "bbox-line";
  const data: GeoJSON.Feature = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [bbox.batiLng, bbox.guneyLat],
          [bbox.doguLng, bbox.guneyLat],
          [bbox.doguLng, bbox.kuzeyLat],
          [bbox.batiLng, bbox.kuzeyLat],
          [bbox.batiLng, bbox.guneyLat],
        ],
      ],
    },
  };
  const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
  if (src) {
    src.setData(data);
  } else {
    map.addSource(SRC, { type: "geojson", data });
    map.addLayer({
      id: FILL,
      type: "fill",
      source: SRC,
      paint: { "fill-color": "#0d6efd", "fill-opacity": 0.1 },
    });
    map.addLayer({
      id: LINE,
      type: "line",
      source: SRC,
      paint: { "line-color": "#0d6efd", "line-width": 2, "line-dasharray": [3, 2] },
    });
  }
}

function eraseBbox(map: MapLibreMap | null) {
  if (!map) return;
  for (const id of ["bbox-fill", "bbox-line", "parseller-fill", "parseller-line"]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of ["bbox-src", "parseller-src"]) {
    if (map.getSource(id)) map.removeSource(id);
  }
}

function drawParseller(map: MapLibreMap | null, parseller: Parsel[]) {
  if (!map) return;
  const SRC = "parseller-src";
  const FILL = "parseller-fill";
  const LINE = "parseller-line";

  // Niteliğe göre renk-kodlu polygons
  const features: GeoJSON.Feature[] = parseller.map((p) => {
    const { renk } = nitelikRenkBul(p.nitelik);
    return {
      type: "Feature",
      geometry: p.geometri as GeoJSON.Geometry,
      properties: {
        nitelik: p.nitelik,
        alan: p.alan,
        adaParsel: `${p.adaNo}/${p.parselNo}`,
        renk,
      },
    };
  });
  const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
  const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
  if (src) {
    src.setData(data);
  } else {
    map.addSource(SRC, { type: "geojson", data });
    map.addLayer({
      id: FILL,
      type: "fill",
      source: SRC,
      paint: {
        "fill-color": ["coalesce", ["get", "renk"], "#10b981"],
        "fill-opacity": 0.45,
      },
    });
    map.addLayer({
      id: LINE,
      type: "line",
      source: SRC,
      paint: {
        "line-color": ["coalesce", ["get", "renk"], "#059669"],
        "line-width": 1.2,
      },
    });

    // Hover popup
    let popup: maplibregl.Popup | null = null;
    map.on("mousemove", FILL, (e) => {
      if (!e.features?.[0]) return;
      map.getCanvas().style.cursor = "pointer";
      const props = e.features[0].properties as {
        nitelik: string;
        alan: number;
        adaParsel: string;
      };
      const html = `<div style="font: 11px system-ui;padding:2px 4px;line-height:1.4">
        <strong>${props.adaParsel}</strong><br/>
        ${props.nitelik || "—"} · ${props.alan.toLocaleString("tr-TR")} m²
      </div>`;
      if (popup) popup.remove();
      popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
      })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map);
    });
    map.on("mouseleave", FILL, () => {
      map.getCanvas().style.cursor = "";
      if (popup) {
        popup.remove();
        popup = null;
      }
    });
  }
}

function drawTkgmHeatmap(
  map: MapLibreMap,
  noktalar: AnalizNoktasi[],
): void {
  const SRC = "tkgm-heat-bolge-src";
  const LAYER = "tkgm-heat-bolge-layer";
  if (noktalar.length === 0) return;

  const maxSayi = Math.max(...noktalar.map((n) => n.sayi), 1);
  const features: GeoJSON.Feature[] = noktalar.map((n) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [n.boylam, n.enlem] },
    properties: { sayi: n.sayi, weight: n.sayi / maxSayi },
  }));
  const data: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features,
  };

  const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
  if (src) {
    src.setData(data);
  } else {
    map.addSource(SRC, { type: "geojson", data });
    map.addLayer({
      id: LAYER,
      type: "heatmap",
      source: SRC,
      paint: {
        "heatmap-weight": ["get", "weight"],
        "heatmap-intensity": 0.9,
        "heatmap-radius": 18,
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0, "rgba(124, 58, 237, 0)",
          0.2, "rgba(124, 58, 237, 0.3)",
          0.5, "rgba(168, 85, 247, 0.55)",
          0.8, "rgba(220, 38, 38, 0.7)",
          1, "rgba(127, 29, 29, 0.85)",
        ],
        "heatmap-opacity": 0.75,
      },
    });
  }
}

function SaveScanDugmesi({
  stats,
  parseller,
}: {
  stats: BolgeStats;
  parseller: Parsel[];
}) {
  const [kaydetmeModu, setKaydetmeModu] = useState(false);
  const [ad, setAd] = useState("");
  const [not, setNot] = useState("");
  const [kayitliMi, setKayitliMi] = useState(false);

  async function kaydet() {
    if (!ad.trim()) return;
    await db.bolgeTaramalari.add({
      ad: ad.trim(),
      not: not.trim(),
      olusmaTarihi: Date.now(),
      bbox: stats.bbox,
      parseller,
      stats,
    });
    setKayitliMi(true);
    setKaydetmeModu(false);
    setTimeout(() => setKayitliMi(false), 2000);
  }

  if (kayitliMi) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-2xs text-accent-success">
        ✓ Kaydedildi! Daha sonra "Kayıtlı taramalar"dan tekrar açabilirsin.
      </div>
    );
  }

  if (!kaydetmeModu) {
    return (
      <button
        type="button"
        onClick={() => setKaydetmeModu(true)}
        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-2xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
      >
        <SaveIcon className="h-3.5 w-3.5" />
        Bu taramayı kaydet
      </button>
    );
  }

  return (
    <div className="space-y-1.5 rounded-md border border-slate-300 bg-white p-2">
      <input
        type="text"
        value={ad}
        onChange={(e) => setAd(e.target.value)}
        placeholder="Tarama adı (örn. Esenyurt batı kanat)"
        className="w-full rounded border border-slate-300 px-2 py-1 text-2xs"
        autoFocus
      />
      <textarea
        value={not}
        onChange={(e) => setNot(e.target.value)}
        placeholder="Not (opsiyonel)"
        rows={2}
        className="w-full resize-none rounded border border-slate-300 px-2 py-1 text-2xs"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={kaydet}
          disabled={!ad.trim()}
          className="flex-1 cursor-pointer rounded-md bg-tkgm-primary px-2 py-1 text-2xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Kaydet
        </button>
        <button
          type="button"
          onClick={() => setKaydetmeModu(false)}
          className="cursor-pointer rounded-md border border-slate-300 px-2 py-1 text-2xs"
        >
          Vazgeç
        </button>
      </div>
    </div>
  );
}
