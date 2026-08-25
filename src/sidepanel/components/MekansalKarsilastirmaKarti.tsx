/**
 * MekansalKarsilastirmaKarti — Spatial Neighborhood & Comparable Distribution Card
 *
 * Uses 2D SpatialGrid to analyze parcel surroundings across 1km, 3km, and 5km radius bands.
 * Shows comparable density, nearest infrastructure nodes, and neighborhood spatial liquidity.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Compass as CompassIcon,
  Layers as LayersIcon,
  MapPin as MapPinIcon,
  Building2 as BuildingIcon,
  TrendingUp as TrendingUpIcon,
  Radio as RadioIcon,
} from "lucide-react";
import type { Parsel } from "../../types/tkgm";
import { db, type IlanGozlem } from "../../lib/db";
import { SpatialGrid, haversineMesafe } from "../../lib/spatial/spatial-grid";
import { fmtTLM2 } from "../../lib/fiyat-tahmin";
import { Card, Section } from "../ui/Card";

interface Props {
  parsel: Parsel;
}

interface RadiusBandStats {
  band: "1 km" | "3 km" | "5 km";
  radiusM: number;
  adet: number;
  medyanTLM2: number | null;
  enYakinM: number | null;
}

export function MekansalKarsilastirmaKarti({ parsel }: Props) {
  const [loading, setLoading] = useState(true);
  const [emsaller, setEmsaller] = useState<IlanGozlem[]>([]);
  const [seciliBand, setSeciliBand] = useState<number>(3000);

  const { lat, lng } = parsel.merkezNokta;

  useEffect(() => {
    let iptal = false;
    setLoading(true);

    db.ilanGozlem
      .toArray()
      .then((tumIlanlar) => {
        if (iptal) return;
        const valid = tumIlanlar.filter(
          (i) => typeof i.lat === "number" && typeof i.lng === "number" && (i.fiyatPerM2 ?? 0) > 0
        );
        setEmsaller(valid);
      })
      .catch((err) => {
        console.warn("[MekansalKarsilastirma] Emsal yükleme hatası:", err);
      })
      .finally(() => {
        if (!iptal) setLoading(false);
      });

    return () => {
      iptal = true;
    };
  }, [lat, lng]);

  // SpatialGrid index oluştur ve halkaları hesapla
  const bandStats = useMemo<RadiusBandStats[]>(() => {
    if (!lat || !lng || emsaller.length === 0) {
      return [
        { band: "1 km", radiusM: 1000, adet: 0, medyanTLM2: null, enYakinM: null },
        { band: "3 km", radiusM: 3000, adet: 0, medyanTLM2: null, enYakinM: null },
        { band: "5 km", radiusM: 5000, adet: 0, medyanTLM2: null, enYakinM: null },
      ];
    }

    const grid = new SpatialGrid<IlanGozlem & { lat: number; lng: number }>(0.03);
    for (const emsal of emsaller) {
      if (typeof emsal.lat === "number" && typeof emsal.lng === "number") {
        grid.insert(emsal as IlanGozlem & { lat: number; lng: number });
      }
    }

    const bands: Array<{ band: "1 km" | "3 km" | "5 km"; radiusM: number }> = [
      { band: "1 km", radiusM: 1000 },
      { band: "3 km", radiusM: 3000 },
      { band: "5 km", radiusM: 5000 },
    ];

    return bands.map(({ band, radiusM }) => {
      const radial = grid.queryRadius(lat, lng, radiusM);
      const adet = radial.length;

      if (adet === 0) {
        return { band, radiusM, adet: 0, medyanTLM2: null, enYakinM: null };
      }

      const fiyatlar = radial
        .map((r) => r.item.fiyatPerM2)
        .filter((f): f is number => typeof f === "number" && f > 0)
        .sort((a, b) => a - b);

      const medyan =
        fiyatlar.length > 0
          ? fiyatlar[Math.floor(fiyatlar.length / 2)]!
          : null;

      const enYakinM = radial[0]?.mesafeM ?? null;

      return {
        band,
        radiusM,
        adet,
        medyanTLM2: medyan,
        enYakinM,
      };
    });
  }, [lat, lng, emsaller]);

  const toplam5kmEmsal = bandStats[2]?.adet ?? 0;
  const likiditeSeviyesi =
    toplam5kmEmsal >= 20 ? "Yüksek" : toplam5kmEmsal >= 5 ? "Orta" : "Düşük (Seyrek)";

  const likiditeRenk =
    toplam5kmEmsal >= 20
      ? "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
      : toplam5kmEmsal >= 5
        ? "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
        : "text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800";

  return (
    <Card className="overflow-hidden border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
            <CompassIcon className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Mekansal Çevre & Emsal Dağılımı
          </span>
        </div>
        <span
          className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${likiditeRenk}`}
        >
          {likiditeSeviyesi} Likidite
        </span>
      </div>

      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
        Parsel merkezli 2D spatial grid taraması ile 1km, 3km ve 5km halkalarındaki gerçek piyasa emsal yoğunluğu ve fiyat eğilimleri.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-4 text-xs text-slate-400 animate-pulse">
          Mekansal grid taranıyor…
        </div>
      ) : (
        <div className="space-y-2">
          {/* Yarıçap Dağılım Grid'i */}
          <div className="grid grid-cols-3 gap-1.5">
            {bandStats.map((st) => (
              <button
                key={st.band}
                type="button"
                onClick={() => setSeciliBand(st.radiusM)}
                className={`flex flex-col items-center justify-center rounded-lg border p-2 text-center transition-all ${
                  seciliBand === st.radiusM
                    ? "border-blue-500 bg-blue-50/50 dark:border-blue-600 dark:bg-blue-950/30"
                    : "border-slate-100 bg-slate-50/70 hover:bg-slate-100/70 dark:border-slate-800 dark:bg-slate-800/40"
                }`}
              >
                <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                  <RadioIcon className="h-2.5 w-2.5 text-blue-500" />
                  {st.band}
                </div>
                <div className="mt-1 text-xs font-bold text-slate-800 dark:text-slate-100">
                  {st.adet > 0 ? `${st.adet} Emsal` : "—"}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {st.medyanTLM2 ? fmtTLM2(st.medyanTLM2) : "Veri yok"}
                </div>
              </button>
            ))}
          </div>

          {/* Çevre Konum Özeti */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-800/30 dark:text-slate-300 space-y-1">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-slate-500">
                <MapPinIcon className="h-3 w-3 text-slate-400" />
                En yakın emsal mesafesi:
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                {bandStats[0]?.enYakinM != null
                  ? `${bandStats[0].enYakinM} m`
                  : bandStats[1]?.enYakinM != null
                    ? `${bandStats[1].enYakinM} m`
                    : bandStats[2]?.enYakinM != null
                      ? `${bandStats[2].enYakinM} m`
                      : "5 km içinde ilan yok"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-slate-500">
                <LayersIcon className="h-3 w-3 text-slate-400" />
                5 km çapındaki toplam ilan:
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                {toplam5kmEmsal} ilan
              </span>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
