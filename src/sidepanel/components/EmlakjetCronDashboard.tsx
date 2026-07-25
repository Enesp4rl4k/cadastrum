/**
 * EmlakjetCronDashboard — Sprint 4 D1
 *
 * Admin panel için Emlakjet cron izleme arayüzü:
 *   - Kapsama özeti (kaç ilçe, ilan sayısı, kapsama %)
 *   - Son run'lar (tarih, ilçe, insert, durum)
 *   - Manuel tetik butonu (admin JWT ile)
 *   - Kategori dağılımı
 *   - Otomatik yenileme (60 saniyede bir)
 *
 * Sadece admin tier'ında görünür.
 */

import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw, Play, CheckCircle, AlertTriangle, XCircle,
  TrendingUp, Database, MapPin, Clock,
} from "lucide-react";

const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";
const YENILEME_ARALIK_MS = 60_000;

// ── Tipler ──────────────────────────────────────────────────────────────

interface KapsamVerisi {
  ilan: {
    toplam: number;
    il_sayisi: number;
    ilce_sayisi: number;
    mahalle_sayisi: number;
    en_yeni: number | null;
    en_eski: number | null;
    kategori: { kategori: string; n: number }[];
  };
  hedef: {
    toplam_ilce: number;
    kaplanan_ilce: number;
    kaplama_yuzde: number;
  };
  son_runlar: {
    id: number;
    baslangic: number;
    bitis: number | null;
    islenen_ilce: number;
    toplam_insert: number;
    durum: string;
  }[];
}

// ── Yardımcılar ──────────────────────────────────────────────────────────

function fmtSaat(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("tr-TR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function fmtSure(bas: number, bit: number | null): string {
  if (!bit) return "devam ediyor";
  const saniye = Math.round((bit - bas) / 1000);
  if (saniye < 60) return `${saniye}s`;
  return `${Math.floor(saniye / 60)}d ${saniye % 60}s`;
}

function DurumBadge({ durum }: { durum: string }) {
  if (durum === "tamam") {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-3xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20">
        <CheckCircle className="h-2.5 w-2.5" />tamam
      </span>
    );
  }
  if (durum === "bot-bloke") {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-3xs font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-600/20">
        <AlertTriangle className="h-2.5 w-2.5" />bot-bloke
      </span>
    );
  }
  if (durum === "calisiyor") {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-3xs font-medium bg-blue-50 text-blue-700 ring-1 ring-blue-600/20">
        <RefreshCw className="h-2.5 w-2.5 animate-spin" />çalışıyor
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-3xs font-medium bg-red-50 text-red-700 ring-1 ring-red-600/20">
      <XCircle className="h-2.5 w-2.5" />{durum}
    </span>
  );
}

// ── Ana Bileşen ──────────────────────────────────────────────────────────

interface Props {
  /** Admin JWT token */
  token: string;
}

export function EmlakjetCronDashboard({ token }: Props) {
  const [veri, setVeri] = useState<KapsamVerisi | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [tetikleniyor, setTetikleniyor] = useState(false);
  const [tetikSonuc, setTetikSonuc] = useState<string | null>(null);
  const [sonYenileme, setSonYenileme] = useState<number | null>(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    setHata(null);
    try {
      const res = await fetch(`${API_BASE}/scraper/emlakjet-kapsam`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as KapsamVerisi;
      setVeri(data);
      setSonYenileme(Date.now());
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
    } finally {
      setYukleniyor(false);
    }
  }, [token]);

  useEffect(() => {
    void yukle();
    const interval = setInterval(() => void yukle(), YENILEME_ARALIK_MS);
    return () => clearInterval(interval);
  }, [yukle]);

  async function tetikle() {
    setTetikleniyor(true);
    setTetikSonuc(null);
    try {
      const res = await fetch(`${API_BASE}/scraper/emlakjet-tetik`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sayi: 10, maxSayfa: 3 }),
      });
      const j = await res.json() as { ok?: boolean; islenen_ilce?: number; toplam_insert?: number; hata?: string };
      if (j.ok) {
        setTetikSonuc(`✓ ${j.islenen_ilce ?? 0} ilçe tarandı, ${j.toplam_insert ?? 0} ilan eklendi`);
        void yukle();
      } else {
        setTetikSonuc(`Hata: ${j.hata ?? "bilinmeyen"}`);
      }
    } catch (e) {
      setTetikSonuc(`Hata: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTetikleniyor(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-violet-600" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Emlakjet Cron İzleme
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {sonYenileme && (
            <span className="text-3xs text-slate-400">
              <Clock className="inline h-3 w-3 mr-0.5" />
              {fmtSaat(sonYenileme)}
            </span>
          )}
          <button
            type="button"
            onClick={() => void yukle()}
            disabled={yukleniyor}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-700"
            title="Yenile"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${yukleniyor ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {hata && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-2xs text-red-700">
          {hata}
        </div>
      )}

      {veri && (
        <>
          {/* Kapsama özeti */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900">
              <div className="text-3xs text-slate-500 uppercase tracking-wide">Toplam İlan</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums mt-0.5">
                {veri.ilan.toplam.toLocaleString("tr-TR")}
              </div>
            </div>
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-2 dark:border-violet-800/40 dark:bg-violet-950/20">
              <div className="text-3xs text-violet-600 uppercase tracking-wide">Kapsama</div>
              <div className="text-sm font-bold text-violet-700 dark:text-violet-300 tabular-nums mt-0.5">
                %{veri.hedef.kaplama_yuzde}
              </div>
              <div className="text-3xs text-slate-400">
                {veri.hedef.kaplanan_ilce}/{veri.hedef.toplam_ilce} ilçe
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900">
              <div className="text-3xs text-slate-500 uppercase tracking-wide">İl</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums mt-0.5">
                {veri.ilan.il_sayisi}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900">
              <div className="text-3xs text-slate-500 uppercase tracking-wide">Mahalle</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums mt-0.5">
                {veri.ilan.mahalle_sayisi.toLocaleString("tr-TR")}
              </div>
            </div>
          </div>

          {/* Kapsama progress bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-3xs text-slate-500">
              <span>İlçe kapsama hedefi: 973</span>
              <span>{veri.hedef.kaplanan_ilce} / 973</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-violet-500 dark:bg-violet-400 transition-all duration-500"
                style={{ width: `${Math.min(veri.hedef.kaplama_yuzde, 100)}%` }}
              />
            </div>
          </div>

          {/* Kategori dağılımı */}
          {veri.ilan.kategori.length > 0 && (
            <div className="flex items-center gap-3 text-2xs">
              <TrendingUp className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              {veri.ilan.kategori.map((k) => (
                <span key={k.kategori} className="text-slate-600 dark:text-slate-300">
                  <span className="font-medium">{k.kategori}:</span>{" "}
                  {k.n.toLocaleString("tr-TR")}
                </span>
              ))}
              {veri.ilan.en_yeni && (
                <span className="ml-auto text-slate-400">
                  Son veri: {fmtSaat(veri.ilan.en_yeni)}
                </span>
              )}
            </div>
          )}

          {/* Son run'lar */}
          {veri.son_runlar.length > 0 && (
            <div>
              <div className="text-3xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                Son Çalışmalar
              </div>
              <div className="space-y-1">
                {veri.son_runlar.slice(0, 5).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <DurumBadge durum={r.durum} />
                      <span className="text-3xs text-slate-500 truncate">
                        {fmtSaat(r.baslangic)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-3xs text-slate-500 flex items-center gap-1">
                        <MapPin className="h-2.5 w-2.5" />{r.islenen_ilce ?? 0} ilçe
                      </span>
                      <span className="text-3xs font-medium text-emerald-600 tabular-nums">
                        +{r.toplam_insert ?? 0}
                      </span>
                      <span className="text-3xs text-slate-400">
                        {fmtSure(r.baslangic, r.bitis)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Manuel tetik */}
      <div className="border-t border-slate-100 pt-3 dark:border-slate-700">
        <button
          type="button"
          onClick={() => void tetikle()}
          disabled={tetikleniyor}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-2xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed transition dark:border-violet-800/40 dark:bg-violet-950/20 dark:text-violet-300"
        >
          {tetikleniyor ? (
            <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Taranıyor (10 ilçe)…</>
          ) : (
            <><Play className="h-3.5 w-3.5" />Manuel Tetik (10 ilçe, 3 sayfa)</>
          )}
        </button>
        {tetikSonuc && (
          <div className={`mt-1.5 text-3xs text-center ${
            tetikSonuc.startsWith("✓") ? "text-emerald-600" : "text-red-600"
          }`}>
            {tetikSonuc}
          </div>
        )}
        <p className="mt-1 text-3xs text-slate-400 text-center italic">
          Cron: ayın 15'i 03:00 UTC otomatik çalışır. Tüm 973 ilçe ~15 Worker run'da tamamlanır.
        </p>
      </div>
    </div>
  );
}
