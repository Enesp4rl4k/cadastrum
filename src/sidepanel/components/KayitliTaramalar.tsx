import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  FolderOpen as FolderOpenIcon,
  Trash2 as TrashIcon,
  ChevronDown as ChevronDownIcon,
  ChevronRight as ChevronRightIcon,
  GitCompare as GitCompareIcon,
  Layers as LayersIcon,
} from "lucide-react";
import { db, type BolgeTaramasi } from "../../lib/db";
import type { BolgeStats } from "../../lib/bolge-profili";
import { fmtTL } from "../../lib/fiyat-tahmin";

interface Props {
  /** Bir taramayı haritaya yükle (bbox + parseller + stats) */
  onAc: (tarama: BolgeTaramasi) => void;
  /** Aktif (henüz kaydedilmemiş) taramayla karşılaştırma için */
  aktifStats: BolgeStats | null;
}

export function KayitliTaramalar({ onAc, aktifStats }: Props) {
  const [acik, setAcik] = useState(false);
  const [karsilastir, setKarsilastir] = useState<BolgeTaramasi | null>(null);

  const taramalar = useLiveQuery(
    () => db.bolgeTaramalari.orderBy("olusmaTarihi").reverse().toArray(),
    [],
  );

  async function sil(id: number) {
    if (!confirm("Bu taramayı silmek istiyor musun? Geri alınamaz.")) return;
    await db.bolgeTaramalari.delete(id);
  }

  if (!taramalar) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-card">
      <button
        type="button"
        onClick={() => setAcik((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-2xs font-medium text-slate-700 hover:bg-slate-50"
      >
        <span className="flex items-center gap-1.5">
          <FolderOpenIcon className="h-3.5 w-3.5 text-slate-500" />
          Kayıtlı taramalar
          <span className="rounded-full bg-slate-100 px-1.5 py-0 text-3xs font-semibold text-slate-600">
            {taramalar.length}
          </span>
        </span>
        {acik ? (
          <ChevronDownIcon className="h-3.5 w-3.5" />
        ) : (
          <ChevronRightIcon className="h-3.5 w-3.5" />
        )}
      </button>

      {acik && (
        <div className="border-t border-slate-200 p-2">
          {taramalar.length === 0 ? (
            <p className="text-3xs italic text-slate-500">
              Henüz kayıtlı tarama yok. Bir bbox tarayıp "Bu taramayı kaydet"e
              bas.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {taramalar.map((t) => (
                <TaramaSatir
                  key={t.id}
                  tarama={t}
                  onAc={() => onAc(t)}
                  onSil={() => t.id != null && sil(t.id)}
                  onKarsilastir={() => setKarsilastir(t)}
                  karsilastirilmis={karsilastir?.id === t.id}
                />
              ))}
            </div>
          )}

          {karsilastir && aktifStats && (
            <div className="mt-2 rounded-md border-2 border-tkgm-primary bg-tkgm-primary/5 p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-2xs font-semibold text-tkgm-primary">
                  <GitCompareIcon className="h-3.5 w-3.5" />
                  Karşılaştırma
                </span>
                <button
                  type="button"
                  onClick={() => setKarsilastir(null)}
                  className="text-3xs text-slate-500 hover:underline"
                >
                  kapat
                </button>
              </div>
              <KarsilastirmaTablo
                aktif={aktifStats}
                kayitli={karsilastir.stats}
                kayitliAd={karsilastir.ad}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaramaSatir({
  tarama,
  onAc,
  onSil,
  onKarsilastir,
  karsilastirilmis,
}: {
  tarama: BolgeTaramasi;
  onAc: () => void;
  onSil: () => void;
  onKarsilastir: () => void;
  karsilastirilmis: boolean;
}) {
  const tarih = new Date(tarama.olusmaTarihi).toLocaleString("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={`rounded-md border bg-white p-2 transition-colors ${
        karsilastirilmis
          ? "border-tkgm-primary bg-tkgm-primary/5"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-2xs font-semibold text-slate-800">
            {tarama.ad}
          </div>
          {tarama.not && (
            <div className="truncate text-3xs italic text-slate-500">
              {tarama.not}
            </div>
          )}
        </div>
        <div className="flex-shrink-0 text-3xs text-slate-400">{tarih}</div>
      </div>
      <div className="mb-1.5 grid grid-cols-3 gap-1 text-3xs">
        <div className="rounded bg-slate-50 px-1.5 py-0.5 text-center">
          <div className="font-semibold tabular-nums text-slate-700">
            {tarama.stats.parselSayisi}
          </div>
          <div className="text-slate-500">parsel</div>
        </div>
        <div className="rounded bg-slate-50 px-1.5 py-0.5 text-center">
          <div className="font-semibold tabular-nums text-slate-700">
            {(tarama.stats.toplamAlanM2 / 10_000).toFixed(1)} ha
          </div>
          <div className="text-slate-500">toplam</div>
        </div>
        <div className="rounded bg-slate-50 px-1.5 py-0.5 text-center">
          <div className="font-semibold tabular-nums text-slate-700">
            {tarama.stats.ortalamaAlanM2.toLocaleString("tr-TR")}
          </div>
          <div className="text-slate-500">ort. m²</div>
        </div>
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={onAc}
          className="flex-1 cursor-pointer rounded-md bg-tkgm-primary px-2 py-1 text-3xs font-medium text-white hover:bg-blue-700"
        >
          <LayersIcon className="mr-0.5 inline h-3 w-3" />
          Yükle
        </button>
        <button
          type="button"
          onClick={onKarsilastir}
          className={`cursor-pointer rounded-md border px-2 py-1 text-3xs font-medium transition-colors ${
            karsilastirilmis
              ? "border-tkgm-primary bg-tkgm-primary/10 text-tkgm-primary"
              : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          }`}
          title="Aktif taramayla karşılaştır"
        >
          <GitCompareIcon className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onSil}
          className="cursor-pointer rounded-md border border-red-200 bg-white px-2 py-1 text-3xs text-accent-danger hover:bg-red-50"
          title="Sil"
        >
          <TrashIcon className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function KarsilastirmaTablo({
  aktif,
  kayitli,
  kayitliAd,
}: {
  aktif: BolgeStats;
  kayitli: BolgeStats;
  kayitliAd: string;
}) {
  const satirlar: { label: string; aktif: string; kayitli: string; aktifNum: number; kayitliNum: number }[] = [
    {
      label: "Parsel sayısı",
      aktif: String(aktif.parselSayisi),
      kayitli: String(kayitli.parselSayisi),
      aktifNum: aktif.parselSayisi,
      kayitliNum: kayitli.parselSayisi,
    },
    {
      label: "Toplam alan (ha)",
      aktif: (aktif.toplamAlanM2 / 10_000).toFixed(1),
      kayitli: (kayitli.toplamAlanM2 / 10_000).toFixed(1),
      aktifNum: aktif.toplamAlanM2,
      kayitliNum: kayitli.toplamAlanM2,
    },
    {
      label: "Ortalama (m²)",
      aktif: aktif.ortalamaAlanM2.toLocaleString("tr-TR"),
      kayitli: kayitli.ortalamaAlanM2.toLocaleString("tr-TR"),
      aktifNum: aktif.ortalamaAlanM2,
      kayitliNum: kayitli.ortalamaAlanM2,
    },
    {
      label: "Medyan (m²)",
      aktif: aktif.medyanAlanM2.toLocaleString("tr-TR"),
      kayitli: kayitli.medyanAlanM2.toLocaleString("tr-TR"),
      aktifNum: aktif.medyanAlanM2,
      kayitliNum: kayitli.medyanAlanM2,
    },
  ];

  return (
    <div className="space-y-0.5 text-3xs">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 border-b border-slate-200 pb-0.5 text-slate-500">
        <span></span>
        <span className="text-right">Aktif</span>
        <span className="text-right truncate max-w-[80px]">{kayitliAd}</span>
        <span className="text-right">Δ</span>
      </div>
      {satirlar.map((s) => {
        const fark = s.kayitliNum > 0
          ? Math.round(((s.aktifNum - s.kayitliNum) / s.kayitliNum) * 100)
          : 0;
        const farkRengi =
          fark > 5 ? "text-accent-success" : fark < -5 ? "text-accent-danger" : "text-slate-500";
        return (
          <div
            key={s.label}
            className="grid grid-cols-[1fr_auto_auto_auto] gap-2 py-0.5"
          >
            <span className="text-slate-600">{s.label}</span>
            <span className="text-right font-medium tabular-nums text-slate-800">
              {s.aktif}
            </span>
            <span className="text-right tabular-nums text-slate-500">
              {s.kayitli}
            </span>
            <span className={`text-right font-bold tabular-nums ${farkRengi}`}>
              {fark > 0 ? "+" : ""}
              {fark}%
            </span>
          </div>
        );
      })}
      <div className="mt-1 border-t border-slate-200 pt-1 text-3xs italic text-slate-500">
        Aynı parseli dönem-dönem tarayıp değişim görebilirsin (yeni yapı, ifraz vb.)
      </div>
    </div>
  );
}
