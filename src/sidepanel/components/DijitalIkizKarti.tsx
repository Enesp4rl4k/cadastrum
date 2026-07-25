/**
 * Dijital İkiz Kartı — Faz C3/C4
 * 2.5D parsel görünümü (SVG) + gerçek 3D (Deck.gl WebGL) toggle.
 * 3D mod: lazy import — sadece açıldığında yüklenir.
 */
import { useMemo, useState, lazy, Suspense } from "react";
import { Box as BoxIcon, Layers as LayersIcon } from "lucide-react";
import { Section, Row } from "../ui/Card";
import type { Parsel } from "../../types/tkgm";
import type { EPlanImarVerisi } from "../../lib/eplan";
import type { CevreAnalizi } from "../../lib/osm";

// Deck.gl bileşeni — lazy import ile bundle'a etki etmez
const DijitalIkiz3D = lazy(() =>
  import("./DijitalIkiz3D").then((m) => ({ default: m.DijitalIkiz3D }))
);

interface Props {
  parsel: Parsel;
  ePlan?: EPlanImarVerisi | null;
  cevre?: CevreAnalizi | null;
  /** Eğim yüzdesi (Open-Meteo'dan) */
  egimYuzde?: number | null;
  /** Bakı yönü */
  bakiYonu?: string | null;
}

// ── İzometrik projeksiyon ─────────────────────────────────────────────────────

interface Point2D { x: number; y: number; }
interface Point3D { x: number; y: number; z: number; }

const ISO_ANGLE = Math.PI / 6; // 30°

function iso(p: Point3D): Point2D {
  return {
    x: (p.x - p.y) * Math.cos(ISO_ANGLE),
    y: (p.x + p.y) * Math.sin(ISO_ANGLE) - p.z,
  };
}

function toSvgPoints(pts: Point2D[]): string {
  return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

// ── Parsel tabanı hesaplama ───────────────────────────────────────────────────

/** Parsel m²'den basit kare ölçüsü (görsel amaçlı) */
function parselBoyut(alan: number): number {
  return Math.sqrt(Math.max(100, alan));
}

// ── SVG İmar Zarfı ────────────────────────────────────────────────────────────

interface ImarZarfiProps {
  alan: number;
  taks: number;
  kaks: number;
  maksKat: number;
}

function ImarZarfSVG({ alan, taks, kaks, maksKat }: ImarZarfiProps) {
  const W = 100; // SVG viewport
  const H = 100;

  const ps = parselBoyut(alan);
  const tabanOran = Math.sqrt(taks);       // taban kare kenar oranı
  const yukseklikOran = kaks / taks;       // kat yükseklik çarpanı

  // Normalize: max boyutu 40 birim
  const birim = Math.min(40, 80 / ps);
  const zemB  = ps * birim;               // zemin kare kenar (SVG)
  const imarB = zemB * tabanOran;         // imar taban kenar
  const yuk   = Math.min(50, imarB * yukseklikOran * 0.4); // görsel yükseklik

  const cx = W / 2;
  const cy = H / 2 + 10;

  // İzometrik dönüşüm — zemin parsel (şeffaf çerçeve)
  const zem: Point3D[] = [
    { x: -zemB / 2, y: -zemB / 2, z: 0 },
    { x:  zemB / 2, y: -zemB / 2, z: 0 },
    { x:  zemB / 2, y:  zemB / 2, z: 0 },
    { x: -zemB / 2, y:  zemB / 2, z: 0 },
  ];

  // İmar taban kare
  const imar: Point3D[] = [
    { x: -imarB / 2, y: -imarB / 2, z: 0 },
    { x:  imarB / 2, y: -imarB / 2, z: 0 },
    { x:  imarB / 2, y:  imarB / 2, z: 0 },
    { x: -imarB / 2, y:  imarB / 2, z: 0 },
  ];

  // Bina üst taban
  const imarUst: Point3D[] = imar.map((p) => ({ ...p, z: yuk }));

  const toScreen = (p: Point2D) => ({ x: p.x + cx, y: p.y + cy });
  const zemS = zem.map((p) => toScreen(iso(p)));
  const imarS = imar.map((p) => toScreen(iso(p)));
  const imarUstS = imarUst.map((p) => toScreen(iso(p)));

  // Bina yan yüzleri
  const onYuz = [imarS[1]!, imarS[2]!, imarUstS[2]!, imarUstS[1]!];
  const yanYuz = [imarS[2]!, imarS[3]!, imarUstS[3]!, imarUstS[2]!];

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Parsel dijital ikiz — TAKS ${taks}, KAKS ${kaks}, ${maksKat} kat`}
      className="overflow-visible"
    >
      {/* Zemin parsel */}
      <polygon
        points={toSvgPoints(zemS)}
        fill="none"
        stroke="#94a3b8"
        strokeWidth="0.8"
        strokeDasharray="2,1.5"
        opacity="0.6"
      />

      {/* İmar taban (zemin) */}
      <polygon
        points={toSvgPoints(imarS)}
        fill="#dbeafe"
        fillOpacity="0.5"
        stroke="#3b82f6"
        strokeWidth="0.8"
      />

      {/* Bina ön yüz */}
      <polygon
        points={toSvgPoints(onYuz)}
        fill="#93c5fd"
        fillOpacity="0.6"
        stroke="#3b82f6"
        strokeWidth="0.7"
      />

      {/* Bina yan yüz */}
      <polygon
        points={toSvgPoints(yanYuz)}
        fill="#60a5fa"
        fillOpacity="0.5"
        stroke="#3b82f6"
        strokeWidth="0.7"
      />

      {/* Çatı */}
      <polygon
        points={toSvgPoints(imarUstS)}
        fill="#bfdbfe"
        fillOpacity="0.8"
        stroke="#3b82f6"
        strokeWidth="0.8"
      />

      {/* Kat sayısı etiketi */}
      {(() => {
        const ortaUst = toScreen(iso({ x: 0, y: 0, z: yuk + 4 }));
        return (
          <text
            x={ortaUst.x}
            y={ortaUst.y}
            textAnchor="middle"
            fontSize="7"
            fill="#1d4ed8"
            fontWeight="600"
          >
            {maksKat}K
          </text>
        );
      })()}
    </svg>
  );
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────

export function DijitalIkizKarti({ parsel, ePlan, cevre, egimYuzde, bakiYonu }: Props) {
  const alan = parsel.alan ?? 0;
  const [mod3D, setMod3D] = useState(false);

  const taks      = ePlan?.taks    ?? 0.3;
  const kaks      = ePlan?.emsal   ?? 1.0;
  const maksKat   = ePlan?.maksKat ?? Math.max(1, Math.round(kaks / taks));
  const kullKarari = ePlan?.kullanimKarari ?? "—";

  const insaatM2  = useMemo(() => alan > 0 ? Math.round(alan * kaks) : null, [alan, kaks]);
  const tabanM2   = useMemo(() => alan > 0 ? Math.round(alan * taks) : null, [alan, taks]);

  const yakinPoi = useMemo(() => {
    if (!cevre?.poi) return null;
    const poi: string[] = [];
    if (cevre.poi.okul > 0)     poi.push(`${cevre.poi.okul} okul`);
    if (cevre.poi.hastane > 0)  poi.push(`${cevre.poi.hastane} hastane`);
    if (cevre.poi.duraklar > 0) poi.push(`${cevre.poi.duraklar} durak`);
    return poi.slice(0, 3).join(" · ") || null;
  }, [cevre]);

  const gosteri = alan > 0 && (ePlan != null || taks > 0);

  return (
    <Section
      title="Dijital ikiz"
      icon={<BoxIcon className="h-3.5 w-3.5" aria-hidden="true" />}
      accent="neutral"
      subtitle={mod3D ? "3D WebGL" : "2.5D imar zarfı"}
      actions={
        gosteri ? (
          <button
            type="button"
            onClick={() => setMod3D((v) => !v)}
            title={mod3D ? "2.5D görünüme geç" : "3D WebGL görünümüne geç"}
            aria-label={mod3D ? "2.5D görünüme geç" : "3D WebGL görünümüne geç"}
            className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-[9px] font-semibold transition-colors ${
              mod3D
                ? "border-blue-400 bg-blue-600 text-white hover:bg-blue-700"
                : "border-slate-300 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
            }`}
          >
            <LayersIcon className="h-3 w-3" aria-hidden="true" />
            {mod3D ? "2D" : "3D"}
          </button>
        ) : undefined
      }
    >
      <div className="space-y-2 p-2">
        {gosteri ? (
          <>
            {/* 3D WebGL görünümü (Deck.gl lazy) */}
            {mod3D ? (
              <Suspense
                fallback={
                  <div className="flex h-[260px] items-center justify-center rounded-lg border border-slate-200 bg-slate-900 text-2xs text-slate-400">
                    3D yükleniyor…
                  </div>
                }
              >
                <DijitalIkiz3D
                  parsel={parsel}
                  ePlan={ePlan}
                  cevre={cevre}
                  egimYuzde={egimYuzde}
                  yukseklik={260}
                />
              </Suspense>
            ) : (
            /* 2.5D İzometrik SVG görünümü */
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-1 dark:border-slate-800 dark:bg-slate-900/40">
              <ImarZarfSVG
                alan={alan}
                taks={taks}
                kaks={kaks}
                maksKat={maksKat}
              />
            </div>
            )}

            {/* Metrikler */}
            <div className="space-y-0.5">
              <Row label="Parsel alanı"     value={`${alan.toLocaleString("tr-TR")} m²`} />
              <Row label="İmar kullanımı"   value={kullKarari} />
              {tabanM2 != null  && <Row label="Taban (TAKS)"  value={`${tabanM2.toLocaleString("tr-TR")} m²`} />}
              {insaatM2 != null && <Row label="İnşaat (KAKS)" value={`${insaatM2.toLocaleString("tr-TR")} m²`} />}
              <Row label="TAKS / KAKS"      value={`${taks.toFixed(2)} / ${kaks.toFixed(2)}`} />
              <Row label="Maks kat"         value={`${maksKat} kat`} />
              {egimYuzde != null && (
                <Row
                  label="Eğim"
                  value={`%${egimYuzde.toFixed(1)}`}
                  tone={egimYuzde > 20 ? "warning" : "default"}
                />
              )}
              {bakiYonu && <Row label="Bakı yönü" value={bakiYonu} />}
              {yakinPoi && (
                <Row label="Yakın POI (1km)" value={yakinPoi} />
              )}
            </div>

            <p className="text-[9px] italic text-slate-400">
              Görsel imar zarfını temsil eder. Gerçek yapılaşma koşulları için yetkili kuruma başvurun.
            </p>
          </>
        ) : (
          <p className="py-3 text-center text-[10px] text-slate-400">
            İmar ve alan verisi bekleniyor…
          </p>
        )}
      </div>
    </Section>
  );
}
