import { useEffect, useState } from "react";
import {
  Scale as ScaleIcon,
  TrendingDown as TrendingDownIcon,
  TrendingUp as TrendingUpIcon,
  Minus as MinusIcon,
  Sparkles as SparklesIcon,
} from "lucide-react";
import { fiyatTahminEt, fmtTL, type FiyatTahmini } from "../../lib/fiyat-tahmin";
import type { Parsel } from "../../types/tkgm";
import type { IlanBilgisi } from "../../types/ilan";

interface Props {
  parsel: Parsel;
  ilan: IlanBilgisi;
  /** Opsiyonel — daha önce hesaplanmış AI sonucu varsa */
  aiTahmin?: { altPerM2: number; beklenenPerM2: number; ustPerM2: number } | null;
}

export function IlanFiyatKarsilastirma({ parsel, ilan, aiTahmin }: Props) {
  const [tahmin, setTahmin] = useState<FiyatTahmini | null>(null);

  useEffect(() => {
    let iptal = false;
    fiyatTahminEt(parsel, null, null).then((t) => {
      if (!iptal) setTahmin(t);
    });
    return () => {
      iptal = true;
    };
  }, [parsel]);

  if (!ilan.fiyat || !ilan.m2 || ilan.m2 === 0) return null;

  const askingPerM2 = Math.round(ilan.fiyat / ilan.m2);
  const askingToplam = ilan.fiyat;

  if (!tahmin) return null;

  const heuristicPerM2 = tahmin.beklenenPerM2;
  const heuristicToplam = tahmin.toplamBeklenen;

  // Asking - Heuristic farkı (asking üzerinde % indirim olabilir)
  const heuristicFark = Math.round(
    ((askingPerM2 - heuristicPerM2) / askingPerM2) * 100,
  );
  // AI ile karşılaştırma (varsa)
  const aiFark = aiTahmin
    ? Math.round(((askingPerM2 - aiTahmin.beklenenPerM2) / askingPerM2) * 100)
    : null;

  // Pazarlık marjı (TL) — asking ile heuristic arası
  const pazarlikMarjiToplam = Math.max(0, askingToplam - heuristicToplam);

  // Yorum: pozitif fark = ilan pahalı, negatif = ilan ucuz (fırsat)
  const yorum = (() => {
    if (heuristicFark >= 25) {
      return {
        renk: "text-accent-danger",
        bg: "bg-red-50 dark:bg-red-950/30",
        border: "border-red-200 dark:border-red-800",
        icon: <TrendingUpIcon className="h-4 w-4" />,
        label: "İLAN PAHALI",
        not: "İlan, bizim tahminimizden %25+ üstünde. Pazarlık şart, yoksa atla.",
      };
    } else if (heuristicFark >= 10) {
      return {
        renk: "text-accent-warning",
        bg: "bg-amber-50 dark:bg-amber-950/30",
        border: "border-amber-200 dark:border-amber-800",
        icon: <TrendingUpIcon className="h-4 w-4" />,
        label: "İLAN ÜSTÜNDE",
        not: "İlan tahminimizden %10-25 üstünde. Normal pazarlık marjı.",
      };
    } else if (heuristicFark >= -10) {
      return {
        renk: "text-slate-600 dark:text-slate-300",
        bg: "bg-slate-50 dark:bg-slate-800",
        border: "border-slate-200 dark:border-slate-700",
        icon: <MinusIcon className="h-4 w-4" />,
        label: "FİYAT MAKUL",
        not: "İlan tahminimizle uyumlu. Pazarlığa açık olabilir.",
      };
    } else if (heuristicFark >= -25) {
      return {
        renk: "text-accent-success",
        bg: "bg-emerald-50 dark:bg-emerald-950/30",
        border: "border-emerald-200 dark:border-emerald-800",
        icon: <TrendingDownIcon className="h-4 w-4" />,
        label: "FIRSAT OLABİLİR",
        not: "İlan tahminimizden %10-25 altında. İncele, gizli kusur var mı kontrol et.",
      };
    } else {
      return {
        renk: "text-emerald-700 dark:text-emerald-400",
        bg: "bg-emerald-50 dark:bg-emerald-950/40",
        border: "border-emerald-300 dark:border-emerald-700",
        icon: <TrendingDownIcon className="h-4 w-4" />,
        label: "BÜYÜK FIRSAT (?) ",
        not: "İlan tahminimizden %25+ altında — ya çok büyük fırsat, ya da gizli risk (şerh, kamulaştırma, hatalı m²).",
      };
    }
  })();

  return (
    <div
      className={`overflow-hidden rounded-lg border-2 ${yorum.border} ${yorum.bg}`}
    >
      <div className="flex items-center gap-2 border-b border-slate-200/50 px-3 py-1.5 dark:border-slate-700/50">
        <ScaleIcon className={`h-3.5 w-3.5 ${yorum.renk}`} />
        <span className={`text-2xs font-semibold ${yorum.renk}`}>
          Fiyat Karşılaştırması
        </span>
        <span className={`ml-auto flex items-center gap-1 text-3xs font-bold uppercase ${yorum.renk}`}>
          {yorum.icon}
          {yorum.label}
        </span>
      </div>

      <div className="p-2">
        {/* 3 sütun karşılaştırma */}
        <div className="mb-2 grid grid-cols-3 gap-1.5">
          <KolonKarti
            label="İlan asking"
            tlPerM2={askingPerM2}
            toplam={askingToplam}
            altLabel="sahibinden"
            renk="text-accent-ilan"
          />
          <KolonKarti
            label="Heuristic"
            tlPerM2={heuristicPerM2}
            toplam={heuristicToplam}
            altLabel={`${tahmin.guven} güven`}
            renk={yorum.renk}
            yıldız={false}
          />
          {aiTahmin ? (
            <KolonKarti
              label="AI tahmin"
              tlPerM2={aiTahmin.beklenenPerM2}
              toplam={aiTahmin.beklenenPerM2 * parsel.alan}
              altLabel="Gemini/AI"
              renk="text-accent-ai"
              yıldız
            />
          ) : (
            <div className="rounded-md border-2 border-dashed border-slate-300 bg-white/40 p-2 text-center dark:border-slate-600 dark:bg-slate-900/40">
              <SparklesIcon className="mx-auto h-4 w-4 text-accent-ai" />
              <div className="text-3xs text-slate-500">
                AI'ı çalıştır
              </div>
            </div>
          )}
        </div>

        {/* Fark + pazarlık marjı */}
        <div className="space-y-1 rounded-md bg-white/60 p-2 dark:bg-slate-900/40">
          <KarsilastirmaSatir
            label="İlan vs Heuristic"
            yuzde={heuristicFark}
            tlMarji={pazarlikMarjiToplam}
          />
          {aiFark != null && aiTahmin && (
            <KarsilastirmaSatir
              label="İlan vs AI"
              yuzde={aiFark}
              tlMarji={Math.max(
                0,
                askingToplam - aiTahmin.beklenenPerM2 * parsel.alan,
              )}
            />
          )}
        </div>

        <p className={`mt-2 text-3xs italic ${yorum.renk}`}>
          {yorum.not}
        </p>
      </div>
    </div>
  );
}

function KolonKarti({
  label,
  tlPerM2,
  toplam,
  altLabel,
  renk,
  yıldız = false,
}: {
  label: string;
  tlPerM2: number;
  toplam: number;
  altLabel: string;
  renk: string;
  yıldız?: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-1.5 text-center dark:border-slate-700 dark:bg-slate-900">
      <div className="text-3xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`mt-0.5 text-xs font-bold tabular-nums ${renk}`}>
        {tlPerM2.toLocaleString("tr-TR")}
        {yıldız && <SparklesIcon className="ml-0.5 inline h-2.5 w-2.5" />}
      </div>
      <div className="text-3xs text-slate-500">TL/m²</div>
      <div className="mt-0.5 border-t border-slate-100 pt-0.5 text-3xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300">
        {fmtTL(toplam)}
      </div>
      <div className="text-[9px] italic text-slate-400">{altLabel}</div>
    </div>
  );
}

function KarsilastirmaSatir({
  label,
  yuzde,
  tlMarji,
}: {
  label: string;
  yuzde: number;
  tlMarji: number;
}) {
  const renk =
    yuzde >= 10
      ? "text-accent-warning"
      : yuzde >= -10
        ? "text-slate-600"
        : "text-accent-success";
  const yon =
    yuzde >= 10 ? "▲ üstünde" : yuzde >= -10 ? "≈ uyumlu" : "▼ altında";
  return (
    <div className="flex items-baseline justify-between gap-2 text-3xs">
      <span className="text-slate-600 dark:text-slate-400">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className={`font-bold tabular-nums ${renk}`}>
          {yon} %{Math.abs(yuzde)}
        </span>
        {tlMarji > 0 && (
          <span className="text-3xs text-slate-500">
            (~{fmtTL(tlMarji)} pazarlık)
          </span>
        )}
      </span>
    </div>
  );
}
