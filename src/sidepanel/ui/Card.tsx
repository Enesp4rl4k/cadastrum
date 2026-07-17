import type { ReactNode } from "react";

type AccentColor =
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "ai"
  | "ilan"
  | "neutral";

type CardVariant = "default" | "glass" | "elevated" | "outlined" | "flat";

interface CardProps {
  children: ReactNode;
  /** Sol kenarda 3px renkli şerit */
  accent?: AccentColor;
  /** Görsel stil varyantı */
  variant?: CardVariant;
  className?: string;
  static?: boolean;
  /** Glow efekti */
  glow?: AccentColor;
}

const ACCENT_BORDER: Record<AccentColor, string> = {
  info:    "border-l-[3px] border-l-accent-info",
  success: "border-l-[3px] border-l-accent-success",
  warning: "border-l-[3px] border-l-accent-warning",
  danger:  "border-l-[3px] border-l-accent-danger",
  ai:      "border-l-[3px] border-l-accent-ai",
  ilan:    "border-l-[3px] border-l-accent-ilan",
  neutral: "border-l-[3px] border-l-accent-neutral",
};

const GLOW_SHADOW: Record<AccentColor, string> = {
  info:    "shadow-glow-primary",
  success: "shadow-glow-success",
  warning: "",
  danger:  "",
  ai:      "shadow-glow-ai",
  ilan:    "shadow-glow-ilan",
  neutral: "",
};

const VARIANT_CLASSES: Record<CardVariant, string> = {
  default:  "border border-slate-200 bg-white shadow-card dark:border-slate-700/60 dark:bg-slate-900",
  glass:    "border border-white/50 dark:border-white/[0.06] bg-white/72 dark:bg-slate-900/75 backdrop-blur-md shadow-md",
  elevated: "border border-slate-200/80 bg-white shadow-lg dark:border-slate-700/50 dark:bg-slate-900",
  outlined: "border-2 border-slate-200 bg-transparent dark:border-slate-700",
  flat:     "bg-slate-50 dark:bg-slate-800/50",
};

export function Card({
  children,
  accent,
  variant = "default",
  className = "",
  static: isStatic = false,
  glow,
}: CardProps) {
  const accentClass  = accent ? ACCENT_BORDER[accent] : "";
  const glowClass    = glow ? GLOW_SHADOW[glow] : "";
  const hoverClass   = isStatic ? "" : "transition-shadow hover:shadow-card-hover dark:hover:shadow-md";

  return (
    <div
      className={`
        rounded-xl
        ${VARIANT_CLASSES[variant]}
        ${accentClass}
        ${glowClass}
        ${hoverClass}
        ${className}
      `.replace(/\s+/g, " ").trim()}
    >
      {children}
    </div>
  );
}

/* ─── Section ─────────────────────────────────────────────────────────────── */

type AccentTextColor = Record<AccentColor, string>;

const ACCENT_TEXT: AccentTextColor = {
  info:    "text-accent-info",
  success: "text-accent-success",
  warning: "text-accent-warning",
  danger:  "text-accent-danger",
  ai:      "text-accent-ai",
  ilan:    "text-accent-ilan",
  neutral: "text-accent-neutral",
};

// Subtle tinted header backgrounds per accent
const ACCENT_HEADER_BG: Record<AccentColor, string> = {
  info:    "bg-sky-50/60 dark:bg-sky-950/20",
  success: "bg-emerald-50/60 dark:bg-emerald-950/20",
  warning: "bg-amber-50/60 dark:bg-amber-950/20",
  danger:  "bg-red-50/60 dark:bg-red-950/20",
  ai:      "bg-violet-50/60 dark:bg-violet-950/20",
  ilan:    "bg-orange-50/60 dark:bg-orange-950/20",
  neutral: "",
};

interface SectionProps {
  title: string;
  icon?: ReactNode;
  accent?: AccentColor;
  actions?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  bare?: boolean;
  variant?: CardVariant;
  /** Accent tinted header arka planı göster */
  tintedHeader?: boolean;
  glow?: AccentColor;
}

export function Section({
  title,
  icon,
  accent,
  actions,
  subtitle,
  children,
  bare = false,
  variant,
  tintedHeader = false,
  glow,
}: SectionProps) {
  const iconColor = accent ? ACCENT_TEXT[accent] : "text-slate-400 dark:text-slate-500";
  const headerBg  = tintedHeader && accent ? ACCENT_HEADER_BG[accent] : "";

  return (
    <Card accent={accent} variant={variant} glow={glow}>
      <header
        className={`
          flex items-start justify-between gap-2
          px-3 pt-2.5 pb-2
          ${headerBg}
          ${tintedHeader && accent ? "rounded-t-xl" : ""}
        `.replace(/\s+/g, " ").trim()}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {icon && (
            <span className={`flex-shrink-0 ${iconColor}`} aria-hidden="true">
              {icon}
            </span>
          )}
          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
            {title}
          </h3>
          {subtitle && (
            <span className="text-3xs text-slate-500 dark:text-slate-400 truncate ml-0.5">
              {subtitle}
            </span>
          )}
        </div>
        {actions && <div className="flex-shrink-0">{actions}</div>}
      </header>
      <div className={bare ? "" : "px-3 pb-3"}>{children}</div>
    </Card>
  );
}

/* ─── MetricRow ───────────────────────────────────────────────────────────── */

interface RowProps {
  label: string;
  value: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "muted";
  hint?: string;
}

const TONE_TEXT: Record<NonNullable<RowProps["tone"]>, string> = {
  default: "text-slate-800 dark:text-slate-100",
  success: "text-accent-success",
  warning: "text-accent-warning",
  danger:  "text-accent-danger",
  muted:   "text-slate-400 dark:text-slate-500",
};

export function Row({ label, value, tone = "default", hint }: RowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px] text-2xs group">
      <span className="text-slate-500 dark:text-slate-400 truncate">{label}</span>
      <span
        className={`font-medium metric-value ${TONE_TEXT[tone]}`}
        title={hint}
      >
        {value}
      </span>
    </div>
  );
}

/* ─── MetricCard — compact stat tile ─────────────────────────────────────── */

interface MetricCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: AccentColor;
  className?: string;
}

const METRIC_ACCENT_STYLES: Record<AccentColor, string> = {
  info:    "bg-sky-50     border-sky-100    dark:bg-sky-950/30  dark:border-sky-900/50",
  success: "bg-emerald-50 border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/50",
  warning: "bg-amber-50   border-amber-100  dark:bg-amber-950/30 dark:border-amber-900/50",
  danger:  "bg-red-50     border-red-100    dark:bg-red-950/30  dark:border-red-900/50",
  ai:      "bg-violet-50  border-violet-100 dark:bg-violet-950/30 dark:border-violet-900/50",
  ilan:    "bg-orange-50  border-orange-100 dark:bg-orange-950/30 dark:border-orange-900/50",
  neutral: "bg-slate-50   border-slate-100  dark:bg-slate-800/50 dark:border-slate-700",
};

const METRIC_VALUE_COLOR: Record<AccentColor, string> = {
  info:    "text-sky-700    dark:text-sky-300",
  success: "text-emerald-700 dark:text-emerald-300",
  warning: "text-amber-700  dark:text-amber-300",
  danger:  "text-red-700    dark:text-red-300",
  ai:      "text-violet-700 dark:text-violet-300",
  ilan:    "text-orange-700 dark:text-orange-300",
  neutral: "text-slate-700  dark:text-slate-200",
};

export function MetricCard({ label, value, sub, accent = "neutral", className = "" }: MetricCardProps) {
  return (
    <div
      className={`
        rounded-lg border px-2.5 py-2 text-center
        ${METRIC_ACCENT_STYLES[accent]}
        ${className}
      `.replace(/\s+/g, " ").trim()}
    >
      <div className="text-3xs text-slate-500 dark:text-slate-400 mb-0.5 uppercase tracking-wide font-medium">
        {label}
      </div>
      <div className={`text-sm font-bold metric-value leading-tight ${METRIC_VALUE_COLOR[accent]}`}>
        {value}
      </div>
      {sub && (
        <div className="text-3xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</div>
      )}
    </div>
  );
}

/* ─── Divider ─────────────────────────────────────────────────────────────── */

export function Divider({ className = "" }: { className?: string }) {
  return (
    <div
      className={`my-2 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent dark:via-slate-700 ${className}`}
      role="separator"
      aria-hidden="true"
    />
  );
}
