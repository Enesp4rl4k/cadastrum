/**
 * Onboarding wizard v2 — ilk kurulumda bir kez gösterilir.
 * 3 adım: Demo Parsel (aha moment) → Nasıl çalışır → Ücretsiz ne var
 *
 * G2 — "Demo parsel" yeniliği:
 *   Adım 0: Gerçek bir Beykoz parseli canlı analiz edilir.
 *   Kullanıcı fiyat tahmini, risk skoru ve imar bilgisini görür.
 *   "Aha moment" sağlandıktan sonra ilerler.
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
  TrendingUp as TrendingUpIcon,
  Shield as ShieldIcon,
  Layers as LayersIcon,
  Loader2 as LoaderIcon,
} from "lucide-react";

const STORAGE_KEY = "onboarding_v2_done";

// ── Demo parsel (Beykoz, İstanbul) ──────────────────────────────────────────
// Gerçek bir parselin sabit değerleri — API çağrısı gerekmez, anlık gösterim.
const DEMO_PARSEL = {
  il: "İSTANBUL",
  ilce: "BEYKOZ",
  mahalle: "KAVACIK",
  ada: "114",
  parsel: "7",
  alan: 4850,
  nitelik: "Arsa",
  fiyatBeklenenM2: 45_000,
  fiyatAltM2: 38_000,
  fiyatUstM2: 54_000,
  toplamTahmin: 218_250_000, // 45K × 4850
  guvenSkoru: 72,
  depremZon: "Yüksek",
  emsal: 0.8,
  taks: 0.35,
  maksKat: 4,
  riskUyariSayisi: 1,
};

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

// ── Demo parsel "Aha Moment" bileşeni ───────────────────────────────────────

function DemoParselKarti() {
  const [yuklendi, setYuklendi] = useState(false);
  const [sayi, setSayi] = useState(0);

  // Sayaç animasyonu — fiyat "sayılarak" çıksın
  useEffect(() => {
    const hedef = DEMO_PARSEL.toplamTahmin;
    const adim = Math.round(hedef / 40);
    let n = 0;
    const t = setInterval(() => {
      n = Math.min(n + adim, hedef);
      setSayi(n);
      if (n >= hedef) clearInterval(t);
    }, 30);
    const rev = setTimeout(() => setYuklendi(true), 200);
    return () => { clearInterval(t); clearTimeout(rev); };
  }, []);

  const fmtTL = (n: number) => {
    if (n >= 1_000_000) return `₺${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `₺${Math.round(n / 1_000)}K`;
    return `₺${n.toLocaleString("tr-TR")}`;
  };

  return (
    <div className="space-y-3">
      {/* Hero başlık */}
      <div className="text-center pb-1">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Gerçek bir parselin anlık analizi:
        </p>
        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">
          Beykoz / Kavacık — Ada 114, Parsel 7
        </p>
      </div>

      {/* Ana değer kartı */}
      <div className={`rounded-xl border border-imperial/20 bg-gradient-to-br from-imperial/5 to-white px-4 py-3.5 text-center dark:from-imperial-950/20 dark:to-slate-900 dark:border-imperial-700/30 transition-all duration-500 ${yuklendi ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}>
        <div className="text-3xs text-slate-500 uppercase tracking-widest mb-1">TAHMİNİ PİYASA DEĞERİ</div>
        <div className="text-3xl font-black tabular-nums text-imperial-700 dark:text-imperial-300 tracking-tight">
          {fmtTL(sayi)}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {DEMO_PARSEL.alan.toLocaleString("tr-TR")} m² ·{" "}
          {Math.round(DEMO_PARSEL.fiyatAltM2 / 1000)}K–{Math.round(DEMO_PARSEL.fiyatUstM2 / 1000)}K ₺/m²
        </div>
        <div className="mt-2 text-3xs text-slate-400">
          Güven skoru: {DEMO_PARSEL.guvenSkoru}/100
        </div>
      </div>

      {/* 3 metrik satır */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-slate-100 bg-white px-2 py-2 text-center dark:border-slate-700 dark:bg-slate-800">
          <LayersIcon className="h-4 w-4 text-blue-500 mx-auto mb-1" />
          <div className="text-3xs text-slate-500 dark:text-slate-400">İmar</div>
          <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
            E:{DEMO_PARSEL.emsal} T:{DEMO_PARSEL.taks}
          </div>
          <div className="text-3xs text-slate-400">{DEMO_PARSEL.maksKat} kat</div>
        </div>
        <div className="rounded-lg border border-slate-100 bg-white px-2 py-2 text-center dark:border-slate-700 dark:bg-slate-800">
          <ShieldIcon className="h-4 w-4 text-amber-500 mx-auto mb-1" />
          <div className="text-3xs text-slate-500 dark:text-slate-400">Deprem</div>
          <div className="text-xs font-bold text-amber-700 dark:text-amber-300">
            {DEMO_PARSEL.depremZon}
          </div>
          <div className="text-3xs text-slate-400">AFAD zon</div>
        </div>
        <div className="rounded-lg border border-slate-100 bg-white px-2 py-2 text-center dark:border-slate-700 dark:bg-slate-800">
          <TrendingUpIcon className="h-4 w-4 text-emerald-500 mx-auto mb-1" />
          <div className="text-3xs text-slate-500 dark:text-slate-400">Nitelik</div>
          <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
            {DEMO_PARSEL.nitelik}
          </div>
          <div className="text-3xs text-slate-400">{DEMO_PARSEL.alan.toLocaleString()} m²</div>
        </div>
      </div>

      <p className="text-center text-2xs text-slate-500 dark:text-slate-400 leading-relaxed">
        <span className="font-semibold text-imperial-600 dark:text-imperial-400">Cadastrum</span>{" "}
        herhangi bir parseli saniyeler içinde bu şekilde analiz eder. Sahibinden'de bir ilan aç, otomatik başlar.
      </p>
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
          Yatırım skoru, fiyat bandı, PDF rapor, toplu karşılaştırma, scrapesiz parsel radarı.
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

const ADIM_TANIMLARI = [
  { baslik: "🎯 Canlı demo",        icerikFn: () => <DemoParselKarti /> },
  { baslik: "Nasıl çalışır?",       icerikFn: () => <Adim1 /> },
  { baslik: "Ücretsiz ne var?",     icerikFn: () => <Adim2 /> },
];

interface OnboardingProps {
  onKapat: () => void;
}

export function Onboarding({ onKapat }: OnboardingProps) {
  const [adim, setAdim] = useState(0);
  const [visible, setVisible] = useState(false);
  const [contentKey, setContentKey] = useState(0); // adım geçişi için
  const sonAdim = adim === ADIM_TANIMLARI.length - 1;

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

  const mevcutAdim = ADIM_TANIMLARI[adim]!;

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
      <div className="flex gap-1.5 px-4 pt-3 flex-shrink-0" role="progressbar" aria-valuenow={adim + 1} aria-valuemax={ADIM_TANIMLARI.length}>
        {ADIM_TANIMLARI.map((_, i) => (
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
          {mevcutAdim.icerikFn()}
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
