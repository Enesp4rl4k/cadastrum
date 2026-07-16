/**
 * Fiyat Trendi Kartı — kullanıcının kendi ilanGozlem birikiminden
 * mahalle/ilçe bazlı haftalık TL/m² zaman serisi gösterir.
 *
 * Veri kaynağı: extension'ın Sahibinden/Hepsiemlak'tan topladığı ilanlar.
 * Dış API gerekmez, tamamen yerel Dexie verisinden hesaplanır.
 *
 * Gösterim:
 *   - SVG sparkline (Sparkline component — mevcut)
 *   - Son nokta TL/m² + aylık değişim yüzdesi
 *   - Trend yönü ikonu + yorum metni
 *   - Veri kalitesi: "N ilan · X hafta · mahalle/ilçe"
 */

import { useEffect, useState } from "react";
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Minus as MinusIcon,
  BarChart2 as BarChartIcon,
  RefreshCw as RefreshIcon,
  AlertCircle as AlertIcon,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";
import {
  enIyiTrendiGetir,
  trendProjesyonGetir,
  type TrendYorumu,
  type TrendProjesyonSonuc,
} from "../../lib/fiyat-trendi";
import type { FiyatTrendi } from "../../lib/db";
import { Sparkline } from "./Sparkline";

interface Props {
  ilce: string;
  mahalle: string;
  /** İl adı — backend projeksiyon için gerekli */
  il?: string;
  /** Varsayılan "tum". Parsel tipine göre filtrele. */
  kategori?: FiyatTrendi["kategori"];
  /** Son N haftayı göster (default 26 = 6 ay) */
  maxHafta?: number;
}

export function FiyatTrendiKarti({
  ilce,
  mahalle,
  il,
  kategori = "tum",
  maxHafta = 26,
}: Props) {
  const [trend, setTrend] = useState<FiyatTrendi | null>(null);
  const [yorum, setYorum] = useState<TrendYorumu | null>(null);
  const [projeksiyon, setProje] = useState<TrendProjesyonSonuc | null>(null);
  const [projeAcik, setProjeAcik] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [yenileniyor, setYenileniyor] = useState(false);

  const yukle = async (force = false) => {
    if (!ilce) return;
    force ? setYenileniyor(true) : setYukleniyor(true);
    setHata(null);
    try {
      const [sonuc, projeSonuc] = await Promise.all([
        enIyiTrendiGetir(ilce, mahalle, kategori),
        il && mahalle ? trendProjesyonGetir(il, ilce, mahalle, kategori) : Promise.resolve(null),
      ]);
      if (sonuc) {
        setTrend(sonuc.trend);
        setYorum(sonuc.yorum);
      } else {
        setTrend(null);
        setYorum(null);
      }
      setProje(projeSonuc);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Trend verisi alınamadı");
    } finally {
      setYukleniyor(false);
      setYenileniyor(false);
    }
  };

  useEffect(() => {
    void yukle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ilce, mahalle, kategori]);

  // Yükleniyor
  if (yukleniyor) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50/60 p-2">
        <div className="flex items-center gap-1.5 text-3xs text-slate-400">
          <BarChartIcon className="h-3 w-3 animate-pulse" />
          Fiyat trendi hesaplanıyor…
        </div>
      </div>
    );
  }

  // Hata
  if (hata) {
    return (
      <div className="rounded-md border border-red-100 bg-red-50/60 p-2">
        <div className="flex items-center gap-1.5 text-3xs text-red-500">
          <AlertIcon className="h-3 w-3" />
          {hata}
        </div>
      </div>
    );
  }

  // Veri yok
  if (!trend || trend.noktalar.length < 3) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50/60 p-2">
        <div className="mb-0.5 flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-wide text-slate-500">
          <BarChartIcon className="h-3 w-3" />
          Fiyat trendi
        </div>
        <p className="text-3xs italic text-slate-400">
          Yeterli veri yok — bu bölgede ilan gezerken fiyatlar otomatik biriktirilir.
        </p>
      </div>
    );
  }

  // Son maxHafta noktayı al
  const gorunenNoktalar = trend.noktalar.slice(-maxHafta);
  const degerler = gorunenNoktalar.map((n) => n.medyanPerM2);
  const labels = gorunenNoktalar.map(
    (n) => `${n.hafta} · ${n.medyanPerM2.toLocaleString("tr-TR")} TL/m² (${n.ilanAdet} ilan)`,
  );

  // Hovered nokta gösterimi
  const aktifNokta = hoveredIdx != null ? gorunenNoktalar[hoveredIdx] : null;
  const sonNokta = gorunenNoktalar[gorunenNoktalar.length - 1];

  // Trend renk + ikon
  const trendRenk =
    yorum?.yon === "artan"
      ? "text-emerald-600"
      : yorum?.yon === "dusen"
        ? "text-red-600"
        : "text-slate-500";
  const trendBg =
    yorum?.yon === "artan"
      ? "bg-emerald-50"
      : yorum?.yon === "dusen"
        ? "bg-red-50"
        : "bg-slate-50";
  const trendBorder =
    yorum?.yon === "artan"
      ? "border-emerald-200"
      : yorum?.yon === "dusen"
        ? "border-red-200"
        : "border-slate-200";
  const sparklineRenk =
    yorum?.yon === "artan"
      ? "#16a34a"
      : yorum?.yon === "dusen"
        ? "#dc2626"
        : "#64748b";

  const TrendIkon =
    yorum?.yon === "artan"
      ? TrendingUpIcon
      : yorum?.yon === "dusen"
        ? TrendingDownIcon
        : MinusIcon;

  const trendYonText =
    yorum?.yon === "artan"
      ? "Yükseliyor"
      : yorum?.yon === "dusen"
        ? "Düşüyor"
        : "Yatay seyrediyor";

  // Gösterilecek TL/m² — hover varsa hover'daki, yoksa son nokta
  const gosterilenTlm2 = aktifNokta?.medyanPerM2 ?? sonNokta?.medyanPerM2 ?? 0;
  const gosterilenHafta = aktifNokta?.hafta ?? sonNokta?.hafta ?? "";

  return (
    <div className={`rounded-md border ${trendBorder} ${trendBg} p-2`}>
      {/* Başlık satırı */}
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <span className="flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-wide text-slate-600">
          <BarChartIcon className="h-3 w-3" />
          Fiyat trendi
        </span>
        <div className="flex items-center gap-1.5">
          {/* Seviye badge */}
          <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[9px] font-medium text-slate-500 ring-1 ring-slate-200">
            {trend.seviye === "mahalle" ? mahalle || "mahalle" : ilce} · {gorunenNoktalar.length} hafta
          </span>
          {/* Yenile butonu */}
          <button
            type="button"
            onClick={() => yukle(true)}
            disabled={yenileniyor}
            className="flex items-center justify-center rounded p-0.5 text-slate-400 hover:bg-white/60 hover:text-slate-600 disabled:opacity-40"
            title="Trendi yeniden hesapla"
            aria-label="Trendi yenile"
          >
            <RefreshIcon
              className={`h-3 w-3 ${yenileniyor ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Ana içerik: sol metin + sağ sparkline */}
      <div className="flex items-center gap-3">
        {/* Sol: güncel fiyat + trend yüzdesi */}
        <div className="min-w-0 flex-1">
          <div className="tabular-nums text-xs font-bold text-slate-800">
            {gosterilenTlm2.toLocaleString("tr-TR")} TL/m²
          </div>
          <div className="text-[9px] text-slate-400">{gosterilenHafta}</div>

          {yorum && (
            <div className={`mt-1 flex items-center gap-1 text-3xs font-medium ${trendRenk}`}>
              <TrendIkon className="h-3 w-3 flex-shrink-0" />
              <span>
                {trendYonText}
                {yorum.aylikDegisimYuzde !== 0 && (
                  <span className="ml-0.5 font-bold tabular-nums">
                    {yorum.aylikDegisimYuzde > 0 ? "+" : ""}
                    {yorum.aylikDegisimYuzde}%/ay
                  </span>
                )}
              </span>
            </div>
          )}

          {yorum && (
            <div className="mt-0.5 text-[9px] text-slate-400 tabular-nums">
              Toplam: {yorum.toplamDegisimYuzde > 0 ? "+" : ""}{yorum.toplamDegisimYuzde}%
              {" · "}{trend.toplamIlan} ilan
              {yorum.r2 >= 0.5 && (
                <span className="ml-0.5 text-emerald-500" title={`R²=${yorum.r2} — trend güvenilir`}>
                  {" "}✓
                </span>
              )}
            </div>
          )}
        </div>

        {/* Sağ: sparkline */}
        <div className="flex-shrink-0">
          <Sparkline
            values={degerler}
            width={100}
            height={40}
            color={sparklineRenk}
            labels={labels}
            highlightIndex={hoveredIdx ?? undefined}
            onHover={setHoveredIdx}
          />
        </div>
      </div>

      {/* Hover tooltip satırı */}
      {aktifNokta && (
        <div className="mt-1 flex items-center justify-between rounded bg-white/70 px-1.5 py-0.5 text-[9px] text-slate-600 ring-1 ring-slate-200/50">
          <span className="font-medium">{aktifNokta.hafta}</span>
          <span className="tabular-nums">{aktifNokta.medyanPerM2.toLocaleString("tr-TR")} TL/m²</span>
          <span className="text-slate-400">{aktifNokta.ilanAdet} ilan</span>
        </div>
      )}

      {/* Veri eksikliği uyarısı — az nokta */}
      {gorunenNoktalar.length < 8 && (
        <p className="mt-1 text-[9px] italic text-slate-400">
          Az veri — daha uzun dönem için bu bölgede ilan gezmeye devam edin.
        </p>
      )}

      {/* Projeksiyon bölümü — backend verisi varsa göster */}
      {projeksiyon && projeksiyon.projeksiyon.length > 0 && (
        <div className="mt-2 border-t border-dashed border-slate-200 pt-2">
          {/* Toggle başlık */}
          <button
            type="button"
            onClick={() => setProjeAcik(v => !v)}
            className="flex w-full items-center justify-between text-[9px] font-medium text-slate-500 hover:text-slate-700 transition"
          >
            <span className="flex items-center gap-1">
              <ChevronRightIcon className={`h-2.5 w-2.5 transition-transform ${projeAcik ? "rotate-90" : ""}`} />
              6 aylık projeksiyon
            </span>
            {/* Reel değişim badge */}
            <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold tabular-nums ${
              projeksiyon.ruelDegisimYuzde > 0
                ? "bg-emerald-50 text-emerald-700"
                : projeksiyon.ruelDegisimYuzde < 0
                  ? "bg-red-50 text-red-700"
                  : "bg-slate-100 text-slate-600"
            }`}>
              Reel {projeksiyon.ruelDegisimYuzde > 0 ? "+" : ""}{projeksiyon.ruelDegisimYuzde}%
            </span>
          </button>

          {projeAcik && (
            <div className="mt-1.5 space-y-0.5">
              {/* Geçmiş + projeksiyon mini tablo */}
              <div className="grid grid-cols-3 gap-x-1 text-[8px] text-slate-400 pb-0.5">
                <span>Ay/Yıl</span>
                <span className="text-right">Tahmin</span>
                <span className="text-right">Güven Aralığı</span>
              </div>
              {projeksiyon.projeksiyon.map((p) => (
                <div key={`${p.yil}-${p.ay}`} className="grid grid-cols-3 gap-x-1 text-[9px]">
                  <span className="text-slate-500 font-medium">{p.ay}/{p.yil}</span>
                  <span className="text-right tabular-nums font-semibold text-slate-700">
                    {p.tahmin.toLocaleString("tr-TR")}
                  </span>
                  <span className="text-right tabular-nums text-slate-400 text-[8px]">
                    {p.guven_alt.toLocaleString("tr-TR")}–{p.guven_ust.toLocaleString("tr-TR")}
                  </span>
                </div>
              ))}

              {/* Meta bilgi */}
              <div className="mt-1 flex items-center justify-between text-[8px] text-slate-400">
                <span>OLS lineer regresyon · R²={projeksiyon.r2}</span>
                <span>
                  {projeksiyon.trend === "yukseliyor" ? "↑ Yükseliyor" : projeksiyon.trend === "dusuyor" ? "↓ Düşüyor" : "→ Yatay"}
                  {" · "}{projeksiyon.aylikEgimTlm2 > 0 ? "+" : ""}{projeksiyon.aylikEgimTlm2.toLocaleString("tr-TR")} TL/ay
                </span>
              </div>
              <p className="text-[8px] italic text-slate-300">
                ⚠ Projeksiyon istatistiksel tahmin, garanti değildir.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
