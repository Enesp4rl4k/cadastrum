import { useEffect, useState } from "react";
import {
  Activity as ActivityIcon,
  CloudRain as CloudRainIcon,
  Droplets as DropletsIcon,
  Sprout as SproutIcon,
} from "lucide-react";
import type { Parsel } from "../../types/tkgm";
import { depremRiskiHesapla, depremRengiSinif, type DepremRiski } from "../../lib/afad-deprem";
import { depremRiskKoordGetir, type DepremRiskKoord } from "../../lib/deprem-tdth";
import { iklimVerisiGetir, type IklimVerisi } from "../../lib/iklim";
import { toprakVerisiGetir, type ToprakVerisi } from "../../lib/toprak";
import { taskinRiskiGetir, type TaskinBilgi, type TaskinRiski } from "../../lib/data/taskin-risk";
import { normalizeYerAdi } from "../../lib/tkgm-api";
import { Section } from "../ui/Card";
import { useLisans } from "../../lib/lisans";
import { PaywallKilit } from "./PaywallKilit";

interface Props {
  parsel: Parsel;
}

/**
 * Doğal Veri Kartı — AFAD deprem + iklim + toprak.
 * Tüm veriler Cadastrum içinde, kullanıcıyı dış kaynağa yönlendirme yok.
 */
export function DogalVeriKarti({ parsel }: Props) {
  const [iklim, setIklim] = useState<IklimVerisi | null>(null);
  const [iklimYukleniyor, setIklimYukleniyor] = useState(true);
  const [toprak, setToprak] = useState<ToprakVerisi | null>(null);
  const [toprakYukleniyor, setToprakYukleniyor] = useState(true);
  const lisans = useLisans();
  // İklim + toprak Pro özelliği. Deprem her tier'da.
  const proAcik = lisans.can("tarim-modulu") || lisans.can("ai-fiyat");

  // Deprem statik tablodan, anında — async yok
  const deprem: DepremRiski = depremRiskiHesapla(parsel.ilAd);

  // Koordinat bazlı deprem (TDTH → il-tablo fallback). Yüklenince UI üzerine
  // bindirilir; il-tablo zaten DepremBolumu'nu doldurduğu için yüklenirken
  // kullanıcı boş ekran görmez.
  const [depremKoord, setDepremKoord] = useState<DepremRiskKoord | null>(null);

  // Taşkın il tablosundan (sync)
  const ilNorm = parsel.ilAd ? normalizeYerAdi(parsel.ilAd) : null;
  const taskin: TaskinBilgi | null = taskinRiskiGetir(ilNorm);

  useEffect(() => {
    let iptal = false;
    const ctrl = new AbortController();
    depremRiskKoordGetir(
      parsel.merkezNokta.lat,
      parsel.merkezNokta.lng,
      parsel.ilAd,
      ctrl.signal,
    ).then((v) => {
      if (!iptal && v) setDepremKoord(v);
    });
    return () => {
      iptal = true;
      ctrl.abort();
    };
  }, [parsel.merkezNokta.lat, parsel.merkezNokta.lng, parsel.ilAd]);

  useEffect(() => {
    if (!proAcik) return; // Free tier'da iklim/toprak fetch etme — gereksiz API çağrısı
    let iptal = false;
    const ctrl = new AbortController();
    setIklimYukleniyor(true);
    setToprakYukleniyor(true);

    iklimVerisiGetir(parsel.merkezNokta.lat, parsel.merkezNokta.lng, ctrl.signal)
      .then((v) => {
        if (!iptal) {
          setIklim(v);
          setIklimYukleniyor(false);
        }
      })
      .catch(() => {
        if (!iptal) setIklimYukleniyor(false);
      });

    toprakVerisiGetir(parsel.merkezNokta.lat, parsel.merkezNokta.lng, ctrl.signal)
      .then((v) => {
        if (!iptal) {
          setToprak(v);
          setToprakYukleniyor(false);
        }
      })
      .catch(() => {
        if (!iptal) setToprakYukleniyor(false);
      });

    return () => {
      iptal = true;
      ctrl.abort();
    };
  }, [parsel.merkezNokta.lat, parsel.merkezNokta.lng, proAcik]);

  return (
    <Section
      title="Doğal Veri Katmanı"
      icon={<ActivityIcon className="h-3.5 w-3.5" />}
      accent="info"
    >
      <div className="space-y-2.5">
        {/* Deprem riski — tüm tier'larda görünür */}
        <DepremBolumu deprem={deprem} koord={depremKoord} />

        {/* Taşkın riski — tüm tier'larda */}
        <TaskinBolumu taskin={taskin} />

        {/* İklim + Toprak — Pro özelliği */}
        {proAcik ? (
          <>
            <IklimBolumu yukleniyor={iklimYukleniyor} iklim={iklim} />
            <ToprakBolumu yukleniyor={toprakYukleniyor} toprak={toprak} />
          </>
        ) : (
          <PaywallKilit
            gerekliTier={lisans.yukseltGerekli("tarim-modulu") ?? "bireysel-pro"}
            ozellik="🌧 İklim + 🌱 Toprak Analizi"
            kompakt
          />
        )}
      </div>
    </Section>
  );
}

function DepremBolumu({
  deprem,
  koord,
}: {
  deprem: DepremRiski;
  koord: DepremRiskKoord | null;
}) {
  // Koordinat-bazlı sonuç geldiyse onu öne çıkar; gelmediyse il-tablodan göster.
  const pga = koord?.pga ?? deprem.pga;
  const r = depremRengiSinif(deprem.seviye);
  const kaynak = koord?.kaynak === "afad-tdth"
    ? "AFAD TDTH (koordinat bazlı, DD-2 / 475 yıl)"
    : "TBDY 2018 il bazlı Peak Ground Acceleration";
  return (
    <div className={`rounded-md border ${r.border} ${r.bg} p-2.5 dark:border-slate-600 dark:bg-slate-900`}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <ActivityIcon className={`h-3.5 w-3.5 ${r.text}`} />
          <span className={`text-2xs font-semibold ${r.text}`}>Deprem Riski</span>
        </div>
        <span className={`text-3xs font-bold uppercase tracking-wider ${r.text}`}>
          {deprem.ozet}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-1.5">
        <KpiBox label="PGA (g)" value={pga.toFixed(2)} />
        <KpiBox label="Zone" value={koord ? koord.zon : `${deprem.zone}. derece`} />
        <KpiBox label="Risk" value={`${deprem.skor}/100`} />
      </div>
      <p className={`text-3xs leading-snug ${r.text} opacity-90 dark:text-slate-200`}>{deprem.aciklama}</p>
      {koord?.fay && (
        <p className="text-3xs text-slate-600 mt-0.5 dark:text-slate-300">
          Fay hattı: {koord.fay}
        </p>
      )}
      <p className="text-3xs italic text-slate-500 mt-1 dark:text-slate-400">
        Kaynak: {kaynak}
      </p>
    </div>
  );
}

function taskinEtiket(risk: TaskinRiski): string {
  switch (risk) {
    case "yuksek": return "Yüksek risk";
    case "orta": return "Orta risk";
    case "dusuk": return "Düşük risk";
  }
}

function taskinRenk(risk: TaskinRiski | undefined): {
  bg: string; border: string; text: string;
} {
  switch (risk) {
    case "yuksek":
      return { bg: "bg-red-50", border: "border-red-300", text: "text-red-900" };
    case "orta":
      return { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-900" };
    case "dusuk":
      return { bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-900" };
    default:
      return { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-700" };
  }
}

function TaskinBolumu({ taskin }: { taskin: TaskinBilgi | null }) {
  if (!taskin) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-600 dark:bg-slate-900">
        <div className="flex items-center gap-1.5">
          <DropletsIcon className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-2xs font-semibold text-slate-600">Taşkın Riski</span>
        </div>
        <div className="text-3xs italic text-slate-500 mt-1">
          Veri yetersiz — il bazlı taşkın tablosunda kayıt yok.
        </div>
      </div>
    );
  }
  const r = taskinRenk(taskin.risk);
  return (
    <div className={`rounded-md border ${r.border} ${r.bg} p-2.5 dark:border-slate-600 dark:bg-slate-900`}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <DropletsIcon className={`h-3.5 w-3.5 ${r.text}`} />
          <span className={`text-2xs font-semibold ${r.text}`}>Taşkın Riski</span>
        </div>
        <span className={`text-3xs font-bold uppercase tracking-wider ${r.text}`}>
          {taskinEtiket(taskin.risk)}
        </span>
      </div>
      <p className={`text-3xs leading-snug ${r.text} opacity-90 dark:text-slate-200`}>
        {taskin.not}
      </p>
      <p className="text-3xs italic text-slate-500 mt-1 dark:text-slate-400">
        Kaynak: AFAD Sel Master Planı + MGM tarihsel taşkın olayları (il bazlı)
      </p>
    </div>
  );
}

function IklimBolumu({
  yukleniyor,
  iklim,
}: {
  yukleniyor: boolean;
  iklim: IklimVerisi | null;
}) {
  if (yukleniyor) {
    return (
      <div className="rounded-md border border-sky-200 bg-sky-50/60 p-2.5">
        <div className="flex items-center gap-1.5">
          <CloudRainIcon className="h-3.5 w-3.5 text-sky-700" />
          <span className="text-2xs font-semibold text-sky-700">İklim</span>
        </div>
        <div className="text-3xs italic text-slate-500 mt-1">
          Open-Meteo'dan son 3 yıl ortalaması yükleniyor…
        </div>
      </div>
    );
  }
  if (!iklim) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
        <div className="flex items-center gap-1.5">
          <CloudRainIcon className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-2xs font-semibold text-slate-600">İklim</span>
        </div>
        <div className="text-3xs italic text-slate-500 mt-1">
          İklim verisi alınamadı.
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-sky-200 bg-sky-50/60 p-2.5">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <CloudRainIcon className="h-3.5 w-3.5 text-sky-700" />
          <span className="text-2xs font-semibold text-sky-700">İklim</span>
        </div>
        <span className="text-3xs font-bold uppercase tracking-wider text-sky-700">
          {iklimSinifEtiket(iklim.sinif)}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5 mb-1.5">
        <KpiBox label="Yağış" value={`${iklim.yillikYagis} mm`} alt="yıllık" />
        <KpiBox label="Ortalama" value={`${iklim.ortalamaSicaklik}°C`} alt="yıllık" />
        <KpiBox label="Yaz max" value={`${iklim.maxAySicaklik.toFixed(0)}°C`} />
        <KpiBox label="Don günü" value={`${iklim.donGunu}/yıl`} />
      </div>
      <p className="text-3xs leading-snug text-slate-700 mb-0.5">
        🌾 {iklim.tarimYorum}
      </p>
      <p className="text-3xs leading-snug text-slate-700">
        🏗 {iklim.insaatYorum}
      </p>
      <p className="text-3xs italic text-slate-500 mt-1">
        Kaynak: Open-Meteo Archive (son 3 yıl ortalama)
      </p>
    </div>
  );
}

function ToprakBolumu({
  yukleniyor,
  toprak,
}: {
  yukleniyor: boolean;
  toprak: ToprakVerisi | null;
}) {
  if (yukleniyor) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-2.5">
        <div className="flex items-center gap-1.5">
          <SproutIcon className="h-3.5 w-3.5 text-emerald-700" />
          <span className="text-2xs font-semibold text-emerald-700">Toprak</span>
        </div>
        <div className="text-3xs italic text-slate-500 mt-1">
          ISRIC SoilGrids'den toprak yapısı yükleniyor…
        </div>
      </div>
    );
  }
  if (!toprak) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
        <div className="flex items-center gap-1.5">
          <SproutIcon className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-2xs font-semibold text-slate-600">Toprak</span>
        </div>
        <div className="text-3xs italic text-slate-500 mt-1">
          Toprak verisi alınamadı.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-2.5">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <SproutIcon className="h-3.5 w-3.5 text-emerald-700" />
          <span className="text-2xs font-semibold text-emerald-700">Toprak</span>
        </div>
        <span className="text-3xs font-bold uppercase tracking-wider text-emerald-700">
          {toprakSinifEtiket(toprak.sinif)}
        </span>
      </div>

      {/* Bileşim çubuğu */}
      <div className="mb-1.5">
        <div className="flex h-2 rounded overflow-hidden bg-slate-200">
          <div
            className="bg-amber-400"
            style={{ width: `${toprak.kum}%` }}
            title={`Kum %${toprak.kum}`}
          />
          <div
            className="bg-emerald-600"
            style={{ width: `${toprak.silt}%` }}
            title={`Silt %${toprak.silt}`}
          />
          <div
            className="bg-orange-700"
            style={{ width: `${toprak.kil}%` }}
            title={`Kil %${toprak.kil}`}
          />
        </div>
        <div className="flex justify-between text-3xs text-slate-500 mt-1">
          <span>🟡 Kum %{toprak.kum}</span>
          <span>🟢 Silt %{toprak.silt}</span>
          <span>🟠 Kil %{toprak.kil}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 mb-1.5">
        <KpiBox label="Organik C" value={`${toprak.organikKarbon} g/kg`} />
        <KpiBox label="pH" value={`${toprak.ph}`} />
      </div>

      <p className="text-3xs leading-snug text-slate-700 mb-0.5">
        🌾 {toprak.tarimYorum}
      </p>
      <p className="text-3xs leading-snug text-slate-700">
        🏗 {toprak.insaatYorum}
      </p>
      <p className="text-3xs italic text-slate-500 mt-1">
        Kaynak: ISRIC SoilGrids 2.0 (0-30cm üst tabaka)
      </p>
    </div>
  );
}

function KpiBox({ label, value, alt }: { label: string; value: string; alt?: string }) {
  return (
    <div className="rounded bg-white/80 px-1.5 py-1 text-center dark:bg-slate-800 dark:ring-1 dark:ring-slate-700">
      <div className="text-[8px] uppercase tracking-wider text-slate-500 font-semibold leading-none mb-0.5 dark:text-slate-400">
        {label}
      </div>
      <div className="text-2xs font-bold tabular-nums text-ink leading-none dark:text-slate-100">{value}</div>
      {alt && <div className="text-[8px] text-slate-400 mt-0.5 dark:text-slate-500">{alt}</div>}
    </div>
  );
}

function iklimSinifEtiket(sinif: IklimVerisi["sinif"]): string {
  switch (sinif) {
    case "kurak": return "Kurak";
    case "yari-kurak": return "Yarı Kurak";
    case "yari-nemli": return "Yarı Nemli";
    case "nemli": return "Nemli";
    case "cok-nemli": return "Çok Nemli";
  }
}

function toprakSinifEtiket(sinif: ToprakVerisi["sinif"]): string {
  switch (sinif) {
    case "kumlu": return "Kumlu";
    case "killi": return "Killi";
    case "tinli": return "Tınlı (Dengeli)";
    case "siltli": return "Siltli";
    case "karisik": return "Karışık";
  }
}
