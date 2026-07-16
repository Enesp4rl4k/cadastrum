import { haversineM } from "./analiz";
import type { CevreAnalizi, YakinNoktaMesafesi } from "./osm";
import { HAVALIMANLARITÜMÜ } from "./data/havalimanları";
import { LIMANLAR } from "./data/limanlar";
import { OSBLAR } from "./data/osblar";
import { SERBEST_BOLGELER } from "./data/serbest-bolgeler";
import { LISANSLI_DEPOLAR } from "./data/lisansli-depolar";
import {
  OTOYOL_NOKTALARI,
  OTOYOL_GRID,
  OTOYOL_GRID_HUCRE_BOY,
} from "./data/otoyollar";

type StatikNokta = { ad: string; il: string; lat: number; lng: number };

/** Spatial grid lookup — parselin hücresi + 8 komşuyu tara, en yakın otoyol/trunk noktası bul.
 *  Boş dataset için no-op (script çalıştırılmamışsa). */
function enYakinOtoyol(
  parselLat: number,
  parselLng: number,
  tip: "motorway" | "trunk",
): { ad: string; mesafe: number; lat: number; lng: number } | null {
  if (OTOYOL_NOKTALARI.length === 0) return null;

  const cellLat = Math.floor(parselLat / OTOYOL_GRID_HUCRE_BOY);
  const cellLng = Math.floor(parselLng / OTOYOL_GRID_HUCRE_BOY);

  let enYakin: { ad: string; mesafe: number; lat: number; lng: number } | null = null;

  // 3x3 hücre tara — 30km'den uzaktaki otoyol bizim ilgi alanımız değil
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const key = `${cellLat + dy}_${cellLng + dx}`;
      const idxler = OTOYOL_GRID[key];
      if (!idxler) continue;
      for (const i of idxler) {
        const n = OTOYOL_NOKTALARI[i];
        if (!n || n.tip !== tip) continue;
        const m = haversineM(parselLat, parselLng, n.lat, n.lng);
        if (!enYakin || m < enYakin.mesafe) {
          enYakin = { ad: n.ad, mesafe: m, lat: n.lat, lng: n.lng };
        }
      }
    }
  }
  return enYakin;
}

/** Overpass sonucunu statik koordinat dataset'leriyle zenginleştir.
 *  Her tip için: statik veri daha yakınsa veya tip hiç yoksa ekle/güncelle.
 *  Overpass verisi her zaman öncelikli — sadece statik daha yakınsa override eder. */
export function statikLojistikZenginleştir(
  cevre: CevreAnalizi,
  parselLat: number,
  parselLng: number,
): CevreAnalizi {
  const enYakinlar = [...cevre.enYakinlar];

  function güncelleStatik(veri: readonly StatikNokta[], tip: string, ikon: string) {
    let enYakinStatik: { nokta: StatikNokta; mesafe: number } | null = null;
    for (const nokta of veri) {
      const m = haversineM(parselLat, parselLng, nokta.lat, nokta.lng);
      if (!enYakinStatik || m < enYakinStatik.mesafe)
        enYakinStatik = { nokta, mesafe: m };
    }
    if (!enYakinStatik) return;

    const mevcutIdx = enYakinlar.findIndex((y) => y.tip === tip);
    const mevcutMesafe = mevcutIdx >= 0 ? (enYakinlar[mevcutIdx]?.mesafeM ?? Infinity) : Infinity;

    if (enYakinStatik.mesafe < mevcutMesafe) {
      const yeni: YakinNoktaMesafesi = {
        tip,
        ad: `${enYakinStatik.nokta.ad} (${enYakinStatik.nokta.il})`,
        mesafeM: Math.round(enYakinStatik.mesafe),
        lat: enYakinStatik.nokta.lat,
        lng: enYakinStatik.nokta.lng,
        ikon,
      };
      if (mevcutIdx >= 0) enYakinlar[mevcutIdx] = yeni;
      else enYakinlar.push(yeni);
    }
  }

  güncelleStatik(HAVALIMANLARITÜMÜ, "airport", "✈️");
  güncelleStatik(LIMANLAR, "port", "⚓");
  güncelleStatik(OSBLAR, "osb", "🏭");
  güncelleStatik(SERBEST_BOLGELER, "serbest-bolge", "🏛️");
  güncelleStatik(LISANSLI_DEPOLAR, "lisansli-depo", "🌾");

  const otoyol = enYakinOtoyol(parselLat, parselLng, "motorway");
  if (otoyol) {
    const mevcutIdx = enYakinlar.findIndex((y) => y.tip === "motorway");
    const mevcutMesafe = mevcutIdx >= 0 ? (enYakinlar[mevcutIdx]?.mesafeM ?? Infinity) : Infinity;
    if (otoyol.mesafe < mevcutMesafe) {
      const yeni: YakinNoktaMesafesi = {
        tip: "motorway",
        ad: otoyol.ad,
        mesafeM: Math.round(otoyol.mesafe),
        lat: otoyol.lat,
        lng: otoyol.lng,
        ikon: "🛣️",
      };
      if (mevcutIdx >= 0) enYakinlar[mevcutIdx] = yeni;
      else enYakinlar.push(yeni);
    }
  }

  const trunk = enYakinOtoyol(parselLat, parselLng, "trunk");
  if (trunk) {
    const mevcutIdx = enYakinlar.findIndex((y) => y.tip === "trunk");
    const mevcutMesafe = mevcutIdx >= 0 ? (enYakinlar[mevcutIdx]?.mesafeM ?? Infinity) : Infinity;
    if (trunk.mesafe < mevcutMesafe) {
      const yeni: YakinNoktaMesafesi = {
        tip: "trunk",
        ad: trunk.ad,
        mesafeM: Math.round(trunk.mesafe),
        lat: trunk.lat,
        lng: trunk.lng,
        ikon: "🛤️",
      };
      if (mevcutIdx >= 0) enYakinlar[mevcutIdx] = yeni;
      else enYakinlar.push(yeni);
    }
  }

  enYakinlar.sort((a, b) => a.mesafeM - b.mesafeM);
  return { ...cevre, enYakinlar };
}
