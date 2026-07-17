/**
 * Heyelan duyarlılık analizi — OpenLandMap + eğim tabanlı.
 *
 * İki kaynaktan birleşik skor:
 *
 * 1) OpenLandMap SoilGrids slope (%) — koordinat bazlı eğim.
 *    API: https://api.openlandmap.org/query/point
 *    Layer: "dtm_slope.percent_merit.dem_m_250m_s0..0cm_2018_v1.0.tif"
 *    Ücretsiz, API key yok.
 *
 * 2) Eğim değerine göre heyelan duyarlılık skoru (literatür tabanlı):
 *    slope < 5°  → çok düşük (düz arazi)
 *    5–15°       → düşük
 *    15–25°      → orta
 *    25–35°      → yüksek
 *    > 35°       → çok yüksek
 *
 * Cache: in-memory 30 gün TTL (slope nadiren değişir).
 *
 * NOT: AFAD ARAS resmi heyelan haritası API sunmuyor.
 * OpenLandMap slope verisi en iyi alternatif açık kaynak.
 */

export type HeyelanRisk = "cok-dusuk" | "dusuk" | "orta" | "yuksek" | "cok-yuksek";

export interface HeyelanVerisi {
  /** Eğim yüzdesi (%) */
  egimYuzde: number;
  /** Eğim derecesi (°) */
  egimDerece: number;
  /** Heyelan duyarlılık sınıfı */
  risk: HeyelanRisk;
  /** Kullanıcı notu */
  not: string;
  /** Veri kaynağı */
  kaynak: "openlandmap-slope" | "elevation-turev" | "fallback";
  /** Fiyat çarpanı (yüksek eğim → iskan güçlüğü) */
  fiyatCarpani: number;
}

const CACHE = new Map<string, { data: HeyelanVerisi; fetchedAt: number }>();
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)}|${lng.toFixed(2)}`;
}

function egimeGoreRisk(egimDerece: number): HeyelanRisk {
  if (egimDerece < 5) return "cok-dusuk";
  if (egimDerece < 15) return "dusuk";
  if (egimDerece < 25) return "orta";
  if (egimDerece < 35) return "yuksek";
  return "cok-yuksek";
}

function riskAciklama(risk: HeyelanRisk, egimDerece: number): string {
  switch (risk) {
    case "cok-dusuk":
      return `Düz arazi (eğim ${egimDerece.toFixed(1)}°) — heyelan riski ihmal edilebilir.`;
    case "dusuk":
      return `Hafif eğimli (${egimDerece.toFixed(1)}°) — heyelan riski düşük.`;
    case "orta":
      return `Orta eğimli (${egimDerece.toFixed(1)}°) — mevsimsel heyelan olabilir, zemin etüdü önerilen.`;
    case "yuksek":
      return `Dik arazi (${egimDerece.toFixed(1)}°) — heyelan duyarlılığı yüksek, yapılaşma kısıtlı.`;
    case "cok-yuksek":
      return `Çok dik arazi (${egimDerece.toFixed(1)}°) — yüksek heyelan riski, yapılaşma tehlikeli.`;
  }
}

function riskeFiyatCarpani(risk: HeyelanRisk): number {
  // Yüksek eğim iskan güçlüğü → inşaat maliyeti artar, arazi değeri düşer
  const map: Record<HeyelanRisk, number> = {
    "cok-dusuk": 1.02,  // Düz arazi prim
    "dusuk":     1.00,  // Nötr
    "orta":      0.97,  // Hafif iskonto
    "yuksek":    0.93,  // Belirgin iskonto
    "cok-yuksek": 0.88, // Ciddi iskonto
  };
  return map[risk];
}

/**
 * OpenLandMap slope API — MERIT DEM 250m çözünürlük.
 */
async function openlandmapSlopeGetir(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<number | null> {
  const url = new URL("https://api.openlandmap.org/query/point");
  url.searchParams.set("lon", lng.toFixed(6));
  url.searchParams.set("lat", lat.toFixed(6));
  url.searchParams.set("coll", "predicted");
  // MERIT DEM derived slope %
  url.searchParams.set("property", "dtm_slope.percent_merit.dem_m_250m_s0..0cm_2018_v1.0");
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString(), {
    signal,
    headers: { Accept: "application/json" },
  });

  if (!res.ok) return null;

  const data = await res.json() as {
    status?: string;
    response?: Array<{
      "dtm_slope.percent_merit.dem_m_250m_s0..0cm_2018_v1.0"?: string | number;
    }>;
  };

  if (data.status !== "OK" || !data.response?.length) return null;

  const raw = data.response[0]?.["dtm_slope.percent_merit.dem_m_250m_s0..0cm_2018_v1.0"];
  if (raw == null) return null;

  const val = Number(raw);
  return Number.isFinite(val) ? val : null;
}

/**
 * Koordinat bazlı heyelan duyarlılık analizi.
 * Cache-first: 30 gün içinde aynı lokasyon için sonuç varsa döner.
 */
export async function heyelanVerisiGetir(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<HeyelanVerisi | null> {
  if (!lat || !lng || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 35 || lat > 43 || lng < 25 || lng > 46) return null;

  const key = cacheKey(lat, lng);
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    // OpenLandMap slope % → degree dönüşümü: tan(slope°) = slope% / 100
    const slopePct = await openlandmapSlopeGetir(lat, lng, signal);

    if (slopePct != null && slopePct >= 0) {
      const egimDerece = Math.atan(slopePct / 100) * (180 / Math.PI);
      const risk = egimeGoreRisk(egimDerece);

      const sonuc: HeyelanVerisi = {
        egimYuzde: Math.round(slopePct * 10) / 10,
        egimDerece: Math.round(egimDerece * 10) / 10,
        risk,
        not: riskAciklama(risk, egimDerece),
        kaynak: "openlandmap-slope",
        fiyatCarpani: riskeFiyatCarpani(risk),
      };

      CACHE.set(key, { data: sonuc, fetchedAt: Date.now() });
      return sonuc;
    }

    return null;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return null;
    return null;
  }
}

/** Eğim açıklamasını renk sınıfına çevir */
export function heyelanRenk(risk: HeyelanRisk): {
  bg: string; border: string; text: string;
} {
  switch (risk) {
    case "cok-dusuk":
      return { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800" };
    case "dusuk":
      return { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700" };
    case "orta":
      return { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800" };
    case "yuksek":
      return { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-900" };
    case "cok-yuksek":
      return { bg: "bg-red-50", border: "border-red-300", text: "text-red-900" };
  }
}

export function heyelanRiskEtiket(risk: HeyelanRisk): string {
  switch (risk) {
    case "cok-dusuk": return "Çok Düşük";
    case "dusuk": return "Düşük";
    case "orta": return "Orta";
    case "yuksek": return "Yüksek";
    case "cok-yuksek": return "Çok Yüksek";
  }
}
