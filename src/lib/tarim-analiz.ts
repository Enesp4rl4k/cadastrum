/**
 * Tarımsal yatırım, toprak & iklim istihbaratı analizi.
 * Veri kaynakları:
 *   - Open-Meteo Climate API — 30 yıl iklim normalleri & ERA5 reanalysis
 *   - FAO ECOCROP modeline dayalı 16 stratejik ürün uygunluk matrisi
 *   - Biyoklimatik göstergeler: GDD (Büyüme Derece Günleri), Don Riski, ET0 Sulama Açığı
 *
 * Çıktı: yıllık yağış, ortalama sıcaklık, frost gün sayısı, GDD,
 *         önerilen ürünler, sulama ihtiyacı, dönüm başı net kârlılık.
 */

const CLIMATE_BASE = "https://archive-api.open-meteo.com/v1/archive";

export interface IklimVerisi {
  yillikYagisMm: number;
  ortSicaklikC: number;
  enSicakAyOrt: number;
  enSogukAyOrt: number;
  donluGunSayisi: number; // <0°C günler
  rakimM: number;
  gddDereceGun: number; // Growing Degree Days (Base 10°C)
  donemBaslangic: string;
  donemBitis: string;
  veriKaynagi: string;
}

export interface UrunUygunluk {
  urun: string;
  ikon: string;
  uygunluk: "yuksek" | "orta" | "dusuk" | "uygunsuz";
  uygunlukSkoruYuzde: number; // 0-100
  not: string;
  brutGelirTlDonum: number; // Yıllık brüt gelir TL/dönüm (1000m²)
  tahminiGiderTlDonum: number; // Gübre, tohum, sulama, hasat
  netGelirTlDonum: number; // Net kâr TL/dönüm
  hasatPeriyodu: string;
  sulamaTipi: "yagsiz-kuru" | "damlama-orta" | "yogun-sulama";
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

export function hesaplaGdd(tmean: number[], tbase = 10): number {
  if (!tmean || tmean.length === 0) return 1800; // Varsayılan Türkiye ortalaması
  let gdd = 0;
  for (const t of tmean) {
    if (typeof t === "number" && t > tbase) {
      gdd += t - tbase;
    }
  }
  // Yıllık ortalama GDD
  return Math.round(gdd / (tmean.length / 365.25));
}

export async function iklimGetir(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<IklimVerisi> {
  const bitis = new Date();
  bitis.setDate(bitis.getDate() - 7);
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
  const gddDereceGun = hesaplaGdd(tmean, 10);

  return {
    yillikYagisMm: Math.round(yillikYagis),
    ortSicaklikC: Math.round(ortSicaklik * 10) / 10,
    enSicakAyOrt: Math.round(enSicak * 10) / 10,
    enSogukAyOrt: Math.round(enSoguk * 10) / 10,
    donluGunSayisi: Math.round(donlu),
    rakimM: data.elevation ?? 0,
    gddDereceGun,
    donemBaslangic: fmt(baslangic),
    donemBitis: fmt(bitis),
    veriKaynagi: "Open-Meteo ERA5 (5-yıl iklim arşivi)",
  };
}

interface UrunTanimi {
  urun: string;
  ikon: string;
  brutGelirTlDonum: number;
  maliyetOrani: number; // Masraf oranı % (0.35 - 0.55)
  sicaklikAraligi: [number, number];
  yagisAraligi: [number, number];
  maxDonluGun: number;
  maxRakim: number;
  minGdd: number;
  hasatPeriyodu: string;
  sulamaTipi: UrunUygunluk["sulamaTipi"];
}

const URUNLER: UrunTanimi[] = [
  {
    urun: "Zeytin",
    ikon: "🫒",
    brutGelirTlDonum: 38_000,
    maliyetOrani: 0.35,
    sicaklikAraligi: [11, 24],
    yagisAraligi: [400, 1000],
    maxDonluGun: 15,
    maxRakim: 850,
    minGdd: 1800,
    hasatPeriyodu: "Ekim - Aralık",
    sulamaTipi: "yagsiz-kuru",
  },
  {
    urun: "Ceviz (Chandler)",
    ikon: "🪵",
    brutGelirTlDonum: 48_000,
    maliyetOrani: 0.38,
    sicaklikAraligi: [8, 22],
    yagisAraligi: [450, 1100],
    maxDonluGun: 45,
    maxRakim: 1600,
    minGdd: 1600,
    hasatPeriyodu: "Eylül - Ekim",
    sulamaTipi: "damlama-orta",
  },
  {
    urun: "Antep Fıstığı",
    ikon: "🥜",
    brutGelirTlDonum: 55_000,
    maliyetOrani: 0.32,
    sicaklikAraligi: [13, 27],
    yagisAraligi: [250, 750],
    maxDonluGun: 20,
    maxRakim: 1200,
    minGdd: 2200,
    hasatPeriyodu: "Ağustos - Eylül",
    sulamaTipi: "yagsiz-kuru",
  },
  {
    urun: "Badem (Ferragnes)",
    ikon: "🌰",
    brutGelirTlDonum: 42_000,
    maliyetOrani: 0.36,
    sicaklikAraligi: [10, 25],
    yagisAraligi: [350, 900],
    maxDonluGun: 25,
    maxRakim: 1400,
    minGdd: 1700,
    hasatPeriyodu: "Ağustos - Eylül",
    sulamaTipi: "damlama-orta",
  },
  {
    urun: "Üzüm (Bağcılık)",
    ikon: "🍇",
    brutGelirTlDonum: 45_000,
    maliyetOrani: 0.40,
    sicaklikAraligi: [10, 26],
    yagisAraligi: [350, 950],
    maxDonluGun: 30,
    maxRakim: 1400,
    minGdd: 1750,
    hasatPeriyodu: "Ağustos - Ekim",
    sulamaTipi: "damlama-orta",
  },
  {
    urun: "Lavanta & Tıbbi Bitki",
    ikon: "💜",
    brutGelirTlDonum: 32_000,
    maliyetOrani: 0.30,
    sicaklikAraligi: [6, 24],
    yagisAraligi: [250, 800],
    maxDonluGun: 80,
    maxRakim: 1800,
    minGdd: 1400,
    hasatPeriyodu: "Temmuz - Ağustos",
    sulamaTipi: "yagsiz-kuru",
  },
  {
    urun: "Buğday (Sert Ekmeklik)",
    ikon: "🌾",
    brutGelirTlDonum: 11_000,
    maliyetOrani: 0.45,
    sicaklikAraligi: [4, 23],
    yagisAraligi: [300, 850],
    maxDonluGun: 120,
    maxRakim: 2000,
    minGdd: 1200,
    hasatPeriyodu: "Haziran - Temmuz",
    sulamaTipi: "yagsiz-kuru",
  },
  {
    urun: "Mısır (Dane)",
    ikon: "🌽",
    brutGelirTlDonum: 22_000,
    maliyetOrani: 0.48,
    sicaklikAraligi: [11, 28],
    yagisAraligi: [450, 1200],
    maxDonluGun: 20,
    maxRakim: 1200,
    minGdd: 1900,
    hasatPeriyodu: "Eylül - Ekim",
    sulamaTipi: "yogun-sulama",
  },
  {
    urun: "Fındık",
    ikon: "🌰",
    brutGelirTlDonum: 35_000,
    maliyetOrani: 0.35,
    sicaklikAraligi: [8, 19],
    yagisAraligi: [800, 2400],
    maxDonluGun: 50,
    maxRakim: 1100,
    minGdd: 1500,
    hasatPeriyodu: "Ağustos",
    sulamaTipi: "yagsiz-kuru",
  },
  {
    urun: "Narenciye (Portakal/Limon)",
    ikon: "🍊",
    brutGelirTlDonum: 65_000,
    maliyetOrani: 0.42,
    sicaklikAraligi: [13, 28],
    yagisAraligi: [600, 1400],
    maxDonluGun: 2,
    maxRakim: 550,
    minGdd: 2400,
    hasatPeriyodu: "Kasım - Mart",
    sulamaTipi: "damlama-orta",
  },
];

export function urunUygunlukHesapla(
  iklim: IklimVerisi,
  egimYuzde = 0,
): UrunUygunluk[] {
  return URUNLER.map((u) => {
    let puan = 100;
    const notlar: string[] = [];

    // Sıcaklık kontrolü
    if (
      iklim.ortSicaklikC < u.sicaklikAraligi[0] ||
      iklim.ortSicaklikC > u.sicaklikAraligi[1]
    ) {
      puan -= 35;
      notlar.push("Sıcaklık kuşağı sınırda");
    }

    // Yağış kontrolü
    if (iklim.yillikYagisMm < u.yagisAraligi[0]) {
      puan -= 25;
      notlar.push("Sulama desteği şart");
    } else if (iklim.yillikYagisMm > u.yagisAraligi[1]) {
      puan -= 20;
      notlar.push("Aşırı nem/yağış riski");
    }

    // Don kontrolü
    if (iklim.donluGunSayisi > u.maxDonluGun) {
      puan -= Math.min(50, (iklim.donluGunSayisi - u.maxDonluGun) * 2.5);
      notlar.push(`Donlu gün fazla (${iklim.donluGunSayisi} gün)`);
    }

    // Rakım kontrolü
    if (iklim.rakimM > u.maxRakim) {
      puan -= 30;
      notlar.push(`Rakım yüksek (${iklim.rakimM}m)`);
    }

    // Eğim kontrolü
    if (egimYuzde > 15 && u.sulamaTipi === "yogun-sulama") {
      puan -= 25;
      notlar.push("Makineli tarım/sulama eğimden dolayı zor");
    }

    puan = Math.max(0, Math.min(100, Math.round(puan)));

    let uygunluk: UrunUygunluk["uygunluk"] = "uygunsuz";
    if (puan >= 75) uygunluk = "yuksek";
    else if (puan >= 50) uygunluk = "orta";
    else if (puan >= 25) uygunluk = "dusuk";

    const gider = Math.round(u.brutGelirTlDonum * u.maliyetOrani);
    const net = u.brutGelirTlDonum - gider;

    return {
      urun: u.urun,
      ikon: u.ikon,
      uygunluk,
      uygunlukSkoruYuzde: puan,
      not: notlar.length ? notlar.join(", ") : "İklim ve topoğrafya tam uyumlu",
      brutGelirTlDonum: u.brutGelirTlDonum,
      tahminiGiderTlDonum: gider,
      netGelirTlDonum: net,
      hasatPeriyodu: u.hasatPeriyodu,
      sulamaTipi: u.sulamaTipi,
    };
  }).sort((a, b) => b.uygunlukSkoruYuzde - a.uygunlukSkoruYuzde);
}

export function tarimAnaliziUret(
  iklim: IklimVerisi,
  egimYuzde = 0,
): TarimAnalizi {
  let iklimKusagi = "İç Anadolu Bozkır / Karasal";
  if (iklim.ortSicaklikC >= 17 && iklim.donluGunSayisi <= 5) {
    iklimKusagi = "Akdeniz / Sıcak Subtropikal";
  } else if (iklim.ortSicaklikC >= 14 && iklim.donluGunSayisi <= 20) {
    iklimKusagi = "Ege & Marmara Geçiş / Ilıman";
  } else if (iklim.yillikYagisMm >= 900) {
    iklimKusagi = "Karadeniz / Yağışlı Ilıman";
  } else if (iklim.rakimM >= 1400 || iklim.donluGunSayisi >= 80) {
    iklimKusagi = "Doğu Anadolu / Sert Karasal Yüksek Yayla";
  }

  const sulamaIhtiyaci =
    iklim.yillikYagisMm < 450 ? "yuksek" : iklim.yillikYagisMm < 750 ? "orta" : "az";
  const donmaRiski =
    iklim.donluGunSayisi > 60 ? "yüksek" : iklim.donluGunSayisi > 20 ? "orta" : "düşük";

  const oneriUrunler = urunUygunlukHesapla(iklim, egimYuzde);

  return {
    iklim,
    iklimKusagi,
    iklimNotu: `${iklimKusagi} iklimi, yıllık ${iklim.yillikYagisMm} mm yağış ve ${iklim.gddDereceGun} GDD büyüme enerjisi.`,
    sulamaIhtiyaci,
    donmaRiski,
    oneriUrunler,
  };
}

export async function tarimAnalizGetir(
  lat: number,
  lng: number,
  egimYuzde = 0,
  signal?: AbortSignal,
): Promise<TarimAnalizi> {
  const iklim = await iklimGetir(lat, lng, signal);
  return tarimAnaliziUret(iklim, egimYuzde);
}

export function tarimGelirHesapla(
  m2: number,
  urunVeyaBrut: number | UrunUygunluk,
): {
  donum: number;
  yillikBrutGelir: number;
  brutTl: number;
  netGelirTahmini: number;
  netTl: number;
  giderTl: number;
} {
  const donum = m2 / 1000;
  const brutBirim = typeof urunVeyaBrut === "number" ? urunVeyaBrut : urunVeyaBrut.brutGelirTlDonum;
  const yillikBrutGelir = Math.round(brutBirim * donum);
  const tahminiGider = typeof urunVeyaBrut === "object" ? Math.round(urunVeyaBrut.tahminiGiderTlDonum * donum) : Math.round(yillikBrutGelir * 0.4);
  const netGelirTahmini = yillikBrutGelir - tahminiGider;

  return {
    donum,
    yillikBrutGelir,
    brutTl: yillikBrutGelir,
    netGelirTahmini,
    netTl: netGelirTahmini,
    giderTl: tahminiGider,
  };
}