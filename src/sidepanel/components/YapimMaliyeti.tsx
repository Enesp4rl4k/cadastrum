/**
 * Yapım Maliyeti Hesaplayıcı — Sprint 4-C
 *
 * Çevre, Şehircilik ve İklim Değişikliği Bakanlığı güncel yapı birim fiyatları
 * (Temmuz 2026 — yıllık güncelleme yapılmalı).
 *
 * Hesaplama:
 *   İnşaat alanı × birim fiyat (TL/m²) = kaba yapım maliyeti
 *   + Altyapı (zemin hazırlık, çevre düzeni): %15
 *   + Proje, izin, kontrollük: %8
 *   + KDV (%20)
 *
 * Parsel imar verisi varsa (TAKS/KAKS/kat) otomatik hesaplanır.
 * Kullanıcı değerleri override edebilir.
 *
 * UYARI: Bu hesap tahmini rehber niteliğindedir.
 * Resmi keşif için lisanslı mühendis görüşü alınmalıdır.
 */
import { useState, useMemo } from "react";
import {
  Calculator as CalcIcon,
  ChevronDown as ChevronIcon,
  Info as InfoIcon,
} from "lucide-react";
import type { Parsel } from "../../types/tkgm";
import type { EPlanImarVerisi } from "../../lib/eplan";
import { Section, Row, MetricCard } from "../ui/Card";

// ── Birim fiyatlar (Bakanlık, Temmuz 2026) ───────────────────────────────────

interface YapiSinifi {
  id: string;
  ad: string;
  aciklama: string;
  tlM2: number; // TL/m² (KDV hariç kaba inşaat)
}

/** Yapı sınıfları — Çevre Bakanlığı 2026 yapı yaklaşık birim maliyetleri */
const YAPI_SINIFLARI: YapiSinifi[] = [
  {
    id: "depo-basit",
    ad: "Basit Depo / Ahır",
    aciklama: "Betonarme+çelik, tek kat, yalıtımsız",
    tlM2: 8_500,
  },
  {
    id: "sanayi",
    ad: "Sanayi Yapısı",
    aciklama: "Fabrika, atölye, çelik konstrüksiyon",
    tlM2: 14_000,
  },
  {
    id: "konut-ekonomik",
    ad: "Ekonomik Konut",
    aciklama: "Betonarme, basit malzeme, 2–4 kat",
    tlM2: 22_000,
  },
  {
    id: "konut-orta",
    ad: "Orta Kalite Konut",
    aciklama: "Betonarme, standart malzeme, 4–8 kat",
    tlM2: 32_000,
  },
  {
    id: "konut-lüks",
    ad: "Lüks Konut / Rezidans",
    aciklama: "Yüksek kalite malzeme, özel tasarım",
    tlM2: 55_000,
  },
  {
    id: "ofis-ticari",
    ad: "Ofis / Ticari Yapı",
    aciklama: "Betonarme, asma tavan, ticari donanım",
    tlM2: 38_000,
  },
  {
    id: "villa",
    ad: "Villa / Müstakil Konut",
    aciklama: "Müstakil, bahçeli, özel yapım",
    tlM2: 42_000,
  },
  {
    id: "hastane-okul",
    ad: "Kamu Yapısı (Okul/Hastane)",
    aciklama: "Betonarme, özel teknik donanım",
    tlM2: 48_000,
  },
];

// ── Yardımcı ──────────────────────────────────────────────────────────────────

function fmtTL(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} Milyar ₺`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)} M ₺`;
  if (n >= 1_000)         return `${Math.round(n / 1_000)} bin ₺`;
  return `${Math.round(n).toLocaleString("tr-TR")} ₺`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  parsel?: Parsel | null;
  ePlan?: EPlanImarVerisi | null;
}

// ── Bileşen ───────────────────────────────────────────────────────────────────

export function YapimMaliyeti({ parsel, ePlan }: Props) {
  const arsaAlanM2 = parsel?.alan ?? 0;

  // TAKS/KAKS'tan tahmini inşaat alanı
  const otomatikTakmAlan = arsaAlanM2 > 0 && ePlan?.taks && ePlan?.emsal
    ? Math.round(arsaAlanM2 * ePlan.emsal)
    : null;

  const [insaatAlanM2, setInsaatAlanM2] = useState<string>(
    otomatikTakmAlan ? String(otomatikTakmAlan) : ""
  );
  const [secilenSinif, setSecilenSinif] = useState<string>("konut-orta");
  const [altyapiYuzde, setAltyapiYuzde] = useState(15);
  const [projeyuzde, setProjeyuzde] = useState(8);
  const [kdvDahil, setKdvDahil] = useState(true);

  const sinif = YAPI_SINIFLARI.find((s) => s.id === secilenSinif) ?? YAPI_SINIFLARI[3]!;

  const hesap = useMemo(() => {
    const alan = parseFloat(insaatAlanM2) || 0;
    if (alan <= 0) return null;

    const kabaInsaat   = alan * sinif.tlM2;
    const altyapi      = kabaInsaat * (altyapiYuzde / 100);
    const projeIzin    = kabaInsaat * (projeyuzde / 100);
    const araToplam    = kabaInsaat + altyapi + projeIzin;
    const kdv          = kdvDahil ? araToplam * 0.20 : 0;
    const toplam       = araToplam + kdv;

    const m2Maliyet    = toplam / alan;

    return {
      kabaInsaat,
      altyapi,
      projeIzin,
      araToplam,
      kdv,
      toplam,
      m2Maliyet,
      alan,
    };
  }, [insaatAlanM2, sinif, altyapiYuzde, projeyuzde, kdvDahil]);

  return (
    <Section
      title="İnşaat Maliyet Tahmini"
      icon={<CalcIcon className="h-3.5 w-3.5" />}
      accent="neutral"
      subtitle={
        <span className="text-slate-400">Bakanlık 2026 birim fiyatları</span>
      }
    >
      <div className="space-y-3 pt-1">

        {/* İnşaat alanı */}
        <div className="space-y-1">
          <label className="text-2xs font-medium text-slate-600 dark:text-slate-400">
            İnşaat Alanı (m²)
          </label>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              value={insaatAlanM2}
              onChange={(e) => setInsaatAlanM2(e.target.value)}
              placeholder="örn. 500"
              min={1}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-tkgm-primary/30"
            />
            {otomatikTakmAlan && (
              <button
                type="button"
                onClick={() => setInsaatAlanM2(String(otomatikTakmAlan))}
                className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-2xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                title="TAKS×Alan = tahmini inşaat alanı"
              >
                KAKS: {otomatikTakmAlan.toLocaleString("tr-TR")} m²
              </button>
            )}
          </div>
          {arsaAlanM2 > 0 && ePlan?.emsal && (
            <p className="text-3xs text-slate-400">
              Parsel {arsaAlanM2.toLocaleString("tr-TR")} m² · Emsal {ePlan.emsal} → KAKS={otomatikTakmAlan?.toLocaleString("tr-TR")} m²
            </p>
          )}
        </div>

        {/* Yapı sınıfı */}
        <div className="space-y-1">
          <label className="text-2xs font-medium text-slate-600 dark:text-slate-400">
            Yapı Sınıfı / Kullanım
          </label>
          <div className="relative">
            <select
              value={secilenSinif}
              onChange={(e) => setSecilenSinif(e.target.value)}
              className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-tkgm-primary/30"
            >
              {YAPI_SINIFLARI.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ad} — {s.tlM2.toLocaleString("tr-TR")} TL/m²
                </option>
              ))}
            </select>
            <ChevronIcon className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
          <p className="text-3xs text-slate-400">{sinif.aciklama}</p>
        </div>

        {/* Gelişmiş ayarlar */}
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-2xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400">
            <ChevronIcon className="h-3 w-3 transition-transform group-open:rotate-180" />
            Gelişmiş ayarlar
          </summary>
          <div className="mt-2 space-y-2 pl-4">
            <label className="flex items-center justify-between gap-2 text-2xs text-slate-600 dark:text-slate-400">
              <span>Altyapı & çevre ({altyapiYuzde}%)</span>
              <input
                type="range"
                min={5}
                max={25}
                value={altyapiYuzde}
                onChange={(e) => setAltyapiYuzde(Number(e.target.value))}
                className="w-24 accent-tkgm-primary"
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-2xs text-slate-600 dark:text-slate-400">
              <span>Proje & izin ({projeyuzde}%)</span>
              <input
                type="range"
                min={3}
                max={15}
                value={projeyuzde}
                onChange={(e) => setProjeyuzde(Number(e.target.value))}
                className="w-24 accent-tkgm-primary"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-2xs text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={kdvDahil}
                onChange={(e) => setKdvDahil(e.target.checked)}
                className="h-3.5 w-3.5 accent-tkgm-primary"
              />
              KDV %20 ekle
            </label>
          </div>
        </details>

        {/* Sonuç */}
        {hesap && (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-800/40 dark:bg-amber-950/20">
            {/* Toplam */}
            <div className="text-center">
              <div className="text-3xs text-amber-700 dark:text-amber-300 font-medium uppercase tracking-wide mb-1">
                Tahmini Toplam Maliyet
              </div>
              <div className="text-2xl font-bold text-imperial-800 dark:text-imperial-200">
                {fmtTL(hesap.toplam)}
              </div>
              <div className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                {Math.round(hesap.m2Maliyet).toLocaleString("tr-TR")} ₺/m²
              </div>
            </div>

            {/* Detay */}
            <div className="space-y-0.5 border-t border-amber-200 dark:border-amber-800/40 pt-2">
              <Row label="Kaba inşaat" value={fmtTL(hesap.kabaInsaat)} />
              <Row label={`Altyapı (%${altyapiYuzde})`} value={fmtTL(hesap.altyapi)} tone="muted" />
              <Row label={`Proje & izin (%${projeyuzde})`} value={fmtTL(hesap.projeIzin)} tone="muted" />
              {kdvDahil && (
                <Row label="KDV (%20)" value={fmtTL(hesap.kdv)} tone="muted" />
              )}
              <div className="flex items-baseline justify-between gap-3 pt-1 text-2xs border-t border-amber-200 dark:border-amber-800/40">
                <span className="font-semibold text-slate-700 dark:text-slate-200">Toplam</span>
                <span className="font-bold text-imperial-800 dark:text-imperial-200 tabular-nums">
                  {fmtTL(hesap.toplam)}
                </span>
              </div>
            </div>

            {/* 3 senaryo */}
            <div className="grid grid-cols-3 gap-1.5 border-t border-amber-200 dark:border-amber-800/40 pt-2">
              <MetricCard
                label="Alt (%80)"
                value={fmtTL(hesap.toplam * 0.80)}
                accent="success"
                className="text-center"
              />
              <MetricCard
                label="Orta"
                value={fmtTL(hesap.toplam)}
                accent="warning"
                className="text-center"
              />
              <MetricCard
                label="Üst (%130)"
                value={fmtTL(hesap.toplam * 1.30)}
                accent="danger"
                className="text-center"
              />
            </div>
          </div>
        )}

        {/* Uyarı */}
        <div className="flex items-start gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/40">
          <InfoIcon className="h-3 w-3 shrink-0 text-slate-400 mt-0.5" />
          <p className="text-3xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Birim fiyatlar ÇŞİDB 2026 verileridir. Zemin koşulları, bölgesel işçilik ve özel
            tasarım maliyetleri eklenebilir. Resmi keşif için lisanslı mühendis görüşü alın.
          </p>
        </div>

      </div>
    </Section>
  );
}
