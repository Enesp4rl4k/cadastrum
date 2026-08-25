/**
 * BolgeAnalizSec — Tarama içeriği checkbox seçimleri.
 * BolgeView'den çıkarılmıştır (refactor).
 */
import { Sun as SunIcon, Sprout as SproutIcon } from "lucide-react";

export interface AnalizSecimleri {
  parselTara: boolean;
  gunesOzeti: boolean;
  tarimOzeti: boolean;
  tkgmHeatmap: boolean;
  sahibindenJoin: boolean;
}

interface Props {
  analizSecimleri: AnalizSecimleri;
  setAnalizSecimleri: React.Dispatch<React.SetStateAction<AnalizSecimleri>>;
}

export function BolgeAnalizSec({ analizSecimleri, setAnalizSecimleri }: Props) {
  const toggle = (key: keyof AnalizSecimleri) =>
    setAnalizSecimleri((s) => ({ ...s, [key]: !s[key] }));

  return (
    <div className="rounded-md border border-slate-200 bg-white p-2">
      <div className="mb-1 text-2xs font-semibold text-slate-700">
        Tarama içeriği
      </div>

      <label className="flex cursor-pointer items-center gap-2 py-0.5 hover:bg-slate-50 rounded px-1">
        <input
          type="checkbox"
          checked={analizSecimleri.parselTara}
          onChange={() => toggle("parselTara")}
          className="h-3 w-3 cursor-pointer accent-tkgm-primary"
        />
        <span className="text-2xs">📍 Parsel taraması (TKGM)</span>
      </label>

      <label className="flex cursor-pointer items-center gap-2 py-0.5 hover:bg-slate-50 rounded px-1">
        <input
          type="checkbox"
          checked={analizSecimleri.gunesOzeti}
          onChange={() => toggle("gunesOzeti")}
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
          onChange={() => toggle("tarimOzeti")}
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
          onChange={() => toggle("tkgmHeatmap")}
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
          onChange={() => toggle("sahibindenJoin")}
          className="h-3 w-3 cursor-pointer accent-orange-500"
        />
        <span className="flex items-center gap-1 text-2xs">
          <span className="text-orange-600">📡</span>
          Sahibinden mahalle TL/m² join
        </span>
      </label>
    </div>
  );
}
