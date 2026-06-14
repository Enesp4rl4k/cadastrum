import type { Parsel } from "../types/tkgm";

export interface BoyutAnalizi {
  alanKategori: "mikro" | "kucuk" | "orta" | "buyuk" | "cok-buyuk";
  alanLabel: string;
  cevreM: number;
  enM: number;
  boyM: number;
  enBoyOrani: number;
  kompaktlik: number; // 4πA/P² — 1.0 = mükemmel daire, < 0.5 = uzun-ince
  sekilNotu: string;
}

export interface NitelikAnalizi {
  kategori:
    | "arsa"
    | "tarla"
    | "bahce"
    | "bag"
    | "zeytinlik"
    | "mesken"
    | "bina"
    | "yol"
    | "diger";
  ikon: string;
  not: string;
}

export interface KonumAnalizi {
  bolge: string;
  buyuksehir: boolean;
  kiyiIli: boolean;
  not: string;
}

export interface Analiz {
  boyut: BoyutAnalizi;
  nitelik: NitelikAnalizi;
  konum: KonumAnalizi;
}

export function analizet(parsel: Parsel): Analiz {
  return {
    boyut: boyutAnalizi(parsel),
    nitelik: nitelikAnalizi(parsel.nitelik),
    konum: konumAnalizi(parsel.ilAd),
  };
}

// ---- Boyut ----------------------------------------------------------------

function boyutAnalizi(parsel: Parsel): BoyutAnalizi {
  const alan = parsel.alan || 0;
  const ring = parsel.koordinatlar;
  const cevreM = ringPerimeterMeters(ring);
  const { enM, boyM } = bboxDimensionsMeters(ring);
  const enBoyOrani = enM > 0 && boyM > 0 ? Math.max(enM, boyM) / Math.min(enM, boyM) : 1;
  const kompaktlik = cevreM > 0 ? (4 * Math.PI * alan) / (cevreM * cevreM) : 0;

  let alanKategori: BoyutAnalizi["alanKategori"];
  if (alan < 200) alanKategori = "mikro";
  else if (alan < 750) alanKategori = "kucuk";
  else if (alan < 2500) alanKategori = "orta";
  else if (alan < 10000) alanKategori = "buyuk";
  else alanKategori = "cok-buyuk";

  const kategoriLabel: Record<typeof alanKategori, string> = {
    mikro: "mikro arsa",
    kucuk: "küçük arsa",
    orta: "orta büyüklükte",
    buyuk: "büyük arsa",
    "cok-buyuk": "çok büyük (parsellenebilir)",
  };

  let sekilNotu: string;
  if (kompaktlik > 0.7) sekilNotu = "kareye yakın, oldukça düzgün";
  else if (kompaktlik > 0.4) sekilNotu = "düzensiz fakat kullanışlı";
  else if (enBoyOrani > 4) sekilNotu = "çok uzun-ince (bina yerleşimi zor)";
  else sekilNotu = "düzensiz şekil";

  return {
    alanKategori,
    alanLabel: `${alan.toLocaleString("tr-TR")} m² · ${kategoriLabel[alanKategori]}`,
    cevreM: Math.round(cevreM),
    enM: Math.round(enM),
    boyM: Math.round(boyM),
    enBoyOrani: Math.round(enBoyOrani * 100) / 100,
    kompaktlik: Math.round(kompaktlik * 100) / 100,
    sekilNotu,
  };
}

function ringPerimeterMeters(ring: { lat: number; lng: number }[]): number {
  let total = 0;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1];
    const b = ring[i];
    if (!a || !b) continue;
    total += haversineM(a.lat, a.lng, b.lat, b.lng);
  }
  return total;
}

function bboxDimensionsMeters(ring: { lat: number; lng: number }[]): {
  enM: number;
  boyM: number;
} {
  if (ring.length === 0) return { enM: 0, boyM: 0 };
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  for (const p of ring) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const midLat = (minLat + maxLat) / 2;
  const enM = haversineM(midLat, minLng, midLat, maxLng);
  const boyM = haversineM(minLat, (minLng + maxLng) / 2, maxLat, (minLng + maxLng) / 2);
  return { enM, boyM };
}

export function haversineM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ---- Nitelik --------------------------------------------------------------

function nitelikAnalizi(nitelik: string): NitelikAnalizi {
  const n = (nitelik || "").toLocaleLowerCase("tr");

  if (/arsa/.test(n))
    return {
      kategori: "arsa",
      ikon: "🟦",
      not: "İmara açık arsa. Yapı ruhsatı için belediye imar planını kontrol et.",
    };
  if (/tarla/.test(n))
    return {
      kategori: "tarla",
      ikon: "🌾",
      not: "Tarımsal arazi. İfraz/imar değişikliği için tarım il müdürlüğü onayı gerekebilir.",
    };
  if (/zeytin/.test(n))
    return {
      kategori: "zeytinlik",
      ikon: "🫒",
      not: "Zeytinlik — 3573 sayılı kanun uyarınca yapılaşma kısıtlamalı.",
    };
  if (/bağ\b|bag\b/u.test(n))
    return {
      kategori: "bag",
      ikon: "🍇",
      not: "Bağ niteliği. Genelde tarımsal sayılır, dönüşüm araştır.",
    };
  if (/bahçe|bahce/.test(n))
    return {
      kategori: "bahce",
      ikon: "🌳",
      not: "Bahçe. Meyve/sebze üretimi, kısmi yapılaşma genelde mümkün.",
    };
  if (/mesken|kat mülkiyet/.test(n))
    return {
      kategori: "mesken",
      ikon: "🏠",
      not: "Mesken — üzerinde yapı/kat mülkiyeti var. Bağımsız bölüm sorgusu yap.",
    };
  if (/bina|işyeri|isyeri|dükkan|dukkan/.test(n))
    return {
      kategori: "bina",
      ikon: "🏢",
      not: "Yapı bulunan parsel. Bağımsız bölüm/bloklar için ayrı sorgu gerekir.",
    };
  if (/yol/.test(n))
    return {
      kategori: "yol",
      ikon: "🛣️",
      not: "Yol parseli — özel mülkiyete kapalı kamu alanı.",
    };

  return {
    kategori: "diger",
    ikon: "📄",
    not: `Nitelik: ${nitelik || "belirtilmemiş"}.`,
  };
}

// ---- Konum (makro) --------------------------------------------------------

const BUYUKSEHIRLER = new Set([
  "Adana", "Ankara", "Antalya", "Aydın", "Balıkesir", "Bursa", "Denizli",
  "Diyarbakır", "Erzurum", "Eskişehir", "Gaziantep", "Hatay", "Kahramanmaraş",
  "Kayseri", "Kocaeli", "Konya", "Malatya", "Manisa", "Mardin", "Mersin",
  "Muğla", "Ordu", "Sakarya", "Samsun", "Şanlıurfa", "Tekirdağ", "Trabzon",
  "Van", "İstanbul", "İzmir",
]);

const KIYI_ILLERI = new Set([
  "İstanbul", "Tekirdağ", "Kırklareli", "Edirne", "Çanakkale", "Balıkesir",
  "İzmir", "Aydın", "Muğla", "Antalya", "Mersin", "Adana", "Hatay",
  "Bursa", "Yalova", "Kocaeli", "Sakarya", "Düzce", "Zonguldak", "Bartın",
  "Kastamonu", "Sinop", "Samsun", "Ordu", "Giresun", "Trabzon", "Rize", "Artvin",
]);

const BOLGE: Record<string, string> = {
  // Marmara
  "İstanbul": "Marmara", "Tekirdağ": "Marmara", "Kırklareli": "Marmara",
  "Edirne": "Marmara", "Çanakkale": "Marmara", "Balıkesir": "Marmara",
  "Bursa": "Marmara", "Yalova": "Marmara", "Kocaeli": "Marmara",
  "Sakarya": "Marmara", "Bilecik": "Marmara",
  // Ege
  "İzmir": "Ege", "Aydın": "Ege", "Muğla": "Ege", "Denizli": "Ege",
  "Manisa": "Ege", "Uşak": "Ege", "Kütahya": "Ege", "Afyonkarahisar": "Ege",
  // Akdeniz
  "Antalya": "Akdeniz", "Mersin": "Akdeniz", "Adana": "Akdeniz",
  "Hatay": "Akdeniz", "Osmaniye": "Akdeniz", "Kahramanmaraş": "Akdeniz",
  "Burdur": "Akdeniz", "Isparta": "Akdeniz",
  // İç Anadolu
  "Ankara": "İç Anadolu", "Konya": "İç Anadolu", "Eskişehir": "İç Anadolu",
  "Kayseri": "İç Anadolu", "Sivas": "İç Anadolu", "Yozgat": "İç Anadolu",
  "Çorum": "İç Anadolu", "Çankırı": "İç Anadolu", "Kırıkkale": "İç Anadolu",
  "Kırşehir": "İç Anadolu", "Nevşehir": "İç Anadolu", "Niğde": "İç Anadolu",
  "Aksaray": "İç Anadolu", "Karaman": "İç Anadolu",
  // Karadeniz
  "Zonguldak": "Karadeniz", "Bartın": "Karadeniz", "Karabük": "Karadeniz",
  "Kastamonu": "Karadeniz", "Sinop": "Karadeniz", "Samsun": "Karadeniz",
  "Amasya": "Karadeniz", "Tokat": "Karadeniz", "Ordu": "Karadeniz",
  "Giresun": "Karadeniz", "Trabzon": "Karadeniz", "Rize": "Karadeniz",
  "Artvin": "Karadeniz", "Gümüşhane": "Karadeniz", "Bayburt": "Karadeniz",
  "Bolu": "Karadeniz", "Düzce": "Karadeniz",
  // Doğu Anadolu
  "Erzurum": "Doğu Anadolu", "Erzincan": "Doğu Anadolu", "Kars": "Doğu Anadolu",
  "Ardahan": "Doğu Anadolu", "Iğdır": "Doğu Anadolu", "Ağrı": "Doğu Anadolu",
  "Van": "Doğu Anadolu", "Bitlis": "Doğu Anadolu", "Muş": "Doğu Anadolu",
  "Bingöl": "Doğu Anadolu", "Tunceli": "Doğu Anadolu", "Elazığ": "Doğu Anadolu",
  "Malatya": "Doğu Anadolu", "Hakkari": "Doğu Anadolu",
  // Güneydoğu Anadolu
  "Gaziantep": "Güneydoğu", "Kilis": "Güneydoğu", "Şanlıurfa": "Güneydoğu",
  "Adıyaman": "Güneydoğu", "Diyarbakır": "Güneydoğu", "Mardin": "Güneydoğu",
  "Batman": "Güneydoğu", "Siirt": "Güneydoğu", "Şırnak": "Güneydoğu",
};

function konumAnalizi(ilAd: string): KonumAnalizi {
  const il = (ilAd || "").trim();
  const buyuksehir = BUYUKSEHIRLER.has(il);
  const kiyiIli = KIYI_ILLERI.has(il);
  const bolge = BOLGE[il] ?? "—";

  const notlar: string[] = [];
  if (buyuksehir) notlar.push("büyükşehir");
  if (kiyiIli) notlar.push("kıyı ili");
  if (notlar.length === 0) notlar.push("ortalama il");
  const not = `${bolge} bölgesi · ${notlar.join(", ")}`;

  return { bolge, buyuksehir, kiyiIli, not };
}
