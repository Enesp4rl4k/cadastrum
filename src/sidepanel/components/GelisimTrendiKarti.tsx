/**
 * Uydu gelişim trendi kartı — Wayback karelerinden built-up değişim skoru.
 */
import { useEffect, useState } from "react";
import {
  Satellite as SatelliteIcon,
  Loader2 as LoaderIcon,
  AlertCircle as AlertIcon,
  TrendingUp as TrendingUpIcon,
} from "lucide-react";
import type { Parsel } from "../../types/tkgm";
import {
  bboxFromKoordinatlar,
  gelisimTrendiAnaliz,
  gelisimSkorRenk,
  type GelisimTrendiSonuc,
} from "../../lib/gelisim-trendi";

interface Props {
  parsel: Parsel;
}

export function GelisimTrendiKarti({ parsel }: Props) {
  const [sonuc, setSonuc] = useState<GelisimTrendiSonuc | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const anahtar = `${parsel.adaNo}-${parsel.parselNo}-${parsel.mahalleKodu ?? ""}`;

  useEffect(() => {
    const bbox = bboxFromKoordinatlar(parsel.koordinatlar ?? []);
    if (!bbox) {
      setSonuc(null);
      setHata(null);
      return;
    }

    let iptal = false;
    setYukleniyor(true);
    setHata(null);
    setSonuc(null);

    void (async () => {
      try {
        const r = await gelisimTrendiAnaliz(bbox, async (url) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`Uydu ${res.status}`);
          return res.blob();
        });
        if (!iptal) setSonuc(r);
      } catch (e) {
        if (!iptal) {
          setHata(e instanceof Error ? e.message : "Uydu analizi başarısız");
        }
      } finally {
        if (!iptal) setYukleniyor(false);
      }
    })();

    return () => {
      iptal = true;
    };
  }, [anahtar, parsel.koordinatlar]);

  if (!(parsel.koordinatlar?.length && parsel.koordinatlar.length >= 3)) return null;

  const renk = sonuc ? gelisimSkorRenk(sonuc.skor) : "#64748b";

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-card dark:border-slate-700/60 dark:bg-slate-900">
      <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-slate-100 dark:border-slate-800">
        <SatelliteIcon className="h-3.5 w-3.5 text-sky-600" />
        <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
          Uydu gelişim trendi
        </h3>
        <span className="ml-auto text-[9px] text-slate-400">2014–2024</span>
      </div>

      <div className="px-3 py-2.5 space-y-2">
        {yukleniyor && (
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
            Yıllık uydu kareleri analiz ediliyor…
          </div>
        )}

        {hata && (
          <div className="flex items-start gap-1.5 text-[11px] text-amber-700">
            <AlertIcon className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>{hata}</span>
          </div>
        )}

        {sonuc && !yukleniyor && (
          <>
            <div className="flex items-center gap-3">
              <div
                className="flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center rounded-xl text-white"
                style={{ background: renk }}
              >
                <TrendingUpIcon className="h-3.5 w-3.5 opacity-80" />
                <span className="text-sm font-bold tabular-nums leading-none">
                  {sonuc.skor > 0 ? `+${sonuc.skor}` : sonuc.skor}
                </span>
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  {sonuc.etiket}
                </div>
                <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                  {sonuc.aciklama}
                </p>
              </div>
            </div>

            {/* Mini sparkline bars */}
            <div className="flex items-end gap-1.5 h-10 pt-1">
              {sonuc.yillar.map((y) => (
                <div key={y.yil} className="flex-1 flex flex-col items-center gap-0.5 justify-end">
                  <div
                    className="w-full rounded-sm bg-sky-500/80"
                    style={{ height: Math.max(4, Math.round(y.builtUp * 28)) }}
                    title={`${y.yil}: yapay yüzey ~${(y.builtUp * 100).toFixed(0)}%`}
                  />
                  <span className="text-[8px] text-slate-400 tabular-nums">{y.yil}</span>
                </div>
              ))}
            </div>
            <p className="text-[9px] text-slate-400 italic">
              Kaynak: Esri Wayback · görsel proxy (yatırım tavsiyesi değildir) · güven: {sonuc.guven}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
