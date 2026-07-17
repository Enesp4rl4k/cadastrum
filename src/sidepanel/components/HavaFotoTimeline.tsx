/**
 * W8 — Hava Fotoğrafı Timeline
 *
 * Esri Wayback (wayback.maptiles.arcgis.com) üzerinden parsel koordinatına
 * göre yıllık uydu görüntülerini slider ile gösterir.
 *
 * - API key gerektirmez (ücretsiz, public)
 * - 2014'ten itibaren yıllık snapshot
 * - Bbox hesabı rapor-html.ts ile aynı mantık (ESRI WMS export endpoint)
 * - Parsel poligonu SVG overlay ile gösterilir
 * - Yıl seçimi için sürüklenebilir slider + thumbnail şeridi
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Camera as CameraIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Loader2 as LoaderIcon,
  AlertCircle as AlertIcon,
  Expand as ExpandIcon,
} from "lucide-react";
import type { Parsel } from "../../types/tkgm";

// ── Esri Wayback sabit yapılandırması ───────────────────────────────────────
// Wayback World Imagery release ID'leri (yıl → release_id)
// https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/WMTSCapabilities.xml
// Release ID listesi: statik, nadiren güncellenir
const WAYBACK_RELEASES: Array<{ yil: number; releaseId: number; etiket: string }> = [
  { yil: 2014, releaseId: 10,  etiket: "2014" },
  { yil: 2015, releaseId: 18,  etiket: "2015" },
  { yil: 2016, releaseId: 26,  etiket: "2016" },
  { yil: 2017, releaseId: 36,  etiket: "2017" },
  { yil: 2018, releaseId: 44,  etiket: "2018" },
  { yil: 2019, releaseId: 52,  etiket: "2019" },
  { yil: 2020, releaseId: 60,  etiket: "2020" },
  { yil: 2021, releaseId: 68,  etiket: "2021" },
  { yil: 2022, releaseId: 76,  etiket: "2022" },
  { yil: 2023, releaseId: 84,  etiket: "2023" },
  { yil: 2024, releaseId: 92,  etiket: "2024" },
];

const WAYBACK_BASE = "https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer";
const IMG_W = 480;
const IMG_H = 360;

// Bbox + görsel URL hesabı
interface BboxSonuc {
  minLat: number; maxLat: number;
  minLng: number; maxLng: number;
  pts: string;  // SVG polygon points (IMG_W × IMG_H koordinat alanında)
}

function bboxHesapla(parsel: Parsel): BboxSonuc | null {
  const ring = (parsel.koordinatlar ?? []).filter(
    (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng),
  );
  if (ring.length < 3) return null;

  const lats = ring.map((p) => p.lat);
  const lngs = ring.map((p) => p.lng);
  let minLat = Math.min(...lats), maxLat = Math.max(...lats);
  let minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

  const padLat = (maxLat - minLat || 0.0006) * 0.45;
  const padLng = (maxLng - minLng || 0.0006) * 0.45;
  minLat -= padLat; maxLat += padLat;
  minLng -= padLng; maxLng += padLng;

  const latSpan = maxLat - minLat || 1e-6;
  const lngSpan = maxLng - minLng || 1e-6;

  const pts = ring
    .map((p) =>
      `${(((p.lng - minLng) / lngSpan) * IMG_W).toFixed(1)},${(((maxLat - p.lat) / latSpan) * IMG_H).toFixed(1)}`,
    )
    .join(" ");

  return { minLat, maxLat, minLng, maxLng, pts };
}

function gorselUrl(releaseId: number, bbox: BboxSonuc): string {
  const b = `${bbox.minLng.toFixed(6)},${bbox.minLat.toFixed(6)},${bbox.maxLng.toFixed(6)},${bbox.maxLat.toFixed(6)}`;
  return (
    `${WAYBACK_BASE}/export` +
    `?bbox=${b}&bboxSR=4326&imageSR=4326` +
    `&size=${IMG_W},${IMG_H}&format=jpg&f=image` +
    `&time=${releaseId}`
  );
}

// ── Bileşen ──────────────────────────────────────────────────────────────────

interface Props {
  parsel: Parsel;
}

export function HavaFotoTimeline({ parsel }: Props) {
  const bbox = bboxHesapla(parsel);
  const [seciliIndex, setSeciliIndex] = useState(WAYBACK_RELEASES.length - 1);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState(false);
  const [acik, setAcik] = useState(false); // collapsed/expanded
  const [tamEkran, setTamEkran] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const seciliRelease = WAYBACK_RELEASES[seciliIndex] ?? WAYBACK_RELEASES[WAYBACK_RELEASES.length - 1]!;

  const oncekiYil = useCallback(() => {
    setSeciliIndex((i) => Math.max(0, i - 1));
  }, []);
  const sonrakiYil = useCallback(() => {
    setSeciliIndex((i) => Math.min(WAYBACK_RELEASES.length - 1, i + 1));
  }, []);

  // Klavye ok tuşları
  useEffect(() => {
    if (!acik) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft")  oncekiYil();
      if (e.key === "ArrowRight") sonrakiYil();
      if (e.key === "Escape")     setTamEkran(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [acik, oncekiYil, sonrakiYil]);

  if (!bbox) return null; // Koordinatsız parsel

  const imgUrl = gorselUrl(seciliRelease.releaseId, bbox);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-card dark:border-slate-700/60 dark:bg-slate-900">
      {/* Başlık — tıklanabilir toggle */}
      <button
        type="button"
        onClick={() => setAcik((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        aria-expanded={acik}
      >
        <div className="flex items-center gap-1.5">
          <CameraIcon className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            Hava Fotoğrafı Geçmişi
          </h3>
        </div>
        <ChevronRightIcon
          className={`h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform ${acik ? "rotate-90" : ""}`}
        />
      </button>

      {acik && (
        <div className="space-y-2 px-3 pb-3">
          {/* Ana görsel */}
          <div className="relative rounded-md overflow-hidden bg-slate-900 select-none"
               style={{ aspectRatio: `${IMG_W}/${IMG_H}` }}>
            {/* Görsel */}
            <img
              ref={imgRef}
              key={imgUrl}
              src={imgUrl}
              alt={`${parsel.ilceAd ?? ""} ${parsel.mahalleAd ?? ""} — ${seciliRelease.etiket} uydu görüntüsü`}
              className="absolute inset-0 h-full w-full object-cover"
              onLoadStart={() => { setYukleniyor(true); setHata(false); }}
              onLoad={() => setYukleniyor(false)}
              onError={() => { setYukleniyor(false); setHata(true); }}
              crossOrigin="anonymous"
            />

            {/* Parsel poligonu SVG overlay */}
            {!hata && (
              <svg
                className="absolute inset-0 h-full w-full pointer-events-none"
                viewBox={`0 0 ${IMG_W} ${IMG_H}`}
                preserveAspectRatio="none"
                aria-label="Parsel sınırı"
              >
                <polygon
                  points={bbox.pts}
                  fill="#ffd400"
                  fillOpacity={0.15}
                  stroke="#ffd400"
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                />
              </svg>
            )}

            {/* Yükleniyor spinner */}
            {yukleniyor && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60">
                <LoaderIcon className="h-6 w-6 animate-spin text-white" />
              </div>
            )}

            {/* Hata */}
            {hata && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-800 text-slate-400">
                <AlertIcon className="h-5 w-5" />
                <span className="text-3xs">Görüntü yüklenemedi</span>
              </div>
            )}

            {/* Yıl etiketi — sol üst */}
            <div className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs font-bold text-white backdrop-blur-sm">
              {seciliRelease.etiket}
            </div>

            {/* Tam ekran butonu — sağ üst */}
            <button
              type="button"
              onClick={() => setTamEkran(true)}
              className="absolute right-2 top-2 rounded bg-black/50 p-1 text-white hover:bg-black/70"
              title="Tam ekran"
            >
              <ExpandIcon className="h-3.5 w-3.5" />
            </button>

            {/* Sol/Sağ ok butonları */}
            <button
              type="button"
              onClick={oncekiYil}
              disabled={seciliIndex === 0}
              className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70 disabled:opacity-30"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={sonrakiYil}
              disabled={seciliIndex === WAYBACK_RELEASES.length - 1}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70 disabled:opacity-30"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Slider */}
          <input
            type="range"
            min={0}
            max={WAYBACK_RELEASES.length - 1}
            value={seciliIndex}
            onChange={(e) => setSeciliIndex(Number(e.target.value))}
            className="w-full cursor-pointer accent-amber-500"
            aria-label="Yıl seçimi"
          />

          {/* Yıl thumbnail şeridi */}
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {WAYBACK_RELEASES.map((r, i) => (
              <button
                key={r.releaseId}
                type="button"
                onClick={() => setSeciliIndex(i)}
                className={`flex-shrink-0 rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  i === seciliIndex
                    ? "bg-amber-500 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                }`}
              >
                {r.etiket}
              </button>
            ))}
          </div>

          {/* Kaynak notu */}
          <p className="text-[10px] italic text-slate-400 px-0.5">
            Kaynak: Esri Wayback World Imagery — yıllık uydu arşivi (2014–2024).
            Görüntüler yaklaşık tarihlidir, gerçek çekim tarihi farklı olabilir.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Tam ekran modal ───────────────────────────────────────────────────────────

function TamEkranModal({
  imgUrl,
  yil,
  pts,
  onKapat,
}: {
  imgUrl: string;
  yil: string;
  pts: string;
  onKapat: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onKapat}
    >
      <div
        className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={imgUrl}
          alt={`${yil} uydu görüntüsü`}
          className="block max-h-[90vh] max-w-[90vw]"
          crossOrigin="anonymous"
        />
        <svg
          className="absolute inset-0 h-full w-full pointer-events-none"
          viewBox={`0 0 ${IMG_W} ${IMG_H}`}
          preserveAspectRatio="none"
        >
          <polygon
            points={pts}
            fill="#ffd400"
            fillOpacity={0.15}
            stroke="#ffd400"
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
        </svg>
        <div className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-sm font-bold text-white">
          {yil}
        </div>
        <button
          type="button"
          onClick={onKapat}
          className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
