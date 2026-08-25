/**
 * SaveScanDugmesi — Bölge taramasını Dexie'ye kaydetme butonu
 *
 * BolgeView.tsx'den çıkarıldı (SRP: tek sorumluluk).
 * Dexie bağımlılığı: db.bolgeTaramalari.add()
 */

import { useState } from "react";
import { Save as SaveIcon } from "lucide-react";
import { db } from "../../lib/db";
import type { BolgeStats } from "../../lib/bolge-profili";
import type { Parsel } from "../../types/tkgm";

interface Props {
  stats: BolgeStats;
  parseller: Parsel[];
}

export function SaveScanDugmesi({ stats, parseller }: Props) {
  const [kaydetmeModu, setKaydetmeModu] = useState(false);
  const [ad, setAd] = useState("");
  const [not, setNot] = useState("");
  const [kayitliMi, setKayitliMi] = useState(false);

  async function kaydet() {
    if (!ad.trim()) return;
    await db.bolgeTaramalari.add({
      ad: ad.trim(),
      not: not.trim(),
      olusmaTarihi: Date.now(),
      bbox: stats.bbox,
      parseller,
      stats,
    });
    setKayitliMi(true);
    setKaydetmeModu(false);
    setTimeout(() => setKayitliMi(false), 2000);
  }

  if (kayitliMi) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-2xs text-accent-success">
        ✓ Kaydedildi! Daha sonra "Kayıtlı taramalar"dan tekrar açabilirsin.
      </div>
    );
  }

  if (!kaydetmeModu) {
    return (
      <button
        type="button"
        onClick={() => setKaydetmeModu(true)}
        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-2xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
      >
        <SaveIcon className="h-3.5 w-3.5" />
        Bu taramayı kaydet
      </button>
    );
  }

  return (
    <div className="space-y-1.5 rounded-md border border-slate-300 bg-white p-2">
      <input
        type="text"
        value={ad}
        onChange={(e) => setAd(e.target.value)}
        placeholder="Tarama adı (örn. Esenyurt batı kanat)"
        className="w-full rounded border border-slate-300 px-2 py-1 text-2xs"
        autoFocus
      />
      <textarea
        value={not}
        onChange={(e) => setNot(e.target.value)}
        placeholder="Not (opsiyonel)"
        rows={2}
        className="w-full resize-none rounded border border-slate-300 px-2 py-1 text-2xs"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={kaydet}
          disabled={!ad.trim()}
          className="flex-1 cursor-pointer rounded-md bg-tkgm-primary px-2 py-1 text-2xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Kaydet
        </button>
        <button
          type="button"
          onClick={() => setKaydetmeModu(false)}
          className="cursor-pointer rounded-md border border-slate-300 px-2 py-1 text-2xs"
        >
          Vazgeç
        </button>
      </div>
    </div>
  );
}
