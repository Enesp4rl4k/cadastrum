/**
 * EmsalRadiusSlider — Spatial emsal motorunun görünür yüzü.
 *
 * Kullanıcı 1/3/5/10 km arasında yarıçapı değiştirir; her radius için
 * `radiusEmsalGetir` çalıştırılır ve halka dağılımı + weighted median
 * gösterilir. Gerçek fiyat motorunu etkilemez (o ayrı `D_BY_KATEGORI`
 * ile çalışır); bu UI keşif/sezgi içindir.
 *
 * Pro tier'da görünür — Free tier'da Paywall.
 */

import { useEffect, useState } from "react";
import { Crosshair as CrosshairIcon, Layers as LayersIcon } from "lucide-react";
import type { Parsel } from "../../types/tkgm";
import {
  radiusEmsalGetir,
  type SpatialEmsalSonuc,
  type SpatialKategori,
} from "../../lib/spatial-emsal";
import { Section } from "../ui/Card";
import { useLisans } from "../../lib/lisans";
import { PaywallKilit } from "./PaywallKilit";
import { SpatialHeatmapMini } from "./SpatialHeatmapMini";

interface Props {
  parsel: Parsel;
}

const RADIUS_SECENEKLERI = [
  { etiket: "1 km", m: 1000 },
  { etiket: "3 km", m: 3000 },
  { etiket: "5 km", m: 5000 },
  { etiket: "10 km", m: 10_000 },
] as const;

function kategoriBul(nitelik: string): SpatialKategori {
  const t = nitelik.toLocaleLowerCase("tr");
  if (/mesken|bina|işyeri|isyeri|konut|daire/.test(t)) return "konut";
  if (/tarla|bahçe|bahce|zeytin|bağ\b|bag\b|orman|mera/u.test(t)) return "tarla";
  return "arsa";
}

export function EmsalRadiusSlider({ parsel }: Props) {
  const lisans = useLisans();
  const proAcik = lisans.can("ai-fiyat") || lisans.can("tarim-modulu");
  const [radiusM, setRadiusM] = useState<number>(5000);
  const [sonuc, setSonuc] = useState<SpatialEmsalSonuc | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);

  const lat = parsel.merkezNokta?.lat;
  const lng = parsel.merkezNokta?.lng;
  const kategori = kategoriBul(parsel.nitelik);

  useEffect(() => {
    if (!proAcik || typeof lat !== "number" || typeof lng !== "number") return;
    let iptal = false;
    setYukleniyor(true);
    radiusEmsalGetir(lat, lng, radiusM, kategori)
      .then((r) => {
        if (!iptal) {
          setSonuc(r);
          setYukleniyor(false);
        }
      })
      .catch(() => {
        if (!iptal) setYukleniyor(false);
      });
    return () => {
      iptal = true;
    };
  }, [lat, lng, radiusM, kategori, proAcik]);

  return (
    <Section
      title="Spatial Emsal Keşfi"
      icon={<CrosshairIcon className="h-3.5 w-3.5" />}
      accent="info"
    >
      {!proAcik ? (
        <PaywallKilit
          gerekliTier={lisans.yukseltGerekli("ai-fiyat") ?? "bireysel-pro"}
          ozellik="🎯 Spatial Emsal Keşfi"
          kompakt
        />
      ) : typeof lat !== "number" || typeof lng !== "number" ? (
        <div className="text-3xs italic text-slate-500 p-2">
          Parsel koordinatı yok — spatial keşif yapılamıyor.
        </div>
      ) : (
        <div className="space-y-2 p-2">
          {/* Radius segmented control */}
          <div className="flex gap-1">
            {RADIUS_SECENEKLERI.map((opt) => (
              <button
                key={opt.m}
                onClick={() => setRadiusM(opt.m)}
                className={
                  "flex-1 rounded px-2 py-1 text-2xs font-medium transition " +
                  (radiusM === opt.m
                    ? "bg-indigo-600 text-white shadow"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300")
                }
              >
                {opt.etiket}
              </button>
            ))}
          </div>

          {yukleniyor ? (
            <div className="text-3xs italic text-slate-500">
              Dexie'den koordinatlı ilanlar taranıyor…
            </div>
          ) : !sonuc || sonuc.emsaller.length === 0 ? (
            <div className="text-3xs italic text-slate-500">
              Bu yarıçapta koordinatlı emsal bulunamadı. Sahibinden/Hepsiemlak'ta
              parsel çevresindeki ilanları gezerek havuz büyütülebilir.
            </div>
          ) : (
            <>
              {/* Halka dağılımı */}
              <div className="grid grid-cols-4 gap-1 text-center">
                <HalkaKpi label="0-1 km" deger={sonuc.halkaDagilimi.r0_1km} />
                <HalkaKpi label="1-3 km" deger={sonuc.halkaDagilimi.r1_3km} />
                <HalkaKpi label="3-5 km" deger={sonuc.halkaDagilimi.r3_5km} />
                <HalkaKpi label="5-10 km" deger={sonuc.halkaDagilimi.r5_10km} />
              </div>

              {/* Baseline */}
              {sonuc.baseline != null && (
                <div className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1.5">
                  <div className="flex items-center gap-1.5 text-2xs text-indigo-900">
                    <LayersIcon className="h-3 w-3" />
                    <span className="font-semibold">Weighted median:</span>
                    <span className="font-bold tabular-nums">
                      ₺{sonuc.baseline.toLocaleString("tr-TR")}/m²
                    </span>
                  </div>
                  <div className="mt-0.5 text-3xs text-indigo-700">
                    {sonuc.emsaller.length} emsal · D={sonuc.D}m decay · outlier
                    elenen: {sonuc.outlierAdet}
                  </div>
                </div>
              )}

              <p className="text-3xs italic text-slate-500">
                Distance decay: w = exp(-d/D), kategori "{kategori}" için D={sonuc.D}m.
              </p>

              {/* Mini heatmap — 5×5 SVG grid */}
              <SpatialHeatmapMini
                parselLat={lat}
                parselLng={lng}
                sonuc={sonuc}
              />
            </>
          )}
        </div>
      )}
    </Section>
  );
}

function HalkaKpi({ label, deger }: { label: string; deger: number }) {
  const aktif = deger > 0;
  return (
    <div
      className={
        "rounded px-1 py-1 " +
        (aktif
          ? "bg-indigo-100 text-indigo-900"
          : "bg-slate-100 text-slate-400 dark:bg-slate-800")
      }
    >
      <div className="text-[8px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-2xs font-bold tabular-nums">{deger}</div>
    </div>
  );
}
