/**
 * Portföy İzleme Dashboard — Sprint 3 M1
 *
 * Favori parseller üzerinde tam portföy yönetimi:
 *   - Çoklu parsel delta takibi (fiyat snapshot karşılaştırma)
 *   - İmar değişiklik uyarıları (degisim-radari üzerinden)
 *   - Portföy özet metrikleri (toplam değer, trend, risk)
 *   - Alert log (son değişiklikler)
 *   - İzleme aç/kapa per parsel
 *
 * Pro tier gerektirir (watchlist-uyari).
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  TrendingUp, TrendingDown, Minus, Bell, BellOff, RefreshCw,
  AlertTriangle, CheckCircle, Clock, ChevronDown, ChevronUp,
  BarChart2, Shield, Eye, EyeOff,
} from "lucide-react";
import { db, type FavoriParsel, type FavoriFiyatSnapshot } from "../../lib/db";
import {
  radarImarTurunuCalistir,
  imarDegisiklikLogOku,
  radarSonKontrolOku,
  favoriIzlemeAyarla,
  fiyatSnapshotDeltaYuzde,
  RADAR_MAX_IZLEME,
  type ImarDegisiklikLogKayit,
} from "../../lib/degisim-radari";
import { fiyatTahminEt } from "../../lib/fiyat-tahmin";
import { useLisans } from "../../lib/lisans";

// ── Yardımcı formatlayıcılar ─────────────────────────────────────

function fmtTL(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} Mr ₺`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} Mn ₺`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} bin ₺`;
  return `${Math.round(n).toLocaleString("tr-TR")} ₺`;
}

function fmtM2(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)} ha`;
  return `${n.toLocaleString("tr-TR")} m²`;
}

function fmtTarih(ts: number): string {
  return new Date(ts).toLocaleDateString("tr-TR", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtSaat(ts: number): string {
  return new Date(ts).toLocaleString("tr-TR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// ── Delta badge ──────────────────────────────────────────────────

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="text-3xs text-slate-400 italic">Veri yok</span>;
  }
  const renk = delta > 0
    ? "text-emerald-700 bg-emerald-50 ring-emerald-600/20"
    : delta < 0
    ? "text-red-700 bg-red-50 ring-red-600/20"
    : "text-slate-600 bg-slate-50 ring-slate-500/10";
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-3xs font-medium ring-1 ring-inset tabular-nums ${renk}`}>
      <Icon className="h-2.5 w-2.5" />
      {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
    </span>
  );
}

// ── Tek parsel satırı ────────────────────────────────────────────

interface ParselSatirProps {
  favori: FavoriParsel;
  delta: number | null;
  fiyatGuncelleniyor: boolean;
  onIzlemeToggle: (id: number, acik: boolean) => Promise<void>;
  onSnapshotYenile: (id: number) => Promise<void>;
}

function ParselSatir({
  favori,
  delta,
  fiyatGuncelleniyor,
  onIzlemeToggle,
  onSnapshotYenile,
}: ParselSatirProps) {
  const [toggle, setToggle] = useState(false);

  const snap = favori.fiyatSnapshot;
  const alan = favori.parsel?.alan ?? 0;
  const toplamTahmin = snap && alan > 0 ? snap.beklenenPerM2 * alan : null;

  async function handleIzleme() {
    setToggle(true);
    try {
      await onIzlemeToggle(favori.id!, !favori.izleme);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Hata");
    } finally {
      setToggle(false);
    }
  }

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
      favori.izleme
        ? "border-violet-200 bg-violet-50/50 dark:border-violet-800/40 dark:bg-violet-950/20"
        : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
    }`}>
      <div className="flex items-center justify-between gap-2">
        {/* Sol: parsel bilgisi */}
        <div className="min-w-0 flex-1">
          <div className="font-medium text-slate-800 dark:text-slate-100 truncate">
            {favori.mahalleAd}, {favori.ilceAd}
          </div>
          <div className="text-3xs text-slate-500 dark:text-slate-400">
            Ada {favori.adaNo} / Parsel {favori.parselNo}
            {alan > 0 && ` · ${fmtM2(alan)}`}
          </div>
        </div>

        {/* Orta: delta + snapshot */}
        <div className="flex flex-col items-end gap-0.5">
          {fiyatGuncelleniyor ? (
            <span className="text-3xs text-slate-400 italic">hesaplanıyor…</span>
          ) : (
            <DeltaBadge delta={delta} />
          )}
          {toplamTahmin !== null && (
            <span className="text-3xs text-slate-500 tabular-nums">
              ~{fmtTL(toplamTahmin)}
            </span>
          )}
          {snap && (
            <span className="text-3xs text-slate-400">
              Snap: {Math.round(snap.beklenenPerM2).toLocaleString("tr-TR")} ₺/m²
            </span>
          )}
        </div>

        {/* Sağ: izleme toggle + yenile */}
        <div className="flex items-center gap-1 shrink-0">
          {snap && (
            <button
              type="button"
              onClick={() => onSnapshotYenile(favori.id!)}
              disabled={fiyatGuncelleniyor}
              title="Snapshot'ı güncelle"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-700"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={handleIzleme}
            disabled={toggle}
            title={favori.izleme ? "İzlemeyi kapat" : "İzlemeye al (imar değişikliği takibi)"}
            className={`rounded p-1 transition-colors ${
              favori.izleme
                ? "text-violet-600 hover:bg-violet-100 dark:hover:bg-violet-900/30"
                : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
            }`}
          >
            {favori.izleme ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Snap tarihi */}
      {snap && (
        <div className="mt-1 text-3xs text-slate-400">
          Snapshot: {fmtTarih(snap.ts)}
        </div>
      )}
    </div>
  );
}

// ── Alert Log ────────────────────────────────────────────────────

function AlertLog({ kayitlar }: { kayitlar: ImarDegisiklikLogKayit[] }) {
  const [acik, setAcik] = useState(false);

  if (kayitlar.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
        <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        <span className="text-2xs text-slate-500 dark:text-slate-400">
          Henüz imar değişikliği kaydı yok.
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20">
      <button
        type="button"
        onClick={() => setAcik(!acik)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          <span className="text-2xs font-semibold text-amber-800 dark:text-amber-200">
            {kayitlar.length} imar değişikliği
          </span>
        </div>
        {acik ? <ChevronUp className="h-3.5 w-3.5 text-amber-600" /> : <ChevronDown className="h-3.5 w-3.5 text-amber-600" />}
      </button>

      {acik && (
        <div className="border-t border-amber-200 px-3 py-2 dark:border-amber-800/40 space-y-2">
          {kayitlar.slice(0, 8).map((k, i) => (
            <div key={i} className="text-2xs">
              <div className="font-medium text-amber-900 dark:text-amber-200 leading-snug">
                {k.mesaj}
              </div>
              <div className="text-3xs text-amber-700 dark:text-amber-400 mt-0.5">
                {fmtSaat(k.ts)} · {k.kaynak === "manuel" ? "Manuel kontrol" : "Arka plan"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Ana Dashboard ────────────────────────────────────────────────

export function PortfoyDashboard() {
  const lisans = useLisans();
  const canIzle = lisans.can("watchlist-uyari");

  const [favoriler, setFavoriler] = useState<FavoriParsel[]>([]);
  const [deltaMap, setDeltaMap] = useState<Map<number, number | null>>(new Map());
  const [guncelleniyor, setGuncelleniyor] = useState<Set<number>>(new Set());
  const [alertLog, setAlertLog] = useState<ImarDegisiklikLogKayit[]>([]);
  const [sonKontrol, setSonKontrol] = useState<number | null>(null);
  const [taramaYukleniyor, setTaramaYukleniyor] = useState(false);
  const [taramaSonuc, setTaramaSonuc] = useState<string | null>(null);

  // Veriyi yükle
  const yukle = useCallback(async () => {
    const favs = await db.favoriler.orderBy("eklenmeTarihi").reverse().toArray();
    setFavoriler(favs);

    // Mevcut snapshot'lardan delta hesapla (snapshot vs snapshot — değişim zaten kayıtlı)
    const map = new Map<number, number | null>();
    for (const f of favs) {
      if (f.id == null) continue;
      map.set(f.id, null); // başlangıç
    }
    setDeltaMap(map);

    const log = await imarDegisiklikLogOku();
    setAlertLog(log);

    const sk = await radarSonKontrolOku();
    setSonKontrol(sk);
  }, []);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  // Snapshot delta = mevcut fiyat tahmini vs kayıtlı snapshot
  const snapshotDeltaGuncelle = useCallback(async (favori: FavoriParsel) => {
    if (!favori.id || !favori.fiyatSnapshot) return;
    setGuncelleniyor((s) => new Set(s).add(favori.id!));
    try {
      const tahmin = await fiyatTahminEt(favori.parsel, null, null, null);
      if (tahmin) {
        const delta = fiyatSnapshotDeltaYuzde(favori.fiyatSnapshot, tahmin.beklenenPerM2);
        setDeltaMap((m) => {
          const nm = new Map(m);
          nm.set(favori.id!, delta);
          return nm;
        });
      }
    } catch { /* sessiz */ } finally {
      setGuncelleniyor((s) => {
        const ns = new Set(s);
        ns.delete(favori.id!);
        return ns;
      });
    }
  }, []);

  // Tüm izlenen parseller için delta güncelle (mount'ta)
  useEffect(() => {
    const izlenenler = favoriler.filter((f) => f.izleme && f.fiyatSnapshot);
    for (const f of izlenenler) {
      void snapshotDeltaGuncelle(f);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoriler.length]);

  // İzleme toggle
  const handleIzlemeToggle = useCallback(async (id: number, acik: boolean) => {
    const fav = favoriler.find((f) => f.id === id);
    if (!fav) return;

    let snapshot: FavoriFiyatSnapshot | null = null;
    if (acik) {
      // Yeni snapshot al
      setGuncelleniyor((s) => new Set(s).add(id));
      try {
        const tahmin = await fiyatTahminEt(fav.parsel, null, null, null);
        if (tahmin) {
          snapshot = {
            beklenenPerM2: tahmin.beklenenPerM2,
            altPerM2: tahmin.altPerM2 ?? tahmin.beklenenPerM2 * 0.85,
            ustPerM2: tahmin.ustPerM2 ?? tahmin.beklenenPerM2 * 1.15,
            ts: Date.now(),
          };
        }
      } finally {
        setGuncelleniyor((s) => { const ns = new Set(s); ns.delete(id); return ns; });
      }
    }

    await favoriIzlemeAyarla(id, acik, snapshot);
    await yukle();
  }, [favoriler, yukle]);

  // Snapshot yenile
  const handleSnapshotYenile = useCallback(async (id: number) => {
    const fav = favoriler.find((f) => f.id === id);
    if (!fav) return;
    setGuncelleniyor((s) => new Set(s).add(id));
    try {
      const tahmin = await fiyatTahminEt(fav.parsel, null, null, null);
      if (tahmin && fav.id != null) {
        const snap: FavoriFiyatSnapshot = {
          beklenenPerM2: tahmin.beklenenPerM2,
          altPerM2: tahmin.altPerM2 ?? tahmin.beklenenPerM2 * 0.85,
          ustPerM2: tahmin.ustPerM2 ?? tahmin.beklenenPerM2 * 1.15,
          ts: Date.now(),
        };
        await db.favoriler.update(id, { fiyatSnapshot: snap });
        setDeltaMap((m) => { const nm = new Map(m); nm.set(id, 0); return nm; });
        await yukle();
      }
    } finally {
      setGuncelleniyor((s) => { const ns = new Set(s); ns.delete(id); return ns; });
    }
  }, [favoriler, yukle]);

  // Manuel imar turu
  async function handleImarTarama() {
    setTaramaYukleniyor(true);
    setTaramaSonuc(null);
    try {
      const sonuc = await radarImarTurunuCalistir({ zorla: true, kaynak: "manuel" });
      if (sonuc.atlandiSebep) {
        setTaramaSonuc(`Atlandı: ${sonuc.atlandiSebep}`);
      } else {
        setTaramaSonuc(
          `${sonuc.kontrolEdilen} parsel kontrol edildi · ${sonuc.degisiklik} değişiklik`,
        );
      }
      const log = await imarDegisiklikLogOku();
      setAlertLog(log);
      const sk = await radarSonKontrolOku();
      setSonKontrol(sk);
    } catch (e) {
      setTaramaSonuc(`Hata: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTaramaYukleniyor(false);
    }
  }

  // Özet metrikler
  const ozet = useMemo(() => {
    let toplamTahmin = 0;
    let fiyatliSayi = 0;
    let izlenenSayi = 0;
    const pozitifDelta: number[] = [];
    const negatifDelta: number[] = [];

    for (const f of favoriler) {
      if (f.izleme) izlenenSayi++;
      if (f.fiyatSnapshot && (f.parsel?.alan ?? 0) > 0) {
        toplamTahmin += f.fiyatSnapshot.beklenenPerM2 * (f.parsel?.alan ?? 0);
        fiyatliSayi++;
        const d = f.id != null ? deltaMap.get(f.id) ?? null : null;
        if (d !== null) {
          if (d > 0) pozitifDelta.push(d);
          else if (d < 0) negatifDelta.push(d);
        }
      }
    }

    return { toplamTahmin, fiyatliSayi, izlenenSayi, pozitifDelta, negatifDelta };
  }, [favoriler, deltaMap]);

  if (favoriler.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <BarChart2 className="mb-2 h-8 w-8 text-slate-300" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Portföy boş</p>
        <p className="mt-1 text-2xs text-slate-400">Favori parseller ekleyerek izlemeye başlayın.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-2">
      {/* Üst özet kartları */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-3xs text-slate-500 uppercase tracking-wide">Toplam</div>
          <div className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums mt-0.5">
            {favoriler.length} parsel
          </div>
        </div>
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-2 dark:border-violet-800/40 dark:bg-violet-950/20">
          <div className="text-3xs text-violet-600 uppercase tracking-wide">İzlenen</div>
          <div className="text-sm font-bold text-violet-700 dark:text-violet-300 tabular-nums mt-0.5">
            {ozet.izlenenSayi}/{RADAR_MAX_IZLEME}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-3xs text-slate-500 uppercase tracking-wide">Tahmini</div>
          <div className="text-xs font-bold text-slate-800 dark:text-slate-100 tabular-nums mt-0.5">
            {ozet.fiyatliSayi > 0 ? fmtTL(ozet.toplamTahmin) : "—"}
          </div>
        </div>
      </div>

      {/* Delta özeti */}
      {(ozet.pozitifDelta.length > 0 || ozet.negatifDelta.length > 0) && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
          <BarChart2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <div className="flex gap-3 text-2xs">
            {ozet.pozitifDelta.length > 0 && (
              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                ↑ {ozet.pozitifDelta.length} değer arttı
              </span>
            )}
            {ozet.negatifDelta.length > 0 && (
              <span className="text-red-700 dark:text-red-400 font-medium">
                ↓ {ozet.negatifDelta.length} değer düştü
              </span>
            )}
          </div>
        </div>
      )}

      {/* İmar alert log */}
      <AlertLog kayitlar={alertLog} />

      {/* Parsel listesi */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h4 className="text-2xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Parsel Listesi
          </h4>
          {canIzle && (
            <div className="flex items-center gap-1 text-3xs text-slate-400">
              <Eye className="h-3 w-3" />
              İzleme = imar takibi
            </div>
          )}
        </div>

        {favoriler.map((f) => (
          <ParselSatir
            key={f.id}
            favori={f}
            delta={f.id != null ? deltaMap.get(f.id) ?? null : null}
            fiyatGuncelleniyor={f.id != null && guncelleniyor.has(f.id)}
            onIzlemeToggle={handleIzlemeToggle}
            onSnapshotYenile={handleSnapshotYenile}
          />
        ))}
      </div>

      {/* Manuel imar tarama */}
      {canIzle && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-violet-600" />
              <span className="text-2xs font-semibold text-slate-700 dark:text-slate-200">
                İmar Değişikliği Taraması
              </span>
            </div>
            {sonKontrol && (
              <div className="flex items-center gap-1 text-3xs text-slate-400">
                <Clock className="h-3 w-3" />
                {fmtTarih(sonKontrol)}
              </div>
            )}
          </div>

          <p className="text-3xs text-slate-500 dark:text-slate-400 mb-2">
            İzlenen parsellerin e-Plan imar özetleri kendi proxy üzerinden kontrol edilir. 14 günde bir otomatik; butonla manuel tetiklenebilir.
          </p>

          <button
            type="button"
            onClick={() => void handleImarTarama()}
            disabled={taramaYukleniyor || ozet.izlenenSayi === 0}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 text-2xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed transition dark:border-violet-800/40 dark:bg-violet-950/20 dark:text-violet-300"
          >
            {taramaYukleniyor ? (
              <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Kontrol ediliyor…</>
            ) : (
              <><Bell className="h-3.5 w-3.5" />Şimdi kontrol et ({ozet.izlenenSayi} parsel)</>
            )}
          </button>

          {taramaSonuc && (
            <div className="mt-1.5 text-3xs text-slate-600 dark:text-slate-400 text-center">
              {taramaSonuc}
            </div>
          )}

          {ozet.izlenenSayi === 0 && (
            <p className="mt-1 text-3xs text-slate-400 text-center italic">
              İzleme başlatmak için yukarıdan göz simgesine tıklayın.
            </p>
          )}
        </div>
      )}

      {!canIzle && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800/40 dark:bg-amber-950/20">
          <div className="flex items-center gap-1.5 mb-1">
            <BellOff className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-2xs font-semibold text-amber-800 dark:text-amber-200">
              Pro plan ile imar takibi aktif olur
            </span>
          </div>
          <p className="text-3xs text-amber-700 dark:text-amber-400">
            İzleme, delta takibi ve imar değişikliği bildirimleri Pro tier gerektirir.
          </p>
        </div>
      )}

      <p className="text-3xs italic text-slate-400 dark:text-slate-500 text-center">
        İlan scrape yapılmaz. Yalnızca e-Plan proxy + model fiyat bandı karşılaştırması.
      </p>
    </div>
  );
}
