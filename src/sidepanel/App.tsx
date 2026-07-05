import { lazy, Suspense, useState } from "react";
import { SCRAPING_ENABLED } from "../lib/build-flags";
import {
  Map as MapIcon,
  Search as SearchIcon,
  ListChecks as ListChecksIcon,
  LayoutGrid as LayoutGridIcon,
  FlaskConical as FlaskIcon,
  Star as StarIcon,
  History as HistoryIcon,
  Building2 as Building2Icon,
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

type Tab = "harita" | "ara" | "toplu" | "bolge" | "lab" | "favoriler" | "gecmis" | "bootstrap";

interface FlyToTarget {
  lat: number;
  lng: number;
  parsel?: Parsel;
}

interface TabConfig {
  id: Tab;
  label: string;
  Icon: typeof MapIcon;
  /** Bu tab'a erişim için gereken yetenek (free için undefined) */
  yetenek?: Yetenek;
  /** Sadece admin kullanıcılar görür (kullanicilar.admin=1 JWT claim) */
  adminGerekli?: boolean;
}

const TABS: TabConfig[] = [
  { id: "harita", label: "Harita", Icon: MapIcon },
  { id: "ara", label: "Ara", Icon: SearchIcon },
  { id: "toplu", label: "Toplu", Icon: ListChecksIcon, yetenek: "coklu-parsel-karsilastirma" },
  { id: "bolge", label: "Bölge", Icon: LayoutGridIcon },
  { id: "lab", label: "Lab", Icon: FlaskIcon, yetenek: "ai-fiyat" },
  { id: "favoriler", label: "Favori", Icon: StarIcon },
  { id: "gecmis", label: "Geçmiş", Icon: HistoryIcon },
  // Admin/dev only — admin Chrome profiline (kullanicilar.admin=1) açık.
  // Production'da non-admin kullanıcılar bu sekmeyi göremez.
  ...(SCRAPING_ENABLED
    ? [{ id: "bootstrap" as const, label: "Boot", Icon: FlaskIcon, adminGerekli: true }]
    : []),
];

const BootstrapView = SCRAPING_ENABLED
  ? lazy(() => import("./views/BootstrapView").then((m) => ({ default: m.BootstrapView })))
  : null;

export function App() {
  const [tab, setTab] = useState<Tab>("harita");
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);
  const lisans = useLisans();
  const kvkkVerilmis = useKvkkConsentVerilmis();
  const [kvkkKapali, setKvkkKapali] = useState(false);

  // Sadece kullanıcının erişebildiği sekmeler — Pro özellikler tamamen gizlenir.
  // adminGerekli sekmeleri DEV build'de veya admin JWT claim'i olanlara açık.
  const gorunurTabs = TABS.filter((t) => {
    if (t.yetenek && !lisans.can(t.yetenek)) return false;
    if (t.adminGerekli && !lisans.isAdmin && !import.meta.env.DEV) return false;
    return true;
  });

  // Tier düşmüşse seçili sekme gizlendiyse Harita'ya dön
  if (!gorunurTabs.find(t => t.id === tab)) {
    setTimeout(() => setTab("harita"), 0);
  }

  return (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-slate-900">
      <KomutPaleti />
      {kvkkVerilmis === false && !kvkkKapali && (
        <KvkkConsent onComplete={() => setKvkkKapali(true)} />
      )}
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-tkgm-primary/10 text-tkgm-primary">
            <Building2Icon className="h-4 w-4" />
          </div>
          <h1 className="text-sm font-semibold text-slate-800 leading-tight dark:text-slate-100 truncate">
            Cadastrum
          </h1>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <HesapDurumu />
          <TemaSecici />
          <AyarlarDugmesi />
        </div>
      </header>

      <nav className="flex border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {gorunurTabs.map((t) => (
          <TabButton
            key={t.id}
            active={tab === t.id}
            onClick={() => setTab(t.id)}
            label={t.label}
            Icon={t.Icon}
          />
        ))}
      </nav>

      <div className="border-b border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
        <ErrorBoundary etiket="İlan kartı">
          <IlanKarti
            acikParsel={flyTo?.parsel ?? null}
            onParselDogrula={(parsel) => {
              setFlyTo({
                lat: parsel.merkezNokta.lat,
                lng: parsel.merkezNokta.lng,
                parsel,
              });
              setTab("harita");
            }}
          />
        </ErrorBoundary>
      </div>

      <main className="relative flex-1 overflow-hidden dark:bg-slate-900">
        {/* MapView'i unmount etmiyoruz — MapLibre instance'ı korunsun.
            ErrorBoundary: MapLibre çökse bile diğer sekmeler çalışsın. */}
        <div className={tab === "harita" ? "h-full" : "hidden h-full"}>
          <ErrorBoundary etiket="Harita">
            <MapView flyTo={flyTo} onConsumed={() => setFlyTo(null)} />
          </ErrorBoundary>
        </div>
        {tab === "ara" && (
          <AraView
            onResult={(parsel) => {
              setFlyTo({
                lat: parsel.merkezNokta.lat,
                lng: parsel.merkezNokta.lng,
                parsel,
              });
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
              setFlyTo({
                lat: parsel.merkezNokta.lat,
                lng: parsel.merkezNokta.lng,
                parsel,
              });
              setTab("harita");
            }}
          />
        )}
        {tab === "favoriler" && (
          <FavorilerView
            onSelect={(f) => {
              setFlyTo({
                lat: f.parsel.merkezNokta.lat,
                lng: f.parsel.merkezNokta.lng,
                parsel: f.parsel,
              });
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
      </main>
    </div>
  );
}

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
      onClick={onClick}
      className={`flex flex-1 cursor-pointer flex-col items-center gap-0.5 px-1 py-2 text-3xs font-medium transition-colors ${
        active
          ? "border-b-2 border-tkgm-primary bg-tkgm-primary/5 text-tkgm-primary dark:bg-tkgm-primary/10"
          : "border-b-2 border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}
