import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import {
  bboxAreaM2,
  bolgeyiTara,
  gridPoints,
  statsHesapla,
  type BBox,
  type BolgeStats,
  type TaramaProgress,
} from "../../lib/bolge-profili";
import {
  Save as SaveIcon,
} from "lucide-react";
import { BolgeSinirSecici } from "../components/BolgeSinirSecici";
import { BolgeAnalizSec } from "../components/BolgeAnalizSec";
import { BolgeIlerleme } from "../components/BolgeIlerleme";
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
import { drawBbox, eraseBbox, drawParseller, drawTkgmHeatmap } from "./bolge-map-layers";
import { StatsBlogu } from "../components/StatsBlogu";
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
        } catch { /* güneş analizi başarısız — sessizce atla */ }
      }
      if (analizSecimleri.tarimOzeti) {
        try {
          const trm = await tarimAnalizGetir(merkezLat, merkezLng);
          setBolgeTarim({
            kusak: trm.iklimKusagi,
            yagis: trm.iklim.yillikYagisMm,
            sicaklik: trm.iklim.ortSicaklikC,
            enUygunUrunler: trm.oneriUrunler
              .filter((u: import("../../lib/tarim-analiz").UrunUygunluk) => u.uygunluk === "yuksek")
              .slice(0, 3)
              .map((u: import("../../lib/tarim-analiz").UrunUygunluk) => `${u.ikon} ${u.urun}`),
          });
        } catch { /* tarım analizi başarısız — sessizce atla */ }
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
        } catch { /* TKGM ısı haritası başarısız — sessizce atla */ }
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
        } catch { /* Sahibinden emsal başarısız — sessizce atla */ }
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
          <BolgeSinirSecici
            cizimModu={cizimModu}
            daireYaricapKm={daireYaricapKm}
            alanKm2={alanKm2}
            gridSize={gridSize}
            tahminiPunto={tahminiPunto}
            tahminiSure={tahminiSure}
            setCizimModu={setCizimModu}
            setDaireYaricapKm={setDaireYaricapKm}
            setGridSize={setGridSize}
            onGorunurAlani={bboxOlustur}
            onSil={bboxSil}
            onTara={tara}
            mapRef={mapRef}
            ilkKoseRef={ilkKoseRef}
            analizSecimleri={analizSecimleri}
            setAnalizSecimleri={setAnalizSecimleri}
          />
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
            <BolgeAnalizSec
              analizSecimleri={analizSecimleri}
              setAnalizSecimleri={setAnalizSecimleri}
            />

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
          <BolgeIlerleme progress={progress} onDurdur={durdur} />
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
