import { useLiveQuery } from "dexie-react-hooks";
import { db, type FavoriParsel } from "../../lib/db";
import { etiketBul } from "../components/ParselNotDefteri";
import { usePortfoySync, backendenFavoriSil } from "../../lib/portfoy-sync";
import { CloudIcon, RefreshCwIcon, CheckIcon, AlertCircleIcon, Star as StarIcon, MapPin as MapPinIcon, ArrowRight as ArrowRightIcon } from "lucide-react";

/** Beykoz Kavacık — örnek demo parseli */
const DEMO_KOORD = { lat: 41.1167, lng: 29.1833, label: "Beykoz Kavacık" };

interface Props {
  onSelect: (favori: FavoriParsel) => void;
  /** Haritaya fly-to tetiklemek için — boş durum "Demo'ya git" butonunda kullanılır */
  onFlyTo?: (lat: number, lng: number) => void;
}

export function FavorilerView({ onSelect, onFlyTo }: Props) {
  const favoriler = useLiveQuery(
    () => db.favoriler.orderBy("eklenmeTarihi").reverse().toArray(),
    [],
  );

  const { senkronize, yukluyor, sonSenkron, hata } = usePortfoySync();

  async function sil(fav: FavoriParsel) {
    if (!fav.id) return;
    // Hem yerel hem backend'den sil (sessiz başarısız)
    await Promise.all([
      db.favoriler.delete(fav.id),
      backendenFavoriSil(fav.mahalleKodu, fav.adaNo, fav.parselNo),
    ]);
  }

  if (!favoriler) {
    return <p className="p-4 text-xs text-tkgm-muted">Yükleniyor…</p>;
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Sync header ── */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <CloudIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {sonSenkron
            ? <span>Son: {sonSenkron.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
            : <span>Senkronize edilmedi</span>}
          {hata && (
            <span className="flex items-center gap-0.5 text-red-500" title={hata}>
              <AlertCircleIcon className="h-3 w-3" aria-hidden="true" />
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void senkronize()}
          disabled={yukluyor}
          className="flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          aria-label="Favorileri bulutla senkronize et"
        >
          <RefreshCwIcon className={`h-3 w-3 ${yukluyor ? "animate-spin" : ""}`} aria-hidden="true" />
          {yukluyor ? "Senkronize ediliyor…" : "Senkronize et"}
        </button>
      </div>

      {/* ── Liste ── */}
      {favoriler.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 p-5 text-center gap-4">
          {/* İkon */}
          <div className="rounded-full bg-amber-50 dark:bg-amber-900/20 p-4">
            <StarIcon className="h-8 w-8 text-amber-400" aria-hidden="true" />
          </div>

          {/* Başlık + açıklama */}
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Portföyün henüz boş
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-[220px] leading-relaxed">
              Haritadan herhangi bir parseli analiz et, yıldız ikonuna bas — buraya eklensin.
            </p>
          </div>

          {/* Demo parsel CTA */}
          {onFlyTo && (
            <button
              type="button"
              onClick={() => onFlyTo(DEMO_KOORD.lat, DEMO_KOORD.lng)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-imperial hover:bg-imperial-50 dark:hover:bg-slate-700 transition-colors"
            >
              <MapPinIcon className="h-3.5 w-3.5 text-imperial flex-shrink-0" aria-hidden="true" />
              <span>
                <span className="font-semibold text-imperial">Demo:</span> {DEMO_KOORD.label}
              </span>
              <ArrowRightIcon className="h-3 w-3 text-slate-400 ml-auto" aria-hidden="true" />
            </button>
          )}

          {/* Adım bilgisi */}
          <p className="text-[10px] text-slate-400 dark:text-slate-500">
            Parsel detayında <strong>★ Kaydet</strong> butonuna bas
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200 dark:divide-slate-700 overflow-y-auto">
          {favoriler.map((f) => {
            const etiket = etiketBul(f.etiket);
            const notlar = f.notlar ?? (f.not ? [{ id: "legacy", metin: f.not, tarih: f.eklenmeTarihi }] : []);
            const sonNot = notlar[notlar.length - 1];
            return (
              <div key={f.id} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
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
                      {[f.mahalleAd, f.ilceAd, f.ilAd].filter(Boolean).join(" · ")}
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
                    {f.parsel?.alan ? `${f.parsel.alan.toLocaleString("tr-TR")} m²` : ""}{f.parsel?.nitelik ? ` · ${f.parsel.nitelik}` : ""}
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
                    onClick={() => void sil(f)}
                    className="text-[11px] text-red-600 hover:underline"
                  >
                    Sil
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
