import type { ReactNode } from "react";

type AccentColor =
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "ai"
  | "ilan"
  | "neutral";

interface CardProps {
  children: ReactNode;
  /** Sol kenarda 3px renkli şerit — kategori göstergesi */
  accent?: AccentColor;
  className?: string;
  /** Hover state'i devre dışı bırak */
  static?: boolean;
}

const ACCENT_BORDER: Record<AccentColor, string> = {
  info: "border-l-accent-info",
  success: "border-l-accent-success",
  warning: "border-l-accent-warning",
  danger: "border-l-accent-danger",
  ai: "border-l-accent-ai",
  ilan: "border-l-accent-ilan",
  neutral: "border-l-accent-neutral",
};

export function Card({
  children,
  accent,
  className = "",
  static: isStatic = false,
}: CardProps) {
  const accentClass = accent ? `border-l-[3px] ${ACCENT_BORDER[accent]}` : "";
  const hoverClass = isStatic ? "" : "transition-shadow hover:shadow-card-hover";
  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white shadow-card ${accentClass} ${hoverClass} ${className}`}
    >
      {children}
    </div>
  );
}

interface SectionProps {
  title: string;
  icon?: ReactNode;
  accent?: AccentColor;
  /** Sağ tarafta opsiyonel aksiyon (button vs.) */
  actions?: ReactNode;
  /** Alt başlık veya rozet */
  subtitle?: ReactNode;
  children: ReactNode;
  /** padding'i kapat — child kendi padding ayarlasın */
  bare?: boolean;
}

const ACCENT_TEXT: Record<AccentColor, string> = {
  info: "text-accent-info",
  success: "text-accent-success",
  warning: "text-accent-warning",
  danger: "text-accent-danger",
  ai: "text-accent-ai",
  ilan: "text-accent-ilan",
  neutral: "text-accent-neutral",
};

export function Section({
  title,
  icon,
  accent,
  actions,
  subtitle,
  children,
  bare = false,
}: SectionProps) {
  const iconColor = accent ? ACCENT_TEXT[accent] : "text-slate-500";
  return (
    <Card accent={accent}>
      <header className="flex items-start justify-between gap-2 px-3 pt-2.5 pb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {icon && <span className={`flex-shrink-0 ${iconColor}`}>{icon}</span>}
          <h3 className="text-xs font-semibold text-slate-800 truncate">
            {title}
          </h3>
          {subtitle && (
            <span className="text-3xs text-slate-500 truncate">{subtitle}</span>
          )}
        </div>
        {actions && <div className="flex-shrink-0">{actions}</div>}
      </header>
      <div className={bare ? "" : "px-3 pb-2.5"}>{children}</div>
    </Card>
  );
}

interface RowProps {
  label: string;
  value: ReactNode;
  /** Değeri renklendir */
  tone?: "default" | "success" | "warning" | "danger" | "muted";
}

const TONE_TEXT: Record<NonNullable<RowProps["tone"]>, string> = {
  default: "text-slate-800",
  success: "text-accent-success",
  warning: "text-accent-warning",
  danger: "text-accent-danger",
  muted: "text-slate-500",
};

export function Row({ label, value, tone = "default" }: RowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-2xs">
      <span className="text-slate-500 truncate">{label}</span>
      <span className={`font-medium tabular-nums ${TONE_TEXT[tone]}`}>
        {value}
      </span>
    </div>
  );
}
