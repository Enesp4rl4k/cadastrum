import { useEffect, useState } from "react";
import {
  type AnalizNoktasi,
  type AnalizTip,
  ANALIZ_TIPI_ETIKETLERI,
  YIL_SECENEKLERI,
  analizOzetCikar,
  getYilSerisi,
  tkgmAnalizGetir,
} from "../../lib/tkgm-analiz";

interface Props {
  ilceKodu: number;
  ilceAd: string;
}

interface TipOzet {
  tip: AnalizTip;
  etiket: string;
  toplamIslem: number;
  toplamParsel: number;
  ortalama: number;
}

export function TkgmAnaliz({ ilceKodu, ilceAd }: Props) {
  const [yil, setYil] = useState<number>(YIL_SECENEKLERI[3] ?? 2020);
  const [tipOzetleri, setTipOzetleri] = useState<TipOzet[]>([]);
  const [trendVerisi, setTrendVerisi] = useState<{ yil: number; sayi: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secilenTip, setSecilenTip] = useState<AnalizTip>(1);

  // İlçe değişince temizle
  useEffect(() => {
    setTipOzetleri([]);
    setTrendVerisi([]);
    setError(null);
  }, [ilceKodu]);

  // 5 yıllık trend (seçili tip için) — otomatik yüklen
  useEffect(() => {
    const ctrl = new AbortController();
    const ye = new Date().getFullYear() - 1;
    const yb = ye - 4;
    getYilSerisi(ilceKodu, secilenTip, yb, ye, ctrl.signal)
      .then((seri) => {
        if (!ctrl.signal.aborted) {
          setTrendVerisi(seri.map(s => ({ yil: s.yil, sayi: s.toplamIslem })));
        }
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [ilceKodu, secilenTip]);

  // 5 tipi paralel çek — tek tıkla bütün resim
  async function tumTipleriCek() {
    setLoading(true);
    setError(null);
    setTipOzetleri([]);
    try {
      const sonuclar = await Promise.all(
        ([1, 2, 3, 4, 5] as AnalizTip[]).map(async (tip) => {
          try {
            const noktalar = await tkgmAnalizGetir({ analizTip: tip, yil, ilceKodu });
            const ozet = analizOzetCikar(noktalar);
            return {
              tip,
              etiket: ANALIZ_TIPI_ETIKETLERI[tip],
              toplamIslem: ozet.toplamIslem,
              toplamParsel: ozet.toplamNokta,
              ortalama: ozet.ortalamaIslem,
            };
          } catch {
            return {
              tip,
              etiket: ANALIZ_TIPI_ETIKETLERI[tip],
              toplamIslem: 0,
              toplamParsel: 0,
              ortalama: 0,
            };
          }
        })
      );
      setTipOzetleri(sonuclar);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const maxIslem = Math.max(...tipOzetleri.map(t => t.toplamIslem), 1);
  const maxTrend = Math.max(...trendVerisi.map(t => t.sayi), 1);

  // İpotek oranı (Pro insight): ipotekli satış / toplam satış
  const anaSatis = tipOzetleri.find(t => t.tip === 2)?.toplamIslem ?? 0;
  const ipotekliSatis = tipOzetleri.find(t => t.tip === 3)?.toplamIslem ?? 0;
  const ipotekOrani = anaSatis > 0 ? (ipotekliSatis / anaSatis) * 100 : 0;

  return (
    <div className="space-y-2 rounded border-2 border-purple-300 bg-purple-50 p-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-purple-800">
          🔥 TKGM Resmi Analiz · {ilceAd}
        </span>
        <span className="text-[9px] text-purple-600">cbsapi.tkgm.gov.tr</span>
      </div>

      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-0.5 flex-1">
          <span className="text-[10px] font-medium text-tkgm-muted">Yıl</span>
          <select
            value={yil}
            onChange={(e) => setYil(Number(e.target.value))}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
          >
            {YIL_SECENEKLERI.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={tumTipleriCek}
          disabled={loading}
          className="rounded bg-purple-600 px-3 py-1.5 font-medium text-white hover:bg-purple-700 disabled:bg-slate-300"
        >
          {loading ? "Çekiliyor…" : "5 Tipi Birden Getir"}
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-red-700">
          {error}
        </div>
      )}

      {/* 5 analiz tipi — comparison bar chart */}
      {tipOzetleri.length > 0 && (
        <div className="space-y-1.5 rounded bg-white p-2">
          <div className="font-medium text-purple-900 text-[11px]">{yil} yılı işlem yoğunluğu</div>
          {tipOzetleri.map((t) => {
            const pct = (t.toplamIslem / maxIslem) * 100;
            return (
              <button
                key={t.tip}
                type="button"
                onClick={() => setSecilenTip(t.tip)}
                className={`flex w-full items-center gap-2 cursor-pointer transition ${secilenTip === t.tip ? "" : "opacity-70 hover:opacity-100"}`}
              >
                <span className="w-32 text-left text-[10px] text-slate-700 truncate">{t.etiket}</span>
                <div className="flex-1 relative h-4 bg-slate-100 rounded overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-400 to-purple-600 rounded transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-14 text-right text-[10px] font-semibold text-purple-800 tabular-nums">
                  {t.toplamIslem.toLocaleString("tr-TR")}
                </span>
              </button>
            );
          })}
          <div className="text-[9px] italic text-slate-500 pt-1">Tıkla → 5 yıllık trendini gör</div>
        </div>
      )}

      {/* 5 yıllık trend bar chart (seçili tip) */}
      {trendVerisi.length > 0 && (
        <div className="rounded bg-white p-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-medium text-slate-700">
              5 yıllık trend · {ANALIZ_TIPI_ETIKETLERI[secilenTip]}
            </span>
          </div>
          <div className="flex items-end gap-1 h-16">
            {trendVerisi.map((t) => {
              const pct = (t.sayi / maxTrend) * 100;
              return (
                <div key={t.yil} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="text-[8px] font-semibold text-purple-700 tabular-nums">
                    {t.sayi >= 1000 ? `${(t.sayi / 1000).toFixed(1)}K` : t.sayi}
                  </div>
                  <div
                    className="w-full bg-gradient-to-t from-purple-600 to-purple-400 rounded-t transition-all"
                    style={{ height: `${Math.max(pct, 4)}%` }}
                    title={`${t.yil}: ${t.sayi} işlem`}
                  />
                  <div className="text-[8px] text-slate-500">{t.yil}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* İpotek oranı insight */}
      {tipOzetleri.length > 0 && anaSatis > 0 && (
        <div className="rounded bg-white p-2">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-700">💳 İpotekli satış oranı</span>
            <span className={`font-bold ${ipotekOrani >= 50 ? "text-amber-700" : "text-emerald-700"}`}>
              %{ipotekOrani.toFixed(0)}
            </span>
          </div>
          <div className="text-[9px] text-slate-500 mt-1 leading-tight">
            {ipotekOrani >= 50
              ? "Yüksek ipotekli oran — bölgede kredi ile alımlar yaygın"
              : ipotekOrani >= 20
              ? "Orta ipotekli oran — karışık alıcı profili"
              : "Düşük ipotekli oran — peşin alıcılar baskın (yatırım/yabancı)"}
          </div>
        </div>
      )}

      {tipOzetleri.length === 0 && !loading && (
        <div className="text-[10px] italic text-purple-700">
          5 analiz tipini birden çekmek için "Getir" butonuna basın.
        </div>
      )}
    </div>
  );
}
