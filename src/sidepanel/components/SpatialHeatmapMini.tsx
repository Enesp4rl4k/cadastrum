/**
 * SpatialHeatmapMini — Faz 2 Sprint B B8 (gecikmiş).
 *
 * 5×5 SVG grid heatmap. Parselin etrafındaki bbox'u 5×5 hücreye böler,
 * her hücredeki emsallerin weighted median'ını hesaplar, renk skalası uygular.
 *
 * Bağımsız — MapLibre gerektirmez, EmsalRadiusSlider altına gömülür.
 * Görsel keşif amaçlı; ana fiyat motorunu etkilemez.
 */

import { useMemo } from "react";
import type { SpatialEmsalSonuc } from "../../lib/spatial-emsal";

interface Props {
  /** Parsel merkez koordinatı */
  parselLat: number;
  parselLng: number;
  /** Spatial sorgu sonucu (emsaller koordlarıyla) */
  sonuc: SpatialEmsalSonuc | null;
}

const GRID = 5; // 5x5
const CELL_PX = 28;
const GAP_PX = 2;
const SIZE_PX = GRID * CELL_PX + (GRID - 1) * GAP_PX;

interface Hucre {
  median: number | null;
  emsalSayi: number;
}

function renkSkalasi(deger: number, min: number, max: number): string {
  if (max === min) return "#94a3b8"; // slate-400
  const norm = (deger - min) / (max - min); // 0..1
  // Mavi (düşük) → yeşil → sarı → turuncu → kırmızı (yüksek)
  const stops: Array<[number, string]> = [
    [0.0, "#3b82f6"], // blue-500
    [0.25, "#10b981"], // emerald-500
    [0.5, "#eab308"], // yellow-500
    [0.75, "#f97316"], // orange-500
    [1.0, "#dc2626"], // red-600
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    if (norm <= stops[i + 1]![0]) {
      return stops[i]![1]; // basit step (interpolation atlandı)
    }
  }
  return stops[stops.length - 1]![1];
}

export function SpatialHeatmapMini({ parselLat, parselLng, sonuc }: Props) {
  const grid = useMemo<Hucre[][]>(() => {
    if (!sonuc || sonuc.emsaller.length === 0) {
      return Array.from({ length: GRID }, () =>
        Array.from({ length: GRID }, () => ({ median: null, emsalSayi: 0 })),
      );
    }
    // Bbox: ±radiusM/111000 derece
    const radiusM = sonuc.radiusM;
    const latDelta = radiusM / 111_000;
    const lngDelta = radiusM / (111_000 * Math.cos((parselLat * Math.PI) / 180));
    const minLat = parselLat - latDelta;
    const maxLat = parselLat + latDelta;
    const minLng = parselLng - lngDelta;
    const maxLng = parselLng + lngDelta;
    const latStep = (maxLat - minLat) / GRID;
    const lngStep = (maxLng - minLng) / GRID;

    // Hücrelere fiyat topla
    const buckets: number[][][] = Array.from({ length: GRID }, () =>
      Array.from({ length: GRID }, () => [] as number[]),
    );
    for (const e of sonuc.emsaller) {
      const ky = e.kayit.lat;
      const kx = e.kayit.lng;
      if (typeof ky !== "number" || typeof kx !== "number") continue;
      let row = Math.floor((maxLat - ky) / latStep); // tepeden aşağı
      let col = Math.floor((kx - minLng) / lngStep);
      row = Math.max(0, Math.min(GRID - 1, row));
      col = Math.max(0, Math.min(GRID - 1, col));
      buckets[row]![col]!.push(e.fiyatPerM2TL);
    }

    return buckets.map((row) =>
      row.map((arr) => {
        if (arr.length === 0) return { median: null, emsalSayi: 0 };
        const sorted = [...arr].sort((a, b) => a - b);
        return { median: sorted[Math.floor(sorted.length / 2)] ?? null, emsalSayi: arr.length };
      }),
    );
  }, [parselLat, parselLng, sonuc]);

  // Tüm dolu hücrelerin min/max'ı (renk skalası için)
  const tumDeger = grid.flat().map((c) => c.median).filter((v): v is number => v != null);
  if (tumDeger.length === 0) {
    return (
      <div className="text-3xs italic text-slate-500 py-2 text-center">
        Heatmap için yeterli emsal yok.
      </div>
    );
  }
  const min = Math.min(...tumDeger);
  const max = Math.max(...tumDeger);
  const merkezIdx = Math.floor(GRID / 2);

  return (
    <div className="flex flex-col items-center gap-1 py-2">
      <svg
        width={SIZE_PX}
        height={SIZE_PX}
        viewBox={`0 0 ${SIZE_PX} ${SIZE_PX}`}
        aria-label="Spatial fiyat ısı haritası 5x5"
      >
        {grid.map((row, ri) =>
          row.map((hucre, ci) => {
            const x = ci * (CELL_PX + GAP_PX);
            const y = ri * (CELL_PX + GAP_PX);
            const merkez = ri === merkezIdx && ci === merkezIdx;
            const fill =
              hucre.median != null ? renkSkalasi(hucre.median, min, max) : "#e2e8f0"; // slate-200
            return (
              <g key={`${ri}-${ci}`}>
                <rect
                  x={x}
                  y={y}
                  width={CELL_PX}
                  height={CELL_PX}
                  fill={fill}
                  fillOpacity={hucre.median != null ? 0.85 : 0.4}
                  rx={3}
                  stroke={merkez ? "#1e293b" : "transparent"}
                  strokeWidth={merkez ? 2 : 0}
                />
                {hucre.emsalSayi > 0 && (
                  <text
                    x={x + CELL_PX / 2}
                    y={y + CELL_PX / 2 + 3}
                    textAnchor="middle"
                    fontSize="9"
                    fill="white"
                    fontWeight="bold"
                  >
                    {hucre.emsalSayi}
                  </text>
                )}
              </g>
            );
          }),
        )}
      </svg>
      <div className="flex items-center gap-2 text-3xs text-slate-600 dark:text-slate-400">
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 inline-block rounded bg-blue-500" /> Düşük
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 inline-block rounded bg-yellow-500" /> Orta
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 inline-block rounded bg-red-600" /> Yüksek
        </span>
        <span>· hücre sayısı = emsal adedi</span>
      </div>
      <div className="text-3xs text-slate-500">
        ₺{min.toLocaleString("tr-TR")} – ₺{max.toLocaleString("tr-TR")} /m² · {sonuc?.radiusM ? sonuc.radiusM / 1000 : "?"} km bbox · merkez = parsel
      </div>
    </div>
  );
}
