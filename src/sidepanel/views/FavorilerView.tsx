import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Lock as LockIcon, Radar as RadarIcon, RefreshCw as RefreshIcon } from "lucide-react";
import { db, type FavoriParsel } from "../../lib/db";
import { etiketBul } from "../components/ParselNotDefteri";
import { useLisans } from "../../lib/lisans";
import {
  favoriIzlemeAyarla,
  imarDegisiklikLogOku,
  izlenenFavoriSayisi,
  radarImarTurunuCalistir,
  radarSonKontrolOku,
  RADAR_MAX_IZLEME,
  RADAR_POLITIKA_OZET,
  type ImarDegisiklikLogKayit,
} from "../../lib/degisim-radari";

interface Props {
  onSelect: (favori: FavoriParsel) => void;
}

const SITE_URL = "https://cadastrum.com.tr";

export function FavorilerView({ onSelect }: Props) {
  const lisans = useLisans();
  const izlemeAcik = lisans.can("watchlist-uyari");
  const [radarLog, setRadarLog] = useState<ImarDegisiklikLogKayit[]>([]);
  const [sonKontrol, setSonKontrol] = useState<number | null>(null);
  const [izlenenAdet, setIzlenenAdet] = useState(0);
  const [kontrolBusy, setKontrolBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const favoriler = useLiveQuery(
    () => db.favoriler.orderBy("eklenmeTarihi").reverse().toArray(),
    [],
  );

  async function yenileMeta() {
    setRadarLog(await imarDegisiklikLogOku());
    setSonKontrol(await radarSonKontrolOku());
    setIzlenenAdet(await izlenenFavoriSayisi());
  }

  useEffect(() => {
    void yenileMeta();
    const onStorage = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area === "local" && (changes.imarDegisiklikLog || changes.radarSonKontrolAt)) {
        void yenileMeta();
      }
    };
    if (typeof chrome !== "undefined" && chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener(onStorage);
      return () => chrome.storage.onChanged.removeListener(onStorage);
    }
  }, []);

  useEffect(() => {
    if (favoriler) void izlenenFavoriSayisi().then(setIzlenenAdet);
  }, [favoriler]);

  async function sil(id: number) {
    await db.favoriler.delete(id);
    void yenileMeta();
  }

  async function izlemeToggle(f: FavoriParsel, ac: boolean) {
    if (!f.id) return;
    if (ac && !izlemeAcik) {
      if (typeof chrome !== "undefined" && chrome?.tabs) {
        chrome.tabs.create({ url: `${SITE_URL}/fiyat?plan=pro&source=extension-radar` });
      }
      return;
    }
    try {
      await favoriIzlemeAyarla(f.id, ac);
      void yenileMeta();
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e));
      setTimeout(() => setToast(null), 4000);
    }
  }

  async function manuelKontrol() {
    if (!izlemeAcik || kontrolBusy) return;
    setKontrolBusy(true);
    setToast(null);
    try {
      const r = await radarImarTurunuCalistir({ zorla: true, kaynak: "manuel" });
      await yenileMeta();
      if (r.atlandiSebep === "izlenen-yok") {
        setToast("İzlenen parsel yok — önce İzle açın.");
      } else {
        setToast(
          r.degisiklik > 0
            ? `${r.kontrolEdilen} parsel · ${r.degisiklik} imar değişikliği`
            : `${r.kontrolEdilen} parsel kontrol edildi · değişiklik yok`,
        );
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Kontrol başarısız");
    } finally {
      setKontrolBusy(false);
      setTimeout(() => setToast(null), 5000);
    }
  }

  if (!favoriler) {
    return <p className="p-4 text-xs text-tkgm-muted">Yükleniyor…</p>;
  }

  if (favoriler.length === 0) {
    return (
      <div className="p-4 text-xs text-tkgm-muted space-y-2">
        <p>Henüz favori yok.</p>
        <p>
          Haritadan parsel sorgula → Favorilere ekle. Pro ile İzle açınca
          scrapesiz radar devreye girer.
        </p>
        <p className="text-[10px] text-slate-400 leading-snug">{RADAR_POLITIKA_OZET}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
        <div className="mb-1 flex items-center gap-1.5">
          <RadarIcon className="h-3.5 w-3.5 text-imperial-600 dark:text-champagne-400" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-imperial-700 dark:text-champagne-300">
            Değişim radarı
          </span>
          {!izlemeAcik && (
            <span className="ml-auto inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
              <LockIcon className="h-2.5 w-2.5" /> Pro
            </span>
          )}
        </div>
        <p className="text-[9px] leading-snug text-slate-500 dark:text-slate-400 mb-1.5">
          {RADAR_POLITIKA_OZET}
        </p>
        <div className="flex items-center gap-2 flex-wrap text-[9px] text-slate-500">
          <span>
            İzlenen: {izlenenAdet}/{RADAR_MAX_IZLEME}
          </span>
          {sonKontrol && (
            <span>
              Son kontrol:{" "}
              {new Date(sonKontrol).toLocaleDateString("tr-TR", {
                day: "numeric",
                month: "short",
              })}
            </span>
          )}
          {izlemeAcik && (
            <button
              type="button"
              disabled={kontrolBusy || izlenenAdet === 0}
              onClick={() => void manuelKontrol()}
              className="ml-auto inline-flex items-center gap-1 rounded border border-imperial/20 bg-white px-1.5 py-0.5 font-medium text-imperial-700 hover:bg-slate-50 disabled:opacity-50 dark:bg-slate-800 dark:text-champagne-300"
              title="Sadece e-Plan proxy — ilan scrape yok"
            >
              <RefreshIcon className={`h-2.5 w-2.5 ${kontrolBusy ? "animate-spin" : ""}`} />
              {kontrolBusy ? "Kontrol…" : "Şimdi kontrol et"}
            </button>
          )}
        </div>
        {toast && (
          <p className="mt-1 text-[10px] font-medium text-imperial-700 dark:text-champagne-300">
            {toast}
          </p>
        )}
        {radarLog.length === 0 ? (
          <p className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400">
            {izlemeAcik
              ? "Henüz imar değişikliği yok. İzle aç → 14 günde bir veya Şimdi kontrol et."
              : "İmar değişim bildirimleri Pro izleme ile açılır."}
          </p>
        ) : (
          <ul className="mt-1.5 max-h-24 space-y-1 overflow-y-auto">
            {radarLog.slice(0, 5).map((k, i) => (
              <li key={`${k.ts}-${i}`} className="text-[10px] leading-snug text-slate-700 dark:text-slate-300">
                <span className="text-slate-400">
                  {new Date(k.ts).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                </span>
                {" · "}
                {k.adaNo != null && k.parselNo != null
                  ? `${k.adaNo}/${k.parselNo} — `
                  : ""}
                {k.mesaj}
              </li>
            ))}
          </ul>
        )}
      </div>

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
                  {f.izleme && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                      İzleniyor
                    </span>
                  )}
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
                {f.fiyatSnapshot && (
                  <div className="mt-1 text-[11px] font-medium text-imperial-700 dark:text-champagne-300">
                    Snapshot {Math.round(f.fiyatSnapshot.beklenenPerM2).toLocaleString("tr-TR")} ₺/m²
                    <span className="font-normal text-slate-500 dark:text-slate-400">
                      {" "}
                      ({Math.round(f.fiyatSnapshot.altPerM2).toLocaleString("tr-TR")}–
                      {Math.round(f.fiyatSnapshot.ustPerM2).toLocaleString("tr-TR")})
                    </span>
                  </div>
                )}
                {sonNot && (
                  <div className="mt-1 text-[11px] italic text-slate-500 dark:text-slate-400 truncate">
                    &quot;{sonNot.metin}&quot;
                  </div>
                )}
                <div className="mt-1 text-[10px] text-tkgm-muted dark:text-slate-500">
                  {new Date(f.eklenmeTarihi).toLocaleString("tr-TR")}
                </div>
              </button>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onSelect(f)}
                  className="text-[11px] text-tkgm-primary hover:underline"
                >
                  Haritada göster
                </button>
                <button
                  type="button"
                  onClick={() => void izlemeToggle(f, !f.izleme)}
                  className={`text-[11px] hover:underline ${
                    f.izleme ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-imperial-600 dark:text-champagne-300"
                  }`}
                  title={
                    izlemeAcik
                      ? "14 günde bir e-Plan özeti (ilan scrape yok)"
                      : "Pro gerekir"
                  }
                >
                  {f.izleme ? "İzlemeyi kapat" : izlemeAcik ? "İzle" : "İzle (Pro)"}
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
    </div>
  );
}
