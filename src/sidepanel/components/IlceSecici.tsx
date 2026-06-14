import { useEffect, useState } from "react";
import {
  getIlListesi,
  getIlceListesi,
} from "../../lib/tkgm-api";
import type { Il, Ilce } from "../../types/tkgm";

interface Props {
  onSec: (ilce: { ilceKodu: number; ilceAd: string; ilAd: string }) => void;
  baslangicIlKodu?: number | null;
}

export function IlceSecici({ onSec, baslangicIlKodu }: Props) {
  const [iller, setIller] = useState<Il[]>([]);
  const [ilceler, setIlceler] = useState<Ilce[]>([]);
  const [ilKodu, setIlKodu] = useState<number | null>(baslangicIlKodu ?? null);
  const [ilceKodu, setIlceKodu] = useState<number | null>(null);

  useEffect(() => {
    getIlListesi()
      .then((list) => {
        list.sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
        setIller(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (ilKodu == null) {
      setIlceler([]);
      setIlceKodu(null);
      return;
    }
    getIlceListesi(ilKodu)
      .then((list) => {
        list.sort((a, b) => a.ilceAdi.localeCompare(b.ilceAdi, "tr"));
        setIlceler(list);
      })
      .catch(() => {});
  }, [ilKodu]);

  function ekle() {
    if (ilceKodu == null) return;
    const ilce = ilceler.find((x) => x.ilceKodu === ilceKodu);
    const il = iller.find((x) => x.kod === ilKodu);
    if (!ilce || !il) return;
    onSec({
      ilceKodu: ilce.ilceKodu,
      ilceAd: ilce.ilceAdi,
      ilAd: il.ad,
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-1">
      <select
        value={ilKodu ?? ""}
        onChange={(e) => setIlKodu(e.target.value ? Number(e.target.value) : null)}
        className="rounded border border-slate-300 bg-white px-1.5 py-1 text-[10px]"
      >
        <option value="">İl…</option>
        {iller.map((il) => (
          <option key={il.kod} value={il.kod}>
            {il.ad}
          </option>
        ))}
      </select>
      <select
        value={ilceKodu ?? ""}
        onChange={(e) => setIlceKodu(e.target.value ? Number(e.target.value) : null)}
        disabled={ilKodu == null}
        className="rounded border border-slate-300 bg-white px-1.5 py-1 text-[10px] disabled:bg-slate-100"
      >
        <option value="">İlçe…</option>
        {ilceler.map((ilce) => (
          <option key={ilce.ilceKodu} value={ilce.ilceKodu}>
            {ilce.ilceAdi}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={ekle}
        disabled={ilceKodu == null}
        className="rounded bg-purple-600 px-2 py-1 text-[10px] font-medium text-white disabled:bg-slate-300"
      >
        Ekle
      </button>
    </div>
  );
}
