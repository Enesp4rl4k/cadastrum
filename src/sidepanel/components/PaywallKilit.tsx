/**
 * PaywallKilit — Pro özellik kilidi bileşeni.
 *
 * "Yükselt" butonuna tıklanınca:
 *   1. VITE_LEMON_PRO_VARIANT env var set ise → LemonSqueezy popup açar
 *   2. Set değilse → cadastrum.com.tr/fiyat sayfasına yönlendirir
 *
 * onUpgrade prop varsa o çağrılır (override).
 */

import { useState } from "react";
import {
  Lock as LockIcon,
  Crown as CrownIcon,
  Building2 as Building2Icon,
  X as XIcon,
  ExternalLink as ExternalLinkIcon,
  Sparkles as SparklesIcon,
} from "lucide-react";
import { type Tier, TIER_BILGI } from "../../lib/lisans";

// Vite env'den variant ID'leri al (wrangler.toml/set-secrets'ten gelir)
const _env = (import.meta as { env?: Record<string, string> }).env ?? {};
const LEMON_PRO_VARIANT = _env["VITE_LEMON_PRO_VARIANT"] ?? "";
const LEMON_KURUMSAL_VARIANT = _env["VITE_LEMON_KURUMSAL_VARIANT"] ?? "";
const LEMON_STORE = "cadastrum";

function lemonUrl(variantId: string): string {
  if (!variantId) return "https://cadastrum.com.tr/fiyat";
  return `https://${LEMON_STORE}.lemonsqueezy.com/buy/${variantId}?embed=1&logo=0&discount=0`;
}

function upgradeUrl(tier: Tier): string {
  if (tier.startsWith("kurumsal")) return lemonUrl(LEMON_KURUMSAL_VARIANT);
  return lemonUrl(LEMON_PRO_VARIANT);
}

interface Props {
  /** Hangi tier'a yükseltmek gerekiyor */
  gerekliTier: Tier;
  /** Feature adı kullanıcıya göster */
  ozellik: string;
  /** Kompakt görünüm (sıralanan kartlar arasına sıkıştırılır) */
  kompakt?: boolean;
  /** Upgrade akışı override — belirtilmezse built-in LemonSqueezy davranışı */
  onUpgrade?: () => void;
}

/** Yükselt işlemini tetikle */
function upgradeBaslat(tier: Tier, onUpgrade?: () => void) {
  if (onUpgrade) { onUpgrade(); return; }
  const url = upgradeUrl(tier);
  // LemonSqueezy embed popup varsa kullan, yoksa yeni sekme
  if (url.includes("lemonsqueezy.com") && typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function PaywallKilit({
  gerekliTier,
  ozellik,
  kompakt = false,
  onUpgrade,
}: Props) {
  const [modalAcik, setModalAcik] = useState(false);
  const bilgi = TIER_BILGI[gerekliTier];
  const Icon = gerekliTier.startsWith("kurumsal") ? Building2Icon : CrownIcon;
  const accentClass = gerekliTier.startsWith("kurumsal")
    ? "from-indigo-500 to-purple-600"
    : "from-amber-400 to-orange-500";

  if (kompakt) {
    return (
      <button
        type="button"
        onClick={() => setModalAcik(true)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-dashed border-amber-300 bg-amber-50/50 px-2 py-1.5 text-2xs text-amber-800 transition-colors hover:bg-amber-50 dark:border-amber-700 dark:bg-amber-950/20 dark:text-amber-300 dark:hover:bg-amber-950/30"
      >
        <LockIcon className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="flex-1 text-left">
          <strong>{ozellik}</strong> — {bilgi.ad}'a yükselt
        </span>
        <span className="text-3xs font-semibold text-amber-700 dark:text-amber-400">
          {bilgi.rozet}
        </span>
      </button>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <div
          className={`flex items-center gap-2 bg-gradient-to-r ${accentClass} px-3 py-2 text-white`}
        >
          <Icon className="h-4 w-4" />
          <span className="text-2xs font-semibold uppercase tracking-wide">
            {bilgi.ad}'a özel
          </span>
        </div>
        <div className="p-3">
          <div className="flex items-start gap-2">
            <LockIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{ozellik}</h4>
              <p className="mt-0.5 text-2xs text-slate-600 dark:text-slate-400">{bilgi.aciklama}</p>
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {bilgi.fiyat}
            </span>
            <button
              type="button"
              onClick={() => setModalAcik(true)}
              className="cursor-pointer rounded-md bg-tkgm-primary px-3 py-1 text-2xs font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Yükselt →
            </button>
          </div>
        </div>
      </div>

      {/* Upgrade modal */}
      {modalAcik && (
        <div
          className="absolute inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px]"
          onClick={() => setModalAcik(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Yükselt"
        >
          <div
            className="w-full rounded-t-2xl bg-white dark:bg-slate-900 p-5 pb-6 shadow-xl"
            style={{ animation: "onboarding-content-in 220ms var(--out-quart, ease-out) forwards" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Kapat */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${accentClass}`} aria-hidden="true">
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {bilgi.ad} ile kilidini aç
                </span>
              </div>
              <button
                type="button"
                onClick={() => setModalAcik(false)}
                className="rounded-md p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Kapat"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Özellik */}
            <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 p-3 mb-4">
              <SparklesIcon className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{ozellik}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{bilgi.aciklama}</p>
              </div>
            </div>

            {/* Fiyat + CTA */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setModalAcik(false);
                  upgradeBaslat(gerekliTier, onUpgrade);
                }}
                className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white bg-gradient-to-r ${accentClass} hover:opacity-90 active:scale-[0.98] transition-all`}
              >
                <Icon className="h-4 w-4" />
                {bilgi.ad}'a Geç — {bilgi.fiyat}
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalAcik(false);
                  window.open("https://cadastrum.com.tr/fiyat", "_blank", "noopener,noreferrer");
                }}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <ExternalLinkIcon className="h-3.5 w-3.5" />
                Tüm planları karşılaştır
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Inline mini kilit — düğme içinde göstermek için.
 */
export function MiniKilit({ gerekliTier }: { gerekliTier: Tier }) {
  return (
    <span
      className={`ml-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-3xs font-medium ${
        gerekliTier.startsWith("kurumsal")
          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
      }`}
      title={`${TIER_BILGI[gerekliTier].ad} tier gerekli`}
    >
      <LockIcon className="h-2.5 w-2.5" />
      {TIER_BILGI[gerekliTier].rozet}
    </span>
  );
}
