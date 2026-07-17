/**
 * Yatırım Skoru Kartı — Faz 3 Sprint E + Sprint G güncelleme.
 *
 * 1-100 gauge + 6 boyut breakdown + ROI/IRR/Cap Rate KPI'ları.
 *
 * Değişiklikler (Sprint G):
 *   - fiyat prop dışarıdan alınır (AnalizPanel'deki FiyatTahminKarti ile senkronize)
 *   - buyumeTrendi boyutu artık trendProjesyonGetir() gerçek OLS verisiyle besleniyor
 *   - IRR hesabında sabit %30 yerine gerçek trend yillikDegisimYuzde kullanılıyor
 *
 * Pro tier kapalı (yatırım analizi premium feature).
 */

import { useEffect, useMemo, useState } from "react";
import { TrendingUp as TrendingUpIcon } from "lucide-react";
import type { Parsel } from "../../types/tkgm";
import type { FiyatTahmini } from "../../lib/fiyat-tahmin";
import type { CevreAnalizi } from "../../lib/osm";
import type { EPlanImarVerisi } from "../../lib/eplan";
import {
  yatirimSkoruHesapla,
  type YatirimSkoru,
} from "../../lib/yatirim-skoru";
import { kiraTahminiHesapla } from "../../lib/kira-getirisi";
import { roiHesapla } from "../../lib/yatirim-roi";
import { trendProjesyonGetir } from "../../lib/fiyat-trendi";
import { Section } from "../ui/Card";
import { useLisans } from "../../lib/lisans";
import { PaywallKilit } from "./PaywallKilit";
import { AlSatKararMotoru } from "./AlSatKararMotoru";

interface Props {
  parsel: Parsel;
  /**
   * Dışarıdan geçirilen fiyat tahmini (FiyatTahminKarti'nın hesapladığı).
   * null → henüz hesaplanmadı, undefined → parent bu prop'u geçmedi.
   */
  fiyat?: FiyatTahmini | null;
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

export function YatirimSkoruKarti({ parsel, fiyat: fiyatProp, cevre, ePlan }: Props) {
  const lisans = useLisans();
  const acik = lisans.can("ai-fiyat"); // Yatırım analizi Bireysel Pro+

  // Gerçek OLS trend verisi — async fetch
  const [trendYillikDegisim, setTrendYillikDegisim] = useState<number | null>(null);

  useEffect(() => {
    if (!acik) return;
    if (!parsel.ilAd || !parsel.ilceAd || !parsel.mahalleAd) return;

    let iptal = false;
    trendProjesyonGetir(
      parsel.ilAd,
      parsel.ilceAd,
      parsel.mahalleAd,
      // Tarla/arsa tipine göre kategori
      /tarla|bahçe|bahce|zeytinlik|bağ\b|bag\b/i.test(parsel.nitelik) ? "tarla" : "arsa",
    )
      .then((sonuc) => {
        if (!iptal && sonuc) setTrendYillikDegisim(sonuc.yillikDegisimYuzde);
      })
      .catch(() => {}); // sessizce başarısız ol

    return () => { iptal = true; };
  }, [parsel.ilAd, parsel.ilceAd, parsel.mahalleAd, parsel.nitelik, acik]);

  const skor = useMemo<YatirimSkoru>(
    () => yatirimSkoruHesapla({
      parsel,
      fiyat: fiyatProp ?? null,
      cevre,
      ePlan,
      trendYillikDegisim,
    }),
    [parsel, fiyatProp, cevre, ePlan, trendYillikDegisim],
  );

  const kira = useMemo(() => kiraTahminiHesapla(parsel), [parsel]);
  const fiyatTutari = fiyatProp?.beklenenPerM2 != null && parsel.alan > 0
    ? fiyatProp.beklenenPerM2 * parsel.alan
    : null;

  const roi = useMemo(() => {
    if (fiyatTutari == null || fiyatTutari <= 0) return null;
    return roiHesapla({
      fiyat: fiyatTutari,
      yillikKira: kira?.yillikKira ?? null,
      // Gerçek trend varsa kullan, yoksa TCMB KFE varsayılan ~%30
      yillikDegerArtisYuzdesi: trendYillikDegisim != null
        ? Math.max(5, trendYillikDegisim) // en az %5 (negatif trendde floor)
        : 30,
    });
  }, [fiyatTutari, kira, trendYillikDegisim]);

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
              {/* Trend badge */}
              {trendYillikDegisim != null && (
                <div className="mt-1 text-2xs text-slate-600 dark:text-slate-400">
                  {trendYillikDegisim > 0 ? "📈" : "📉"} Yıllık {trendYillikDegisim > 0 ? "+" : ""}{trendYillikDegisim.toFixed(0)}% (nominal)
                </div>
              )}
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
              📊 Getiri Analizi
              {kira ? ` (kira: ₺${kira.aylikKira.toLocaleString("tr-TR")}/ay)` : ""}
              {trendYillikDegisim != null
                ? ` · değer artışı %${Math.max(5, trendYillikDegisim).toFixed(0)}/yıl`
                : " · değer artışı %30/yıl (varsayılan)"}
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
                Kira tahmini sadece konut için yapılır. IRR {trendYillikDegisim != null ? `%${Math.max(5, trendYillikDegisim).toFixed(0)} trend` : "%30 varsayılan"} değer artışıyla hesaplandı.
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

        {/* W4 — Al/Sat/Bekle Karar Motoru */}
        <div className="border-t border-slate-100 dark:border-slate-700 pt-2">
          <div className="text-2xs font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
            🎯 Yatırım Kararı
          </div>
          <AlSatKararMotoru
            skor={skor}
            fiyat={fiyatProp}
            trendYillikDegisim={trendYillikDegisim}
          />
        </div>
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
