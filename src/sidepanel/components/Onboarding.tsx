/**
 * Onboarding wizard — ilk kurulumda bir kez gösterilir.
 * 3 adım: Desteklenen siteler → TKGM sonucu → Pro tanıtım
 * localStorage "onboarding_v1" flag'i ile kontrol edilir.
 */
import { useState, useEffect } from "react";
import {
  ExternalLink as ExternalLinkIcon,
  CheckCircle2 as CheckIcon,
  ChevronRight as ChevronRightIcon,
  X as XIcon,
  MapPin as MapPinIcon,
  Building2 as Building2Icon,
  Sparkles as SparklesIcon,
} from "lucide-react";

const STORAGE_KEY = "onboarding_v1_done";

interface AdimProps {
  n: number;
  baslik: string;
  aciklama: string;
  icon: React.ReactNode;
  eylem?: React.ReactNode;
}

function Adim({ n, baslik, aciklama, icon, eylem }: AdimProps) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-tkgm-primary/10 text-tkgm-primary">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-semibold text-slate-400">0{n}</span>
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{baslik}</span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{aciklama}</p>
        {eylem && <div className="mt-2">{eylem}</div>}
      </div>
    </div>
  );
}

export function useOnboardingGoster(): [boolean, () => void] {
  const [goster, setGoster] = useState(false);

  useEffect(() => {
    try {
      const done = localStorage.getItem(STORAGE_KEY);
      if (!done) setGoster(true);
    } catch {
      // localStorage erişilemiyorsa gösterme
    }
  }, []);

  const kapat = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch { /* ignore */ }
    setGoster(false);
  };

  return [goster, kapat];
}

interface OnboardingProps {
  onKapat: () => void;
}

export function Onboarding({ onKapat }: OnboardingProps) {
  const [adim, setAdim] = useState(0);

  const adimlar = [
    {
      baslik: "Nasıl çalışır?",
      icerik: (
        <div className="space-y-4">
          <Adim
            n={1}
            baslik="Desteklenen sitede ilan aç"
            aciklama="Sahibinden veya Hepsiemlak'ta bir arsa ilanına git. Cadastrum otomatik olarak ilanı tanır."
            icon={<ExternalLinkIcon className="h-4 w-4" />}
            eylem={
              <div className="flex gap-2">
                <a
                  href="https://www.sahibinden.com/satilik-arsa"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded px-2 py-1 bg-orange-50 text-orange-700 text-xs font-medium hover:bg-orange-100 transition"
                >
                  sahibinden.com →
                </a>
                <a
                  href="https://www.hepsiemlak.com/arsa-satilik"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded px-2 py-1 bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition"
                >
                  hepsiemlak.com →
                </a>
              </div>
            }
          />
          <Adim
            n={2}
            baslik="TKGM + e-Plan otomatik sorgulanır"
            aciklama="İlan açıldığında TKGM parsel kaydı ve e-Plan imar durumu arka planda çekilir, yan panelde sıralı gelir."
            icon={<Building2Icon className="h-4 w-4" />}
          />
          <Adim
            n={3}
            baslik="Mahalle emsali ve fiyat tahmini"
            aciklama="Yakın çevredeki satış ilanlarından medyan hesaplanır. Free planda 3 AI analizi/gün."
            icon={<MapPinIcon className="h-4 w-4" />}
          />
        </div>
      ),
    },
    {
      baslik: "Ücretsiz ne var?",
      icerik: (
        <div className="space-y-3">
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3">
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 mb-2">Free planda her zaman ücretsiz:</p>
            <ul className="space-y-1.5">
              {[
                "Sınırsız TKGM parsel sorgusu",
                "e-Plan imar durumu (TAKS, KAKS, Emsal)",
                "Deprem risk skoru (AFAD PGA)",
                "Mahalle bazlı emsal fiyat",
                "3 AI fiyat tahmini / gün",
              ].map((m) => (
                <li key={m} className="flex items-start gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                  <CheckIcon className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  {m}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg bg-tkgm-primary/5 border border-tkgm-primary/20 p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <SparklesIcon className="h-3.5 w-3.5 text-tkgm-primary" />
              <p className="text-xs font-semibold text-tkgm-primary">Pro'da ek özellikler:</p>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Sınırsız AI analizi, PDF rapor, toplu parsel karşılaştırma, watchlist bildirimleri.
            </p>
            <a
              href="https://cadastrum.com.tr/fiyat"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-tkgm-primary hover:underline"
            >
              Planları gör <ChevronRightIcon className="h-3 w-3" />
            </a>
          </div>
        </div>
      ),
    },
  ];

  const mevcutAdim = adimlar[adim] ?? adimlar[0]!;
  const sonAdim = adim === adimlar.length - 1;

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col bg-white dark:bg-slate-900"
      role="dialog"
      aria-modal="true"
      aria-label="Cadastrum'a hoş geldiniz"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-tkgm-primary/10 text-tkgm-primary">
            <Building2Icon className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Cadastrum'a hoş geldiniz</span>
        </div>
        <button
          type="button"
          onClick={onKapat}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 transition"
          aria-label="Onboarding'i kapat"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Adım göstergesi */}
      <div className="flex gap-1 px-4 pt-3">
        {adimlar.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= adim ? "bg-tkgm-primary" : "bg-slate-200 dark:bg-slate-700"
            }`}
          />
        ))}
      </div>

      {/* İçerik */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4">
          {mevcutAdim.baslik}
        </h2>
        {mevcutAdim.icerik}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
        {adim > 0 ? (
          <button
            type="button"
            onClick={() => setAdim(a => a - 1)}
            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition"
          >
            ← Geri
          </button>
        ) : (
          <button
            type="button"
            onClick={onKapat}
            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
          >
            Atla
          </button>
        )}

        <button
          type="button"
          onClick={sonAdim ? onKapat : () => setAdim(a => a + 1)}
          className="flex items-center gap-1.5 rounded-lg bg-tkgm-primary px-4 py-2 text-xs font-semibold text-white hover:bg-tkgm-primary/90 transition"
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
