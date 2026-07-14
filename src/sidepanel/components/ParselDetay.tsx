import { useState, useEffect, useRef } from "react";
import {
  Star as StarIcon,
  Check as CheckIcon,
  MapPin as MapPinIcon,
  FileText as FileIcon,
  GitMerge as MergeIcon,
} from "lucide-react";
import { db } from "../../lib/db";
import type { Parsel } from "../../types/tkgm";
import { AnalizPanel } from "./AnalizPanel";
import { FiyatTrendiKarti } from "./FiyatTrendiKarti";
import { MetricCard, Divider } from "../ui/Card";
import { useToast } from "./Toast";
import { KarsilastirmaButonu } from "./KarsilastirmaButonu";

interface Props {
  parsel: Parsel;
  onYakinPoiler?: (poiler: import("../../lib/osm").YakinNoktaMesafesi[] | null) => void;
  /** Karşılaştır butonuna tıklandığında karşılaştırma tabına geç */
  onKarsilastirTabAc?: () => void;
}

export function ParselDetay({ parsel, onYakinPoiler, onKarsilastirTabAc }: Props) {
  const [not, setNot] = useState("");
  const [saved, setSaved] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const { toast } = useToast();
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    <div className="space-y-3">
      {/* ── Lokasyon başlığı ── */}
      <div
        className="rounded-xl px-3 py-2.5 content-enter"
        style={{
          background: "linear-gradient(135deg, rgba(27,42,74,0.05) 0%, rgba(13,110,253,0.04) 100%)",
          border: "1px solid rgba(27,42,74,0.08)",
        }}
      >
        <div className="flex items-start gap-2">
          <div
            className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
            style={{ background: "linear-gradient(135deg, #1B2A4A 0%, #0d6efd 100%)" }}
            aria-hidden="true"
          >
            <MapPinIcon className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight truncate">
              {[parsel.mahalleAd, parsel.ilceAd, parsel.ilAd].filter(Boolean).join(", ") || "Konum bilinmiyor"}
            </div>
            <div className="text-3xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
              Ada {parsel.adaNo} / Parsel {parsel.parselNo}
            </div>
          </div>
        </div>
      </div>

      {/* ── Metric kartları ── */}
      <div className="grid grid-cols-3 gap-1.5">
        {alan && (
          <MetricCard
            label="Alan"
            value={alan}
            sub="yüzölçüm"
            accent="info"
          />
        )}
        {parsel.nitelik && (
          <MetricCard
            label="Nitelik"
            value={parsel.nitelik}
            accent={
              /arsa/i.test(parsel.nitelik) ? "success" :
              /tarla/i.test(parsel.nitelik) ? "warning" :
              "neutral"
            }
          />
        )}
        {parsel.pafta && (
          <MetricCard
            label="Pafta"
            value={parsel.pafta}
            sub="koordinat"
            accent="neutral"
          />
        )}
      </div>

      {/* ── Gittiği parseller uyarısı ── */}
      {parsel.gittigiParseller.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/25 px-2.5 py-2">
          <MergeIcon className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <div className="text-2xs font-semibold text-amber-800 dark:text-amber-300">
              Parsel dönüşümü mevcut
            </div>
            <div className="text-3xs text-amber-700 dark:text-amber-400 mt-0.5">
              Gittiği: {parsel.gittigiParseller.join(", ")}
            </div>
          </div>
        </div>
      )}

      {/* ── Favori butonu ── */}
      <div className="flex items-center gap-2 pt-0.5 flex-wrap">
        {!showNote && !saved && (
          <button
            type="button"
            onClick={() => setShowNote(true)}
            className="btn-cta flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-imperial to-tkgm-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
          >
            <StarIcon className="h-3.5 w-3.5" />
            Favorilere ekle
          </button>
        )}
        <KarsilastirmaButonu
          parsel={parsel}
          varyant="compact"
          onEklendi={onKarsilastirTabAc}
        />
        {saved && (
          <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 px-3 py-1.5 check-draw">
            <CheckIcon className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Favorilere eklendi</span>
          </div>
        )}
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

      <Divider />

      {/* Fiyat trendi */}
      {parsel.ilceAd && (
        <FiyatTrendiKarti
          il={parsel.ilAd ?? ""}
          ilce={parsel.ilceAd}
          mahalle={parsel.mahalleAd ?? ""}
        />
      )}

      {/* Ana analiz paneli */}
      <AnalizPanel parsel={parsel} onYakinPoiler={onYakinPoiler} />
    </div>
  );
}
