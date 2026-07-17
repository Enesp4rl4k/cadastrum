import { useLiveQuery } from "dexie-react-hooks";
import { db, type FavoriParsel } from "../../lib/db";
import { etiketBul } from "../components/ParselNotDefteri";

interface Props {
  onSelect: (favori: FavoriParsel) => void;
}

export function FavorilerView({ onSelect }: Props) {
  const favoriler = useLiveQuery(
    () => db.favoriler.orderBy("eklenmeTarihi").reverse().toArray(),
    [],
  );

  async function sil(id: number) {
    await db.favoriler.delete(id);
  }

  if (!favoriler) {
    return <p className="p-4 text-xs text-tkgm-muted">Yükleniyor…</p>;
  }

  if (favoriler.length === 0) {
    return (
      <div className="p-4 text-xs text-tkgm-muted">
        <p>Henüz favori yok.</p>
        <p className="mt-2">
          Harita sekmesinden bir parsel sorgula, alttaki "★ Favorilere ekle"
          düğmesine bas.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-200 overflow-y-auto dark:divide-slate-700">
      {favoriler.map((f) => {
        const etiket = etiketBul(f.etiket);
        const notlar = f.notlar ?? (f.not ? [{ id: "legacy", metin: f.not, tarih: f.eklenmeTarihi }] : []);
        const sonNot = notlar[notlar.length - 1];
        return (
        <div key={f.id} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
          <button
            type="button"
            onClick={() => onSelect(f)}
            className="block w-full text-left"
          >
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium text-tkgm-ink dark:text-slate-100">
                {f.adaNo}/{f.parselNo}
              </span>
              <span className="text-xs font-normal text-tkgm-muted dark:text-slate-400">
                {f.ilAd} · {f.ilceAd} · {f.mahalleAd}
              </span>
              {etiket && (
                <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${etiket.bg} ${etiket.text} ${etiket.border}`}>
                  {etiket.label}
                </span>
              )}
              {notlar.length > 0 && (
                <span className="rounded-full bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 dark:text-slate-300">
                  {notlar.length} not
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[11px] text-tkgm-muted dark:text-slate-400">
              {f.parsel.alan.toLocaleString("tr-TR")} m² · {f.parsel.nitelik}
            </div>
            {sonNot && (
              <div className="mt-1 text-[11px] italic text-slate-500 dark:text-slate-400 truncate">
                "{sonNot.metin}"
              </div>
            )}
            <div className="mt-1 text-[10px] text-tkgm-muted dark:text-slate-500">
              {new Date(f.eklenmeTarihi).toLocaleString("tr-TR")}
            </div>
          </button>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => onSelect(f)}
              className="text-[11px] text-tkgm-primary hover:underline"
            >
              Haritada göster
            </button>
            <button
              type="button"
              onClick={() => f.id && sil(f.id)}
              className="text-[11px] text-red-600 hover:underline"
            >
              Sil
            </button>
          </div>
        </div>
        );
      })}
    </div>
  );
}
