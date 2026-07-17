/**
 * W3 — Komşu Parsel Karşılaştırması
 *
 * Aynı ada (adaNo) içindeki parselleri TKGM API'den çekerek yan yana karşılaştırır.
 * - Alan, nitelik, durum bilgileri tablo görünümü
 * - Bu parselin ada ortalamasına göre konumu (büyük/küçük badge)
 * - Maksimum 15 parsel gösterilir (ada çok büyükse performans sınırı)
 * - Mevcut parsel satırı vurgulu
 */

import { useEffect, useState } from "react";
import {
  Users as UsersIcon,
  Loader2 as LoaderIcon,
  AlertCircle as AlertIcon,
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
  ArrowUp as ArrowUpIcon,
  ArrowDown as ArrowDownIcon,
  Minus as MinusIcon,
} from "lucide-react";
import { getParselByCodes } from "../../lib/tkgm-api";
import type { Parsel } from "../../types/tkgm";

// ─── Sabitler ─────────────────────────────────────────────────────────────────

/** Ada içi maksimum gösterilecek komşu sayısı (API yükünü sınırla) */
const MAX_KOMSU = 15;

// ─── Types ────────────────────────────────────────────────────────────────────

interface KomsuOzet {
  parselNo: number;
  alan: number;
  nitelik: string;
  durum: string;
  aktifParsel: boolean;
}

interface Props {
  parsel: Parsel;
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function alanFmt(m2: number): string {
  if (m2 >= 10_000) return `${(m2 / 10_000).toFixed(2)} ha`;
  return `${m2.toLocaleString("tr-TR")} m²`;
}

function nitelikKisa(nitelik: string): string {
  // TKGM nitelik string'leri uzun olabilir — ilk 25 karakter
  return nitelik.length > 25 ? nitelik.slice(0, 24) + "…" : nitelik;
}

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────

export function KomsuParselKarti({ parsel }: Props) {
  const [komşular, setKomşular] = useState<KomsuOzet[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [acik, setAcik] = useState(false);
  const [yuklendi, setYuklendi] = useState(false);

  // Lazy load — kullanıcı açtığında çek
  useEffect(() => {
    if (!acik || yuklendi) return;
    if (!parsel.mahalleKodu || !parsel.adaNo) return;

    setYukleniyor(true);
    setHata(null);

    // Ada içi parsel numaralarını TKGM'den bul
    // getParselBlokListesi ada listesini döndürür: blok.parselNo alanını kullan
    import("../../lib/tkgm-api")
      .then(({ getParselBlokListesi }) =>
        getParselBlokListesi(parsel.mahalleKodu!, parsel.adaNo, parsel.parselNo),
      )
      .then(async (bloklar) => {
        if (bloklar.length === 0) {
          // Blok verisi yoksa mevcut parseli tek kayıt olarak göster
          setKomşular([{
            parselNo: parsel.parselNo,
            alan: parsel.alan,
            nitelik: parsel.nitelik,
            durum: parsel.durum,
            aktifParsel: true,
          }]);
          setYuklendi(true);
          return;
        }

        // Blok listesinden benzersiz parsel numaralarını çıkar
        const parselNolar = [...new Set(
          bloklar
            .map(b => parseInt(String(b.parselNo), 10))
            .filter(n => !isNaN(n))
        )].slice(0, MAX_KOMSU);

        // Paralel fetch — her parsel için detay çek (cache'li)
        const sonuclar = await Promise.allSettled(
          parselNolar.map(no =>
            getParselByCodes(parsel.mahalleKodu!, parsel.adaNo, no)
          )
        );

        const liste: KomsuOzet[] = [];
        for (let i = 0; i < parselNolar.length; i++) {
          const r = sonuclar[i];
          const no = parselNolar[i]!;
          if (r?.status === "fulfilled") {
            const p: Parsel = r.value;
            liste.push({
              parselNo: no,
              alan: p.alan,
              nitelik: p.nitelik,
              durum: p.durum,
              aktifParsel: no === parsel.parselNo,
            });
          } else {
            // API hatası — alan bilgisi olmadan ekle
            liste.push({
              parselNo: no,
              alan: no === parsel.parselNo ? parsel.alan : 0,
              nitelik: no === parsel.parselNo ? parsel.nitelik : "—",
              durum: no === parsel.parselNo ? parsel.durum : "—",
              aktifParsel: no === parsel.parselNo,
            });
          }
        }

        // Alan'a göre sırala (büyükten küçüğe)
        liste.sort((a, b) => b.alan - a.alan);
        setKomşular(liste);
        setYuklendi(true);
      })
      .catch((e) => {
        setHata(e instanceof Error ? e.message : "Komşu parsel verisi alınamadı");
      })
      .finally(() => setYukleniyor(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik]);

  // Yeterli veri yoksa bileşeni gösterme
  if (!parsel.mahalleKodu || !parsel.adaNo) return null;

  // Özet istatistikler (yüklendikten sonra)
  const gecerliAlanlar = komşular.filter(k => k.alan > 0).map(k => k.alan);
  const ortalamaAlan = gecerliAlanlar.length > 0
    ? gecerliAlanlar.reduce((s, v) => s + v, 0) / gecerliAlanlar.length
    : 0;
  const aktifKomsu = komşular.find(k => k.aktifParsel);
  const alanFarki = ortalamaAlan > 0 && aktifKomsu?.alan
    ? Math.round(((aktifKomsu.alan - ortalamaAlan) / ortalamaAlan) * 100)
    : null;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
      {/* Toggle başlık */}
      <button
        type="button"
        onClick={() => setAcik(v => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
        aria-expanded={acik}
      >
        <div className="flex items-center gap-2">
          <UsersIcon className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Ada İçi Parsel Karşılaştırması
          </span>
          {/* Ada/parsel no badge */}
          <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[9px] font-medium text-slate-500">
            Ada {parsel.adaNo}
          </span>
          {/* Alan farkı badge — yüklendiyse göster */}
          {yuklendi && alanFarki !== null && (
            <span className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
              alanFarki > 10
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : alanFarki < -10
                  ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  : "bg-slate-100 text-slate-500"
            }`}>
              {alanFarki > 0
                ? <ArrowUpIcon className="h-2.5 w-2.5" />
                : alanFarki < 0
                  ? <ArrowDownIcon className="h-2.5 w-2.5" />
                  : <MinusIcon className="h-2.5 w-2.5" />}
              {alanFarki > 0 ? "+" : ""}{alanFarki}% ort.
            </span>
          )}
        </div>
        {acik
          ? <ChevronUpIcon className="h-3.5 w-3.5 text-slate-400" />
          : <ChevronDownIcon className="h-3.5 w-3.5 text-slate-400" />}
      </button>

      {/* İçerik */}
      {acik && (
        <div className="border-t border-slate-100 dark:border-slate-700">
          {yukleniyor && (
            <div className="flex items-center justify-center gap-2 py-6 text-slate-400">
              <LoaderIcon className="h-4 w-4 animate-spin" />
              <span className="text-xs">Ada içi parseller yükleniyor…</span>
            </div>
          )}

          {hata && !yukleniyor && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-red-500">
              <AlertIcon className="h-3.5 w-3.5 flex-shrink-0" />
              {hata}
            </div>
          )}

          {yuklendi && komşular.length > 0 && !yukleniyor && (
            <>
              {/* Özet satırı */}
              <div className="grid grid-cols-3 gap-2 px-3 py-2 bg-slate-50/70 dark:bg-slate-700/30 text-center">
                <div>
                  <div className="text-[9px] text-slate-400">Ada Parsel Sayısı</div>
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-200">{komşular.length}</div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-400">Ort. Alan</div>
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    {ortalamaAlan > 0 ? alanFmt(Math.round(ortalamaAlan)) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-400">Bu Parsel</div>
                  <div className={`text-xs font-bold tabular-nums ${
                    alanFarki !== null && alanFarki > 10
                      ? "text-emerald-600"
                      : alanFarki !== null && alanFarki < -10
                        ? "text-red-500"
                        : "text-slate-700 dark:text-slate-200"
                  }`}>
                    {aktifKomsu ? alanFmt(aktifKomsu.alan) : "—"}
                  </div>
                </div>
              </div>

              {/* Tablo */}
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/20">
                      <th className="px-3 py-1.5 text-left font-semibold text-slate-500">Parsel</th>
                      <th className="px-2 py-1.5 text-right font-semibold text-slate-500">Alan</th>
                      <th className="px-2 py-1.5 text-left font-semibold text-slate-500">Nitelik</th>
                      <th className="px-2 py-1.5 text-left font-semibold text-slate-500">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {komşular.map((k) => (
                      <tr
                        key={k.parselNo}
                        className={`border-b border-slate-50 dark:border-slate-700/50 last:border-0 ${
                          k.aktifParsel
                            ? "bg-blue-50/80 dark:bg-blue-900/20"
                            : "hover:bg-slate-50/60 dark:hover:bg-slate-700/20"
                        }`}
                      >
                        <td className="px-3 py-1.5">
                          <span className={`font-mono font-semibold ${
                            k.aktifParsel ? "text-blue-700 dark:text-blue-400" : "text-slate-600 dark:text-slate-300"
                          }`}>
                            {k.parselNo}
                            {k.aktifParsel && (
                              <span className="ml-1 rounded-full bg-blue-100 dark:bg-blue-800 px-1 py-0.5 text-[8px] font-bold text-blue-600 dark:text-blue-300">
                                bu
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-medium text-slate-700 dark:text-slate-200">
                          {k.alan > 0 ? alanFmt(k.alan) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400 max-w-[100px] truncate" title={k.nitelik}>
                          {nitelikKisa(k.nitelik)}
                        </td>
                        <td className="px-2 py-1.5 text-slate-400 dark:text-slate-500 max-w-[80px] truncate" title={k.durum}>
                          {k.durum || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {komşular.length >= MAX_KOMSU && (
                <p className="px-3 py-1.5 text-[9px] italic text-slate-400 border-t border-slate-100 dark:border-slate-700">
                  İlk {MAX_KOMSU} parsel gösteriliyor.
                </p>
              )}
            </>
          )}

          {yuklendi && komşular.length === 0 && !yukleniyor && (
            <p className="px-3 py-3 text-xs italic text-slate-400">
              Bu ada için parsel listesi bulunamadı.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
