/**
 * Mahalle Karşılaştırma Matrisi — Sprint 3-A
 *
 * Kullanıcı 2-5 mahalle/ilçe seçer → yan yana karşılaştırma tablosu:
 *   - Arsa TL/m² medyan + bant
 *   - Tarla TL/m² medyan
 *   - Deprem riski (il bazlı)
 *   - Taşkın riski (il bazlı)
 *   - API'den trend (son 12 ay değişim %)
 *
 * Rakiplerde bu özellik yok — yatırımcılar Excel'de yapıyor.
 */
import { useState, useCallback } from "react";
import {
  Plus as PlusIcon,
  X as XIcon,
  TrendingUp as TrendIcon,
  TrendingDown as TrendDownIcon,
  Minus as MinusIcon,
  BarChart3 as BarIcon,
  Loader2 as LoaderIcon,
  FileDown as DownloadIcon,
} from "lucide-react";

const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

// ── Tipler ────────────────────────────────────────────────────────────────────

interface MahalleSatir {
  id: string;
  il: string;
  ilce: string;
  mahalle?: string;
  /** Yüklenme durumu */
  durum: "bos" | "yukleniyor" | "tamam" | "hata";
  hata?: string;
  // Fiyat verisi
  arsaMedian?: number;
  arsaQ1?: number;
  arsaQ3?: number;
  tarlaMedian?: number;
  ilanAdet?: number;
  trendYuzde?: number | null;
  // Risk (statik — API'den)
  depremZon?: string;
  taskinRisk?: string;
}

interface FiyatVeri {
  ok?: boolean;
  medyan?: number;
  q1?: number;
  q3?: number;
  ilan_adet?: number;
  degisim_yuzde?: number | null;
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function fmtTLM2(n: number | undefined): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString("tr-TR");
}

function depremRenk(zon: string | undefined): string {
  if (!zon) return "text-slate-400";
  if (zon === "Z1") return "text-red-600 font-bold";
  if (zon === "Z2") return "text-orange-600 font-semibold";
  if (zon === "Z3") return "text-amber-600";
  return "text-emerald-600";
}

function taskinRenk(risk: string | undefined): string {
  if (!risk) return "text-slate-400";
  if (risk === "yuksek") return "text-red-600 font-bold";
  if (risk === "orta") return "text-amber-600";
  return "text-emerald-600";
}

function trendIkon(yuzde: number | null | undefined) {
  if (yuzde == null) return <MinusIcon className="h-3 w-3 text-slate-400" />;
  if (yuzde > 2) return <TrendIcon className="h-3 w-3 text-emerald-500" />;
  if (yuzde < -2) return <TrendDownIcon className="h-3 w-3 text-red-500" />;
  return <MinusIcon className="h-3 w-3 text-slate-400" />;
}

// ── Veri çekme ────────────────────────────────────────────────────────────────

async function fiyatCek(il: string, ilce: string, mahalle?: string): Promise<{
  arsa: FiyatVeri | null;
  tarla: FiyatVeri | null;
  depremZon: string | undefined;
  taskinRisk: string | undefined;
}> {
  const ilEnc = encodeURIComponent(il);
  const ilceEnc = encodeURIComponent(ilce);

  // Paralel: arsa + tarla + deprem + taşkın
  const [arsaRes, tarlaRes, depremRes, taskinRes] = await Promise.allSettled([
    mahalle
      ? fetch(`${API_BASE}/fiyat/mahalle/${ilEnc}/${ilceEnc}/${encodeURIComponent(mahalle)}?kategori=arsa`).then(r => r.json() as Promise<FiyatVeri>)
      : fetch(`${API_BASE}/fiyat/ilce/${ilEnc}/${ilceEnc}?kategori=arsa`).then(r => r.json() as Promise<FiyatVeri>),
    mahalle
      ? fetch(`${API_BASE}/fiyat/mahalle/${ilEnc}/${ilceEnc}/${encodeURIComponent(mahalle)}?kategori=tarla`).then(r => r.json() as Promise<FiyatVeri>)
      : fetch(`${API_BASE}/fiyat/ilce/${ilEnc}/${ilceEnc}?kategori=tarla`).then(r => r.json() as Promise<FiyatVeri>),
    fetch(`${API_BASE}/api/risk/deprem?il=${ilEnc}`).then(r => r.json()),
    fetch(`${API_BASE}/api/risk/taskin?il=${ilEnc}`).then(r => r.json()),
  ]);

  return {
    arsa: arsaRes.status === "fulfilled" ? arsaRes.value : null,
    tarla: tarlaRes.status === "fulfilled" ? tarlaRes.value : null,
    depremZon: depremRes.status === "fulfilled" ? (depremRes.value as {zon?: string}).zon : undefined,
    taskinRisk: taskinRes.status === "fulfilled" ? (taskinRes.value as {risk?: string}).risk : undefined,
  };
}

// ── Satır bileşeni — form ─────────────────────────────────────────────────────

function SatirForm({
  satir,
  onGuncelle,
  onSil,
  onYukle,
}: {
  satir: MahalleSatir;
  onGuncelle: (id: string, alan: Partial<MahalleSatir>) => void;
  onSil: (id: string) => void;
  onYukle: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <input
        type="text"
        value={satir.il}
        onChange={(e) => onGuncelle(satir.id, { il: e.target.value })}
        placeholder="İl (örn. istanbul)"
        className="w-24 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-2xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      />
      <input
        type="text"
        value={satir.ilce}
        onChange={(e) => onGuncelle(satir.id, { ilce: e.target.value })}
        placeholder="İlçe (örn. kadikoy)"
        className="w-28 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-2xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      />
      <input
        type="text"
        value={satir.mahalle ?? ""}
        onChange={(e) => onGuncelle(satir.id, { mahalle: e.target.value || undefined })}
        placeholder="Mahalle (opsiyonel)"
        className="w-32 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-2xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      />
      <button
        type="button"
        onClick={() => onYukle(satir.id)}
        disabled={!satir.il || !satir.ilce || satir.durum === "yukleniyor"}
        className="flex items-center gap-1 rounded-md bg-tkgm-primary px-2.5 py-1.5 text-2xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 transition-colors"
      >
        {satir.durum === "yukleniyor" ? (
          <LoaderIcon className="h-3 w-3 animate-spin" />
        ) : (
          <BarIcon className="h-3 w-3" />
        )}
        Ekle
      </button>
      <button
        type="button"
        onClick={() => onSil(satir.id)}
        className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
      >
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────

export function MahalleKarsilastirma() {
  const yeniSatir = (): MahalleSatir => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    il: "",
    ilce: "",
    durum: "bos",
  });

  const [satirlar, setSatirlar] = useState<MahalleSatir[]>([yeniSatir(), yeniSatir()]);

  const guncelle = useCallback((id: string, alan: Partial<MahalleSatir>) => {
    setSatirlar((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...alan } : s))
    );
  }, []);

  const sil = useCallback((id: string) => {
    setSatirlar((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const yukle = useCallback(async (id: string) => {
    const satir = satirlar.find((s) => s.id === id);
    if (!satir || !satir.il || !satir.ilce) return;

    guncelle(id, { durum: "yukleniyor", hata: undefined });

    try {
      const { arsa, tarla, depremZon, taskinRisk } = await fiyatCek(
        satir.il.trim().toLowerCase(),
        satir.ilce.trim().toLowerCase(),
        satir.mahalle?.trim().toLowerCase(),
      );

      guncelle(id, {
        durum: "tamam",
        arsaMedian: arsa?.medyan,
        arsaQ1: arsa?.q1,
        arsaQ3: arsa?.q3,
        tarlaMedian: tarla?.medyan,
        ilanAdet: arsa?.ilan_adet,
        trendYuzde: arsa?.degisim_yuzde,
        depremZon,
        taskinRisk,
      });
    } catch (e) {
      guncelle(id, {
        durum: "hata",
        hata: e instanceof Error ? e.message : "Bağlantı hatası",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satirlar, guncelle]);

  const yeniEkle = () => {
    if (satirlar.length >= 5) return;
    setSatirlar((prev) => [...prev, yeniSatir()]);
  };

  // CSV export
  function csvIndir() {
    const tamam = satirlar.filter((s) => s.durum === "tamam");
    if (tamam.length === 0) return;

    const header = ["Konum", "Arsa TL/m²", "Arsa Q1", "Arsa Q3", "Tarla TL/m²", "İlan Adedi", "Trend %", "Deprem Zon", "Taşkın Risk"];
    const satirMetinler = tamam.map((s) => [
      [s.mahalle, s.ilce, s.il].filter(Boolean).join(" / "),
      s.arsaMedian ?? "",
      s.arsaQ1 ?? "",
      s.arsaQ3 ?? "",
      s.tarlaMedian ?? "",
      s.ilanAdet ?? "",
      s.trendYuzde ?? "",
      s.depremZon ?? "",
      s.taskinRisk ?? "",
    ].join(","));

    const csv = [header.join(","), ...satirMetinler].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mahalle-karsilastirma-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const tamam = satirlar.filter((s) => s.durum === "tamam");

  return (
    <div className="space-y-4 p-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Mahalle Karşılaştırma Matrisi
          </h3>
          <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
            2–5 konum seç → fiyat, risk ve trend yan yana
          </p>
        </div>
        {tamam.length > 0 && (
          <button
            type="button"
            onClick={csvIndir}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-2xs font-medium text-slate-600 shadow-card hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <DownloadIcon className="h-3 w-3" />
            CSV
          </button>
        )}
      </div>

      {/* Form satırları */}
      <div className="space-y-2">
        {satirlar.map((satir) => (
          <div
            key={satir.id}
            className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900"
          >
            <SatirForm
              satir={satir}
              onGuncelle={guncelle}
              onSil={sil}
              onYukle={yukle}
            />
            {satir.durum === "hata" && (
              <p className="mt-1.5 text-2xs text-red-600 dark:text-red-400">{satir.hata}</p>
            )}
          </div>
        ))}
      </div>

      {/* Yeni ekle butonu */}
      {satirlar.length < 5 && (
        <button
          type="button"
          onClick={yeniEkle}
          className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-2xs font-medium text-slate-500 hover:border-tkgm-primary hover:text-tkgm-primary transition-colors dark:border-slate-600 dark:text-slate-400"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Konum ekle (maks 5)
        </button>
      )}

      {/* Karşılaştırma tablosu */}
      {tamam.length >= 2 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm dark:border-slate-700">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-3 py-2.5 text-left text-2xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide whitespace-nowrap">
                  Özellik
                </th>
                {tamam.map((s) => (
                  <th key={s.id} className="px-3 py-2.5 text-center text-2xs font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                    <div>{[s.mahalle, s.ilce].filter(Boolean).join(" / ")}</div>
                    <div className="text-3xs font-normal text-slate-500 dark:text-slate-400">{s.il}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">

              {/* Arsa Medyan */}
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">
                  🏗 Arsa TL/m²
                </td>
                {tamam.map((s) => {
                  const max = Math.max(...tamam.map((x) => x.arsaMedian ?? 0));
                  const isMax = s.arsaMedian === max && max > 0;
                  return (
                    <td key={s.id} className={`px-3 py-2 text-center font-bold tabular-nums ${isMax ? "text-emerald-700 dark:text-emerald-400" : "text-slate-800 dark:text-slate-100"}`}>
                      {fmtTLM2(s.arsaMedian)} TL
                      {isMax && <span className="ml-1 text-3xs text-emerald-600">↑ En yüksek</span>}
                    </td>
                  );
                })}
              </tr>

              {/* Arsa bant */}
              <tr className="bg-slate-50/50 dark:bg-slate-900/30">
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-2xs">
                  Q1 – Q3 bant
                </td>
                {tamam.map((s) => (
                  <td key={s.id} className="px-3 py-2 text-center text-2xs text-slate-600 dark:text-slate-300 tabular-nums">
                    {s.arsaQ1 || s.arsaQ3
                      ? `${fmtTLM2(s.arsaQ1)} – ${fmtTLM2(s.arsaQ3)} TL`
                      : "—"
                    }
                  </td>
                ))}
              </tr>

              {/* Tarla Medyan */}
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">
                  🌾 Tarla TL/m²
                </td>
                {tamam.map((s) => (
                  <td key={s.id} className="px-3 py-2 text-center font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                    {fmtTLM2(s.tarlaMedian)} TL
                  </td>
                ))}
              </tr>

              {/* İlan Adedi */}
              <tr className="bg-slate-50/50 dark:bg-slate-900/30">
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-2xs">
                  Emsal ilan adedi
                </td>
                {tamam.map((s) => (
                  <td key={s.id} className="px-3 py-2 text-center text-2xs text-slate-600 dark:text-slate-300 tabular-nums">
                    {s.ilanAdet ?? "—"}
                  </td>
                ))}
              </tr>

              {/* Trend */}
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">
                  📈 Trend (12 ay)
                </td>
                {tamam.map((s) => (
                  <td key={s.id} className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {trendIkon(s.trendYuzde)}
                      <span className={`text-2xs font-semibold tabular-nums ${
                        s.trendYuzde != null && s.trendYuzde > 2 ? "text-emerald-600" :
                        s.trendYuzde != null && s.trendYuzde < -2 ? "text-red-500" : "text-slate-500"
                      }`}>
                        {s.trendYuzde != null ? `%${s.trendYuzde > 0 ? "+" : ""}${s.trendYuzde.toFixed(1)}` : "—"}
                      </span>
                    </div>
                  </td>
                ))}
              </tr>

              {/* Deprem Zonu */}
              <tr className="bg-slate-50/50 dark:bg-slate-900/30">
                <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">
                  ⚡ Deprem Zonu
                </td>
                {tamam.map((s) => (
                  <td key={s.id} className={`px-3 py-2 text-center text-sm ${depremRenk(s.depremZon)}`}>
                    {s.depremZon ?? "—"}
                  </td>
                ))}
              </tr>

              {/* Taşkın Riski */}
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">
                  🌊 Taşkın Riski
                </td>
                {tamam.map((s) => (
                  <td key={s.id} className={`px-3 py-2 text-center text-2xs font-semibold capitalize ${taskinRenk(s.taskinRisk)}`}>
                    {s.taskinRisk ?? "—"}
                  </td>
                ))}
              </tr>

            </tbody>
          </table>
        </div>
      )}

      {tamam.length === 1 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-2xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
          Karşılaştırma tablosu için en az 2 konum yükleyin.
        </div>
      )}

      {tamam.length === 0 && satirlar.some(s => s.durum !== "bos") === false && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-center dark:border-slate-700 dark:bg-slate-900">
          <BarIcon className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-2xs text-slate-500">İl, ilçe girin ve "Ekle"ye tıklayın.</p>
          <p className="text-3xs text-slate-400 mt-1">Örnek: istanbul / kadikoy / caddebostan</p>
        </div>
      )}

      <p className="text-3xs italic text-slate-400 dark:text-slate-500">
        Fiyatlar emsal ilan medyanından, riskler AFAD/TKGM verilerinden hesaplanır. Resmi değerleme yerine geçmez.
      </p>
    </div>
  );
}
