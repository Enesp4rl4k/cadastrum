import { useLiveQuery } from "dexie-react-hooks";
import { db, type SorguGecmisi } from "../../lib/db";

interface Props {
  onSelect: (kayit: SorguGecmisi) => void;
}

export function GecmisView({ onSelect }: Props) {
  const kayitlar = useLiveQuery(
    () => db.gecmis.orderBy("zaman").reverse().limit(200).toArray(),
    [],
  );

  async function temizle() {
    if (!confirm("Tüm sorgu geçmişini silmek istiyor musun?")) return;
    await db.gecmis.clear();
  }

  if (!kayitlar) {
    return <p className="p-4 text-xs text-tkgm-muted">Yükleniyor…</p>;
  }

  if (kayitlar.length === 0) {
    return (
      <p className="p-4 text-xs text-tkgm-muted">Henüz sorgu yapılmadı.</p>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex justify-end border-b border-slate-200 bg-white px-3 py-2">
        <button
          type="button"
          onClick={temizle}
          className="text-[11px] text-red-600 hover:underline"
        >
          Geçmişi temizle
        </button>
      </div>
      <div className="divide-y divide-slate-200 overflow-y-auto">
        {kayitlar.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => onSelect(k)}
            className="block w-full p-3 text-left hover:bg-slate-50"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-tkgm-ink">
                {k.basarili && k.parsel
                  ? `${k.parsel.adaNo}/${k.parsel.parselNo}`
                  : "(bulunamadı)"}
              </span>
              <span className="text-[10px] text-tkgm-muted">
                {new Date(k.zaman).toLocaleString("tr-TR")}
              </span>
            </div>
            {k.basarili && k.parsel && (
              <div className="text-[11px] text-tkgm-muted">
                {k.parsel.ilAd} · {k.parsel.ilceAd} · {k.parsel.mahalleAd}
              </div>
            )}
            <div className="mt-0.5 text-[10px] text-tkgm-muted">
              {k.lat.toFixed(5)}, {k.lng.toFixed(5)}
              {!k.basarili && k.hata && (
                <span className="ml-2 text-red-600">· {k.hata}</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
