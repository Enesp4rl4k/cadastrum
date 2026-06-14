/**
 * Yatırım Skoru Kartı — Faz 3 Sprint E.
 *
 * 1-100 gauge + 6 boyut breakdown + ROI/IRR/Cap Rate KPI'ları.
 *
 * Pro tier kapalı (yatırım analizi premium feature).
 */

import { useEffect, useMemo, useState } from "react";
import { TrendingUp as TrendingUpIcon } from "lucide-react";
import type { Parsel } from "../../types/tkgm";
import { fiyatTahminEt, type FiyatTahmini } from "../../lib/fiyat-tahmin";
import type { CevreAnalizi } from "../../lib/osm";
import type { EPlanImarVerisi } from "../../lib/eplan";
import {
  yatirimSkoruHesapla,
  type YatirimSkoru,
} from "../../lib/yatirim-skoru";
import { kiraTahminiHesapla } from "../../lib/kira-getirisi";
import { roiHesapla } from "../../lib/yatirim-roi";
import { Section } from "../ui/Card";
import { useLisans } from "../../lib/lisans";
import { PaywallKilit } from "./PaywallKilit";

interface Props {
  parsel: Parsel;
  cevre: CevreAnalizi | null;
  ePlan: EPlanImarVerisi | null;
}

function seviyeRenk(seviye: YatirimSkoru["seviye"]): {
  bg: string; border: string; text: string; etiket: string;
} {
  switch (seviye) {
    case "mukemmel":
      return { bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-900", etiket: "Mükemmel" };
    case "iyi":
      return { bg: "bg-green-50", border: "border-green-300", text: "text-green-900", etiket: "İyi" };
    case "orta":
      return { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-900", etiket: "Orta" };
    case "zayif":
      return { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-900", etiket: "Zayıf" };
    case "riskli":
      return { bg: "bg-red-50", border: "border-red-300", text: "text-red-900", etiket: "Riskli" };
  }
}

export function YatirimSkoruKarti({ parsel, cevre, ePlan }: Props) {
  const lisans = useLisans();
  const acik = lisans.can("ai-fiyat"); // Yatırım analizi Bireysel Pro+

  // Kendi fiyat tahminini hesapla — FiyatTahminKarti parent'a yaymıyor
  const [fiyat, setFiyat] = useState<FiyatTahmini | null>(null);
  useEffect(() => {
    if (!acik) return;
    let iptal = false;
    fiyatTahminEt(parsel, cevre, null, ePlan)
      .then((f) => { if (!iptal) setFiyat(f); })
      .catch(() => {});
    return () => { iptal = true; };
  }, [parsel, cevre, ePlan, acik]);

  const skor = useMemo<YatirimSkoru>(
    () => yatirimSkoruHesapla({ parsel, fiyat, cevre, ePlan }),
    [parsel, fiyat, cevre, ePlan],
  );

  const kira = useMemo(() => kiraTahminiHesapla(parsel), [parsel]);
  const fiyatTutari = fiyat?.beklenenPerM2 != null && parsel.alan > 0
    ? fiyat.beklenenPerM2 * parsel.alan
    : null;
  const roi = useMemo(() => {
    if (fiyatTutari == null || fiyatTutari <= 0) return null;
    return roiHesapla({
      fiyat: fiyatTutari,
      yillikKira: kira?.yillikKira ?? null,
    });
  }, [fiyatTutari, kira]);

  if (!acik) {
    return (
      <Section
        title="Yatırım Skoru"
        icon={<TrendingUpIcon className="h-3.5 w-3.5" />}
        accent="ai"
      >
        <PaywallKilit
          gerekliTier={lisans.yukseltGerekli("ai-fiyat") ?? "bireysel-pro"}
          ozellik="📈 Yatırım Skoru + ROI / IRR / Cap Rate"
          kompakt
        />
      </Section>
    );
  }

  const r = seviyeRenk(skor.seviye);

  return (
    <Section
      title="Yatırım Skoru"
      icon={<TrendingUpIcon className="h-3.5 w-3.5" />}
      accent="ai"
    >
      <div className="space-y-2 p-2">
        {/* Toplam skor — büyük gauge */}
        <div className={`rounded-md border-2 ${r.border} ${r.bg} p-3`}>
          <div className="flex items-center justify-between">
            <div>
              <div className={`text-xs font-semibold ${r.text} uppercase tracking-wider`}>
                {r.etiket}
              </div>
              <div className={`text-3xl font-bold tabular-nums ${r.text} mt-1`}>
                {skor.toplam}
                <span className="text-base font-normal opacity-60">/100</span>
              </div>
            </div>
            <div className="text-right text-2xs text-slate-600 max-w-[180px]">
              {skor.ozet}
            </div>
          </div>
        </div>

        {/* 6 boyut breakdown — text bar */}
        <div className="space-y-1">
          {skor.boyutlar.map((b) => (
            <div key={b.ad} className="flex items-center gap-2 text-2xs">
              <div className="w-24 truncate text-slate-700 dark:text-slate-300">{b.ad}</div>
              <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-800 rounded overflow-hidden">
                <div
                  className={
                    b.skor >= 70
                      ? "bg-emerald-500 h-full"
                      : b.skor >= 45
                        ? "bg-amber-500 h-full"
                        : "bg-red-500 h-full"
                  }
                  style={{ width: `${b.skor}%` }}
                />
              </div>
              <div className="w-8 text-right tabular-nums font-semibold">{b.skor}</div>
            </div>
          ))}
        </div>

        {/* ROI/IRR KPI'lar — sadece konut + fiyat hesaplandıysa */}
        {roi != null && (kira || roi.irr10y != null) && (
          <div className="rounded border border-slate-200 bg-slate-50 dark:bg-slate-900 dark:border-slate-700 p-2 space-y-1">
            <div className="text-2xs font-semibold text-slate-700 dark:text-slate-300">
              📊 Getiri Analizi {kira ? `(kira: ₺${kira.aylikKira.toLocaleString("tr-TR")}/ay)` : ""}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {roi.brutKiraGetirisi != null && (
                <KpiBox label="Brüt Getiri" value={`%${roi.brutKiraGetirisi}`} />
              )}
              {roi.capRate != null && (
                <KpiBox label="Cap Rate" value={`%${roi.capRate}`} />
              )}
              {roi.irr10y != null && (
                <KpiBox label="10y IRR" value={`%${roi.irr10y}`} />
              )}
            </div>
            {roi.brutKiraGetirisi == null && (
              <p className="text-3xs italic text-slate-500">
                Kira tahmini sadece konut için yapılır. IRR varsayılan %30/yıl değer artışı.
              </p>
            )}
          </div>
        )}

        {/* Boyut açıklamaları (expandable hint) */}
        <details className="text-3xs text-slate-600 dark:text-slate-400">
          <summary className="cursor-pointer hover:text-slate-900 dark:hover:text-slate-200">
            Boyut açıklamaları
          </summary>
          <ul className="mt-1 space-y-0.5 list-disc list-inside">
            {skor.boyutlar.map((b) => (
              <li key={b.ad}>
                <strong>{b.ad}:</strong> {b.aciklama}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </Section>
  );
}

function KpiBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-white/80 dark:bg-slate-800 px-1.5 py-1">
      <div className="text-[8px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold leading-none mb-0.5">
        {label}
      </div>
      <div className="text-2xs font-bold tabular-nums text-ink dark:text-slate-100 leading-none">
        {value}
      </div>
    </div>
  );
}
