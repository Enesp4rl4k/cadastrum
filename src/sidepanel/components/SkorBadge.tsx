import type { Skor, SkorBilinmiyor } from "../../lib/skor";
import { Loader2 as LoaderIcon, RefreshCw as RefreshIcon } from "lucide-react";

interface Props {
  ad: string;
  icon: React.ReactNode;
  skor: Skor | SkorBilinmiyor;
  /** Veri toplama devam ediyorsa spinner göster */
  loading?: boolean;
  /** Veri çekme hatası — kullanıcıya retry imkanı sun */
  hata?: string | null;
  /** Retry tetikle */
  onRetry?: () => void;
  /** Veri tooltip — boş skorda neden boş olduğunu açıkla */
  bosAciklama?: string;
}

export function SkorBadge({
  ad,
  icon,
  skor,
  loading = false,
  hata = null,
  onRetry,
  bosAciklama,
}: Props) {
  const placeholder = skor.toplam == null;
  const value = placeholder ? 0 : (skor.toplam as number);

  // Renk semantik tonu
  const { ringColor, textColor, label } = colorForScore(value, placeholder, loading, !!hata);

  // SVG donut chart — radius 14, strokeWidth 3
  const r = 14;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - value / 100);

  return (
    <div
      className={`group flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white p-2 transition-shadow hover:shadow-card relative`}
      title={
        loading
          ? `${ad} hesaplanıyor…`
          : hata
            ? `${ad}: ${hata}`
            : placeholder
              ? bosAciklama ?? `${ad} skoru için çevre verisi gerekli`
              : `${ad} skoru: ${value}/100 — ${label}`
      }
    >
      <div className="relative h-8 w-8 flex-shrink-0">
        <svg viewBox="0 0 32 32" className="h-8 w-8 -rotate-90">
          <circle
            cx="16"
            cy="16"
            r={r}
            fill="none"
            stroke="rgb(226, 232, 240)"
            strokeWidth="3"
          />
          {!placeholder && !loading && (
            <circle
              cx="16"
              cy="16"
              r={r}
              fill="none"
              stroke={ringColor}
              strokeWidth="3"
              strokeDasharray={c}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          )}
        </svg>
        <div
          className={`absolute inset-0 flex items-center justify-center text-3xs ${textColor}`}
        >
          {loading ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" /> : icon}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-3xs uppercase tracking-wide text-slate-500">{ad}</div>

        {loading ? (
          // Loading durumu — skeleton block
          <>
            <div className="h-3 w-12 rounded bg-slate-200 animate-pulse mt-1" />
            <div className="text-3xs text-slate-400 mt-1">hesaplanıyor…</div>
          </>
        ) : hata ? (
          // Hata durumu — retry butonu
          <>
            <div className="text-2xs font-semibold text-red-600">Hata</div>
            {onRetry && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry();
                }}
                className="mt-0.5 inline-flex items-center gap-0.5 text-3xs text-red-600 hover:underline"
              >
                <RefreshIcon className="h-2.5 w-2.5" />
                yeniden dene
              </button>
            )}
          </>
        ) : placeholder ? (
          // Boş skor — neden boş olduğunu açıkla
          <>
            <div className="text-2xs font-semibold text-slate-400">veri yok</div>
            {bosAciklama && (
              <div className="text-3xs text-slate-400 leading-tight mt-0.5 line-clamp-2">
                {bosAciklama}
              </div>
            )}
          </>
        ) : (
          // Normal sonuç
          <>
            <div className="flex items-baseline gap-1">
              <span
                className={`text-base font-bold tabular-nums leading-none ${textColor}`}
              >
                {value}
              </span>
              <span className="text-3xs text-slate-400">/ 100</span>
            </div>
            <div className={`mt-0.5 text-3xs ${textColor}`}>{label}</div>
          </>
        )}
      </div>
    </div>
  );
}

function colorForScore(
  value: number,
  placeholder: boolean,
  loading: boolean,
  hata: boolean,
) {
  if (loading) {
    return {
      ringColor: "rgb(148, 163, 184)",
      textColor: "text-slate-400",
      label: "hesaplanıyor…",
    };
  }
  if (hata) {
    return {
      ringColor: "rgb(220, 38, 38)",
      textColor: "text-red-500",
      label: "hata",
    };
  }
  if (placeholder) {
    return {
      ringColor: "rgb(148, 163, 184)",
      textColor: "text-slate-400",
      label: "veri yok",
    };
  }
  if (value >= 75) return { ringColor: "rgb(5, 150, 105)", textColor: "text-accent-success", label: "yüksek" };
  if (value >= 50) return { ringColor: "rgb(217, 119, 6)", textColor: "text-accent-warning", label: "orta" };
  if (value >= 25) return { ringColor: "rgb(234, 88, 12)", textColor: "text-accent-ilan", label: "düşük" };
  return { ringColor: "rgb(220, 38, 38)", textColor: "text-accent-danger", label: "zayıf" };
}
