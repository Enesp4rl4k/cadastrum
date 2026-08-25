/**
 * Fiyat Bileşen Grafiği — Waterfall chart.
 *
 * Fiyat tahmin motorunun `bilesenler` array'ini görselleştirir.
 * Her bileşen baseline fiyata nasıl etki etti gösterilir:
 *   - Yeşil bar: pozitif çarpan (değer artışı)
 *   - Kırmızı bar: negatif çarpan (değer düşüşü)
 *   - Gri bar: baseline
 *
 * Dependency yok — inline SVG, Tailwind ile.
 * FiyatTahminKarti'ya eklenir, "neden bu fiyat?" sorusunu yanıtlar.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import type { FiyatBileseni } from "../../lib/fiyat-tahmin";

// ─── Tipler ──────────────────────────────────────────────────────────────────

interface Props {
  /** fiyat-tahmin.ts `bilesenler` array */
  bilesenler: FiyatBileseni[];
  /** Baseline TL/m² */
  baselineFiyat: number;
  /** Nihai beklenen TL/m² */
  beklenenFiyat: number;
  /** Compact mod: sidebar'da dar görünüm */
  compact?: boolean;
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function fmtYuzde(carpan: number): string {
  const delta = (carpan - 1) * 100;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

function carpanRenk(carpan: number): {
  bar: string;
  badge: string;
  text: string;
} {
  if (carpan > 1.005) return {
    bar:   "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    text:  "text-emerald-700",
  };
  if (carpan < 0.995) return {
    bar:   "bg-red-400",
    badge: "bg-red-50 text-red-700 ring-red-600/20",
    text:  "text-red-600",
  };
  return {
    bar:   "bg-slate-300",
    badge: "bg-slate-50 text-slate-600 ring-slate-500/10",
    text:  "text-slate-500",
  };
}

// ─── Alt bileşenler ───────────────────────────────────────────────────────────

interface SatirProps {
  ad: string;
  carpan: number;
  not: string;
  barGenislikYuzde: number;
  offsetYuzde: number;
  compact: boolean;
}

function WaterfallSatir({
  ad,
  carpan,
  not,
  barGenislikYuzde,
  offsetYuzde,
  compact,
}: SatirProps) {
  const [tooltip, setTooltip] = useState(false);
  const renkler = carpanRenk(carpan);
  const isPositive = carpan >= 1.0;

  return (
    <div className="group relative">
      {/* Satır başlık + badge */}
      <div className={`flex items-center gap-1.5 ${compact ? "mb-0.5" : "mb-1"}`}>
        <span
          className={`min-w-0 flex-1 truncate ${compact ? "text-2xs" : "text-xs"} text-slate-600 dark:text-slate-400`}
          title={ad}
        >
          {ad}
        </span>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-semibold ring-1 ring-inset ${renkler.badge}`}
        >
          {fmtYuzde(carpan)}
        </span>
        {/* Açıklama ikonu */}
        <button
          type="button"
          aria-label={`${ad} hakkında bilgi`}
          onClick={() => setTooltip((prev: boolean) => !prev)}
          className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Info aria-hidden="true" className="h-3 w-3" />
        </button>
      </div>

      {/* Waterfall bar */}
      <div className="relative h-3 w-full overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-800">
        {/* Offset (boşluk — önceki bileşenlerin kümülatif etkisi) */}
        <div
          className="absolute inset-y-0 left-0 bg-transparent"
          style={{ width: `${offsetYuzde}%` }}
          aria-hidden="true"
        />
        {/* Gerçek bar */}
        <div
          className={`absolute inset-y-0 rounded-sm transition-all duration-300 ${renkler.bar}`}
          style={{
            left:  isPositive ? `${offsetYuzde}%` : `${offsetYuzde - barGenislikYuzde}%`,
            width: `${Math.max(barGenislikYuzde, 0.5)}%`,
          }}
          role="img"
          aria-label={`${ad}: ${fmtYuzde(carpan)}`}
        />
      </div>

      {/* Tooltip — açıklama metni */}
      {tooltip && (
        <div
          className="absolute left-0 top-full z-30 mt-1 w-full max-w-xs rounded-md border border-slate-200 bg-white px-2.5 py-2 text-2xs text-slate-600 shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          role="tooltip"
        >
          {not || "Açıklama yok"}
          <button
            type="button"
            aria-label="Kapat"
            onClick={() => setTooltip(false)}
            className="absolute right-1.5 top-1.5 text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Ana bileşen ─────────────────────────────────────────────────────────────

export function FiyatBilesenGrafigi({
  bilesenler,
  baselineFiyat,
  beklenenFiyat,
  compact = false,
}: Props) {
  const [acik, setAcik] = useState(false);

  if (!bilesenler || bilesenler.length === 0) return null;

  // Kümülatif çarpan hesabı — her satır önceki durumu biliyor
  // Tüm carpanlar birleşince baseline → beklenen geçişi oluşur
  const toplamCarpan = bilesenler.reduce((acc, b) => acc * b.carpan, 1);
  const maksEtki = Math.max(...bilesenler.map((b) => Math.abs(b.carpan - 1)));

  // Bar normalize: en büyük etki = %40 genişlik
  const MAKS_BAR_GENISLIK = 40;
  const scale = maksEtki > 0 ? MAKS_BAR_GENISLIK / maksEtki : 1;

  // Kümülatif offset hesabı — bar'ların başlangıç noktası
  let kumulatifOffset = 50; // orta nokta
  const satirVerileri = bilesenler.map((b) => {
    const etki = (b.carpan - 1);
    const barGenislik = Math.abs(etki) * scale;
    const offset = b.carpan >= 1.0 ? kumulatifOffset : kumulatifOffset - barGenislik;
    kumulatifOffset += etki * scale;
    return { barGenislik, offsetYuzde: Math.max(0, Math.min(95, offset)) };
  });

  // Fiyat değişimi özeti
  const fiyatDelta = beklenenFiyat - baselineFiyat;
  const fiyatDeltaYuzde = baselineFiyat > 0
    ? ((fiyatDelta / baselineFiyat) * 100).toFixed(1)
    : "0";
  const deltaPositive = fiyatDelta >= 0;

  const gizlenecekSayisi = bilesenler.length > 4 ? bilesenler.length - 4 : 0;
  const gorunenler = acik ? bilesenler : bilesenler.slice(0, 4);
  const gorunenSatirlar = acik ? satirVerileri : satirVerileri.slice(0, 4);

  return (
    <div className={`rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 ${compact ? "p-3" : "p-4"}`}>
      {/* Başlık */}
      <div className="mb-3 flex items-center justify-between">
        <h4 className={`font-semibold text-slate-800 dark:text-slate-100 ${compact ? "text-xs" : "text-sm"}`}>
          Fiyat Bileşenleri
        </h4>
        {/* Toplam etki rozeti */}
        <span
          className={`rounded-full px-2 py-0.5 text-2xs font-bold ring-1 ring-inset ${
            deltaPositive
              ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
              : "bg-red-50 text-red-700 ring-red-600/20"
          }`}
        >
          {deltaPositive ? "+" : ""}{fiyatDeltaYuzde}% toplam etki
        </span>
      </div>

      {/* Baseline + Nihai fiyat özeti */}
      <div className={`mb-3 flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800 ${compact ? "text-2xs" : "text-xs"}`}>
        <span className="text-slate-500">Baseline:</span>
        <span className="font-medium text-slate-700 dark:text-slate-300">
          {baselineFiyat.toLocaleString("tr-TR")} ₺/m²
        </span>
        <span className="text-slate-400">→</span>
        <span className={`font-bold ${deltaPositive ? "text-emerald-700" : "text-red-600"}`}>
          {beklenenFiyat.toLocaleString("tr-TR")} ₺/m²
        </span>
        <span className="text-slate-400 dark:text-slate-500">
          (×{toplamCarpan.toFixed(3)})
        </span>
      </div>

      {/* Waterfall satırları */}
      <div className={`space-y-2 ${compact ? "space-y-1.5" : "space-y-2"}`}>
        {gorunenler.map((bilesen, i) => {
          const satirKey = `${bilesen.ad}-${i}`;
          return (
            <WaterfallSatir
              key={satirKey}
              ad={bilesen.ad}
              carpan={bilesen.carpan}
              not={bilesen.not}
              barGenislikYuzde={gorunenSatirlar[i]?.barGenislik ?? 0}
              offsetYuzde={gorunenSatirlar[i]?.offsetYuzde ?? 50}
              compact={compact}
            />
          );
        })}
      </div>

      {/* Daha fazla / daha az butonu */}
      {gizlenecekSayisi > 0 && (
        <button
          type="button"
          onClick={() => setAcik((prev: boolean) => !prev)}
          className={`mt-2 flex w-full items-center justify-center gap-1 rounded-md py-1.5 text-2xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800 dark:hover:text-slate-300`}
          aria-expanded={acik}
        >
          {acik ? (
            <>
              <ChevronUp aria-hidden="true" className="h-3 w-3" />
              Daha az göster
            </>
          ) : (
            <>
              <ChevronDown aria-hidden="true" className="h-3 w-3" />
              {gizlenecekSayisi} bileşen daha
            </>
          )}
        </button>
      )}

      {/* Metodoloji notu */}
      <p className="mt-2 text-2xs text-slate-400 dark:text-slate-600">
        Her çarpan bir öncekinin üzerine uygulanır. Baseline × tüm çarpanlar = beklenen fiyat.
      </p>
    </div>
  );
}
