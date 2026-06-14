import {
  Crown as CrownIcon,
  Check as CheckIcon,
  Clock as ClockIcon,
} from "lucide-react";
import { useLisans, type Tier, TIER_BILGI } from "../../lib/lisans";

interface Props {
  onClose?: () => void;
}

const SIRA: Tier[] = ["free", "bireysel-pro", "kurumsal-standart", "kurumsal-pro"];

const FEATURES_PER_TIER: Record<Tier, string[]> = {
  free: [
    "TKGM parsel sorgu sınırsız",
    "Sahibinden ilan tespit",
    "Heuristic fiyat tahmini",
    "5 favori, 1 saved scan",
    "Bölge profili 0.5 km², 5 tarama/ay",
  ],
  "bireysel-pro": [
    "Sınırsız favori, scan, geçmiş",
    "AI fiyat tahmini (Gemini)",
    "Güneş + Tarım modülleri",
    "TKGM resmi heatmap",
    "Sahibinden mahalle TL/m² join",
    "Watchlist + e-posta uyarı",
    "PDF rapor (kişisel)",
    "Cloud sync (3 cihaz)",
  ],
  "kurumsal-standart": [
    "Multi-user + ekip paylaşımı",
    "Müşteri/proje organizasyonu",
    "Profesyonel PDF (logo + brand)",
    "Çoklu parsel karşılaştırma",
    "Risk skorlama (deprem + sit + orman)",
    "Manuel imar entry + max yapı",
    "1000 AI sorgu/kullanıcı/ay",
    "14 gün deneme + onboarding",
  ],
  "kurumsal-pro": [
    "Tapu sicil entegrasyon",
    "Comp set advanced (TÜİK)",
    "API access",
    "3D görselleştirme",
    "Bulk CSV import",
    "Excel/PowerBI bağlayıcı",
    "Dedicated support + SLA",
    "On-prem opsiyon",
  ],
};

export function AbonelikYonetimi({ onClose }: Props) {
  const { lisans, tieriDegistir, trialBaslat } = useLisans();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <CrownIcon className="h-4 w-4 text-amber-500" />
          Abonelik
        </h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-3xs text-slate-500 hover:underline"
          >
            kapat
          </button>
        )}
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
        <div className="text-3xs uppercase tracking-wide text-slate-500">
          Mevcut plan
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-base">{TIER_BILGI[lisans.tier].rozet}</span>
          <span className="text-sm font-bold text-slate-800">
            {TIER_BILGI[lisans.tier].ad}
          </span>
          {lisans.trial && (
            <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0 text-3xs font-medium text-amber-700">
              <ClockIcon className="h-2.5 w-2.5" />
              Trial
            </span>
          )}
        </div>
        {lisans.bitis && (
          <div className="text-3xs text-slate-500">
            {lisans.trial ? "Deneme bitiş" : "Yenileme"}:{" "}
            {new Date(lisans.bitis).toLocaleDateString("tr-TR")}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        {SIRA.map((t) => {
          const aktif = lisans.tier === t;
          const ucretsiz = t === "free";
          return (
            <div
              key={t}
              className={`rounded-md border-2 p-2 transition-colors ${
                aktif
                  ? "border-tkgm-primary bg-tkgm-primary/5"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm">{TIER_BILGI[t].rozet}</span>
                  <span className="text-2xs font-semibold text-slate-800">
                    {TIER_BILGI[t].ad}
                  </span>
                  {aktif && (
                    <span className="rounded-full bg-tkgm-primary/10 px-1.5 py-0 text-3xs font-medium text-tkgm-primary">
                      Aktif
                    </span>
                  )}
                </div>
                <span className="text-3xs font-medium text-slate-600">
                  {TIER_BILGI[t].fiyat}
                </span>
              </div>
              <ul className="mb-1.5 space-y-0.5">
                {FEATURES_PER_TIER[t].map((f) => (
                  <li
                    key={f}
                    className="flex items-baseline gap-1 text-3xs text-slate-600"
                  >
                    <CheckIcon className="h-2.5 w-2.5 flex-shrink-0 text-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>
              {!aktif && (
                <div className="flex gap-1">
                  {!ucretsiz && (
                    <button
                      type="button"
                      onClick={() => trialBaslat(t)}
                      className="cursor-pointer rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-3xs font-medium text-amber-700 hover:bg-amber-100"
                    >
                      <ClockIcon className="mr-0.5 inline h-2.5 w-2.5" />
                      7 gün dene
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => tieriDegistir(t)}
                    className={`flex-1 cursor-pointer rounded px-2 py-0.5 text-3xs font-medium ${
                      ucretsiz
                        ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                        : "bg-tkgm-primary text-white hover:bg-blue-700"
                    }`}
                  >
                    {ucretsiz
                      ? "Free'ye dön"
                      : t.startsWith("kurumsal")
                        ? "Satış ile iletişim"
                        : "Şimdi yükselt"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2 text-3xs text-amber-800">
        ⚠ <strong>v0.1 mock akış:</strong> Ödeme entegrasyonu (iyzico + Stripe)
        sonraki sprint'te. Şu an "Şimdi yükselt" lokal tier değiştirir,
        gerçek tahsilat yok. Test için kullan.
      </div>
    </div>
  );
}
