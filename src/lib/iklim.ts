/**
 * İklim verisi — Open-Meteo Climate API.
 *
 * Yıllık ortalama yağış, sıcaklık, nem değerleri. Tarımsal arsa
 * değerlemesinde kritik (sulu/kuru tarım kararları, tarım çeşidi).
 *
 * API: https://archive-api.open-meteo.com/v1/archive
 *   - Free, no API key
 *   - Lat/lng + tarih aralığı
 *   - Daily ortalama → bizim için 1-3 yıl ortalaması yeter
 *
 * Cache: bir lokasyon için yıllık ortalama yıl içinde değişmez,
 * 30 gün TTL ile cache'lenir.
 */

const ARCHIVE_BASE = "https://archive-api.open-meteo.com/v1/archive";

export type IklimSinifi =
  | "kurak"          // < 300 mm/yıl
  | "yari-kurak"     // 300-500 mm
  | "yari-nemli"     // 500-800 mm
  | "nemli"          // 800-1500 mm
  | "cok-nemli";     // > 1500 mm

export interface IklimVerisi {
  /** Yıllık toplam yağış (mm) — son 3 yıl ortalaması */
  yillikYagis: number;
  /** Yıllık ortalama sıcaklık (°C) */
  ortalamaSicaklik: number;
  /** En sıcak ay ortalama sıcaklık (°C) — yaz */
  maxAySicaklik: number;
  /** En soğuk ay ortalama sıcaklık (°C) — kış */
  minAySicaklik: number;
  /** Don günü sayısı (0°C altı gün/yıl) */
  donGunu: number;
  /** İklim sınıfı */
  sinif: IklimSinifi;
  /** Tarımsal yorum */
  tarimYorum: string;
  /** İnşaat/oturum yorumu */
  insaatYorum: string;
}

interface ArchiveDailyResponse {
  daily?: {
    time?: string[];
    precipitation_sum?: (number | null)[];
    temperature_2m_mean?: (number | null)[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
  };
  error?: boolean;
  reason?: string;
}

const CACHE = new Map<string, { data: IklimVerisi; fetchedAt: number }>();
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün

function cacheKey(lat: number, lng: number): string {
  // 0.1° quantize — ~11km — aynı bölgeyi tek seferde sorgular
  return `${lat.toFixed(1)}|${lng.toFixed(1)}`;
}

function siniflandir(yagis: number): IklimSinifi {
  if (yagis < 300) return "kurak";
  if (yagis < 500) return "yari-kurak";
  if (yagis < 800) return "yari-nemli";
  if (yagis < 1500) return "nemli";
  return "cok-nemli";
}

function tarimYorumu(sinif: IklimSinifi, ortSicaklik: number): string {
  const sicakNot = ortSicaklik > 18 ? "sıcak" : ortSicaklik > 12 ? "ılık" : "serin";
  switch (sinif) {
    case "kurak":
      return `${sicakNot} kurak iklim — sulamasız tarım zor; bağ/zeytin hayvancılığa elverişli`;
    case "yari-kurak":
      return `${sicakNot} yarı kurak — tahıl, baklagil, bağcılık + sulu sebzecilik için sulama gerek`;
    case "yari-nemli":
      return `${sicakNot} yarı nemli — geniş tarım ürün yelpazesi (tahıl/sebze/meyve)`;
    case "nemli":
      return `${sicakNot} nemli — sebze, meyve, fındık, çay üretimine elverişli`;
    case "cok-nemli":
      return `${sicakNot} çok nemli — çay, fındık, ormancılık; tarımsal çeşitlilik sınırlı`;
  }
}

function insaatYorumu(donGunu: number, maxSicaklik: number): string {
  const donlu = donGunu > 60 ? "yoğun donlu" : donGunu > 20 ? "donlu" : "az donlu";
  const sicak = maxSicaklik > 30 ? "yazları sıcak" : maxSicaklik > 25 ? "ılıman yaz" : "serin yaz";
  return `${donlu}, ${sicak} — yapı yalıtımı ve donma-çözülme döngüsüne dikkat`;
}

/**
 * Open-Meteo Archive'den son 3 yıl günlük veriyi çek, yıllık ortalamaları çıkar.
 */
export async function iklimVerisiGetir(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<IklimVerisi | null> {
  const key = cacheKey(lat, lng);
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return hit.data;
  }

  // Son 3 yılın aynı 12 aylık penceresi
  const bugun = new Date();
  const bitis = new Date(bugun.getFullYear() - 1, 11, 31); // geçen yıl son gün
  const baslangic = new Date(bitis.getFullYear() - 2, 0, 1); // 3 yıl önce ilk gün

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url = new URL(ARCHIVE_BASE);
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lng.toFixed(4));
  url.searchParams.set("start_date", fmt(baslangic));
  url.searchParams.set("end_date", fmt(bitis));
  url.searchParams.set(
    "daily",
    ["precipitation_sum", "temperature_2m_mean", "temperature_2m_max", "temperature_2m_min"].join(","),
  );
  url.searchParams.set("timezone", "Europe/Istanbul");

  try {
    const r = await fetch(url.toString(), { signal });
    if (!r.ok) return null;
    const data: ArchiveDailyResponse = await r.json();
    if (data.error || !data.daily) return null;
    const d = data.daily;

    const yagisTumu = (d.precipitation_sum ?? []).filter((v): v is number => typeof v === "number");
    const sicakTumu = (d.temperature_2m_mean ?? []).filter((v): v is number => typeof v === "number");
    const maxTumu = (d.temperature_2m_max ?? []).filter((v): v is number => typeof v === "number");
    const minTumu = (d.temperature_2m_min ?? []).filter((v): v is number => typeof v === "number");

    if (yagisTumu.length < 365) return null; // yetersiz veri

    const toplamYagis = yagisTumu.reduce((s, v) => s + v, 0);
    const yilSayisi = yagisTumu.length / 365;
    const yillikYagis = Math.round(toplamYagis / yilSayisi);

    const ortSicaklik =
      Math.round((sicakTumu.reduce((s, v) => s + v, 0) / sicakTumu.length) * 10) / 10;

    // En sıcak/soğuk ay — basit aylık gruplama
    const aylik: { ay: number; max: number; min: number }[] = [];
    for (let i = 0; i < 12; i++) aylik.push({ ay: i, max: 0, min: 100 });
    (d.time ?? []).forEach((t, i) => {
      const ay = new Date(t).getMonth();
      const mx = maxTumu[i];
      const mn = minTumu[i];
      if (typeof mx === "number" && mx > aylik[ay]!.max) aylik[ay]!.max = mx;
      if (typeof mn === "number" && mn < aylik[ay]!.min) aylik[ay]!.min = mn;
    });
    const maxAySicaklik = Math.max(...aylik.map((a) => a.max));
    const minAySicaklik = Math.min(...aylik.map((a) => a.min));

    // Don günü — 0°C altı dağı sayısı
    const donGunu = Math.round(
      minTumu.filter((v) => v < 0).length / yilSayisi,
    );

    const sinif = siniflandir(yillikYagis);

    const result: IklimVerisi = {
      yillikYagis,
      ortalamaSicaklik: ortSicaklik,
      maxAySicaklik,
      minAySicaklik,
      donGunu,
      sinif,
      tarimYorum: tarimYorumu(sinif, ortSicaklik),
      insaatYorum: insaatYorumu(donGunu, maxAySicaklik),
    };

    CACHE.set(key, { data: result, fetchedAt: Date.now() });
    return result;
  } catch {
    return null;
  }
}
