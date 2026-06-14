/**
 * Tarımsal yatırım analizi.
 * Veri kaynakları:
 *   - Open-Meteo Climate API (ücretsiz) — 30 yıl iklim normalleri
 *   - Lokal heuristic — Türkiye iklim kuşakları + ürün uygunluk matrisi
 *
 * Çıktı: yıllık yağış, ortalama sıcaklık, frost gün sayısı,
 *         önerilen ürünler, sulama ihtiyacı, mevsim bilgisi.
 */

const CLIMATE_BASE = "https://archive-api.open-meteo.com/v1/archive";

export interface IklimVerisi {
  yillikYagisMm: number;
  ortSicaklikC: number;
  enSicakAyOrt: number;
  enSogukAyOrt: number;
  donluGunSayisi: number; // <0°C günler
  rakimM: number;
  donemBaslangic: string;
  donemBitis: string;
  veriKaynagi: string;
}

export interface UrunUygunluk {
  urun: string;
  ikon: string;
  uygunluk: "yuksek" | "orta" | "dusuk" | "uygunsuz";
  not: string;
  brutGelirTlDonum: number; // tahmini yıllık brüt gelir TL/dönüm
}

export interface TarimAnalizi {
  iklim: IklimVerisi;
  iklimKusagi: string;
  iklimNotu: string;
  sulamaIhtiyaci: "az" | "orta" | "yuksek";
  donmaRiski: "düşük" | "orta" | "yüksek";
  oneriUrunler: UrunUygunluk[];
}

interface OpenMeteoArchive {
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    temperature_2m_mean?: number[];
    precipitation_sum?: number[];
  };
  elevation?: number;
}

export async function iklimGetir(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<IklimVerisi> {
  // Son 5 yılın günlük ortalama verilerini çek (free, no key)
  const bitis = new Date();
  bitis.setDate(bitis.getDate() - 7); // bugün-7 gün (gecikmeli veri)
  const baslangic = new Date(bitis);
  baslangic.setFullYear(bitis.getFullYear() - 5);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url = new URL(CLIMATE_BASE);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("start_date", fmt(baslangic));
  url.searchParams.set("end_date", fmt(bitis));
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum",
  );
  url.searchParams.set("timezone", "Europe/Istanbul");

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`Open-Meteo iklim HTTP ${res.status}`);
  const data: OpenMeteoArchive = await res.json();

  const tmean = data.daily?.temperature_2m_mean ?? [];
  const tmin = data.daily?.temperature_2m_min ?? [];
  const yagis = data.daily?.precipitation_sum ?? [];

  const yilSayisi = 5;
  const yillikYagis = yagis.reduce((s, v) => s + (v ?? 0), 0) / yilSayisi;
  const ortSicaklik = tmean.length
    ? tmean.reduce((s, v) => s + (v ?? 0), 0) / tmean.length
    : 0;

  // Aylık sıcaklık ortalamaları (ay × 5 yıl)
  const aylikSicakliklar: number[][] = Array.from({ length: 12 }, () => []);
  const baslangicMs = new Date(fmt(baslangic)).getTime();
  for (let i = 0; i < tmean.length; i++) {
    const tarih = new Date(baslangicMs + i * 86400 * 1000);
    const ay = tarih.getMonth();
    const v = tmean[i];
    if (typeof v === "number") aylikSicakliklar[ay]!.push(v);
  }
  const aylikOrt = aylikSicakliklar.map((arr) =>
    arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0,
  );
  const enSicak = Math.max(...aylikOrt);
  const enSoguk = Math.min(...aylikOrt);

  const donlu = tmin.filter((v) => typeof v === "number" && v < 0).length / yilSayisi;

  return {
    yillikYagisMm: Math.round(yillikYagis),
    ortSicaklikC: Math.round(ortSicaklik * 10) / 10,
    enSicakAyOrt: Math.round(enSicak * 10) / 10,
    enSogukAyOrt: Math.round(enSoguk * 10) / 10,
    donluGunSayisi: Math.round(donlu),
    rakimM: data.elevation ?? 0,
    donemBaslangic: fmt(baslangic),
    donemBitis: fmt(bitis),
    veriKaynagi: "Open-Meteo ERA5 (5-yıl normal)",
  };
}

interface UrunTanimi {
  urun: string;
  ikon: string;
  brutGelirTlDonum: number;
  /** [min, max] yıllık ort sıcaklık °C */
  sicaklikAraligi: [number, number];
  /** [min, max] yıllık yağış mm */
  yagisAraligi: [number, number];
  /** Maksimum donlu gün */
  maxDonluGun: number;
  /** Maksimum rakım m */
  maxRakim: number;
  /** Sulama ihtiyacı (yağışa ek litre/ay) */
  sulamaIhtiyaci: "az" | "orta" | "yuksek";
}

// Türkiye için 2025 brüt gelir tahminleri (TL/dönüm/yıl)
// Kaynak: TZOB, GTHB istatistikleri ortalama
const URUNLER: UrunTanimi[] = [
  {
    urun: "Buğday",
    ikon: "🌾",
    brutGelirTlDonum: 8_000,
    sicaklikAraligi: [4, 25],
    yagisAraligi: [300, 900],
    maxDonluGun: 120,
    maxRakim: 1800,
    sulamaIhtiyaci: "az",
  },
  {
    urun: "Mısır",
    ikon: "🌽",
    brutGelirTlDonum: 16_000,
    sicaklikAraligi: [10, 28],
    yagisAraligi: [400, 1200],
    maxDonluGun: 30,
    maxRakim: 1500,
    sulamaIhtiyaci: "yuksek",
  },
  {
    urun: "Ayçiçeği",
    ikon: "🌻",
    brutGelirTlDonum: 12_000,
    sicaklikAraligi: [6, 26],
    yagisAraligi: [300, 800],
    maxDonluGun: 60,
    maxRakim: 1200,
    sulamaIhtiyaci: "orta",
  },
  {
    urun: "Pamuk",
    ikon: "🌼",
    brutGelirTlDonum: 22_000,
    sicaklikAraligi: [15, 30],
    yagisAraligi: [400, 1500],
    maxDonluGun: 0,
    maxRakim: 800,
    sulamaIhtiyaci: "yuksek",
  },
  {
    urun: "Zeytin",
    ikon: "🫒",
    brutGelirTlDonum: 28_000,
    sicaklikAraligi: [10, 25],
    yagisAraligi: [400, 1000],
    maxDonluGun: 15,
    maxRakim: 800,
    sulamaIhtiyaci: "az",
  },
  {
    urun: "Üzüm (bağ)",
    ikon: "🍇",
    brutGelirTlDonum: 35_000,
    sicaklikAraligi: [9, 26],
    yagisAraligi: [350, 900],
    maxDonluGun: 30,
    maxRakim: 1500,
    sulamaIhtiyaci: "orta",
  },
  {
    urun: "Fındık",
    ikon: "🌰",
    brutGelirTlDonum: 25_000,
    sicaklikAraligi: [7, 18],
    yagisAraligi: [800, 2500],
    maxDonluGun: 60,
    maxRakim: 1000,
    sulamaIhtiyaci: "az",
  },
  {
    urun: "Çay",
    ikon: "🍵",
    brutGelirTlDonum: 30_000,
    sicaklikAraligi: [10, 22],
    yagisAraligi: [1200, 3000],
    maxDonluGun: 30,
    maxRakim: 1200,
    sulamaIhtiyaci: "az",
  },
  {
    urun: "Narenciye",
    ikon: "🍊",
    brutGelirTlDonum: 45_000,
    sicaklikAraligi: [12, 28],
    yagisAraligi: [600, 1500],
    maxDonluGun: 0,
    maxRakim: 600,
    sulamaIhtiyaci: "orta",
  },
  {
    urun: "Domates (sera)",
    ikon: "🍅",
    brutGelirTlDonum: 80_000,
    sicaklikAraligi: [10, 28],
    yagisAraligi: [200, 2000],
    maxDonluGun: 60,
    maxRakim: 1500,
    sulamaIhtiyaci: "yuksek",
  },
  {
    urun: "Patates",
    ikon: "🥔",
    brutGelirTlDonum: 18_000,
    sicaklikAraligi: [4, 22],
    yagisAraligi: [400, 1200],
    maxDonluGun: 90,
    maxRakim: 2200,
    sulamaIhtiyaci: "orta",
  },
  {
    urun: "Lavanta",
    ikon: "💜",
    brutGelirTlDonum: 40_000,
    sicaklikAraligi: [6, 24],
    yagisAraligi: [300, 800],
    maxDonluGun: 60,
    maxRakim: 1800,
    sulamaIhtiyaci: "az",
  },
];

function uygunlukDegerlendir(
  iklim: IklimVerisi,
  urun: UrunTanimi,
): UrunUygunluk["uygunluk"] {
  const t = iklim.ortSicaklikC;
  const y = iklim.yillikYagisMm;
  const [tMin, tMax] = urun.sicaklikAraligi;
  const [yMin, yMax] = urun.yagisAraligi;

  if (
    t < tMin - 3 ||
    t > tMax + 3 ||
    iklim.donluGunSayisi > urun.maxDonluGun + 30 ||
    iklim.rakimM > urun.maxRakim + 300
  ) {
    return "uygunsuz";
  }
  if (
    t < tMin ||
    t > tMax ||
    iklim.donluGunSayisi > urun.maxDonluGun ||
    iklim.rakimM > urun.maxRakim
  ) {
    return "dusuk";
  }
  // Yağış aralığı kontrol — sulama ile telafi edilebilir
  if (y < yMin && urun.sulamaIhtiyaci === "az") return "orta";
  if (y > yMax * 1.3) return "orta";
  if (y >= yMin && y <= yMax) return "yuksek";
  return "orta";
}

const UYGUNLUK_NOTU: Record<UrunUygunluk["uygunluk"], string> = {
  yuksek: "İklim çok uygun, yüksek verim beklenir.",
  orta: "İklim genelde uygun; mevsim seçimi/sulama önemli.",
  dusuk: "Sınırda; üreticiler riskli görür, özel teknoloji gerekir.",
  uygunsuz: "İklim uygun değil — başka ürün düşünün.",
};

function iklimKusagiBelirle(iklim: IklimVerisi): {
  kusak: string;
  not: string;
} {
  const t = iklim.ortSicaklikC;
  const y = iklim.yillikYagisMm;
  const r = iklim.rakimM;

  if (r > 1500) return { kusak: "Yüksek dağ iklimi", not: "Soğuk kış, kısa vejetasyon" };
  if (t > 17 && y < 600) return { kusak: "Akdeniz/Subtropikal kuru", not: "Sıcak yaz, kuru" };
  if (t > 17 && y > 800) return { kusak: "Akdeniz nemli", not: "Sıcak yaz, ılık kış" };
  if (t < 9) return { kusak: "Karasal soğuk", not: "Sert kış, kısa yaz" };
  if (y > 1000) return { kusak: "Karadeniz nemli", not: "Yağışlı, ılıman" };
  if (y < 400) return { kusak: "Yarı kurak", not: "Sulama olmadan zor" };
  return { kusak: "Karasal ılıman", not: "Türkiye iç bölgelerine tipik" };
}

export async function tarimAnalizGetir(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<TarimAnalizi> {
  const iklim = await iklimGetir(lat, lng, signal);

  const { kusak, not } = iklimKusagiBelirle(iklim);

  const sulamaIhtiyaci: TarimAnalizi["sulamaIhtiyaci"] =
    iklim.yillikYagisMm < 400
      ? "yuksek"
      : iklim.yillikYagisMm < 700
        ? "orta"
        : "az";
  const donmaRiski =
    iklim.donluGunSayisi > 60
      ? "yüksek"
      : iklim.donluGunSayisi > 20
        ? "orta"
        : "düşük";

  // Tüm ürünleri değerlendir, uygunluk sırala
  const tumUrunler: UrunUygunluk[] = URUNLER.map((u) => {
    const uygunluk = uygunlukDegerlendir(iklim, u);
    return {
      urun: u.urun,
      ikon: u.ikon,
      uygunluk,
      not: UYGUNLUK_NOTU[uygunluk],
      brutGelirTlDonum: u.brutGelirTlDonum,
    };
  });

  // Yüksek + orta uygunlukları öne al, brut gelire göre sırala
  const oneri = tumUrunler
    .filter((u) => u.uygunluk !== "uygunsuz")
    .sort((a, b) => {
      const orderA = a.uygunluk === "yuksek" ? 0 : a.uygunluk === "orta" ? 1 : 2;
      const orderB = b.uygunluk === "yuksek" ? 0 : b.uygunluk === "orta" ? 1 : 2;
      if (orderA !== orderB) return orderA - orderB;
      return b.brutGelirTlDonum - a.brutGelirTlDonum;
    })
    .slice(0, 6);

  return {
    iklim,
    iklimKusagi: kusak,
    iklimNotu: not,
    sulamaIhtiyaci,
    donmaRiski,
    oneriUrunler: oneri,
  };
}

export function tarimGelirHesapla(
  arsaM2: number,
  brutGelirTlDonum: number,
): { donum: number; yillikBrutGelir: number; netGelirTahmini: number } {
  const donum = arsaM2 / 1000;
  const yillikBrutGelir = donum * brutGelirTlDonum;
  // Net = brut'ün ~%35-50'si (gübre/işçilik/su/hasat)
  const netGelirTahmini = Math.round(yillikBrutGelir * 0.4);
  return { donum, yillikBrutGelir, netGelirTahmini };
}
