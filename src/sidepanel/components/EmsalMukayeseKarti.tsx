import { useEffect, useMemo, useState } from "react";
import {
  Scale as ScaleIcon,
  ChevronDown as ChevronDownIcon,
  ChevronRight as ChevronRightIcon,
  ExternalLink as ExternalLinkIcon,
  Crown as CrownIcon,
} from "lucide-react";
import type { Parsel } from "../../types/tkgm";
import {
  emsalMukayeseEt,
  mukayeseOzet,
  topEmsallerSec,
  type EmsalMukayese,
} from "../../lib/emsal-mukayese";
import { db, type IlanGozlem } from "../../lib/db";
import { fmtTLM2 } from "../../lib/fiyat-tahmin";
import { normalizeYerAdi } from "../../lib/tkgm-api";
import { Section } from "../ui/Card";

interface Props {
  parsel: Parsel;
}

/**
 * Pro tier — gerçek ekspertiz raporu disiplini.
 * Top emsallerin per-emsal düzeltme matematikleri ile detaylı tablo.
 */
export function EmsalMukayeseKarti({ parsel }: Props) {
  const [mukayeseler, setMukayeseler] = useState<EmsalMukayese[] | null>(null);
  const [acikIdx, setAcikIdx] = useState<number | null>(null);

  useEffect(() => {
    let iptal = false;
    (async () => {
      const ilceNorm = parsel.ilceAd ? normalizeYerAdi(parsel.ilceAd) : "";
      if (!ilceNorm) {
        if (!iptal) setMukayeseler([]);
        return;
      }
      const tum = await db.ilanGozlem.toArray();
      // Aynı ilçedeki TR fiyatlı kayıtları filtrele
      const ilceyeUygun = tum.filter((k: IlanGozlem) => {
        const kIlceNorm = k.ilceNorm ?? (k.ilceAd ? normalizeYerAdi(k.ilceAd) : "");
        return kIlceNorm === ilceNorm && k.fiyat != null && k.m2 != null;
      });
      const top = topEmsallerSec(parsel, ilceyeUygun, 8);
      if (!iptal) setMukayeseler(top);
    })();
    return () => {
      iptal = true;
    };
  }, [parsel.adaNo, parsel.parselNo, parsel.mahalleKodu]);

  const ozet = useMemo(
    () => (mukayeseler && mukayeseler.length > 0 ? mukayeseOzet(mukayeseler) : null),
    [mukayeseler],
  );

  if (mukayeseler == null) {
    return (
      <Section
        title="Emsal Mukayese (Pro)"
        icon={<ScaleIcon className="h-3.5 w-3.5" />}
        accent="ai"
        subtitle={
          <span className="inline-flex items-center gap-1 text-accent-ai text-3xs">
            <CrownIcon className="h-3 w-3" /> Profesyonel Analiz
          </span>
        }
      >
        <div className="text-3xs italic text-slate-500">Emsal havuzu yükleniyor…</div>
      </Section>
    );
  }

  if (mukayeseler.length === 0) {
    return (
      <Section
        title="Emsal Mukayese (Pro)"
        icon={<ScaleIcon className="h-3.5 w-3.5" />}
        accent="ai"
        subtitle={
          <span className="inline-flex items-center gap-1 text-accent-ai text-3xs">
            <CrownIcon className="h-3 w-3" /> Profesyonel Analiz
          </span>
        }
      >
        <div className="rounded-md bg-slate-50 p-2 text-3xs italic text-slate-500">
          Bu ilçe için henüz emsal birikim yok. Sahibinden veya Hepsiemlak'ta
          arsa arama sonuçlarını gezerek otomatik emsal toplanır.
        </div>
      </Section>
    );
  }

  return (
    <Section
      title="Emsal Mukayese Tablosu (Pro)"
      icon={<ScaleIcon className="h-3.5 w-3.5" />}
      accent="ai"
      subtitle={
        <span className="inline-flex items-center gap-1 text-accent-ai text-3xs font-medium">
          <CrownIcon className="h-3 w-3" /> {mukayeseler.length} emsal · ekspertiz disiplini
        </span>
      }
    >
      <div className="space-y-2">
        {/* Özet bar */}
        {ozet && (
          <div className="rounded-md bg-violet-50/70 border border-violet-200 px-2.5 py-2">
            <div className="text-3xs uppercase tracking-wider text-accent-ai font-semibold mb-1">
              Düzeltilmiş Emsal Özeti
            </div>
            <div className="grid grid-cols-3 gap-2 text-2xs">
              <div>
                <div className="text-3xs text-slate-500">Alt çeyrek (P25)</div>
                <div className="font-semibold tabular-nums text-slate-700">
                  {fmtTLM2(ozet.alt25)}
                </div>
              </div>
              <div className="border-x border-violet-200 px-2">
                <div className="text-3xs text-accent-ai">Median (P50)</div>
                <div className="font-bold tabular-nums text-accent-ai">
                  {fmtTLM2(ozet.median)}
                </div>
              </div>
              <div>
                <div className="text-3xs text-slate-500">Üst çeyrek (P75)</div>
                <div className="font-semibold tabular-nums text-slate-700">
                  {fmtTLM2(ozet.ust75)}
                </div>
              </div>
            </div>
            <div className="mt-1.5 text-3xs text-slate-500 italic">
              Ortalama düzeltme: %{(ozet.ortalamaDuzeltmeYuzde * 100).toFixed(1)} (4 boyut bileşik)
            </div>
          </div>
        )}

        {/* Tablo başlık */}
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-1 text-3xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200 px-1 pb-1">
          <span>Emsal</span>
          <span className="text-right">Ham</span>
          <span className="text-right">Düzelt.</span>
          <span className="w-3" />
        </div>

        {/* Emsal satırları */}
        {mukayeseler.map((m, i) => {
          const acik = acikIdx === i;
          const duzeltmeYuzde = (m.toplamDuzeltme * 100).toFixed(1);
          const duzeltmeRengi =
            m.toplamDuzeltme > 0.05
              ? "text-emerald-700"
              : m.toplamDuzeltme < -0.05
                ? "text-red-700"
                : "text-slate-600";

          return (
            <div
              key={i}
              className="rounded-md border border-slate-200 bg-white overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setAcikIdx(acik ? null : i)}
                className="grid grid-cols-[1fr_auto_auto_auto] gap-1 w-full items-center px-2 py-1.5 text-2xs hover:bg-slate-50 cursor-pointer text-left"
              >
                <span className="min-w-0 truncate flex items-center gap-1.5">
                  {m.ayniMahalle && (
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" title="Aynı mahalle" />
                  )}
                  {!m.ayniMahalle && m.ayniIlce && (
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" title="Aynı ilçe" />
                  )}
                  <span className="truncate font-medium text-slate-700">
                    {m.baslik}
                  </span>
                </span>
                <span className="font-mono tabular-nums text-slate-500 text-3xs">
                  {fmtTLM2(m.hamPerM2)}
                </span>
                <span className={`font-mono tabular-nums font-semibold text-2xs ${duzeltmeRengi}`}>
                  {fmtTLM2(m.duzeltilmisPerM2)}
                </span>
                {acik ? (
                  <ChevronDownIcon className="h-3 w-3 text-slate-400" />
                ) : (
                  <ChevronRightIcon className="h-3 w-3 text-slate-400" />
                )}
              </button>

              {acik && (
                <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2 space-y-1.5 text-3xs">
                  {/* Meta bilgi */}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-600">
                    <span>
                      <strong>Alan:</strong> {m.kayit.m2?.toLocaleString("tr-TR") ?? "?"} m²
                      {m.alanFarkPct !== 0 && (
                        <span className="text-slate-400 italic">
                          {" "}
                          ({m.alanFarkPct > 0 ? "+" : ""}
                          {Math.round(m.alanFarkPct * 100)}%)
                        </span>
                      )}
                    </span>
                    <span>
                      <strong>Yaş:</strong> {m.yasGun} gün
                    </span>
                    <span>
                      <strong>Lokasyon:</strong>{" "}
                      {m.kayit.mahalleAd ?? m.kayit.ilceAd ?? "?"}
                    </span>
                  </div>

                  {/* Düzeltme breakdown */}
                  <div className="space-y-0.5 mt-1.5 pt-1.5 border-t border-slate-200">
                    <div className="text-3xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                      Düzeltmeler
                    </div>
                    <DuzeltmeRow
                      ad="Alan"
                      duzeltme={m.duzeltmeler.alan}
                    />
                    <DuzeltmeRow ad="Tarih" duzeltme={m.duzeltmeler.tarih} />
                    <DuzeltmeRow
                      ad="Lokasyon"
                      duzeltme={m.duzeltmeler.lokasyon}
                    />
                    <DuzeltmeRow
                      ad="Nitelik"
                      duzeltme={m.duzeltmeler.nitelik}
                    />
                    <div className="flex justify-between border-t border-slate-200 pt-1 mt-1 text-2xs font-bold">
                      <span className="text-slate-700">= Toplam düzeltme</span>
                      <span className={`font-mono tabular-nums ${duzeltmeRengi}`}>
                        {m.toplamDuzeltme >= 0 ? "+" : ""}
                        {duzeltmeYuzde}%
                      </span>
                    </div>
                  </div>

                  {/* İlana git */}
                  {m.kayit.url && (
                    <div className="pt-1.5">
                      <a
                        href={m.kayit.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-3xs text-accent-ai hover:underline"
                      >
                        Orijinal ilana git
                        <ExternalLinkIcon className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Yöntem notu */}
        <p className="text-3xs italic text-slate-500 leading-snug pt-1">
          <strong>Yöntem:</strong> Her emsal 4 boyutta düzeltilir — alan farkı, tarih
          (TR enflasyon), lokasyon (mahalle/ilçe), nitelik (tarla/arsa). P50 düzeltilmiş
          fiyat hedef parsel için fair değer aralığını verir. Bu rapor ekspertiz değil,
          karar destek aracıdır.
        </p>
      </div>
    </Section>
  );
}

function DuzeltmeRow({
  ad,
  duzeltme,
}: {
  ad: string;
  duzeltme: { carpan: number; not: string };
}) {
  const yuzde = (duzeltme.carpan * 100).toFixed(1);
  const renk =
    duzeltme.carpan > 0.02
      ? "text-emerald-700"
      : duzeltme.carpan < -0.02
        ? "text-red-700"
        : "text-slate-500";
  return (
    <div className="flex items-baseline justify-between gap-2 text-3xs leading-snug">
      <div className="min-w-0 flex-1">
        <span className="font-medium text-slate-600">{ad}:</span>{" "}
        <span className="text-slate-500">{duzeltme.not}</span>
      </div>
      <span className={`font-mono tabular-nums font-semibold ${renk}`}>
        {duzeltme.carpan >= 0 ? "+" : ""}
        {yuzde}%
      </span>
    </div>
  );
}
