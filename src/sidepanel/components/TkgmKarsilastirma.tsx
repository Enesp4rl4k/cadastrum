/**
 * TKGM Tarihsel Karşılaştırma Bileşeni
 *
 * İki farklı yılın alım-satım yoğunluklarını yan yana karşılaştırır.
 * TKGM resmi analiz API'sinden (cbsapi.tkgm.gov.tr) veri çeker.
 *
 * Özellikler:
 *   - Sol/sağ yıl seçici
 *   - 5 analiz tipi (alım-satım, satış, ipotekli satış, bağımsız bölüm)
 *   - Her tip için çift çubuk + değişim oranı badge'i
 *   - Piyasa sıcaklığı özeti (toplam işlem yıl-yıl değişimi)
 *   - 10 yıllık sparkline trend (tek satır mini bar)
 *
 * Kullanım:
 *   <TkgmKarsilastirma ilceKodu={1234} ilceAd="Beykoz" />
 */

import { useEffect, useState, useCallback } from "react";
import {
  type AnalizTip,
  ANALIZ_TIPI_ETIKETLERI,
  YIL_SECENEKLERI,
  analizOzetCikar,
  getYilSerisi,
  tkgmAnalizGetir,
  type YilOzeti,
} from "../../lib/tkgm-analiz";
import { Loader2 as LoaderIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";

// ── Tipler ────────────────────────────────────────────────────────────────────

interface YilVeri {
  tip: AnalizTip;
  toplamIslem: number;
  toplamParsel: number;
}

interface Props {
  ilceKodu: number;
  ilceAd: string;
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function degisimRenk(pct: number): string {
  if (pct > 10) return "text-emerald-700 dark:text-emerald-400";
  if (pct > 0) return "text-emerald-600 dark:text-emerald-500";
  if (pct >= -10) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function degisimBg(pct: number): string {
  if (pct > 10) return "bg-emerald-100 dark:bg-emerald-900/30";
  if (pct > 0) return "bg-emerald-50 dark:bg-emerald-950/20";
  if (pct >= -10) return "bg-amber-50 dark:bg-amber-950/20";
  return "bg-red-50 dark:bg-red-950/20";
}

function fmtSayi(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────

export function TkgmKarsilastirma({ ilceKodu, ilceAd }: Props) {
  // Yıl seçimi: sol = daha eski, sağ = daha yeni
  const sonYil = YIL_SECENEKLERI[0] ?? new Date().getFullYear() - 1;
  const [yilSol, setYilSol] = useState(sonYil - 2);
  const [yilSag, setYilSag] = useState(sonYil);

  const [solVeri, setSolVeri] = useState<YilVeri[]>([]);
  const [sagVeri, setSagVeri] = useState<YilVeri[]>([]);
  const [yukleniyorSol, setYukleniyorSol] = useState(false);
  const [yukleniyorSag, setYukleniyorSag] = useState(false);
  const [trend10, setTrend10] = useState<YilOzeti[]>([]);
  const [hata, setHata] = useState<string | null>(null);

  // Tek yılın 5 tipini çek
  const yilVerisiCek = useCallback(
    async (
      yil: number,
      setVeri: (v: YilVeri[]) => void,
      setYukleniyor: (v: boolean) => void,
      signal: AbortSignal,
    ) => {
      setYukleniyor(true);
      try {
        const tipVeVeri = await Promise.all(
          ([1, 2, 3, 4, 5] as AnalizTip[]).map(async (tip) => {
            try {
              const noktalar = await tkgmAnalizGetir({ analizTip: tip, yil, ilceKodu }, signal);
              const ozet = analizOzetCikar(noktalar);
              return { tip, toplamIslem: ozet.toplamIslem, toplamParsel: ozet.toplamNokta };
            } catch {
              return { tip, toplamIslem: 0, toplamParsel: 0 };
            }
          })
        );
        if (!signal.aborted) setVeri(tipVeVeri);
      } catch (e) {
        if (!signal.aborted) setHata(e instanceof Error ? e.message : "Hata");
      } finally {
        if (!signal.aborted) setYukleniyor(false);
      }
    },
    [ilceKodu],
  );

  // Sol yıl değişince çek
  useEffect(() => {
    const ctrl = new AbortController();
    setHata(null);
    void yilVerisiCek(yilSol, setSolVeri, setYukleniyorSol, ctrl.signal);
    return () => ctrl.abort();
  }, [yilSol, yilVerisiCek]);

  // Sağ yıl değişince çek
  useEffect(() => {
    const ctrl = new AbortController();
    setHata(null);
    void yilVerisiCek(yilSag, setSagVeri, setYukleniyorSag, ctrl.signal);
    return () => ctrl.abort();
  }, [yilSag, yilVerisiCek]);

  // 10 yıllık Tip 1 trendi
  useEffect(() => {
    const ctrl = new AbortController();
    const ye = sonYil;
    const yb = ye - 9;
    getYilSerisi(ilceKodu, 1, yb, ye, ctrl.signal)
      .then((seri) => { if (!ctrl.signal.aborted) setTrend10(seri); })
      .catch(() => {});
    return () => ctrl.abort();
  }, [ilceKodu, sonYil]);

  // Karşılaştırma hesaplamaları
  const karsilastirma = ([1, 2, 3, 4, 5] as AnalizTip[]).map((tip) => {
    const sol = solVeri.find((v) => v.tip === tip)?.toplamIslem ?? 0;
    const sag = sagVeri.find((v) => v.tip === tip)?.toplamIslem ?? 0;
    const degisimPct = sol > 0 ? Math.round(((sag - sol) / sol) * 1000) / 10 : null;
    const maxVal = Math.max(sol, sag, 1);
    return { tip, sol, sag, degisimPct, maxVal };
  });

  // Toplam piyasa sıcaklığı (Tip 1)
  const tip1 = karsilastirma.find((k) => k.tip === 1);
  const piyasaDegisim = tip1?.degisimPct ?? null;
  const maxTrend = Math.max(...trend10.map((t) => t.toplamIslem), 1);

  return (
    <div className="space-y-3 rounded-lg border border-purple-200 bg-purple-50/60 p-3 text-xs dark:border-purple-800 dark:bg-purple-950/20">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <span className="font-semibold text-purple-900 dark:text-purple-200">
          📊 Yıl-Yıl Karşılaştırma · {ilceAd}
        </span>
        {piyasaDegisim !== null && (
          <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${degisimBg(piyasaDegisim)} ${degisimRenk(piyasaDegisim)}`}>
            {piyasaDegisim > 0
              ? <TrendingUp className="h-3 w-3" />
              : piyasaDegisim < 0
                ? <TrendingDown className="h-3 w-3" />
                : <Minus className="h-3 w-3" />
            }
            {piyasaDegisim > 0 ? "+" : ""}{piyasaDegisim}%
          </div>
        )}
      </div>

      {/* Yıl seçiciler */}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium text-purple-600 dark:text-purple-400">← Önceki Yıl</span>
          <select
            value={yilSol}
            onChange={(e) => setYilSol(Number(e.target.value))}
            className="rounded border border-purple-200 bg-white px-2 py-1 text-xs dark:border-purple-700 dark:bg-slate-800"
          >
            {YIL_SECENEKLERI.filter((y) => y < yilSag).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">Güncel Yıl →</span>
          <select
            value={yilSag}
            onChange={(e) => setYilSag(Number(e.target.value))}
            className="rounded border border-blue-200 bg-white px-2 py-1 text-xs dark:border-blue-700 dark:bg-slate-800"
          >
            {YIL_SECENEKLERI.filter((y) => y > yilSol).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>

      {hata && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">
          {hata}
        </div>
      )}

      {/* Karşılaştırma bar chart */}
      <div className="space-y-2 rounded-lg bg-white p-2.5 shadow-sm dark:bg-slate-800">
        {(yukleniyorSol || yukleniyorSag) ? (
          <div className="flex items-center justify-center gap-2 py-4 text-slate-400">
            <LoaderIcon className="h-4 w-4 animate-spin" />
            <span className="text-[11px]">Veriler yükleniyor…</span>
          </div>
        ) : (
          <>
            {/* Başlık satırı */}
            <div className="mb-2 grid grid-cols-[8rem_1fr_5rem] gap-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              <span>Analiz Tipi</span>
              <span>Karşılaştırma</span>
              <span className="text-right">Değişim</span>
            </div>

            {karsilastirma.map(({ tip, sol, sag, degisimPct, maxVal }) => (
              <div key={tip} className="grid grid-cols-[8rem_1fr_5rem] items-center gap-1">
                {/* Tip adı */}
                <span className="truncate text-[10px] text-slate-600 dark:text-slate-400" title={ANALIZ_TIPI_ETIKETLERI[tip]}>
                  {ANALIZ_TIPI_ETIKETLERI[tip]}
                </span>

                {/* Çift çubuk */}
                <div className="flex flex-col gap-0.5">
                  {/* Sol yıl — mor */}
                  <div className="flex items-center gap-1">
                    <span className="w-8 text-right text-[9px] tabular-nums text-purple-600">{fmtSayi(sol)}</span>
                    <div className="flex-1 h-2.5 bg-slate-100 dark:bg-slate-700 rounded overflow-hidden">
                      <div
                        className="h-full bg-purple-400 rounded transition-all"
                        style={{ width: `${(sol / maxVal) * 100}%` }}
                      />
                    </div>
                  </div>
                  {/* Sağ yıl — mavi */}
                  <div className="flex items-center gap-1">
                    <span className="w-8 text-right text-[9px] tabular-nums text-blue-600">{fmtSayi(sag)}</span>
                    <div className="flex-1 h-2.5 bg-slate-100 dark:bg-slate-700 rounded overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded transition-all"
                        style={{ width: `${(sag / maxVal) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Değişim badge */}
                <div className="text-right">
                  {degisimPct !== null ? (
                    <span className={`font-bold tabular-nums ${degisimRenk(degisimPct)}`}>
                      {degisimPct > 0 ? "+" : ""}{degisimPct}%
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </div>
              </div>
            ))}

            {/* Renk açıklaması */}
            <div className="mt-1.5 flex gap-3 text-[9px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-4 rounded bg-purple-400" />
                {yilSol}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-4 rounded bg-blue-500" />
                {yilSag}
              </span>
            </div>
          </>
        )}
      </div>

      {/* 10 yıllık mini sparkline — Tip 1 */}
      {trend10.length > 0 && (
        <div className="rounded-lg bg-white p-2.5 shadow-sm dark:bg-slate-800">
          <p className="mb-1.5 text-[10px] font-medium text-slate-600 dark:text-slate-400">
            10 Yıllık Alım-Satım Trendi
          </p>
          <div className="flex items-end gap-0.5 h-10">
            {trend10.map((t) => {
              const pct = (t.toplamIslem / maxTrend) * 100;
              const isYilSol = t.yil === yilSol;
              const isYilSag = t.yil === yilSag;
              return (
                <div key={t.yil} className="flex-1 flex flex-col items-center gap-px" title={`${t.yil}: ${t.toplamIslem.toLocaleString("tr-TR")} işlem`}>
                  <div
                    className={`w-full rounded-t transition-all ${
                      isYilSag ? "bg-blue-500" : isYilSol ? "bg-purple-400" : "bg-slate-200 dark:bg-slate-600"
                    }`}
                    style={{ height: `${Math.max(pct, 5)}%` }}
                  />
                  <div className={`text-[7px] ${isYilSol || isYilSag ? "font-bold text-slate-700 dark:text-slate-200" : "text-slate-400"}`}>
                    {String(t.yil).slice(2)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Piyasa yorumu */}
      {piyasaDegisim !== null && (
        <div className={`rounded-lg p-2 text-[10px] leading-relaxed ${degisimBg(piyasaDegisim)}`}>
          <span className={`font-semibold ${degisimRenk(piyasaDegisim)}`}>
            {piyasaDegisim > 15 ? "🔥 Çok Isınan Piyasa" :
             piyasaDegisim > 0 ? "📈 Büyüyen Piyasa" :
             piyasaDegisim === 0 ? "➡️ Durağan Piyasa" :
             piyasaDegisim > -15 ? "📉 Soğuyan Piyasa" : "❄️ Çok Soğuyan Piyasa"}:
          </span>{" "}
          {yilSol}→{yilSag} arasında alım-satım yoğunluğu{" "}
          {Math.abs(piyasaDegisim)}% {piyasaDegisim >= 0 ? "arttı" : "azaldı"}.
          {piyasaDegisim > 15 && " Yüksek likidite — satıcı piyasası."}
          {piyasaDegisim < -15 && " Düşük likidite — alıcı piyasası, fiyat müzakeresi mümkün."}
        </div>
      )}
    </div>
  );
}
