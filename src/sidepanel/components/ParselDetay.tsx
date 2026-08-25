import { useState, useEffect, useRef } from "react";
import {
  Star as StarIcon,
  Check as CheckIcon,
  FileText as FileIcon,
  GitMerge as MergeIcon,
  Clock as ClockIcon,
} from "lucide-react";
import { db } from "../../lib/db";
import type { Parsel } from "../../types/tkgm";
import { AnalizPanel } from "./AnalizPanel";
import { FiyatTrendiKarti } from "./FiyatTrendiKarti";
import { ZamanMakinesiModal } from "./ZamanMakinesiModal";
import { ParselNotDefteri } from "./ParselNotDefteri";
import { Divider } from "../ui/Card";
import { useToast } from "./Toast";
import { KarsilastirmaButonu } from "./KarsilastirmaButonu";
import { ParselOzetKarti } from "./ParselOzetKarti";
import { useEPlanVerisi } from "../../lib/use-eplan";
import { useTkgmKisitlar } from "../../lib/use-tkgm-kisitlar";
import { backendeFavoriGonder } from "../../lib/portfoy-sync";

type HaritaPoiler = { tip: string; ad: string; lat: number; lng: number; mesafeM: number; ikon?: string }[];

interface Props {
  parsel: Parsel;
  onYakinPoiler?: (poiler: import("../../lib/osm").YakinNoktaMesafesi[] | null) => void;
  /** Altyapı statik POI'ler (OSB/Havalimanı/Liman) — harita çizgisi için */
  onAltyapiPoiler?: (poiler: HaritaPoiler | null) => void;
  /** Karşılaştır butonuna tıklandığında karşılaştırma tabına geç */
  onKarsilastirTabAc?: () => void;
}

export function ParselDetay({ parsel, onYakinPoiler, onAltyapiPoiler, onKarsilastirTabAc }: Props) {
  const [not, setNot] = useState("");
  const [saved, setSaved] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [zamanMakinesiAcik, setZamanMakinesiAcik] = useState(false);
  const { toast } = useToast();
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // e-Plan verisi — ParselOzetKarti'ya imar özetini geçirmek için
  const { veri: ePlanVeri, loading: ePlanLoading } = useEPlanVerisi(parsel);
  // Tapu kısıtları — chrome.storage'tan (content script TKGM sayfasında yakalar)
  const kisitlar = useTkgmKisitlar(parsel);

  // Unmount olduğunda timer'ı temizle — memory leak ve stale state güncellemesini önler
  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) {
        clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  async function favoriyeEkle() {
    try {
      await db.favoriler.add({
        mahalleKodu: parsel.mahalleKodu ?? 0,
        adaNo: parsel.adaNo,
        parselNo: parsel.parselNo,
        ilAd: parsel.ilAd,
        ilceAd: parsel.ilceAd,
        mahalleAd: parsel.mahalleAd,
        not,
        eklenmeTarihi: Date.now(),
        parsel,
      });
      setSaved(true);
      setShowNote(false);
      setNot("");
      // Backend'e de gönder (Pro kullanıcılar için sessiz — token yoksa no-op)
      void backendeFavoriGonder({
        mahalleKodu: parsel.mahalleKodu ?? 0,
        adaNo: parsel.adaNo,
        parselNo: parsel.parselNo,
        ilAd: parsel.ilAd,
        ilceAd: parsel.ilceAd,
        mahalleAd: parsel.mahalleAd,
        not,
        eklenmeTarihi: Date.now(),
        parsel,
      });
      if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2500);
      const lokasyon = [parsel.mahalleAd, parsel.ilceAd].filter(Boolean).join(", ");
      toast.success(
        lokasyon
          ? `${lokasyon} favorilere eklendi`
          : `Ada ${parsel.adaNo} / Parsel ${parsel.parselNo} favorilere eklendi`
      );
    } catch (e) {
      toast.error("Favoriye eklenemedi — " + (e instanceof Error ? e.message : "bilinmeyen hata"));
    }
  }

  const alan = parsel.alan > 0
    ? parsel.alan >= 10_000
      ? `${(parsel.alan / 10_000).toFixed(2)} ha`
      : `${parsel.alan.toLocaleString("tr-TR")} m²`
    : null;

  return (
    <div className="space-y-2.5">
      {/* ── Özet kart + eylem butonları satır içi ── */}
      <ParselOzetKarti
        parsel={parsel}
        ePlan={ePlanLoading ? undefined : ePlanVeri}
        kisitlar={kisitlar}
      />

      {/* Gittiği parseller uyarısı */}
      {parsel.gittigiParseller.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/25 px-2.5 py-2">
          <MergeIcon className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <div className="text-2xs font-semibold text-amber-800 dark:text-amber-300">Parsel dönüşümü mevcut</div>
            <div className="text-3xs text-amber-700 dark:text-amber-400 mt-0.5">
              Gittiği: {parsel.gittigiParseller.join(", ")}
            </div>
          </div>
        </div>
      )}

      {/* ── Eylem butonları — küçük, compact ── */}
      <div className="flex items-center gap-1.5">
        {!showNote && !saved && (
          <button
            type="button"
            onClick={() => setShowNote(true)}
            className="flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-2xs font-medium text-slate-600 dark:text-slate-300 hover:border-tkgm-primary hover:text-tkgm-primary transition-colors"
          >
            <StarIcon className="h-3 w-3" />
            Favori
          </button>
        )}
        {saved && (
          <div className="flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 text-2xs font-medium text-emerald-700 dark:text-emerald-400">
            <CheckIcon className="h-3 w-3" />
            Kaydedildi
          </div>
        )}
        <KarsilastirmaButonu
          parsel={parsel}
          varyant="compact"
          onEklendi={onKarsilastirTabAc}
        />
      </div>

      {/* Not formu */}
      {showNote && (
        <div className="space-y-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-sm content-enter">
          <label className="block text-2xs font-semibold text-slate-700 dark:text-slate-300">
            <FileIcon className="inline h-3 w-3 mr-1 text-slate-400" aria-hidden="true" />
            Not ekle (opsiyonel)
          </label>
          <textarea
            value={not}
            onChange={(e) => setNot(e.target.value)}
            placeholder="Örn: köşe parsel, imar planı kontrol et…"
            className="w-full resize-none rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 p-2 text-xs text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:border-blue-400 focus:outline-none transition-colors"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={favoriyeEkle}
              className="btn-cta flex-1 rounded-lg bg-gradient-to-r from-imperial to-tkgm-primary px-3 py-1.5 text-xs font-semibold text-white"
            >
              <StarIcon className="inline h-3 w-3 mr-1" aria-hidden="true" />
              Kaydet
            </button>
            <button
              type="button"
              onClick={() => { setShowNote(false); setNot(""); }}
              className="rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {/* Ana analiz paneli — FiyatTahmin + Risk ilk sırada */}
      <AnalizPanel parsel={parsel} onYakinPoiler={onYakinPoiler} onAltyapiPoiler={onAltyapiPoiler} />

      {/* Fiyat trendi + Zaman Makinesi — analiz sonrası */}
      {parsel.ilceAd && (
        <div>
          <FiyatTrendiKarti
            il={parsel.ilAd ?? ""}
            ilce={parsel.ilceAd}
            mahalle={parsel.mahalleAd ?? ""}
          />
          <button
            type="button"
            onClick={() => setZamanMakinesiAcik(true)}
            className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-blue-200 bg-blue-50/60 py-1.5 text-[10px] font-medium text-blue-600 hover:bg-blue-100 hover:border-blue-300 transition dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-400"
          >
            <ClockIcon className="h-3 w-3" />
            Fiyat Zaman Makinesi — Geçmiş &amp; Projeksiyon
          </button>
        </div>
      )}

      {/* Zaman Makinesi Modal */}
      {zamanMakinesiAcik && parsel.ilceAd && (
        <ZamanMakinesiModal
          il={parsel.ilAd ?? ""}
          ilce={parsel.ilceAd}
          mahalle={parsel.mahalleAd ?? ""}
          onKapat={() => setZamanMakinesiAcik(false)}
        />
      )}

      {/* Not Defteri — en alta */}
      <ParselNotDefteri parsel={parsel} />
    </div>
  );
}
