/**
 * Analiz İlerleme Çubuğu — tüm veri katmanlarının yüklenme durumunu gösterir.
 *
 * Parsel seçildiğinde otomatik açılır, tüm katmanlar tamamlandığında kapanır.
 * Her katmanın durumu (bekliyor/yükleniyor/tamam/hata) renk kodlu gösterilir.
 */
import { CheckCircle2, Loader2, Clock, AlertCircle } from "lucide-react";
import type { KatmanBilgi, KatmanDurum } from "../../lib/analiz-orkestrator";
import { ilerlemeYuzde } from "../../lib/analiz-orkestrator";

interface Props {
  katmanlar: KatmanBilgi[];
  gecenMs?: number;
  /** Tüm katmanlar tamamlandığında gizle */
  gizleTamamlandiktan?: number; // ms — varsayılan 2000
}

export function AnalizIlerlemeBar({ katmanlar, gecenMs = 0, gizleTamamlandiktan = 2500 }: Props) {
  const tamamlanan = katmanlar.filter((k) => k.durum === "tamam" || k.durum === "atlandi").length;
  const hata = katmanlar.filter((k) => k.durum === "hata").length;
  const toplam = katmanlar.length;
  const yuzde = toplam > 0 ? Math.round((tamamlanan / toplam) * 100) : 0;
  const tumTamamlandi = tamamlanan + hata === toplam;
  const aktifKatman = katmanlar.find((k) => k.durum === "yukleniyor");

  // Tüm tamamlandıysa ve bekleme süresi geçtiyse gizle
  if (tumTamamlandi && gecenMs > gizleTamamlandiktan) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {/* Üst satır: ilerleme % + süre */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          {tumTamamlandi ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
          )}
          <span className="text-2xs font-medium text-slate-700 dark:text-slate-300">
            {tumTamamlandi
              ? hata > 0
                ? `Analiz tamamlandı (${hata} hata)`
                : "Analiz tamamlandı"
              : aktifKatman
              ? `${aktifKatman.ikon} ${aktifKatman.ad} yükleniyor…`
              : "Analiz hazırlanıyor…"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {gecenMs > 0 && (
            <span className="text-[10px] text-slate-400 tabular-nums">
              {(gecenMs / 1000).toFixed(1)}s
            </span>
          )}
          <span className="text-[10px] font-semibold text-slate-500 tabular-nums">
            {tamamlanan}/{toplam}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            tumTamamlandi
              ? hata > 0 ? "bg-amber-500" : "bg-emerald-500"
              : "bg-blue-500"
          }`}
          style={{ width: `${yuzde}%` }}
          role="progressbar"
          aria-valuenow={yuzde}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {/* Katman chip'leri */}
      <div className="flex flex-wrap gap-1">
        {katmanlar.map((k) => (
          <KatmanChip key={k.id} katman={k} />
        ))}
      </div>
    </div>
  );
}

function KatmanChip({ katman }: { katman: KatmanBilgi }) {
  const { durum, ikon, ad } = katman;

  const renkler: Record<KatmanDurum, string> = {
    bekliyor:    "bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500",
    yukleniyor:  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    tamam:       "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    hata:        "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300",
    atlandi:     "bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500",
  };

  const ikonEleman =
    durum === "yukleniyor" ? (
      <Loader2 className="h-2.5 w-2.5 animate-spin" />
    ) : durum === "tamam" ? (
      <CheckCircle2 className="h-2.5 w-2.5" />
    ) : durum === "hata" ? (
      <AlertCircle className="h-2.5 w-2.5" />
    ) : durum === "bekliyor" ? (
      <Clock className="h-2.5 w-2.5" />
    ) : null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-colors ${renkler[durum]}`}
      title={`${ad}: ${durum}`}
    >
      <span aria-hidden="true">{ikon}</span>
      {ikonEleman}
      <span className="max-w-[60px] truncate">{ad}</span>
      {katman.sure && durum === "tamam" && (
        <span className="text-[9px] opacity-60 tabular-nums">{katman.sure}ms</span>
      )}
    </span>
  );
}
