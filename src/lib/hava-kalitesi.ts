/**
 * Hava kalitesi analizi — Copernicus Atmosphere Monitoring Service (CAMS).
 *
 * Koordinat bazlı yıllık ortalama hava kirliliği değerleri:
 *   - PM2.5 (µg/m³) — ince partikül madde, sağlık etkisi en yüksek
 *   - NO2  (µg/m³) — azot dioksit, trafik kaynaklı
 *   - O3   (µg/m³) — ozon, fotokimyasal
 *
 * Endpoint: Open-Meteo Air Quality API (CAMS üzerine kurulu, ücretsiz)
 *   https://air-quality-api.open-meteo.com/v1/air-quality
 *
 * WHY: Konut/arsa değerlemesinde hava kalitesi giderek daha önemli.
 *   - PM2.5 WHO limiti: 5 µg/m³ (günlük 15 µg/m³)
 *   - Türkiye büyük şehirleri: 15-40 µg/m³ arası
 *   - Temiz hava premium: kıyı/ormanlık vs sanayi bölgesi 5-10% fark
 *
 * Cache: Dexie `havaKalitesiCache` — 7 gün TTL
 * (Hava kalitesi mevsimsel; haftalık güncelleme yeterli)
 */

import { db } from "./db";

// ─── Tipler ──────────────────────────────────────────────────────────────────

export type HavaKalitesiKategori =
  | "temiz"      // PM2.5 < 10 µg/m³ — WHO hedefi civarı
  | "orta"       // PM2.5 10-25 µg/m³ — kabul edilebilir
  | "kirli"      // PM2.5 25-50 µg/m³ — hassas gruplar için riskli
  | "cok-kirli"  // PM2.5 > 50 µg/m³ — genel sağlık riski
  | "bilinmiyor";

export interface HavaKalitesiSonuc {
  /** Yıllık ortalama PM2.5 (µg/m³) */
  pm25Yillik: number | null;
  /** Yıllık ortalama NO2 (µg/m³) */
  no2Yillik: number | null;
  /** Yıllık ortalama O3 (µg/m³) */
  o3Yillik: number | null;
  /** AQI benzeri 0-500 skala */
  aqi: number | null;
  /** Hesaplanan kategori */
  kategori: HavaKalitesiKategori;
  /** Açıklama */
  aciklama: string;
  /** Veri kaynağı */
  kaynak: "open-meteo-cams" | "cache" | "bilinmiyor";
  fetchedAt: number;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün

function cacheKey(lat: number, lng: number): string {
  // 0.1° ≈ 10 km — CAMS model grid çözünürlüğüyle uyumlu
  return `hava|${lat.toFixed(1)}|${lng.toFixed(1)}`;
}

// ─── Hesaplama yardımcıları ───────────────────────────────────────────────────

/** PM2.5 → AQI hesapla (US EPA breakpoints, Türkiye için yaklaşım) */
function pm25ToAqi(pm25: number): number {
  // EPA 24-saat breakpoints → yıllık ortalama için yukarı ölçekle (~2x)
  const yillikFactor = 0.6; // yıllık ortalama genellikle günlük peak'in ~60%
  const adjusted = pm25 / yillikFactor;

  if (adjusted <= 12)    return Math.round((adjusted / 12) * 50);
  if (adjusted <= 35.4)  return Math.round(50 + ((adjusted - 12) / 23.4) * 50);
  if (adjusted <= 55.4)  return Math.round(100 + ((adjusted - 35.4) / 20) * 50);
  if (adjusted <= 150.4) return Math.round(150 + ((adjusted - 55.4) / 95) * 50);
  if (adjusted <= 250.4) return Math.round(200 + ((adjusted - 150.4) / 100) * 100);
  return Math.min(500, Math.round(300 + ((adjusted - 250.4) / 149.6) * 200));
}

/** PM2.5 → HavaKalitesiKategori */
function pm25KategoriGetir(pm25: number): HavaKalitesiKategori {
  if (pm25 < 10)  return "temiz";
  if (pm25 < 25)  return "orta";
  if (pm25 < 50)  return "kirli";
  return "cok-kirli";
}

/** Kategori → açıklama */
function kategoriAciklama(
  kategori: HavaKalitesiKategori,
  pm25: number | null,
): string {
  const pm25Str = pm25 != null ? ` (PM2.5: ${pm25.toFixed(1)} µg/m³)` : "";
  switch (kategori) {
    case "temiz":
      return `Temiz hava${pm25Str} — WHO hedefine yakın`;
    case "orta":
      return `Orta hava kalitesi${pm25Str} — kabul edilebilir, hassas gruplar dikkatli olmalı`;
    case "kirli":
      return `Kirli hava${pm25Str} — hassas gruplar için riskli`;
    case "cok-kirli":
      return `Çok kirli hava${pm25Str} — genel sağlık riski`;
    default:
      return "Hava kalitesi verisi alınamadı";
  }
}

// ─── API çağrısı ──────────────────────────────────────────────────────────────

/**
 * Open-Meteo Air Quality API — son 1 yılın ortalamasını hesapla.
 * Ücretsiz, API key gerektirmez.
 */
async function openMeteoCamsSorgula(
  lat: number,
  lng: number,
): Promise<{ pm25: number; no2: number; o3: number } | null> {
  // Son 365 günlük veri çek
  const bugun = new Date();
  const birYilOnce = new Date(bugun);
  birYilOnce.setFullYear(bugun.getFullYear() - 1);

  const format = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lng.toFixed(4));
  url.searchParams.set("hourly", "pm2_5,nitrogen_dioxide,ozone");
  url.searchParams.set("start_date", format(birYilOnce));
  url.searchParams.set("end_date", format(bugun));
  url.searchParams.set("timezone", "Europe/Istanbul");

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(12000),
    headers: { "Accept": "application/json" },
  });

  if (!res.ok) return null;

  const json = await res.json() as {
    hourly?: {
      pm2_5?: (number | null)[];
      nitrogen_dioxide?: (number | null)[];
      ozone?: (number | null)[];
    };
  };

  const hourly = json?.hourly;
  if (!hourly) return null;

  const ortalama = (dizi: (number | null)[] | undefined): number | null => {
    if (!dizi?.length) return null;
    const gecerli = dizi.filter((v): v is number => v != null && isFinite(v));
    if (gecerli.length === 0) return null;
    return gecerli.reduce((a, b) => a + b, 0) / gecerli.length;
  };

  const pm25 = ortalama(hourly.pm2_5);
  const no2  = ortalama(hourly.nitrogen_dioxide);
  const o3   = ortalama(hourly.ozone);

  if (pm25 == null) return null;

  return {
    pm25: Math.round(pm25 * 10) / 10,
    no2:  no2  != null ? Math.round(no2 * 10) / 10  : 0,
    o3:   o3   != null ? Math.round(o3 * 10) / 10   : 0,
  };
}

// ─── Ana API ─────────────────────────────────────────────────────────────────

/**
 * Koordinat bazlı yıllık ortalama hava kalitesi.
 * Cache-first: 7 gün içinde aynı koordinat için sonuç varsa döner.
 *
 * @param lat Enlem
 * @param lng Boylam
 */
export async function havaKalitesiGetir(
  lat: number,
  lng: number,
): Promise<HavaKalitesiSonuc> {
  const key = cacheKey(lat, lng);

  // Cache kontrolü
  try {
    const cached = await db.havaKalitesiCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return {
        pm25Yillik: cached.pm25Yillik,
        no2Yillik:  cached.no2Yillik,
        o3Yillik:   cached.o3Yillik,
        aqi:        cached.aqi,
        kategori:   cached.kategori,
        aciklama:   cached.aciklama,
        kaynak:     "cache",
        fetchedAt:  cached.fetchedAt,
      };
    }
  } catch {
    // Cache erişim hatası — devam et
  }

  // API çağrısı
  try {
    const veri = await openMeteoCamsSorgula(lat, lng);

    if (veri) {
      const kategori = pm25KategoriGetir(veri.pm25);
      const aqi = pm25ToAqi(veri.pm25);
      const aciklama = kategoriAciklama(kategori, veri.pm25);

      const sonuc: HavaKalitesiSonuc = {
        pm25Yillik: veri.pm25,
        no2Yillik:  veri.no2,
        o3Yillik:   veri.o3,
        aqi,
        kategori,
        aciklama,
        kaynak: "open-meteo-cams",
        fetchedAt: Date.now(),
      };

      // Cache'e yaz
      try {
        await db.havaKalitesiCache.put({
          key,
          pm25Yillik: veri.pm25,
          no2Yillik:  veri.no2,
          o3Yillik:   veri.o3,
          aqi,
          kategori,
          aciklama,
          fetchedAt: Date.now(),
        });
      } catch {
        // Cache yazma hatası — sessizce devam
      }

      return sonuc;
    }
  } catch {
    // API hatası — bilinmiyor döndür
  }

  return {
    pm25Yillik: null,
    no2Yillik:  null,
    o3Yillik:   null,
    aqi:        null,
    kategori:   "bilinmiyor",
    aciklama:   "Hava kalitesi verisi alınamadı",
    kaynak:     "bilinmiyor",
    fetchedAt:  Date.now(),
  };
}

// ─── Fiyat çarpanı ───────────────────────────────────────────────────────────

/**
 * Hava kalitesi fiyat çarpanı.
 *
 * Temiz hava → konut/yaşam kalitesi premium
 * Kirli hava → değer düşüşü (özellikle konut imarlı arsalar için)
 *
 * NOT: Arsa/tarla için hava kalitesi etkisi konuttan daha az.
 * Konut imarlı → tam çarpan; tarla → yarı çarpan.
 *
 * @param kategori  Hava kalitesi kategorisi
 * @param imarliMi  Konut imarlı parsel mi? (daha hassas)
 */
export function havaKalitesiCarpani(
  kategori: HavaKalitesiKategori,
  imarliMi: boolean = false,
): { carpan: number; aciklama: string } {
  if (kategori === "bilinmiyor") {
    return { carpan: 1.0, aciklama: "Hava kalitesi bilinmiyor — çarpan uygulanmadı" };
  }

  const tamCarpanlar: Record<HavaKalitesiKategori, number> = {
    "temiz":      1.04,   // +%4 temiz hava premium
    "orta":       1.00,   // referans
    "kirli":      0.96,   // -%4 kirlilik iskontosu
    "cok-kirli":  0.92,   // -%8 ciddi kirlilik
    "bilinmiyor": 1.00,
  };

  const tamCarpan = tamCarpanlar[kategori];
  // İmarsız arsa/tarla için etki yarıya indirilir
  const carpan = imarliMi
    ? tamCarpan
    : 1 + (tamCarpan - 1) * 0.5;

  const rounded = Math.round(carpan * 1000) / 1000;
  const aciklamaMap: Record<HavaKalitesiKategori, string> = {
    "temiz":      `Temiz hava bölgesi — yaşam kalitesi primiyle çarpan ×${rounded.toFixed(3)}`,
    "orta":       "Orta hava kalitesi — çarpan uygulanmadı",
    "kirli":      `Kirli hava bölgesi — değer iskontosu çarpan ×${rounded.toFixed(3)}`,
    "cok-kirli":  `Çok kirli hava — ciddi değer iskontosu çarpan ×${rounded.toFixed(3)}`,
    "bilinmiyor": "Bilinmiyor",
  };

  return { carpan: rounded, aciklama: aciklamaMap[kategori] };
}
