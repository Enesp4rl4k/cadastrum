/**
 * BolgeSinirSecici — Bölge taraması için sınır seçim araçları.
 * BolgeView'den çıkarılmıştır (refactor).
 */
import {
  Square as SquareIcon,
  Circle as CircleIcon,
  Maximize as MaximizeIcon,
  X as XIcon,
} from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { eraseBbox } from "../views/bolge-map-layers";

interface Props {
  cizimModu: "yok" | "dikdortgen" | "daire";
  daireYaricapKm: number;
  alanKm2: number;
  gridSize: number;
  tahminiPunto: number;
  tahminiSure: number;
  setCizimModu: (m: "yok" | "dikdortgen" | "daire") => void;
  setDaireYaricapKm: (v: number) => void;
  setGridSize: (v: number) => void;
  onGorunurAlani: () => void;
  onSil: () => void;
  onTara: () => void;
  mapRef: React.MutableRefObject<MapLibreMap | null>;
  ilkKoseRef: React.MutableRefObject<{ lat: number; lng: number } | null>;
  analizSecimleri: {
    parselTara: boolean;
    gunesOzeti: boolean;
    tarimOzeti: boolean;
    tkgmHeatmap: boolean;
    sahibindenJoin: boolean;
  };
  setAnalizSecimleri: React.Dispatch<React.SetStateAction<{
    parselTara: boolean;
    gunesOzeti: boolean;
    tarimOzeti: boolean;
    tkgmHeatmap: boolean;
    sahibindenJoin: boolean;
  }>>;
}

export function BolgeSinirSecici({
  cizimModu, daireYaricapKm, alanKm2, gridSize,
  tahminiPunto, tahminiSure,
  setCizimModu, setDaireYaricapKm, setGridSize,
  onGorunurAlani, onSil, onTara,
  mapRef, ilkKoseRef,
  analizSecimleri, setAnalizSecimleri,
}: Props) {
  return (
    <div className="mt-2 space-y-2">
      {/* Çizim araçları */}
      <div className="text-2xs font-semibold text-slate-700">
        Bölge sınırını seç:
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={onGorunurAlani}
          disabled={cizimModu !== "yok"}
          className="flex cursor-pointer flex-col items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-2 text-2xs font-medium text-slate-700 transition-colors hover:border-tkgm-primary hover:bg-tkgm-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <MaximizeIcon className="h-4 w-4" />
          Görünür alan
        </button>
        <button
          type="button"
          onClick={() => {
            ilkKoseRef.current = null;
            eraseBbox(mapRef.current);
            setCizimModu("dikdortgen");
          }}
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
          onClick={() => {
            ilkKoseRef.current = null;
            eraseBbox(mapRef.current);
            setCizimModu("daire");
          }}
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
  );
}
