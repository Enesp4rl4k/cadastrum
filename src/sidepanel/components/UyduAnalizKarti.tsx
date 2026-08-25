/**
 * UyduAnalizKarti — Parsel için Sentinel-2 uydu görüntüsü + Gemini Vision analizi.
 *
 * Gösterim:
 *   - Bant seçici (gerçek renk / NDVI / NIR / nem)
 *   - 256×256 uydu görüntüsü (base64 PNG)
 *   - Gemini Vision AI arazi özeti
 *   - Arazi bulguları (yapılaşma, bitkilik, su, tarım)
 *   - Fiyata olası etki notu
 *
 * Pro özelliği: AI analizi Pro tier gerektirir.
 * Görüntü (görsel) herkese açık; AI yorumu Pro+.
 */
import { useState } from "react";
import {
  Satellite as SatelliteIcon,
  Loader2 as LoaderIcon,
  RefreshCw as RefreshIcon,
  Leaf as LeafIcon,
  Building2 as BuildingIcon,
  Droplets as DropletsIcon,
  Sprout as SproutIcon,
} from "lucide-react";
import type { Parsel } from "../../types/tkgm";
import {
  sentinelGorselGetir,
  sentinelAnalizGetir,
  bantAciklamasi,
  bantIpucu,
  type SentinelBant,
  type SentinelAnalizSonuc,
} from "../../lib/sentinel-goruntu";
import { useLisans } from "../../lib/lisans";
import { PaywallKilit } from "./PaywallKilit";
import { Card, Section } from "../ui/Card";

interface Props {
  parsel: Parsel;
}

const BANTLAR: SentinelBant[] = ["gercek-renk", "ndvi", "yanlis-renk", "nem"];

export function UyduAnalizKarti({ parsel }: Props) {
  const lisans = useLisans();
  const proAcik = lisans.can("ai-fiyat");

  const [aktifBant, setAktifBant] = useState<SentinelBant>("gercek-renk");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [analiz, setAnaliz] = useState<SentinelAnalizSonuc | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const lat = parsel.merkezNokta?.lat;
  const lng = parsel.merkezNokta?.lng;

  if (!lat || !lng) return null;

  async function gorselCek(bant: SentinelBant) {
    if (!lat || !lng) return;
    setAktifBant(bant);
    setHata(null);

    // Sadece görüntü (AI olmadan)
    if (!proAcik) {
      setYukleniyor(true);
      try {
        const gorsel = await sentinelGorselGetir(lat, lng, bant);
        if (!gorsel) {
          setHata("Uydu görüntüsü alınamadı.");
          return;
        }
        setAnaliz({ gorsel, aiOzet: null, araziBulgu: null, fiyatNotu: null });
      } catch {
        setHata("Bağlantı hatası.");
      } finally {
        setYukleniyor(false);
      }
      return;
    }

    // Pro: görüntü + AI analiz
    setYukleniyor(true);
    try {
      const tokenRaw = await chrome.storage.local.get("cadastrum_token");
      const jwt = typeof tokenRaw["cadastrum_token"] === "string"
        ? tokenRaw["cadastrum_token"]
        : null;

      const sonuc = await sentinelAnalizGetir(lat, lng, bant, jwt);
      if (!sonuc) {
        setHata("Uydu verisi alınamadı.");
        return;
      }
      setAnaliz(sonuc);
    } catch {
      setHata("Analiz hatası.");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Section
      title="Uydu Görüntüsü"
      icon={<SatelliteIcon className="h-3.5 w-3.5" />}
    >
      {/* Bant seçici */}
      <div className="flex flex-wrap gap-1 mb-3">
        {BANTLAR.map((bant) => (
          <button
            key={bant}
            type="button"
            title={bantIpucu(bant)}
            onClick={() => gorselCek(bant)}
            className={`px-2 py-1 rounded text-2xs font-medium transition-colors ${
              aktifBant === bant && analiz
                ? "bg-imperial text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {bantAciklamasi(bant)}
          </button>
        ))}
      </div>

      {/* Başlat butonu — henüz yüklenmediyse */}
      {!analiz && !yukleniyor && !hata && (
        <button
          type="button"
          onClick={() => gorselCek(aktifBant)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 py-6 text-xs text-slate-500 hover:border-imperial hover:text-imperial transition-colors"
        >
          <SatelliteIcon className="h-5 w-5 opacity-50" />
          <span>Uydu görüntüsünü yükle</span>
        </button>
      )}

      {/* Yükleniyor */}
      {yukleniyor && (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400">
          <LoaderIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>Copernicus uydu verisi alınıyor…</span>
        </div>
      )}

      {/* Hata */}
      {hata && !yukleniyor && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
          {hata}
        </div>
      )}

      {/* Görüntü */}
      {analiz?.gorsel && !yukleniyor && (
        <div className="space-y-2">
          {/* Görsel */}
          <div className="relative overflow-hidden rounded-lg border border-slate-200">
            <img
              src={analiz.gorsel.base64}
              alt={`Sentinel-2 ${bantAciklamasi(aktifBant)} — ${parsel.ilceAd ?? ""} ${parsel.mahalleAd ?? ""}`}
              className="w-full h-auto block"
              style={{ imageRendering: "pixelated" }}
            />
            {/* Meta overlay */}
            <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between">
              {analiz.gorsel.gorselTarihi && (
                <span className="rounded bg-black/60 px-1.5 py-0.5 text-3xs text-white">
                  {analiz.gorsel.gorselTarihi}
                </span>
              )}
              <span className="rounded bg-black/60 px-1.5 py-0.5 text-3xs text-white ml-auto">
                10m · Sentinel-2
              </span>
            </div>
          </div>

          {/* Yenile + bant bilgisi */}
          <div className="flex items-center justify-between text-2xs text-slate-500">
            <span title={bantIpucu(aktifBant)}>{bantAciklamasi(aktifBant)}</span>
            <button
              type="button"
              onClick={() => gorselCek(aktifBant)}
              className="flex items-center gap-1 text-imperial hover:underline"
            >
              <RefreshIcon className="h-3 w-3" />
              Yenile
            </button>
          </div>

          {/* AI analiz — Pro */}
          {proAcik ? (
            analiz.aiOzet || analiz.araziBulgu ? (
              <div className="space-y-2 rounded-lg bg-imperial-50 border border-imperial-100 p-3">
                {analiz.aiOzet && (
                  <p className="text-2xs text-imperial-800 leading-relaxed">
                    🤖 {analiz.aiOzet}
                  </p>
                )}

                {analiz.araziBulgu && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="flex items-center gap-1.5 rounded bg-white px-2 py-1.5 text-2xs">
                      <LeafIcon className="h-3 w-3 text-emerald-600 flex-shrink-0" />
                      <span className="text-slate-600">Bitki:</span>
                      <span className="font-semibold capitalize">{analiz.araziBulgu.bitkilik}</span>
                    </div>
                    <div className="flex items-center gap-1.5 rounded bg-white px-2 py-1.5 text-2xs">
                      <BuildingIcon className="h-3 w-3 text-slate-500 flex-shrink-0" />
                      <span className="text-slate-600">Yapı:</span>
                      <span className="font-semibold capitalize">{analiz.araziBulgu.yapilaşma}</span>
                    </div>
                    {analiz.araziBulgu.tarimAlan && (
                      <div className="flex items-center gap-1.5 rounded bg-white px-2 py-1.5 text-2xs">
                        <SproutIcon className="h-3 w-3 text-amber-600 flex-shrink-0" />
                        <span className="text-amber-800 font-medium">Tarım alanı</span>
                      </div>
                    )}
                    {analiz.araziBulgu.su && (
                      <div className="flex items-center gap-1.5 rounded bg-white px-2 py-1.5 text-2xs">
                        <DropletsIcon className="h-3 w-3 text-blue-500 flex-shrink-0" />
                        <span className="text-blue-700 font-medium">Su/sulak alan</span>
                      </div>
                    )}
                  </div>
                )}

                {analiz.fiyatNotu && (
                  <p className="text-2xs text-slate-600 border-t border-imperial-100 pt-2">
                    💰 {analiz.fiyatNotu}
                  </p>
                )}
              </div>
            ) : null
          ) : (
            <PaywallKilit
              gerekliTier="bireysel-pro"
              ozellik="Uydu AI Arazi Analizi"
              kompakt
            />
          )}
        </div>
      )}
    </Section>
  );
}
