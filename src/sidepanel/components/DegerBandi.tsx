import { useEffect, useRef, useState } from "react";
import type { FiyatTahmini } from "../../lib/fiyat-tahmin";

/**
 * Animasyonlu Değer & Güven bandı.
 *
 * Dürüst belirsizliği GÖRSELLEŞTİRİR: bant, sabit bir referans ölçekte (±%60) çizilir,
 * böylece güven düşük → alt/üst aralığı geniş → bant görünür şekilde genişler ("manuel
 * doğrula" rozeti). Yüksek güven → dar + yeşil. Değer sayarak yükselir.
 *
 * Kendine yeten: sadece `FiyatTahmini` tüketir, TÜCBS/başka bileşene dokunmaz.
 */

/** Bandın çizileceği sabit referans yarı-genişliği (dürüst maksimum). */
const REF_YARI = 0.6;

export type BandSeviye = "yuksek" | "orta" | "dusuk";

export interface BandGeometri {
  /** fill'in soldan boşluğu (%) */
  fillLeft: number;
  /** fill'in sağdan boşluğu (%) */
  fillRight: number;
  /** beklenen işaretinin konumu (%) */
  markLeft: number;
  seviye: BandSeviye;
  /** 0-5 dolu güven segmenti */
  segmentAdet: number;
}

/** Saf geometri — test edilebilir. */
export function degerBandiGeometri(
  fiyat: Pick<FiyatTahmini, "altPerM2" | "beklenenPerM2" | "ustPerM2" | "guvenSkoru">,
): BandGeometri {
  const bek = fiyat.beklenenPerM2 || 1;
  const min = bek * (1 - REF_YARI);
  const max = bek * (1 + REF_YARI);
  const rng = max - min || 1;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / rng) * 100));
  const g = fiyat.guvenSkoru;
  const seviye: BandSeviye = g >= 65 ? "yuksek" : g >= 45 ? "orta" : "dusuk";
  return {
    fillLeft: pct(fiyat.altPerM2),
    fillRight: 100 - pct(fiyat.ustPerM2),
    markLeft: pct(bek),
    seviye,
    segmentAdet: Math.max(0, Math.min(5, Math.round(g / 20))),
  };
}

const RENK: Record<BandSeviye, { fill: string; mark: string; seg: string; pill: string; not: string }> = {
  yuksek: {
    fill: "bg-emerald-500/30", mark: "bg-emerald-500", seg: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700 border-emerald-200",
    not: "text-slate-600",
  },
  orta: {
    fill: "bg-amber-500/25", mark: "bg-amber-500", seg: "bg-amber-500",
    pill: "bg-amber-50 text-amber-700 border-amber-200",
    not: "text-slate-600",
  },
  dusuk: {
    fill: "bg-amber-500/25", mark: "bg-amber-500", seg: "bg-amber-500",
    pill: "bg-amber-50 text-amber-800 border-amber-300",
    not: "text-amber-700",
  },
};

const SEVIYE_ETIKET: Record<BandSeviye, string> = {
  yuksek: "Güçlü emsal",
  orta: "Orta güven",
  dusuk: "Zayıf veri · manuel doğrula",
};

function useCountUp(target: number, ms = 900): number {
  const [v, setV] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const from = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min((t - t0) / ms, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setV(from + (target - from) * e);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, ms]);
  return v;
}

const tl = (n: number) => "₺" + Math.round(n).toLocaleString("tr-TR");
const tlKisa = (n: number) =>
  n >= 1_000_000 ? "₺" + (n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2).replace(".", ",") + "M"
  : n >= 1_000 ? "₺" + Math.round(n / 1000) + "K" : "₺" + Math.round(n);

export function DegerBandi({ fiyat }: { fiyat: FiyatTahmini }) {
  const geo = degerBandiGeometri(fiyat);
  const renk = RENK[geo.seviye];
  const deger = useCountUp(fiyat.toplamBeklenen);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-3xs font-semibold uppercase tracking-wide text-slate-400">
            Tahmini piyasa değeri
          </div>
          <div className="mt-0.5 text-2xl font-extrabold tabular-nums tracking-tight text-slate-900">
            {tl(deger)}
          </div>
          <div className="text-[11px] text-slate-500">
            {fiyat.beklenenPerM2.toLocaleString("tr-TR")} ₺/m² · güven {fiyat.guvenSkoru}/100
          </div>
        </div>
        <span className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${renk.pill}`}>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
          {SEVIYE_ETIKET[geo.seviye]}
        </span>
      </div>

      {/* Dürüst belirsizlik bandı */}
      <div className="mt-3.5">
        <div className="relative h-3 overflow-visible rounded-lg bg-slate-100">
          <div
            className={`absolute inset-y-0 rounded-lg transition-all duration-700 ease-out ${renk.fill}`}
            style={{ left: `${geo.fillLeft}%`, right: `${geo.fillRight}%` }}
          />
          <div
            className={`absolute -top-1 h-5 w-1 -translate-x-1/2 rounded transition-all duration-700 ease-out ${renk.mark}`}
            style={{ left: `${geo.markLeft}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-slate-400">
          <span>{tlKisa(fiyat.toplamAlt)}</span>
          <span className="font-semibold text-slate-700">beklenen</span>
          <span>{tlKisa(fiyat.toplamUst)}</span>
        </div>
      </div>

      {/* Güven metre */}
      <div className="mt-3 flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${i < geo.segmentAdet ? renk.seg : "bg-slate-100"}`}
          />
        ))}
      </div>

      {geo.seviye === "dusuk" && (
        <p className={`mt-2.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug ${renk.not}`}>
          Bant geniş — veri sınırlı. Bu bir <b>dürüst belirsizlik</b> işareti; yatırım kararı öncesi
          manuel emsal/ekspertiz ile doğrulayın.
        </p>
      )}
    </div>
  );
}
