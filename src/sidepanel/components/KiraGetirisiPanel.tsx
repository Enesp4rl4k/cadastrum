/**
 * KiraGetirisiPanel — Kira getirisi + konut kredisi simülasyonu
 *
 * Konut niteliğine sahip parseller için brüt/net kira getirisi ve
 * interaktif mortgage hesaplama aracı gösterir.
 * Arsa/tarla gibi nitelikler için kiraTahminiHesapla() null döner → render yok.
 */
import { useMemo, useState } from "react";
import type { Parsel } from "../../types/tkgm";
import { fmtTL } from "../../lib/fiyat-tahmin";
import { kiraTahminiHesapla } from "../../lib/kira-getirisi";

interface Props {
  parsel: Parsel;
  tahminFiyat: number | null;
}

export function KiraGetirisiPanel({ parsel, tahminFiyat }: Props) {
  const [acik, setAcik] = useState(false);
  const [pesinatYuzde, setPesinatYuzde] = useState(30);
  const [faizYillik, setFaizYillik] = useState(45); // 2026 TR konut kredisi ortalama
  const [vadeYil, setVadeYil] = useState(10);

  const kira = useMemo(() => kiraTahminiHesapla(parsel), [parsel]);

  // Sadece konut veya tarımsal nitelik için göster
  if (!kira) return null;
  if (!tahminFiyat || tahminFiyat <= 0) return null;

  const brutGetiri = (kira.yillikKira / tahminFiyat) * 100;
  const giderOrani = 0.15; // %15 gider (aidat, bakım, boşluk)
  const netGetiri = brutGetiri * (1 - giderOrani);

  // Mortgage hesabı
  const krediTutari = tahminFiyat * (1 - pesinatYuzde / 100);
  const aylikFaiz = faizYillik / 100 / 12;
  const vadAy = vadeYil * 12;
  const aylikTaksit =
    aylikFaiz > 0
      ? Math.round(
          (krediTutari * (aylikFaiz * Math.pow(1 + aylikFaiz, vadAy))) /
            (Math.pow(1 + aylikFaiz, vadAy) - 1),
        )
      : Math.round(krediTutari / vadAy);
  const toplamOdeme = aylikTaksit * vadAy;
  const toplamFaizMaliyet = toplamOdeme - krediTutari;

  return (
    <div className="border-t border-slate-100 pt-2 mt-2">
      <button
        type="button"
        onClick={() => setAcik((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-3xs font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true">💰</span>
          Kira Getirisi &amp; Finansman
          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            {brutGetiri.toFixed(1)}% brüt
          </span>
        </span>
        <span className="text-slate-400" aria-hidden="true">{acik ? "▲" : "▼"}</span>
      </button>

      {acik && (
        <div className="space-y-2 px-3 pb-3">
          {/* Kira özeti */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5 dark:border-emerald-800/50 dark:bg-emerald-950/20">
            <div className="mb-1 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
              Kira Tahmini
            </div>
            <div className="grid grid-cols-3 gap-1 text-center text-3xs">
              <div className="rounded bg-white/70 px-1 py-1 dark:bg-slate-800/60">
                <div className="text-slate-500">Aylık</div>
                <div className="font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {fmtTL(kira.aylikKira)}
                </div>
              </div>
              <div className="rounded bg-white/70 px-1 py-1 dark:bg-slate-800/60">
                <div className="text-slate-500">Brüt</div>
                <div className="font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  %{brutGetiri.toFixed(1)}
                </div>
              </div>
              <div className="rounded bg-white/70 px-1 py-1 dark:bg-slate-800/60">
                <div className="text-slate-500">Net</div>
                <div className="font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  %{netGetiri.toFixed(1)}
                </div>
              </div>
            </div>
            <div className="mt-1 text-[9px] text-slate-500 italic">
              {kira.not} · Net: %15 gider düşülmüş
            </div>
          </div>

          {/* Mortgage hesabı */}
          <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-2.5 dark:border-blue-800/50 dark:bg-blue-950/20">
            <div className="mb-2 text-[10px] font-semibold text-blue-800 dark:text-blue-300">
              Konut Kredisi Simülasyonu
            </div>

            {/* Sliders */}
            <div className="space-y-2 mb-2">
              <div>
                <div className="flex justify-between text-[9px] text-slate-500 mb-0.5">
                  <span>Peşinat: %{pesinatYuzde}</span>
                  <span>{fmtTL(tahminFiyat * pesinatYuzde / 100)}</span>
                </div>
                <input
                  type="range" min={10} max={70} step={5}
                  value={pesinatYuzde}
                  onChange={(e) => setPesinatYuzde(Number(e.target.value))}
                  className="w-full accent-blue-600"
                  aria-label="Peşinat yüzdesi"
                />
              </div>
              <div>
                <div className="flex justify-between text-[9px] text-slate-500 mb-0.5">
                  <span>Faiz: %{faizYillik}/yıl</span>
                  <span>{(faizYillik / 12).toFixed(1)}%/ay</span>
                </div>
                <input
                  type="range" min={20} max={80} step={5}
                  value={faizYillik}
                  onChange={(e) => setFaizYillik(Number(e.target.value))}
                  className="w-full accent-blue-600"
                  aria-label="Yıllık faiz oranı"
                />
              </div>
              <div>
                <div className="flex justify-between text-[9px] text-slate-500 mb-0.5">
                  <span>Vade: {vadeYil} yıl</span>
                  <span>{vadAy} ay</span>
                </div>
                <input
                  type="range" min={5} max={30} step={5}
                  value={vadeYil}
                  onChange={(e) => setVadeYil(Number(e.target.value))}
                  className="w-full accent-blue-600"
                  aria-label="Kredi vadesi"
                />
              </div>
            </div>

            {/* Sonuçlar */}
            <div className="grid grid-cols-3 gap-1 text-center text-3xs">
              <div className="rounded bg-white/70 px-1 py-1.5 dark:bg-slate-800/60">
                <div className="text-slate-500">Aylık Taksit</div>
                <div className="text-[11px] font-bold tabular-nums text-blue-700 dark:text-blue-400">
                  {fmtTL(aylikTaksit)}
                </div>
              </div>
              <div className="rounded bg-white/70 px-1 py-1.5 dark:bg-slate-800/60">
                <div className="text-slate-500">Kredi</div>
                <div className="font-bold tabular-nums text-blue-700 dark:text-blue-400">
                  {fmtTL(krediTutari)}
                </div>
              </div>
              <div className="rounded bg-white/70 px-1 py-1.5 dark:bg-slate-800/60">
                <div className="text-slate-500">Toplam Faiz</div>
                <div className="font-bold tabular-nums text-red-600 dark:text-red-400">
                  {fmtTL(toplamFaizMaliyet)}
                </div>
              </div>
            </div>

            {/* Kira vs Taksit karşılaştırması */}
            {kira.aylikKira > 0 && (
              <div className="mt-2 rounded bg-white/60 px-2 py-1.5 text-[9px] dark:bg-slate-800/40">
                {kira.aylikKira >= aylikTaksit ? (
                  <span className="text-emerald-700 font-medium dark:text-emerald-400">
                    ✓ Kira geliri ({fmtTL(kira.aylikKira)}/ay) taksiti karşılar — pozitif nakit akışı
                  </span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-400">
                    ⚠ Kira ({fmtTL(kira.aylikKira)}/ay) taksiti ({fmtTL(aylikTaksit)}/ay) karşılamıyor
                    {" "}— aylık {fmtTL(aylikTaksit - kira.aylikKira)} ek ödeme
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
