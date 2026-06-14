import { useMemo, useState } from "react";
import {
  Filter as FilterIcon,
  ChevronDown as ChevronDownIcon,
  ChevronRight as ChevronRightIcon,
  X as XIcon,
} from "lucide-react";
import type { Parsel } from "../../types/tkgm";

export interface BolgeFiltreState {
  /** m² minimum (boş = sınır yok) */
  m2Min: number | null;
  m2Max: number | null;
  /** TL/m² aralığı (sadece fiyat tahmin'li parseller için anlamlı) */
  tlPerM2Min: number | null;
  tlPerM2Max: number | null;
  /** Nitelik filtresi — 'tum' = hepsi */
  nitelik: "tum" | "arsa" | "tarla" | "bahce" | "zeytinlik" | "diger";
  /** Sadece risksiz parseller (kritik/yüksek risk içermeyenler) */
  sadeceTemiz: boolean;
  /** Min ada/parsel sayı */
  parselSayiMin: number | null;
}

export const VARSAYILAN_FILTRE: BolgeFiltreState = {
  m2Min: null,
  m2Max: null,
  tlPerM2Min: null,
  tlPerM2Max: null,
  nitelik: "tum",
  sadeceTemiz: false,
  parselSayiMin: null,
};

/** Parsel için unique composite key — TL/m² ve risk map'lerinde kullanılır */
export function parselAnahtar(p: Parsel): string {
  return `${p.adaNo}-${p.parselNo}`;
}

/**
 * Bir parseller listesine filtre uygula. Pure fonksiyon.
 */
export function filtreUygula(
  parseller: Parsel[],
  filtre: BolgeFiltreState,
  /** Opsiyonel: parsel anahtarı → tahminiTL/m² mapping (fiyat tahmini batch yapıldıysa) */
  tlPerM2Map?: Map<string, number>,
  /** Opsiyonel: parsel anahtarı → kritik risk bool */
  riskliMap?: Map<string, boolean>,
): Parsel[] {
  return parseller.filter((p) => {
    // m²
    if (filtre.m2Min != null && p.alan < filtre.m2Min) return false;
    if (filtre.m2Max != null && p.alan > filtre.m2Max) return false;

    // Nitelik
    if (filtre.nitelik !== "tum") {
      const n = p.nitelik.toLocaleLowerCase("tr");
      if (filtre.nitelik === "arsa" && !/arsa/.test(n)) return false;
      if (filtre.nitelik === "tarla" && !/tarla/.test(n)) return false;
      if (filtre.nitelik === "bahce" && !/bahçe|bahce|bağ|bag/.test(n)) return false;
      if (filtre.nitelik === "zeytinlik" && !/zeytin/.test(n)) return false;
      if (filtre.nitelik === "diger") {
        if (/arsa|tarla|bahçe|bahce|bağ|bag|zeytin/.test(n)) return false;
      }
    }

    const key = parselAnahtar(p);

    // TL/m² aralığı
    if (filtre.tlPerM2Min != null || filtre.tlPerM2Max != null) {
      const tl = tlPerM2Map?.get(key);
      if (tl == null) return false;
      if (filtre.tlPerM2Min != null && tl < filtre.tlPerM2Min) return false;
      if (filtre.tlPerM2Max != null && tl > filtre.tlPerM2Max) return false;
    }

    // Risksiz
    if (filtre.sadeceTemiz && riskliMap?.get(key) === true) return false;

    return true;
  });
}

/**
 * Aktif filtre özet sayısı — UI'da rozet için
 */
export function aktifFiltreSayisi(f: BolgeFiltreState): number {
  let n = 0;
  if (f.m2Min != null || f.m2Max != null) n++;
  if (f.tlPerM2Min != null || f.tlPerM2Max != null) n++;
  if (f.nitelik !== "tum") n++;
  if (f.sadeceTemiz) n++;
  if (f.parselSayiMin != null) n++;
  return n;
}

interface Props {
  filtre: BolgeFiltreState;
  setFiltre: (f: BolgeFiltreState) => void;
  toplamSayi: number;
  filtrelenmisSayi: number;
}

export function BolgeFiltreler({ filtre, setFiltre, toplamSayi, filtrelenmisSayi }: Props) {
  const [acik, setAcik] = useState(false);
  const aktif = useMemo(() => aktifFiltreSayisi(filtre), [filtre]);

  const update = (patch: Partial<BolgeFiltreState>) => setFiltre({ ...filtre, ...patch });
  const reset = () => setFiltre(VARSAYILAN_FILTRE);

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      {/* Header — toggle */}
      <button
        type="button"
        onClick={() => setAcik((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-2xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
      >
        <span className="flex items-center gap-1.5">
          <FilterIcon className="h-3.5 w-3.5 text-imperial" />
          Filtreler
          {aktif > 0 && (
            <span className="inline-flex items-center rounded-full bg-imperial px-1.5 py-0 text-3xs font-semibold text-white">
              {aktif}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2 text-3xs text-slate-500">
          {aktif > 0 && (
            <span className="tabular-nums">
              {filtrelenmisSayi} / {toplamSayi}
            </span>
          )}
          {acik ? (
            <ChevronDownIcon className="h-3.5 w-3.5" />
          ) : (
            <ChevronRightIcon className="h-3.5 w-3.5" />
          )}
        </span>
      </button>

      {acik && (
        <div className="border-t border-slate-200 p-3 space-y-3">
          {/* m² aralığı */}
          <div>
            <label className="text-3xs font-semibold uppercase tracking-wide text-slate-500 mb-1 block">
              Alan (m²)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={filtre.m2Min ?? ""}
                onChange={(e) =>
                  update({ m2Min: e.target.value ? Number(e.target.value) : null })
                }
                placeholder="Min"
                className="rounded-md border border-slate-300 px-2 py-1 text-2xs tabular-nums focus:border-imperial focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              <input
                type="number"
                inputMode="numeric"
                value={filtre.m2Max ?? ""}
                onChange={(e) =>
                  update({ m2Max: e.target.value ? Number(e.target.value) : null })
                }
                placeholder="Max"
                className="rounded-md border border-slate-300 px-2 py-1 text-2xs tabular-nums focus:border-imperial focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          {/* TL/m² aralığı */}
          <div>
            <label className="text-3xs font-semibold uppercase tracking-wide text-slate-500 mb-1 block">
              Tahmini TL/m²
              <span className="ml-1 text-slate-400 font-normal">
                (fiyat tahmin'li parseller)
              </span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={filtre.tlPerM2Min ?? ""}
                onChange={(e) =>
                  update({ tlPerM2Min: e.target.value ? Number(e.target.value) : null })
                }
                placeholder="Min ₺"
                className="rounded-md border border-slate-300 px-2 py-1 text-2xs tabular-nums focus:border-imperial focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              <input
                type="number"
                inputMode="numeric"
                value={filtre.tlPerM2Max ?? ""}
                onChange={(e) =>
                  update({ tlPerM2Max: e.target.value ? Number(e.target.value) : null })
                }
                placeholder="Max ₺"
                className="rounded-md border border-slate-300 px-2 py-1 text-2xs tabular-nums focus:border-imperial focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Nitelik */}
          <div>
            <label className="text-3xs font-semibold uppercase tracking-wide text-slate-500 mb-1 block">
              Nitelik
            </label>
            <div className="flex flex-wrap gap-1">
              {([
                { v: "tum", l: "Tümü" },
                { v: "arsa", l: "Arsa" },
                { v: "tarla", l: "Tarla" },
                { v: "bahce", l: "Bahçe/Bağ" },
                { v: "zeytinlik", l: "Zeytinlik" },
                { v: "diger", l: "Diğer" },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => update({ nitelik: opt.v })}
                  className={`rounded-md border px-2 py-1 text-3xs font-medium transition-colors ${
                    filtre.nitelik === opt.v
                      ? "border-imperial bg-imperial text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-imperial/40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </div>

          {/* Risksiz toggle */}
          <label className="flex items-center gap-2 text-2xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={filtre.sadeceTemiz}
              onChange={(e) => update({ sadeceTemiz: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-slate-300 text-imperial focus:ring-imperial"
            />
            <span>
              Sadece risksiz parseller
              <span className="ml-1 text-3xs italic text-slate-500">
                (kritik/yüksek risk içermeyen)
              </span>
            </span>
          </label>

          {/* Reset */}
          {aktif > 0 && (
            <button
              type="button"
              onClick={reset}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-3xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              <XIcon className="h-3 w-3" />
              Filtreleri temizle ({aktif} aktif)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
