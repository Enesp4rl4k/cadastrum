import { useMemo, useState } from "react";
import {
  AlertTriangle as AlertTriIcon,
  ShieldAlert as ShieldIcon,
  ChevronDown as ChevronDownIcon,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";
import type { Parsel } from "../../types/tkgm";
import type { EPlanImarVerisi } from "../../lib/eplan";
import {
  riskleriTara,
  riskOzetSkoru,
  riskRengi,
} from "../../lib/risk-uyarilari";
import { Section } from "../ui/Card";

interface Props {
  parsel: Parsel;
  ePlan?: EPlanImarVerisi | null;
  ilanAciklama?: string | null;
  ilanImarDurumu?: string | null;
}

export function RiskUyariKarti({ parsel, ePlan, ilanAciklama, ilanImarDurumu }: Props) {
  const uyarilar = useMemo(
    () => riskleriTara({ parsel, ePlan, ilanAciklama, ilanImarDurumu }),
    [parsel, ePlan, ilanAciklama, ilanImarDurumu],
  );
  const ozet = useMemo(() => riskOzetSkoru(uyarilar), [uyarilar]);
  const [acik, setAcik] = useState(uyarilar.some((u) => u.seviye === "kritik"));

  if (uyarilar.length === 0) {
    return (
      <Section
        title="Risk Taraması"
        icon={<ShieldIcon className="h-3.5 w-3.5" />}
        accent="success"
        subtitle={
          <span className="inline-flex items-center gap-1 text-emerald-700">
            ✓ Bilinen risk tespit edilmedi
          </span>
        }
      >
        <div className="text-3xs italic text-slate-500">
          Parsel niteliği, e-Plan kaydı ve ilan açıklamasında risk sinyali bulunmadı.
          Her halükarda yatırım öncesi yazılı imar durumu belgesi almanızı öneririz.
        </div>
      </Section>
    );
  }

  const accent: "danger" | "warning" | "info" =
    ozet.renk === "red"
      ? "danger"
      : ozet.renk === "orange" || ozet.renk === "amber"
        ? "warning"
        : "info";

  return (
    <Section
      title="Risk Taraması"
      icon={<ShieldIcon className="h-3.5 w-3.5" />}
      accent={accent}
      subtitle={
        <span
          className={`inline-flex items-center gap-1 font-medium ${
            ozet.renk === "red"
              ? "text-red-700"
              : ozet.renk === "orange"
                ? "text-orange-700"
                : ozet.renk === "amber"
                  ? "text-amber-700"
                  : "text-emerald-700"
          }`}
        >
          {ozet.etiket} · {ozet.toplam} uyarı
        </span>
      }
    >
      <div className="space-y-2">
        {/* Özet badge'leri */}
        <div className="flex flex-wrap gap-1.5">
          {ozet.kritikSayi > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-3xs font-semibold text-red-800">
              <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
              {ozet.kritikSayi} kritik
            </span>
          )}
          {ozet.yuksekSayi > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-3xs font-semibold text-amber-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
              {ozet.yuksekSayi} yüksek
            </span>
          )}
          {ozet.ortaSayi > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-3xs font-medium text-sky-800">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-600" />
              {ozet.ortaSayi} orta
            </span>
          )}
          {ozet.bilgiSayi > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-3xs text-slate-700">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
              {ozet.bilgiSayi} bilgi
            </span>
          )}
        </div>

        {/* Uyarı detayları toggle */}
        <button
          type="button"
          onClick={() => setAcik((v) => !v)}
          className="flex w-full cursor-pointer items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1.5 text-2xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
        >
          <span>{acik ? "Detayları gizle" : `${uyarilar.length} uyarıyı göster`}</span>
          {acik ? (
            <ChevronDownIcon className="h-3.5 w-3.5" />
          ) : (
            <ChevronRightIcon className="h-3.5 w-3.5" />
          )}
        </button>

        {acik && (
          <div className="space-y-1.5">
            {uyarilar.map((u, i) => {
              const r = riskRengi(u.seviye);
              return (
                <div
                  key={`${u.kod}-${i}`}
                  className={`rounded-md border ${r.border} ${r.bg} px-2.5 py-2 text-3xs ${r.text}`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full ${r.iconBg} text-white`}
                    >
                      <AlertTriIcon className="h-2.5 w-2.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold leading-snug">{u.baslik}</span>
                        <span className="flex-shrink-0 text-[9px] uppercase tracking-wider opacity-60">
                          {u.seviye}
                        </span>
                      </div>
                      <p className="mt-0.5 leading-snug opacity-90">{u.aciklama}</p>
                      {u.oneri && (
                        <p className="mt-1 italic leading-snug opacity-80">
                          → {u.oneri}
                        </p>
                      )}
                      {u.yasaRef && (
                        <p className="mt-1 text-[9px] font-mono opacity-50">
                          {u.yasaRef}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <p className="text-3xs italic text-slate-500 pt-1">
              ⚠ Bu uyarılar otomatik tespit edilmiştir; yatırım kararı öncesi mutlaka
              hukukçu, mali müşavir ve gayrimenkul danışmanından yazılı görüş alın.
            </p>
          </div>
        )}
      </div>
    </Section>
  );
}
