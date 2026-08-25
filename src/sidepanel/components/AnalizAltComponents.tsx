/**
 * AnalizPanel alt component'leri — küçük, tek sorumluluklu UI parçaları.
 *
 * Section   : başlıklı kart kutusu (AnalizPanel içi için, ui/Card.Section'dan farklı stil)
 * KV        : key-value satırı
 * Poi       : POI sayısı veya mesafe tile'ı
 * Bilesenler: skor bileşeni listesi (progress bar)
 */
import type { ReactNode } from "react";

/* ─── Section ─────────────────────────────────────────────────────────────── */

interface SectionProps {
  title: string;
  children: ReactNode;
  loz?: boolean;
  right?: ReactNode;
}

export function Section({ title, children, loz, right }: SectionProps) {
  return (
    <div
      className={`rounded-lg border shadow-card transition-shadow hover:shadow-card-hover ${
        loz
          ? "border-dashed border-slate-300 bg-slate-50/50"
          : "border-slate-200 bg-white dark:border-slate-700/60 dark:bg-slate-900"
      }`}
    >
      <header className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
        <h4 className="text-2xs font-semibold text-slate-700 dark:text-slate-200">{title}</h4>
        {right}
      </header>
      <div className="px-3 pb-2">{children}</div>
    </div>
  );
}

/* ─── KV ──────────────────────────────────────────────────────────────────── */

interface KVProps {
  k: string;
  v: string;
}

export function KV({ k, v }: KVProps) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5 text-2xs">
      <span className="text-slate-500 dark:text-slate-400">{k}</span>
      <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">{v}</span>
    </div>
  );
}

/* ─── Poi ─────────────────────────────────────────────────────────────────── */

interface PoiProps {
  label: string;
  sayi: number;
  enYakinM?: number | null;
}

export function Poi({ label, sayi, enYakinM }: PoiProps) {
  // POI 1.5km içinde varsa sayı + yeşil; yoksa en yakın mesafe (5km'ye kadar) + nötr
  const farUstu = sayi === 0 && enYakinM != null;

  return (
    <div
      className={`rounded-md border px-1.5 py-1.5 text-center transition-colors ${
        sayi > 0
          ? "border-emerald-200 bg-emerald-50/70 text-accent-success"
          : farUstu
            ? "border-amber-200 bg-amber-50/70 text-amber-700"
            : "border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-800"
      }`}
      title={
        sayi > 0
          ? `1.5km içinde ${sayi} ${label.toLowerCase()}`
          : farUstu && enYakinM != null
            ? `En yakın ${label.toLowerCase()} ${(enYakinM / 1000).toFixed(1)}km'de`
            : `5km içinde ${label.toLowerCase()} bulunamadı`
      }
    >
      {sayi > 0 ? (
        <>
          <div className="text-base font-bold leading-none">{sayi}</div>
          <div className="text-[9px] uppercase tracking-wide">{label}</div>
        </>
      ) : farUstu && enYakinM != null ? (
        <>
          <div className="text-sm font-bold leading-none">
            {(enYakinM / 1000).toFixed(1)}
            <span className="text-[8px] font-normal">km</span>
          </div>
          <div className="text-[9px] uppercase tracking-wide">{label}</div>
        </>
      ) : (
        <>
          <div className="text-sm font-bold leading-none">—</div>
          <div className="text-[9px] uppercase tracking-wide">{label}</div>
        </>
      )}
    </div>
  );
}

/* ─── Bilesenler ──────────────────────────────────────────────────────────── */

interface BilesenlerProps {
  bilesenler: { ad: string; puan: number; not: string }[];
}

export function Bilesenler({ bilesenler }: BilesenlerProps) {
  return (
    <div className="space-y-1">
      {bilesenler.map((b) => (
        <div key={b.ad} className="text-[11px]">
          <div className="flex justify-between gap-2">
            <span className="text-tkgm-muted">{b.ad}</span>
            <span className="font-medium">
              {b.puan}/100 · {b.not}
            </span>
          </div>
          <div
            className="h-1 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-700"
            role="progressbar"
            aria-valuenow={b.puan}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={b.ad}
          >
            <div
              className={`h-full ${
                b.puan >= 75
                  ? "bg-emerald-500"
                  : b.puan >= 50
                    ? "bg-amber-500"
                    : "bg-red-500"
              }`}
              style={{ width: `${b.puan}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
