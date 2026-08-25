/**
 * PortfoyView — Favoriler, Geçmiş, Alarmlar ve Karşılaştır
 * 4 ayrı tab'ı tek "Portföy" sekmesi altında sub-nav olarak toplar.
 *
 * Props:
 *   onFlyTo       — Favoriler/Geçmiş'ten parsel seçilince haritaya git
 *   onKarsilastirFlyTo — Karşılaştır'dan haritaya git
 */

import { lazy, Suspense, useEffect, useState, useMemo } from "react";
import {
  Star as StarIcon,
  History as HistoryIcon,
  Bell as BellIcon,
  GitCompare as CompareIcon,
  TrendingUp as TrendingUpIcon,
  MapPin as MapPinIcon,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type FavoriParsel, type SorguGecmisi } from "../../lib/db";
import { mahalleBaselineGetirAsync } from "../../lib/baseline-engine";
import type { Parsel } from "../../types/tkgm";

const FavorilerView    = lazy(() => import("./FavorilerView").then(m => ({ default: m.FavorilerView })));
const GecmisView       = lazy(() => import("./GecmisView").then(m => ({ default: m.GecmisView })));
const BildirimlerView  = lazy(() => import("./BildirimlerView").then(m => ({ default: m.BildirimlerView })));
const KarsilastirmaView = lazy(() => import("./KarsilastirmaView").then(m => ({ default: m.KarsilastirmaView })));

type SubTab = "favoriler" | "gecmis" | "bildirimler" | "karsilastirma";

interface SubTabConfig {
  id: SubTab;
  label: string;
  Icon: typeof StarIcon;
  short: string;
}

const SUB_TABS: SubTabConfig[] = [
  { id: "favoriler",     label: "Favoriler",   short: "Favori",  Icon: StarIcon },
  { id: "gecmis",        label: "Geçmiş",      short: "Geçmiş",  Icon: HistoryIcon },
  { id: "bildirimler",   label: "Alarmlar",    short: "Alarm",   Icon: BellIcon },
  { id: "karsilastirma", label: "Karşılaştır", short: "Karş.",   Icon: CompareIcon },
];

interface Props {
  /** Haritaya uç — favoriler/geçmiş seçiminde */
  onFlyTo: (parsel: Parsel, lat: number, lng: number) => void;
  /** Karşılaştır'dan haritaya uç */
  onKarsilastirFlyTo: (parsel: Parsel) => void;
  /** Başlangıç sub-tab'ı — dışarıdan açılabilir (örn. Karşılaştır butonundan) */
  initialSubTab?: SubTab;
}

/* ─── Portföy Dashboard — toplam değer özeti ─────────────────────────────── */

function PortfoyDashboard() {
  const favoriler = useLiveQuery(
    () => db.favoriler.orderBy("eklenmeTarihi").reverse().toArray(),
    [],
  );

  // Toplam baseline değer — her favori için async hesapla, cache'le
  const [toplamDeger, setToplamDeger] = useState<number | null>(null);
  const [hesaplaniyor, setHesaplaniyor] = useState(false);

  const favoriSayisi = favoriler?.length ?? 0;
  const toplamAlan = useMemo(
    () => (favoriler ?? []).reduce((s, f) => s + (f.parsel?.alan ?? 0), 0),
    [favoriler],
  );

  // Toplam değer hesapla — favoriler değişince yeniden hesapla
  useEffect(() => {
    if (!favoriler || favoriler.length === 0) { setToplamDeger(null); return; }
    let iptal = false;
    setHesaplaniyor(true);

    (async () => {
      let toplam = 0;
      for (const f of favoriler) {
        if (iptal) break;
        if (!f.parsel?.alan || f.parsel.alan <= 0) continue;
        try {
          const nitelik = f.parsel.nitelik?.toLocaleLowerCase("tr") ?? "";
          const kat: "arsa" | "tarla" | "konut" =
            /tarla|bah[çc]e|zeytin|mera/.test(nitelik) ? "tarla"
              : /konut|mesken|bina/.test(nitelik) ? "konut"
              : "arsa";
          const b = await mahalleBaselineGetirAsync(
            f.ilAd ?? "", f.ilceAd ?? "", f.mahalleAd ?? "", kat,
          );
          if (b && b.baseline > 0) {
            toplam += Math.round(b.baseline * f.parsel.alan);
          }
        } catch { /* atla */ }
      }
      if (!iptal) { setToplamDeger(toplam > 0 ? toplam : null); setHesaplaniyor(false); }
    })();

    return () => { iptal = true; };
  }, [favoriler]);

  if (!favoriler || favoriler.length === 0) return null;

  const fmtTL = (n: number) => {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} Mr ₺`;
    if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)} M ₺`;
    return `${Math.round(n / 1_000)} K ₺`;
  };

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-blue-50/80 to-slate-50/80 dark:from-blue-950/20 dark:to-slate-900/60 flex-shrink-0"
    >
      {/* Parsel sayısı */}
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900/40">
          <MapPinIcon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-bold text-slate-800 dark:text-slate-100 leading-none">
            {favoriSayisi} arazi
          </div>
          {toplamAlan > 0 && (
            <div className="text-[9px] text-slate-500 dark:text-slate-400 leading-none mt-0.5">
              {toplamAlan >= 10_000
                ? `${(toplamAlan / 10_000).toFixed(1)} ha`
                : `${toplamAlan.toLocaleString("tr-TR")} m²`}
            </div>
          )}
        </div>
      </div>

      <div className="h-7 w-px bg-slate-200 dark:bg-slate-700 flex-shrink-0" aria-hidden="true" />

      {/* Toplam değer */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900/40">
          <TrendingUpIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="text-[9px] text-slate-500 dark:text-slate-400 leading-none">
            Tahmini toplam değer
          </div>
          <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 leading-none mt-0.5 tabular-nums">
            {hesaplaniyor
              ? <span className="animate-pulse text-slate-400">hesaplanıyor…</span>
              : toplamDeger
                ? fmtTL(toplamDeger)
                : "—"
            }
          </div>
        </div>
      </div>
    </div>
  );
}

export function PortfoyView({ onFlyTo, onKarsilastirFlyTo, initialSubTab = "favoriler" }: Props) {
  const [subTab, setSubTab] = useState<SubTab>(initialSubTab);

  return (
    <div className="flex h-full flex-col">
      {/* ── Dashboard özeti ── */}
      <PortfoyDashboard />

      {/* ── Sub-nav ── */}
      <nav
        className="flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex-shrink-0"
        role="tablist"
        aria-label="Portföy sekmeleri"
      >
        {SUB_TABS.map((t) => {
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSubTab(t.id)}
              className={[
                "relative flex flex-1 flex-col items-center gap-0.5 px-1 pt-2 pb-2.5 text-[9px] font-medium transition-colors duration-150",
                active
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300",
              ].join(" ")}
            >
              {/* Active bottom indicator */}
              {active && (
                <span
                  className="absolute bottom-0 left-2 right-2 h-[2.5px] rounded-full bg-blue-500 dark:bg-blue-400"
                  aria-hidden="true"
                />
              )}
              <t.Icon
                className={[
                  "h-[16px] w-[16px] transition-all duration-200",
                  active ? "scale-110" : "scale-100",
                ].join(" ")}
                aria-hidden="true"
              />
              <span className="leading-none">{t.short}</span>
            </button>
          );
        })}
      </nav>

      {/* ── İçerik ── */}
      <div className="flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="flex h-32 items-center justify-center text-sm text-slate-400">
              <div className="animate-pulse">Yükleniyor…</div>
            </div>
          }
        >
          {subTab === "favoriler" && (
            <FavorilerView
              onSelect={(f: FavoriParsel) =>
                onFlyTo(
                  f.parsel,
                  f.parsel.merkezNokta.lat,
                  f.parsel.merkezNokta.lng,
                )
              }
            />
          )}
          {subTab === "gecmis" && (
            <GecmisView
              onSelect={(k: SorguGecmisi) => {
                if (k.basarili && k.parsel) {
                  onFlyTo(k.parsel, k.lat, k.lng);
                }
              }}
            />
          )}
          {subTab === "bildirimler" && <BildirimlerView />}
          {subTab === "karsilastirma" && (
            <KarsilastirmaView
              onFlyTo={(parsel: Parsel) => onKarsilastirFlyTo(parsel)}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
}
