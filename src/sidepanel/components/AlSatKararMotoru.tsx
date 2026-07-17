/**
 * W4 — AI "Al mı / Sat mı / Bekle" Karar Motoru
 *
 * Mevcut yatırım skoru + fiyat tahmini + risk verileri üzerinden
 * deterministik bir karar üretir. Dış AI API gerekmez.
 *
 * Karar mantığı:
 *   - AL:   yatırım skoru ≥65 VE fiyat avantajı ≥60 VE risk boyutu ≥50
 *   - SAT:  yatırım skoru <40 VEYA (fiyat çok yüksek VE risk çok yüksek)
 *   - BEKLE: diğer durumlar
 *
 * Risk/Fırsat matrisi: 5 boyutun 2×2 görünümü (düşük/yüksek risk × düşük/yüksek fırsat)
 */

import { useMemo } from "react";
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Clock as ClockIcon,
  CheckCircle2 as CheckIcon,
  XCircle as XIcon,
  AlertCircle as AlertIcon,
  Info as InfoIcon,
} from "lucide-react";
import type { YatirimSkoru, YatirimBoyutu } from "../../lib/yatirim-skoru";
import type { FiyatTahmini } from "../../lib/fiyat-tahmin";

// ─── Types ────────────────────────────────────────────────────────────────────

type Karar = "al" | "sat" | "bekle";

interface KararSonuc {
  karar: Karar;
  guven: "yuksek" | "orta" | "dusuk"; // kararın güven seviyesi
  ozet: string;
  gerekceler: { tip: "pozitif" | "negatif" | "notr"; metin: string }[];
  riskSkoru: number;   // 0-100 (yüksek = riskli)
  firsatSkoru: number; // 0-100 (yüksek = cazip fırsat)
}

interface Props {
  skor: YatirimSkoru;
  fiyat?: FiyatTahmini | null;
  trendYillikDegisim?: number | null;
}

// ─── Karar motoru fonksiyonu ──────────────────────────────────────────────────

function boyutBul(boyutlar: YatirimBoyutu[], ad: string): number {
  return boyutlar.find(b => b.ad === ad)?.skor ?? 50;
}

function kararHesapla(skor: YatirimSkoru, fiyat: FiyatTahmini | null | undefined, trendYillikDegisim: number | null | undefined): KararSonuc {
  const fiyatAvantaj = boyutBul(skor.boyutlar, "Fiyat avantajı");
  const likidite     = boyutBul(skor.boyutlar, "Likidite");
  const lojistik     = boyutBul(skor.boyutlar, "Lojistik");
  const risk         = boyutBul(skor.boyutlar, "Risk");
  const imarPotansiyel = boyutBul(skor.boyutlar, "İmar potansiyeli");
  const buyumeTrendi  = boyutBul(skor.boyutlar, "Büyüme trendi");

  // Risk skoru: düşük risk boyutu = yüksek risk skoru (ters)
  const riskSkoru = Math.round(100 - risk);
  // Fırsat skoru: fiyat avantajı + imar + büyüme ortalaması
  const firsatSkoru = Math.round((fiyatAvantaj + imarPotansiyel + buyumeTrendi) / 3);

  // Gerekçe listesi
  const gerekceler: KararSonuc["gerekceler"] = [];

  if (fiyatAvantaj >= 70) gerekceler.push({ tip: "pozitif", metin: "Bölge medyanının altında fiyat — cazip giriş noktası" });
  else if (fiyatAvantaj >= 50) gerekceler.push({ tip: "notr", metin: "Fiyat bölge ortalaması civarında" });
  else gerekceler.push({ tip: "negatif", metin: "Fiyat bölge medyanının üstünde — prim ödeniyor" });

  if (buyumeTrendi >= 65) gerekceler.push({ tip: "pozitif", metin: `Bölgede güçlü fiyat artış trendi${trendYillikDegisim != null ? ` (+%${trendYillikDegisim.toFixed(0)}/yıl)` : ""}` });
  else if (buyumeTrendi >= 40) gerekceler.push({ tip: "notr", metin: "Bölgede ılımlı fiyat hareketi" });
  else gerekceler.push({ tip: "negatif", metin: "Bölgede zayıf veya negatif fiyat trendi" });

  if (risk >= 70) gerekceler.push({ tip: "pozitif", metin: "Düşük doğal afet riski — güvenli bölge" });
  else if (risk < 40) gerekceler.push({ tip: "negatif", metin: "Yüksek deprem/taşkın riski — uzun vadeli değer kaybı riski" });

  if (imarPotansiyel >= 65) gerekceler.push({ tip: "pozitif", metin: "Yüksek imar potansiyeli — değer artış katalizörü" });
  else if (imarPotansiyel < 35) gerekceler.push({ tip: "negatif", metin: "Düşük imar potansiyeli — kısıtlı geliştirme imkânı" });

  if (likidite >= 70) gerekceler.push({ tip: "pozitif", metin: "Yüksek likidite — çıkış kolaylığı" });
  else if (likidite < 40) gerekceler.push({ tip: "negatif", metin: "Düşük likidite — çıkış süresi uzun olabilir" });

  if (lojistik >= 65) gerekceler.push({ tip: "pozitif", metin: "İyi altyapı ve erişim" });

  // Güven tahmini: düşük fiyat güveni varsa karar güveni de düşük
  const fiyatGuven = fiyat?.guvenSkoru ?? 50;
  const kararGuven: KararSonuc["guven"] =
    fiyatGuven >= 60 && skor.toplam !== 50 ? "yuksek" :
    fiyatGuven >= 35 ? "orta" : "dusuk";

  // Karar
  let karar: Karar;
  let ozet: string;

  if (skor.toplam >= 65 && fiyatAvantaj >= 55 && risk >= 45) {
    karar = "al";
    ozet = skor.toplam >= 80
      ? "Güçlü AL sinyali — fiyat, trend ve risk faktörleri uyumlu"
      : "AL değerlendirilebilir — çoğunluk faktör olumlu";
  } else if (skor.toplam < 35 || (fiyatAvantaj < 30 && risk < 35)) {
    karar = "sat";
    ozet = "SAT / ALMA önerilir — risk/fiyat dengesi olumsuz";
  } else {
    karar = "bekle";
    ozet = skor.toplam >= 55
      ? "İzle ve bekle — bazı faktörler netleşmeye ihtiyaç duyuyor"
      : "Dikkatli yaklaş — faktörlerin yarısı olumsuz";
  }

  return { karar, guven: kararGuven, ozet, gerekceler, riskSkoru, firsatSkoru };
}

// ─── UI yardımcıları ──────────────────────────────────────────────────────────

function kararRenk(karar: Karar): { bg: string; border: string; text: string; badge: string } {
  switch (karar) {
    case "al":    return { bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-300 dark:border-emerald-700", text: "text-emerald-800 dark:text-emerald-300", badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200" };
    case "sat":   return { bg: "bg-red-50 dark:bg-red-900/20",        border: "border-red-300 dark:border-red-700",        text: "text-red-800 dark:text-red-300",         badge: "bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-200" };
    case "bekle": return { bg: "bg-amber-50 dark:bg-amber-900/20",    border: "border-amber-300 dark:border-amber-700",    text: "text-amber-800 dark:text-amber-300",     badge: "bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-200" };
  }
}

function KararIkon({ karar, size = 5 }: { karar: Karar; size?: number }) {
  const cls = `h-${size} w-${size}`;
  switch (karar) {
    case "al":    return <TrendingUpIcon className={cls} />;
    case "sat":   return <TrendingDownIcon className={cls} />;
    case "bekle": return <ClockIcon className={cls} />;
  }
}

function kararEtiket(karar: Karar): string {
  switch (karar) {
    case "al":    return "AL";
    case "sat":   return "ALMA / SAT";
    case "bekle": return "İZLE & BEKLE";
  }
}

function guvenEtiket(g: KararSonuc["guven"]): string {
  switch (g) {
    case "yuksek": return "Yüksek güven";
    case "orta":   return "Orta güven";
    case "dusuk":  return "Düşük güven";
  }
}

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────

export function AlSatKararMotoru({ skor, fiyat, trendYillikDegisim }: Props) {
  const sonuc = useMemo(
    () => kararHesapla(skor, fiyat, trendYillikDegisim),
    [skor, fiyat, trendYillikDegisim],
  );

  const r = kararRenk(sonuc.karar);

  return (
    <div className="space-y-2 mt-2">
      {/* Ana karar kartı */}
      <div className={`rounded-lg border-2 ${r.border} ${r.bg} p-3`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={r.text}>
              <KararIkon karar={sonuc.karar} size={6} />
            </span>
            <div>
              <div className={`text-base font-extrabold tracking-wide ${r.text}`}>
                {kararEtiket(sonuc.karar)}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                {sonuc.ozet}
              </div>
            </div>
          </div>
          {/* Güven badge */}
          <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${r.badge}`}>
            {guvenEtiket(sonuc.guven)}
          </span>
        </div>

        {/* Risk/Fırsat mini bar */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[9px] text-slate-500">Risk</span>
              <span className="text-[9px] font-bold tabular-nums text-slate-600">{sonuc.riskSkoru}</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className={`h-full rounded-full ${sonuc.riskSkoru >= 60 ? "bg-red-400" : sonuc.riskSkoru >= 35 ? "bg-amber-400" : "bg-emerald-400"}`}
                style={{ width: `${sonuc.riskSkoru}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[9px] text-slate-500">Fırsat</span>
              <span className="text-[9px] font-bold tabular-nums text-slate-600">{sonuc.firsatSkoru}</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className={`h-full rounded-full ${sonuc.firsatSkoru >= 60 ? "bg-emerald-500" : sonuc.firsatSkoru >= 35 ? "bg-amber-400" : "bg-red-400"}`}
                style={{ width: `${sonuc.firsatSkoru}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Gerekçeler listesi */}
      <div className="space-y-1">
        {sonuc.gerekceler.map((g, i) => (
          <div key={i} className="flex items-start gap-1.5 text-[10px]">
            {g.tip === "pozitif" && <CheckIcon className="h-3 w-3 text-emerald-500 flex-shrink-0 mt-0.5" />}
            {g.tip === "negatif" && <XIcon className="h-3 w-3 text-red-500 flex-shrink-0 mt-0.5" />}
            {g.tip === "notr"    && <AlertIcon className="h-3 w-3 text-amber-500 flex-shrink-0 mt-0.5" />}
            <span className={
              g.tip === "pozitif" ? "text-slate-700 dark:text-slate-200" :
              g.tip === "negatif" ? "text-slate-600 dark:text-slate-300" :
              "text-slate-500 dark:text-slate-400"
            }>{g.metin}</span>
          </div>
        ))}
      </div>

      {/* Yasal uyarı */}
      <div className="flex items-start gap-1.5 rounded bg-slate-50 dark:bg-slate-800 px-2 py-1.5">
        <InfoIcon className="h-3 w-3 text-slate-400 flex-shrink-0 mt-0.5" />
        <p className="text-[9px] italic text-slate-400">
          Bu karar heuristik model çıktısıdır, finansal tavsiye değildir. Yatırım kararı vermeden önce uzman görüşü alın.
        </p>
      </div>
    </div>
  );
}
