import { useLiveQuery } from "dexie-react-hooks";
import { db, type FavoriParsel } from "../../lib/db";

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
    <div className="divide-y divide-slate-200 overflow-y-auto">
      {favoriler.map((f) => (
        <div key={f.id} className="p-3 hover:bg-slate-50">
          <button
            type="button"
            onClick={() => onSelect(f)}
            className="block w-full text-left"
          >
            <div className="text-sm font-medium text-tkgm-ink">
              {f.adaNo}/{f.parselNo}
              <span className="ml-2 text-xs font-normal text-tkgm-muted">
                {f.ilAd} · {f.ilceAd} · {f.mahalleAd}
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-tkgm-muted">
              {f.parsel.alan.toLocaleString("tr-TR")} m² · {f.parsel.nitelik}
            </div>
            {f.not && (
              <div className="mt-1 text-xs italic text-slate-600">
                "{f.not}"
              </div>
            )}
            <div className="mt-1 text-[10px] text-tkgm-muted">
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
      ))}
    </div>
  );
}
