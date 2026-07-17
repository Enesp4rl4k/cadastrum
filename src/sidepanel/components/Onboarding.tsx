/**
 * Onboarding wizard — ilk kurulumda bir kez gösterilir.
 * 2 adım: Nasıl çalışır → Ücretsiz ne var
 *
 * Motion (Emil Kowalski lens — restraint):
 *   • Overlay enter: slide-up + fade (300ms out-expo)
 *   • Adım geçişi: content fade + translateY(6px) (220ms out-quart)
 *   • prefers-reduced-motion: instant
 */
import { useState, useEffect, useRef } from "react";
import {
  ExternalLink as ExternalLinkIcon,
  CheckCircle2 as CheckIcon,
  ChevronRight as ChevronRightIcon,
  X as XIcon,
  MapPin as MapPinIcon,
  Building2 as Building2Icon,
  Sparkles as SparklesIcon,
  ArrowLeft as ArrowLeftIcon,
} from "lucide-react";

const STORAGE_KEY = "onboarding_v1_done";

/* ─── Hook ─────────────────────────────────────────────────────────────── */

export function useOnboardingGoster(): [boolean, () => void] {
  const [goster, setGoster] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setGoster(true);
    } catch { /* localStorage erişilemiyorsa gösterme */ }
  }, []);

  const kapat = () => {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setGoster(false);
  };

  return [goster, kapat];
}

/* ─── Step content ─────────────────────────────────────────────────────── */

function Adim1() {
  return (
    <div className="space-y-5">
      <AdimSatir
        n={1}
        icon={<ExternalLinkIcon className="h-4 w-4" />}
        baslik="Desteklenen sitede ilan aç"
        aciklama="Sahibinden veya Hepsiemlak'ta bir arsa ilanına git. Cadastrum otomatik olarak ilanı tanır."
        eylem={
          <div className="flex gap-2 flex-wrap">
            <SiteLink href="https://www.sahibinden.com/satilik-arsa" color="orange">
              sahibinden.com
            </SiteLink>
            <SiteLink href="https://www.hepsiemlak.com/arsa-satilik" color="blue">
              hepsiemlak.com
            </SiteLink>
          </div>
        }
      />
      <AdimSatir
        n={2}
        icon={<Building2Icon className="h-4 w-4" />}
        baslik="TKGM + e-Plan otomatik sorgulanır"
        aciklama="İlan açıldığında TKGM parsel kaydı ve e-Plan imar durumu arka planda çekilir, yan panelde sıralı gelir."
      />
      <AdimSatir
        n={3}
        icon={<MapPinIcon className="h-4 w-4" />}
        baslik="Mahalle emsali ve fiyat tahmini"
        aciklama="Yakın çevredeki satış ilanlarından medyan hesaplanır. Free planda 3 AI analizi/gün."
      />
    </div>
  );
}

function Adim2() {
  const ucretsizler = [
    "Sınırsız TKGM parsel sorgusu",
    "e-Plan imar durumu (TAKS, KAKS, Emsal)",
    "Deprem risk skoru (AFAD PGA)",
    "Mahalle bazlı emsal fiyat",
    "3 AI fiyat tahmini / gün",
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/80 dark:border-emerald-800/60 p-3.5">
        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 mb-2.5">
          Free planda her zaman ücretsiz:
        </p>
        <ul className="space-y-2">
          {ucretsizler.map((m) => (
            <li key={m} className="flex items-start gap-2 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckIcon className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
              {m}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-tkgm-primary/20 bg-tkgm-primary/5 p-3.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <SparklesIcon className="h-3.5 w-3.5 text-tkgm-primary" aria-hidden="true" />
          <p className="text-xs font-semibold text-tkgm-primary">Pro'da ek özellikler:</p>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          Sınırsız AI analizi, PDF rapor, toplu parsel karşılaştırma, watchlist bildirimleri.
        </p>
        <a
          href="https://cadastrum.com.tr/fiyat"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2.5 text-xs font-medium text-tkgm-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tkgm-primary/40 rounded"
        >
          Planları gör <ChevronRightIcon className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

/* ─── Sub-components ────────────────────────────────────────────────────── */

function AdimSatir({
  n, icon, baslik, aciklama, eylem,
}: {
  n: number;
  icon: React.ReactNode;
  baslik: string;
  aciklama: string;
  eylem?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div
        className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-tkgm-primary/10 text-tkgm-primary"
        aria-hidden="true"
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-baseline gap-1.5 mb-0.5">
          <span className="text-3xs font-semibold text-slate-400 tabular-nums">0{n}</span>
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{baslik}</span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{aciklama}</p>
        {eylem && <div className="mt-2">{eylem}</div>}
      </div>
    </div>
  );
}

function SiteLink({
  href, color, children,
}: {
  href: string;
  color: "orange" | "blue";
  children: React.ReactNode;
}) {
  const cls = color === "orange"
    ? "bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:hover:bg-orange-900/30"
    : "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${cls}`}
    >
      {children}
      <ExternalLinkIcon className="h-3 w-3 opacity-60" aria-hidden="true" />
    </a>
  );
}

/* ─── Main component ────────────────────────────────────────────────────── */

const ADIMLAR = [
  { baslik: "Nasıl çalışır?",   icerik: <Adim1 /> },
  { baslik: "Ücretsiz ne var?", icerik: <Adim2 /> },
];

interface OnboardingProps {
  onKapat: () => void;
}

export function Onboarding({ onKapat }: OnboardingProps) {
  const [adim, setAdim] = useState(0);
  const [visible, setVisible] = useState(false);
  const [contentKey, setContentKey] = useState(0); // adım geçişi için
  const sonAdim = adim === ADIMLAR.length - 1;

  // Overlay enter animasyonu
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const ileri = () => {
    if (sonAdim) { onKapat(); return; }
    setAdim((a) => a + 1);
    setContentKey((k) => k + 1);
  };

  const geri = () => {
    setAdim((a) => a - 1);
    setContentKey((k) => k + 1);
  };

  const mevcutAdim = ADIMLAR[adim]!;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cadastrum'a hoş geldiniz"
      className="absolute inset-0 z-50 flex flex-col"
      style={{
        background: "var(--surface-1)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        transition: "opacity 300ms var(--out-expo), transform 300ms var(--out-expo)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--surface-3)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
            style={{ background: "linear-gradient(135deg, #1B2A4A 0%, #0d6efd 100%)" }}
            aria-hidden="true"
          >
            <Building2Icon className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Cadastrum'a hoş geldiniz
          </span>
        </div>
        <button
          type="button"
          onClick={onKapat}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors duration-150"
          aria-label="Onboarding'i kapat"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1.5 px-4 pt-3 flex-shrink-0" role="progressbar" aria-valuenow={adim + 1} aria-valuemax={ADIMLAR.length}>
        {ADIMLAR.map((_, i) => (
          <div
            key={i}
            className="h-[3px] flex-1 rounded-full overflow-hidden"
            style={{ background: "var(--surface-3)" }}
          >
            <div
              className="h-full rounded-full bg-tkgm-primary"
              style={{
                width: i <= adim ? "100%" : "0%",
                transition: "width 300ms var(--out-expo)",
              }}
            />
          </div>
        ))}
      </div>

      {/* Content — animasyonlu geçiş */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4">
          {mevcutAdim.baslik}
        </h2>
        <div
          key={contentKey}
          style={{
            animation: "onboarding-content-in 220ms var(--out-quart) forwards",
          }}
        >
          {mevcutAdim.icerik}
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 flex-shrink-0"
        style={{ borderTop: "1px solid var(--surface-3)" }}
      >
        {adim > 0 ? (
          <button
            type="button"
            onClick={geri}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors duration-150"
          >
            <ArrowLeftIcon className="h-3 w-3" />
            Geri
          </button>
        ) : (
          <button
            type="button"
            onClick={onKapat}
            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors duration-150"
          >
            Atla
          </button>
        )}

        <button
          type="button"
          onClick={ileri}
          className="flex items-center gap-1.5 rounded-lg bg-tkgm-primary px-4 py-2 text-xs font-semibold text-white hover:bg-tkgm-primary/90 active:scale-95 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tkgm-primary/50 focus-visible:ring-offset-1"
        >
          {sonAdim ? (
            <>
              <CheckIcon className="h-3.5 w-3.5" />
              Başla
            </>
          ) : (
            <>
              İleri
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
