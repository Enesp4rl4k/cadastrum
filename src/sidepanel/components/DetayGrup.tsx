/**
 * DetayGrup — sidepanel kalabalığını azaltmak için ilgili kartları
 * tek bir collapsible bölüm altına toplayan wrapper.
 */

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown as ChevronDownIcon } from "lucide-react";

interface Props {
  baslik: string;
  ikon?: string;
  /** Kapalıyken yanında görünen kısa özet (örn. "3 modül") */
  ozet?: string;
  /** Aksanlı renk (Pro modüller için amber, manuel veri için emerald, vs) */
  renk?: "slate" | "emerald" | "amber" | "violet";
  /** İlk açılış varsayılanı */
  defaultAcik?: boolean;
  /** Controlled kullanım için açık durumu */
  acik?: boolean;
  /** Controlled kullanım için state callback'i */
  onAcikDegisimi?: (acik: boolean) => void;
  children: ReactNode;
}

const RENK_SINIFLARI: Record<NonNullable<Props["renk"]>, { border: string; bg: string; text: string; chevron: string; panel: string; hover: string }> = {
  slate: {
    border: "border-slate-200 dark:border-slate-700",
    bg: "bg-slate-50/50 dark:bg-slate-900/50",
    text: "text-slate-700 dark:text-slate-100",
    chevron: "text-slate-400 dark:text-slate-300",
    panel: "border-slate-200/60 bg-white/80 dark:border-slate-700/80 dark:bg-slate-950/60",
    hover: "hover:bg-white/70 dark:hover:bg-slate-800/60",
  },
  emerald: {
    border: "border-emerald-200 dark:border-emerald-500/60",
    bg: "bg-emerald-50/40 dark:bg-emerald-950/20",
    text: "text-emerald-800 dark:text-emerald-200",
    chevron: "text-emerald-500 dark:text-emerald-300",
    panel: "border-emerald-200/60 bg-white/80 dark:border-emerald-500/30 dark:bg-slate-950/60",
    hover: "hover:bg-white/70 dark:hover:bg-emerald-950/20",
  },
  amber: {
    border: "border-amber-200 dark:border-amber-500/60",
    bg: "bg-amber-50/40 dark:bg-amber-950/20",
    text: "text-amber-800 dark:text-amber-200",
    chevron: "text-amber-500 dark:text-amber-300",
    panel: "border-amber-200/60 bg-white/80 dark:border-amber-500/30 dark:bg-slate-950/60",
    hover: "hover:bg-white/70 dark:hover:bg-amber-950/20",
  },
  violet: {
    border: "border-violet-200 dark:border-violet-500/60",
    bg: "bg-violet-50/40 dark:bg-violet-950/20",
    text: "text-violet-800 dark:text-violet-200",
    chevron: "text-violet-500 dark:text-violet-300",
    panel: "border-violet-200/60 bg-white/80 dark:border-violet-500/30 dark:bg-slate-950/60",
    hover: "hover:bg-white/70 dark:hover:bg-violet-950/20",
  },
};

export function DetayGrup({ baslik, ikon, ozet, renk = "slate", defaultAcik = false, acik: kontrolluAcik, onAcikDegisimi, children }: Props) {
  const [icAcik, setIcAcik] = useState(defaultAcik);
  const r = RENK_SINIFLARI[renk];
  const acik = kontrolluAcik ?? icAcik;

  useEffect(() => {
    if (kontrolluAcik == null) {
      setIcAcik(defaultAcik);
    }
  }, [defaultAcik, kontrolluAcik]);

  function toggle() {
    const yeni = !acik;
    if (kontrolluAcik == null) {
      setIcAcik(yeni);
    }
    onAcikDegisimi?.(yeni);
  }

  return (
    <div className={`rounded-md border ${r.border} ${r.bg} overflow-hidden transition-all`}>
      <button
        type="button"
        onClick={toggle}
        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left ${r.text} ${r.hover} transition`}
      >
        <span className="flex items-center gap-2 text-xs font-semibold">
          {ikon && <span className="text-sm">{ikon}</span>}
          <span>{baslik}</span>
          {ozet && (
            <span className="rounded-full bg-white/85 px-1.5 py-0.5 text-[9px] font-medium text-slate-600 dark:bg-slate-800/90 dark:text-slate-200">
              {ozet}
            </span>
          )}
        </span>
        <ChevronDownIcon
          className={`h-3.5 w-3.5 ${r.chevron} transition-transform ${acik ? "rotate-180" : ""}`}
        />
      </button>

      {acik && (
        <div className={`space-y-2 border-t p-2 ${r.panel}`}>
          {children}
        </div>
      )}
    </div>
  );
}
