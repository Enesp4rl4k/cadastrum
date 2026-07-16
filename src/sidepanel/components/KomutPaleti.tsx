/**
 * Komut Paleti — Faz 5 Sprint H.
 *
 * Cmd/Ctrl+K ile açılan global modal. NL sorgu (parse + filtre) + favoriler +
 * geçmiş + hızlı navigasyon.
 *
 * Liste 3 bölüm:
 *   1. Doğal dil sorgu sonucu (varsa) — parse görselleştirme
 *   2. Favori parsellerim (Dexie) — tıklayınca parsel açılır
 *   3. Son sorgular (Dexie gecmis) — ada/parsel adı + koordinat
 *
 * Sprint H+: Backend bağlantısı eklenince NL sorgu gerçek API'ye bağlanacak.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Search as SearchIcon,
  X as XIcon,
  MapPin as MapPinIcon,
  Clock as ClockIcon,
  Star as StarIcon,
} from "lucide-react";
import { db } from "../../lib/db";
import { nlParse, type NlSorgu } from "../../lib/nl-sorgu";
import type { Parsel } from "../../types/tkgm";

interface Props {
  /**
   * Favori veya geçmişteki bir parsele tıklandığında çağrılır.
   * App.tsx'de setFlyTo() ile harita navigasyonu tetiklenir.
   */
  onParselSec?: (parsel: Parsel) => void;
}

export function KomutPaleti({ onParselSec }: Props) {
  const [acik, setAcik] = useState(false);
  const [metin, setMetin] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+K shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAcik((a) => !a);
      } else if (e.key === "Escape") {
        setAcik(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (acik) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setMetin("");
    }
  }, [acik]);

  const parse = useMemo<NlSorgu | null>(() => {
    if (metin.trim().length < 3) return null;
    return nlParse(metin);
  }, [metin]);

  const favoriler = useLiveQuery(
    () => db.favoriler.orderBy("eklenmeTarihi").reverse().limit(8).toArray(),
    [],
  );
  const gecmis = useLiveQuery(
    () => db.gecmis.orderBy("zaman").reverse().limit(8).toArray(),
    [],
  );

  // Favori filtre — input metniyle fuzzy match
  const filtrelenmisFav = useMemo(() => {
    if (!favoriler) return [];
    if (!metin.trim()) return favoriler;
    const t = metin.toLocaleLowerCase("tr");
    return favoriler.filter((f) =>
      `${f.ilAd} ${f.ilceAd} ${f.mahalleAd} ${f.adaNo} ${f.parselNo}`
        .toLocaleLowerCase("tr")
        .includes(t),
    );
  }, [favoriler, metin]);

  // Geçmiş filtre — parsel bilgisi olanları öne al
  const filtrelenmisGecmis = useMemo(() => {
    if (!gecmis) return [];
    if (!metin.trim()) return gecmis;
    const t = metin.toLocaleLowerCase("tr");
    return gecmis.filter((g) => {
      if (!g.parsel) return false;
      return `${g.parsel.ilAd ?? ""} ${g.parsel.ilceAd ?? ""} ${g.parsel.mahalleAd ?? ""} ${g.parsel.adaNo} ${g.parsel.parselNo}`
        .toLocaleLowerCase("tr")
        .includes(t);
    });
  }, [gecmis, metin]);

  const handleFavoriSec = useCallback(
    (parsel: Parsel) => {
      setAcik(false);
      onParselSec?.(parsel);
    },
    [onParselSec],
  );

  const handleGecmisSec = useCallback(
    (parsel: Parsel) => {
      setAcik(false);
      onParselSec?.(parsel);
    },
    [onParselSec],
  );

  if (!acik) {
    return (
      <button
        onClick={() => setAcik(true)}
        title="Komut Paleti (Ctrl+K)"
        className="fixed bottom-3 right-3 z-30 flex items-center gap-1 rounded-full bg-slate-900 text-white shadow-lg px-3 py-1.5 text-xs hover:bg-slate-700"
      >
        <SearchIcon className="h-3 w-3" />
        <span>Ctrl+K</span>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-20"
      onClick={() => setAcik(false)}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl w-[92%] max-w-md max-h-[72vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 p-3 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <SearchIcon className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={metin}
            onChange={(e) => setMetin(e.target.value)}
            placeholder="ör: Beykoz arsa 1000m² üstü, favoriler, geçmiş…"
            className="flex-1 bg-transparent outline-none text-sm placeholder-slate-400"
          />
          <button
            onClick={() => setAcik(false)}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <XIcon className="h-4 w-4" />
          </button>
          <span className="text-2xs text-slate-400 hidden sm:block">ESC</span>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1 p-2 space-y-3">
          {/* NL Sorgu sonucu */}
          {parse && parse.bulunan.length > 0 && (
            <div className="p-2 rounded bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800">
              <div className="text-2xs font-semibold text-indigo-900 dark:text-indigo-300 mb-1">
                🔍 Sorgu parse edildi
              </div>
              <div className="space-y-0.5 text-2xs text-indigo-800 dark:text-indigo-300">
                {parse.kategori && <div>Kategori: <strong>{parse.kategori}</strong></div>}
                {parse.ilNorm && <div>İl: <strong>{parse.ilNorm}</strong></div>}
                {parse.ilceNorm && <div>İlçe: <strong>{parse.ilceNorm}</strong></div>}
                {parse.minM2 != null && <div>Min m²: <strong>{parse.minM2.toLocaleString("tr-TR")}</strong></div>}
                {parse.maksM2 != null && <div>Maks m²: <strong>{parse.maksM2.toLocaleString("tr-TR")}</strong></div>}
                {parse.minFiyat != null && (
                  <div>Min fiyat: <strong>₺{parse.minFiyat.toLocaleString("tr-TR")}</strong></div>
                )}
                {parse.maksFiyat != null && (
                  <div>Maks fiyat: <strong>₺{parse.maksFiyat.toLocaleString("tr-TR")}</strong></div>
                )}
                {parse.sahilYakini && <div>📍 Sahile yakın</div>}
                {parse.dusukDepremRiski && <div>🛡 Düşük deprem riski</div>}
              </div>
              <p className="text-3xs italic text-indigo-600 dark:text-indigo-400 mt-1.5">
                Backend bağlantısı yakında — şu an parse görselleştirme.
              </p>
            </div>
          )}

          {/* Favoriler */}
          {filtrelenmisFav.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-wider text-slate-500 mb-1 px-1">
                <StarIcon className="h-3 w-3" />
                Favoriler
              </div>
              <ul className="space-y-0.5">
                {filtrelenmisFav.map((f) => (
                  <li key={f.id}>
                    <button
                      className="w-full text-left px-2 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md flex items-start gap-2 group"
                      onClick={() => handleFavoriSec(f.parsel)}
                    >
                      <MapPinIcon className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="text-2xs font-medium text-slate-800 dark:text-slate-200 truncate">
                          {f.mahalleAd}
                          <span className="ml-1 text-slate-500 font-normal">
                            Ada {f.adaNo} / Parsel {f.parselNo}
                          </span>
                        </div>
                        <div className="text-3xs text-slate-500 truncate">
                          {f.ilceAd} · {f.ilAd}
                          {f.not && <span className="ml-1 italic">— {f.not}</span>}
                        </div>
                      </div>
                      <span className="text-3xs text-slate-400 group-hover:text-indigo-500 flex-shrink-0 self-center">
                        Aç →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Geçmiş */}
          {filtrelenmisGecmis.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-wider text-slate-500 mb-1 px-1">
                <ClockIcon className="h-3 w-3" />
                Son sorgular
              </div>
              <ul className="space-y-0.5">
                {filtrelenmisGecmis.map((g) => {
                  const p = g.parsel;
                  return (
                    <li key={g.id}>
                      <button
                        className="w-full text-left px-2 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md flex items-start gap-2 group"
                        onClick={() => p && handleGecmisSec(p)}
                        disabled={!p}
                      >
                        <MapPinIcon className="h-3.5 w-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          {p ? (
                            <>
                              <div className="text-2xs font-medium text-slate-800 dark:text-slate-200 truncate">
                                {p.mahalleAd ?? "Bilinmeyen mahalle"}
                                <span className="ml-1 text-slate-500 font-normal">
                                  Ada {p.adaNo} / Parsel {p.parselNo}
                                </span>
                              </div>
                              <div className="text-3xs text-slate-500 truncate">
                                {p.ilceAd} · {p.ilAd}
                                {" · "}
                                {new Date(g.zaman).toLocaleDateString("tr-TR")}
                              </div>
                            </>
                          ) : (
                            <div className="text-2xs text-slate-500">
                              {g.lat.toFixed(4)}, {g.lng.toFixed(4)}
                              {" · "}
                              {new Date(g.zaman).toLocaleDateString("tr-TR")}
                            </div>
                          )}
                        </div>
                        {p && (
                          <span className="text-3xs text-slate-400 group-hover:text-indigo-500 flex-shrink-0 self-center">
                            Aç →
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Geçmişte parsel bilgisi olmayan eski kayıtlar */}
          {!metin.trim() && gecmis && gecmis.length > 0 && filtrelenmisGecmis.length === 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-wider text-slate-500 mb-1 px-1">
                <ClockIcon className="h-3 w-3" />
                Son sorgular
              </div>
              <ul className="space-y-0.5">
                {gecmis.slice(0, 5).map((g) => (
                  <li key={g.id} className="px-2 py-1.5 text-2xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <MapPinIcon className="h-3 w-3 text-slate-300 flex-shrink-0" />
                    <span>
                      {g.lat.toFixed(4)}, {g.lng.toFixed(4)}
                    </span>
                    <span className="text-slate-400 ml-auto text-3xs">
                      {new Date(g.zaman).toLocaleDateString("tr-TR")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Boş durum */}
          {!parse && filtrelenmisFav.length === 0 && filtrelenmisGecmis.length === 0 && (
            <div className="text-2xs text-slate-500 italic px-2 py-6 text-center">
              <SearchIcon className="h-6 w-6 text-slate-300 mx-auto mb-2" />
              Favori eklemek için bir parseli analiz edip ★ ikonuna tıklayın.
              <br />
              Önceki sorgularınız burada görünür.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
