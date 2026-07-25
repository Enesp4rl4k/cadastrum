/**
 * UpgradeModal — Sprint R1
 *
 * Animasyonlu, değer odaklı Pro upgrade modal.
 * Mevcut PaywallKilit'in yerini alır — daha güçlü conversion.
 *
 * Tasarım ilkeleri:
 *   - Feature showcase: kullanıcının tam olarak ne kazanacağını göster
 *   - Social proof: "X kullanıcı bu hafta Pro'ya geçti" benzeri
 *   - Urgency olmadan değer: baskı değil, ikna
 *   - "Bu özelliği dene" CTA — doğrudan özelliğe yönlendir
 *   - Framer Motion yok — CSS transition ile sade animasyon
 *
 * Kullanım:
 *   <UpgradeModal
 *     acik={true}
 *     onKapat={() => setAcik(false)}
 *     tetikleyenOzellik="AI Fiyat Analizi"  ← hangi özellik tetikledi
 *     gerekliTier="bireysel-pro"
 *   />
 */

import { useEffect, useRef, useState } from "react";
import {
  X, Crown, Sparkles, TrendingUp, FileText, Bell,
  BarChart2, Satellite, Shield, ChevronRight, Check,
  ExternalLink,
} from "lucide-react";
import type { Tier, Yetenek } from "../../lib/lisans";

// ── Fiyat sayfası URL ──────────────────────────────────────────────────────
const FIYAT_URL = "https://cadastrum.com.tr/fiyat";
const SITE_URL = "https://cadastrum.com.tr";

// ── Feature listesi ────────────────────────────────────────────────────────

interface Feature {
  icon: React.ReactNode;
  baslik: string;
  aciklama: string;
  vurgu?: boolean; // tetikleyen özellik için highlight
}

const PRO_OZELLIKLER: Feature[] = [
  {
    icon: <Sparkles className="h-4 w-4" />,
    baslik: "AI Fiyat Analizi",
    aciklama: "Gemini tabanlı bağlamsal değerleme gerekçesi",
    vurgu: false,
  },
  {
    icon: <TrendingUp className="h-4 w-4" />,
    baslik: "Yatırım Skoru & ROI",
    aciklama: "5 boyutlu scorecard + 10 yıl IRR projeksiyon",
  },
  {
    icon: <FileText className="h-4 w-4" />,
    baslik: "Pro PDF Rapor",
    aciklama: "15-20 sayfa — kapak, AI analizi, emsal tablo, yasal bölüm",
  },
  {
    icon: <Bell className="h-4 w-4" />,
    baslik: "İmar Değişikliği Radari",
    aciklama: "İzlenen parsellerde imar değişince bildirim",
  },
  {
    icon: <BarChart2 className="h-4 w-4" />,
    baslik: "Portföy Yönetimi",
    aciklama: "Çoklu parsel delta takip + 4'lü karşılaştırma",
  },
  {
    icon: <Satellite className="h-4 w-4" />,
    baslik: "Sentinel-2 NDVI",
    aciklama: "Tarla verimliliği + yapılaşma değişim tespiti",
  },
  {
    icon: <Shield className="h-4 w-4" />,
    baslik: "Sınırsız Favori & Tarama",
    aciklama: "Free'de 10 limit — Pro'da sınırsız",
  },
];

// Tetikleyen yeteneğe göre hangi özelliği vurgula
const YETENEK_OZELLIK_MAP: Partial<Record<Yetenek, string>> = {
  "ai-fiyat": "AI Fiyat Analizi",
  "pdf-rapor": "Pro PDF Rapor",
  "watchlist-uyari": "İmar Değişikliği Radari",
  "coklu-parsel-karsilastirma": "Portföy Yönetimi",
  "gunes-modulu": "Sentinel-2 NDVI",
  "sınırsız-favori": "Sınırsız Favori & Tarama",
  "risk-skor": "Yatırım Skoru & ROI",
};

// ── Ana bileşen ────────────────────────────────────────────────────────────

interface Props {
  acik: boolean;
  onKapat: () => void;
  /** Hangi özellik tetikledi — o kart vurgulanır */
  tetikleyenOzellik?: string;
  /** Hangi yetenek tetikledi (otomatik özellik tespiti için) */
  tetikleyenYetenek?: Yetenek;
  /** Zorunlu tier */
  gerekliTier?: Tier;
  /** UTM source */
  source?: string;
}

export function UpgradeModal({
  acik,
  onKapat,
  tetikleyenOzellik,
  tetikleyenYetenek,
  gerekliTier = "bireysel-pro",
  source = "paywall",
}: Props) {
  const [visible, setVisible] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Vurgulanan özelliği bul
  const vurgulananOzellik =
    tetikleyenOzellik ??
    (tetikleyenYetenek ? YETENEK_OZELLIK_MAP[tetikleyenYetenek] : undefined);

  const ozellikler = PRO_OZELLIKLER.map((f) => ({
    ...f,
    vurgu: f.baslik === vurgulananOzellik,
  }));

  // Enter animasyonu
  useEffect(() => {
    if (acik) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [acik]);

  // ESC ile kapat
  useEffect(() => {
    if (!acik) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onKapat();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [acik, onKapat]);

  function fiyatSayfasiAc(plan?: "yillik") {
    const url = new URL(FIYAT_URL);
    url.searchParams.set("source", source);
    if (plan) url.searchParams.set("plan", plan);
    if (vurgulananOzellik) url.searchParams.set("feature", vurgulananOzellik);
    if (typeof chrome !== "undefined" && chrome.tabs) {
      chrome.tabs.create({ url: url.toString() });
    } else {
      window.open(url.toString(), "_blank", "noopener");
    }
    onKapat();
  }

  if (!acik) return null;

  return (
    <div
      ref={backdropRef}
      className="absolute inset-0 z-[60] flex flex-col justify-end"
      style={{
        background: visible ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0)",
        backdropFilter: visible ? "blur(2px)" : "none",
        transition: "background 250ms ease, backdrop-filter 250ms ease",
      }}
      onClick={(e) => {
        if (e.target === backdropRef.current) onKapat();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Pro plana geçiş"
    >
      {/* Bottom sheet */}
      <div
        className="rounded-t-2xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col max-h-[90vh]"
        style={{
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 320ms cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-4 pb-3 pt-1 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
              <Crown className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                {gerekliTier === "kurumsal-standart" ? "Kurumsal Plana Geç" : "Pro Plana Geç"}
              </h2>
              {vurgulananOzellik && (
                <p className="text-2xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-amber-600">{vurgulananOzellik}</span> ve daha fazlası
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onKapat}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 transition-colors"
            aria-label="Kapat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Feature listesi — scroll edilebilir */}
        <div className="overflow-y-auto flex-1 px-4 pb-2">
          <div className="space-y-1.5">
            {ozellikler.map((f) => (
              <div
                key={f.baslik}
                className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                  f.vurgu
                    ? "bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 dark:from-amber-950/30 dark:to-orange-950/20 dark:border-amber-800/40"
                    : "bg-slate-50 dark:bg-slate-800/50"
                }`}
              >
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg mt-0.5 ${
                  f.vurgu
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    : "bg-white text-slate-600 border border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600"
                }`}>
                  {f.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-semibold ${
                      f.vurgu ? "text-amber-800 dark:text-amber-200" : "text-slate-800 dark:text-slate-100"
                    }`}>
                      {f.baslik}
                    </span>
                    {f.vurgu && (
                      <span className="text-3xs font-bold px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 dark:bg-amber-800/40 dark:text-amber-200">
                        Bu özellik
                      </span>
                    )}
                  </div>
                  <p className="text-2xs text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">
                    {f.aciklama}
                  </p>
                </div>
                <Check className={`h-4 w-4 shrink-0 mt-1 ${
                  f.vurgu ? "text-amber-500" : "text-emerald-500"
                }`} />
              </div>
            ))}
          </div>
        </div>

        {/* Fiyat + CTA */}
        <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-4 flex-shrink-0 space-y-3">
          {/* Fiyat seçenekleri */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fiyatSayfasiAc()}
              className="flex flex-col items-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 hover:border-amber-300 hover:bg-amber-50/50 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:hover:border-amber-700/60"
            >
              <span className="text-xs text-slate-500 dark:text-slate-400">Aylık</span>
              <span className="text-base font-black text-slate-900 dark:text-white tabular-nums">89 ₺</span>
              <span className="text-3xs text-slate-400">/ ay</span>
            </button>
            <button
              type="button"
              onClick={() => fiyatSayfasiAc("yillik")}
              className="relative flex flex-col items-center rounded-xl border-2 border-amber-400 bg-gradient-to-b from-amber-50 to-orange-50 px-3 py-2.5 hover:from-amber-100 hover:to-orange-100 transition-colors dark:from-amber-950/40 dark:to-orange-950/30 dark:border-amber-600"
            >
              <span className="absolute -top-2.5 text-3xs font-bold px-2 py-0.5 rounded-full bg-amber-400 text-white">
                2 ay bedava
              </span>
              <span className="text-xs text-amber-700 dark:text-amber-400">Yıllık</span>
              <span className="text-base font-black text-amber-800 dark:text-amber-200 tabular-nums">890 ₺</span>
              <span className="text-3xs text-amber-600 dark:text-amber-400">/ yıl (74 ₺/ay)</span>
            </button>
          </div>

          {/* Ana CTA */}
          <button
            type="button"
            onClick={() => fiyatSayfasiAc("yillik")}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-3 text-sm font-bold text-white shadow-md hover:from-amber-500 hover:to-orange-600 transition-all active:scale-[0.98]"
          >
            <Crown className="h-4 w-4" />
            Pro'ya geç — tüm özellikleri aç
            <ChevronRight className="h-4 w-4 opacity-80" />
          </button>

          {/* Alt metin */}
          <div className="flex items-center justify-center gap-3 text-3xs text-slate-400 dark:text-slate-500">
            <span>İstediğin zaman iptal</span>
            <span>·</span>
            <button
              type="button"
              onClick={() => {
                const url = `${SITE_URL}/fiyat?source=${source}`;
                if (typeof chrome !== "undefined" && chrome.tabs) {
                  chrome.tabs.create({ url });
                } else {
                  window.open(url, "_blank", "noopener");
                }
              }}
              className="flex items-center gap-0.5 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              Tüm planları karşılaştır
              <ExternalLink className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Hook — global upgrade modal state ─────────────────────────────────────

interface UpgradeModalState {
  acik: boolean;
  tetikleyenOzellik?: string;
  tetikleyenYetenek?: Yetenek;
  source?: string;
}

let _setUpgradeModal: ((s: UpgradeModalState) => void) | null = null;

/**
 * Uygulama genelinde upgrade modal'ı aç.
 * Herhangi bir bileşenden çağrılabilir.
 */
export function upgradeModalAc(opts: {
  tetikleyenOzellik?: string;
  tetikleyenYetenek?: Yetenek;
  source?: string;
}) {
  _setUpgradeModal?.({
    acik: true,
    ...opts,
  });
}

/**
 * Root layout'ta tek örnek olarak kullanılır.
 */
export function UpgradeModalProvider() {
  const [state, setState] = useState<UpgradeModalState>({ acik: false });

  useEffect(() => {
    _setUpgradeModal = setState;
    return () => { _setUpgradeModal = null; };
  }, []);

  return (
    <UpgradeModal
      acik={state.acik}
      onKapat={() => setState({ acik: false })}
      tetikleyenOzellik={state.tetikleyenOzellik}
      tetikleyenYetenek={state.tetikleyenYetenek}
      source={state.source ?? "paywall"}
    />
  );
}
