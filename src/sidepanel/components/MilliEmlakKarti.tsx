/**
 * Milli Emlak İhale Kartı — resmi ihale fiyatları + yaklaşan ihale alarmı.
 *
 * Veri: backend D1 → milli_emlak_ihale tablosu
 * Kaynak: milliemlak.gov.tr ihale sonuçları (aylık scrape)
 *
 * Bu kart fiyat tahmininde "referans taban fiyat" olarak gösteriliyor.
 * Listing price değil, fiili ihale kapanış fiyatı → güven skoru en yüksek.
 *
 * W6: IhaleAlarmKarti ile yaklaşan ihaleler de gösterilir.
 */
import { useEffect, useState } from "react";
import {
  Building2 as Building2Icon,
  ExternalLink as ExternalLinkIcon,
  Loader2 as LoaderIcon,
} from "lucide-react";
import type { Parsel } from "../../types/tkgm";
import {
  milliEmlakGetir,
  fmtTL,
  fmtTLm2,
  type MilliEmlakSonuc,
  type MilliEmlakIhale,
} from "../../lib/milli-emlak";
import { normalizeYerAdi } from "../../lib/tkgm-api";
import { Section } from "../ui/Card";
import { IhaleAlarmKarti } from "./IhaleAlarmKarti";

interface Props {
  parsel: Parsel;
}

export function MilliEmlakKarti({ parsel }: Props) {
  const [sonuc, setSonuc] = useState<MilliEmlakSonuc | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  const ilNorm = normalizeYerAdi(parsel.ilAd ?? "");
  const ilceNorm = normalizeYerAdi(parsel.ilceAd ?? "");

  useEffect(() => {
    if (!ilNorm || !ilceNorm) {
      setYukleniyor(false);
      return;
    }

    let iptal = false;
    const ctrl = new AbortController();
    setYukleniyor(true);

    milliEmlakGetir(ilNorm, ilceNorm, ctrl.signal).then((v) => {
      if (!iptal) {
        setSonuc(v);
        setYukleniyor(false);
      }
    }).catch(() => {
      if (!iptal) setYukleniyor(false);
    });

    return () => {
      iptal = true;
      ctrl.abort();
    };
  }, [ilNorm, ilceNorm]);

  // Veri yoksa ve yükleme bittiyse gösterme
  if (!yukleniyor && (!sonuc || (!sonuc.ozet && sonuc.ilanlar.length === 0))) {
    return null;
  }

  return (
    <Section
      title="Milli Emlak İhale Fiyatları"
      icon={<Building2Icon className="h-3.5 w-3.5" />}
      accent="warning"
    >
      <div className="space-y-2 px-1 pb-1">
        {yukleniyor ? (
          <div className="flex items-center gap-2 py-2 text-3xs text-slate-500">
            <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
            Milli Emlak ihale verileri yükleniyor…
          </div>
        ) : (
          <>
            {/* Özet istatistik */}
            {sonuc?.ozet && (
              <OzetBolumu ozet={sonuc.ozet} ilAd={parsel.ilAd} ilceAd={parsel.ilceAd} />
            )}

            {/* Son ihaleler listesi */}
            {sonuc && sonuc.ilanlar.length > 0 && (
              <IhaleListe ilanlar={sonuc.ilanlar} />
            )}

            <p className="text-[10px] italic text-slate-400 px-0.5">
              Kaynak: milliemlak.gov.tr — devlet taşınmaz ihale sonuçları (listing değil, gerçek kapanış fiyatı).
              Son 2 yıllık kayıtlar.
            </p>
          </>
        )}
      </div>

      {/* W6 — Yaklaşan ihale alarmı (ayrı bölüm, bağımsız fetch) */}
      <IhaleAlarmKarti parsel={parsel} />
    </Section>
  );
}

function OzetBolumu({
  ozet,
  ilAd,
  ilceAd,
}: {
  ozet: NonNullable<MilliEmlakSonuc["ozet"]>;
  ilAd: string;
  ilceAd: string;
}) {
  const sonIhaleTarih = ozet.son_ihale
    ? new Date(ozet.son_ihale).toLocaleDateString("tr-TR", { year: "numeric", month: "long" })
    : null;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/70 px-2.5 py-2 dark:border-amber-800/40 dark:bg-amber-950/20">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-2xs font-semibold text-amber-800 dark:text-amber-300">
          {ilceAd} — İhale Özeti
        </span>
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          {ozet.adet} ihale
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5 mb-1.5">
        <OzetKpi label="Ortalama" value={fmtTLm2(ozet.ort_fiyat_per_m2)} />
        <OzetKpi label="Min" value={fmtTLm2(ozet.min_fiyat_per_m2)} />
        <OzetKpi label="Max" value={fmtTLm2(ozet.max_fiyat_per_m2)} />
      </div>

      {sonIhaleTarih && (
        <p className="text-3xs text-amber-700/70 dark:text-amber-400/70">
          Son ihale: {sonIhaleTarih}
        </p>
      )}

      <div className="mt-1.5 rounded bg-emerald-50 border border-emerald-200 px-2 py-1 text-3xs text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800/40 dark:text-emerald-300">
        💡 Bu fiyatlar <strong>fiili ihale kapanış fiyatları</strong> — ilan fiyatından %15–30 daha düşük olabilir.
        Fiyat tahmininde referans taban olarak kullanılır.
      </div>
    </div>
  );
}

function IhaleListe({ ilanlar }: { ilanlar: MilliEmlakIhale[] }) {
  return (
    <div className="space-y-1">
      <div className="text-3xs font-medium text-slate-600 dark:text-slate-400 px-0.5">
        Son ihaleler
      </div>
      {ilanlar.slice(0, 5).map((ilan, i) => (
        <IhaleRow key={ilan.id ?? i} ilan={ilan} />
      ))}
    </div>
  );
}

function IhaleRow({ ilan }: { ilan: MilliEmlakIhale }) {
  const tarih = ilan.ihale_tarihi
    ? new Date(ilan.ihale_tarihi).toLocaleDateString("tr-TR", { year: "numeric", month: "short" })
    : null;

  return (
    <div className="flex items-start justify-between gap-2 rounded border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-800">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {ilan.nitelik && (
            <span className="text-3xs font-medium text-slate-700 dark:text-slate-300">
              {ilan.nitelik}
            </span>
          )}
          {ilan.ada_no && ilan.parsel_no && (
            <span className="text-[10px] text-slate-500 font-mono">
              Ada {ilan.ada_no} / Parsel {ilan.parsel_no}
            </span>
          )}
          {ilan.m2 && (
            <span className="text-3xs text-slate-500">
              {ilan.m2.toLocaleString("tr-TR")} m²
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-3xs text-slate-500">
            İhale: <strong className="text-amber-700 dark:text-amber-400">{fmtTL(ilan.ihale_bedeli)}</strong>
          </span>
          {tarih && <span className="text-3xs text-slate-400">{tarih}</span>}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        {ilan.fiyat_per_m2 && (
          <div className="text-2xs font-bold tabular-nums text-amber-700 dark:text-amber-400">
            {fmtTLm2(ilan.fiyat_per_m2)}
          </div>
        )}
        {ilan.kaynak_url && (
          <a
            href={ilan.kaynak_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline dark:text-blue-400"
          >
            <ExternalLinkIcon className="h-2.5 w-2.5" />
            İlan
          </a>
        )}
      </div>
    </div>
  );
}

function OzetKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-white/80 px-1.5 py-1 text-center dark:bg-slate-800">
      <div className="text-[8px] uppercase tracking-wider text-amber-700/70 font-semibold leading-none mb-0.5 dark:text-amber-400/70">
        {label}
      </div>
      <div className="text-2xs font-bold tabular-nums text-amber-900 leading-none dark:text-amber-300">
        {value}
      </div>
    </div>
  );
}
