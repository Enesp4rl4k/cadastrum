/**
 * AI Hub View — Faz A–C özellikleri tek sekmede
 *
 * Bağlantısız kalan componentleri kullanıcıya açar:
 *   • AI Danışman Chat (AIDanismanKarti + AIDanismanGecmis)
 *   • Trend Grafik (TrendGrafik + TrendKarsilastirma)
 *   • İmar Değişikliği Sinyali (ImarDegisimSinyalKarti)
 *   • Dijital İkiz (DijitalIkizKarti + DijitalIkizZaman)
 *   • Arazi Avcısı (AraziAvciKarti)
 *
 * Parsel seçiliyse bağlam otomatik geçirilir.
 * Seçili değilse "parsel açın" yönlendirmesi gösterilir (bazı araçlar parselsiz çalışır).
 */
import { useState } from "react";
import {
  Bot as BotIcon,
  TrendingUp as TrendIcon,
  Zap as ZapIcon,
  Box as BoxIcon,
  Search as SearchIcon,
  History as HistoryIcon,
  GitCompare as CompareIcon,
} from "lucide-react";
import { AIDanismanKarti } from "../components/AIDanismanKarti";
import { AIDanismanGecmis } from "../components/AIDanismanGecmis";
import { TrendGrafik } from "../components/TrendGrafik";
import { TrendKarsilastirma } from "../components/TrendKarsilastirma";
import { ImarDegisimSinyalKarti } from "../components/ImarDegisimSinyalKarti";
import { DijitalIkizKarti } from "../components/DijitalIkizKarti";
import { DijitalIkizZaman } from "../components/DijitalIkizZaman";
import { AraziAvciKarti } from "../components/AraziAvciKarti";
import { MahalleKarsilastirma } from "../components/MahalleKarsilastirma";
import { ErrorBoundary } from "../components/ErrorBoundary";
import type { Parsel } from "../../types/tkgm";
import type { EPlanImarVerisi } from "../../lib/eplan";
import type { CevreAnalizi } from "../../lib/osm";
import type { EgimAnalizi } from "../../lib/elevation";
import { useParselStore, useAiParselBaglam } from "../../lib/parsel-store";

// ── Alt sekme tanımları ───────────────────────────────────────────────────────

type AltTab =
  | "danisman"
  | "trend"
  | "imar-sinyal"
  | "dijital-ikiz"
  | "arazi-avci"
  | "mahalle-karsilastir";

interface AltTabConfig {
  id: AltTab;
  label: string;
  ikon: React.ReactNode;
  parselsiz?: boolean; // true → parsel olmadan da çalışır
}

const ALT_TABLAR: AltTabConfig[] = [
  {
    id: "danisman",
    label: "Danışman",
    ikon: <BotIcon className="h-3.5 w-3.5" />,
  },
  {
    id: "trend",
    label: "Trend",
    ikon: <TrendIcon className="h-3.5 w-3.5" />,
  },
  {
    id: "imar-sinyal",
    label: "İmar Sinyali",
    ikon: <ZapIcon className="h-3.5 w-3.5" />,
  },
  {
    id: "dijital-ikiz",
    label: "Dijital İkiz",
    ikon: <BoxIcon className="h-3.5 w-3.5" />,
  },
  {
    id: "arazi-avci",
    label: "Avcı",
    ikon: <SearchIcon className="h-3.5 w-3.5" />,
    parselsiz: true,
  },
  {
    id: "mahalle-karsilastir",
    label: "Karşılaştır",
    ikon: <CompareIcon className="h-3.5 w-3.5" />,
    parselsiz: true,
  },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** Giriş durumu — AIDanismanKarti için */
  girisYapildi?: boolean;
}

// ── Bileşen ───────────────────────────────────────────────────────────────────

export function AiHubView({ girisYapildi = false }: Props) {
  const [altTab, setAltTab] = useState<AltTab>("danisman");
  const [danismanGecmisAcik, setDanismanGecmisAcik] = useState(false);

  // Global store'dan parsel + analiz katmanlarını oku
  const { store } = useParselStore();
  const parsel = store.parsel;
  const ePlan  = store.katmanlar.ePlan.veri;
  const cevre  = store.katmanlar.cevre.veri;
  const egim   = store.katmanlar.egim.veri;

  // AI danışman için tam bağlam — fiyat + imar + cevre entegre
  const aiParselBaglam = useAiParselBaglam();

  return (
    <div className="flex h-full flex-col">
      {/* ── Alt sekme çubuğu ─────────────────────────────────────────────── */}
      <nav
        className="flex shrink-0 overflow-x-auto border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
        style={{ scrollbarWidth: "none" }}
      >
        {ALT_TABLAR.map((t) => {
          const aktif = altTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setAltTab(t.id)}
              className={`
                flex shrink-0 cursor-pointer items-center gap-1.5
                whitespace-nowrap px-3 py-2 text-2xs font-medium
                transition-colors duration-150
                border-b-2
                ${
                  aktif
                    ? "border-violet-600 text-violet-700 dark:border-violet-400 dark:text-violet-300"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }
              `
                .replace(/\s+/g, " ")
                .trim()}
            >
              <span
                className={aktif ? "text-violet-600 dark:text-violet-400" : "opacity-60"}
              >
                {t.ikon}
              </span>
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* ── İçerik alanı ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">

        {/* ── AI Danışman ────────────────────────────────────────────── */}
        {altTab === "danisman" && (
          <div className="space-y-2 p-2">
            {/* Geçmiş toggle */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setDanismanGecmisAcik((v) => !v)}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-2xs font-medium text-slate-600 shadow-card transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <HistoryIcon className="h-3 w-3 opacity-70" />
                {danismanGecmisAcik ? "Geçmişi gizle" : "Sohbet geçmişi"}
              </button>
            </div>

            {danismanGecmisAcik && (
              <ErrorBoundary etiket="AI Danışman Geçmişi">
                <AIDanismanGecmis girisYapildi={girisYapildi} />
              </ErrorBoundary>
            )}

            <ErrorBoundary etiket="AI Danışman">
              <AIDanismanKarti
                baglam={aiParselBaglam ?? undefined}
                girisYapildi={girisYapildi}
              />
            </ErrorBoundary>

            {!parsel && (
              <p className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-2xs text-violet-700 dark:border-violet-800/50 dark:bg-violet-950/30 dark:text-violet-300">
                💡 Haritadan bir parsel açarsanız danışman o parselin imar, fiyat
                ve risk verilerini bağlam olarak kullanır.
              </p>
            )}
          </div>
        )}

        {/* ── Trend Grafik ───────────────────────────────────────────── */}
        {altTab === "trend" && (
          <div className="space-y-2 p-2">
            {parsel ? (
              <>
                <ErrorBoundary etiket="Trend Grafik">
                  <TrendGrafik
                    lat={parsel.merkezNokta.lat}
                    lng={parsel.merkezNokta.lng}
                    il={parsel.ilAd ?? undefined}
                    ilce={parsel.ilceAd ?? undefined}
                    kategori="arsa"
                    aySecenegi={12}
                  />
                </ErrorBoundary>
                <ErrorBoundary etiket="Trend Karşılaştırma">
                  <TrendKarsilastirma
                    lat={parsel.merkezNokta.lat}
                    lng={parsel.merkezNokta.lng}
                    il={parsel.ilAd ?? ""}
                    ilce={parsel.ilceAd ?? ""}
                    kategori="arsa"
                  />
                </ErrorBoundary>
              </>
            ) : (
              <ParselGerekirMesaji ozellik="Trend Grafik" />
            )}
          </div>
        )}

        {/* ── İmar Değişikliği Sinyali ────────────────────────────────── */}
        {altTab === "imar-sinyal" && (
          <div className="space-y-2 p-2">
            {parsel ? (
              <ErrorBoundary etiket="İmar Değişikliği Sinyali">
                <ImarDegisimSinyalKarti
                  il={parsel.ilAd ?? ""}
                  ilce={parsel.ilceAd ?? ""}
                  mahalle={parsel.mahalleAd ?? ""}
                  imarTipi={ePlan?.kullanimKarari ?? undefined}
                  emsal={ePlan?.emsal ?? undefined}
                />
              </ErrorBoundary>
            ) : (
              <ParselGerekirMesaji ozellik="İmar Değişikliği Sinyali" />
            )}
          </div>
        )}

        {/* ── Dijital İkiz ───────────────────────────────────────────── */}
        {altTab === "dijital-ikiz" && (
          <div className="space-y-2 p-2">
            {parsel ? (
              <>
                <ErrorBoundary etiket="Dijital İkiz">
                  <DijitalIkizKarti
                    parsel={parsel}
                    ePlan={ePlan}
                    cevre={cevre}
                    egimYuzde={egim?.ortEgimYuzde ?? null}
                    bakiYonu={egim?.bakiYonu ?? null}
                  />
                </ErrorBoundary>
                <ErrorBoundary etiket="Dijital İkiz Zaman">
                  <DijitalIkizZaman
                    parsel={parsel}
                    ePlan={ePlan ?? undefined}
                  />
                </ErrorBoundary>
              </>
            ) : (
              <ParselGerekirMesaji ozellik="Dijital İkiz" />
            )}
          </div>
        )}

        {/* ── Arazi Avcısı ───────────────────────────────────────────── */}
        {altTab === "arazi-avci" && (
          <div className="p-2">
            <ErrorBoundary etiket="Arazi Avcısı">
              <AraziAvciKarti />
            </ErrorBoundary>
          </div>
        )}

        {/* ── Mahalle Karşılaştırma Matrisi ──────────────────────────── */}
        {altTab === "mahalle-karsilastir" && (
          <ErrorBoundary etiket="Mahalle Karşılaştırma">
            <MahalleKarsilastirma />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}

// ── Yardımcı ─────────────────────────────────────────────────────────────────

function ParselGerekirMesaji({ ozellik }: { ozellik: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-8 text-center shadow-card dark:border-slate-700 dark:bg-slate-900">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-50 dark:bg-violet-950/40">
        <BotIcon className="h-5 w-5 text-violet-500" />
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {ozellik} için parsel seçin
        </p>
        <p className="mt-1 text-2xs text-slate-500 dark:text-slate-400">
          Harita sekmesinden bir parsele tıklayın veya "Ara" sekmesinden ada/parsel
          numarasıyla arama yapın.
        </p>
      </div>
    </div>
  );
}
