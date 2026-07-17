/**
 * DSİ Sulama Altyapısı Analizi
 *
 * Veri kaynakları (öncelik sırasıyla):
 *   1. Overpass API — OSM'deki sulama kanalları (waterway=canal + irrigation tag)
 *   2. Statik DSİ sulama bölgesi tablosu — il bazlı sulama sahası (hektar)
 *
 * Tarımsal arsa değerlemesinde sulama imkânı kritiktir:
 *   - Sulama kanalına <500m mesafe → yüksek tarımsal potansiyel (+%30-50 değer etkisi)
 *   - 500-2000m → orta potansiyel (borulu sulama mümkün)
 *   - >2000m veya sulama sahası dışı → kuru tarım / düşük değer
 *
 * Overpass sorgusu: sulama kanalı, drenaj, bent, rezervuar 2km yarıçap içinde
 */

export type SulamaErisim = "yok" | "uzak" | "orta" | "yakin" | "cok-yakin";

export interface SulamaAltyapisi {
  /** OSM'den bulunan en yakın sulama kanalına mesafe (m), null = bulunamadı */
  enYakinKanalM: number | null;
  /** Sulama erişim seviyesi */
  erisim: SulamaErisim;
  /** Bulunan sulama özellikleri */
  ozellikler: SulamaOzelligi[];
  /** İl bazlı DSİ sulama sahası (hektar) — statik tablo */
  ilSulamaSahasiHa: number | null;
  /** Tarımsal değer etkisi yorumu */
  tarimYorum: string;
  /** Değer çarpanı (1.0 = nötr, 1.5 = %50 artı etki) */
  degerCarpani: number;
  veriKaynagi: string;
}

export interface SulamaOzelligi {
  tip: "kanal" | "drenaj" | "bent" | "rezervuar" | "sulama-altyapisi";
  ad: string | null;
  mesafeM: number;
}

// DSİ il bazlı sulama sahası (hektar) — 2024 yılı
// Kaynak: DSİ Genel Müdürlüğü yıllık istatistik bülteni
// https://www.dsi.gov.tr/Sayfa/Detay/744
const DSI_IL_SULAMA: Record<string, number> = {
  adana: 320000, adiyaman: 45000, afyonkarahisar: 85000, agri: 28000,
  amasya: 42000, ankara: 95000, antalya: 125000, artvin: 8000,
  aydin: 155000, balikesir: 135000, bilecik: 22000, bingol: 15000,
  bitlis: 12000, bolu: 28000, burdur: 52000, bursa: 185000,
  canakkale: 75000, cankiri: 35000, corum: 68000, denizli: 95000,
  diyarbakir: 185000, edirne: 145000, elazig: 48000, erzincan: 35000,
  erzurum: 55000, eskisehir: 115000, gaziantep: 88000, giresun: 12000,
  gumushane: 8000, hakkari: 5000, hatay: 95000, isparta: 65000,
  mersin: 185000, istanbul: 25000, izmir: 185000, kars: 42000,
  kastamonu: 35000, kayseri: 115000, kirklareli: 125000, kirsehir: 48000,
  kocaeli: 28000, konya: 445000, kutahya: 72000, malatya: 85000,
  manisa: 245000, kahramanmaras: 95000, mardin: 125000, mugla: 55000,
  mus: 22000, nevsehir: 45000, nigde: 65000, ordu: 15000,
  rize: 5000, sakarya: 45000, samsun: 95000, siirt: 18000,
  sinop: 18000, sivas: 95000, tekirdag: 115000, tokat: 72000,
  trabzon: 12000, tunceli: 8000, sanliurfa: 285000, usak: 55000,
  van: 48000, yozgat: 62000, zonguldak: 15000, aksaray: 88000,
  bayburt: 8000, karaman: 72000, kirikkale: 28000, batman: 42000,
  sirnak: 15000, bartin: 8000, ardahan: 18000, igdir: 42000,
  yalova: 8000, karabuk: 12000, kilis: 22000, osmaniye: 35000,
  duzce: 22000,
};

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function tipBelirle(tags: Record<string, string>): SulamaOzelligi["tip"] {
  const waterway = tags["waterway"] ?? "";
  const man_made = tags["man_made"] ?? "";
  const landuse = tags["landuse"] ?? "";

  if (waterway === "canal" || tags["irrigation"] === "yes") return "kanal";
  if (waterway === "drain" || waterway === "ditch") return "drenaj";
  if (waterway === "dam" || man_made === "dam") return "bent";
  if (waterway === "reservoir" || landuse === "reservoir") return "rezervuar";
  return "sulama-altyapisi";
}

function erisimBelirle(mesafeM: number | null): SulamaErisim {
  if (mesafeM === null) return "yok";
  if (mesafeM < 300)  return "cok-yakin";
  if (mesafeM < 750)  return "yakin";
  if (mesafeM < 2000) return "orta";
  if (mesafeM < 5000) return "uzak";
  return "yok";
}

function degerCarpaniBelirle(erisim: SulamaErisim): number {
  switch (erisim) {
    case "cok-yakin": return 1.45; // Kanal kenarı — çok yüksek tarımsal değer
    case "yakin":     return 1.30;
    case "orta":      return 1.15;
    case "uzak":      return 1.05;
    case "yok":       return 1.00;
  }
}

function tarimYorumOlustur(
  erisim: SulamaErisim,
  mesafeM: number | null,
  ilSaha: number | null,
): string {
  const ilSahaMetin = ilSaha
    ? ` (İlde ${ilSaha.toLocaleString("tr-TR")} ha sulama sahası)`
    : "";

  switch (erisim) {
    case "cok-yakin":
      return `Sulama kanalı ${Math.round(mesafeM!)} m mesafede — mükemmel sulama erişimi. Sulama maliyeti çok düşük, çok yıllık yüksek değerli ürünler (zeytin, narenciye, bağ) doğrudan kârlı.`;
    case "yakin":
      return `Sulama altyapısı ${Math.round(mesafeM!)} m uzaklıkta — iyi erişim. Borulu sulama tesisi ekonomik. Geniş ürün yelpazesi mümkün.`;
    case "orta":
      return `Sulama kanalı ${Math.round(mesafeM!)} m uzaklıkta — orta erişim. Sulama tesisi yatırım gerektirir; uzun vadeli tarımsal projeler için değerlendirin.`;
    case "uzak":
      return `En yakın sulama altyapısı ${Math.round(mesafeM!)} m — erişim zor. Kuyu/yağmur suyu hasadı alternatif; kuru tarım ürünleri önerilir.`;
    case "yok":
      return `Yakın çevrede (2 km) DSİ sulama altyapısı tespit edilemedi.${ilSahaMetin} Kuyu kuyusu veya yağmur suyu hasadı planlanmalı.`;
  }
}

const CACHE = new Map<string, { data: SulamaAltyapisi; fetchedAt: number }>();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün — sulama kanalları nadiren değişir

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)}|${lng.toFixed(3)}`;
}

/**
 * Parsel koordinatından 2 km yarıçapındaki sulama altyapısını Overpass API'den çeker.
 * Sonuç 7 gün bellek cache'inde tutulur.
 */
export async function sulamaAltyapisiniGetir(
  lat: number,
  lng: number,
  ilNorm?: string | null,
  signal?: AbortSignal,
): Promise<SulamaAltyapisi> {
  const key = cacheKey(lat, lng);
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return hit.data;
  }

  const ilSulamaSahasiHa = ilNorm ? (DSI_IL_SULAMA[ilNorm] ?? null) : null;

  // Overpass QL sorgusu — sulama kanalları, bent, rezervuarlar
  const radius = 2000; // 2 km
  const query = `
    [out:json][timeout:15];
    (
      way["waterway"="canal"](around:${radius},${lat},${lng});
      way["waterway"="drain"](around:${radius},${lat},${lng});
      way["waterway"="ditch"]["irrigation"="yes"](around:${radius},${lat},${lng});
      way["man_made"="dam"](around:${radius},${lat},${lng});
      node["waterway"="dam"](around:${radius},${lat},${lng});
      way["landuse"="reservoir"](around:${radius},${lat},${lng});
      way["waterway"="canal"]["usage"="irrigation"](around:${radius},${lat},${lng});
    );
    out center tags;
  `.trim();

  try {
    // Service worker üzerinden Overpass isteği (Chrome extension context)
    let rawText: string;
    if (typeof chrome !== "undefined" && chrome?.runtime?.sendMessage) {
      const result = await chrome.runtime.sendMessage({
        tip: "overpass-proxy",
        url: "https://overpass-api.de/api/interpreter",
        body: `data=${encodeURIComponent(query)}`,
      }) as { ok: boolean; text: string; error?: string };
      if (!result.ok) throw new Error(result.error ?? `Overpass ${result}`);
      rawText = result.text;
    } else {
      // Site context — doğrudan fetch
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal,
      });
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      rawText = await res.text();
    }

    const json = JSON.parse(rawText) as { elements?: OverpassElement[] };
    const elements = json.elements ?? [];

    const ozellikler: SulamaOzelligi[] = elements.map((el) => {
      const elLat = el.lat ?? el.center?.lat ?? lat;
      const elLng = el.lon ?? el.center?.lon ?? lng;
      return {
        tip: tipBelirle(el.tags ?? {}),
        ad: el.tags?.["name"] ?? el.tags?.["name:tr"] ?? null,
        mesafeM: Math.round(haversineM(lat, lng, elLat, elLng)),
      };
    }).sort((a, b) => a.mesafeM - b.mesafeM);

    // Yalnızca gerçek kanalları dikkate al (drenaj vs sulama ayrımı)
    const kanallar = ozellikler.filter(
      (o) => o.tip === "kanal" || o.tip === "sulama-altyapisi",
    );
    const tumSulama = ozellikler.filter((o) => o.tip !== "drenaj");

    const enYakinKanalM =
      kanallar.length > 0
        ? kanallar[0]!.mesafeM
        : tumSulama.length > 0
          ? tumSulama[0]!.mesafeM
          : null;

    const erisim = erisimBelirle(enYakinKanalM);
    const degerCarpani = degerCarpaniBelirle(erisim);
    const tarimYorum = tarimYorumOlustur(erisim, enYakinKanalM, ilSulamaSahasiHa);

    const sonuc: SulamaAltyapisi = {
      enYakinKanalM,
      erisim,
      ozellikler: ozellikler.slice(0, 8), // max 8 nokta göster
      ilSulamaSahasiHa,
      tarimYorum,
      degerCarpani,
      veriKaynagi: "OpenStreetMap Overpass API + DSİ il istatistikleri",
    };

    CACHE.set(key, { data: sonuc, fetchedAt: Date.now() });
    return sonuc;
  } catch (e) {
    // Overpass başarısız — statik il verisinden en azından bir yorum üret
    console.warn("[sulama] Overpass sorgusu başarısız:", e);
    const erisim: SulamaErisim = "yok";
    return {
      enYakinKanalM: null,
      erisim,
      ozellikler: [],
      ilSulamaSahasiHa,
      tarimYorum: ilSulamaSahasiHa
        ? `DSİ verisi: Bu ilde toplam ${ilSulamaSahasiHa.toLocaleString("tr-TR")} ha sulama sahası var. Parsel bazlı mesafe verisi alınamadı.`
        : "Sulama altyapısı verisi alınamadı. Saha keşfi önerilir.",
      degerCarpani: 1.0,
      veriKaynagi: "DSİ il istatistikleri (Overpass erişilemedi)",
    };
  }
}

/**
 * Sulama erişimini okunabilir etiket olarak döner.
 */
export function sulamaErisimEtiketi(erisim: SulamaErisim): string {
  switch (erisim) {
    case "cok-yakin": return "Mükemmel sulama erişimi";
    case "yakin":     return "İyi sulama erişimi";
    case "orta":      return "Orta sulama erişimi";
    case "uzak":      return "Zor sulama erişimi";
    case "yok":       return "Sulama altyapısı yok";
  }
}
