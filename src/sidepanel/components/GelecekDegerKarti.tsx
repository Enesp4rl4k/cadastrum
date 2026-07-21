/**
 * AI gelecek değer skoru — 3/5/10y band + bileşen kırılımı.
 */
import { useEffect, useMemo, useState } from "react";
import { Sparkles as SparklesIcon, Loader2 as LoaderIcon } from "lucide-react";
import type { Parsel } from "../../types/tkgm";
import type { FiyatTahmini } from "../../lib/fiyat-tahmin";
import type { EPlanImarVerisi } from "../../lib/eplan";
import { yatirimSkoruHesapla } from "../../lib/yatirim-skoru";
import {
  gelecekDegerHesapla,
  gelecekSkorRenk,
  type GelecekDegerSonuc,
} from "../../lib/gelecek-deger-skoru";
import {
  bboxFromKoordinatlar,
  gelisimTrendiAnaliz,
} from "../../lib/gelisim-trendi";
import { trendProjesyonGetir } from "../../lib/fiyat-trendi";
import type { CevreAnalizi } from "../../lib/osm";
import { Section } from "../ui/Card";

interface Props {
  parsel: Parsel;
  fiyat?: FiyatTahmini | null;
  cevre: CevreAnalizi | null;
  ePlan: EPlanImarVerisi | null;
}

function fmt(n: number): string {
  return n.toLocaleString("tr-TR");
}

export function GelecekDegerKarti({ parsel, fiyat, cevre, ePlan }: Props) {
  const [trendYillik, setTrendYillik] = useState<number | null>(null);
  const [gelisimSkoru, setGelisimSkoru] = useState<number | null>(null);
  const [gelisimYukleniyor, setGelisimYukleniyor] = useState(false);

  useEffect(() => {
    if (!parsel.ilAd || !parsel.ilceAd || !parsel.mahalleAd) return;
    let iptal = false;
    trendProjesyonGetir(
      parsel.ilAd,
      parsel.ilceAd,
      parsel.mahalleAd,
      /tarla|bahçe|bahce|zeytinlik|bağ\b|bag\b/i.test(parsel.nitelik) ? "tarla" : "arsa",
    )
      .then((s) => {
        if (!iptal && s) setTrendYillik(s.yillikDegisimYuzde);
      })
      .catch(() => {});
    return () => {
      iptal = true;
    };
  }, [parsel.ilAd, parsel.ilceAd, parsel.mahalleAd, parsel.nitelik]);

  useEffect(() => {
    const bbox = bboxFromKoordinatlar(parsel.koordinatlar ?? []);
    if (!bbox) {
      setGelisimSkoru(null);
      return;
    }
    let iptal = false;
    setGelisimYukleniyor(true);
    void gelisimTrendiAnaliz(bbox, async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      return res.blob();
    })
      .then((r) => {
        if (!iptal) setGelisimSkoru(r.skor);
      })
      .catch(() => {
        if (!iptal) setGelisimSkoru(null);
      })
      .finally(() => {
        if (!iptal) setGelisimYukleniyor(false);
      });
    return () => {
      iptal = true;
    };
  }, [parsel.koordinatlar, parsel.adaNo, parsel.parselNo]);

  const yatirim = useMemo(
    () =>
      yatirimSkoruHesapla({
        parsel,
        fiyat: fiyat ?? null,
        cevre,
        ePlan,
        trendYillikDegisim: trendYillik,
      }),
    [parsel, fiyat, cevre, ePlan, trendYillik],
  );

  const sonuc: GelecekDegerSonuc = useMemo(
    () =>
      gelecekDegerHesapla({
        bugunTlm2: fiyat?.beklenenPerM2 ?? null,
        parselM2: parsel.alan > 0 ? parsel.alan : null,
        trendYillikDegisimYuzde: trendYillik,
        gelisimSkoru,
        yatirimSkoru: yatirim.toplam,
        emsal: ePlan?.emsal ?? null,
        taks: ePlan?.taks ?? null,
        imarTipi: ePlan?.kullanimKarari ?? undefined,
        guvenSkoru: fiyat?.guvenSkoru ?? undefined,
      }),
    [fiyat, parsel.alan, trendYillik, gelisimSkoru, yatirim.toplam, ePlan],
  );

  const renk = gelecekSkorRenk(sonuc.skor);

  return (
    <Section
      title="AI gelecek değer"
      icon={<SparklesIcon className="h-3.5 w-3.5" />}
      accent="ai"
    >
      <div className="space-y-2 p-2">
        <div className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/50">
          <div
            className="flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center rounded-xl text-white"
            style={{ background: renk }}
          >
            <span className="text-lg font-bold tabular-nums leading-none">{sonuc.skor}</span>
            <span className="text-[8px] opacity-80">/100</span>
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
              {sonuc.etiket}
            </div>
            <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
              {sonuc.yorum}
            </p>
            {gelisimYukleniyor && (
              <div className="mt-1 flex items-center gap-1 text-[9px] text-slate-400">
                <LoaderIcon className="h-3 w-3 animate-spin" />
                Uydu sinyali ekleniyor…
              </div>
            )}
          </div>
        </div>

        {/* Ufuklar */}
        <div className="grid grid-cols-3 gap-1.5">
          {sonuc.ufuklar.map((u) => (
            <div
              key={u.yil}
              className="rounded border border-slate-200 bg-white px-1.5 py-1.5 text-center dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="text-[8px] font-semibold uppercase tracking-wider text-slate-400">
                +{u.yil} yıl
              </div>
              <div className="mt-0.5 text-[11px] font-bold tabular-nums text-slate-800 dark:text-slate-100">
                {u.tlm2 != null ? fmt(u.tlm2) : "—"}
              </div>
              <div className="text-[8px] text-slate-400">₺/m² · ×{u.carpan}</div>
              {u.bandAlt != null && u.bandUst != null && (
                <div className="mt-0.5 text-[8px] tabular-nums text-slate-400">
                  {fmt(u.bandAlt)}–{fmt(u.bandUst)}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="text-[9px] text-slate-500">
          Nominal ~%{sonuc.yillikNominalBeklentiYuzde}/yıl
          <span className="text-slate-400">
            {" "}
            · reel ~%{sonuc.yillikReelBeklentiYuzde}/yıl (enflasyon varsayımı %35)
          </span>
        </div>

        {/* Bileşenler */}
        <div className="space-y-1">
          {sonuc.bilesenler.map((b) => (
            <div key={b.id} className="flex items-center gap-2 text-2xs">
              <div className="w-24 truncate text-slate-700 dark:text-slate-300">{b.ad}</div>
              <div className="h-2 flex-1 overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
                <div
                  className={
                    b.puan / b.max >= 0.7
                      ? "h-full bg-emerald-500"
                      : b.puan / b.max >= 0.45
                        ? "h-full bg-amber-500"
                        : "h-full bg-red-500"
                  }
                  style={{ width: `${(b.puan / b.max) * 100}%` }}
                />
              </div>
              <div className="w-10 text-right tabular-nums font-semibold">
                {b.puan}/{b.max}
              </div>
            </div>
          ))}
        </div>

        <details className="text-3xs text-slate-600 dark:text-slate-400">
          <summary className="cursor-pointer">Bileşen notları</summary>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {sonuc.bilesenler.map((b) => (
              <li key={b.id}>
                <strong>{b.ad}:</strong> {b.not}
              </li>
            ))}
          </ul>
        </details>

        <p className="text-[9px] leading-snug text-slate-400 italic">{sonuc.disclaimer}</p>
      </div>
    </Section>
  );
}
