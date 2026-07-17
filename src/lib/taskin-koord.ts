/**
 * Koordinat bazlı taşkın/sel riski — Open-Meteo Flood API.
 *
 * Open-Meteo /v1/flood endpoint'i GloFAS (Global Flood Awareness System)
 * verilerini sunar. Türkiye koordinatları için çalışır, ücretsiz, API key gerektirmez.
 *
 * Kullanılan metrik:
 *   river_discharge (m³/s) — son 90 günlük max değer
 *   Eşikler (GloFAS dönem aşım olasılığı):
 *     > 500 m³/s → yüksek risk (büyük nehir/dere)
 *     > 100 m³/s → orta risk
 *     ≤ 100 m³/s → düşük risk (küçük dere veya uzak)
 *
 * Yedek: API erişilemezse il bazlı tablo (taskin-risk.ts) kullanılır.
 *
 * Cache: Dexie `taskinRiskCache` — 7 gün TTL
 * (sel riski mevsimsel, aylık güncelleme yeterli).
 */

import { db } from "./db";

export type TaskinKoordRisk = "yuksek" | "orta" | "dusuk";

export interface TaskinKoordSonuc {
  risk: TaskinKoordRisk;
  maxDebi: number | null;    // m³/s — son 90 günlük max
  not: string;
  kaynak: "open-meteo-glofas" | "il-tablo-fallback";
  fetchedAt: number;
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün

function cacheKey(lat: number, lng: number): string {
  // 0.1° ≈ 10 km hassasiyet — GloFAS grid çözünürlüğüyle uyumlu
  return `taskin|${lat.toFixed(1)}|${lng.toFixed(1)}`;
}

function debiToRisk(maxDebi: number): TaskinKoordRisk {
  if (maxDebi > 500) return "yuksek";
  if (maxDebi > 100) return "orta";
  return "dusuk";
}

function debiToNot(maxDebi: number, risk: TaskinKoordRisk): string {
  if (risk === "yuksek") {
    return `Yüksek nehir debisi (max ${Math.round(maxDebi)} m³/s son 90 günde). Taşkın riski yüksek.`;
  }
  if (risk === "orta") {
    return `Orta düzey debi (max ${Math.round(maxDebi)} m³/s son 90 günde). Mevsimsel taşkın olabilir.`;
  }
  return `Düşük debi (max ${Math.round(maxDebi)} m³/s son 90 günde). Taşkın riski düşük.`;
}

/**
 * Koordinat bazlı taşkın riski — Open-Meteo GloFAS.
 * Cache-first: 7 gün içinde aynı koordinat için sonuç varsa doğrudan döner.
 */
export async function taskinRiskKoordGetir(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<TaskinKoordSonuc | null> {
  if (!lat || !lng || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 35 || lat > 43 || lng < 25 || lng > 46) return null; // Türkiye dışı

  const key = cacheKey(lat, lng);

  // Dexie cache kontrolü
  try {
    const cached = await db.taskinRiskCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return {
        risk: cached.risk,
        maxDebi: cached.maxDebi,
        not: cached.not,
        kaynak: cached.kaynak,
        fetchedAt: cached.fetchedAt,
      };
    }
  } catch {
    // Cache yoksa veya hata varsa devam et
  }

  // Open-Meteo Flood API — son 90 günlük daily river_discharge
  const bugun = new Date();
  const baslangic = new Date(bugun.getTime() - 90 * 24 * 60 * 60 * 1000);
  const formatTarih = (d: Date) => d.toISOString().slice(0, 10);

  const url = new URL("https://flood-api.open-meteo.com/v1/flood");
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lng.toFixed(4));
  url.searchParams.set("daily", "river_discharge_max");
  url.searchParams.set("start_date", formatTarih(baslangic));
  url.searchParams.set("end_date", formatTarih(bugun));

  try {
    const res = await fetch(url.toString(), {
      signal,
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return null; // Caller il tablosuna fallback yapar
    }

    const data = await res.json() as {
      daily?: {
        river_discharge_max?: (number | null)[];
      };
    };

    const values = data.daily?.river_discharge_max ?? [];
    const gecerliDegerler = values.filter((v): v is number => v != null && Number.isFinite(v));

    if (gecerliDegerler.length === 0) return null;

    const maxDebi = Math.max(...gecerliDegerler);
    const risk = debiToRisk(maxDebi);
    const not = debiToNot(maxDebi, risk);

    const sonuc: TaskinKoordSonuc = {
      risk,
      maxDebi: Math.round(maxDebi * 10) / 10,
      not,
      kaynak: "open-meteo-glofas",
      fetchedAt: Date.now(),
    };

    // Cache'e yaz (hata durumunda sessizce geç)
    try {
      await db.taskinRiskCache.put({ key, ...sonuc });
    } catch {
      // Cache yazma hatası kritik değil
    }

    return sonuc;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return null;
    // Network hatası — caller fallback yapacak
    return null;
  }
}
