import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { SCRAPING_ENABLED } from "../lib/build-flags";
import { ToastProvider } from "./components/Toast";
import { KarsilastirmaProvider } from "../lib/karsilastirma-store";
import { KarsilastirmaView } from "./views/KarsilastirmaView";
import {
  Map as MapIcon,
  Search as SearchIcon,
  ListChecks as ListChecksIcon,
  LayoutGrid as LayoutGridIcon,
  FlaskConical as FlaskIcon,
  Star as StarIcon,
  History as HistoryIcon,
  Building2 as Building2Icon,
  MoreHorizontal as MoreIcon,
  GitCompare as CompareIcon,
} from "lucide-react";
import { MapView } from "./views/MapView";
import { FavorilerView } from "./views/FavorilerView";
import { GecmisView } from "./views/GecmisView";
import { AraView } from "./views/AraView";
import { TopluView } from "./views/TopluView";
import { BolgeView } from "./views/BolgeView";
import { LabView } from "./views/LabView";
import { IlanKarti } from "./components/IlanKarti";
import { KomutPaleti } from "./components/KomutPaleti";
import { KvkkConsent, useKvkkConsentVerilmis } from "./components/KvkkConsent";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AyarlarDugmesi } from "./components/Ayarlar";
import { TemaSecici } from "./components/TemaSecici";
import HesapDurumu from "./components/HesapDurumu";
import { useLisans, type Yetenek } from "../lib/lisans";
import type { Parsel } from "../types/tkgm";
import { Onboarding, useOnboardingGoster } from "./components/Onboarding";

type Tab = "harita" | "ara" | "toplu" | "bolge" | "lab" | "favoriler" | "gecmis" | "bootstrap" | "karsilastirma";

interface FlyToTarget {
  lat: number;
  lng: number;
  parsel?: Parsel;
}

interface TabConfig {
  id: Tab;
  label: string;
  Icon: typeof MapIcon;
  yetenek?: Yetenek;
  adminGerekli?: boolean;
}

const TABS: TabConfig[] = [
  { id: "harita",         label: "Harita",   Icon: MapIcon },
  { id: "ara",            label: "Ara",      Icon: SearchIcon },
  { id: "favoriler",      label: "Favori",   Icon: StarIcon },
  { id: "gecmis",         label: "Geçmiş",   Icon: HistoryIcon },
  { id: "karsilastirma",  label: "Karşılaştır", Icon: CompareIcon },
  { id: "toplu",          label: "Toplu",    Icon: ListChecksIcon, yetenek: "coklu-parsel-karsilastirma" },
  { id: "bolge",          label: "Bölge",    Icon: LayoutGridIcon },
  { id: "lab",            label: "Lab",      Icon: FlaskIcon, yetenek: "ai-fiyat" },
  ...(SCRAPING_ENABLED
    ? [{ id: "bootstrap" as const, label: "Boot", Icon: FlaskIcon, adminGerekli: true }]
    : []),
];

const SABIT_TAB_SAYISI = 4;

const BootstrapView = SCRAPING_ENABLED
  ? lazy(() => import("./views/BootstrapView").then((m) => ({ default: m.BootstrapView })))
  : null;

export function App() {
  return (
    <KarsilastirmaProvider>
      <ToastProvider>
        <AppInner />
      </ToastProvider>
    </KarsilastirmaProvider>
  );
}

function AppInner() {
  const [tab, setTab] = useState<Tab>("harita");
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);
  const lisans = useLisans();
  const kvkkVerilmis = useKvkkConsentVerilmis();
  const [kvkkKapali, setKvkkKapali] = useState(false);
  const [onboardingGoster, onboardingKapat] = useOnboardingGoster();

  const gorunurTabs = TABS.filter((t) => {
    if (t.yetenek && !lisans.can(t.yetenek)) return false;
    if (t.adminGerekli && !lisans.isAdmin && !import.meta.env.DEV) return false;
    return true;
  });

  const gorunurTabIdleri = gorunurTabs.map((t) => t.id).join(",");
  useEffect(() => {
    const idler = gorunurTabIdleri.split(",");
    if (!idler.includes(tab)) setTab("harita");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gorunurTabIdleri, tab]);

  const sabitTabs = gorunurTabs.slice(0, SABIT_TAB_SAYISI);
  const overflowTabs = gorunurTabs.slice(SABIT_TAB_SAYISI);

  return (
    <div className="relative flex h-full flex-col" style={{ background: "var(--surface-0)" }}>
      {onboardingGoster && <Onboarding onKapat={onboardingKapat} />}
      <KomutPaleti
        onParselSec={(parsel) => {
          setFlyTo({ lat: parsel.merkezNokta.lat, lng: parsel.merkezNokta.lng, parsel });
          setTab("harita");
        }}
      />
      {kvkkVerilmis === false && !kvkkKapali && (
        <KvkkConsent onComplete={() => setKvkkKapali(true)} />
      )}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between gap-2 px-3 py-2"
        style={{
          background: "var(--surface-1)",
          borderBottom: "1px solid var(--surface-3)",
          boxShadow: "var(--shadow-xs)",
        }}
      >
        {/* Logo mark */}
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
            style={{ background: "linear-gradient(135deg, #1B2A4A 0%, #0d6efd 100%)" }}
            aria-hidden="true"
          >
            <Building2Icon className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="min-w-0">
            <span className="block text-sm font-bold tracking-tight text-slate-800 dark:text-slate-100 leading-none">
              Cadastrum
            </span>
            <span className="block text-3xs text-slate-400 dark:text-slate-500 leading-none mt-0.5">
              Parsel Zekâsı
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <HesapDurumu />
          <TemaSecici />
          <AyarlarDugmesi />
        </div>
      </header>

      {/* ── Tab navigation ─────────────────────────────────────────────── */}
      <nav
        className="relative flex"
        role="tablist"
        data-tab-nav
        style={{
          background: "var(--surface-1)",
          borderBottom: "1px solid var(--surface-3)",
        }}
      >
        {/* Animated indicator pill */}
        <TabIndicator activeTab={tab} tabs={sabitTabs} />

        {sabitTabs.map((t) => (
          <TabButton
            key={t.id}
            active={tab === t.id}
            onClick={() => setTab(t.id)}
            label={t.label}
            Icon={t.Icon}
          />
        ))}
        {overflowTabs.length > 0 && (
          <OverflowMenu
            tabs={overflowTabs}
            activeTab={tab}
            onSelect={(id) => setTab(id)}
          />
        )}
      </nav>

      {/* ── İlan kartı ─────────────────────────────────────────────────── */}
      <div
        style={{
          background: "var(--surface-1)",
          borderBottom: "1px solid var(--surface-3)",
        }}
        className="px-2 py-1.5"
      >
        <ErrorBoundary etiket="İlan kartı">
          <IlanKarti
            acikParsel={flyTo?.parsel ?? null}
            onParselDogrula={(parsel) => {
              setFlyTo({ lat: parsel.merkezNokta.lat, lng: parsel.merkezNokta.lng, parsel });
              setTab("harita");
            }}
          />
        </ErrorBoundary>
      </div>

      {/* ── Main content ───────────────────────────────────────────────── */}
      <main className="relative flex-1 overflow-hidden" style={{ background: "var(--surface-0)" }}>
        <div className={tab === "harita" ? "h-full" : "hidden h-full"}>
          <ErrorBoundary etiket="Harita">
            <MapView
              flyTo={flyTo}
              onConsumed={() => setFlyTo(null)}
              onTabDegistir={(t) => setTab(t as Tab)}
            />
          </ErrorBoundary>
        </div>
        {tab === "ara" && (
          <AraView
            onResult={(parsel) => {
              setFlyTo({ lat: parsel.merkezNokta.lat, lng: parsel.merkezNokta.lng, parsel });
              setTab("harita");
            }}
          />
        )}
        {tab === "toplu" && lisans.can("coklu-parsel-karsilastirma") && <TopluView />}
        {tab === "bolge" && <BolgeView />}
        {tab === "lab" && lisans.can("ai-fiyat") && (
          <LabView
            initialIlceKodu={flyTo?.parsel?.ilceKodu ?? null}
            initialIlceAd={flyTo?.parsel?.ilceAd ?? null}
            onParselSec={(parsel) => {
              setFlyTo({ lat: parsel.merkezNokta.lat, lng: parsel.merkezNokta.lng, parsel });
              setTab("harita");
            }}
          />
        )}
        {tab === "favoriler" && (
          <FavorilerView
            onSelect={(f) => {
              setFlyTo({ lat: f.parsel.merkezNokta.lat, lng: f.parsel.merkezNokta.lng, parsel: f.parsel });
              setTab("harita");
            }}
          />
        )}
        {tab === "bootstrap" && BootstrapView && (
          <Suspense fallback={<div className="p-4 text-sm text-slate-500">Yükleniyor…</div>}>
            <BootstrapView />
          </Suspense>
        )}
        {tab === "gecmis" && (
          <GecmisView
            onSelect={(k) => {
              setFlyTo(
                k.basarili && k.parsel
                  ? { lat: k.lat, lng: k.lng, parsel: k.parsel }
                  : { lat: k.lat, lng: k.lng },
              );
              setTab("harita");
            }}
          />
        )}
        {tab === "karsilastirma" && (
          <KarsilastirmaView
            onFlyTo={(parsel) => {
              setFlyTo({ lat: parsel.merkezNokta.lat, lng: parsel.merkezNokta.lng, parsel });
              setTab("harita");
            }}
          />
        )}
      </main>
    </div>
  );
}

/* ─── Tab Indicator — spring-animated bottom pill ──────────────────────── */

function TabIndicator({ activeTab, tabs }: { activeTab: string; tabs: TabConfig[] }) {
  const [style, setStyle] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const nav = document.querySelector<HTMLElement>("[data-tab-nav]");
    if (!nav) return;

    const idx = tabs.findIndex((t) => t.id === activeTab);
    if (idx === -1) { setStyle(null); return; }

    const buttons = nav.querySelectorAll<HTMLButtonElement>("[data-tab-btn]");
    const btn = buttons[idx];
    if (!btn) return;

    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setStyle({ left: btnRect.left - navRect.left + 8, width: btnRect.width - 16 });
  }, [activeTab, tabs]);

  if (!style) return null;

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-0 h-[2.5px] rounded-full bg-gradient-primary"
      style={{
        left: style.left,
        width: style.width,
        transition: "left 280ms cubic-bezier(0.34,1.56,0.64,1), width 280ms cubic-bezier(0.34,1.56,0.64,1)",
      }}
    />
  );
}

/* ─── Tab Button ────────────────────────────────────────────────────────── */

function TabButton({
  active,
  onClick,
  label,
  Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  Icon: typeof MapIcon;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-tab-btn
      onClick={onClick}
      className={`
        relative flex flex-1 cursor-pointer flex-col items-center gap-0.5
        px-1 pt-2 pb-2.5
        text-3xs font-medium
        transition-colors duration-150
        ${active
          ? "text-tkgm-primary dark:text-blue-400"
          : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
        }
      `.replace(/\s+/g, " ").trim()}
    >
      {/* Active dot above icon */}
      {active && (
        <span
          className="absolute top-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-tkgm-primary dark:bg-blue-400"
          aria-hidden="true"
        />
      )}
      <Icon
        className={`
          h-[18px] w-[18px]
          transition-all duration-200
          ${active ? "scale-110 text-tkgm-primary dark:text-blue-400" : "scale-100"}
        `.replace(/\s+/g, " ").trim()}
      />
      <span className="leading-none">{label}</span>
    </button>
  );
}

/* ─── Overflow Menu ─────────────────────────────────────────────────────── */

function OverflowMenu({
  tabs,
  activeTab,
  onSelect,
}: {
  tabs: TabConfig[];
  activeTab: string;
  onSelect: (id: Tab) => void;
}) {
  const [acik, setAcik] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeInOverflow = tabs.some((t) => t.id === activeTab);

  useEffect(() => {
    if (!acik) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAcik(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [acik]);

  useEffect(() => {
    if (!acik) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setAcik(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [acik]);

  return (
    <div ref={ref} className="relative flex flex-shrink-0">
      <button
        type="button"
        aria-label="Daha fazla sekme"
        aria-expanded={acik}
        aria-haspopup="menu"
        onClick={() => setAcik((v) => !v)}
        className={`
          relative flex flex-col items-center gap-0.5
          px-2.5 pt-2 pb-2.5
          text-3xs font-medium
          transition-colors duration-150
          ${activeInOverflow
            ? "text-tkgm-primary dark:text-blue-400"
            : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          }
        `.replace(/\s+/g, " ").trim()}
      >
        {activeInOverflow && (
          <span
            className="absolute top-1 right-2 h-1.5 w-1.5 rounded-full bg-tkgm-primary dark:bg-blue-400"
            aria-hidden="true"
          />
        )}
        <MoreIcon className="h-[18px] w-[18px]" />
        <span className="leading-none">Daha</span>
      </button>

      {acik && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 min-w-[148px] overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"
          style={{ animation: "overflow-menu-in 200ms cubic-bezier(0.34,1.56,0.64,1) forwards" }}
        >
          <div className="p-1">
            {tabs.map((t) => {
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="menuitem"
                  onClick={() => { onSelect(t.id); setAcik(false); }}
                  className={`
                    flex w-full items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs
                    transition-colors duration-100
                    ${isActive
                      ? "bg-blue-50 font-semibold text-tkgm-primary dark:bg-blue-950/40 dark:text-blue-400"
                      : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/60"
                    }
                  `.replace(/\s+/g, " ").trim()}
                >
                  <t.Icon className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
                  {t.label}
                  {isActive && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-tkgm-primary dark:bg-blue-400" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
