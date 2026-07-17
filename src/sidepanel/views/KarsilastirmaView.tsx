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
 * N4 — PDF export: window.print() + @media print CSS
 */

import { useEffect, useRef, useState } from "react";
import {
  X as XIcon,
  GitCompare as CompareIcon,
  Loader2 as LoaderIcon,
  MapPin as MapPinIcon,
  Info as InfoIcon,
  FileDown as FileDownIcon,
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

// ─── PDF rapor HTML üretici ───────────────────────────────────────────────────

function pdfRaporHtmlUret(liste: KarsilastirmaKayit[]): string {
  const tarih = new Date().toLocaleString("tr-TR");

  function fmtM2(n: number) {
    return `${n.toLocaleString("tr-TR")} m²`;
  }
  function fmtTL(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} M TL`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)} K TL`;
    return `${n.toLocaleString("tr-TR")} TL`;
  }
  function fmtTLM2(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M TL/m²`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K TL/m²`;
    return `${n.toLocaleString("tr-TR")} TL/m²`;
  }
  function guvenTR(g: "yuksek" | "orta" | "dusuk") {
    return g === "yuksek" ? "Yüksek" : g === "orta" ? "Orta" : "Düşük";
  }

  const kolonWidth = Math.floor(100 / liste.length);

  const kolonlerHtml = liste.map((kayit) => {
    const { parsel, fiyat, ePlan } = kayit;
    const adres = [parsel.mahalleAd, parsel.ilceAd, parsel.ilAd].filter(Boolean).join(" / ");

    const fiyatHtml = fiyat
      ? `
        <tr><td class="label">Beklenen</td><td class="value">${fmtTLM2(fiyat.beklenenPerM2)}</td></tr>
        <tr><td class="label">Aralık</td><td class="value">${fmtTLM2(fiyat.altPerM2)} – ${fmtTLM2(fiyat.ustPerM2)}</td></tr>
        <tr><td class="label">Toplam</td><td class="value">${fmtTL(fiyat.toplamBeklenen)}</td></tr>
        <tr><td class="label">Güven</td><td class="value">${guvenTR(fiyat.guven)} (${fiyat.guvenSkoru}/100)</td></tr>
        <tr><td class="label">Kaynak</td><td class="value small">${fiyat.baselineKaynak}</td></tr>
      `
      : `<tr><td colspan="2" class="empty">Veri yok</td></tr>`;

    const ePlanHtml = ePlan
      ? `
        <tr><td class="label">Kullanım</td><td class="value">${ePlan.kullanimKarari ?? ePlan.planKarari ?? "—"}</td></tr>
        <tr><td class="label">Emsal</td><td class="value">${ePlan.emsal != null ? ePlan.emsal.toFixed(2) : "—"}</td></tr>
        <tr><td class="label">TAKS</td><td class="value">${ePlan.taks != null ? ePlan.taks.toFixed(2) : "—"}</td></tr>
        <tr><td class="label">Maks Kat</td><td class="value">${ePlan.maksKat != null ? `${ePlan.maksKat} kat` : "—"}</td></tr>
        <tr><td class="label">Güven</td><td class="value">${ePlan.guvenSkoru}%</td></tr>
      `
      : `<tr><td colspan="2" class="empty">e-Plan verisi yok</td></tr>`;

    return `
      <div class="kolon" style="width:${kolonWidth}%">
        <div class="kolon-baslik">
          <div class="ada-parsel">Ada ${parsel.adaNo} / Parsel ${parsel.parselNo}</div>
          <div class="adres">${adres || "—"}</div>
        </div>
        <div class="bolum-baslik">Parsel Bilgisi</div>
        <table class="veri-tablo">
          <tr><td class="label">Alan</td><td class="value">${fmtM2(parsel.alan)}</td></tr>
          <tr><td class="label">Nitelik</td><td class="value">${parsel.nitelik || "—"}</td></tr>
          <tr><td class="label">Durum</td><td class="value">${parsel.durum || "—"}</td></tr>
          <tr><td class="label">Mahalle Kodu</td><td class="value font-mono">${parsel.mahalleKodu ?? "—"}</td></tr>
        </table>
        <div class="bolum-baslik">Fiyat Tahmini</div>
        <table class="veri-tablo">${fiyatHtml}</table>
        <div class="bolum-baslik">İmar Durumu</div>
        <table class="veri-tablo">${ePlanHtml}</table>
      </div>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8" />
<title>Parsel Karşılaştırma Raporu — Cadastrum</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1e293b; background: #fff; }
  .rapor-header { display: flex; justify-content: space-between; align-items: flex-end; padding: 16px 20px 12px; border-bottom: 2px solid #1B2A4A; margin-bottom: 16px; }
  .rapor-baslik { font-size: 18px; font-weight: 700; color: #1B2A4A; }
  .rapor-alt { font-size: 10px; color: #64748b; margin-top: 2px; }
  .rapor-tarih { font-size: 10px; color: #64748b; text-align: right; }
  .kolonlar { display: flex; gap: 12px; padding: 0 20px; }
  .kolon { flex-shrink: 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
  .kolon-baslik { background: #1B2A4A; color: #fff; padding: 8px 10px; }
  .ada-parsel { font-size: 12px; font-weight: 700; }
  .adres { font-size: 9px; color: #94a3b8; margin-top: 2px; }
  .bolum-baslik { background: #f1f5f9; color: #475569; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 4px 10px; border-top: 1px solid #e2e8f0; }
  .veri-tablo { width: 100%; border-collapse: collapse; }
  .veri-tablo tr:not(:last-child) td { border-bottom: 1px solid #f1f5f9; }
  .veri-tablo td { padding: 3px 10px; vertical-align: top; }
  .veri-tablo .label { color: #64748b; font-size: 9px; width: 42%; }
  .veri-tablo .value { color: #1e293b; font-weight: 600; font-size: 10px; }
  .veri-tablo .value.small { font-size: 8px; font-weight: 400; color: #64748b; }
  .veri-tablo .empty { color: #94a3b8; font-style: italic; font-size: 9px; text-align: center; padding: 6px; }
  .rapor-footer { margin-top: 20px; padding: 10px 20px; border-top: 1px solid #e2e8f0; font-size: 8px; color: #94a3b8; font-style: italic; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .kolon-baslik { background: #1B2A4A !important; -webkit-print-color-adjust: exact; }
    .bolum-baslik { background: #f1f5f9 !important; }
  }
</style>
</head>
<body>
  <div class="rapor-header">
    <div>
      <div class="rapor-baslik">Parsel Karşılaştırma Raporu</div>
      <div class="rapor-alt">Cadastrum — ${liste.length} parsel karşılaştırması</div>
    </div>
    <div class="rapor-tarih">Oluşturulma: ${tarih}</div>
  </div>
  <div class="kolonlar">${kolonlerHtml}</div>
  <div class="rapor-footer">
    Bu rapor Cadastrum uzantısı tarafından oluşturulmuştur. Fiyat tahminleri heuristic modeldir ve resmi
    değerleme belgesi yerine geçmez. Karar vermeden önce uzman görüşü alınız.
  </div>
</body>
</html>`;
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────

interface KarsilastirmaViewProps {
  onFlyTo?: (parsel: Parsel) => void;
}

export function KarsilastirmaView({ onFlyTo }: KarsilastirmaViewProps) {
  const { liste, temizle } = useKarsilastirma();
  const [pdfYukleniyor, setPdfYukleniyor] = useState(false);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  function pdfIndir() {
    if (liste.length === 0) return;
    setPdfYukleniyor(true);

    try {
      // Gizli iframe yöntemi — mevcut sayfayı bozmaz
      const html = pdfRaporHtmlUret(liste);

      // Varsa eski iframe'i temizle
      if (printFrameRef.current) {
        document.body.removeChild(printFrameRef.current);
      }

      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;pointer-events:none;";
      document.body.appendChild(iframe);
      printFrameRef.current = iframe;

      const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
      if (!doc) { setPdfYukleniyor(false); return; }

      doc.open();
      doc.write(html);
      doc.close();

      // Resimlerin yüklenmesini bekle, sonra print
      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow?.print();
          setPdfYukleniyor(false);
          // iframe'i kısa süre sonra temizle
          setTimeout(() => {
            if (printFrameRef.current) {
              try { document.body.removeChild(printFrameRef.current); } catch { /* zaten silinmiş */ }
              printFrameRef.current = null;
            }
          }, 1000);
        }, 200);
      };
    } catch {
      setPdfYukleniyor(false);
    }
  }

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
        <div className="flex items-center gap-2">
          {/* N4 — PDF export */}
          <button
            type="button"
            onClick={pdfIndir}
            disabled={pdfYukleniyor}
            className="flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-3xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50 transition-colors dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-300"
          >
            <FileDownIcon className="h-3 w-3" />
            {pdfYukleniyor ? "Hazırlanıyor…" : "PDF İndir"}
          </button>
          <button
            type="button"
            onClick={temizle}
            className="text-3xs text-slate-400 hover:text-red-500 transition-colors"
          >
            Temizle
          </button>
        </div>
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
