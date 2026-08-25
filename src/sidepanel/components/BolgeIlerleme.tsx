/**
 * BolgeIlerleme — Bölge tarama progress bar ve durdur butonu.
 * BolgeView'den çıkarılmıştır (refactor).
 */
import type { TaramaProgress } from "../../lib/bolge-profili";

interface Props {
  progress: TaramaProgress;
  onDurdur: () => void;
}

export function BolgeIlerleme({ progress, onDurdur }: Props) {
  const yuzde = Math.round(
    (progress.done / Math.max(progress.total, 1)) * 100,
  );

  return (
    <div className="space-y-2">
      <div className="font-medium">Taranıyor…</div>

      {/* Progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded bg-slate-200">
        <div
          className="h-full bg-tkgm-primary transition-all"
          style={{ width: `${yuzde}%` }}
          role="progressbar"
          aria-valuenow={yuzde}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Tarama ilerlemesi"
        />
      </div>

      <div className="text-tkgm-muted">
        {progress.done}/{progress.total} sorgu ·{" "}
        <strong>{progress.bulunan}</strong> parsel bulundu
        {progress.cacheHit > 0 && (
          <span className="ml-1 text-slate-400">
            ({progress.cacheHit} cache)
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onDurdur}
        className="rounded bg-red-600 px-3 py-1 font-medium text-white hover:bg-red-700 transition-colors"
        aria-label="Taramayı durdur"
      >
        Durdur
      </button>
    </div>
  );
}
