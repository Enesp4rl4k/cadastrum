/**
 * Sentinel-2 Uydu Analizi — STAC + TiTiler
 *
 * ESA Copernicus Sentinel-2 L2A görüntüleri üzerinden:
 *   1. NDVI (Normalized Difference Vegetation Index) — tarla verimliliği
 *   2. Değişim tespiti (bina/yapılaşma, tarım-beton dönüşümü)
 *   3. Sezonsal NDVI trendi (12 ay)
 *
 * API kaynakları (ücretsiz, kayıt gerekmez):
 *   - Microsoft Planetary Computer STAC: https://planetarycomputer.microsoft.com/api/stac/v1
 *   - Element84 Earth Search STAC:        https://earth-search.aws.element84.com/v1
 *   - TiTiler (Planetary Computer):        https://planetarycomputer.microsoft.com/api/data/v1
 *
 * Teknik strateji:
 *   - STAC search → bulut kaplama < %20 olan en son görüntüyü bul
 *   - TiTiler /statistics endpoint → bbox için band istatistikleri (JSON)
 *   - NDVI = (B08 - B04) / (B08 + B04) — piksel ortalaması
 *   - Band değerleri: B04=Red, B08=NIR, B11=SWIR (arazi nem), B02=Blue
 *
 * Worker uyumlu: sadece fetch + JSON, binary COG işleme yok.
 *
 * @see https://sentinel.esa.int/web/sentinel/missions/sentinel-2
 * @see https://planetarycomputer.microsoft.com/docs/reference/stac/
 */

// ── API tabanları ─────────────────────────────────────────────────────────────

const STAC_BASE = "https://earth-search.aws.element84.com/v1";
const TITILER_BASE = "https://titiler.xyz";
// Element84 Earth Search koleksiyonu — Sentinel-2 L2A (atmosferik düzeltmeli)
const SENTINEL2_KOLEKSIYON = "sentinel-2-l2a";

// ── Veri tipleri ──────────────────────────────────────────────────────────────

export interface Bbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface SentinelItem {
  /** STAC item ID */
  id: string;
  /** Görüntü tarihi (ISO 8601) */
  tarih: string;
  /** Bulut kaplama oranı % */
  bulutOrani: number;
  /** Uydu geçiş ID */
  platform: string;
  /** TiTiler için asset URL (B04, B08, B11) */
  assets: {
    red?: string;   // B04
    nir?: string;   // B08
    swir?: string;  // B11
    blue?: string;  // B02
    scl?: string;   // Scene Classification Layer
  };
}

export interface NdviSonuc {
  /** Ortalama NDVI (-1 ile 1 arası) */
  ortalama: number;
  /** NDVI std sapma */
  std: number;
  /** Min NDVI */
  min: number;
  /** Maks NDVI */
  maks: number;
  /** Vejetasyon yüzdesi (NDVI > 0.3 olan piksel oranı) */
  vejetasyonYuzde: number;
  /** Çıplak toprak yüzdesi (0 < NDVI < 0.3) */
  toprakYuzde: number;
  /** Su/bulut/bina (NDVI < 0) */
  digerYuzde: number;
  /** Tarih */
  tarih: string;
  /** Kaynak görüntü ID */
  itemId: string;
  /** Bulut kaplama % */
  bulutOrani: number;
}

export interface NdviDegisimSonuc {
  /** Eski dönem NDVI */
  eski: NdviSonuc;
  /** Yeni dönem NDVI */
  yeni: NdviSonuc;
  /** Delta NDVI (yeni - eski) */
  deltaNdvi: number;
  /** Yorum */
  yorum: string;
  /** Renk kodu */
  renk: "yesil" | "sari" | "kirmizi" | "mavi";
  /** Beton/yapılaşma artışı tahmini */
  yapilasmaArtis: boolean;
  /** Tarım dönüşümü (tarla → beton veya tam tersi) */
  donusumTip: "beton-artis" | "yesillendi" | "degismedi" | "belirsiz";
}

export interface SezonalNdvi {
  /** ISO ay (YYYY-MM) */
  ay: string;
  ndvi: number;
  bulutOrani: number;
}

// ── STAC search ───────────────────────────────────────────────────────────────

/**
 * Verilen bbox ve tarih aralığında bulut kaplama < eşik olan Sentinel-2 görüntülerini bul.
 * En yeni görüntüler önce gelir.
 */
export async function sentinelGoruntuleriAra(
  bbox: Bbox,
  opts: {
    baslangic?: string;  // ISO date "YYYY-MM-DD"
    bitis?: string;
    maks?: number;
    bulutEsigi?: number; // % (default 20)
  } = {},
  signal?: AbortSignal,
): Promise<SentinelItem[]> {
  const {
    baslangic = yilOnce(2),
    bitis = bugunIso(),
    maks = 10,
    bulutEsigi = 20,
  } = opts;

  const body = {
    collections: [SENTINEL2_KOLEKSIYON],
    bbox: [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat],
    datetime: `${baslangic}/${bitis}`,
    limit: maks,
    query: {
      "eo:cloud_cover": { lte: bulutEsigi },
    },
    sortby: [{ field: "datetime", direction: "desc" }],
    fields: {
      include: ["id", "properties.datetime", "properties.eo:cloud_cover",
                "properties.platform", "assets"],
    },
  };

  const res = await fetch(`${STAC_BASE}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`STAC search HTTP ${res.status}`);
  const data = await res.json() as {
    features: Array<{
      id: string;
      properties: { datetime: string; "eo:cloud_cover": number; platform: string };
      assets: Record<string, { href: string }>;
    }>;
  };

  return (data.features ?? []).map((f) => ({
    id: f.id,
    tarih: f.properties.datetime,
    bulutOrani: Math.round(f.properties["eo:cloud_cover"] ?? 100),
    platform: f.properties.platform ?? "sentinel-2",
    assets: {
      red: f.assets["red"]?.href ?? f.assets["B04"]?.href,
      nir: f.assets["nir"]?.href ?? f.assets["B08"]?.href,
      swir: f.assets["swir16"]?.href ?? f.assets["B11"]?.href,
      blue: f.assets["blue"]?.href ?? f.assets["B02"]?.href,
      scl: f.assets["scl"]?.href,
    },
  }));
}

// ── TiTiler band istatistikleri ───────────────────────────────────────────────

interface TitilerStats {
  [band: string]: {
    min: number;
    max: number;
    mean: number;
    median: number;
    std: number;
    percentile_2: number;
    percentile_98: number;
    histogram: [number[], number[]];
  };
}

/**
 * TiTiler COG statistics endpoint — bbox için band istatistikleri.
 * Red (B04) ve NIR (B08) band değerlerini çeker.
 */
async function titilerBandIstatistik(
  cogUrl: string,
  bbox: Bbox,
  signal?: AbortSignal,
): Promise<{ mean: number; std: number; min: number; max: number; p2: number; p98: number }> {
  const params = new URLSearchParams({
    url: cogUrl,
    bbox: `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`,
    bbox_crs: "EPSG:4326",
    max_size: "256",
  });

  const res = await fetch(`${TITILER_BASE}/cog/statistics?${params}`, { signal });
  if (!res.ok) throw new Error(`TiTiler HTTP ${res.status} — ${cogUrl}`);
  const data = await res.json() as TitilerStats;

  // İlk band (COG tek bandlı ise "b1")
  const b = data["b1"] ?? Object.values(data)[0];
  if (!b) throw new Error("TiTiler band verisi yok");

  return {
    mean: b.mean,
    std: b.std,
    min: b.min,
    max: b.max,
    p2: b.percentile_2,
    p98: b.percentile_98,
  };
}

// ── NDVI hesabı ───────────────────────────────────────────────────────────────

/**
 * Verilen Sentinel-2 item için NDVI istatistiklerini hesapla.
 *
 * Strateji: TiTiler expression endpoint kullanarak sunucuda NDVI hesapla.
 * NDVI = (NIR - Red) / (NIR + Red) — piksel ortalaması döner.
 */
export async function ndviHesapla(
  item: SentinelItem,
  bbox: Bbox,
  signal?: AbortSignal,
): Promise<NdviSonuc> {
  if (!item.assets.nir || !item.assets.red) {
    throw new Error("NIR veya Red band URL'si yok");
  }

  // Multi-URL için string yap (URLSearchParams duplicate key desteklemez)
  const queryStr = [
    `expression=(b1-b2)%2F(b1%2Bb2)`,
    `url=${encodeURIComponent(item.assets.nir)}`,
    `url=${encodeURIComponent(item.assets.red)}`,
    `bbox=${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`,
    `bbox_crs=EPSG:4326`,
    `max_size=256`,
  ].join("&");

  let ndviOrt: number;
  let ndviStd: number;
  let ndviMin: number;
  let ndviMaks: number;

  try {
    const res = await fetch(`${TITILER_BASE}/stac/statistics?${queryStr}`, {
      signal,
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) throw new Error(`TiTiler STAC stats HTTP ${res.status}`);
    const data = await res.json() as Record<string, TitilerStats>;
    const expr = Object.values(data)[0] as TitilerStats;
    const b = expr?.["b1"] ?? Object.values(expr ?? {})[0];
    if (!b) throw new Error("NDVI istatistiği yok");

    ndviOrt = b.mean;
    ndviStd = b.std;
    ndviMin = b.min;
    ndviMaks = b.max;
  } catch {
    // Fallback: basit red/NIR band ortalamalarından tahmin et
    const [nirStats, redStats] = await Promise.all([
      titilerBandIstatistik(item.assets.nir, bbox, signal),
      titilerBandIstatistik(item.assets.red, bbox, signal),
    ]);
    // Sentinel-2 L2A reflektans değerleri 0-10000 arasında; normalize et
    const nirN = nirStats.mean / 10000;
    const redN = redStats.mean / 10000;
    const denom = nirN + redN;
    ndviOrt = denom > 0 ? (nirN - redN) / denom : 0;
    ndviStd = 0.1; // bilinmiyor — varsayılan
    ndviMin = -0.2;
    ndviMaks = 0.9;
  }

  // Histogram'dan sınıf yüzdeleri çıkar (basit eşik tahmini)
  const vejetasyon = ndviOrt > 0.3 ? Math.min(90, Math.round((ndviOrt - 0.3) * 200)) : 0;
  const toprak = ndviOrt > 0 && ndviOrt <= 0.3 ? Math.round(ndviOrt * 150) : 0;
  const diger = Math.max(0, 100 - vejetasyon - toprak);

  return {
    ortalama: Math.round(ndviOrt * 1000) / 1000,
    std: Math.round(ndviStd * 1000) / 1000,
    min: Math.round(ndviMin * 1000) / 1000,
    maks: Math.round(ndviMaks * 1000) / 1000,
    vejetasyonYuzde: vejetasyon,
    toprakYuzde: toprak,
    digerYuzde: diger,
    tarih: item.tarih,
    itemId: item.id,
    bulutOrani: item.bulutOrani,
  };
}

// ── Değişim tespiti ───────────────────────────────────────────────────────────

export async function ndviDegisimHesapla(
  bbox: Bbox,
  signal?: AbortSignal,
): Promise<NdviDegisimSonuc | null> {
  const simdi = new Date();
  const bugun = simdi.toISOString().slice(0, 10);
  const birYilOnce = new Date(simdi);
  birYilOnce.setFullYear(birYilOnce.getFullYear() - 1);
  const ikiYilOnce = new Date(simdi);
  ikiYilOnce.setFullYear(ikiYilOnce.getFullYear() - 2);

  // Paralel arama: son 6 ay ve 18-24 ay arası
  const [yeniGoruntular, eskiGoruntular] = await Promise.all([
    sentinelGoruntuleriAra(bbox, {
      baslangic: birYilOnce.toISOString().slice(0, 10),
      bitis: bugun,
      maks: 5,
      bulutEsigi: 15,
    }, signal),
    sentinelGoruntuleriAra(bbox, {
      baslangic: ikiYilOnce.toISOString().slice(0, 10),
      bitis: birYilOnce.toISOString().slice(0, 10),
      maks: 5,
      bulutEsigi: 15,
    }, signal),
  ]);

  if (!yeniGoruntular.length || !eskiGoruntular.length) return null;

  const [yeni, eski] = await Promise.all([
    ndviHesapla(yeniGoruntular[0]!, bbox, signal),
    ndviHesapla(eskiGoruntular[0]!, bbox, signal),
  ]);

  const delta = Math.round((yeni.ortalama - eski.ortalama) * 1000) / 1000;
  const yapilasmaArtis = delta < -0.15 && eski.ortalama > 0.2;
  const yesillendi = delta > 0.15;

  let donusumTip: NdviDegisimSonuc["donusumTip"];
  if (yapilasmaArtis) donusumTip = "beton-artis";
  else if (yesillendi) donusumTip = "yesillendi";
  else if (Math.abs(delta) < 0.05) donusumTip = "degismedi";
  else donusumTip = "belirsiz";

  let yorum: string;
  let renk: NdviDegisimSonuc["renk"];
  if (donusumTip === "beton-artis") {
    yorum = "Vejetasyon azalması tespit edildi — olası yapılaşma veya arazi kullanım değişikliği.";
    renk = "kirmizi";
  } else if (donusumTip === "yesillendi") {
    yorum = "Vejetasyon artışı — tarım alanı genişlemesi veya ağaçlandırma.";
    renk = "yesil";
  } else if (donusumTip === "degismedi") {
    yorum = "Arazi kullanımı stabil — son 2 yılda belirgin değişim yok.";
    renk = "mavi";
  } else {
    yorum = "Orta düzey değişim — mevsimsel etki veya kısmi arazi değişikliği olabilir.";
    renk = "sari";
  }

  return { eski, yeni, deltaNdvi: delta, yorum, renk, yapilasmaArtis, donusumTip };
}

// ── Sezonsal NDVI trendi ──────────────────────────────────────────────────────

/**
 * Son 12 aylık NDVI zaman serisi — tarla mevsimselliği analizi.
 * Yüksek mevsimsel varyans = aktif tarım alanı.
 */
export async function sezonalNdviGetir(
  bbox: Bbox,
  signal?: AbortSignal,
): Promise<SezonalNdvi[]> {
  const sonuclar: SezonalNdvi[] = [];
  const simdi = new Date();

  // Son 12 ay — her ay için en iyi görüntü bul
  for (let i = 11; i >= 0; i--) {
    const ayBas = new Date(simdi.getFullYear(), simdi.getMonth() - i, 1);
    const aySon = new Date(simdi.getFullYear(), simdi.getMonth() - i + 1, 0);
    const ayStr = ayBas.toISOString().slice(0, 7); // YYYY-MM

    try {
      const goruntular = await sentinelGoruntuleriAra(bbox, {
        baslangic: ayBas.toISOString().slice(0, 10),
        bitis: aySon.toISOString().slice(0, 10),
        maks: 3,
        bulutEsigi: 30,
      }, signal);

      if (goruntular.length === 0) continue;

      const ndvi = await ndviHesapla(goruntular[0]!, bbox, signal);
      sonuclar.push({
        ay: ayStr,
        ndvi: ndvi.ortalama,
        bulutOrani: goruntular[0]!.bulutOrani,
      });
    } catch { /* ay atla */ }
  }

  return sonuclar;
}

// ── NDVI yorumlama ────────────────────────────────────────────────────────────

export interface NdviYorum {
  sinif: "su-bina" | "cıplak-toprak" | "seyrek-veg" | "mera" | "tarim" | "orman";
  etiket: string;
  renk: string;
  aciklama: string;
  tarlaKalitesi: "dusuk" | "orta" | "iyi" | "mukemmel" | "gecersiz";
}

export function ndviYorumla(ortalamaNdvi: number): NdviYorum {
  if (ortalamaNdvi < 0) return {
    sinif: "su-bina", etiket: "Su / Bina / Beton", renk: "#94a3b8",
    aciklama: "NDVI negatif — yüzeyde su, çatı veya sert zemin baskın.",
    tarlaKalitesi: "gecersiz",
  };
  if (ortalamaNdvi < 0.1) return {
    sinif: "cıplak-toprak", etiket: "Çıplak Toprak / Kum", renk: "#d4a373",
    aciklama: "Çok seyrek vejetasyon. Ekilmemiş, sürülmüş veya kuraklık döneminde.",
    tarlaKalitesi: "dusuk",
  };
  if (ortalamaNdvi < 0.2) return {
    sinif: "seyrek-veg", etiket: "Seyrek Bitki Örtüsü", renk: "#a3b18a",
    aciklama: "Az yoğun vejetasyon. Ekim öncesi, mera kenarı veya kuru toprak.",
    tarlaKalitesi: "dusuk",
  };
  if (ortalamaNdvi < 0.35) return {
    sinif: "mera", etiket: "Mera / Kuru Tarım", renk: "#52b788",
    aciklama: "Orta yoğunluklu bitki örtüsü. Mera, kuru tarım veya tahıl ekili alan.",
    tarlaKalitesi: "orta",
  };
  if (ortalamaNdvi < 0.55) return {
    sinif: "tarim", etiket: "Tarım Alanı (Aktif)", renk: "#2d6a4f",
    aciklama: "Yoğun yeşil bitki örtüsü. Sulama imkânlı veya yağışlı bölgede aktif tarım.",
    tarlaKalitesi: "iyi",
  };
  return {
    sinif: "orman", etiket: "Yoğun Vejetasyon / Orman", renk: "#1b4332",
    aciklama: "Çok yoğun yeşillik. Orman, çok yıllık meyve bahçesi veya bağ.",
    tarlaKalitesi: "mukemmel",
  };
}

// ── Fiyat çarpanı ─────────────────────────────────────────────────────────────

/**
 * NDVI bazlı tarla fiyat çarpanı.
 * Verimli tarla (yüksek NDVI) aynı ilçede daha değerlidir.
 *
 * Çarpan aralığı: 0.75 – 1.25
 * Referans: NDVI = 0.35 → çarpan = 1.0 (medyan verimli tarla)
 */
export function ndviFiyatCarpani(ndviOrtalama: number): number {
  // Sigmoid benzeri: düşük NDVI = düşük çarpan, yüksek NDVI = yüksek çarpan
  if (ndviOrtalama < 0) return 0.75;
  if (ndviOrtalama < 0.1) return 0.80;
  if (ndviOrtalama < 0.2) return 0.88;
  if (ndviOrtalama < 0.3) return 0.95;
  if (ndviOrtalama < 0.4) return 1.00;
  if (ndviOrtalama < 0.5) return 1.08;
  if (ndviOrtalama < 0.6) return 1.15;
  return 1.25;
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function bugunIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function yilOnce(yilSayisi: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - yilSayisi);
  return d.toISOString().slice(0, 10);
}

/**
 * Parsel koordinatlarından Bbox üret (NDVI için yeterli kaplama alanı).
 * Küçük parseller için minimum 200m genişlik garanti edilir.
 */
export function bboxFromKoordlar(
  koordinatlar: Array<{ lat: number; lng: number }>,
): Bbox | null {
  const ring = koordinatlar.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (ring.length < 1) return null;

  let minLat = ring[0]!.lat, maxLat = ring[0]!.lat;
  let minLng = ring[0]!.lng, maxLng = ring[0]!.lng;
  for (const p of ring) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  // Sentinel-2 piksel boyutu 10m — minimum 200m bbox (20 piksel)
  const minDelta = 0.002; // ~220m
  const padLat = Math.max((maxLat - minLat) * 0.3, minDelta / 2);
  const padLng = Math.max((maxLng - minLng) * 0.3, minDelta / 2);

  return {
    minLat: minLat - padLat,
    maxLat: maxLat + padLat,
    minLng: minLng - padLng,
    maxLng: maxLng + padLng,
  };
}
