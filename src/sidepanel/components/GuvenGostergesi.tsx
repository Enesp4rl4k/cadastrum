/**
 * Güven Göstergesi — sayısal "65/100" yerine insan dostu açıklama.
 *
 * Örnek çıktılar:
 *   🟢 "8 mahalle emsalinden · son 18 gün · yüksek güven"
 *   🟡 "3 ilçe emsalinden · son 45 gün · orta güven"
 *   🔴 "Mahallede ilan yok · ilçe istatistiğiyle tahmin · düşük güven"
 *
 * Ayrıca 5 segmentli progress bar ile görsel güven seviyesi.
 * Tooltip ile detay (outlier, döviz dönüşüm, emsal benzerliği).
 */

import type { FiyatTahmini } from "../../lib/fiyat-tahmin";

interface Props {
  tahmin: FiyatTahmini;
  /** Kompakt mod — sadece badge, progress bar yok */
  kompakt?: boolean;
}

/** Baseline kaynağını insan dostu metne çevir */
function baselineAciklama(
  kaynak: FiyatTahmini["baselineKaynak"],
  adet: number,
  emsalOzeti: FiyatTahmini["emsalOzeti"],
): string {
  const n = emsalOzeti?.secilenAdet ?? adet;
  switch (kaynak) {
    case "spatial-radius":
      return `${n} koordinatlı ilan · coğrafi ağırlıklı`;
    case "ilanGozlem-mahalle":
      return `${n} mahalle ilanından`;
    case "ilanGozlem-ilce":
      return `${n} ilçe ilanından`;
    case "mahalle-baseline":
      return `mahalle istatistiğiyle`;
    case "ilce-semt-baseline":
      return `semt ortalamasıyla`;
    case "ilce-baseline":
      return `ilçe ortalamasıyla`;
    case "il-baseline":
      return `il ortalamasıyla (kaba tahmin)`;
    case "fallback":
      return `genel ortalama (en düşük güven)`;
    default:
      return `${n} kayıttan`;
  }
}

/** Tazelik bilgisini kısa metne çevir */
function tazelikAciklama(ozet: FiyatTahmini["tazelikOzeti"]): string | null {
  if (!ozet) return null;
  if (ozet.son30Gun > 0) return `son ${ozet.ortalamaYasGun} gün`;
  if (ozet.son90Gun > 0) return `son ${ozet.ortalamaYasGun} gün`;
  if (ozet.tazeAdet > 0) return `~${ozet.ortalamaYasGun} gün`;
  return null;
}

/** Güven skoru → 5 segmentli doluluk (0-5) */
function skorSegment(skor: number): number {
  if (skor >= 80) return 5;
  if (skor >= 65) return 4;
  if (skor >= 50) return 3;
  if (skor >= 35) return 2;
  if (skor >= 20) return 1;
  return 0;
}

/** Segment renkleri */
const SEGMENT_RENKLER = [
  "bg-red-400",
  "bg-red-400",
  "bg-amber-400",
  "bg-amber-400",
  "bg-emerald-500",
  "bg-emerald-500",
];

const SEVIYE_IKONLAR: Record<FiyatTahmini["guven"], string> = {
  yuksek: "🟢",
  orta: "🟡",
  dusuk: "🔴",
};

const SEVIYE_RENKLER: Record<FiyatTahmini["guven"], string> = {
  yuksek: "text-emerald-700",
  orta: "text-amber-700",
  dusuk: "text-red-600",
};

export function GuvenGostergesi({ tahmin, kompakt = false }: Props) {
  const { guven, guvenSkoru, baselineKaynak, baselineAdet, tazelikOzeti, emsalOzeti } = tahmin;

  const seviye = guven;
  const ikon = SEVIYE_IKONLAR[seviye];
  const renk = SEVIYE_RENKLER[seviye];
  const segment = skorSegment(guvenSkoru);

  const kaynak = baselineAciklama(baselineKaynak, baselineAdet, emsalOzeti);
  const tazelik = tazelikAciklama(tazelikOzeti);

  // Ana açıklama metni: "8 mahalle ilanından · son 18 gün"
  const anaMetin = [kaynak, tazelik].filter(Boolean).join(" · ");

  // Detay tooltip için ek bilgiler
  const tooltipParcalar: string[] = [];
  if (emsalOzeti?.outlierAdet && emsalOzeti.outlierAdet > 0) {
    tooltipParcalar.push(`${emsalOzeti.outlierAdet} aykırı ilan elendi`);
  }
  if (emsalOzeti?.dovizDonusturulenAdet && emsalOzeti.dovizDonusturulenAdet > 0) {
    tooltipParcalar.push(`${emsalOzeti.dovizDonusturulenAdet} dövizli TL'ye çevrildi`);
  }
  if (emsalOzeti?.ortalamaBenzerlik) {
    tooltipParcalar.push(`%${Math.round(emsalOzeti.ortalamaBenzerlik * 100)} benzerlik`);
  }
  if (tazelikOzeti?.stalAdet && tazelikOzeti.stalAdet > 0) {
    tooltipParcalar.push(`${tazelikOzeti.stalAdet} eski ilan atıldı`);
  }
  const tooltip = tooltipParcalar.length > 0
    ? `Skor ${guvenSkoru}/100 · ${tooltipParcalar.join(" · ")}`
    : `Güven skoru: ${guvenSkoru}/100`;

  if (kompakt) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-3xs font-medium ${renk}`}
        title={tooltip}
      >
        <span>{ikon}</span>
        <span>{anaMetin}</span>
      </span>
    );
  }

  return (
    <div
      className="space-y-1"
      title={tooltip}
    >
      {/* Birinci satır: ikon + ana metin */}
      <div className={`flex items-center gap-1.5 text-3xs font-medium ${renk}`}>
        <span>{ikon}</span>
        <span className="flex-1">{anaMetin}</span>
        <span className="tabular-nums text-[9px] text-slate-400 font-mono">{guvenSkoru}/100</span>
      </div>

      {/* Progress bar — 5 segment */}
      <div
        className="flex gap-0.5"
        role="meter"
        aria-valuenow={guvenSkoru}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Güven skoru: ${guvenSkoru}/100`}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < segment
                ? (SEGMENT_RENKLER[segment - 1] ?? "bg-slate-300")
                : "bg-slate-200 dark:bg-slate-700"
            }`}
          />
        ))}
      </div>

      {/* Güven kırılımı chips — ilk 3 */}
      {tahmin.guvenKirilimi.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tahmin.guvenKirilimi.slice(0, 3).map((k) => (
            <span
              key={k.etiket}
              className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                k.durum === "pozitif"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : k.durum === "uyari"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
              }`}
            >
              <span>{k.puan > 0 ? "+" : ""}{k.puan}</span>
              <span>{k.etiket}</span>
            </span>
          ))}
          {tahmin.guvenKirilimi.length > 3 && (
            <span className="text-[9px] text-slate-400 self-center">
              +{tahmin.guvenKirilimi.length - 3} daha
            </span>
          )}
        </div>
      )}
    </div>
  );
}
