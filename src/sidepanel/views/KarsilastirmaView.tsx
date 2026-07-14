/**
 * Parsel Karşılaştırma View
 *
 * 2-3 parseli yan yana gösterir:
 *   - Temel bilgiler (alan, nitelik, konum)
 *   - Fiyat tahmini (TL/m² aralığı + güven)
 *   - İmar (TAKS/KAKS/kat — ePlan varsa)
 *   - Risk özeti
 *   - Toprak + TUCBS kategorisi (varsa)
 *
 * Veri lazy yüklenir — her parsel ayrı ayrı sorgulanır.
 */

import { useEffect, useState } from "react";
import {
  X as XIcon,
  GitCompare as CompareIcon,
  Loader2 as LoaderIcon,
  MapPin as MapPinIcon,
  Info as InfoIcon,
} from "lucide-react";
import {
  useKarsilastirma,
  type KarsilastirmaKayit,
} from "../../lib/karsilastirma-store";
import { fiyatTahminEt } from "../../lib/fiyat-tahmin";
import { aktifEPlanVerisiGetir } from "../../lib/eplan";
import { otomatikEPlanSorgula } from "../../lib/eplan-api";
import { db } from "../../lib/db";
import type { Parsel } from "../../types/tkgm";

// ─── Yardımcı formatlama ──────────────────────────────────────────────────────

function fmtTLM2(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString("tr-TR");
}

function fmtM2(n: number): string {
  return `${n.toLocaleString("tr-TR")} m²`;
}

function guvenRenk(guven: "yuksek" | "orta" | "dusuk"): string {
  switch (guven) {
    case "yuksek": return "text-emerald-600";
    case "orta":   return "text-amber-600";
    case "dusuk":  return "text-red-500";
  }
}

// ─── Tek parsel kolonu ────────────────────────────────────────────────────────

function ParselKolonu({ kayit, onFlyTo }: {
  kayit: KarsilastirmaKayit;
  onFlyTo?: (parsel: Parsel) => void;
}) {
  const { cikar, guncelleiFiyat, guncellePlan } = useKarsilastirma();
  const [yukleniyor, setYukleniyor] = useState(false);

  const { parsel, fiyat, ePlan } = kayit;

  // Lazy: fiyat + ePlan yükle
  useEffect(() => {
    if (fiyat !== undefined && ePlan !== undefined) return;
    let iptal = false;
    setYukleniyor(true);

    void (async () => {
      try {
        // Paralel — fiyat ve ePlan aynı anda
        const [fiyatSonuc, ePlanSonuc] = await Promise.allSettled([
          fiyat === undefined
            ? fiyatTahminEt(parsel)
            : Promise.resolve(fiyat ?? null),
          ePlan === undefined
            ? aktifEPlanVerisiGetir(parsel).then((cached) =>
                cached ?? otomatikEPlanSorgula(parsel)
              )
            : Promise.resolve(ePlan ?? null),
        ]);

        if (iptal) return;

        if (fiyatSonuc.status === "fulfilled") {
          guncelleiFiyat(kayit.key, fiyatSonuc.value);
        } else {
          guncelleiFiyat(kayit.key, null);
        }

        if (ePlanSonuc.status === "fulfilled") {
          guncellePlan(kayit.key, ePlanSonuc.value);
        } else {
          guncellePlan(kayit.key, null);
        }
      } finally {
        if (!iptal) setYukleniyor(false);
      }
    })();

    return () => { iptal = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kayit.key]);

  const adres = [parsel.mahalleAd, parsel.ilceAd, parsel.ilAd]
    .filter(Boolean)
    .join(" / ");

  return (
    <div className="flex flex-col min-w-0 flex-1 border border-slate-200 rounded-xl dark:border-slate-700 overflow-hidden">
      {/* Başlık */}
      <div className="flex items-center justify-between gap-1 px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="min-w-0">
          <div className="text-2xs font-bold text-slate-800 dark:text-slate-100 truncate">
            Ada {parsel.adaNo} / Parsel {parsel.parselNo}
          </div>
          <div className="text-3xs text-slate-500 dark:text-slate-400 truncate">{adres}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onFlyTo && (
            <button
              type="button"
              onClick={() => onFlyTo(parsel)}
              title="Haritada göster"
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500"
            >
              <MapPinIcon className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => cikar(kayit.key)}
            title="Karşılaştırmadan çıkar"
            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-600"
          >
            <XIcon className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* İçerik */}
      <div className="flex flex-col gap-0 divide-y divide-slate-100 dark:divide-slate-800 flex-1">

        {/* Temel bilgiler */}
        <SatirGrubu baslik="Parsel Bilgisi">
          <SatirItem etiket="Alan" deger={fmtM2(parsel.alan)} />
          <SatirItem etiket="Nitelik" deger={parsel.nitelik || "—"} />
          <SatirItem etiket="Durum" deger={parsel.durum || "—"} />
        </SatirGrubu>

        {/* Fiyat tahmini */}
        <SatirGrubu baslik="Fiyat Tahmini">
          {yukleniyor && fiyat === undefined ? (
            <div className="flex items-center gap-1 px-2.5 py-2 text-3xs text-slate-400">
              <LoaderIcon className="h-3 w-3 animate-spin" />
              Hesaplanıyor…
            </div>
          ) : fiyat ? (
            <>
              <div className="px-2.5 py-2">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                  {fmtTLM2(fiyat.beklenenPerM2)} TL/m²
                </div>
                <div className="text-3xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {fmtTLM2(fiyat.altPerM2)} – {fmtTLM2(fiyat.ustPerM2)} TL/m²
                </div>
                <div className={`text-3xs font-medium mt-0.5 ${guvenRenk(fiyat.guven)}`}>
                  Güven: {fiyat.guven === "yuksek" ? "Yüksek" : fiyat.guven === "orta" ? "Orta" : "Düşük"}
                  {" "}({fiyat.guvenSkoru}/100)
                </div>
              </div>
              <SatirItem
                etiket="Toplam (beklenen)"
                deger={`${(fiyat.toplamBeklenen / 1_000_000).toFixed(2)} M TL`}
              />
              <SatirItem etiket="Kaynak" deger={fiyat.baselineKaynak} kucuk />
            </>
          ) : (
            <SatirItem etiket="" deger="Veri yok" gri />
          )}
        </SatirGrubu>

        {/* İmar (ePlan) */}
        <SatirGrubu baslik="İmar Durumu">
          {yukleniyor && ePlan === undefined ? (
            <div className="flex items-center gap-1 px-2.5 py-2 text-3xs text-slate-400">
              <LoaderIcon className="h-3 w-3 animate-spin" />
              e-Plan sorgulanıyor…
            </div>
          ) : ePlan ? (
            <>
              <SatirItem etiket="Kullanım" deger={ePlan.kullanimKarari ?? ePlan.planKarari ?? "—"} />
              <SatirItem etiket="Emsal" deger={ePlan.emsal != null ? String(ePlan.emsal.toFixed(2)) : "—"} />
              <SatirItem etiket="TAKS" deger={ePlan.taks != null ? String(ePlan.taks.toFixed(2)) : "—"} />
              <SatirItem etiket="Maks Kat" deger={ePlan.maksKat != null ? `${ePlan.maksKat} kat` : "—"} />
              <SatirItem etiket="Güven" deger={`${ePlan.guvenSkoru}%`} />
            </>
          ) : (
            <SatirItem etiket="" deger="e-Plan verisi yok" gri />
          )}
        </SatirGrubu>

      </div>
    </div>
  );
}

// ─── Yardımcı bileşenler ──────────────────────────────────────────────────────

function SatirGrubu({ baslik, children }: { baslik: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-2.5 py-1 bg-slate-50/60 dark:bg-slate-800/60">
        <span className="text-[9px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500">
          {baslik}
        </span>
      </div>
      {children}
    </div>
  );
}

function SatirItem({
  etiket,
  deger,
  gri = false,
  kucuk = false,
}: {
  etiket: string;
  deger: string;
  gri?: boolean;
  kucuk?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
      {etiket && (
        <span className="text-3xs text-slate-500 dark:text-slate-400 shrink-0">{etiket}</span>
      )}
      <span
        className={[
          "min-w-0 truncate text-right",
          kucuk ? "text-[9px]" : "text-2xs",
          gri
            ? "text-slate-400 italic"
            : "text-slate-700 dark:text-slate-200 font-medium",
        ].join(" ")}
      >
        {deger}
      </span>
    </div>
  );
}

// ─── Boş durum ────────────────────────────────────────────────────────────────

function BosEkran() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
      <div className="rounded-full bg-slate-100 dark:bg-slate-800 p-4">
        <CompareIcon className="h-8 w-8 text-slate-400" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Karşılaştırma Listesi Boş
        </h3>
        <p className="mt-1 text-2xs text-slate-500 dark:text-slate-400 max-w-[220px]">
          Harita veya parsel detayından <strong>"Karşılaştır"</strong> butonuna tıkla.
          Aynı anda en fazla 3 parsel karşılaştırılabilir.
        </p>
      </div>
      <div className="flex items-center gap-2 text-3xs text-slate-400">
        <InfoIcon className="h-3 w-3 shrink-0" />
        <span>Fiyat tahmini + imar + risk yan yana gösterilir</span>
      </div>
    </div>
  );
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────

interface KarsilastirmaViewProps {
  onFlyTo?: (parsel: Parsel) => void;
}

export function KarsilastirmaView({ onFlyTo }: KarsilastirmaViewProps) {
  const { liste, temizle } = useKarsilastirma();

  if (liste.length === 0) return <BosEkran />;

  return (
    <div className="flex flex-col h-full">
      {/* Başlık toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-1.5">
          <CompareIcon className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-2xs font-semibold text-slate-700 dark:text-slate-200">
            Parsel Karşılaştırma
          </span>
          <span className="rounded-full bg-tkgm-primary/10 text-tkgm-primary text-3xs font-bold px-1.5 py-0.5">
            {liste.length}/3
          </span>
        </div>
        <button
          type="button"
          onClick={temizle}
          className="text-3xs text-slate-400 hover:text-red-500 transition-colors"
        >
          Tümünü Temizle
        </button>
      </div>

      {/* Parsel kolonları — yatay kaydırmalı */}
      <div className="flex-1 overflow-auto p-2">
        <div
          className="flex gap-2 h-full"
          style={{ minWidth: `${liste.length * 220}px` }}
        >
          {liste.map((kayit) => (
            <ParselKolonu
              key={kayit.key}
              kayit={kayit}
              onFlyTo={onFlyTo}
            />
          ))}
        </div>
      </div>

      {/* Alt bilgi */}
      <div className="px-3 py-1.5 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <p className="text-3xs text-slate-400 italic">
          Fiyat tahmini heuristic modeldir — resmi değerleme belgesi yerine geçmez.
        </p>
      </div>
    </div>
  );
}
