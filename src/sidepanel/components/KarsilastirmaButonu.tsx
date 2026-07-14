/**
 * Karşılaştırmaya Ekle / Çıkar Butonu
 *
 * Parsel detay sayfasında ve harita popup'ında kullanılır.
 * Mevcut parsel karşılaştırma listesinde varsa "Çıkar", yoksa "Ekle" gösterir.
 */

import { GitCompare as CompareIcon, X as XIcon, Plus as PlusIcon } from "lucide-react";
import {
  useKarsilastirma,
  MAX_KARSILASTIRMA,
} from "../../lib/karsilastirma-store";
import type { Parsel } from "../../types/tkgm";

interface KarsilastirmaButonuProps {
  parsel: Parsel;
  /** "icon" = sadece ikon, "compact" = ikon+kısa metin, "full" = tam buton */
  varyant?: "icon" | "compact" | "full";
  className?: string;
  /** Ekleme sonrası karşılaştırma tabına yönlendirme callback */
  onEklendi?: () => void;
}

export function KarsilastirmaButonu({
  parsel,
  varyant = "compact",
  className = "",
  onEklendi,
}: KarsilastirmaButonuProps) {
  const { ekle, cikar, varMi, dolu, liste } = useKarsilastirma();
  const ekliMi = varMi(parsel);
  const key = `${parsel.mahalleKodu ?? 0}:${parsel.adaNo}:${parsel.parselNo}`;

  function handleTikla() {
    if (ekliMi) {
      cikar(key);
    } else {
      ekle(parsel);
      onEklendi?.();
    }
  }

  if (varyant === "icon") {
    return (
      <button
        type="button"
        onClick={handleTikla}
        title={
          ekliMi
            ? "Karşılaştırmadan çıkar"
            : dolu
              ? `Maks ${MAX_KARSILASTIRMA} parsel (eski silinir)`
              : "Karşılaştırmaya ekle"
        }
        className={`p-1.5 rounded-lg transition-colors ${
          ekliMi
            ? "bg-tkgm-primary text-white hover:bg-blue-700"
            : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
        } ${className}`}
        aria-pressed={ekliMi}
      >
        {ekliMi ? <XIcon className="h-3.5 w-3.5" /> : <CompareIcon className="h-3.5 w-3.5" />}
      </button>
    );
  }

  if (varyant === "compact") {
    return (
      <button
        type="button"
        onClick={handleTikla}
        title={ekliMi ? "Karşılaştırmadan çıkar" : "Karşılaştırmaya ekle"}
        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-3xs font-medium transition-colors ${
          ekliMi
            ? "bg-tkgm-primary/10 text-tkgm-primary hover:bg-tkgm-primary/20 border border-tkgm-primary/30"
            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
        } ${className}`}
        aria-pressed={ekliMi}
      >
        {ekliMi ? (
          <>
            <XIcon className="h-3 w-3" />
            Çıkar
          </>
        ) : (
          <>
            <CompareIcon className="h-3 w-3" />
            Karşılaştır
          </>
        )}
        {!ekliMi && liste.length > 0 && (
          <span className="ml-0.5 rounded-full bg-tkgm-primary text-white text-[8px] font-bold w-3.5 h-3.5 flex items-center justify-center">
            {liste.length}
          </span>
        )}
      </button>
    );
  }

  // full varyant
  return (
    <button
      type="button"
      onClick={handleTikla}
      className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
        ekliMi
          ? "bg-tkgm-primary text-white hover:bg-blue-700"
          : dolu
            ? "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 border border-dashed border-slate-300 dark:border-slate-600"
            : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
      } ${className}`}
      aria-pressed={ekliMi}
    >
      {ekliMi ? (
        <>
          <XIcon className="h-4 w-4" />
          Karşılaştırmadan Çıkar
        </>
      ) : (
        <>
          <PlusIcon className="h-4 w-4" />
          Karşılaştırmaya Ekle
          {liste.length > 0 && (
            <span className="ml-1 rounded-full bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-200 text-3xs font-bold px-1.5 py-0.5">
              {liste.length}/{MAX_KARSILASTIRMA}
            </span>
          )}
        </>
      )}
    </button>
  );
}
