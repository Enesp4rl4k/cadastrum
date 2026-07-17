/**
 * FiyatBantGostergesi — görsel fiyat aralığı + "neden bu kadar geniş" açıklaması.
 *
 * Görsel:
 *   Alt 1.8M ──[●]────────── 3.2M Üst
 *              2.5M (%±28)
 *
 * "Neden geniş" açıklaması: guvenKirilimi array'inden negatif faktörler özetlenir.
 */

import { fmtTL } from "../../lib/fiyat-tahmin";
import type { FiyatTahmini } from "../../lib/fiyat-tahmin";

interface Props {
  tahmin: FiyatTahmini;
}

/** Bant genişliğine göre renk — dar = yeşil, geniş = sarı/kırmızı */
function bantRengi(yuzde: number): {
  track: string;
  dot: string;
  metin: string;
  etiket: string;
} {
  if (yuzde <= 25) return {
    track: "bg-emerald-200",
    dot: "bg-emerald-500",
    metin: "text-emerald-700",
    etiket: "Dar (güvenilir)",
  };
  if (yuzde <= 45) return {
    track: "bg-amber-200",
    dot: "bg-amber-500",
    metin: "text-amber-700",
    etiket: "Orta",
  };
  return {
    track: "bg-red-200",
    dot: "bg-red-500",
    metin: "text-red-600",
    etiket: "Geniş (belirsiz)",
  };
}

/** guvenKirilimi'nden "neden geniş" negatif faktörleri özetle */
function nedenGenisFaktörler(
  kirilim: FiyatTahmini["guvenKirilimi"],
  baselineKaynak: FiyatTahmini["baselineKaynak"],
  aralikYuzde: number,
): string[] {
  const nedenler: string[] = [];

  // Baseline kaynak zayıfsa ilk neden o
  if (baselineKaynak === "fallback") {
    nedenler.push("Bu bölge için hiç ilan verisi yok");
  } else if (baselineKaynak === "il-baseline") {
    nedenler.push("İl ortalaması kullanıldı — mahalle verisi yok");
  } else if (baselineKaynak === "ilce-baseline" || baselineKaynak === "ilce-semt-baseline") {
    nedenler.push("İlçe/semt ortalaması — mahalle emsali yok");
  }

  // guvenKirilimi'nden negatif/uyarı faktörler
  for (const k of kirilim) {
    if (k.durum === "uyari" || (k.durum !== "pozitif" && k.puan < 0)) {
      if (k.etiket === "İmar belirsizliği") {
        nedenler.push("İmar durumu bilinmiyor (fiyatı %20–80 etkiler)");
      } else if (k.etiket === "Koruma bandı") {
        nedenler.push("Çarpanlar güvenli banda sıkıştırıldı");
      } else if (k.etiket === "Veri tazeliği") {
        nedenler.push("Emsal ilanlar eski (90+ gün)");
      } else {
        nedenler.push(k.etiket);
      }
    }
  }

  // Bant zaten geniş ama sebep bulunamadıysa genel açıklama
  if (nedenler.length === 0 && aralikYuzde > 40) {
    nedenler.push("Bölgede az sayıda emsal var");
  }

  return nedenler.slice(0, 3);
}

export function FiyatBantGostergesi({ tahmin }: Props) {
  const { toplamAlt, toplamUst, toplamBeklenen, aralikGenisligiYuzde, guvenKirilimi, baselineKaynak } = tahmin;

  const renkler = bantRengi(aralikGenisligiYuzde);

  // Beklenenin bant içindeki konumu (0–100)
  const aralik = toplamUst - toplamAlt;
  const dotPozisyon = aralik > 0
    ? Math.round(((toplamBeklenen - toplamAlt) / aralik) * 100)
    : 50;
  const dotPozisyonClamped = Math.max(4, Math.min(96, dotPozisyon));

  const nedenler = nedenGenisFaktörler(guvenKirilimi, baselineKaynak, aralikGenisligiYuzde);
  const bantGenisMi = aralikGenisligiYuzde > 35;

  return (
    <div className="rounded-md border border-slate-200 bg-white/80 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-800/80 space-y-2">
      {/* Başlık */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-3xs font-medium text-slate-600 dark:text-slate-400">
          Fiyat aralığı
        </span>
        <span className={`text-[10px] font-semibold tabular-nums ${renkler.metin}`}>
          ±%{Math.round(aralikGenisligiYuzde / 2)} · {renkler.etiket}
        </span>
      </div>

      {/* Görsel range bar */}
      <div className="space-y-1">
        {/* Track */}
        <div className="relative h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-700">
          {/* Dolu bölge (alt→üst) */}
          <div className={`absolute inset-y-0 left-0 right-0 rounded-full ${renkler.track} opacity-60`} />
          {/* Beklenen noktası */}
          <div
            className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white shadow-md ${renkler.dot}`}
            style={{ left: `calc(${dotPozisyonClamped}% - 8px)` }}
            title={`Beklenen: ${fmtTL(toplamBeklenen)}`}
            aria-label={`Beklenen fiyat: ${fmtTL(toplamBeklenen)}`}
          />
        </div>

        {/* Alt / Beklenen / Üst etiketler */}
        <div className="flex items-start justify-between text-[10px] tabular-nums">
          <div className="text-left">
            <div className="font-medium text-slate-500 dark:text-slate-400">Alt</div>
            <div className="font-semibold text-slate-700 dark:text-slate-200">{fmtTL(toplamAlt)}</div>
          </div>

          <div className="text-center">
            <div className="text-slate-400 dark:text-slate-500 text-[9px]">beklenen</div>
            <div className={`font-bold text-sm tabular-nums ${renkler.metin}`}>
              {fmtTL(toplamBeklenen)}
            </div>
          </div>

          <div className="text-right">
            <div className="font-medium text-slate-500 dark:text-slate-400">Üst</div>
            <div className="font-semibold text-slate-700 dark:text-slate-200">{fmtTL(toplamUst)}</div>
          </div>
        </div>
      </div>

      {/* "Neden bu kadar geniş" — sadece geniş bandlarda göster */}
      {bantGenisMi && nedenler.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50/70 px-2 py-1.5 dark:border-amber-800/40 dark:bg-amber-900/20">
          <div className="mb-1 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
            Neden bu kadar geniş?
          </div>
          <ul className="space-y-0.5">
            {nedenler.map((n, i) => (
              <li key={i} className="flex items-start gap-1 text-[10px] text-amber-700 dark:text-amber-300">
                <span className="mt-0.5 flex-shrink-0 text-amber-500">•</span>
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
