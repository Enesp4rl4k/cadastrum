/**
 * Tek bakış özeti — parsel seçilince karar sinyalleri.
 * Ada/parsel · imar · TL/m² · yatırım skoru · güven · risk
 */

import { useMemo, type ReactNode } from "react";
import {
  MapPin as PinIcon,
  Landmark as ImarIcon,
  Wallet as WalletIcon,
  AlertTriangle as RiskIcon,
  TrendingUp as SkorIcon,
  ShieldCheck as GuvenIcon,
} from "lucide-react";
import type { Parsel } from "../../types/tkgm";
import type { EPlanImarVerisi } from "../../lib/eplan";
import type { TucbsCdpSonuc } from "../../lib/tucbs";
import type { FiyatTahmini } from "../../lib/fiyat-tahmin";
import { fmtTL, fmtTLM2 } from "../../lib/fiyat-tahmin";
import type { CevreAnalizi } from "../../lib/osm";
import { riskleriTara } from "../../lib/risk-uyarilari";
import { ePlanOzet } from "../../lib/eplan";
import { yatirimSkoruHesapla } from "../../lib/yatirim-skoru";

interface Props {
  parsel: Parsel;
  ePlan: EPlanImarVerisi | null;
  tucbs?: TucbsCdpSonuc | null;
  fiyat: FiyatTahmini | null;
  cevre?: CevreAnalizi | null;
  ePlanLoading?: boolean;
  fiyatLoading?: boolean;
}

const RISK_RENK: Record<string, string> = {
  kritik: "text-red-700 bg-red-50 border-red-200",
  yuksek: "text-amber-800 bg-amber-50 border-amber-200",
  orta: "text-slate-700 bg-slate-50 border-slate-200",
  bilgi: "text-slate-600 bg-slate-50 border-slate-200",
};

const SEVIYE_ETIKET: Record<string, string> = {
  mukemmel: "Mükemmel",
  iyi: "İyi",
  orta: "Orta",
  zayif: "Zayıf",
  riskli: "Riskli",
};

function skorRenk(toplam: number): string {
  if (toplam >= 80) return "text-emerald-800 bg-emerald-50 border-emerald-200";
  if (toplam >= 65) return "text-green-800 bg-green-50 border-green-200";
  if (toplam >= 45) return "text-amber-900 bg-amber-50 border-amber-200";
  if (toplam >= 30) return "text-orange-900 bg-orange-50 border-orange-200";
  return "text-red-800 bg-red-50 border-red-200";
}

export function TekBakisOzeti({
  parsel,
  ePlan,
  tucbs,
  fiyat,
  cevre = null,
  ePlanLoading,
  fiyatLoading,
}: Props) {
  const riskler = useMemo(
    () => riskleriTara({ parsel, ePlan, tucbs }),
    [parsel, ePlan, tucbs],
  );

  const yatirim = useMemo(
    () =>
      yatirimSkoruHesapla({
        parsel,
        fiyat,
        cevre,
        ePlan,
      }),
    [parsel, fiyat, cevre, ePlan],
  );

  const topRisk =
    riskler.find((r) => r.seviye === "kritik") ??
    riskler.find((r) => r.seviye === "yuksek") ??
    riskler[0] ??
    null;

  const adaParsel =
    parsel.adaNo != null && parsel.parselNo != null
      ? `Ada ${parsel.adaNo} / Parsel ${parsel.parselNo}`
      : "Ada/parsel bekleniyor";

  const konum = [parsel.mahalleAd, parsel.ilceAd, parsel.ilAd]
    .filter(Boolean)
    .join(" · ");

  const imarMetin = ePlanLoading
    ? "İmar sorgulanıyor…"
    : ePlan
      ? ePlanOzet(ePlan) || ePlan.kullanimKarari || "e-Plan kaydı var"
      : tucbs?.araziKullanimi
        ? `ÇDP: ${tucbs.araziKullanimi.renkEtiket}`
        : parsel.nitelik
          ? `TKGM: ${parsel.nitelik}`
          : "İmar henüz yok — manuel gir";

  const fiyatMetin = fiyatLoading
    ? "Fiyat hesaplanıyor…"
    : fiyat
      ? `${fmtTLM2(fiyat.altPerM2)} – ${fmtTLM2(fiyat.ustPerM2)}`
      : "Fiyat için imar veya devam et";

  const beklenenMetin =
    fiyat && fiyat.beklenenPerM2 > 0
      ? parsel.alan > 0
        ? `Medyan ${fmtTLM2(fiyat.beklenenPerM2)} · ~${fmtTL(Math.round(fiyat.beklenenPerM2 * parsel.alan))}`
        : `Medyan ${fmtTLM2(fiyat.beklenenPerM2)}`
      : null;

  const guvenMetin = fiyat
    ? `Güven ${Math.round(fiyat.guvenSkoru)}/100 · ${fiyat.guven}`
    : fiyatLoading
      ? "Güven hesaplanıyor…"
      : "Güven — fiyat bekleniyor";

  const skorMetin = fiyatLoading && !fiyat
    ? "Skor fiyatla birlikte gelir"
    : `${yatirim.toplam}/100 · ${SEVIYE_ETIKET[yatirim.seviye] ?? yatirim.seviye}`;

  const riskSinif = topRisk
    ? RISK_RENK[topRisk.seviye] ?? RISK_RENK.bilgi
    : "text-emerald-800 bg-emerald-50 border-emerald-200";

  return (
    <div className="rounded-lg border border-imperial/15 bg-gradient-to-br from-white to-slate-50 p-2.5 shadow-sm dark:from-slate-900 dark:to-slate-800 dark:border-slate-700">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-imperial-600 dark:text-champagne-400">
          Tek bakış
        </span>
        <span className="truncate text-[10px] text-slate-500">{konum}</span>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        <Satir
          icon={<PinIcon className="h-3 w-3" />}
          etiket="Parsel"
          deger={adaParsel}
        />
        <Satir
          icon={<ImarIcon className="h-3 w-3" />}
          etiket="İmar"
          deger={imarMetin}
        />
        <Satir
          icon={<WalletIcon className="h-3 w-3" />}
          etiket="TL/m²"
          deger={beklenenMetin ? `${fiyatMetin} · ${beklenenMetin}` : fiyatMetin}
          vurgu={!!fiyat}
        />
        <div
          className={`flex items-start gap-2 rounded-md border px-2 py-1.5 ${skorRenk(yatirim.toplam)}`}
        >
          <SkorIcon className="mt-0.5 h-3 w-3 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                Yatırım skoru
              </div>
              <div className="text-sm font-bold tabular-nums leading-none">
                {yatirim.toplam}
                <span className="text-[10px] font-normal opacity-70">/100</span>
              </div>
            </div>
            <div className="text-2xs font-medium leading-snug mt-0.5" title={yatirim.ozet}>
              {skorMetin}
            </div>
          </div>
        </div>
        <Satir
          icon={<GuvenIcon className="h-3 w-3" />}
          etiket="Veri güveni"
          deger={guvenMetin}
          vurgu={!!fiyat && fiyat.guvenSkoru >= 60}
        />
        <div
          className={`flex items-start gap-2 rounded-md border px-2 py-1.5 ${riskSinif}`}
        >
          <RiskIcon className="mt-0.5 h-3 w-3 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
              Risk
            </div>
            <div className="text-2xs font-medium leading-snug">
              {topRisk ? topRisk.baslik : "Kritik kısıt sinyali yok"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Satir({
  icon,
  etiket,
  deger,
  vurgu,
}: {
  icon: ReactNode;
  etiket: string;
  deger: string;
  vurgu?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-slate-100 bg-white/80 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900/50">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {etiket}
        </div>
        <div
          className={`truncate text-2xs leading-snug ${
            vurgu ? "font-semibold text-imperial-700 dark:text-champagne-300" : "text-slate-800 dark:text-slate-200"
          }`}
          title={deger}
        >
          {deger}
        </div>
      </div>
    </div>
  );
}
