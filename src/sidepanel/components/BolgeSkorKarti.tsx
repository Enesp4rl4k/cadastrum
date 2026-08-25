/**
 * Bölge Gelişim Skoru Kartı
 *
 * bolge-skor-motoru.ts'ten hesaplanan skoru görselleştirir.
 * Extension AnalizPanel içinden parsel ilçe bilgisiyle kullanılır.
 *
 * Görünüm:
 *   - Toplam skor (büyük daire gauge, renk kodlu)
 *   - 5 boyut progress bar (her biri kendi rengiyle)
 *   - Piyasa sınıfı badge (Yüksek / Orta / İzle / Düşük)
 *   - Özet metin
 *   - Veri kalitesi uyarısı (eksik veri varsa)
 */

import { useEffect, useState } from "react";
import {
  TrendingUp as TrendingUpIcon,
  Building2 as BuildingIcon,
  Users as UsersIcon,
  Map as MapIcon,
  DollarSign as DollarIcon,
  Loader2 as LoaderIcon,
  AlertCircle as AlertIcon,
  RefreshCw as RefreshIcon,
} from "lucide-react";
import {
  bolgeSkorHesapla,
  type BolgeSkorSonuc,
  type BolgeSkorBoyutu,
} from "../../lib/bolge-skor-motoru";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  ilNorm: string;
  ilceNorm: string;
  ilceKodu: number;
  /** İlçe merkez koordinatı — altyapı mesafe hesabı için */
  lat: number;
  lng: number;
  /** Arsa medyan TL/m² (opsiyonel — parsel detayından) */
  arsaMedianTlm2?: number | null;
}

// ── Boyut renkleri ────────────────────────────────────────────────────────────

const BOYUT_RENK: Record<string, string> = {
  "İşlem Momentumu":  "#7c3aed",
  "Likidite Derinliği": "#0891b2",
  "Altyapı Yakınlığı": "#d97706",
  "Nüfus Baskısı":    "#16a34a",
  "Fiyat Erişimi":    "#2563eb",
};

const BOYUT_IKON: Record<string, typeof TrendingUpIcon> = {
  "İşlem Momentumu":  TrendingUpIcon,
  "Likidite Derinliği": MapIcon,
  "Altyapı Yakınlığı": BuildingIcon,
  "Nüfus Baskısı":    UsersIcon,
  "Fiyat Erişimi":    DollarIcon,
};

// ── Alt bileşenler ────────────────────────────────────────────────────────────

function BoyutSatir({ boyut }: { boyut: BolgeSkorBoyutu }) {
  const pct = Math.round((boyut.puan / boyut.maksimum) * 100);
  const renk = BOYUT_RENK[boyut.ad] ?? "#6366f1";
  const Ikon = BOYUT_IKON[boyut.ad] ?? TrendingUpIcon;

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 min-w-0">
          <Ikon className="h-3 w-3 flex-shrink-0" style={{ color: renk }} />
          <span className="truncate text-[10px] font-medium text-slate-700 dark:text-slate-300">
            {boyut.ad}
          </span>
        </div>
        <span className="flex-shrink-0 text-[10px] font-bold tabular-nums" style={{ color: renk }}>
          {boyut.puan.toFixed(0)}/{boyut.maksimum}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: renk }}
        />
      </div>
      <p className="text-[9px] leading-tight text-slate-400 dark:text-slate-500">
        {boyut.aciklama}
      </p>
    </div>
  );
}

function SkorDairesi({ skor, renk }: { skor: number; renk: string }) {
  // SVG daire gauge — circumference = 2πr = 2π×22 ≈ 138
  const R = 22;
  const C = 2 * Math.PI * R;
  const doluluk = (skor / 100) * C;

  return (
    <div className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center">
      <svg viewBox="0 0 56 56" className="h-16 w-16 -rotate-90">
        {/* Arka plan daire */}
        <circle
          cx="28" cy="28" r={R}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="5"
          className="dark:stroke-slate-700"
        />
        {/* Skor doldurma */}
        <circle
          cx="28" cy="28" r={R}
          fill="none"
          stroke={renk}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${doluluk} ${C - doluluk}`}
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-lg font-black leading-none tabular-nums" style={{ color: renk }}>
          {skor}
        </span>
        <span className="text-[8px] font-medium text-slate-400">/ 100</span>
      </div>
    </div>
  );
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────

export function BolgeSkorKarti({ ilNorm, ilceNorm, ilceKodu, lat, lng, arsaMedianTlm2 }: Props) {
  const [sonuc, setSonuc] = useState<BolgeSkorSonuc | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [acik, setAcik] = useState(false);

  async function hesapla() {
    setYukleniyor(true);
    setHata(null);
    const ctrl = new AbortController();
    try {
      const r = await bolgeSkorHesapla(
        { ilNorm, ilceNorm, ilceKodu, lat, lng, arsaMedianTlm2 },
        ctrl.signal,
      );
      setSonuc(r);
      setAcik(true);
    } catch (e) {
      if (!(e instanceof Error && e.message === "aborted")) {
        setHata(e instanceof Error ? e.message : "Hesaplama başarısız");
      }
    } finally {
      setYukleniyor(false);
    }
  }

  // İlçe değişince sıfırla
  useEffect(() => {
    setSonuc(null);
    setHata(null);
    setAcik(false);
  }, [ilceKodu]);

  const eksikVeri = sonuc && Object.values(sonuc.veriKalitesi).some((v) => !v);

  return (
    <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 p-3 dark:border-indigo-800 dark:from-indigo-950/30 dark:to-blue-950/20">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-lg" role="img" aria-label="skor">🔮</span>
          <div>
            <p className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
              Bölge Gelişim Skoru
            </p>
            <p className="text-[10px] text-indigo-600 dark:text-indigo-400">
              {ilceNorm.charAt(0).toUpperCase() + ilceNorm.slice(1)} · 5 boyut analizi
            </p>
          </div>
        </div>
        {sonuc && (
          <button
            type="button"
            onClick={hesapla}
            title="Yeniden hesapla"
            className="rounded-full p-1 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-indigo-900"
          >
            <RefreshIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Hesapla butonu (ilk açılış) */}
      {!sonuc && !yukleniyor && (
        <button
          type="button"
          onClick={hesapla}
          className="w-full rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
        >
          Bölge Potansiyelini Analiz Et
        </button>
      )}

      {/* Yükleniyor */}
      {yukleniyor && (
        <div className="flex items-center justify-center gap-2 py-4 text-indigo-500">
          <LoaderIcon className="h-4 w-4 animate-spin" />
          <span className="text-xs">TKGM verisi + altyapı analizi yapılıyor…</span>
        </div>
      )}

      {/* Hata */}
      {hata && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
          <AlertIcon className="h-3.5 w-3.5 flex-shrink-0" />
          {hata}
        </div>
      )}

      {/* Sonuç */}
      {sonuc && (
        <div className="space-y-3">
          {/* Özet satırı */}
          <div className="flex items-center gap-3">
            <SkorDairesi skor={sonuc.toplamSkor} renk={sonuc.sinifRenk} />
            <div className="flex-1 min-w-0">
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white mb-1"
                style={{ backgroundColor: sonuc.sinifRenk }}
              >
                {sonuc.sinif === "yuksek" ? "🔥 Yüksek Potansiyel" :
                 sonuc.sinif === "orta"   ? "📈 Orta Potansiyel" :
                 sonuc.sinif === "izle"   ? "👀 İzle" : "📉 Düşük Potansiyel"}
              </span>
              <p className="text-[10px] leading-relaxed text-slate-600 dark:text-slate-400">
                {sonuc.ozet}
              </p>
            </div>
          </div>

          {/* Boyutlar akordeonu */}
          <div>
            <button
              type="button"
              onClick={() => setAcik((v) => !v)}
              className="flex w-full items-center justify-between text-[10px] font-semibold text-indigo-700 dark:text-indigo-400 mb-1"
            >
              <span>Boyut Detayları</span>
              <span>{acik ? "▲" : "▼"}</span>
            </button>

            {acik && (
              <div className="space-y-2 rounded-lg bg-white p-2.5 shadow-sm dark:bg-slate-800">
                {Object.values(sonuc.boyutlar).map((boyut) => (
                  <BoyutSatir key={boyut.ad} boyut={boyut} />
                ))}
              </div>
            )}
          </div>

          {/* Eksik veri uyarısı */}
          {eksikVeri && (
            <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950/20">
              <AlertIcon className="h-3 w-3 flex-shrink-0 text-amber-500 mt-0.5" />
              <p className="text-[9px] text-amber-700 dark:text-amber-400">
                Bazı veri katmanları eksik (
                {[
                  !sonuc.veriKalitesi.tkgmVeriVar && "TKGM",
                  !sonuc.veriKalitesi.fiyatVeriVar && "fiyat",
                  !sonuc.veriKalitesi.nufusVeriVar && "nüfus",
                ].filter(Boolean).join(", ")}
                ). Skor tahmini — gerçek veriyle iyileşir.
              </p>
            </div>
          )}

          {/* Metodoloji notu */}
          <p className="text-[9px] text-slate-400 dark:text-slate-600">
            📊 Skor: TKGM momentum %30 · Likidite %20 · Altyapı %20 · Nüfus %15 · Fiyat %15
          </p>
        </div>
      )}
    </div>
  );
}
