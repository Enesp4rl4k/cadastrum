import { useState } from "react";
import { db } from "../../lib/db";
import type { Parsel } from "../../types/tkgm";
import { AnalizPanel } from "./AnalizPanel";

interface Props {
  parsel: Parsel;
  onYakinPoiler?: (poiler: import("../../lib/osm").YakinNoktaMesafesi[] | null) => void;
}

export function ParselDetay({ parsel, onYakinPoiler }: Props) {
  const [not, setNot] = useState("");
  const [saved, setSaved] = useState(false);
  const [showNote, setShowNote] = useState(false);

  async function favoriyeEkle() {
    await db.favoriler.add({
      mahalleKodu: parsel.mahalleKodu ?? 0,
      adaNo: parsel.adaNo,
      parselNo: parsel.parselNo,
      ilAd: parsel.ilAd,
      ilceAd: parsel.ilceAd,
      mahalleAd: parsel.mahalleAd,
      not,
      eklenmeTarihi: Date.now(),
      parsel,
    });
    setSaved(true);
    setShowNote(false);
    setNot("");
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <Row k="İl" v={parsel.ilAd} />
        <Row k="İlçe" v={parsel.ilceAd} />
        <Row k="Mahalle" v={parsel.mahalleAd} />
        <Row k="Ada / Parsel" v={`${parsel.adaNo} / ${parsel.parselNo}`} />
        <Row k="Alan" v={`${parsel.alan.toLocaleString("tr-TR")} m²`} />
        <Row k="Nitelik" v={parsel.nitelik} />
        <Row k="Pafta" v={parsel.pafta} />
        {parsel.gittigiParseller.length > 0 && (
          <Row k="Gittiği parseller" v={parsel.gittigiParseller.join(", ")} />
        )}
      </dl>

      <div className="flex items-center gap-2 border-t border-slate-200 pt-2">
        {!showNote && !saved && (
          <button
            type="button"
            onClick={() => setShowNote(true)}
            className="rounded bg-tkgm-primary px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            ★ Favorilere ekle
          </button>
        )}
        {saved && <span className="text-xs text-emerald-600">✓ Eklendi</span>}
      </div>

      <AnalizPanel parsel={parsel} onYakinPoiler={onYakinPoiler} />

      {showNote && (
        <div className="space-y-2 rounded border border-slate-300 bg-white p-2">
          <textarea
            value={not}
            onChange={(e) => setNot(e.target.value)}
            placeholder="Not (opsiyonel) — örn. 'köşe parsel, imar planı kontrol et'"
            className="w-full resize-none rounded border border-slate-200 p-2 text-xs"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={favoriyeEkle}
              className="rounded bg-tkgm-primary px-3 py-1 text-xs font-medium text-white"
            >
              Kaydet
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNote(false);
                setNot("");
              }}
              className="rounded border border-slate-300 px-3 py-1 text-xs"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="font-medium text-tkgm-muted">{k}</dt>
      <dd className="text-tkgm-ink">{v || "—"}</dd>
    </>
  );
}
