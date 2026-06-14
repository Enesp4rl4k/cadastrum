/**
 * Risk Kartı — parsel detayında deprem + taşkın risk göstergesi.
 *
 * Kaynaklar:
 *   - AFAD Türkiye Deprem Tehlike Haritası (2018)
 *   - Çevre Bakanlığı + AFAD Sel Master Planı
 *
 * Şu an il bazlı agregasyon. Mahalle granularity ileride.
 */
import { depremRiskiGetir, type DepremZonu } from "../../lib/data/deprem-zonlari";
import { taskinRiskiGetir, type TaskinRiski } from "../../lib/data/taskin-risk";
import { normalizeYerAdi } from "../../lib/tkgm-api";

interface Props {
  ilAd: string | null | undefined;
}

const DEPREM_RENK: Record<DepremZonu, { bg: string; text: string; etiket: string }> = {
  "Z1": { bg: "bg-red-50 border-red-200", text: "text-red-700", etiket: "Çok yüksek risk" },
  "Z2": { bg: "bg-orange-50 border-orange-200", text: "text-orange-700", etiket: "Yüksek risk" },
  "Z3": { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", etiket: "Orta risk" },
  "Z4": { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", etiket: "Düşük risk" },
  "Z5": { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", etiket: "Çok düşük risk" },
};

const TASKIN_RENK: Record<TaskinRiski, { bg: string; text: string; etiket: string }> = {
  "yuksek": { bg: "bg-blue-50 border-blue-200", text: "text-blue-700", etiket: "Yüksek taşkın riski" },
  "orta":   { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", etiket: "Orta taşkın riski" },
  "dusuk":  { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", etiket: "Düşük taşkın riski" },
};

export function RiskKarti({ ilAd }: Props) {
  if (!ilAd) return null;
  const ilNorm = normalizeYerAdi(ilAd);
  const deprem = depremRiskiGetir(ilNorm);
  const taskin = taskinRiskiGetir(ilNorm);

  if (!deprem && !taskin) return null;

  return (
    <div className="rounded-md border border-slate-200 bg-white p-2.5">
      <div className="mb-1.5 text-3xs font-semibold uppercase tracking-wide text-slate-600">
        Doğal Risk Değerlendirmesi
      </div>
      <div className="space-y-1.5">
        {deprem && (
          <div className={`rounded p-2 border ${DEPREM_RENK[deprem.zon].bg}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🌍</span>
                  <span className={`text-2xs font-semibold ${DEPREM_RENK[deprem.zon].text}`}>
                    Deprem: {deprem.zon} · {DEPREM_RENK[deprem.zon].etiket}
                  </span>
                </div>
                <div className="mt-0.5 text-3xs text-slate-600">
                  PGA: <strong>{deprem.pga.toFixed(2)}g</strong> (475-yıl)
                  {deprem.fay && ` · ${deprem.fay}`}
                </div>
                <div className="mt-0.5 text-3xs text-slate-500 italic">{deprem.not}</div>
              </div>
            </div>
          </div>
        )}
        {taskin && (
          <div className={`rounded p-2 border ${TASKIN_RENK[taskin.risk].bg}`}>
            <div className="flex items-start gap-1.5">
              <span className="text-sm">💧</span>
              <div className="flex-1">
                <div className={`text-2xs font-semibold ${TASKIN_RENK[taskin.risk].text}`}>
                  {TASKIN_RENK[taskin.risk].etiket}
                </div>
                <div className="mt-0.5 text-3xs text-slate-500 italic">{taskin.not}</div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="mt-1.5 text-[10px] text-slate-400 italic">
        Kaynak: AFAD Deprem Tehlike Haritası (2018) + Çevre Bakanlığı sel risk verileri.
        İl bazlı agregasyon — mahalle bazlı detay gelişiyor.
      </div>
    </div>
  );
}
