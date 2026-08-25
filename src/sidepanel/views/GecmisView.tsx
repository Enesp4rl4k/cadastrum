import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db, type SorguGecmisi } from "../../lib/db";
import {
  MapPin as MapPinIcon,
  XCircle as XCircleIcon,
  Clock as ClockIcon,
  Trash2 as TrashIcon,
} from "lucide-react";

interface Props {
  onSelect: (kayit: SorguGecmisi) => void;
}

/* ─── Zaman grubu ──────────────────────────────────────────────────────── */

function zamanGrubu(zaman: number): "bugün" | "bu hafta" | "daha önce" {
  const simdi = Date.now();
  const gun = 24 * 60 * 60 * 1000;
  const fark = simdi - zaman;
  if (fark < gun)         return "bugün";
  if (fark < 7 * gun)    return "bu hafta";
  return "daha önce";
}

const GRUP_SIRA: Array<"bugün" | "bu hafta" | "daha önce"> = ["bugün", "bu hafta", "daha önce"];
const GRUP_ETIKET: Record<string, string> = {
  "bugün":      "Bugün",
  "bu hafta":   "Bu Hafta",
  "daha önce":  "Daha Önce",
};

/* ─── Bileşen ──────────────────────────────────────────────────────────── */

export function GecmisView({ onSelect }: Props) {
  const kayitlar = useLiveQuery(
    () => db.gecmis.orderBy("zaman").reverse().limit(200).toArray(),
    [],
  );

  const gruplar = useMemo(() => {
    if (!kayitlar) return null;
    const harita = new Map<string, SorguGecmisi[]>();
    for (const k of kayitlar) {
      const g = zamanGrubu(k.zaman);
      if (!harita.has(g)) harita.set(g, []);
      harita.get(g)!.push(k);
    }
    return harita;
  }, [kayitlar]);

  async function temizle() {
    if (!confirm("Tüm sorgu geçmişini silmek istiyor musun?")) return;
    await db.gecmis.clear();
  }

  if (!kayitlar) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (kayitlar.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="mb-3 rounded-full bg-slate-100 dark:bg-slate-800 p-3">
          <ClockIcon className="h-6 w-6 text-slate-400" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Henüz sorgu yapılmadı</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-[200px]">
          Harita sekmesine git, bir parsele tıkla veya koordinat ara.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Başlık ── */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          {kayitlar.length} sorgu
        </span>
        <button
          type="button"
          onClick={temizle}
          className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors"
          aria-label="Tüm geçmişi temizle"
        >
          <TrashIcon className="h-3 w-3" aria-hidden="true" />
          Temizle
        </button>
      </div>

      {/* ── Gruplu liste ── */}
      <div className="flex-1 overflow-y-auto">
        {GRUP_SIRA.map((grup) => {
          const liste = gruplar?.get(grup);
          if (!liste || liste.length === 0) return null;
          return (
            <div key={grup}>
              {/* Grup başlığı */}
              <div className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/80 px-3 py-1 border-b border-slate-100 dark:border-slate-700">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {GRUP_ETIKET[grup]}
                </span>
              </div>

              {/* Kayıtlar */}
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {liste.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => onSelect(k)}
                    className="block w-full p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {/* Ada/Parsel + lokasyon */}
                        {k.basarili && k.parsel ? (
                          <>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[12px] font-semibold text-slate-800 dark:text-slate-100">
                                Ada {k.parsel.adaNo} / {k.parsel.parselNo}
                              </span>
                              {k.parsel.nitelik && (
                                <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-950/30 px-1.5 py-0.5 text-[9px] font-medium text-blue-700 dark:text-blue-300">
                                  {k.parsel.nitelik.slice(0, 16)}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                              <MapPinIcon className="h-2.5 w-2.5 flex-shrink-0" aria-hidden="true" />
                              <span className="truncate">
                                {[k.parsel.mahalleAd, k.parsel.ilceAd, k.parsel.ilAd]
                                  .filter(Boolean).join(" · ")}
                              </span>
                            </div>
                            {k.parsel.alan > 0 && (
                              <div className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                                {k.parsel.alan.toLocaleString("tr-TR")} m²
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <XCircleIcon className="h-3.5 w-3.5 text-red-400 flex-shrink-0" aria-hidden="true" />
                            <span className="text-[12px] font-medium text-red-600 dark:text-red-400">
                              Parsel bulunamadı
                            </span>
                            {k.hata && (
                              <span className="text-[10px] text-red-500 dark:text-red-400 truncate">
                                · {k.hata}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Zaman */}
                      <span className="flex-shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
                        {new Date(k.zaman).toLocaleTimeString("tr-TR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    {/* Koordinat — başarısız sorgular için yardımcı */}
                    {!k.basarili && (
                      <div className="mt-0.5 text-[10px] font-mono text-slate-400">
                        {k.lat.toFixed(5)}, {k.lng.toFixed(5)}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
