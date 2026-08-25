/**
 * Portföy Panel — Çoklu parsel analiz ve karşılaştırma tablosu.
 *
 * Karşılaştırma store'undaki tüm parselleri tablo formatında gösterir.
 * Her satır: parsel kimliği, alan, nitelik, imar, fiyat tahmini, güven skoru,
 * risk özeti, ROI (varsa).
 *
 * Özellikler:
 *   - En iyi parsel otomatik vurgulanır (en yüksek güven skoru)
 *   - Export: CSV veya kopyala (clipboard)
 *   - Sıralama: fiyat, güven skoru, alan bazlı
 *   - Favorilere ekle toplu
 */

import { useState, useMemo } from "react";
import {
  Trash2 as TrashIcon,
  Download as DownloadIcon,
  Copy as CopyIcon,
  Star as StarIcon,
  ArrowUpDown as SortIcon,
  CheckCircle as CheckIcon,
  AlertTriangle as WarnIcon,
} from "lucide-react";
import { useKarsilastirma, parselKarsilastirmaKey, MAX_PORTFOY } from "../../lib/karsilastirma-store";
import type { KarsilastirmaKayit } from "../../lib/karsilastirma-store";

// ─── Tipler ──────────────────────────────────────────────────────────────────

type SiralamaAlani = "fiyat" | "alan" | "guven" | "eklenme";
type SiralamaCiheti = "asc" | "desc";

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function fmtTL(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ₺`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}K ₺`;
  return `${n.toLocaleString("tr-TR")} ₺`;
}

function fmtM2(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toLocaleString("tr-TR")} m²`;
}

// ─── Tablo satırı ──────────────────────────────────────────────────────────

interface SatirProps {
  kayit: KarsilastirmaKayit;
  enIyi: boolean;
  onCikar: () => void;
}

function PortfoySatir({ kayit, enIyi, onCikar }: SatirProps) {
  const p = kayit.parsel;
  const fiyat = kayit.fiyat;
  const guvenSkoru = fiyat?.guvenSkoru ?? null;
  const beklenen = fiyat?.beklenenPerM2 ?? null;
  const toplam = fiyat?.toplamBeklenen ?? null;

  const guvenRenk = guvenSkoru == null ? "text-slate-400"
    : guvenSkoru >= 65 ? "text-emerald-600"
    : guvenSkoru >= 40 ? "text-amber-600"
    : "text-red-500";

  return (
    <tr className={`border-b border-slate-100 dark:border-slate-800 ${enIyi ? "bg-emerald-50 dark:bg-emerald-950/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}>
      {/* İşaret */}
      <td className="px-3 py-2 text-center">
        {enIyi ? (
          <span title="En yüksek güven skoru" className="text-emerald-600">
            <StarIcon aria-hidden="true" className="h-3.5 w-3.5 inline fill-current" />
          </span>
        ) : null}
      </td>

      {/* Parsel kimliği */}
      <td className="px-3 py-2">
        <div className="text-xs font-medium text-slate-800 dark:text-slate-200">
          {p.ilceAd} / {p.mahalleAd ?? "—"}
        </div>
        <div className="text-2xs text-slate-500">
          Ada {p.adaNo} · Parsel {p.parselNo}
        </div>
      </td>

      {/* Alan */}
      <td className="px-3 py-2 text-xs text-right text-slate-700 dark:text-slate-300">
        {fmtM2(p.alan)}
      </td>

      {/* Nitelik */}
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        {p.nitelik ?? "—"}
      </td>

      {/* İmar */}
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        {kayit.ePlan?.kullanimKarari
          ? <span className="text-blue-600 dark:text-blue-400">{kayit.ePlan.kullanimKarari.slice(0, 30)}</span>
          : <span className="text-slate-400">Bilinmiyor</span>}
      </td>

      {/* Birim fiyat */}
      <td className="px-3 py-2 text-xs text-right font-medium text-slate-800 dark:text-slate-200">
        {beklenen ? `${beklenen.toLocaleString("tr-TR")} ₺/m²` : "—"}
      </td>

      {/* Toplam değer */}
      <td className="px-3 py-2 text-xs text-right font-semibold text-slate-900 dark:text-slate-100">
        {fmtTL(toplam)}
      </td>

      {/* Güven */}
      <td className="px-3 py-2 text-center">
        {guvenSkoru != null ? (
          <span className={`text-xs font-bold ${guvenRenk}`}>{guvenSkoru}</span>
        ) : (
          <span className="text-2xs text-slate-400">—</span>
        )}
      </td>

      {/* Yükleme durumu */}
      <td className="px-3 py-2 text-center">
        {!fiyat ? (
          <span className="text-2xs text-amber-600 dark:text-amber-400">⏳</span>
        ) : (
          <CheckIcon aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600 inline" />
        )}
      </td>

      {/* Çıkar butonu */}
      <td className="px-3 py-2 text-center">
        <button
          type="button"
          onClick={onCikar}
          aria-label={`${p.adaNo}/${p.parselNo} parseli portföyden çıkar`}
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 dark:hover:bg-red-950"
        >
          <TrashIcon aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────

export function PortfoyPanel() {
  const { liste, cikar, temizle } = useKarsilastirma();
  const [siralama, setSiralama] = useState<SiralamaAlani>("eklenme");
  const [siralCiheti, setSiralCiheti] = useState<SiralamaCiheti>("desc");
  const [kopyalandı, setKopyalandi] = useState(false);

  // Sıralama
  const siraliListe = useMemo(() => {
    const kopya = [...liste];
    kopya.sort((a, b) => {
      let av = 0, bv = 0;
      if (siralama === "fiyat") {
        av = a.fiyat?.toplamBeklenen ?? 0;
        bv = b.fiyat?.toplamBeklenen ?? 0;
      } else if (siralama === "alan") {
        av = a.parsel.alan ?? 0;
        bv = b.parsel.alan ?? 0;
      } else if (siralama === "guven") {
        av = a.fiyat?.guvenSkoru ?? 0;
        bv = b.fiyat?.guvenSkoru ?? 0;
      } else {
        av = a.eklenmeTarihi;
        bv = b.eklenmeTarihi;
      }
      return siralCiheti === "desc" ? bv - av : av - bv;
    });
    return kopya;
  }, [liste, siralama, siralCiheti]);

  // En iyi parsel (en yüksek güven skoru)
  const enIyiKey = useMemo(() => {
    if (liste.length === 0) return null;
    const enIyi = liste.reduce((best, k) =>
      (k.fiyat?.guvenSkoru ?? 0) > (best.fiyat?.guvenSkoru ?? 0) ? k : best
    );
    return enIyi.key;
  }, [liste]);

  // Sıralama toggle
  const toggleSiralama = (alan: SiralamaAlani) => {
    if (siralama === alan) {
      setSiralCiheti((c: SiralamaCiheti) => c === "desc" ? "asc" : "desc");
    } else {
      setSiralama(alan);
      setSiralCiheti("desc");
    }
  };

  // CSV export
  const csvIndir = () => {
    const baslik = "İlçe,Mahalle,Ada,Parsel,Alan(m²),Nitelik,Birim Fiyat(₺/m²),Toplam(₺),Güven\n";
    const satirlar = siraliListe.map((k: KarsilastirmaKayit) => {
      const p = k.parsel;
      const f = k.fiyat;
      return [
        p.ilceAd ?? "",
        p.mahalleAd ?? "",
        p.adaNo,
        p.parselNo,
        p.alan ?? "",
        p.nitelik ?? "",
        f?.beklenenPerM2 ?? "",
        f?.toplamBeklenen ?? "",
        f?.guvenSkoru ?? "",
      ].join(",");
    }).join("\n");
    const blob = new Blob([baslik + satirlar], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfoy-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Clipboard kopyala
  const panoyaKopyala = async () => {
    const metin = siraliListe.map((k: KarsilastirmaKayit) => {
      const p = k.parsel;
      const f = k.fiyat;
      return `${p.ilceAd}/${p.mahalleAd} Ada:${p.adaNo} Parsel:${p.parselNo} | ${p.alan}m² | ${f?.beklenenPerM2 ?? "—"} ₺/m² | Toplam: ${f?.toplamBeklenen ? fmtTL(f.toplamBeklenen) : "—"} | Güven: ${f?.guvenSkoru ?? "—"}`;
    }).join("\n");
    await navigator.clipboard.writeText(metin);
    setKopyalandi(true);
    setTimeout(() => setKopyalandi(false), 2000);
  };

  if (liste.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-3 rounded-full bg-slate-100 p-4 dark:bg-slate-800">
          <StarIcon aria-hidden="true" className="h-8 w-8 text-slate-400" />
        </div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Portföy boş</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-xs">
          Parsel analizi yaparken "Portföye Ekle" butonuna tıklayarak parselleri buraya ekleyin.
          En fazla {MAX_PORTFOY} parsel karşılaştırabilirsiniz.
        </p>
      </div>
    );
  }

  const SortButon = ({ alan, label }: { alan: SiralamaAlani; label: string }) => (
    <button
      type="button"
      onClick={() => toggleSiralama(alan)}
      className={`flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide ${siralama === alan ? "text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400"} hover:text-blue-600`}
    >
      {label}
      <SortIcon aria-hidden="true" className="h-2.5 w-2.5" />
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Başlık + eylemler */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Portföy
          </h3>
          <p className="text-2xs text-slate-500">{liste.length} parsel · {enIyiKey ? "⭐ en iyi vurgulandı" : ""}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={panoyaKopyala}
            title="Portföyü panoya kopyala"
            className="rounded-md border border-slate-200 px-2 py-1.5 text-2xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {kopyalandı ? <CheckIcon aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600 inline" /> : <CopyIcon aria-hidden="true" className="h-3.5 w-3.5 inline" />}
            {" "}{kopyalandı ? "Kopyalandı!" : "Kopyala"}
          </button>
          <button
            type="button"
            onClick={csvIndir}
            title="CSV olarak indir"
            className="rounded-md border border-slate-200 px-2 py-1.5 text-2xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <DownloadIcon aria-hidden="true" className="h-3.5 w-3.5 inline" /> CSV
          </button>
          <button
            type="button"
            onClick={temizle}
            title="Portföyü temizle"
            className="rounded-md border border-red-200 px-2 py-1.5 text-2xs text-red-500 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            <TrashIcon aria-hidden="true" className="h-3.5 w-3.5 inline" /> Temizle
          </button>
        </div>
      </div>

      {/* Tablo */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full min-w-[640px] text-left">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2 w-6" />
              <th className="px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-slate-500">Parsel</th>
              <th className="px-3 py-2"><SortButon alan="alan" label="Alan" /></th>
              <th className="px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-slate-500">Nitelik</th>
              <th className="px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-slate-500">İmar</th>
              <th className="px-3 py-2"><SortButon alan="fiyat" label="₺/m²" /></th>
              <th className="px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-slate-500 text-right">Toplam</th>
              <th className="px-3 py-2"><SortButon alan="guven" label="Güven" /></th>
              <th className="px-3 py-2 w-8" title="Analiz hazır mı?" />
              <th className="px-3 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {siraliListe.map((kayit) => (
              <PortfoySatir
                key={kayit.key}
                kayit={kayit}
                enIyi={kayit.key === enIyiKey}
                onCikar={() => cikar(kayit.key)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Özet çubuk */}
      {liste.length >= 2 && (
        <div className="rounded-lg bg-slate-50 px-4 py-2 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-400 flex flex-wrap gap-4">
          <span>
            <strong className="text-slate-800 dark:text-slate-200">Toplam {liste.length} parsel</strong>
          </span>
          <span>
            Toplam alan:{" "}
            <strong className="text-slate-800 dark:text-slate-200">
              {fmtM2(liste.reduce((s, k) => s + (k.parsel.alan ?? 0), 0))}
            </strong>
          </span>
          <span>
            Toplam değer:{" "}
            <strong className="text-slate-800 dark:text-slate-200">
              {fmtTL(liste.reduce((s, k) => s + (k.fiyat?.toplamBeklenen ?? 0), 0))}
            </strong>
          </span>
          <span>
            Ort. güven:{" "}
            <strong className="text-slate-800 dark:text-slate-200">
              {(() => {
                const skorlar = liste.filter((k) => k.fiyat?.guvenSkoru != null).map((k) => k.fiyat!.guvenSkoru);
                return skorlar.length > 0
                  ? Math.round(skorlar.reduce((s, v) => s + v, 0) / skorlar.length)
                  : "—";
              })()}
            </strong>
          </span>
        </div>
      )}
    </div>
  );
}
