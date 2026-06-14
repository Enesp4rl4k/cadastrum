/**
 * Komut Paleti — Faz 5 Sprint H.
 *
 * Cmd/Ctrl+K ile açılan global modal. NL sorgu (parse + filtre) + favoriler +
 * geçmiş + hızlı navigasyon.
 *
 * Liste 3 bölüm:
 *   1. Doğal dil sorgu sonucu (varsa) — backend `/v1/emsal/spatial` veya
 *      mahalle istatistik çağrısı
 *   2. Favori parsellerim (Dexie)
 *   3. Son sorgular (Dexie gecmis)
 *
 * MVP: NL parser sonucunu göster + kullanıcı detayını kullanır (gerçek arama
 * Faz 5+ sprint'inde backend endpoint ile).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Search as SearchIcon, X as XIcon } from "lucide-react";
import { db } from "../../lib/db";
import { nlParse, type NlSorgu } from "../../lib/nl-sorgu";

export function KomutPaleti() {
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
      // Focus input
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setMetin("");
    }
  }, [acik]);

  const parse = useMemo<NlSorgu | null>(() => {
    if (metin.trim().length < 3) return null;
    return nlParse(metin);
  }, [metin]);

  const favoriler = useLiveQuery(() => db.favoriler.orderBy("eklenmeTarihi").reverse().limit(5).toArray(), []);
  const gecmis = useLiveQuery(() => db.gecmis.orderBy("zaman").reverse().limit(5).toArray(), []);

  // Favori filtre — input metniyle fuzzy match
  const filtrelenmisFav = useMemo(() => {
    if (!favoriler) return [];
    if (!metin.trim()) return favoriler;
    const t = metin.toLocaleLowerCase("tr");
    return favoriler.filter((f) =>
      `${f.ilAd} ${f.ilceAd} ${f.mahalleAd}`.toLocaleLowerCase("tr").includes(t),
    );
  }, [favoriler, metin]);

  if (!acik) {
    // Yardımcı bilgi — sayfa altında küçük hint
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
        className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl w-[92%] max-w-md max-h-[70vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 p-3 border-b">
          <SearchIcon className="h-4 w-4 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={metin}
            onChange={(e) => setMetin(e.target.value)}
            placeholder="ör: Beykoz arsa 1000m² üstü, 5M altı"
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <button onClick={() => setAcik(false)} className="text-slate-400 hover:text-slate-700">
            <XIcon className="h-4 w-4" />
          </button>
          <span className="text-2xs text-slate-400">ESC</span>
        </div>

        <div className="overflow-y-auto max-h-[60vh] p-2 space-y-3">
          {/* NL Sorgu sonucu */}
          {parse && parse.bulunan.length > 0 && (
            <div className="p-2 rounded bg-indigo-50 dark:bg-indigo-950">
              <div className="text-2xs font-semibold text-indigo-900 dark:text-indigo-300 mb-1">
                Parse edildi
              </div>
              <div className="space-y-0.5 text-2xs text-indigo-800 dark:text-indigo-300">
                {parse.kategori && <div>Kategori: <strong>{parse.kategori}</strong></div>}
                {parse.ilNorm && <div>İl: <strong>{parse.ilNorm}</strong></div>}
                {parse.ilceNorm && <div>İlçe: <strong>{parse.ilceNorm}</strong></div>}
                {parse.minM2 != null && <div>Min m²: <strong>{parse.minM2}</strong></div>}
                {parse.maksM2 != null && <div>Maks m²: <strong>{parse.maksM2}</strong></div>}
                {parse.minFiyat != null && (
                  <div>Min fiyat: <strong>₺{parse.minFiyat.toLocaleString("tr-TR")}</strong></div>
                )}
                {parse.maksFiyat != null && (
                  <div>Maks fiyat: <strong>₺{parse.maksFiyat.toLocaleString("tr-TR")}</strong></div>
                )}
                {parse.sahilYakini && <div>📍 Sahile yakın</div>}
                {parse.dusukDepremRiski && <div>🛡 Düşük deprem riski</div>}
              </div>
              <p className="text-3xs italic text-indigo-700 dark:text-indigo-400 mt-1">
                MVP: Backend bağlantısı bir sonraki sprint'te. Şu an parse görselleştirme.
              </p>
            </div>
          )}

          {/* Favoriler */}
          {filtrelenmisFav.length > 0 && (
            <div>
              <div className="text-3xs font-semibold uppercase tracking-wider text-slate-500 mb-1 px-2">
                Favoriler
              </div>
              <ul className="space-y-0.5">
                {filtrelenmisFav.map((f) => (
                  <li key={f.id}>
                    <button className="w-full text-left px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-2xs">
                      <span className="font-medium">{f.mahalleAd}</span>
                      <span className="text-slate-500 ml-1">
                        · {f.ilceAd}/{f.ilAd} · {f.adaNo}/{f.parselNo}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Geçmiş */}
          {gecmis && gecmis.length > 0 && !metin.trim() && (
            <div>
              <div className="text-3xs font-semibold uppercase tracking-wider text-slate-500 mb-1 px-2">
                Son sorgular
              </div>
              <ul className="space-y-0.5">
                {gecmis.map((g) => (
                  <li key={g.id} className="px-2 py-1.5 text-2xs text-slate-600 dark:text-slate-400">
                    {g.lat.toFixed(4)}, {g.lng.toFixed(4)}{" "}
                    <span className="text-slate-400">
                      · {new Date(g.zaman).toLocaleDateString("tr-TR")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!parse && !filtrelenmisFav.length && (!gecmis || gecmis.length === 0) && (
            <div className="text-2xs text-slate-500 italic px-2 py-4 text-center">
              Doğal dil sorgu yazın veya favorilerinize göz atın.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
