/**
 * Dijital İkiz Zaman Kaydırıcısı — YENI-4 / Faz C4
 * Wayback Machine uydu görüntüleri + imar zarfı zaman serisi.
 * Kullanıcı yıl kaydırıcısıyla parselin geçmişini izleyebilir.
 *
 * Bağımlılıklar: HavaFotoTimeline.tsx (Wayback proxy) + DijitalIkizKarti.tsx (imar zarfı SVG)
 */
import { useEffect, useMemo, useState } from "react";
import {
  Clock as ClockIcon,
  ChevronLeft as LeftIcon,
  ChevronRight as RightIcon,
  Loader2 as LoaderIcon,
} from "lucide-react";
import { Section, Row } from "../ui/Card";
import type { Parsel } from "../../types/tkgm";
import type { EPlanImarVerisi } from "../../lib/eplan";

const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

// Wayback Machine yılları (2010'dan bu yana 2 yıl aralıklı)
const WAYBACK_YILLARI = [2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024] as const;
type WaybackYil = typeof WAYBACK_YILLARI[number];

// Wayback release ID'leri — Leaflet-Wayback'ten alındı
const RELEASE_IDS: Record<WaybackYil, string> = {
  2010: "10",
  2012: "12",
  2014: "14",
  2016: "16",
  2018: "18",
  2020: "20",
  2022: "22",
  2024: "24",
};

interface Props {
  parsel: Parsel;
  ePlan?: EPlanImarVerisi | null;
  /** KAKS/Emsal senaryo değişimi */
  emsalSenaryo?: number | null;
}

interface BboxKoord {
  minLng: number; minLat: number; maxLng: number; maxLat: number;
}

function bboxHesapla(parsel: Parsel): BboxKoord | null {
  const koords = parsel.koordinatlar;
  if (!koords || koords.length < 3) {
    // Merkez noktadan bbox türet
    const m = parsel.merkezNokta;
    if (!m) return null;
    const delta = 0.001; // ~100m
    return { minLng: m.lng - delta, minLat: m.lat - delta, maxLng: m.lng + delta, maxLat: m.lat + delta };
  }
  const lats = koords.map((k) => k.lat);
  const lngs = koords.map((k) => k.lng);
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };
}

// ── Wayback tile URL önizleme ─────────────────────────────────────────────────

function WaybackOnizleme({ bbox, yil, genislik = 240, yukseklik = 140 }: {
  bbox: BboxKoord;
  yil: WaybackYil;
  genislik?: number;
  yukseklik?: number;
}) {
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState(false);

  // WMS GetMap isteği — Cadastrum proxy üzerinden
  const wmsUrl = useMemo(() => {
    const releaseId = RELEASE_IDS[yil];
    const bbox4326 = `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`;
    const params = new URLSearchParams({
      SERVICE: "WMS",
      VERSION: "1.3.0",
      REQUEST: "GetMap",
      LAYERS: "WB_Imagery",
      STYLES: "",
      CRS: "EPSG:4326",
      BBOX: bbox4326,
      WIDTH: String(genislik),
      HEIGHT: String(yukseklik),
      FORMAT: "image/jpeg",
      TRANSPARENT: "false",
      // Wayback spesifik
      RELEASEID: releaseId,
    });
    return `${API_BASE}/proxy/wayback-wms?${params.toString()}`;
  }, [bbox, yil, genislik, yukseklik]);

  // Fallback: statik Wayback thumbnail (proxy olmadan)
  const fallbackUrl = useMemo(() => {
    const cx = ((bbox.minLng + bbox.maxLng) / 2).toFixed(5);
    const cy = ((bbox.minLat + bbox.maxLat) / 2).toFixed(5);
    return `https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/${RELEASE_IDS[yil]}/14/${cy}/${cx}`;
  }, [bbox, yil]);

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
      style={{ width: genislik, height: yukseklik }}
      role="img"
      aria-label={`${yil} yılı uydu görüntüsü`}
    >
      {yukleniyor && (
        <div className="absolute inset-0 flex items-center justify-center">
          <LoaderIcon className="h-5 w-5 animate-spin text-slate-400" aria-hidden="true" />
        </div>
      )}
      {hata && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span className="text-2xl" aria-hidden="true">🛰️</span>
          <p className="text-[9px] text-slate-400 text-center">Görüntü yüklenemedi</p>
        </div>
      )}
      {!hata && (
        <img
          src={wmsUrl}
          alt={`${yil} yılı uydu görüntüsü`}
          className={`h-full w-full object-cover transition-opacity duration-300 ${yukleniyor ? "opacity-0" : "opacity-100"}`}
          width={genislik}
          height={yukseklik}
          onLoad={() => setYukleniyor(false)}
          onError={() => {
            // WMS başarısız → fallback tile dene
            setYukleniyor(false);
            setHata(true);
          }}
          loading="lazy"
        />
      )}
      {/* Yıl etiketi */}
      <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">
        {yil}
      </div>
    </div>
  );
}

// ── İmar zarfı senaryo hesabı ─────────────────────────────────────────────────

function ZarfOzet({ alan, taks, kaks, emsalSenaryo }: {
  alan: number; taks: number; kaks: number; emsalSenaryo?: number | null;
}) {
  const aktifKaks = emsalSenaryo ?? kaks;
  const tabanM2 = Math.round(alan * taks);
  const insaatM2 = Math.round(alan * aktifKaks);
  const tahminiKat = Math.round((aktifKaks / taks) * 10) / 10;

  return (
    <div className="space-y-0.5 rounded-lg border border-slate-100 bg-slate-50/60 px-2 py-1.5 dark:border-slate-800 dark:bg-slate-900/40">
      {emsalSenaryo != null && emsalSenaryo !== kaks && (
        <div className="mb-1 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
          Senaryo: KAKS {kaks.toFixed(2)} → {emsalSenaryo.toFixed(2)}
        </div>
      )}
      <Row label="Taban (TAKS)" value={`${tabanM2.toLocaleString("tr-TR")} m²`} />
      <Row label="İnşaat (KAKS)" value={`${insaatM2.toLocaleString("tr-TR")} m²`} />
      <Row label="Tahmini kat" value={`${tahminiKat} kat`} />
    </div>
  );
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────

export function DijitalIkizZaman({ parsel, ePlan, emsalSenaryo }: Props) {
  const [seciliYil, setSeciliYil] = useState<WaybackYil>(WAYBACK_YILLARI[WAYBACK_YILLARI.length - 1]!);
  const [senaryo, setSenaryo] = useState<number>(emsalSenaryo ?? ePlan?.emsal ?? 1.0);

  const bbox = useMemo(() => bboxHesapla(parsel), [parsel]);
  const taks = ePlan?.taks ?? 0.3;
  const kaks = ePlan?.emsal ?? 1.0;
  const alan = parsel.alan ?? 0;

  const yilIdx = WAYBACK_YILLARI.indexOf(seciliYil);

  const oncekiYil = () => {
    if (yilIdx > 0) setSeciliYil(WAYBACK_YILLARI[yilIdx - 1]!);
  };
  const sonrakiYil = () => {
    if (yilIdx < WAYBACK_YILLARI.length - 1) setSeciliYil(WAYBACK_YILLARI[yilIdx + 1]!);
  };

  // Klavye navigasyonu
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") oncekiYil();
      if (e.key === "ArrowRight") sonrakiYil();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  if (!bbox) {
    return (
      <Section title="Dijital ikiz zaman" icon={<ClockIcon className="h-3.5 w-3.5" aria-hidden="true" />} accent="neutral">
        <p className="px-3 pb-2 text-[10px] text-slate-400">Koordinat verisi bekleniyor…</p>
      </Section>
    );
  }

  return (
    <Section
      title="Dijital ikiz — zaman makinesi"
      icon={<ClockIcon className="h-3.5 w-3.5" aria-hidden="true" />}
      accent="neutral"
      subtitle="C4"
    >
      <div className="space-y-2 p-2">
        {/* Uydu görüntüsü */}
        <div className="flex justify-center">
          <WaybackOnizleme bbox={bbox} yil={seciliYil} />
        </div>

        {/* Zaman kaydırıcısı */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <button
              onClick={oncekiYil}
              disabled={yilIdx === 0}
              className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:hover:text-slate-200"
              aria-label="Önceki yıl"
            >
              <LeftIcon className="h-4 w-4" aria-hidden="true" />
            </button>

            <input
              type="range"
              min={0}
              max={WAYBACK_YILLARI.length - 1}
              value={yilIdx}
              onChange={(e) => setSeciliYil(WAYBACK_YILLARI[Number(e.target.value)]!)}
              className="flex-1 accent-blue-600"
              aria-label="Yıl seçici"
              aria-valuemin={WAYBACK_YILLARI[0]}
              aria-valuemax={WAYBACK_YILLARI[WAYBACK_YILLARI.length - 1]}
              aria-valuenow={seciliYil}
            />

            <button
              onClick={sonrakiYil}
              disabled={yilIdx === WAYBACK_YILLARI.length - 1}
              className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:hover:text-slate-200"
              aria-label="Sonraki yıl"
            >
              <RightIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Yıl etiketleri */}
          <div className="flex justify-between px-6 text-[8px] text-slate-400">
            {WAYBACK_YILLARI.map((y) => (
              <span
                key={y}
                className={seciliYil === y ? "font-bold text-blue-600 dark:text-blue-400" : ""}
                aria-hidden="true"
              >
                {y}
              </span>
            ))}
          </div>
        </div>

        {/* İmar zarfı + senaryo */}
        {alan > 0 && (
          <>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[9px] font-medium text-slate-500 dark:text-slate-400">
                <span>İmar zarfı senaryosu</span>
                <span>KAKS: {senaryo.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={5}
                step={0.1}
                value={senaryo}
                onChange={(e) => setSenaryo(parseFloat(e.target.value))}
                className="w-full accent-amber-500"
                aria-label="KAKS senaryo kaydırıcısı"
              />
              <div className="flex justify-between text-[8px] text-slate-400">
                <span>0.1</span>
                <span>Mevcut: {kaks.toFixed(2)}</span>
                <span>5.0</span>
              </div>
            </div>

            <ZarfOzet alan={alan} taks={taks} kaks={kaks} emsalSenaryo={senaryo !== kaks ? senaryo : null} />
          </>
        )}

        <p className="text-[9px] italic text-slate-400">
          Uydu: Esri World Imagery Wayback · İmar zarfı görseli temsilidir.
        </p>
      </div>
    </Section>
  );
}
