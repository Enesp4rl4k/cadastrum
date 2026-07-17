/**
 * Parsel Zaman Makinesi — W1
 *
 * İnteraktif fiyat geçmişi modal'ı:
 *   - Backend mahalle_zaman_serisi'nden aylık medyan ₺/m²
 *   - Zaman aralığı seçici: 6ay / 1yıl / 2yıl / tümü
 *   - Nominal / Reel (enflasyon ayarlı) toggle
 *   - 6 aylık OLS projeksiyon overlay
 *   - Hover tooltip: tarih, fiyat, ilan adeti
 *   - Trend özet badge: toplam % + aylık % değişim
 */

import { useEffect, useRef, useState } from "react";
import {
  X as XIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Minus as MinusIcon,
  Clock as ClockIcon,
  Info as InfoIcon,
  Loader2 as LoaderIcon,
} from "lucide-react";
import { trendProjesyonGetir, type TrendProjesyonSonuc } from "../../lib/fiyat-trendi";
import type { FiyatTrendi } from "../../lib/db";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AyNoktasi {
  label: string; // "Oca 2024"
  yil: number;
  ay: number;
  nominal: number;    // orijinal TL/m²
  reel: number;       // enflasyon ayarlı TL/m²
  ilanAdet: number;
  projeksiyon?: boolean;
}

type AralikSecim = "6ay" | "1yil" | "2yil" | "tum";

interface Props {
  il: string;
  ilce: string;
  mahalle: string;
  kategori?: FiyatTrendi["kategori"];
  onKapat: () => void;
}

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const AYLAR_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz",
                  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

/** Aylık TÜFE yaklaşımı — geriye dönük reel hesap için */
const AYLIK_TUFE = 0.03;

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function ayLabel(yil: number, ay: number): string {
  return `${AYLAR_TR[(ay - 1) % 12]} ${yil}`;
}

/** Geçmiş + projeksiyon noktalarını AyNoktasi'na dönüştür */
function veriHazirla(sonuc: TrendProjesyonSonuc): AyNoktasi[] {
  const tum = sonuc.gecmis.length;
  const noktalar: AyNoktasi[] = sonuc.gecmis.map((g, i) => {
    // Reel: son noktayı referans al, geriye doğru enflasyon deflate et
    const aySonraBitis = tum - 1 - i;
    const reelFactor = Math.pow(1 + AYLIK_TUFE, aySonraBitis);
    return {
      label: ayLabel(g.yil, g.ay),
      yil: g.yil,
      ay: g.ay,
      nominal: g.medyan,
      reel: Math.round(g.medyan / reelFactor),
      ilanAdet: g.ilan_adet,
      projeksiyon: false,
    };
  });

  // Projeksiyon noktaları
  const sonReel = noktalar[noktalar.length - 1]?.reel ?? 0;
  for (let i = 0; i < sonuc.projeksiyon.length; i++) {
    const p = sonuc.projeksiyon[i]!;
    const reelFactor = Math.pow(1 + AYLIK_TUFE, i + 1);
    noktalar.push({
      label: ayLabel(p.yil, p.ay),
      yil: p.yil,
      ay: p.ay,
      nominal: p.tahmin,
      reel: Math.round(sonReel * reelFactor), // ileriye projeksiyon
      ilanAdet: 0,
      projeksiyon: true,
    });
  }

  return noktalar;
}

/** Aralik seçimine göre gösterilecek noktaları filtrele */
function aralikFiltrele(noktalar: AyNoktasi[], aralik: AralikSecim): AyNoktasi[] {
  const gercek = noktalar.filter(n => !n.projeksiyon);
  if (aralik === "tum") return noktalar;

  const nAy = aralik === "6ay" ? 6 : aralik === "1yil" ? 12 : 24;
  const kesme = Math.max(0, gercek.length - nAy);
  return noktalar.slice(kesme);
}

// ─── SVG Chart bileşeni ───────────────────────────────────────────────────────

interface ChartProps {
  noktalar: AyNoktasi[];
  mod: "nominal" | "reel";
  onHover: (idx: number | null) => void;
  hoveredIdx: number | null;
}

function ZamanChart({ noktalar, mod, onHover, hoveredIdx }: ChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  if (noktalar.length < 2) return null;

  const W = 480;
  const H = 180;
  const PAD = { top: 16, right: 16, bottom: 32, left: 56 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const degerler = noktalar.map(n => mod === "nominal" ? n.nominal : n.reel);
  const minV = Math.min(...degerler) * 0.95;
  const maxV = Math.max(...degerler) * 1.05;
  const rangeV = maxV - minV || 1;

  const xOf = (i: number) => PAD.left + (i / (noktalar.length - 1)) * cW;
  const yOf = (v: number) => PAD.top + cH - ((v - minV) / rangeV) * cH;

  // Gerçek ve projeksiyon noktaları ayır
  const gercekIdx = noktalar.findIndex(n => n.projeksiyon);
  const sinirIdx = gercekIdx === -1 ? noktalar.length : gercekIdx;

  // SVG path oluştur
  const pathFor = (pts: AyNoktasi[], startI: number) =>
    pts
      .map((n, i) => {
        const v = mod === "nominal" ? n.nominal : n.reel;
        return `${i === 0 ? "M" : "L"}${xOf(startI + i).toFixed(1)},${yOf(v).toFixed(1)}`;
      })
      .join(" ");

  const gercekPts = noktalar.slice(0, sinirIdx);
  const projePts = sinirIdx < noktalar.length ? noktalar.slice(sinirIdx - 1) : [];

  // Fill area (sadece gerçek veriler)
  const areaPath =
    gercekPts.length > 1
      ? `${pathFor(gercekPts, 0)} L${xOf(sinirIdx - 1).toFixed(1)},${(PAD.top + cH).toFixed(1)} L${PAD.left.toFixed(1)},${(PAD.top + cH).toFixed(1)} Z`
      : "";

  // Y ekseni etiketleri (3 seviye)
  const yTicks = [minV, minV + rangeV / 2, maxV].map(v => ({
    v,
    label: v >= 1_000_000
      ? `${(v / 1_000_000).toFixed(1)}M`
      : v >= 1_000
        ? `${Math.round(v / 1_000)}K`
        : `${Math.round(v)}`,
    y: yOf(v),
  }));

  // X ekseni: sadece çeyrek noktalar
  const xStep = Math.max(1, Math.floor(noktalar.length / 5));
  const xLabels = noktalar
    .map((n, i) => ({ i, n }))
    .filter(({ i }) => i % xStep === 0 || i === noktalar.length - 1);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      onMouseLeave={() => onHover(null)}
      onMouseMove={(e) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const rx = ((e.clientX - rect.left) / rect.width) * W;
        const relX = rx - PAD.left;
        const idx = Math.round((relX / cW) * (noktalar.length - 1));
        onHover(Math.max(0, Math.min(noktalar.length - 1, idx)));
      }}
    >
      {/* Grid yatay çizgiler */}
      {yTicks.map((t, i) => (
        <line
          key={i}
          x1={PAD.left} y1={t.y}
          x2={PAD.left + cW} y2={t.y}
          stroke="#e2e8f0" strokeWidth="0.5"
        />
      ))}

      {/* Fill area */}
      {areaPath && (
        <path d={areaPath} fill="#3b82f6" fillOpacity="0.08" />
      )}

      {/* Gerçek veri çizgisi */}
      {gercekPts.length > 1 && (
        <path
          d={pathFor(gercekPts, 0)}
          fill="none" stroke="#3b82f6" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
        />
      )}

      {/* Projeksiyon çizgisi (kesikli) */}
      {projePts.length > 1 && (
        <path
          d={pathFor(projePts, sinirIdx - 1)}
          fill="none" stroke="#94a3b8" strokeWidth="1.5"
          strokeDasharray="4 3"
          strokeLinecap="round" strokeLinejoin="round"
        />
      )}

      {/* Y ekseni etiketleri */}
      {yTicks.map((t, i) => (
        <text
          key={i}
          x={PAD.left - 4} y={t.y + 4}
          textAnchor="end" fontSize="9" fill="#94a3b8"
        >
          {t.label}
        </text>
      ))}

      {/* X ekseni etiketleri */}
      {xLabels.map(({ i, n }) => (
        <text
          key={i}
          x={xOf(i)} y={H - 4}
          textAnchor="middle" fontSize="8.5" fill="#94a3b8"
        >
          {AYLAR_TR[(n.ay - 1) % 12]} {String(n.yil).slice(2)}
        </text>
      ))}

      {/* Hover kılavuz çizgisi */}
      {hoveredIdx !== null && (
        <line
          x1={xOf(hoveredIdx)} y1={PAD.top}
          x2={xOf(hoveredIdx)} y2={PAD.top + cH}
          stroke="#64748b" strokeWidth="1" strokeDasharray="3 2"
        />
      )}

      {/* Veri noktaları (her n'inci + hover) */}
      {noktalar.map((n, i) => {
        const v = mod === "nominal" ? n.nominal : n.reel;
        const isHov = hoveredIdx === i;
        const showDot = isHov || i % xStep === 0 || i === noktalar.length - 1;
        if (!showDot) return null;
        return (
          <circle
            key={i}
            cx={xOf(i)} cy={yOf(v)}
            r={isHov ? 4 : 2.5}
            fill={n.projeksiyon ? "#94a3b8" : "#3b82f6"}
            stroke="white" strokeWidth="1.5"
          />
        );
      })}
    </svg>
  );
}

// ─── Ana Modal bileşeni ───────────────────────────────────────────────────────

export function ZamanMakinesiModal({ il, ilce, mahalle, kategori = "tum", onKapat }: Props) {
  const [veri, setVeri] = useState<TrendProjesyonSonuc | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [aralik, setAralik] = useState<AralikSecim>("1yil");
  const [mod, setMod] = useState<"nominal" | "reel">("nominal");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    setYukleniyor(true);
    setHata(null);
    trendProjesyonGetir(il, ilce, mahalle, kategori)
      .then((d) => {
        if (!d) setHata("Bu bölge için yeterli veri yok.");
        else setVeri(d);
      })
      .catch(() => setHata("Veri alınamadı, lütfen tekrar deneyin."))
      .finally(() => setYukleniyor(false));
  }, [il, ilce, mahalle, kategori]);

  // ESC ile kapat
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onKapat(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onKapat]);

  const tumNoktalar = veri ? veriHazirla(veri) : [];
  const gorunenler = aralikFiltrele(tumNoktalar, aralik);
  const aktifNokta = hoveredIdx !== null ? gorunenler[hoveredIdx] : null;

  // Trend hesapla (sadece gerçek veriler üzerinden)
  const gercekler = gorunenler.filter(n => !n.projeksiyon);
  const ilkFiyat = mod === "nominal" ? (gercekler[0]?.nominal ?? 0) : (gercekler[0]?.reel ?? 0);
  const sonFiyat = mod === "nominal"
    ? (gercekler[gercekler.length - 1]?.nominal ?? 0)
    : (gercekler[gercekler.length - 1]?.reel ?? 0);
  const toplamDegisim = ilkFiyat > 0
    ? Math.round(((sonFiyat - ilkFiyat) / ilkFiyat) * 1000) / 10
    : 0;
  const trendYon = toplamDegisim > 2 ? "artan" : toplamDegisim < -2 ? "dusen" : "yatay";

  const TrendIkon = trendYon === "artan" ? TrendingUpIcon : trendYon === "dusen" ? TrendingDownIcon : MinusIcon;
  const trendRenk = trendYon === "artan" ? "text-emerald-600" : trendYon === "dusen" ? "text-red-500" : "text-slate-500";

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onKapat(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Parsel Zaman Makinesi"
    >
      {/* Panel */}
      <div className="w-full max-w-lg rounded-t-2xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ClockIcon className="h-4 w-4 text-blue-500" />
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Zaman Makinesi</h2>
              <p className="text-[10px] text-slate-400">
                {mahalle ? `${mahalle} · ` : ""}{ilce} fiyat geçmişi
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onKapat}
            aria-label="Kapat"
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 transition"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {yukleniyor && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
              <LoaderIcon className="h-6 w-6 animate-spin" />
              <p className="text-xs">Fiyat geçmişi yükleniyor…</p>
            </div>
          )}

          {hata && !yukleniyor && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
              <InfoIcon className="h-5 w-5 text-amber-500 mx-auto mb-1" />
              <p className="text-xs text-amber-700">{hata}</p>
              <p className="text-[10px] text-amber-500 mt-1">
                Veri birikimcisi arka planda çalışıyor — bu bölgede ilan gezmeye devam edin.
              </p>
            </div>
          )}

          {veri && !yukleniyor && (
            <>
              {/* Özet KPI'lar */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2.5 text-center">
                  <div className="text-[10px] text-slate-400 mb-0.5">Mevcut Fiyat</div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                    {(sonFiyat).toLocaleString("tr-TR")}
                  </div>
                  <div className="text-[9px] text-slate-400">TL/m²</div>
                </div>
                <div className={`rounded-lg p-2.5 text-center ${
                  trendYon === "artan" ? "bg-emerald-50 dark:bg-emerald-900/30"
                  : trendYon === "dusen" ? "bg-red-50 dark:bg-red-900/30"
                  : "bg-slate-50 dark:bg-slate-800"
                }`}>
                  <div className="text-[10px] text-slate-400 mb-0.5">Toplam Değişim</div>
                  <div className={`text-sm font-bold tabular-nums flex items-center justify-center gap-0.5 ${trendRenk}`}>
                    <TrendIkon className="h-3.5 w-3.5" />
                    {toplamDegisim > 0 ? "+" : ""}{toplamDegisim}%
                  </div>
                  <div className="text-[9px] text-slate-400">{aralik === "tum" ? "tüm dönem" : aralik}</div>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2.5 text-center">
                  <div className="text-[10px] text-slate-400 mb-0.5">Aylık Eğim</div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                    {veri.aylikEgimTlm2 > 0 ? "+" : ""}{veri.aylikEgimTlm2.toLocaleString("tr-TR")}
                  </div>
                  <div className="text-[9px] text-slate-400">TL/m²/ay</div>
                </div>
              </div>

              {/* Kontroller */}
              <div className="flex items-center justify-between gap-2">
                {/* Zaman aralığı */}
                <div className="flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 gap-0.5">
                  {(["6ay", "1yil", "2yil", "tum"] as AralikSecim[]).map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => { setAralik(a); setHoveredIdx(null); }}
                      className={`px-2 py-1 rounded-md text-[10px] font-medium transition ${
                        aralik === a
                          ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {a === "tum" ? "Tümü" : a === "1yil" ? "1 Yıl" : a === "2yil" ? "2 Yıl" : "6 Ay"}
                    </button>
                  ))}
                </div>

                {/* Nominal/Reel toggle */}
                <button
                  type="button"
                  onClick={() => setMod(m => m === "nominal" ? "reel" : "nominal")}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition border ${
                    mod === "reel"
                      ? "border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "border-slate-200 bg-white dark:bg-slate-800 text-slate-500"
                  }`}
                  title="Enflasyon ayarlı reel fiyat"
                >
                  {mod === "reel" ? "Reel ✓" : "Reel"}
                </button>
              </div>

              {/* Chart */}
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-3">
                <ZamanChart
                  noktalar={gorunenler}
                  mod={mod}
                  onHover={setHoveredIdx}
                  hoveredIdx={hoveredIdx}
                />

                {/* Hover tooltip */}
                <div className={`mt-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-3 py-2 transition ${
                  aktifNokta ? "opacity-100" : "opacity-0 pointer-events-none"
                }`} style={{ minHeight: "40px" }}>
                  {aktifNokta && (
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{aktifNokta.label}</span>
                      <span className="tabular-nums font-bold text-slate-800 dark:text-slate-100">
                        {(mod === "nominal" ? aktifNokta.nominal : aktifNokta.reel).toLocaleString("tr-TR")} TL/m²
                      </span>
                      {aktifNokta.ilanAdet > 0 && (
                        <span className="text-slate-400">{aktifNokta.ilanAdet} ilan</span>
                      )}
                      {aktifNokta.projeksiyon && (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">tahmin</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Proyeksiyon notu */}
              {veri.projeksiyon.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
                  <InfoIcon className="h-3.5 w-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                  <p className="text-[10px] text-slate-400">
                    Kesikli çizgi 6 aylık OLS lineer projeksiyon (R²={veri.r2}). Garanti değildir.
                    {mod === "reel" && " Reel değerler aylık ~%3 TÜFE yaklaşımıyla hesaplanmıştır."}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-2.5">
          <p className="text-[9px] text-slate-300 dark:text-slate-600 text-center">
            Veri kaynağı: Cadastrum kolektif ilan havuzu · mahalle_zaman_serisi
          </p>
        </div>
      </div>
    </div>
  );
}
