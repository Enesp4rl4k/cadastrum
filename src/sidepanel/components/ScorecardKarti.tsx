/**
 * AI Arazi Uygunluk Scorecard Kartı
 *
 * 5 boyutlu uygunluk analizi — her boyut için progress bar + gerekçe.
 * Backend /v1/ai-scorecard/analiz endpoint'ini çağırır.
 *
 * Gösterim:
 *   - Genel skor → büyük daire gauge
 *   - 5 boyut → yatay progress bar (kırmızı/sarı/yeşil)
 *   - Gerekçe → açılır <details>
 *   - Kalan kota badge (günlük)
 */

import { useEffect, useState } from "react";
import {
  Sparkles as SparklesIcon,
  Loader2 as LoaderIcon,
  AlertCircle as AlertIcon,
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
} from "lucide-react";
import {
  scorecardTalep,
  type ScorecardParselVeri,
  type ScorecardTalepSonuc,
  SCORECARD_BOYUTLAR,
  puanRenk,
  puanEtiket,
} from "../../lib/ai-scorecard";
import type { Parsel } from "../../types/tkgm";
import type { EgimAnalizi } from "../../lib/elevation";

interface Props {
  parsel: Parsel;
  egim?: EgimAnalizi | null;
  depremPga?: number | null;
  taskinRisk?: string | null;
  otoyolKm?: number | null;
  osbKm?: number | null;
  havalimanKm?: number | null;
  limanKm?: number | null;
  serbestBolgeKm?: number | null;
  lisansliDepoKm?: number | null;
  elektrikHattiM?: number | null;
  /** Fiyat tahmini baseline TL/m² */
  baselineTlm2?: number | null;
}

/** Parsel → ScorecardParselVeri dönüşümü */
function parselToVeri(
  parsel: Parsel,
  opts: Omit<Props, "parsel">,
): ScorecardParselVeri {
  // Nitelik kategori tespiti — tarla/bahçe/zeytinlik/bağ vb. tarımsal
  const nitelikNorm = parsel.nitelik?.toLowerCase() ?? "";
  const kategori =
    /tarla|bağ\b|bag\b|bahçe|bahce|zeytinlik|mera/i.test(nitelikNorm) ? "tarla"
    : /arsa/i.test(nitelikNorm) ? "arsa"
    : "arsa";

  return {
    il: parsel.ilAd ?? "",
    ilce: parsel.ilceAd ?? "",
    mahalle: parsel.mahalleAd ?? undefined,
    kategori,
    m2: parsel.alan > 0 ? parsel.alan : undefined,
    depremPga: opts.depremPga ?? undefined,
    taskinRisk: opts.taskinRisk ?? undefined,
    egimYuzde: opts.egim?.ortEgimYuzde ?? undefined,
    otoyolKm: opts.otoyolKm ?? undefined,
    osbKm: opts.osbKm ?? undefined,
    havalimanKm: opts.havalimanKm ?? undefined,
    limanKm: opts.limanKm ?? undefined,
    serbestBolgeKm: opts.serbestBolgeKm ?? undefined,
    lisansliDepoKm: opts.lisansliDepoKm ?? undefined,
    elektrikHattiM: opts.elektrikHattiM ?? undefined,
    baselineTlm2: opts.baselineTlm2 ?? undefined,
  };
}

/** Daire gauge SVG — genel skor */
function SkorGauge({ puan, renk }: { puan: number; renk: string }) {
  const r = 26;
  const cevre = 2 * Math.PI * r;
  const doluluk = (puan / 100) * cevre;

  return (
    <div className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center">
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
        {/* Arka plan halkası */}
        <circle cx="32" cy="32" r={r} fill="none" stroke="#e2e8f0" strokeWidth="5" />
        {/* Doluluk halkası */}
        <circle
          cx="32" cy="32" r={r}
          fill="none"
          stroke={renk}
          strokeWidth="5"
          strokeDasharray={`${doluluk} ${cevre - doluluk}`}
          strokeLinecap="round"
          transform="rotate(-90 32 32)"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-sm font-bold tabular-nums" style={{ color: renk }}>{puan}</span>
        <span className="text-[8px] text-slate-400 leading-none">/ 100</span>
      </div>
    </div>
  );
}

/** Tek boyut satırı — progress bar + açılır gerekçe */
function BoyutSatiri({
  ikon, etiket, puan, gerekce,
}: {
  ikon: string;
  etiket: string;
  puan: number;
  gerekce: string;
}) {
  const [acik, setAcik] = useState(false);
  const renk = puanRenk(puan);
  const label = puanEtiket(puan);

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => setAcik(v => !v)}
        className="flex w-full items-center gap-1.5 text-left hover:opacity-80 transition"
      >
        <span className="text-sm">{ikon}</span>
        <span className="flex-1 text-[10px] font-medium text-slate-700 dark:text-slate-300 truncate">{etiket}</span>
        <span className="text-[9px] font-semibold tabular-nums" style={{ color: renk }}>{puan}</span>
        <span className="text-[8px] text-slate-400">{label}</span>
        {acik
          ? <ChevronUpIcon className="h-2.5 w-2.5 text-slate-400 flex-shrink-0" />
          : <ChevronDownIcon className="h-2.5 w-2.5 text-slate-400 flex-shrink-0" />
        }
      </button>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${puan}%`, backgroundColor: renk }}
        />
      </div>

      {/* Açılır gerekçe */}
      {acik && (
        <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-relaxed pl-1 pt-0.5">
          {gerekce}
        </p>
      )}
    </div>
  );
}

export function ScorecardKarti({
  parsel,
  egim,
  depremPga,
  taskinRisk,
  otoyolKm,
  osbKm,
  havalimanKm,
  limanKm,
  serbestBolgeKm,
  lisansliDepoKm,
  elektrikHattiM,
  baselineTlm2,
}: Props) {
  const [sonuc, setSonuc] = useState<ScorecardTalepSonuc | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [talep, setTalep] = useState(false);

  const parselAnahtar = `${parsel.ilAd ?? ""}-${parsel.ilceAd ?? ""}-${parsel.mahalleAd ?? ""}-${parsel.adaNo}-${parsel.parselNo}`
    .toLocaleLowerCase("tr")
    .replace(/\s+/g, "-")
    .slice(0, 120);

  const analiz = async () => {
    if (yukleniyor) return;
    setYukleniyor(true);
    setHata(null);
    try {
      const veri = parselToVeri(parsel, { egim, depremPga, taskinRisk, otoyolKm, osbKm, havalimanKm, limanKm, serbestBolgeKm, lisansliDepoKm, elektrikHattiM, baselineTlm2 });
      const r = await scorecardTalep(parselAnahtar, veri);
      if (!r) {
        setHata("Bağlantı hatası — tekrar dene");
        return;
      }
      if (r.hata) {
        setHata(r.hata);
        return;
      }
      setSonuc(r);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setYukleniyor(false);
    }
  };

  // Parsel değişince sonucu sıfırla
  useEffect(() => {
    setSonuc(null);
    setHata(null);
    setTalep(false);
  }, [parsel.adaNo, parsel.parselNo, parsel.ilAd]);

  const genelRenk = sonuc ? puanRenk(sonuc.genelSkor) : "#64748b";

  return (
    <div className="rounded-lg border border-violet-200 bg-gradient-to-br from-violet-50/60 to-white dark:from-violet-950/20 dark:to-slate-900 dark:border-violet-800/40 p-3">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <SparklesIcon className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">AI Arazi Scorecard</span>
        </div>
        {sonuc?.cached && (
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[8px] text-slate-500">önbellekten</span>
        )}
        {sonuc?.kalanKota != null && (
          <span className="text-[8px] text-slate-400">{sonuc.kalanKota} hak kaldı</span>
        )}
      </div>

      {/* Sonuç yoksa CTA */}
      {!sonuc && !yukleniyor && !hata && (
        <div className="text-center py-2">
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">
            Tarımsal verimlilik, yapılaşma uygunluğu, lojistik, enerji ve risk — 5 boyutlu AI analizi.
          </p>
          <button
            type="button"
            onClick={() => { setTalep(true); void analiz(); }}
            className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-violet-700 transition"
          >
            <SparklesIcon className="h-3 w-3" />
            Scorecard Üret
          </button>
        </div>
      )}

      {/* Yükleniyor */}
      {yukleniyor && (
        <div className="flex items-center gap-2 py-3 justify-center">
          <LoaderIcon className="h-4 w-4 animate-spin text-violet-600" />
          <span className="text-[10px] text-slate-500">AI analiz yapıyor…</span>
        </div>
      )}

      {/* Hata */}
      {hata && !yukleniyor && (
        <div className="flex flex-col gap-1.5 py-1">
          <div className="flex items-center gap-1.5 text-[10px] text-red-600 dark:text-red-400">
            <AlertIcon className="h-3 w-3 flex-shrink-0" />
            {hata}
          </div>
          <button
            type="button"
            onClick={() => { setHata(null); void analiz(); }}
            className="self-start text-[9px] text-violet-600 hover:underline"
          >
            Tekrar dene →
          </button>
        </div>
      )}

      {/* Sonuç */}
      {sonuc && !yukleniyor && (
        <div className="space-y-2">
          {/* Genel skor + özet */}
          <div className="flex items-start gap-3">
            <SkorGauge puan={Math.round(sonuc.genelSkor)} renk={genelRenk} />
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-0.5">
                Genel Skor — {puanEtiket(sonuc.genelSkor)}
              </div>
              <p className="text-[9px] text-slate-600 dark:text-slate-300 leading-relaxed">
                {sonuc.ozet}
              </p>
            </div>
          </div>

          {/* 5 boyut */}
          <div className="space-y-2 border-t border-violet-100 dark:border-violet-800/40 pt-2">
            {SCORECARD_BOYUTLAR.map((b) => {
              const boyutData = sonuc.skorlar[b.id as keyof typeof sonuc.skorlar];
              if (!boyutData) return null;
              return (
                <BoyutSatiri
                  key={b.id}
                  ikon={b.ikon}
                  etiket={b.etiket}
                  puan={Math.round(boyutData.puan)}
                  gerekce={boyutData.gerekce}
                />
              );
            })}
          </div>

          {/* Yeniden üret */}
          <button
            type="button"
            onClick={() => { setSonuc(null); void analiz(); }}
            className="text-[8px] text-slate-400 hover:text-violet-600 transition mt-1"
          >
            ↻ Yeniden üret
          </button>
        </div>
      )}
    </div>
  );
}
