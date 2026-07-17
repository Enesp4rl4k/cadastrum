/**
 * Orman ve Hazine Arazisi Sınır Analizi
 *
 * Veri kaynakları:
 *   1. Overpass API — OSM'deki orman, mera, Hazine arazileri
 *   2. TUCBS WMS GetFeatureInfo — CSB'nin ÇDP katmanlarından orman/koruma kodu
 *   3. Statik risk tablosu — il bazlı 2B/orman riski yüksek bölgeler
 *
 * Türkiye'de kritik arazi riskleri:
 *   - Orman sınırı çakışması: 6831 sayılı Orman Kanunu — yapılaşma yasak
 *   - 2B arazisi: Hazine'ye devredilmiş eski orman — satılabilir ama kısıtlı
 *   - Hazine arazisi: 4706 sayılı Kanun — bazı parseller satışa çıkmış olabilir
 *   - Mera: 4342 sayılı Mera Kanunu — tahsis amacı değiştirilmeden yapılaşma yasak
 *
 * Kullanım: parsel koordinatı verildiğinde 500m çevresinde bu alanları tespit et.
 */

export type OrmanHazineTip =
  | "orman"           // 6831 — yapılaşma kesinlikle yasak
  | "2b-arazisi"      // eski orman, Hazine'ye devir
  | "hazine-arazisi"  // Hazine mülkü
  | "mera"            // 4342 — mera
  | "sit-alani"       // arkeolojik/doğal sit
  | "doga-koruma"     // milli park, tabiat parkı
  | "kiy-kenari";     // 3621 kıyı kenar çizgisi

export interface OrmanHazineRisk {
  /** Tespit edilen arazi tiplerinin listesi */
  tespitler: OrmanHazineTespiti[];
  /** En yüksek risk seviyesi */
  riskSeviyesi: "yok" | "dusuk" | "orta" | "yuksek" | "kritik";
  /** Yapılaşma engeli var mı */
  yapilasmaDurumu: "serbest" | "sinirli" | "yasak" | "belirsiz";
  /** Özet risk metni */
  riskYorumu: string;
  /** Etkilenen yasal mevzuat */
  yasalMevzuat: string[];
  veriKaynagi: string;
}

export interface OrmanHazineTespiti {
  tip: OrmanHazineTip;
  ad: string | null;
  mesafeM: number;
  /** Parsel ile çakışıyor mu (0m = içinde/üstünde) */
  cakisiyor: boolean;
  aciklama: string;
}

// İl bazlı 2B/orman riski yüksek bölgeler (statik, kaba tahmin)
// Gerçek veri: OGM orman kadastro veritabanı (kapalı API)
const IL_ORMAN_RISK: Record<string, "dusuk" | "orta" | "yuksek"> = {
  artvin: "yuksek", rize: "yuksek", trabzon: "yuksek", giresun: "yuksek",
  ordu: "yuksek", kastamonu: "yuksek", bolu: "yuksek", duzce: "yuksek",
  bartin: "yuksek", zonguldak: "yuksek", sinop: "yuksek",
  antalya: "orta", mugla: "orta", izmir: "orta", bursa: "orta",
  kocaeli: "orta", sakarya: "orta", adapazari: "orta",
  ankara: "dusuk", konya: "dusuk", istanbul: "dusuk",
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

function tipBelirle(tags: Record<string, string>): OrmanHazineTip | null {
  const landuse = tags["landuse"] ?? "";
  const leisure = tags["leisure"] ?? "";
  const boundary = tags["boundary"] ?? "";
  const natural = tags["natural"] ?? "";
  const protect = tags["protect_class"] ?? "";
  const ownership = tags["ownership"] ?? "";
  const designat = tags["designation"] ?? "";

  if (landuse === "forest" || natural === "wood" || tags["wood"] === "yes") return "orman";
  if (
    ownership === "government" ||
    designat.includes("hazine") ||
    tags["operator"] === "Hazine" ||
    tags["name"]?.toLocaleLowerCase("tr").includes("hazine")
  ) return "hazine-arazisi";
  if (landuse === "meadow" || designat.includes("mera") || tags["name"]?.toLocaleLowerCase("tr").includes("mera")) return "mera";
  if (
    boundary === "protected_area" ||
    leisure === "nature_reserve" ||
    protect !== "" ||
    tags["name"]?.toLocaleLowerCase("tr").includes("milli park") ||
    tags["name"]?.toLocaleLowerCase("tr").includes("tabiat park")
  ) return "doga-koruma";
  if (
    tags["natural"] === "coastline" ||
    tags["name"]?.toLocaleLowerCase("tr").includes("kıyı") ||
    tags["name"]?.toLocaleLowerCase("tr").includes("kiyi")
  ) return "kiy-kenari";
  if (
    tags["heritage"] ||
    boundary === "archaeological_zone" ||
    designat.includes("sit")
  ) return "sit-alani";

  return null;
}

function yasalMevzuatGetir(tip: OrmanHazineTip): string {
  switch (tip) {
    case "orman": return "6831 sayılı Orman Kanunu";
    case "2b-arazisi": return "6292 sayılı 2B Kanunu";
    case "hazine-arazisi": return "4706 sayılı Hazineye Ait Taşınmaz Mal. Kanunu";
    case "mera": return "4342 sayılı Mera Kanunu";
    case "sit-alani": return "2863 sayılı Kültür ve Tabiat Varlıklarını Koruma Kanunu";
    case "doga-koruma": return "2873 sayılı Milli Parklar Kanunu";
    case "kiy-kenari": return "3621 sayılı Kıyı Kanunu";
  }
}

function aciklamaGetir(tip: OrmanHazineTip, mesafeM: number): string {
  const mesafe = mesafeM === 0 ? "Parsel içinde" : `${Math.round(mesafeM)} m mesafede`;
  switch (tip) {
    case "orman":
      return `${mesafe} — Orman alanı. 6831 sayılı kanun kapsamında yapılaşma kesinlikle yasak. OGM sınır tespiti zorunlu.`;
    case "2b-arazisi":
      return `${mesafe} — 2B arazisi (eski orman, Hazine'ye devir). Satışı mümkün ama imar kısıtları devam edebilir.`;
    case "hazine-arazisi":
      return `${mesafe} — Hazine mülkü. İzinsiz kullanım yasak; ihale/tahsis yoluyla kullanım mümkün.`;
    case "mera":
      return `${mesafe} — Mera alanı. 4342 sayılı kanun: tahsis amacı değiştirilmeden yapılaşma yasak.`;
    case "sit-alani":
      return `${mesafe} — Sit alanı. Koruma kurulu onayı olmadan hiçbir değişiklik yapılamaz.`;
    case "doga-koruma":
      return `${mesafe} — Doğal koruma alanı / milli park. Yapılaşma ve arazi değişikliği kısıtlı.`;
    case "kiy-kenari":
      return `${mesafe} — Kıyı kenar çizgisi yakını. 3621 sayılı kanun: kıyı şeridinde yapılaşma yasak.`;
  }
}

function riskHesapla(tespitler: OrmanHazineTespiti[]): OrmanHazineRisk["riskSeviyesi"] {
  if (tespitler.length === 0) return "yok";

  const cakisanlar = tespitler.filter((t) => t.cakisiyor);
  const kritikTipler: OrmanHazineTip[] = ["orman", "sit-alani", "doga-koruma", "kiy-kenari"];
  const yuksekTipler: OrmanHazineTip[] = ["mera", "2b-arazisi"];

  if (cakisanlar.some((t) => kritikTipler.includes(t.tip))) return "kritik";
  if (cakisanlar.some((t) => yuksekTipler.includes(t.tip))) return "yuksek";
  if (tespitler.some((t) => t.mesafeM < 100 && kritikTipler.includes(t.tip))) return "yuksek";
  if (tespitler.some((t) => t.mesafeM < 500 && kritikTipler.includes(t.tip))) return "orta";
  if (tespitler.length > 0) return "dusuk";
  return "yok";
}

function yapilasmaDurumuBelirle(
  risk: OrmanHazineRisk["riskSeviyesi"],
  tespitler: OrmanHazineTespiti[],
): OrmanHazineRisk["yapilasmaDurumu"] {
  const cakisan = tespitler.filter((t) => t.cakisiyor);
  const yasak: OrmanHazineTip[] = ["orman", "sit-alani", "doga-koruma", "kiy-kenari", "mera"];
  if (cakisan.some((t) => yasak.includes(t.tip))) return "yasak";
  if (risk === "yuksek" || risk === "orta") return "sinirli";
  if (risk === "dusuk") return "belirsiz";
  return "serbest";
}

function riskYorumuOlustur(
  risk: OrmanHazineRisk["riskSeviyesi"],
  tespitler: OrmanHazineTespiti[],
  ilNorm?: string | null,
): string {
  if (tespitler.length === 0) {
    const ilRisk = ilNorm ? (IL_ORMAN_RISK[ilNorm] ?? "dusuk") : "dusuk";
    if (ilRisk === "yuksek") {
      return "Yakın çevrede OSM'de kayıtlı orman/koruma alanı tespit edilmedi. Ancak bu il orman kadastro riski yüksek — OGM sorgusunu öneririz.";
    }
    return "Yakın çevrede (500m) OSM kayıtlı orman, mera veya koruma alanı tespit edilmedi.";
  }

  const kritikler = tespitler.filter((t) => t.cakisiyor);
  if (kritikler.length > 0) {
    return `⚠️ Parsel ${kritikler.map((t) => t.tip).join(", ")} alanıyla çakışıyor. Tapu tescilinden önce OGM/Çevre Bakanlığı sınır tespiti zorunlu.`;
  }

  const yakin = tespitler.filter((t) => t.mesafeM < 300);
  if (yakin.length > 0) {
    return `${yakin.length} kritik alan ${yakin[0]!.mesafeM} m mesafede. Sınır belirsizliği riski — kadastro haritalı teyit gerekli.`;
  }

  return `${tespitler.length} orman/koruma alanı 500m çevresinde. Doğrudan çakışma yok; sınır mesafesi yeterli.`;
}

const CACHE = new Map<string, { data: OrmanHazineRisk; fetchedAt: number }>();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün

function cacheKey(lat: number, lng: number): string {
  return `orman|${lat.toFixed(3)}|${lng.toFixed(3)}`;
}

/**
 * Parsel koordinatından 500m çevresindeki orman/Hazine/koruma alanlarını tespit eder.
 */
export async function ormanHazineRiskGetir(
  lat: number,
  lng: number,
  ilNorm?: string | null,
  signal?: AbortSignal,
): Promise<OrmanHazineRisk> {
  const key = cacheKey(lat, lng);
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return hit.data;
  }

  const radius = 500; // 500m — orman sınırı çakışması için kritik mesafe
  const query = `
    [out:json][timeout:15];
    (
      way["landuse"="forest"](around:${radius},${lat},${lng});
      way["natural"="wood"](around:${radius},${lat},${lng});
      way["landuse"="meadow"](around:${radius},${lat},${lng});
      way["boundary"="protected_area"](around:${radius},${lat},${lng});
      way["leisure"="nature_reserve"](around:${radius},${lat},${lng});
      relation["boundary"="protected_area"](around:${radius},${lat},${lng});
      way["natural"="coastline"](around:${radius},${lat},${lng});
      way["boundary"="archaeological_zone"](around:${radius},${lat},${lng});
    );
    out center tags;
  `.trim();

  try {
    let rawText: string;
    if (typeof chrome !== "undefined" && chrome?.runtime?.sendMessage) {
      const result = await chrome.runtime.sendMessage({
        tip: "overpass-proxy",
        url: "https://overpass-api.de/api/interpreter",
        body: `data=${encodeURIComponent(query)}`,
      }) as { ok: boolean; text: string; error?: string };
      if (!result.ok) throw new Error(result.error ?? "Overpass başarısız");
      rawText = result.text;
    } else {
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

    const tespitler: OrmanHazineTespiti[] = [];
    const gorulenIdler = new Set<number>();

    for (const el of elements) {
      if (gorulenIdler.has(el.id)) continue;
      gorulenIdler.add(el.id);

      const elLat = el.lat ?? el.center?.lat ?? lat;
      const elLng = el.lon ?? el.center?.lon ?? lng;
      const mesafeM = Math.round(haversineM(lat, lng, elLat, elLng));
      const tip = tipBelirle(el.tags ?? {});
      if (!tip) continue;

      tespitler.push({
        tip,
        ad: el.tags?.["name"] ?? el.tags?.["name:tr"] ?? null,
        mesafeM,
        cakisiyor: mesafeM < 20, // pratik eşik — poligon içi kesin tespit değil
        aciklama: aciklamaGetir(tip, mesafeM),
      });
    }

    // Mesafeye göre sırala
    tespitler.sort((a, b) => a.mesafeM - b.mesafeM);

    const riskSeviyesi = riskHesapla(tespitler);
    const yapilasmaDurumu = yapilasmaDurumuBelirle(riskSeviyesi, tespitler);
    const yasalMevzuat = [...new Set(tespitler.map((t) => yasalMevzuatGetir(t.tip)))];
    const riskYorumu = riskYorumuOlustur(riskSeviyesi, tespitler, ilNorm);

    const sonuc: OrmanHazineRisk = {
      tespitler: tespitler.slice(0, 10),
      riskSeviyesi,
      yapilasmaDurumu,
      riskYorumu,
      yasalMevzuat,
      veriKaynagi: "OpenStreetMap Overpass API",
    };

    CACHE.set(key, { data: sonuc, fetchedAt: Date.now() });
    return sonuc;
  } catch (e) {
    console.warn("[orman-hazine] Overpass sorgusu başarısız:", e);
    const ilRisk = ilNorm ? (IL_ORMAN_RISK[ilNorm] ?? "dusuk") : "dusuk";
    return {
      tespitler: [],
      riskSeviyesi: ilRisk === "yuksek" ? "orta" : "yok",
      yapilasmaDurumu: "belirsiz",
      riskYorumu: ilRisk === "yuksek"
        ? "Orman/koruma alanı verisi alınamadı. Bu il orman riski yüksek — OGM sorgusu öncelikli önerilir."
        : "Orman/koruma alanı verisi alınamadı. Saha keşfi önerilir.",
      yasalMevzuat: [],
      veriKaynagi: "Veri alınamadı",
    };
  }
}

/** Risk seviyesini okunabilir Türkçe etikete çevirir */
export function ormanRiskEtiketi(risk: OrmanHazineRisk["riskSeviyesi"]): string {
  switch (risk) {
    case "kritik": return "Kritik — Yapılaşma Yasak";
    case "yuksek": return "Yüksek Risk";
    case "orta":   return "Orta Risk";
    case "dusuk":  return "Düşük Risk";
    case "yok":    return "Risk Tespit Edilmedi";
  }
}
