/**
 * FiyatAciklamasi — Açıklanabilir AI Değerleme bileşeni
 *
 * "Bu arsanın değeri neden X TL/m²?" sorusunu doğal dilde yanıtlar.
 * Backend /v1/ai-fiyat/acikla endpoint'inden faktör kırılımı alır.
 *
 * Gösterilen bilgiler:
 *   - 2–3 cümle Türkçe açıklama (neden bu fiyat?)
 *   - Faktör kırılımı: her faktör için etki yönü + büyüklüğü + açıklama
 *   - 1 cümle özet (en etkili 3 faktör)
 */

import { useState, useCallback } from "react";
import {
  Sparkles as SparklesIcon,
  Loader2 as LoaderIcon,
  AlertCircle as AlertIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Minus as MinusIcon,
  ChevronDown as ChevronDownIcon,
  ChevronRight as ChevronRightIcon,
  Info as InfoIcon,
} from "lucide-react";
import {
  aciklamaGetir,
  type FiyatAciklamaSonucu,
  type AciklamaFaktoru,
} from "../../lib/ai-fiyat";
import type { Parsel } from "../../types/tkgm";
import type { FiyatTahmini } from "../../lib/fiyat-tahmin";
import type { CevreAnalizi } from "../../lib/osm";
import type { EgimAnalizi } from "../../lib/elevation";
import { fmtTLM2 } from "../../lib/fiyat-tahmin";

interface Props {
  parsel: Parsel;
  tahmin: FiyatTahmini;
  cevre: CevreAnalizi | null;
  egim: EgimAnalizi | null;
  /** Otomatik tetikle (Pro users) — varsayılan false */
  otomatik?: boolean;
}

// Etki yönü → renk + ikon
function etkiStil(etki: AciklamaFaktoru["etki"]) {
  switch (etki) {
    case "pozitif":
      return {
        bg: "bg-emerald-50 dark:bg-emerald-950/30",
        border: "border-emerald-200 dark:border-emerald-800/50",
        text: "text-emerald-700 dark:text-emerald-400",
        bar: "bg-emerald-500",
        icon: TrendingUpIcon,
        etiket: "+",
      };
    case "negatif":
      return {
        bg: "bg-red-50 dark:bg-red-950/30",
        border: "border-red-200 dark:border-red-800/50",
        text: "text-red-700 dark:text-red-400",
        bar: "bg-red-500",
        icon: TrendingDownIcon,
        etiket: "−",
      };
    default:
      return {
        bg: "bg-slate-50 dark:bg-slate-800/60",
        border: "border-slate-200 dark:border-slate-700",
        text: "text-slate-600 dark:text-slate-400",
        bar: "bg-slate-400",
        icon: MinusIcon,
        etiket: "≈",
      };
  }
}

/** Tek faktör satırı */
function FaktorSatir({ faktor }: { faktor: AciklamaFaktoru }) {
  const stil = etkiStil(faktor.etki);
  const Icon = stil.icon;

  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-2 py-1.5 ${stil.bg} ${stil.border}`}
    >
      <Icon className={`mt-0.5 h-3 w-3 flex-shrink-0 ${stil.text}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-2xs font-medium text-slate-800 dark:text-slate-200 truncate">
            {faktor.ad}
          </span>
          <span
            className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums ${stil.bg} ${stil.text}`}
          >
            {stil.etiket}{faktor.yuzde}%
          </span>
        </div>
        {/* Görsel etki barı */}
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className={`h-full rounded-full transition-all ${stil.bar}`}
            style={{ width: `${Math.min(100, faktor.yuzde)}%` }}
            role="progressbar"
            aria-valuenow={faktor.yuzde}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <p className="mt-0.5 text-3xs text-slate-600 dark:text-slate-400 leading-relaxed">
          {faktor.aciklama}
        </p>
      </div>
    </div>
  );
}

export function FiyatAciklamasi({
  parsel,
  tahmin,
  cevre,
  egim,
  otomatik = false,
}: Props) {
  const [sonuc, setSonuc] = useState<FiyatAciklamaSonucu | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [acik, setAcik] = useState(false);

  const calistir = useCallback(async () => {
    if (yukleniyor) return;
    setYukleniyor(true);
    setHata(null);
    try {
      const veri = await aciklamaGetir(parsel, tahmin, cevre, egim);
      setSonuc(veri);
      setAcik(true);
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
    } finally {
      setYukleniyor(false);
    }
  }, [parsel, tahmin, cevre, egim, yukleniyor]);

  // Otomatik tetikleme (Pro) — sadece bir kez
  // Not: useEffect yerine mount sırasında çağırmak için bir flag kullanıyoruz
  // ancak bu bileşen sadece tahmin hazır olduğunda render edildiği için
  // otomatik tetikleme prop'u ile parent tarafından kontrol edilir
  const [otomatikTetiklendi, setOtomatikTetiklendi] = useState(false);
  if (otomatik && !otomatikTetiklendi && !sonuc && !yukleniyor && !hata) {
    setOtomatikTetiklendi(true);
    void calistir();
  }

  const fiyatFormatli = fmtTLM2(tahmin.beklenenPerM2);

  // ── Henüz çalıştırılmadı — CTA butonu ──
  if (!sonuc && !yukleniyor && !hata) {
    return (
      <button
        type="button"
        onClick={calistir}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-violet-200 bg-violet-50/70 px-3 py-2 text-2xs font-medium text-violet-700 transition-colors hover:bg-violet-100 dark:border-violet-800/50 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-900/40"
        aria-label="Bu fiyatın nedenini AI ile açıkla"
      >
        <SparklesIcon className="h-3.5 w-3.5" aria-hidden="true" />
        Neden {fiyatFormatli}? — AI ile açıkla
      </button>
    );
  }

  // ── Yükleniyor ──
  if (yukleniyor) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-violet-200 bg-violet-50/50 px-3 py-2 text-2xs text-violet-700 dark:border-violet-800/50 dark:bg-violet-950/20 dark:text-violet-300">
        <LoaderIcon className="h-3.5 w-3.5 animate-spin flex-shrink-0" aria-hidden="true" />
        <span>Fiyat açıklaması hazırlanıyor…</span>
      </div>
    );
  }

  // ── Hata ──
  if (hata) {
    const girisGerekli = /giriş|oturum|Pro|hesap/i.test(hata);
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-2 text-3xs text-red-800 dark:border-red-800/50 dark:bg-red-950/20 dark:text-red-300">
        <div className="flex items-start gap-1.5 mb-1">
          <AlertIcon className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <span className="break-words">{hata}</span>
        </div>
        {girisGerekli ? (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <button
              type="button"
              onClick={() => chrome.tabs.create({ url: "https://cadastrum.com.tr/giris?source=extension" })}
              className="rounded bg-imperial px-2 py-1 text-white text-3xs font-medium hover:bg-imperial-700 transition"
            >
              Giriş Yap →
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={calistir}
            className="mt-1 text-red-600 hover:underline dark:text-red-400"
          >
            Tekrar dene
          </button>
        )}
      </div>
    );
  }

  // ── Sonuç ──
  if (!sonuc) return null;

  const pozitifler = sonuc.faktorler.filter((f) => f.etki === "pozitif");
  const negatifler = sonuc.faktorler.filter((f) => f.etki === "negatif");
  const notrlr    = sonuc.faktorler.filter((f) => f.etki === "nötr");

  return (
    <div className="space-y-2">
      {/* Başlık + collapse toggle */}
      <button
        type="button"
        onClick={() => setAcik((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-violet-200 bg-violet-50/70 px-2.5 py-2 text-2xs font-medium text-violet-800 hover:bg-violet-100 dark:border-violet-800/50 dark:bg-violet-950/30 dark:text-violet-200 dark:hover:bg-violet-900/40 transition-colors"
        aria-expanded={acik}
      >
        <span className="flex items-center gap-1.5">
          <SparklesIcon className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" aria-hidden="true" />
          AI Fiyat Açıklaması
          {sonuc.cached && (
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              önbellek
            </span>
          )}
        </span>
        {acik
          ? <ChevronDownIcon className="h-3.5 w-3.5" aria-hidden="true" />
          : <ChevronRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
        }
      </button>

      {acik && (
        <div className="space-y-2 rounded-md border border-violet-100 bg-white/80 p-2.5 dark:border-violet-900/40 dark:bg-slate-900/60">
          {/* Doğal dil açıklama */}
          <p className="text-3xs leading-relaxed text-slate-700 dark:text-slate-300">
            {sonuc.aciklama}
          </p>

          {/* Özet chip */}
          {sonuc.ozet && (
            <div className="flex items-start gap-1.5 rounded bg-violet-50 px-2 py-1.5 dark:bg-violet-950/30">
              <InfoIcon className="mt-0.5 h-3 w-3 flex-shrink-0 text-violet-500" aria-hidden="true" />
              <p className="text-3xs italic text-violet-800 dark:text-violet-300">
                {sonuc.ozet}
              </p>
            </div>
          )}

          {/* Faktör kırılımı */}
          {sonuc.faktorler.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Fiyatı etkileyen faktörler
              </div>

              {/* Pozitif faktörler */}
              {pozitifler.length > 0 && (
                <div className="space-y-1">
                  {pozitifler.map((f, i) => (
                    <FaktorSatir key={`pos-${i}`} faktor={f} />
                  ))}
                </div>
              )}

              {/* Negatif faktörler */}
              {negatifler.length > 0 && (
                <div className="space-y-1">
                  {negatifler.map((f, i) => (
                    <FaktorSatir key={`neg-${i}`} faktor={f} />
                  ))}
                </div>
              )}

              {/* Nötr faktörler */}
              {notrlr.length > 0 && (
                <div className="space-y-1">
                  {notrlr.map((f, i) => (
                    <FaktorSatir key={`ntr-${i}`} faktor={f} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer: model + süre */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 text-[9px] text-slate-400 dark:border-slate-700 dark:text-slate-500">
            <span className="flex items-center gap-1">
              <SparklesIcon className="h-2.5 w-2.5" aria-hidden="true" />
              {sonuc.modelAd}
            </span>
            <span className="tabular-nums">
              {sonuc.cached ? "önbellekten" : `${sonuc.sureMs}ms`}
            </span>
          </div>

          {/* Yasal uyarı */}
          <p className="text-[9px] text-slate-400 dark:text-slate-500 leading-snug">
            Bu açıklama bilgilendirme amaçlıdır; resmi ekspertiz veya yatırım tavsiyesi değildir.
          </p>
        </div>
      )}
    </div>
  );
}
