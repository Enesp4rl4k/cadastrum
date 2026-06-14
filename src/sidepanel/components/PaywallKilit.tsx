import {
  Lock as LockIcon,
  Crown as CrownIcon,
  Building2 as Building2Icon,
} from "lucide-react";
import { type Tier, TIER_BILGI } from "../../lib/lisans";

interface Props {
  /** Hangi tier'a yükseltmek gerekiyor */
  gerekliTier: Tier;
  /** Feature adı kullanıcıya göster */
  ozellik: string;
  /** Kompakt görünüm (sıralanan kartlar arasına sıkıştırılır) */
  kompakt?: boolean;
  /** Upgrade akışı — şu an Settings'i açar, ileride checkout'a yönlendirir */
  onUpgrade?: () => void;
}

export function PaywallKilit({
  gerekliTier,
  ozellik,
  kompakt = false,
  onUpgrade,
}: Props) {
  const bilgi = TIER_BILGI[gerekliTier];
  const Icon = gerekliTier.startsWith("kurumsal") ? Building2Icon : CrownIcon;
  const accentClass = gerekliTier.startsWith("kurumsal")
    ? "from-indigo-500 to-purple-600"
    : "from-amber-400 to-orange-500";

  if (kompakt) {
    return (
      <button
        type="button"
        onClick={onUpgrade}
        className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-dashed border-amber-300 bg-amber-50/50 px-2 py-1.5 text-2xs text-amber-800 transition-colors hover:bg-amber-50"
      >
        <LockIcon className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="flex-1 text-left">
          <strong>{ozellik}</strong> — {bilgi.ad}'a yükselt
        </span>
        <span className="text-3xs font-semibold text-amber-700">
          {bilgi.rozet}
        </span>
      </button>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card">
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
            <h4 className="text-sm font-semibold text-slate-800">{ozellik}</h4>
            <p className="mt-0.5 text-2xs text-slate-600">{bilgi.aciklama}</p>
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-xs font-medium text-slate-700">
            {bilgi.fiyat}
          </span>
          <button
            type="button"
            onClick={onUpgrade}
            className="cursor-pointer rounded-md bg-tkgm-primary px-3 py-1 text-2xs font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Yükselt →
          </button>
        </div>
      </div>
    </div>
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
          ? "bg-indigo-100 text-indigo-700"
          : "bg-amber-100 text-amber-700"
      }`}
      title={`${TIER_BILGI[gerekliTier].ad} tier gerekli`}
    >
      <LockIcon className="h-2.5 w-2.5" />
      {TIER_BILGI[gerekliTier].rozet}
    </span>
  );
}
