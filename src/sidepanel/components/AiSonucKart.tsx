/**
 * AiSonucKart — AI fiyat tahmini sonuç kartı
 *
 * Heuristik tahminle AI tahmini yan yana gösterir.
 * Sapma yönüne göre TrendingUp/Down ikonu ve renk kodu uygular.
 * Gerekçe varsa açılır detay paneli gösterir.
 */
import {
  Sparkles as SparklesIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
} from "lucide-react";
import { type AiFiyatSonucu } from "../../lib/ai-fiyat";
import { type FiyatTahmini, fmtTLM2 } from "../../lib/fiyat-tahmin";

interface Props {
  aiSonuc: AiFiyatSonucu;
  heuristic: FiyatTahmini;
}

export function AiSonucKart({ aiSonuc, heuristic }: Props) {
  const fark =
    heuristic.beklenenPerM2 > 0
      ? Math.round(
          ((aiSonuc.beklenenPerM2 - heuristic.beklenenPerM2) /
            heuristic.beklenenPerM2) *
            100,
        )
      : 0;

  const FarkIcon = fark > 0 ? TrendingUpIcon : fark < 0 ? TrendingDownIcon : null;
  const farkColor =
    fark > 5
      ? "text-accent-success"
      : fark < -5
        ? "text-accent-danger"
        : "text-slate-500";

  return (
    <div className="rounded-md border border-violet-200 bg-violet-50/50 p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1 text-3xs font-medium text-accent-ai">
          <SparklesIcon className="h-3 w-3" aria-hidden="true" />
          {aiSonuc.modelAd}
        </span>
        <span className="text-3xs text-slate-400 tabular-nums">
          {aiSonuc.sureMs}ms
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1 text-center">
        <div className="rounded bg-white px-1 py-1 dark:bg-slate-800">
          <div className="text-3xs text-slate-500">Alt</div>
          <div className="text-2xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
            {fmtTLM2(aiSonuc.altPerM2)}
          </div>
        </div>
        <div className="rounded bg-violet-100 px-1 py-1 dark:bg-violet-900/40">
          <div className="text-3xs text-accent-ai">AI Tahmin</div>
          <div className="text-2xs font-bold tabular-nums text-accent-ai">
            {fmtTLM2(aiSonuc.beklenenPerM2)}
          </div>
        </div>
        <div className="rounded bg-white px-1 py-1 dark:bg-slate-800">
          <div className="text-3xs text-slate-500">Üst</div>
          <div className="text-2xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
            {fmtTLM2(aiSonuc.ustPerM2)}
          </div>
        </div>
      </div>

      <div className="mt-1.5 flex items-center gap-1 text-3xs">
        <span className="text-slate-500">Heuristic ile fark:</span>
        {FarkIcon && <FarkIcon className={`h-3 w-3 ${farkColor}`} aria-hidden="true" />}
        <span className={`font-semibold tabular-nums ${farkColor}`}>
          {fark > 0 ? "+" : ""}
          {fark}%
        </span>
      </div>

      {aiSonuc.gerekce && (
        <details className="mt-2 group" open>
          <summary className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 px-2.5 py-1.5 text-3xs font-semibold text-blue-800 dark:from-blue-950/40 dark:to-indigo-950/40 dark:text-blue-300 select-none list-none">
            <span className="text-sm" aria-hidden="true">🤖</span>
            AI Değerleme Açıklaması
            <span className="ml-auto text-[9px] text-blue-500 group-open:hidden" aria-hidden="true">▼ göster</span>
            <span className="ml-auto text-[9px] text-blue-500 hidden group-open:inline" aria-hidden="true">▲ gizle</span>
          </summary>
          <div className="mt-1 rounded-lg border border-blue-100 bg-white p-2.5 dark:border-blue-900 dark:bg-slate-800">
            <p className="text-[10px] leading-relaxed text-slate-700 dark:text-slate-300">
              {aiSonuc.gerekce}
            </p>
            <p className="mt-1.5 text-[9px] text-slate-400">
              Model: {aiSonuc.modelAd ?? "AI"}
            </p>
          </div>
        </details>
      )}
    </div>
  );
}
