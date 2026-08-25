/**
 * AccordionSection — animasyonlu açılır/kapanır panel
 *
 * Kullanım:
 *   <AccordionSection
 *     title="Konum & Çevre"
 *     icon={<MapPinIcon />}
 *     badge="Skor 82"
 *     badgeTone="success"
 *     defaultOpen={false}
 *   >
 *     ...içerik...
 *   </AccordionSection>
 */

import { useState, useRef, useEffect, type ReactNode } from "react";
import { ChevronRight as ChevronIcon } from "lucide-react";

type BadgeTone = "default" | "success" | "warning" | "danger" | "info" | "ai" | "muted";

const BADGE_STYLES: Record<BadgeTone, string> = {
  default: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-800/50",
  warning: "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-800/50",
  danger:  "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-800/50",
  info:    "bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:ring-sky-800/50",
  ai:      "bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:ring-violet-800/50",
  muted:   "bg-slate-50 text-slate-400 dark:bg-slate-800/50 dark:text-slate-500",
};

const HEADER_ACCENT: Record<BadgeTone, string> = {
  default: "",
  success: "border-l-[3px] border-l-emerald-500",
  warning: "border-l-[3px] border-l-amber-500",
  danger:  "border-l-[3px] border-l-red-500",
  info:    "border-l-[3px] border-l-sky-500",
  ai:      "border-l-[3px] border-l-violet-500",
  muted:   "",
};

interface AccordionSectionProps {
  title: string;
  /** Lucide icon component */
  icon?: ReactNode;
  /** Özet metin — kapalıyken gösterilir */
  badge?: string;
  badgeTone?: BadgeTone;
  /** Varsayılan açık mı? */
  defaultOpen?: boolean;
  /** Controlled mod — dışarıdan kontrol */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  /** Sağ üste ek aksiyon */
  actions?: ReactNode;
  /** Disabled — içerik kilitli (Pro paywall) */
  disabled?: boolean;
  /** Pro badge göster */
  pro?: boolean;
}

export function AccordionSection({
  title,
  icon,
  badge,
  badgeTone = "default",
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  children,
  actions,
  disabled = false,
  pro = false,
}: AccordionSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">(isOpen ? "auto" : 0);
  const animatingRef = useRef(false);

  // Open/close ile height animasyonu — CSS transition + auto height trick
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    if (isOpen) {
      // Kapalı → açık: önce scrollHeight'ı set et, sonra auto'ya geç
      const sh = el.scrollHeight;
      setHeight(sh);
      animatingRef.current = true;
      const t = setTimeout(() => {
        setHeight("auto");
        animatingRef.current = false;
      }, 300);
      return () => clearTimeout(t);
    } else {
      // Açık → kapalı: önce scrollHeight'ı set et (auto'dan geçiş), sonra 0
      if (height === "auto") {
        const sh = el.scrollHeight;
        setHeight(sh);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setHeight(0);
          });
        });
      } else {
        setHeight(0);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function toggle() {
    if (disabled) return;
    const next = !isOpen;
    if (isControlled) {
      onOpenChange?.(next);
    } else {
      setInternalOpen(next);
      onOpenChange?.(next);
    }
  }

  return (
    <div
      className={[
        "overflow-hidden rounded-xl border transition-colors duration-200",
        isOpen
          ? "border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900"
          : "border-slate-200/70 bg-white dark:border-slate-700/40 dark:bg-slate-900/80",
        disabled ? "opacity-60" : "",
      ].join(" ")}
    >
      {/* ── Header ── */}
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        className={[
          "flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors",
          "hover:bg-slate-50/80 dark:hover:bg-slate-800/50",
          "disabled:cursor-not-allowed",
          isOpen ? HEADER_ACCENT[badgeTone] : "",
        ].join(" ")}
        aria-expanded={isOpen}
      >
        {/* Chevron */}
        <ChevronIcon
          className={[
            "h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform duration-200",
            isOpen ? "rotate-90" : "rotate-0",
          ].join(" ")}
          aria-hidden="true"
        />

        {/* Icon */}
        {icon && (
          <span className="flex-shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true">
            {icon}
          </span>
        )}

        {/* Title */}
        <span className="flex-1 truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
          {title}
        </span>

        {/* Pro badge */}
        {pro && (
          <span className="flex-shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
            PRO
          </span>
        )}

        {/* Summary badge — kapalıyken göster */}
        {badge && !isOpen && (
          <span
            className={[
              "flex-shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-medium leading-none",
              BADGE_STYLES[badgeTone],
            ].join(" ")}
          >
            {badge}
          </span>
        )}

        {/* Actions — açık/kapalı her zaman */}
        {actions && (
          <div
            className="flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        )}
      </button>

      {/* ── Animasyonlu içerik ── */}
      <div
        ref={contentRef}
        style={{
          height: height === "auto" ? "auto" : `${height}px`,
          overflow: height === "auto" ? "visible" : "hidden",
          transition: "height 280ms cubic-bezier(0.32,0.72,0,1)",
        }}
      >
        <div className="px-3 pb-3 pt-1 space-y-2">
          {children}
        </div>
      </div>
    </div>
  );
}
