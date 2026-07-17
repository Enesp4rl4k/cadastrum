import { haversineM } from "./analiz";
import type { LatLng } from "../types/tkgm";

// Open-Elevation öldü — Open-Meteo Elevation kullanıyoruz (free, no key, batch)
// https://api.open-meteo.com/v1/elevation?latitude=A,B&longitude=C,D → {elevation:[h1,h2]}
const ELEVATION_API = "https://api.open-meteo.com/v1/elevation";

async function proxyFetch(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal } = {},
): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    signal: init.signal,
  });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

export interface EgimAnalizi {
  merkezYukseklikM: number;
  ortEgimYuzde: number; // ortalama yüzde eğim (vertical/horizontal × 100)
  maxEgimYuzde: number;
  egimKategori: "duz" | "hafif" | "orta" | "dik" | "cok-dik";
  egimNotu: string;
  bakiYonu: string; // 'Güney' / 'Kuzey' / 'Karışık' — güneşlenme açısı için
}

interface ElevPoint {
  lat: number;
  lng: number;
  elev?: number;
}

export async function egimAnaliziGetir(
  merkez: LatLng,
  kose1: LatLng,
  kose2: LatLng,
  kose3: LatLng,
  kose4: LatLng,
  signal?: AbortSignal,
): Promise<EgimAnalizi> {
  // [0,0] koordinatlar (MultiPolygon / eksik veri) veya merkez ile aynı olan
  // köşeleri filtrele — API'ye anlamsız tekrar nokta gönderme, eğim hesabı bozulur.
  const gecerliKose = (p: LatLng): boolean =>
    p.lat !== 0 && p.lng !== 0 && !(p.lat === merkez.lat && p.lng === merkez.lng);

  const koseler = [kose1, kose2, kose3, kose4].filter(gecerliKose);

  // Geçerli köşe yoksa sadece merkez yüksekliğini çek, eğim = 0
  const points: ElevPoint[] = [
    { lat: merkez.lat, lng: merkez.lng },
    ...koseler.map((p) => ({ lat: p.lat, lng: p.lng })),
  ];

  const lats = points.map((p) => p.lat).join(",");
  const lngs = points.map((p) => p.lng).join(",");
  const url = `${ELEVATION_API}?latitude=${lats}&longitude=${lngs}`;

  const result = await proxyFetch(url, { signal });
  if (!result.ok) {
    throw new Error(`Yükseklik servisi (Open-Meteo) HTTP ${result.status}`);
  }
  const data = JSON.parse(result.text) as { elevation?: number[] };
  const elevations = data.elevation ?? [];

  for (let i = 0; i < points.length; i++) {
    const elev = elevations[i];
    const p = points[i];
    if (typeof elev === "number" && p) p.elev = elev;
  }

  const merkezElev = points[0]?.elev ?? 0;
  const koseElevs = points.slice(1);

  // Her köşe ile merkez arası eğim yüzdesi
  const egimler: number[] = [];
  for (const p of koseElevs) {
    if (p.elev == null) continue;
    const yatay = haversineM(merkez.lat, merkez.lng, p.lat, p.lng);
    if (yatay < 1) continue;
    const dikey = Math.abs(p.elev - merkezElev);
    egimler.push((dikey / yatay) * 100);
  }

  const ortEgim = egimler.length
    ? egimler.reduce((a, b) => a + b, 0) / egimler.length
    : 0;
  const maxEgim = egimler.length ? Math.max(...egimler) : 0;

  let kategori: EgimAnalizi["egimKategori"];
  let not: string;
  if (ortEgim < 2) {
    kategori = "duz";
    not = "Düz arazi — inşaat hazırlığı düşük maliyet.";
  } else if (ortEgim < 5) {
    kategori = "hafif";
    not = "Hafif eğim — temel/yol için ek tedbir gerekebilir.";
  } else if (ortEgim < 10) {
    kategori = "orta";
    not = "Orta eğim — istinat duvarı / kat-eğim çözümü düşün.";
  } else if (ortEgim < 20) {
    kategori = "dik";
    not = "Dik arazi — inşaat maliyeti %20-40 artar.";
  } else {
    kategori = "cok-dik";
    not = "Çok dik — yapılaşma genelde ekonomik değil, teraslama gerekir.";
  }

  // Bakı yönü — kuzey vs güney köşelerin yükseklik ortalaması
  const merkez0 = merkezElev;
  const kuzeyAvg = avg(
    koseElevs.filter((p) => p.lat > merkez.lat).map((p) => p.elev ?? merkez0),
  );
  const guneyAvg = avg(
    koseElevs.filter((p) => p.lat < merkez.lat).map((p) => p.elev ?? merkez0),
  );
  let baki: string;
  const fark = kuzeyAvg - guneyAvg;
  if (Math.abs(fark) < 1) baki = "Karışık (düz)";
  else if (fark > 0)
    baki = "Güney bakılı (güneşlenme +, ısınma maliyeti −)";
  else baki = "Kuzey bakılı (güneşlenme −, yaz serinliği +)";

  return {
    merkezYukseklikM: Math.round(merkezElev),
    ortEgimYuzde: Math.round(ortEgim * 10) / 10,
    maxEgimYuzde: Math.round(maxEgim * 10) / 10,
    egimKategori: kategori,
    egimNotu: not,
    bakiYonu: baki,
  };
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
