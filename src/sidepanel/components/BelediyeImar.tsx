import { belediyeBilgisiBul } from "../../lib/belediye";
import { EPLAN_URL, type EPlanImarVerisi, ePlanOzet } from "../../lib/eplan";

interface Props {
  ilAd: string;
  ilceAd: string;
  adaNo: number;
  parselNo: number;
  ePlanVerisi?: EPlanImarVerisi | null;
}

export function BelediyeImar({ ilAd, ilceAd, adaNo, parselNo, ePlanVerisi }: Props) {
  const bilgi = belediyeBilgisiBul(ilAd, ilceAd);
  const aramaSorgusu = `${ilceAd} ${adaNo}/${parselNo} imar planı`;

  return (
    <div className="space-y-2 rounded border-2 border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-500/70 dark:bg-slate-900 dark:text-slate-100">
      <div className="font-semibold text-amber-900 dark:text-amber-300">
        🏛️ Belediye & İmar — {ilceAd}
      </div>

      <div className="grid grid-cols-1 gap-1.5">
        <BelediyeLink
          ikon="🌐"
          ad="Belediye web sitesi"
          url={bilgi.webSitesi}
        />
        {bilgi.imarSorguUrl && (
          <BelediyeLink
            ikon="📐"
            ad="İmar durum sorgulama"
            url={bilgi.imarSorguUrl}
            primary
          />
        )}
        <BelediyeLink
          ikon="🏛️"
          ad="Resmi e-Plan sorgulama"
          url={EPLAN_URL}
        />
        {bilgi.acikVeriUrl && (
          <BelediyeLink
            ikon="📊"
            ad="Açık veri portalı"
            url={bilgi.acikVeriUrl}
          />
        )}
        <BelediyeLink
          ikon="🔍"
          ad={`"${adaNo}/${parselNo}" imar planı ara`}
          url={`https://www.google.com/search?q=${encodeURIComponent(aramaSorgusu)}`}
        />
        <BelediyeLink
          ikon="📑"
          ad="1/1000 plan PDF arşivi (Google)"
          url={`https://www.google.com/search?q=${encodeURIComponent(`${ilceAd} 1/1000 uygulama imar planı PDF`)}&tbm=`}
        />
      </div>

      {ePlanVerisi && (
        <div className="rounded border border-emerald-300 bg-emerald-50 p-1.5 text-[10px] text-emerald-900 dark:border-emerald-500/60 dark:bg-emerald-950/30 dark:text-emerald-200">
          <div className="font-semibold">Resmi e-Plan özeti alındı</div>
          <div className="mt-0.5">{ePlanOzet(ePlanVerisi)}</div>
        </div>
      )}

      <div className="rounded bg-white p-1.5 text-[10px] text-amber-800 dark:bg-slate-800 dark:text-amber-200">
        💡 <strong>Pro tip:</strong> Resmi e-Plan veya belediye e-imar ekranında
        aynı ada/parseli sorgula. Bu eklenti e-Plan sayfasındaki sonucu yakalayıp
        fiyat motoruna resmi imar sinyali olarak bağlayabiliyor.
      </div>
    </div>
  );
}

function BelediyeLink({
  ikon,
  ad,
  url,
  primary = false,
}: {
  ikon: string;
  ad: string;
  url: string;
  primary?: boolean;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center justify-between rounded border px-2 py-1.5 transition-colors ${
        primary
          ? "border-amber-400 bg-white font-medium hover:bg-amber-100 dark:border-amber-500 dark:bg-slate-900 dark:hover:bg-slate-800"
          : "border-amber-200 bg-white/60 hover:bg-white dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
      }`}
    >
      <span className="flex items-center gap-1.5 text-amber-900 dark:text-slate-100">
        <span>{ikon}</span>
        <span>{ad}</span>
      </span>
      <span className="text-[10px] text-amber-600 dark:text-amber-300">↗</span>
    </a>
  );
}
