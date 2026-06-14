/**
 * Likidite Kartı — TKGM yıllık işlem yoğunluğu özeti
 *
 * Side panel'de parsel açılır açılmaz otomatik yüklenir (Sparkline gibi).
 * Kullanıcıya bu ilçenin alım-satım hareketliliğini anında gösterir.
 *
 * Skor hesabı:
 *   - Yıllık ortalama işlem (son 5 yıl) → ana skor (0-60 puan)
 *   - Trend yönü (son 2 yıl artış/azalış) → +20/-20 puan
 *   - İpotek oranı sağlık (%20-50 ideal) → +20/-10 puan
 */

import { useEffect, useState } from "react";
import {
  type AnalizTip,
  getYilSerisi,
  tkgmAnalizGetir,
  analizOzetCikar,
} from "../../lib/tkgm-analiz";

interface Props {
  ilceKodu: number;
  ilceAd: string;
}

interface LikiditeOzet {
  toplam5Yil: number;
  yillikOrtalama: number;
  sonYilIslem: number;
  trendYuzde: number; // son 2 yıl değişim
  ipotekOrani: number;
  skor: number; // 0-100
  seviye: "yuksek" | "orta" | "dusuk" | "cokDusuk";
  trendVerisi: { yil: number; sayi: number }[];
}

function likiditeHesapla(
  trendVerisi: { yil: number; sayi: number }[],
  ipotekOrani: number,
): LikiditeOzet {
  const toplam5Yil = trendVerisi.reduce((s, t) => s + t.sayi, 0);
  const yillikOrtalama = trendVerisi.length > 0 ? Math.round(toplam5Yil / trendVerisi.length) : 0;
  const sonYilIslem = trendVerisi.length > 0 ? (trendVerisi[trendVerisi.length - 1]?.sayi ?? 0) : 0;
  const oncekiYil = trendVerisi.length > 1 ? (trendVerisi[trendVerisi.length - 2]?.sayi ?? 0) : 0;
  const trendYuzde = oncekiYil > 0 ? ((sonYilIslem - oncekiYil) / oncekiYil) * 100 : 0;

  // Skor hesabı
  let skor = 0;

  // 1) Yıllık ortalama (0-60 puan) — logaritmik scale (1000 işlem = ~50p, 5000 = ~60p)
  if (yillikOrtalama > 0) {
    skor += Math.min(60, Math.log10(yillikOrtalama + 1) * 18);
  }

  // 2) Trend (+20 / -20)
  if (trendYuzde >= 20) skor += 20;
  else if (trendYuzde >= 5) skor += 12;
  else if (trendYuzde >= -5) skor += 5;
  else if (trendYuzde >= -20) skor -= 5;
  else skor -= 15;

  // 3) İpotek oranı (sağlıklı %20-50 arası → +20, aşırı uçlar düşür)
  if (ipotekOrani >= 20 && ipotekOrani <= 50) skor += 20;
  else if (ipotekOrani >= 10 && ipotekOrani <= 70) skor += 10;
  else skor += 0;

  skor = Math.max(0, Math.min(100, Math.round(skor)));

  const seviye: LikiditeOzet["seviye"] =
    skor >= 75 ? "yuksek" :
    skor >= 50 ? "orta" :
    skor >= 30 ? "dusuk" :
    "cokDusuk";

  return {
    toplam5Yil,
    yillikOrtalama,
    sonYilIslem,
    trendYuzde,
    ipotekOrani,
    skor,
    seviye,
    trendVerisi,
  };
}

export function LikiditeKarti({ ilceKodu, ilceAd }: Props) {
  const [ozet, setOzet] = useState<LikiditeOzet | null>(null);
  const [loading, setLoading] = useState(true);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    let iptal = false;
    setLoading(true);
    setHata(null);
    setOzet(null);
    const ctrl = new AbortController();

    (async () => {
      try {
        const ye = new Date().getFullYear() - 1;
        const yb = ye - 4;

        // 1) 5 yıllık alım-satım trendi (analiz tipi 1 — yoğunluk)
        const seri = await getYilSerisi(ilceKodu, 1 as AnalizTip, yb, ye, ctrl.signal);
        const trendVerisi = seri.map(s => ({ yil: s.yil, sayi: s.toplamIslem }));

        // 2) Geçen yıl için ipotek oranı (tip 2 ana satış, tip 3 ipotekli)
        let ipotekOrani = 0;
        try {
          const [anaSatis, ipotekli] = await Promise.all([
            tkgmAnalizGetir({ analizTip: 2 as AnalizTip, yil: ye, ilceKodu }),
            tkgmAnalizGetir({ analizTip: 3 as AnalizTip, yil: ye, ilceKodu }),
          ]);
          const anaO = analizOzetCikar(anaSatis).toplamIslem;
          const ipoO = analizOzetCikar(ipotekli).toplamIslem;
          ipotekOrani = anaO > 0 ? (ipoO / anaO) * 100 : 0;
        } catch { /* opsiyonel */ }

        if (iptal) return;
        setOzet(likiditeHesapla(trendVerisi, ipotekOrani));
        setLoading(false);
      } catch (e) {
        if (iptal) return;
        setHata(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    })();

    return () => { iptal = true; ctrl.abort(); };
  }, [ilceKodu]);

  if (loading) {
    return (
      <div className="rounded-md border border-purple-200 bg-purple-50/50 px-3 py-2 text-xs">
        <div className="flex items-center gap-2 text-purple-700">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-purple-300 border-t-purple-700"></div>
          <span>Likidite analizi yükleniyor — {ilceAd}</span>
        </div>
      </div>
    );
  }

  if (hata || !ozet || ozet.toplam5Yil === 0) return null; // veri yoksa kartı gösterme

  const renkler = {
    yuksek: { bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-800", bar: "from-emerald-400 to-emerald-600", etiket: "🟢 Yüksek likidite" },
    orta: { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-800", bar: "from-amber-400 to-amber-600", etiket: "🟡 Orta likidite" },
    dusuk: { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-800", bar: "from-orange-400 to-orange-600", etiket: "🟠 Düşük likidite" },
    cokDusuk: { bg: "bg-red-50", border: "border-red-300", text: "text-red-800", bar: "from-red-400 to-red-600", etiket: "🔴 Çok düşük likidite" },
  };
  const r = renkler[ozet.seviye];

  const trendYon = ozet.trendYuzde > 5 ? "📈" : ozet.trendYuzde < -5 ? "📉" : "➡️";
  const maxTrend = Math.max(...ozet.trendVerisi.map(t => t.sayi), 1);

  return (
    <div className={`rounded-md border-2 ${r.border} ${r.bg} p-2.5 text-xs`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`font-semibold ${r.text}`}>💧 Bölge Likiditesi</span>
        <span className="text-[9px] text-slate-500">{ilceAd} · TKGM</span>
      </div>

      {/* Skor + seviye */}
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <div className={`text-2xl font-bold ${r.text} leading-none`}>{ozet.skor}<span className="text-sm font-normal text-slate-500">/100</span></div>
          <div className={`text-[10px] ${r.text} mt-0.5`}>{r.etiket}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-slate-600">
            {trendYon} {ozet.trendYuzde > 0 ? "+" : ""}{ozet.trendYuzde.toFixed(0)}% yıllık
          </div>
          <div className="text-[10px] text-slate-600">
            💳 İpotek %{ozet.ipotekOrani.toFixed(0)}
          </div>
        </div>
      </div>

      {/* Mini bar chart 5 yıl */}
      <div className="flex items-end gap-1 h-10 mb-2">
        {ozet.trendVerisi.map((t) => {
          const pct = (t.sayi / maxTrend) * 100;
          return (
            <div key={t.yil} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="text-[8px] text-slate-600 tabular-nums">
                {t.sayi >= 1000 ? `${(t.sayi / 1000).toFixed(1)}K` : t.sayi}
              </div>
              <div
                className={`w-full bg-gradient-to-t ${r.bar} rounded-t`}
                style={{ height: `${Math.max(pct, 5)}%` }}
                title={`${t.yil}: ${t.sayi} işlem`}
              />
              <div className="text-[8px] text-slate-500">{t.yil}</div>
            </div>
          );
        })}
      </div>

      {/* Insight metin */}
      <div className={`text-[10px] ${r.text} leading-snug`}>
        {ozet.seviye === "yuksek"
          ? `Bölgede yıllık ${ozet.yillikOrtalama.toLocaleString("tr-TR")} işlem — alım-satım kolay, hızlı satış mümkün.`
          : ozet.seviye === "orta"
          ? `Yıllık ortalama ${ozet.yillikOrtalama.toLocaleString("tr-TR")} işlem — makul aktivite.`
          : ozet.seviye === "dusuk"
          ? `Yıllık ${ozet.yillikOrtalama.toLocaleString("tr-TR")} işlem — sapa konum, satış 6-12 ay alabilir.`
          : `Çok düşük aktivite (${ozet.yillikOrtalama.toLocaleString("tr-TR")}/yıl) — alıcı bulmak zor olabilir.`}
        {" "}
        {ozet.ipotekOrani < 15 && ozet.toplam5Yil > 100
          ? "Peşin alıcı baskın → yatırım/yabancı sermaye."
          : ozet.ipotekOrani > 60
          ? "Kredili alımlar baskın → faize duyarlı."
          : ""}
      </div>
    </div>
  );
}
