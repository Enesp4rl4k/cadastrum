/**
 * Heuristic fiyat tahmin motoru.
 * Çoklu sinyali birleştirir: sahibinden ilanGozlem birikimi (varsa ground truth),
 * TKGM analiz likiditesi, çevre POI yoğunluğu, eğim, nitelik, konum.
 *
 * Çıktı: alt/beklenen/üst TL/m² + güven skoru + bileşen breakdown.
 */

import type { Parsel } from "../types/tkgm";
import type { CevreAnalizi } from "./osm";
import type { EgimAnalizi } from "./elevation";
import type { EPlanImarVerisi } from "./eplan";
import { db, type IlanGozlem } from "./db";
import { manuelVeriOku, type ManuelEmsal } from "./manuel-veri";

/**
 * Manuel girilen emsalleri IlanGozlem formatına çevirir.
 * Bu kayıtlar DB'ye yazılmaz, sadece tahmin için ek emsal olarak kullanılır.
 */
function manuelEmsaliIlanaCevir(parsel: Parsel, m: ManuelEmsal): IlanGozlem {
  return {
    id: -Math.abs(parseInt(m.id.replace(/\D/g, "").slice(0, 9), 10) || 1),
    kaynak: "sahibinden", // virtual — schema'ya uyum için
    ilanNo: `manuel-${m.id}`,
    url: "manuel://",
    baslik: m.notlar ?? `Manuel emsal (${m.kategori})`,
    ilAd: parsel.ilAd ?? null,
    ilceAd: parsel.ilceAd ?? null,
    mahalleAd: parsel.mahalleAd ?? null,
    ilNorm: null,
    ilceNorm: null,
    mahalleNorm: null,
    imarDurumu: null,
    fiyat: m.fiyatTL,
    m2: m.m2,
    fiyatPerM2: m.fiyatPerM2,
    paraBirimi: "TL",
    adaNo: null,
    parselNo: null,
    zaman: m.girilmeTarihi,
  };
}
import { bolgeFiyatOzetiHesapla, dinamikIndirimOrani, outlierTemizle, outlierTemizleBaglamsalAsimli } from "./fiyat-correction";
import { normalizeYerAdi } from "./tkgm-api";
import { dovizliMi, fiyatPerM2TLOlarak } from "./kur";
import { ilceBaselineGetir } from "./data/ilce-baseline";
import { enflasyonDuzelt } from "./enflasyon-duzeltme";
import { mahalleBaselineGetirAsync, triangulateBaseline, baselineBandGenisletme, type TriangulasyonKaynak } from "./baseline-engine";
import { apiFiyatMahalleSorgula } from "./api-fiyat";
import { ilLikiditeCarpani } from "./data/il-likidite";
import { biasCarpani } from "./bias-kalibrasyon";
import { depremRiskiGetir } from "./data/deprem-zonlari";
import { pgaCarpani } from "./deprem-tdth";
import { taskinRiskiGetir, taskinCarpani } from "./data/taskin-risk";
import { nufusCarpani } from "./data/il-nufus";

export interface FiyatBileseni {
  ad: string;
  carpan: number;
  not: string;
}

export interface FiyatTahmini {
  /** TL/m² alt sınır */
  altPerM2: number;
  /** TL/m² beklenen */
  beklenenPerM2: number;
  /** TL/m² üst sınır */
  ustPerM2: number;
  /** Toplam parsel TL alt */
  toplamAlt: number;
  /** Toplam parsel TL beklenen */
  toplamBeklenen: number;
  /** Toplam parsel TL üst */
  toplamUst: number;
  /** Bileşen çarpanları (heuristic chain) */
  bilesenler: FiyatBileseni[];
  /** "yuksek" = çok ilan gözlemi var, "orta" = az gözlem, "dusuk" = sadece baseline */
  guven: "yuksek" | "orta" | "dusuk";
  guvenAciklama: string;
  /** Hangi kaynak baseline olarak kullanıldı */
  baselineKaynak: "spatial-radius" | "ilanGozlem-mahalle" | "ilanGozlem-ilce" | "mahalle-baseline" | "ilce-semt-baseline" | "ilce-baseline" | "il-baseline" | "fallback";
  baselineDeger: number;
  baselineNot: string;
  /** Kullanılan ilanGozlem kayıt sayısı (0 = statik tablo) */
  baselineAdet: number;
  /** 0-100 arası özet güven skoru */
  guvenSkoru: number;
  /** Kullanıcıya gösterilecek veri kalitesi işaretleri */
  veriKalitesiNotlari: string[];
  guvenKirilimi: Array<{
    etiket: string;
    puan: number;
    durum: "pozitif" | "notr" | "uyari";
  }>;
  sonrakiHamleler: string[];
  aralikGenisligiYuzde: number;
  /** Emsal havuzunun yaş dağılımı — TR enflasyonunda taze veri kritik */
  tazelikOzeti: {
    /** Toplam aday (yaş filtresinden önce) */
    havuzAdet: number;
    /** Yaş filtresinden geçen ve emsal seçilebilen taze ilan sayısı */
    tazeAdet: number;
    /** Atılan stale ilan sayısı (180+ gün) */
    stalAdet: number;
    /** Son 30 gündeki ilan sayısı */
    son30Gun: number;
    /** Son 90 gündeki ilan sayısı */
    son90Gun: number;
    /** Seçilen emsallerin ağırlıklı ortalama yaşı (gün) */
    ortalamaYasGun: number;
  } | null;
  /** Kullanılan emsal havuzu özeti */
  emsalOzeti: {
    secilenAdet: number;
    mahalleAdet: number;
    ilceAdet: number;
    dogrulanabilirAdet: number;
    ortalamaBenzerlik: number;
    weightedAsking: number;
    /** Tukey IQR ile havuz dışı bırakılan aykırı sayısı */
    outlierAdet: number;
    /** Güncel kurla TL'ye çevrilen dövizli ilan sayısı */
    dovizDonusturulenAdet: number;
  } | null;
  imarOzeti: {
    sinif: ImarSinifi;
    kaynak: "eplan-resmi" | "ilan-imar" | "parsel-nitelik";
    not: string;
    resmiDetay: {
      kullanimKarari: string | null;
      planKarari: string | null;
      yapiNizami: string | null;
      emsal: number | null;
      taks: number | null;
      maksKat: number | null;
      yakalandiAt: number | null;
      guvenSkoru: number | null;
    } | null;
  };
  /** AI için ham emsal verileri */
  emsalListesi: Array<{
    fiyatPerM2: number;
    alan: number;
    benzerlik: number;
    tazelikGun: number;
    ilanNo: string;
  }>;
  /** Triangulasyon kaynakları yüksek varyans gösterdi — UI manuel kontrol rozetini göster */
  manuelReviewGerek?: boolean;
}

// İl bazlı baseline TL/m² değerleri (arsa için, ortalama 2025).
// Sahibinden ilanGozlem birikmediği zaman fallback olarak kullanılır.
const IL_BASELINE_ARSA_TL_M2: Record<string, number> = {
  // Mega şehirler
  "İstanbul": 18000,
  "Ankara": 6000,
  "İzmir": 10000,
  // Sahil + büyükşehir
  "Antalya": 8000,
  "Muğla": 7000,
  "Bursa": 5000,
  "Kocaeli": 4500,
  "Sakarya": 3500,
  "Tekirdağ": 3000,
  "Yalova": 4000,
  // Anadolu büyükşehir
  "Adana": 3500,
  "Mersin": 3500,
  "Gaziantep": 2800,
  "Konya": 2500,
  "Kayseri": 2200,
  "Eskişehir": 3200,
  "Diyarbakır": 1800,
  "Samsun": 2500,
  "Trabzon": 3500,
  "Şanlıurfa": 1500,
  "Hatay": 2200,
  "Manisa": 2000,
  "Balıkesir": 2800,
  "Denizli": 2500,
  "Erzurum": 1500,
  "Kahramanmaraş": 1800,
  "Malatya": 1500,
  "Mardin": 1300,
  "Van": 1200,
  "Ordu": 2000,
  // Diğer (default fallback değer kullanılır)
};
const FALLBACK_BASELINE_TL_M2 = 1000;

/**
 * İl bazlı kırsal tarla baseline TL/m² — urban arsa'dan farklı.
 * Konya/Meram/Çukurçimen gibi kırsal mahalle tarla'sı için urban arsa baseline
 * kullanmak 10-15x overshoot'a yol açıyordu.
 *
 * Kaynak: kabaca Sahibinden tarla ilanları ortalamasından çıkarıldı (2025).
 * Sahibinden ilanGozlem birikince bu fallback'e ihtiyaç kalmaz.
 */
const IL_BASELINE_TARLA_TL_M2: Record<string, number> = {
  // Mega + sahil — yatırım baskısı yüksek
  "İstanbul": 2500,
  "Ankara": 900,
  "İzmir": 1500,
  "Antalya": 1500,
  "Muğla": 1300,
  "Bursa": 800,
  "Kocaeli": 700,
  "Sakarya": 500,
  "Tekirdağ": 500,
  "Yalova": 800,
  // Anadolu büyükşehir
  "Adana": 350,
  "Mersin": 500,
  "Gaziantep": 250,
  "Konya": 200,
  "Kayseri": 200,
  "Eskişehir": 350,
  "Diyarbakır": 120,
  "Samsun": 300,
  "Trabzon": 600,
  "Şanlıurfa": 100,
  "Hatay": 350,
  "Manisa": 350,
  "Balıkesir": 500,
  "Denizli": 300,
  "Erzurum": 80,
  "Kahramanmaraş": 180,
  "Malatya": 130,
  "Mardin": 100,
  "Van": 80,
  "Ordu": 350,
};
const FALLBACK_TARLA_BASELINE_TL_M2 = 200;

/** Parsel nitelik metni tarımsal mı? (Tarla, bahçe, bağ, zeytinlik)
 *  /u flag — TR karakterlerini Unicode word-char olarak değerlendirir,
 *  yoksa "Bağ" gibi ğ ile biten kelimelerde \b çalışmaz. */
function tarımsalMi(nitelik: string): boolean {
  return /tarla|bahçe|bahce|bağ\b|bag\b|zeytin/iu.test(nitelik);
}
const MIN_MAHALLE_BASELINE_SAMPLES = 3;
const MIN_ILCE_BASELINE_SAMPLES = 5;
const GUN_MS = 86_400_000;
/** TR enflasyonunda 180+ gün eski ilan ortalamayı bozar — havuzdan at */
const MAX_ILAN_YASI_GUN = 180;

/**
 * Veri tazeliği ağırlığı — TR'de yıllık %30+ enflasyon nedeniyle eski
 * ilanlar baseline'i sistemik olarak düşük gösterir. Taze veriyi öne çıkar.
 *
 * Sürekli (continuous) eksponansiyel decay — eski basamak fonksiyonu
 * 30/90 gün eşiklerinde sert sıçramalar üretiyordu.
 *
 * Half-life ≈ 60 gün:
 *   w(0)   = 1.00
 *   w(30)  ≈ 0.71
 *   w(60)  = 0.50
 *   w(90)  ≈ 0.35
 *   w(120) = 0.25
 *   w(150) ≈ 0.18
 *   w(180) ≈ 0.13  (cutoff sonrası 0)
 */
export function yasAgirligi(zaman: number): number {
  if (!zaman || zaman <= 0) return 0;
  const gun = (Date.now() - zaman) / GUN_MS;
  if (gun < 0) return 1.0; // gelecek tarih → muhtemelen scrape hatası, dokunma
  if (gun > MAX_ILAN_YASI_GUN) return 0;
  return Math.exp((-Math.LN2 * gun) / 60);
}
const HEURISTIC_MULTIPLIER_MIN = 0.70;
const HEURISTIC_MULTIPLIER_MAX = 1.35;
const EMSAL_MIN_BENZERLIK = 0.45;
const EMSAL_MAX_SECIM = 12;
const EMSAL_MAX_ILCE_DESTEK = 5;

const NITELIK_CARPANI: { ad: string; pattern: RegExp; carpan: number; not: string }[] = [
  { ad: "Arsa", pattern: /arsa/i, carpan: 1.0, not: "İmara açık (baseline)" },
  { ad: "Mesken / Bina", pattern: /mesken|bina|işyeri|isyeri/i, carpan: 2.5, not: "Yapı var, +%150" },
  { ad: "Bahçe", pattern: /bahçe|bahce/i, carpan: 0.7, not: "Yarı tarımsal, -%30" },
  { ad: "Bağ", pattern: /bağ\b|bag\b/iu, carpan: 0.55, not: "Bağ niteliği, -%45" },
  { ad: "Tarla", pattern: /tarla/i, carpan: 0.25, not: "Tarımsal, -%75 (imar değişikliği zor)" },
  { ad: "Zeytinlik", pattern: /zeytin/i, carpan: 0.4, not: "3573 sayılı kanun kısıtlaması" },
  { ad: "Yol", pattern: /^yol/i, carpan: 0, not: "Kamu yolu — özel mülk değil" },
];

function nitelikCarpani(nitelik: string): { carpan: number; not: string; ad: string } {
  for (const n of NITELIK_CARPANI) {
    if (n.pattern.test(nitelik)) return { carpan: n.carpan, not: n.not, ad: n.ad };
  }
  return { carpan: 0.5, not: `Bilinmeyen nitelik: ${nitelik}`, ad: "Diğer" };
}

type EmsalSegment =
  | "arsa"
  | "tarla"
  | "bahce"
  | "bag"
  | "zeytinlik"
  | "built"
  | "road"
  | "other";

type AlanBand = "micro" | "kucuk" | "orta" | "buyuk" | "cok-buyuk";

type ImarSinifi =
  | "konut-imarli"
  | "ticari-imarli"
  | "sanayi-imarli"
  | "arsa-imar-belirsiz"
  | "tarimsal"
  | "korumali"
  | "yapi-mevcut"
  | "belirsiz";

interface EmsalAdayi {
  kayit: IlanGozlem;
  weight: number;
  areaScore: number;
  bandScore: number;
  locationScore: number;
  segmentScore: number;
  imarScore: number;
  /** Yaş ağırlığı (0-1) — taze ilanlar 1.0, 90+ gün 0.3 */
  yasW: number;
  /** İlanın gün cinsinden yaşı */
  yasGun: number;
  /** TL'ye çevrilmiş fiyat/m² (USD/EUR ilanları için kur uygulanmış) */
  fiyatPerM2TL: number;
  /** İlan kuruşaltı dövizli mi (UI'da göstermek için) */
  dovizDonusumYapildi: boolean;
  segment: EmsalSegment;
  isSameMahalle: boolean;
  isSameIlce: boolean;
  hasAdaParsel: boolean;
}

interface EmsalHavuzuOzeti {
  baseline: number;
  kaynak: FiyatTahmini["baselineKaynak"];
  not: string;
  guvenAdet: number;
  ozet: import("./fiyat-correction").BolgeFiyatOzeti;
  veriKalitesiNotlari: string[];
  secilenAdet: number;
  mahalleAdet: number;
  ilceAdet: number;
  dogrulanabilirAdet: number;
  ortalamaBenzerlik: number;
  weightedAsking: number;
  tazelikOzeti: FiyatTahmini["tazelikOzeti"];
}

function alanBandi(alan: number): AlanBand {
  if (alan < 250) return "micro";
  if (alan < 1000) return "kucuk";
  if (alan < 5000) return "orta";
  if (alan < 20000) return "buyuk";
  return "cok-buyuk";
}

function alanBandUyumu(parselAlan: number, ilanM2: number | null): number {
  if (!ilanM2 || ilanM2 <= 0) return 0.7;
  const parselBand = alanBandi(parselAlan);
  const ilanBand = alanBandi(ilanM2);
  if (parselBand === ilanBand) return 1;
  const bands: AlanBand[] = ["micro", "kucuk", "orta", "buyuk", "cok-buyuk"];
  const fark = Math.abs(bands.indexOf(parselBand) - bands.indexOf(ilanBand));
  if (fark === 1) return 0.86;
  if (fark === 2) return 0.68;
  return 0.45;
}

function segmentBul(metin: string | null | undefined): EmsalSegment {
  const text = (metin ?? "").toLocaleLowerCase("tr");
  if (/yol/.test(text)) return "road";
  if (/mesken|bina|işyeri|isyeri|villa|daire|depo/.test(text)) return "built";
  if (/zeytin/.test(text)) return "zeytinlik";
  if (/(^|\s)bağ($|\s)|(^|\s)bag($|\s)/.test(text)) return "bag";
  if (/bahçe|bahce/.test(text)) return "bahce";
  if (/tarla/.test(text)) return "tarla";
  if (/arsa|imar|villa imarlı|konut imarlı|ticari imarlı/.test(text)) return "arsa";
  return "other";
}

function segmentUyumu(parselSegment: EmsalSegment, ilanSegment: EmsalSegment): number {
  if (parselSegment === "road" || ilanSegment === "road") return 0;
  if (parselSegment === ilanSegment) return 1;
  const urban = new Set<EmsalSegment>(["arsa", "built"]);
  const softRural = new Set<EmsalSegment>(["bahce", "bag", "zeytinlik"]);
  if (urban.has(parselSegment) && urban.has(ilanSegment)) return 0.82;
  if (softRural.has(parselSegment) && softRural.has(ilanSegment)) return 0.76;
  if (
    (parselSegment === "tarla" && softRural.has(ilanSegment)) ||
    (ilanSegment === "tarla" && softRural.has(parselSegment))
  ) {
    return 0.62;
  }
  if (
    (urban.has(parselSegment) && softRural.has(ilanSegment)) ||
    (urban.has(ilanSegment) && softRural.has(parselSegment))
  ) {
    return 0.4;
  }
  return 0.3;
}

function imarSiniflandir(parsel: Parsel, imarDurumu?: string | null): {
  sinif: ImarSinifi;
  kaynak: "ilan-imar" | "parsel-nitelik";
  not: string;
} {
  const text = (imarDurumu ?? "").toLocaleLowerCase("tr");
  if (text) {
    if (/sit|koruma|orman|mera|kıyı|kiyi|sulak|askeri/.test(text)) {
      return { sinif: "korumali", kaynak: "ilan-imar", not: `İlanda korumalı/kısıtlı sinyal var: ${imarDurumu}` };
    }
    if (/sanayi|depo|lojistik|organize sanayi|osb/.test(text)) {
      return { sinif: "sanayi-imarli", kaynak: "ilan-imar", not: `Sanayi/depo kullanımı: ${imarDurumu}` };
    }
    if (/ticari|ticaret|akaryakıt|avm|dükkan|dukkan/.test(text)) {
      return { sinif: "ticari-imarli", kaynak: "ilan-imar", not: `Ticari kullanım sinyali: ${imarDurumu}` };
    }
    if (/villa|konut|imarlı|imarli|resmi kurum|turizm/.test(text)) {
      return { sinif: "konut-imarli", kaynak: "ilan-imar", not: `İmarlı/konut kullanımı sinyali: ${imarDurumu}` };
    }
    if (/tarla|bahçe|bahce|bağ|bag|zeytin|tarım|tarim/.test(text)) {
      return { sinif: "tarimsal", kaynak: "ilan-imar", not: `Tarımsal kullanım sinyali: ${imarDurumu}` };
    }
    if (/arsa/.test(text)) {
      return { sinif: "arsa-imar-belirsiz", kaynak: "ilan-imar", not: `Arsa ifadesi var ama imar türü net değil: ${imarDurumu}` };
    }
  }

  const nitelik = parsel.nitelik.toLocaleLowerCase("tr");
  if (/mesken|bina|işyeri|isyeri/.test(nitelik)) {
    return { sinif: "yapi-mevcut", kaynak: "parsel-nitelik", not: `Parsel niteliğinde yapı mevcut: ${parsel.nitelik}` };
  }
  if (/tarla|bahçe|bahce|bağ|bag|zeytin/.test(nitelik)) {
    return { sinif: "tarimsal", kaynak: "parsel-nitelik", not: `Parsel niteliği tarımsal: ${parsel.nitelik}` };
  }
  if (/arsa/.test(nitelik)) {
    return { sinif: "arsa-imar-belirsiz", kaynak: "parsel-nitelik", not: `Parsel arsa olarak geçiyor ama imar tipi net değil: ${parsel.nitelik}` };
  }
  return { sinif: "belirsiz", kaynak: "parsel-nitelik", not: `İmar sınıfı çıkarılamadı: ${parsel.nitelik}` };
}

function resmiImarSiniflandir(veri: EPlanImarVerisi): {
  sinif: ImarSinifi;
  kaynak: "eplan-resmi";
  not: string;
} {
  const metin = [
    veri.kullanimKarari,
    veri.planKarari,
    veri.planNotu,
    veri.yapiNizami,
    veri.hamMetin.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr");

  if (/sit|koruma|orman|mera|kıyı|kiyi|sulak|askeri/.test(metin)) {
    return {
      sinif: "korumali",
      kaynak: "eplan-resmi",
      not: `Resmi e-Plan kaydında kısıt/koruma sinyali var: ${veri.kullanimKarari ?? veri.planKarari ?? "detay yok"}`,
    };
  }
  if (/sanayi|depo|lojistik|organize sanayi|osb/.test(metin)) {
    return {
      sinif: "sanayi-imarli",
      kaynak: "eplan-resmi",
      not: `Resmi e-Plan kullanım kararı sanayi/depo yönünde: ${veri.kullanimKarari ?? veri.planKarari ?? "detay yok"}`,
    };
  }
  if (/ticari|ticaret|akaryakıt|akaryakit|avm|dükkan|dukkan/.test(metin)) {
    return {
      sinif: "ticari-imarli",
      kaynak: "eplan-resmi",
      not: `Resmi e-Plan kullanım kararı ticari: ${veri.kullanimKarari ?? veri.planKarari ?? "detay yok"}`,
    };
  }
  if (/villa|konut|imarlı|imarli|resmi kurum|turizm/.test(metin)) {
    return {
      sinif: "konut-imarli",
      kaynak: "eplan-resmi",
      not: `Resmi e-Plan kullanım kararı imarlı/konut yönünde: ${veri.kullanimKarari ?? veri.planKarari ?? "detay yok"}`,
    };
  }
  if (/tarla|bahçe|bahce|bağ|bag|zeytin|tarım|tarim/.test(metin)) {
    return {
      sinif: "tarimsal",
      kaynak: "eplan-resmi",
      not: `Resmi e-Plan kullanım kararı tarımsal: ${veri.kullanimKarari ?? veri.planKarari ?? "detay yok"}`,
    };
  }
  if (/arsa/.test(metin)) {
    return {
      sinif: "arsa-imar-belirsiz",
      kaynak: "eplan-resmi",
      not: `Resmi e-Plan verisi arsa sinyali içeriyor ama kullanım türü net değil: ${veri.kullanimKarari ?? veri.planKarari ?? "detay yok"}`,
    };
  }
  return {
    sinif: "belirsiz",
    kaynak: "eplan-resmi",
    not: `Resmi e-Plan verisi bulundu ama imar sınıfı açık okunamadı.`,
  };
}

function imarCarpani(
  imar: ReturnType<typeof imarSiniflandir> | ReturnType<typeof resmiImarSiniflandir>,
  baselineKategori?: "arsa" | "tarla",
): {
  carpan: number;
  not: string;
} {
  const isTarlaBaseline = baselineKategori === "tarla";

  switch (imar.sinif) {
    case "konut-imarli":
      // Tarla baseline'dan konut imara geçiş büyük bir sıçramadır
      return {
        carpan: isTarlaBaseline ? 3.5 : 1.22,
        not: `${imar.not} · ${isTarlaBaseline ? "tarla->konut imar kategori primi" : "konut/villa imarı primi"}`,
      };
    case "ticari-imarli":
      return {
        carpan: isTarlaBaseline ? 4.2 : 1.3,
        not: `${imar.not} · ${isTarlaBaseline ? "tarla->ticaret imar kategori primi" : "ticari imar primi"}`,
      };
    case "sanayi-imarli":
      return {
        carpan: isTarlaBaseline ? 3.0 : 1.18,
        not: `${imar.not} · ${isTarlaBaseline ? "tarla->sanayi imar kategori primi" : "sanayi/depo kullanımı"}`,
      };
    case "arsa-imar-belirsiz":
      return {
        carpan: isTarlaBaseline ? 2.5 : 1.05,
        not: `${imar.not} · ${isTarlaBaseline ? "tarla->arsa imar geçişi" : "hafif pozitif"}`,
      };
    case "yapi-mevcut":
      return { carpan: 1.12, not: `${imar.not} · mevcut yapı avantajı` };
    case "tarimsal":
      // Zaten tarla baseline'ındaysak indirim yapma (1.0)
      return {
        carpan: isTarlaBaseline ? 1.0 : 0.72,
        not: isTarlaBaseline
          ? `${imar.not} · tarımsal baseline kalibreli`
          : `${imar.not} · tarımsal kullanım indirimi`,
      };
    case "korumali":
      return { carpan: 0.55, not: `${imar.not} · kısıt/korumalı alan indirimi` };
    case "belirsiz":
    default:
      return { carpan: 1.0, not: imar.not };
  }
}

function imarUyumu(parselImar: ImarSinifi, ilanImar: ImarSinifi): number {
  if (parselImar === ilanImar) return 1;
  const urban = new Set<ImarSinifi>(["konut-imarli", "ticari-imarli", "sanayi-imarli", "arsa-imar-belirsiz", "yapi-mevcut"]);
  const rural = new Set<ImarSinifi>(["tarimsal"]);
  const restricted = new Set<ImarSinifi>(["korumali"]);
  if (restricted.has(parselImar) || restricted.has(ilanImar)) {
    return parselImar === ilanImar ? 0.85 : 0.2;
  }
  if (urban.has(parselImar) && urban.has(ilanImar)) {
    if (
      (parselImar === "ticari-imarli" && ilanImar === "sanayi-imarli") ||
      (parselImar === "sanayi-imarli" && ilanImar === "ticari-imarli")
    ) {
      return 0.68;
    }
    return 0.82;
  }
  if (rural.has(parselImar) && rural.has(ilanImar)) return 0.9;
  if ((urban.has(parselImar) && rural.has(ilanImar)) || (urban.has(ilanImar) && rural.has(parselImar))) {
    return 0.25;
  }
  return 0.5;
}

function alanBenzerlikSkoru(parselAlan: number, ilanM2: number | null): number {
  if (!ilanM2 || ilanM2 <= 0 || parselAlan <= 0) return 0.45;
  const ratio = Math.max(parselAlan, ilanM2) / Math.max(1, Math.min(parselAlan, ilanM2));
  if (ratio <= 1.25) return 1;
  if (ratio <= 1.75) return 0.88;
  if (ratio <= 2.5) return 0.72;
  if (ratio <= 4) return 0.56;
  return 0.38;
}

function weightedAverage(values: Array<{ value: number; weight: number }>): number {
  if (values.length === 0) return 0;
  const totalWeight = values.reduce((s, v) => s + v.weight, 0);
  if (totalWeight <= 0) return 0;
  return values.reduce((s, v) => s + v.value * v.weight, 0) / totalWeight;
}

function weightedMedian(values: Array<{ value: number; weight: number }>): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a.value - b.value);
  const totalWeight = sorted.reduce((s, v) => s + v.weight, 0);
  if (totalWeight <= 0) return sorted[Math.floor(sorted.length / 2)]?.value ?? 0;
  let acc = 0;
  for (const item of sorted) {
    acc += item.weight;
    if (acc >= totalWeight / 2) return item.value;
  }
  return sorted[sorted.length - 1]?.value ?? 0;
}

function emsalAdaylariniOlustur(parsel: Parsel, kayitlar: IlanGozlem[]): EmsalAdayi[] {
  const mahalleNorm = parsel.mahalleAd ? normalizeYerAdi(parsel.mahalleAd) : "";
  const ilceNorm = parsel.ilceAd ? normalizeYerAdi(parsel.ilceAd) : "";
  const parselSegment = segmentBul(parsel.nitelik);
  const parselImar = imarSiniflandir(parsel, null);

  const adaylar: EmsalAdayi[] = [];
  for (const kayit of kayitlar) {
    // TL ise direkt kullan; USD/EUR/GBP ise kura çevirip TL/m²'yi hesapla.
    // Para birimi tanınmıyorsa havuza alma.
    let fiyatPerM2TL: number | null = null;
    if (kayit.paraBirimi === "TL" || kayit.paraBirimi == null) {
      fiyatPerM2TL = typeof kayit.fiyatPerM2 === "number" && kayit.fiyatPerM2 > 0
        ? kayit.fiyatPerM2
        : null;
    } else if (dovizliMi(kayit.paraBirimi)) {
      fiyatPerM2TL = fiyatPerM2TLOlarak(kayit.fiyat, kayit.m2, kayit.paraBirimi);
    }
    if (fiyatPerM2TL == null || fiyatPerM2TL <= 0) continue;
      // Yaş filtresi — 180+ gün stale ilanları havuza alma
      const yasW = yasAgirligi(kayit.zaman);
      if (yasW === 0) continue;
      const yasGun = Math.max(0, (Date.now() - (kayit.zaman ?? Date.now())) / GUN_MS);

      const kayitIlceNorm = kayit.ilceNorm ?? (kayit.ilceAd ? normalizeYerAdi(kayit.ilceAd) : "");
      const kayitMahalleNorm =
        kayit.mahalleNorm ?? (kayit.mahalleAd ? normalizeYerAdi(kayit.mahalleAd) : "");
      const isSameIlce = !!ilceNorm && kayitIlceNorm === ilceNorm;
      const isSameMahalle = !!mahalleNorm && kayitMahalleNorm === mahalleNorm;
      if (!isSameIlce) continue;

      const segment = segmentBul(`${kayit.baslik ?? ""} ${kayit.imarDurumu ?? ""}`);
      const segmentScore = segmentUyumu(parselSegment, segment);
      const ilanImar = imarSiniflandir(parsel, kayit.imarDurumu);
      const imarScore = imarUyumu(parselImar.sinif, ilanImar.sinif);
      const areaScore = alanBenzerlikSkoru(parsel.alan, kayit.m2);
      const bandScore = alanBandUyumu(parsel.alan, kayit.m2);
      const locationScore = isSameMahalle ? 1 : 0.74;
      const hasAdaParsel = kayit.adaNo != null && kayit.parselNo != null;
      let qualityBonus = 1;
      if (hasAdaParsel) qualityBonus += 0.1;
      if (kayit.imarDurumu) qualityBonus += 0.04;
      if (kayit.baslik) qualityBonus += 0.03;
      // Yaş ağırlığı doğrudan weight'e çarpılır — taze ilanlar baskın olsun
      const weight = clamp(
        locationScore * segmentScore * imarScore * areaScore * bandScore * qualityBonus * yasW,
        0,
        1.25,
      );
      if (weight < EMSAL_MIN_BENZERLIK) continue;

      adaylar.push({
        kayit,
        weight,
        areaScore,
        bandScore,
        locationScore,
        segmentScore,
        imarScore,
        yasW,
        yasGun,
        fiyatPerM2TL,
        dovizDonusumYapildi: dovizliMi(kayit.paraBirimi),
        segment,
        isSameMahalle,
        isSameIlce,
        hasAdaParsel,
      });
  }

  return adaylar.sort((a, b) => b.weight - a.weight);
}

function emsalSec(adaylar: EmsalAdayi[]): EmsalAdayi[] {
  const ayniMahalle = adaylar.filter((a) => a.isSameMahalle).slice(0, EMSAL_MAX_SECIM);
  const secilen: EmsalAdayi[] = [...ayniMahalle];
  if (secilen.length >= EMSAL_MAX_SECIM) return secilen;

  const ilceDestek = adaylar
    .filter((a) => !a.isSameMahalle)
    .slice(0, Math.min(EMSAL_MAX_ILCE_DESTEK, EMSAL_MAX_SECIM - secilen.length));
  secilen.push(...ilceDestek);
  return secilen.slice(0, EMSAL_MAX_SECIM);
}

function yerelBaselineAgirligi(args: {
  secilenAdet: number;
  ortalamaBenzerlik: number;
  ortalamaYasGun: number;
  mahalleOrani: number;
  alanBandUyumOrani: number;
}): number {
  const adetSkoru = clamp(args.secilenAdet / 8, 0.25, 1);
  // Floor kaldırıldı (eski clamp 0.45 düşük benzerlikli havuzu suni olarak yüksek
  // güvenli gösteriyordu). Havuz zaten EMSAL_MIN_BENZERLIK altı emsali eliyor;
  // burada gerçek ortalamayı yansıt → düşük güven → bant otomatik genişlesin.
  const benzerlikSkoru = clamp(args.ortalamaBenzerlik, 0, 1);
  const tazelikSkoru =
    args.ortalamaYasGun <= 30 ? 1 :
    args.ortalamaYasGun <= 60 ? 0.9 :
    args.ortalamaYasGun <= 90 ? 0.78 :
    args.ortalamaYasGun <= 120 ? 0.66 : 0.55;
  const mahalleSkoru = clamp(0.55 + args.mahalleOrani * 0.45, 0.55, 1);
  const bandSkoru = clamp(0.5 + args.alanBandUyumOrani * 0.5, 0.5, 1);
  return clamp(
    adetSkoru * 0.32 +
      benzerlikSkoru * 0.24 +
      tazelikSkoru * 0.18 +
      mahalleSkoru * 0.14 +
      bandSkoru * 0.12,
    0.35,
    0.94,
  );
}

async function destekBaselineGetir(
  parsel: Parsel,
  kategori: "arsa" | "tarla",
): Promise<{
  baseline: number;
  kaynak: "mahalle-baseline" | "ilce-semt-baseline" | "ilce-baseline" | "il-baseline" | "fallback";
  not: string;
} | null> {
  const mahalleSonuc = await mahalleBaselineGetirAsync(
    parsel.ilAd,
    parsel.ilceAd,
    parsel.mahalleAd,
    kategori,
  );
  if (mahalleSonuc && mahalleSonuc.kaynak !== "ilce-only" && mahalleSonuc.kaynak !== "fallback") {
    return {
      baseline: mahalleSonuc.baseline,
      kaynak: "mahalle-baseline",
      not: mahalleSonuc.not,
    };
  }

  const ilceStatik = ilceBaselineGetir(
    parsel.ilAd ?? "",
    parsel.ilceAd ?? "",
    parsel.mahalleAd,
    kategori,
  );
  if (ilceStatik) return ilceStatik;

  if (kategori === "tarla") {
    const tarlaBaselineHam =
      IL_BASELINE_TARLA_TL_M2[parsel.ilAd] ?? FALLBACK_TARLA_BASELINE_TL_M2;
    const { guncelFiyat: tarlaBaseline } = enflasyonDuzelt(tarlaBaselineHam);
    return {
      baseline: tarlaBaseline,
      kaynak: "il-baseline",
      not: `${parsel.ilAd} ili tarımsal il baseline desteği`,
    };
  }

  const ilBaselineHam = IL_BASELINE_ARSA_TL_M2[parsel.ilAd];
  if (ilBaselineHam) {
    const { guncelFiyat: ilBaseline } = enflasyonDuzelt(ilBaselineHam);
    return {
      baseline: ilBaseline,
      kaynak: "il-baseline",
      not: `${parsel.ilAd} ili arsa il baseline desteği`,
    };
  }

  return {
    baseline: FALLBACK_BASELINE_TL_M2,
    kaynak: "fallback",
    not: "Genel fallback baseline desteği",
  };
}

function alanCarpani(alan: number): { carpan: number; not: string } {
  // Küçük arsa m² primi yüksek (köşeli, hızlı satılır), büyük arsa m² primi düşer.
  // Kademeler 13K emlakjet ilanından mahalle-içi leave-one-out ile kalibre edildi
  // (scripts/backtest-baseline.mjs): gerçek <200 ×2.98, 200-750 ×1.52, 2500-10k ×0.66, >10k ×0.47.
  // Önceki el-ayarı (1.25/1.10/0.9/0.75) m² etkisini ~2 kat hafife alıyordu; kalibrasyon
  // mahalle-içi MAPE'yi −%6.7 düşürdü. <200 kademesi ×2.0'a sınırlandı (143 örnek, gürültü guard).
  if (alan < 200) return { carpan: 2.0, not: "Mikro arsa, m² primi çok yüksek" };
  if (alan < 750) return { carpan: 1.5, not: "Küçük arsa, m² primi yüksek" };
  if (alan < 2500) return { carpan: 1.0, not: "Orta — referans" };
  if (alan < 10000) return { carpan: 0.66, not: "Büyük, m² fiyatı belirgin düşer" };
  return { carpan: 0.48, not: "Çok büyük, parsellenmesi gerek — m² fiyatı yarılanır" };
}

function konumCarpani(parsel: Parsel): { carpan: number; not: string } {
  const il = parsel.ilAd?.trim() ?? "";
  const buyuksehirler = new Set([
    "İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Adana",
    "Gaziantep", "Konya", "Mersin", "Kocaeli", "Diyarbakır", "Eskişehir",
    "Sakarya", "Tekirdağ", "Samsun", "Şanlıurfa", "Trabzon", "Hatay",
    "Manisa", "Aydın", "Muğla", "Balıkesir", "Denizli", "Kayseri",
    "Kahramanmaraş", "Mardin", "Erzurum", "Van", "Malatya", "Ordu",
  ]);
  // Not: Kıyı çarpanı kaldırıldı — il ve ilçe baseline tabloları zaten
  // kıyı primini yansıtıyor. Ekstra ×1.2 çift sayma (double-counting) yapıyordu
  // ve cold start'ta overblown tahminlere yol açıyordu.
  const notlar: string[] = [];
  if (buyuksehirler.has(il)) {
    notlar.push("büyükşehir");
  } else {
    notlar.push("iç il");
  }
  return { carpan: 1.0, not: notlar.join(", ") };
}

/**
 * Nüfus yoğunluğu fiyat çarpanı — TÜİK 2023 ADNKS verisine dayalı.
 * Yüksek yoğunluk = yüksek talep baskısı = arsa fiyatı yükseliş.
 * Özellikle fallback/il-baseline durumlarında belirleyici olur.
 */
function nufusYogunlukCarpani(ilNorm: string | null): { carpan: number; not: string } {
  if (!ilNorm) return { carpan: 1.0, not: "Nüfus verisi: il bilgisi yok" };
  const sonuc = nufusCarpani(ilNorm);
  if (sonuc.yogunluk === null) return { carpan: 1.0, not: "Nüfus verisi: il bulunamadı" };
  return {
    carpan: sonuc.carpan,
    not: sonuc.aciklama,
  };
}

function cevreCarpani(cevre: CevreAnalizi | null): { carpan: number; not: string } {
  if (!cevre) return { carpan: 1.0, not: "veri yok" };
  const p = cevre.poi;
  const toplam = p.okul + p.hastane + p.duraklar;
  // Sadece eğitim, sağlık ve duraklar (ulaşım) hesaplandığı için toplam sayılar daha düşüktür.
  if (toplam >= 15) return { carpan: 1.15, not: `${toplam} Makro POI (yoğun şehir)` };
  if (toplam >= 8) return { carpan: 1.10, not: `${toplam} Makro POI (gelişmiş)` };
  if (toplam >= 3) return { carpan: 1.05, not: `${toplam} Makro POI (orta)` };
  if (toplam >= 1) return { carpan: 1.0, not: `${toplam} Makro POI (banliyö)` };
  return { carpan: 0.90, not: "Makro POI yok (kırsal/sapa)" };
}

function kirsalCarpani(nitelik: string, kirsal: CevreAnalizi["kirsal"] | null): { carpan: number; not: string } {
  // Sadece kırsal nitelikli parseller için çalışır
  if (!/tarla|bahçe|bahce|zeytinlik|bağ\b|bag\b/i.test(nitelik)) {
    return { carpan: 1.0, not: "Uygulanmaz (Kentsel parsel)" };
  }
  if (!kirsal) return { carpan: 1.0, not: "Kırsal veri alınamadı" };

  let carpan = 1.0;
  const notlar: string[] = [];

  // Yola Cephe
  if (kirsal.yolaCepheM != null && kirsal.yolaCepheM <= 15) {
    carpan *= 1.30;
    notlar.push("Yola cephe (+%30)");
  } else if (kirsal.yolaCepheM != null && kirsal.yolaCepheM <= 150) {
    carpan *= 1.10;
    notlar.push("Yola yakın (+%10)");
  } else if (kirsal.yolaCepheM != null) {
    carpan *= 0.80;
    notlar.push("Yola uzak/Geçit hakkı (-%20)");
  } else {
    carpan *= 0.85;
    notlar.push("OSM yol işareti yok (-%15)");
  }

  // Su Kaynağı
  if (kirsal.suKaynagiM != null && kirsal.suKaynagiM <= 300) {
    carpan *= 1.20;
    notlar.push("Suya yakın (+%20)");
  }

  // Köy İçi / Yakınlığı
  if (kirsal.koyMerkeziM != null && kirsal.koyMerkeziM <= 300) {
    carpan *= 1.30;
    notlar.push("Köy içi imar potansiyeli (+%30)");
  }

  // Limitasyon
  if (carpan > 1.8) {
    carpan = 1.8;
    notlar.push("(Maks. prim)");
  }
  if (carpan < 0.6) {
    carpan = 0.6;
    notlar.push("(Maks. ceza)");
  }

  return { carpan: Number(carpan.toFixed(2)), not: notlar.length ? notlar.join(", ") : "Standart tarla" };
}

function egimCarpani(egim: EgimAnalizi | null): { carpan: number; not: string } {
  if (!egim) return { carpan: 1.0, not: "veri yok" };
  switch (egim.egimKategori) {
    case "duz": return { carpan: 1.05, not: "düz, +%5" };
    case "hafif": return { carpan: 1.0, not: "hafif eğim" };
    case "orta": return { carpan: 0.92, not: "orta eğim, -%8" };
    case "dik": return { carpan: 0.78, not: "dik, -%22" };
    case "cok-dik": return { carpan: 0.55, not: "çok dik, -%45" };
  }
}

function fiyatIcinImarSec(parsel: Parsel, resmiImar?: EPlanImarVerisi | null) {
  if (resmiImar) return resmiImarSiniflandir(resmiImar);
  return imarSiniflandir(parsel, null);
}

async function bolgeBaseliniGetir(parsel: Parsel, ekEmsaller: IlanGozlem[] = []): Promise<{
  baseline: number;
  kaynak: FiyatTahmini["baselineKaynak"];
  not: string;
  guvenAdet: number;
  ozet?: import("./fiyat-correction").BolgeFiyatOzeti;
  veriKalitesiNotlari: string[];
  emsalOzeti: FiyatTahmini["emsalOzeti"];
  tazelikOzeti: FiyatTahmini["tazelikOzeti"];
  /** Baseline tarımsal mı yoksa urban arsa mı için kalibre edilmiş — nitelik çarpanı normalize için */
  kategori: "arsa" | "tarla";
  emsalListesi: FiyatTahmini["emsalListesi"];
  /** Triangulasyon CV (0-1) — bant genişletmesi için */
  triUyumsuzluk?: number;
  /** Triangulasyon manuel review flag — yüksek varyans */
  triManuelReview?: boolean;
}> {
  const isTarımsal = tarımsalMi(parsel.nitelik);
  const veriKalitesiNotlari: string[] = [];
  const ilceNorm = parsel.ilceAd ? normalizeYerAdi(parsel.ilceAd) : "";
  const dbKayitlar = await db.ilanGozlem.toArray();
  const tumKayitlar = ekEmsaller.length > 0 ? [...dbKayitlar, ...ekEmsaller] : dbKayitlar;

  // Yaş filtresinden ÖNCEKİ havuz boyutunu say (debug + UI için)
  const ilceyeUygunHamHavuz = ilceNorm
    ? tumKayitlar.filter((k) => {
        const kayitIlceN = k.ilceNorm ?? (k.ilceAd ? normalizeYerAdi(k.ilceAd) : "");
        return kayitIlceN === ilceNorm;
      })
    : [];
  const stalAdet = ilceyeUygunHamHavuz.filter(
    (k) => k.zaman && (Date.now() - k.zaman) / GUN_MS > MAX_ILAN_YASI_GUN,
  ).length;

  const emsalAdaylari = ilceNorm ? emsalAdaylariniOlustur(parsel, tumKayitlar) : [];
  const secilenEmsaller = emsalSec(emsalAdaylari);
  const mahalleAdet = secilenEmsaller.filter((a) => a.isSameMahalle).length;
  const ilceAdet = secilenEmsaller.length - mahalleAdet;
  const minEmsal = mahalleAdet >= MIN_MAHALLE_BASELINE_SAMPLES ? MIN_MAHALLE_BASELINE_SAMPLES : MIN_ILCE_BASELINE_SAMPLES;

  // Seçilen emsallerin yaş dağılımı — UI'a göstereceğiz
  const tazelikOzeti = secilenEmsaller.length > 0
    ? {
        havuzAdet: ilceyeUygunHamHavuz.length,
        tazeAdet: secilenEmsaller.length,
        stalAdet,
        son30Gun: secilenEmsaller.filter((a) => a.yasGun <= 30).length,
        son90Gun: secilenEmsaller.filter((a) => a.yasGun <= 90).length,
        ortalamaYasGun: Math.round(
          weightedAverage(secilenEmsaller.map((a) => ({ value: a.yasGun, weight: a.weight }))),
        ),
      }
    : null;

  if (secilenEmsaller.length >= minEmsal) {
    // TL'ye çevrilmiş fiyatları kullan — USD/EUR ilanları artık havuzun dışında değil
    const fiyatlar = secilenEmsaller.map((a) => a.fiyatPerM2TL);
    // Bağlamsal outlier temizliği: önce il+kategori mutlak sınır, sonra IQR
    const ilNormStr = normalizeYerAdi(parsel.ilAd ?? "");
    const kategoriStr = parsel.nitelik
      ? normalizeYerAdi(parsel.nitelik).split(" ")[0] ?? "arsa"
      : "arsa";
    const baglamsalOutlier = outlierTemizleBaglamsalAsimli(fiyatlar, ilNormStr, kategoriStr);
    const outlier = { temiz: baglamsalOutlier.temiz, cikarilan: [...baglamsalOutlier.mutlakAtilanlar, ...baglamsalOutlier.iqrAtilanlar] };
    const temizSet = new Set(outlier.temiz);
    const temizEmsaller =
      outlier.temiz.length >= Math.max(3, Math.ceil(secilenEmsaller.length / 2))
        ? secilenEmsaller.filter((a) => temizSet.has(a.fiyatPerM2TL))
        : secilenEmsaller;
    const weightedValues = temizEmsaller.map((a) => ({
      value: a.fiyatPerM2TL,
      weight: a.weight,
    }));
    const weightedAsk = Math.round(weightedMedian(weightedValues));
    const weightedMeanAsk = Math.round(weightedAverage(weightedValues));
    const ortalamaYasGun = Math.round(
      weightedAverage(temizEmsaller.map((a) => ({ value: a.yasGun, weight: a.weight }))),
    );
    const yerelBenzerlikSkoru = weightedAverage(
      temizEmsaller.map((a) => ({ value: a.weight, weight: a.weight })),
    );
    const alanBandUyumluAdet = temizEmsaller.filter((a) => a.bandScore >= 0.86).length;
    const mahalleOrani = temizEmsaller.length > 0 ? mahalleAdet / temizEmsaller.length : 0;
    const alanBandUyumOrani = temizEmsaller.length > 0 ? alanBandUyumluAdet / temizEmsaller.length : 0;
    const indirimModel = dinamikIndirimOrani(temizEmsaller.length, 0, {
      segment: isTarımsal ? "tarla" : "arsa",
      ortalamaYasGun,
      ayniMahalleOrani: mahalleOrani,
      alanUyumOrani: alanBandUyumOrani,
    });
    const hamYerelBaseline = Math.round(weightedAsk * (1 - indirimModel));
    const destekBaseline = await destekBaselineGetir(parsel, isTarımsal ? "tarla" : "arsa");
    const yerelAgirlik = yerelBaselineAgirligi({
      secilenAdet: temizEmsaller.length,
      ortalamaBenzerlik: yerelBenzerlikSkoru,
      ortalamaYasGun,
      mahalleOrani,
      alanBandUyumOrani,
    });
    const baselineHarman =
      destekBaseline && destekBaseline.baseline > 0
        ? Math.round(hamYerelBaseline * yerelAgirlik + destekBaseline.baseline * (1 - yerelAgirlik))
        : hamYerelBaseline;
    const indirim = dinamikIndirimOrani(temizEmsaller.length, 0);
    const baseline = baselineHarman;
    const ozet = bolgeFiyatOzetiHesapla(temizEmsaller.map((a) => a.fiyatPerM2TL));
    const dovizDonusturulenAdet = temizEmsaller.filter((a) => a.dovizDonusumYapildi).length;
    const ortalamaBenzerlik = weightedAverage(
      temizEmsaller.map((a) => ({ value: a.weight, weight: a.weight })),
    );
    const dogrulanabilirAdet = temizEmsaller.filter((a) => a.hasAdaParsel).length;
    const kaynak: FiyatTahmini["baselineKaynak"] =
      mahalleAdet >= MIN_MAHALLE_BASELINE_SAMPLES ? "ilanGozlem-mahalle" : "ilanGozlem-ilce";
    const alanUyumluAdet = temizEmsaller.filter((a) => a.areaScore >= 0.72).length;
    const imarUyumluAdet = temizEmsaller.filter((a) => a.imarScore >= 0.8).length;

    veriKalitesiNotlari.push(
      `${temizEmsaller.length} emsal seçildi: ${mahalleAdet} mahalle, ${ilceAdet} ilçe desteği.`,
    );
    veriKalitesiNotlari.push(
      `Ortalama benzerlik skoru %${Math.round(ortalamaBenzerlik * 100)}. Alan uyumlu emsal ${alanUyumluAdet}/${temizEmsaller.length}, imar uyumlu emsal ${imarUyumluAdet}/${temizEmsaller.length}.`,
    );
    if (dogrulanabilirAdet > 0) {
      veriKalitesiNotlari.push(
        `${dogrulanabilirAdet} emsalde ada/parsel bilgisi var; bu kayıtlar daha yüksek ağırlık aldı.`,
      );
    }
    if (outlier.cikarilan.length > 0) {
      veriKalitesiNotlari.push(
        `${outlier.cikarilan.length} aykırı emsal havuz dışına itildi (Tukey IQR).`,
      );
    }
    if (dovizDonusturulenAdet > 0) {
      veriKalitesiNotlari.push(
        `${dovizDonusturulenAdet} dövizli ilan (USD/EUR/GBP) güncel kurla TL'ye çevrildi.`,
      );
    }
    if (tazelikOzeti) {
      veriKalitesiNotlari.push(
        `Tazelik: ${tazelikOzeti.son30Gun} ilan son 30 gün, ${tazelikOzeti.son90Gun} ilan son 90 gün — ortalama yaş ${tazelikOzeti.ortalamaYasGun} gün.`,
      );
    }
    if (stalAdet > 0) {
      veriKalitesiNotlari.push(
        `${stalAdet} ilan ${MAX_ILAN_YASI_GUN}+ gün eski olduğu için havuza alınmadı (TR enflasyon koruması).`,
      );
    }

    return {
      baseline,
      kaynak,
      not:
        kaynak === "ilanGozlem-mahalle"
          ? `${temizEmsaller.length} ağırlıklı emsal (${parsel.mahalleAd}) — weighted median ${weightedAsk.toLocaleString("tr-TR")} TL/m², weighted mean ${weightedMeanAsk.toLocaleString("tr-TR")} TL/m², kapanış indirimi %${Math.round(indirim * 100)}`
          : `${temizEmsaller.length} ağırlıklı emsal (${parsel.ilceAd} ilçesi) — weighted median ${weightedAsk.toLocaleString("tr-TR")} TL/m², weighted mean ${weightedMeanAsk.toLocaleString("tr-TR")} TL/m², kapanış indirimi %${Math.round(indirim * 100)}`,
      guvenAdet: temizEmsaller.length,
      ozet,
      veriKalitesiNotlari,
      emsalOzeti: {
        secilenAdet: temizEmsaller.length,
        mahalleAdet,
        ilceAdet,
        dogrulanabilirAdet,
        ortalamaBenzerlik,
        weightedAsking: weightedAsk,
        outlierAdet: outlier.cikarilan.length,
        dovizDonusturulenAdet,
      },
      tazelikOzeti,
      // Eğer aradığımız parsel tarımsalsa ve emsal bulunduysa, bu emsaller zaten tarımsaldır
      // (segment uyumuyla filtrelendi). Kategori "tarla" olmalı ki çift indirim (double discount) yemesin.
      kategori: isTarımsal ? "tarla" : "arsa",
      emsalListesi: temizEmsaller.map((e) => ({
        fiyatPerM2: e.fiyatPerM2TL,
        alan: e.kayit.m2 || 0,
        benzerlik: e.weight,
        tazelikGun: e.kayit.zaman ? Math.round((Date.now() - e.kayit.zaman) / GUN_MS) : 0,
        ilanNo: e.kayit.ilanNo || "—",
      })),
    };
  }

  if (emsalAdaylari.length > 0) {
    veriKalitesiNotlari.push(
      `İlçede ${emsalAdaylari.length} aday bulundu ama yeterli kalitede emsal havuzu oluşmadı.`,
    );
  }
  if (stalAdet > 0) {
    veriKalitesiNotlari.push(
      `${stalAdet} ilan ${MAX_ILAN_YASI_GUN}+ gün eski olduğu için filtrelendi — Sahibinden listesinden taze veri topla.`,
    );
  }

  // 2.4 + 2.5 — Multi-source triangulation
  // Backend API (canlı ilan-istatistik) + Lokal mahalle-baseline (AI/KNN) paralel
  // İkisi de doluysa ağırlıklı medyan + uyumsuzluk skoru
  const [apiSonuc, mahalleSonuc] = await Promise.all([
    parsel.ilAd && parsel.ilceAd && parsel.mahalleAd
      ? apiFiyatMahalleSorgula(parsel.ilAd, parsel.ilceAd, parsel.mahalleAd, isTarımsal ? "tarla" : "arsa")
      : Promise.resolve(null),
    mahalleBaselineGetirAsync(parsel.ilAd, parsel.ilceAd, parsel.mahalleAd, isTarımsal ? "tarla" : "arsa"),
  ]);

  // Triangulation kaynaklarını topla
  const triKaynaklar: TriangulasyonKaynak[] = [];
  if (apiSonuc && apiSonuc.medyan > 0 && apiSonuc.kaynak === "ilan-istatistik") {
    triKaynaklar.push({
      fiyat: apiSonuc.medyan,
      guven: 90,
      ad: "api-mahalle",
    });
  }
  // Yerel mahalle baseline sadece KNN/köy — AI triangulation'a girmez
  if (
    mahalleSonuc
    && mahalleSonuc.kaynak !== "ilce-only"
    && mahalleSonuc.kaynak !== "fallback"
    && mahalleSonuc.kaynak !== "ai"
  ) {
    const kaynakAd = mahalleSonuc.kaynak === "knn" ? "knn-smoothing" : "ilce-baseline";
    triKaynaklar.push({
      fiyat: mahalleSonuc.baseline,
      guven: Math.min(mahalleSonuc.guven, 55),
      ad: kaynakAd,
    });
  }

  // 2+ kaynak varsa triangulate, tek kaynak varsa direkt kullan
  if (triKaynaklar.length >= 2) {
    const tri = triangulateBaseline(triKaynaklar);
    if (tri) {
      const kaynakOzet = tri.kullanilanKaynaklar
        .map(k => `${k.ad}: ${k.fiyat.toLocaleString("tr-TR")}`)
        .join(", ");
      const uyumsuzlukYuzde = (tri.uyumsuzluk * 100).toFixed(0);
      const uyariNot = tri.manuelReviewGerek
        ? ` ⚠️ Yüksek uyumsuzluk (%${uyumsuzlukYuzde}) — kaynaklar arası tutarsızlık var.`
        : ` (uyumsuzluk %${uyumsuzlukYuzde})`;
      return {
        baseline: tri.fiyat,
        kaynak: "mahalle-baseline",
        not: `Multi-source triangulation (${tri.kaynakSayisi} kaynak) — ${kaynakOzet} → ${tri.fiyat.toLocaleString("tr-TR")} TL/m²${uyariNot}`,
        guvenAdet: tri.kaynakSayisi,
        veriKalitesiNotlari: [
          ...veriKalitesiNotlari,
          `${tri.kaynakSayisi} kaynaktan ağırlıklı medyan kullanıldı: ${kaynakOzet}.`,
          tri.outlierSayisi > 0 ? `${tri.outlierSayisi} aykırı kaynak (Tukey IQR) çıkarıldı.` : "",
          tri.manuelReviewGerek
            ? `⚠️ Kaynaklar arası varyans yüksek (CV %${uyumsuzlukYuzde}) — manuel doğrulama önerilir.`
            : "",
        ].filter(Boolean),
        emsalOzeti: null,
        tazelikOzeti: null,
        kategori: isTarımsal ? "tarla" : "arsa",
        emsalListesi: [],
        triUyumsuzluk: tri.uyumsuzluk,
        triManuelReview: tri.manuelReviewGerek,
      };
    }
  }

  // Tek kaynak varsa direkt kullan
  if (apiSonuc && apiSonuc.medyan > 0 && apiSonuc.kaynak === "ilan-istatistik") {
    return {
      baseline: apiSonuc.medyan,
      kaynak: "mahalle-baseline",
      not: `Backend API (${apiSonuc.ilan_adet} ilan) — medyan ${apiSonuc.medyan.toLocaleString("tr-TR")} TL/m²`,
      guvenAdet: apiSonuc.ilan_adet ?? 0,
      veriKalitesiNotlari: [
        ...veriKalitesiNotlari,
        `Backend API'den ${apiSonuc.ilan_adet} ilan medyanı kullanıldı.`,
      ],
      emsalOzeti: null,
      tazelikOzeti: null,
      kategori: isTarımsal ? "tarla" : "arsa",
      emsalListesi: [],
    };
  }
  if (mahalleSonuc && mahalleSonuc.kaynak !== "ilce-only" && mahalleSonuc.kaynak !== "fallback") {
    return {
      baseline: mahalleSonuc.baseline,
      kaynak: "mahalle-baseline",
      not: mahalleSonuc.not,
      guvenAdet: 0,
      veriKalitesiNotlari: [
        ...veriKalitesiNotlari,
        `Mahalle baseline kullanıldı (${parsel.mahalleAd}) — kaynak: ${mahalleSonuc.kaynak}, güven: ${mahalleSonuc.guven}/100. ${mahalleSonuc.ilceFallback ? `İlçe ortalaması (${mahalleSonuc.ilceFallback.toLocaleString("tr-TR")} TL/m²) ile Bayesian shrinkage uygulandı.` : ""}`,
      ],
      emsalOzeti: null,
      tazelikOzeti: null,
      kategori: isTarımsal ? "tarla" : "arsa",
      emsalListesi: [],
    };
  }

  // 3. İlçe/semt statik baseline — il baseline'dan çok daha hassas cold start
  const ilceStatik = ilceBaselineGetir(
    parsel.ilAd ?? "",
    parsel.ilceAd ?? "",
    parsel.mahalleAd,
    isTarımsal ? "tarla" : "arsa",
  );
  if (ilceStatik) {
    return {
      baseline: ilceStatik.baseline,
      kaynak: ilceStatik.kaynak,
      not: ilceStatik.not,
      guvenAdet: 0,
      veriKalitesiNotlari: [
        ...veriKalitesiNotlari,
        ilceStatik.kaynak === "ilce-semt-baseline"
          ? `İlçe/semt statik baseline kullanıldı (${parsel.ilceAd} › ${parsel.mahalleAd ?? ""}) — canlı ilan birikmesiyle otomatik geçiş yapılır.`
          : `İlçe statik baseline kullanıldı (${parsel.ilceAd}) — mahalle bazlı ilan birikmesiyle otomatik geçiş yapılır.`,
      ],
      emsalOzeti: null,
      tazelikOzeti: null,
      kategori: isTarımsal ? "tarla" : "arsa",
      emsalListesi: [],
    };
  }

  // 4. İl baseline (statik tablo) — ilçe datasette yoksa geri düş
  if (isTarımsal) {
    const tarlaBaselineHam =
      IL_BASELINE_TARLA_TL_M2[parsel.ilAd] ?? FALLBACK_TARLA_BASELINE_TL_M2;
    const { guncelFiyat: tarlaBaseline, carpan: tarlaCarpan } = enflasyonDuzelt(tarlaBaselineHam);
    return {
      baseline: tarlaBaseline,
      kaynak: "il-baseline",
      not: `${parsel.ilAd} ili tarımsal arsa baseline (statik 2025-01, +%${Math.round((tarlaCarpan.gayrimenkulCarpan - 1) * 100)} enflasyon) — Sahibinden tarla ilanı ile gerçek veriye geç`,
      guvenAdet: 0,
      veriKalitesiNotlari: [
        ...veriKalitesiNotlari,
        `Canlı emsal yok; ${parsel.nitelik} için il tarla baseline (${tarlaCarpan.aciklama}).`,
      ],
      emsalOzeti: null,
      tazelikOzeti: null,
      kategori: "tarla",
      emsalListesi: [],
    };
  }

  const ilBaselineHam = IL_BASELINE_ARSA_TL_M2[parsel.ilAd];
  if (ilBaselineHam) {
    const { guncelFiyat: ilBaseline, carpan: ilCarpan } = enflasyonDuzelt(ilBaselineHam);
    return {
      baseline: ilBaseline,
      kaynak: "il-baseline",
      not: `${parsel.ilAd} ili arsa baseline (statik 2025-01, +%${Math.round((ilCarpan.gayrimenkulCarpan - 1) * 100)} enflasyon) — Sahibinden araması ile gerçek veriye geç`,
      guvenAdet: 0,
      veriKalitesiNotlari: [
        ...veriKalitesiNotlari,
        `Canlı emsal verisi yetersiz; il geneli baseline kullanıldı (${ilCarpan.aciklama}).`,
      ],
      emsalOzeti: null,
      tazelikOzeti: null,
      kategori: "arsa",
      emsalListesi: [],
    };
  }

  // 4. Fallback — nitelik tarımsalsa tarla fallback
  if (isTarımsal) {
    return {
      baseline: FALLBACK_TARLA_BASELINE_TL_M2,
      kaynak: "fallback",
      not: `Veri yok — tarımsal fallback baseline (Sahibinden araması ile zenginleştir)`,
      guvenAdet: 0,
      veriKalitesiNotlari: [
        ...veriKalitesiNotlari,
        "Bölgeye ait yeterli ilan bulunamadı; tarımsal fallback baseline devrede.",
      ],
      emsalOzeti: null,
      tazelikOzeti: null,
      kategori: "tarla",
      emsalListesi: [],
    };
  }

  return {
    baseline: FALLBACK_BASELINE_TL_M2,
    kaynak: "fallback",
    not: `Veri yok — Sahibinden araması yaparak bu bölge için gerçek fiyat topla`,
    guvenAdet: 0,
    veriKalitesiNotlari: [
      ...veriKalitesiNotlari,
      "Bölgeye ait yeterli ilan bulunamadı; genel fallback baseline devrede.",
    ],
    emsalOzeti: null,
    tazelikOzeti: null,
    kategori: "arsa",
    emsalListesi: [],
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Baseline kaynağına göre üst güven tavanı.
 * `ilce-only`/`fallback` ile bile ekGuven katmanı 95+ skor üretebiliyordu — bu yanıltıcı.
 * Kaynak ne kadar zayıfsa tavan o kadar düşük olur.
 */
export function guvenSkoruTavani(kaynak: FiyatTahmini["baselineKaynak"]): number {
  switch (kaynak) {
    case "spatial-radius":     return 98; // koordinat bazlı, en yüksek güven
    case "ilanGozlem-mahalle": return 98;
    case "ilanGozlem-ilce":    return 88;
    case "mahalle-baseline":   return 90;
    case "ilce-semt-baseline": return 80;
    case "ilce-baseline":      return 70;
    case "il-baseline":        return 55;
    case "fallback":           return 40;
    default:                   return 95;
  }
}

function guvenHesapla(params: {
  baseline: Awaited<ReturnType<typeof bolgeBaseliniGetir>>;
  cevreVar: boolean;
  egimVar: boolean;
  multiplierClamped: boolean;
  resmiImarVar: boolean;
}): {
  guven: FiyatTahmini["guven"];
  guvenSkoru: number;
  guvenAciklama: string;
  altRange: number;
  ustRange: number;
  veriKalitesiNotlari: string[];
} {
  const { baseline, cevreVar, egimVar, multiplierClamped, resmiImarVar } = params;
  const veriKalitesiNotlari = [...baseline.veriKalitesiNotlari];
  let skor = 15;

  if (baseline.kaynak === "spatial-radius") skor = 62; // koord bazlı, en yüksek
  else if (baseline.kaynak === "ilanGozlem-mahalle") skor = 58;
  else if (baseline.kaynak === "ilanGozlem-ilce") skor = 44;
  else if (baseline.kaynak === "mahalle-baseline") skor = 42;
  else if (baseline.kaynak === "ilce-semt-baseline") skor = 36;
  else if (baseline.kaynak === "ilce-baseline") skor = 30;
  else if (baseline.kaynak === "il-baseline") skor = 24;
  else skor = 12;

  if (baseline.guvenAdet > 0) skor += Math.min(20, baseline.guvenAdet * 2);
  if (baseline.ozet) {
    skor += baseline.ozet.guvenSeviyesi === "yuksek" ? 10 : baseline.ozet.guvenSeviyesi === "orta" ? 4 : 0;
    skor -= Math.min(18, Math.round(baseline.ozet.volatilite / 4));
  }
  if (baseline.emsalOzeti) {
    skor += Math.round(baseline.emsalOzeti.ortalamaBenzerlik * 12);
    skor += Math.min(6, baseline.emsalOzeti.dogrulanabilirAdet * 2);
    if (baseline.emsalOzeti.mahalleAdet >= MIN_MAHALLE_BASELINE_SAMPLES) skor += 6;
  }
  // Tazelik etkisi — taze veri güveni artırır, eski veri düşürür
  if (baseline.tazelikOzeti) {
    const t = baseline.tazelikOzeti;
    if (t.ortalamaYasGun <= 30) skor += 8;
    else if (t.ortalamaYasGun <= 60) skor += 4;
    else if (t.ortalamaYasGun <= 90) skor += 0;
    else skor -= 4;
    // Son 30 günden ≥3 ilan varsa ekstra prim
    if (t.son30Gun >= 3) skor += 4;
  }
  if (cevreVar) {
    skor += 4;
  } else {
    veriKalitesiNotlari.push("Çevre/POI verisi yok; erişim etkisi nötr kabul edildi.");
  }
  if (egimVar) {
    skor += 4;
  } else {
    veriKalitesiNotlari.push("Eğim verisi yok; topoğrafya etkisi nötr kabul edildi.");
  }
  if (resmiImarVar) {
    skor += 8;
    veriKalitesiNotlari.push("Resmi e-Plan imar verisi fiyat sinyaline dahil edildi.");
  } else {
    veriKalitesiNotlari.push("Resmi e-Plan verisi yok; imar sinyali ilan/parsel heuristiğinden üretildi.");
  }
  if (multiplierClamped) {
    skor -= 6;
    veriKalitesiNotlari.push("Heuristik çarpanlar taşmasın diye tahmin koruma bandına sıkıştırıldı.");
  }

  skor = clamp(Math.round(skor), 5, 95);

  let guven: FiyatTahmini["guven"] = "dusuk";
  let altRange = 0.6;
  let ustRange = 1.4;
  if (skor >= 75) {
    guven = "yuksek";
    altRange = 0.9;
    ustRange = 1.1;
  } else if (skor >= 55) {
    guven = "orta";
    altRange = 0.82;
    ustRange = 1.18;
  } else if (skor >= 35) {
    guven = "orta";
    altRange = 0.74;
    ustRange = 1.26;
  } else if (baseline.kaynak === "il-baseline") {
    altRange = 0.55;
    ustRange = 1.45;
  } else if (baseline.kaynak === "fallback") {
    altRange = 0.5;
    ustRange = 1.5;
  } else if (baseline.kaynak === "mahalle-baseline") {
    altRange = 0.62;
    ustRange = 1.38;
  } else if (baseline.kaynak === "ilce-semt-baseline") {
    altRange = 0.60;
    ustRange = 1.40;
  } else if (baseline.kaynak === "ilce-baseline") {
    altRange = 0.55;
    ustRange = 1.45;
  }

  const guvenAciklama =
    baseline.kaynak === "ilanGozlem-mahalle"
      ? `${baseline.guvenAdet} ağırlıklı emsal ile üretildi. Güven skoru ${skor}/100.`
      : baseline.kaynak === "ilanGozlem-ilce"
        ? `${baseline.guvenAdet} ağırlıklı ilçe emsali ile üretildi. Mahalle emsali gelirse daha da daralır. Güven skoru ${skor}/100.`
        : baseline.kaynak === "mahalle-baseline"
          ? `Mahalle bazlı baseline (AI/KNN, Bayesian shrinkage uygulanmış). Sahibinden'de gezinerek gerçek emsallere geç. Güven skoru ${skor}/100.`
          : baseline.kaynak === "ilce-semt-baseline"
            ? `Bölge ortalaması (semt düzeyi). Sahibinden'de gezinerek gerçek emsallere geç. Güven skoru ${skor}/100.`
            : baseline.kaynak === "ilce-baseline"
              ? `Bölge ortalaması (ilçe düzeyi). Sahibinden'de gezinerek gerçek emsallere geç. Güven skoru ${skor}/100.`
              : baseline.kaynak === "il-baseline"
                ? `Bölge ortalaması (il düzeyi). Sahibinden'de gezinerek gerçek emsallere geç. Güven skoru ${skor}/100.`
                : `Bölgesel emsal bulunamadı; genel ortalama kullanıldı. Güven skoru ${skor}/100.`;

  return { guven, guvenSkoru: skor, guvenAciklama, altRange, ustRange, veriKalitesiNotlari };
}

function ekGuvenKatmani(params: {
  baseline: Awaited<ReturnType<typeof bolgeBaseliniGetir>>;
  cevreVar: boolean;
  egimVar: boolean;
  multiplierClamped: boolean;
  resmiImarVar: boolean;
  manuelImarVar: boolean;
  manuelImarDetayAdet: number;
  manuelEmsalAdet: number;
}): {
  ekSkor: number;
  altRangeDelta: number;
  ustRangeDelta: number;
  guvenKirilimi: FiyatTahmini["guvenKirilimi"];
  sonrakiHamleler: string[];
  ekNotlar: string[];
} {
  const {
    baseline,
    cevreVar,
    egimVar,
    multiplierClamped,
    resmiImarVar,
    manuelImarVar,
    manuelImarDetayAdet,
    manuelEmsalAdet,
  } = params;

  const guvenKirilimi: FiyatTahmini["guvenKirilimi"] = [];
  const sonrakiHamleler: string[] = [];
  const ekNotlar: string[] = [];
  let ekSkor = 0;
  let altRangeDelta = 0;
  let ustRangeDelta = 0;

  const baselinePuani =
    baseline.kaynak === "ilanGozlem-mahalle"
      ? 58
      : baseline.kaynak === "ilanGozlem-ilce"
        ? 44
        : baseline.kaynak === "mahalle-baseline"
          ? 42
          : baseline.kaynak === "ilce-semt-baseline"
            ? 36
            : baseline.kaynak === "ilce-baseline"
              ? 30
              : baseline.kaynak === "il-baseline"
                ? 24
                : 12;
  guvenKirilimi.push({
    etiket:
      baseline.kaynak === "ilanGozlem-mahalle"
        ? "Mahalle emsali"
        : baseline.kaynak === "ilanGozlem-ilce"
          ? "İlçe emsali"
          : baseline.kaynak === "mahalle-baseline"
            ? "Mahalle baseline"
            : baseline.kaynak === "ilce-semt-baseline"
              ? "Semt baseline"
              : baseline.kaynak === "ilce-baseline"
                ? "İlçe baseline"
                : baseline.kaynak === "il-baseline"
                  ? "İl baseline"
                  : "Genel fallback",
    puan: baselinePuani,
    durum: baselinePuani >= 40 ? "pozitif" : baselinePuani >= 30 ? "notr" : "uyari",
  });

  if (baseline.guvenAdet > 0) {
    guvenKirilimi.push({
      etiket: "Canlı emsal adedi",
      puan: Math.min(20, baseline.guvenAdet * 2),
      durum: "pozitif",
    });
  }
  if (baseline.emsalOzeti) {
    guvenKirilimi.push({
      etiket: "Emsal benzerliği",
      puan: Math.round(baseline.emsalOzeti.ortalamaBenzerlik * 12),
      durum: "pozitif",
    });
  }
  if (baseline.tazelikOzeti) {
    const yas = baseline.tazelikOzeti.ortalamaYasGun;
    const puan = yas <= 30 ? 8 : yas <= 60 ? 4 : yas > 90 ? -4 : 0;
    if (puan !== 0) {
      guvenKirilimi.push({
        etiket: "Veri tazeliği",
        puan,
        durum: puan > 0 ? "pozitif" : "uyari",
      });
    }
  }

  if (resmiImarVar) {
    ekSkor += 8;
    altRangeDelta += 0.02;
    ustRangeDelta -= 0.02;
    guvenKirilimi.push({ etiket: "Resmi e-Plan imarı", puan: 8, durum: "pozitif" });
    ekNotlar.push("Resmi e-Plan imar verisi fiyat sinyaline dahil edildi.");
  } else if (manuelImarVar) {
    const puan = manuelImarDetayAdet >= 3 ? 6 : manuelImarDetayAdet >= 1 ? 3 : 0;
    ekSkor += puan;
    if (manuelImarDetayAdet >= 2) {
      altRangeDelta += 0.015;
      ustRangeDelta -= 0.015;
    }
    guvenKirilimi.push({ etiket: "Manuel imar girişi", puan, durum: puan > 0 ? "pozitif" : "notr" });
    ekNotlar.push("İmar sinyali kullanıcı girişi ile güçlendirildi.");
  } else {
    guvenKirilimi.push({ etiket: "İmar belirsizliği", puan: -4, durum: "uyari" });
    sonrakiHamleler.push("Kullanım kararı ile TAKS/Emsal girersen fiyat sapması ciddi azalır.");
  }

  if (manuelEmsalAdet > 0) {
    const puan = Math.min(8, manuelEmsalAdet * 3);
    ekSkor += puan;
    altRangeDelta += manuelEmsalAdet >= 2 ? 0.02 : 0.01;
    ustRangeDelta -= manuelEmsalAdet >= 2 ? 0.02 : 0.01;
    guvenKirilimi.push({ etiket: "Manuel emsal desteği", puan, durum: "pozitif" });
    ekNotlar.push(`${manuelEmsalAdet} manuel emsal fiyat havuzuna dahil edildi.`);
  } else {
    sonrakiHamleler.push("1-3 yakın gerçek satış veya ilan emsali girersen bant belirgin daralır.");
  }

  if (cevreVar) {
    guvenKirilimi.push({ etiket: "Çevre/erişim verisi", puan: 4, durum: "pozitif" });
  } else {
    sonrakiHamleler.push("Çevre analizi tamamlanırsa erişim ve altyapı etkisi daha net hesaplanır.");
  }
  if (egimVar) {
    guvenKirilimi.push({ etiket: "Eğim verisi", puan: 4, durum: "pozitif" });
  }
  if (multiplierClamped) {
    guvenKirilimi.push({ etiket: "Koruma bandı", puan: -6, durum: "uyari" });
  }

  return { ekSkor, altRangeDelta, ustRangeDelta, guvenKirilimi, sonrakiHamleler, ekNotlar };
}

export async function fiyatTahminEt(
  parsel: Parsel,
  cevre: CevreAnalizi | null = null,
  egim: EgimAnalizi | null = null,
  resmiImar: EPlanImarVerisi | null = null,
): Promise<FiyatTahmini> {
  // Kullanıcının manuel girdiği emsalleri ek emsal olarak baseline hesabına dahil et
  const manuelVeri = await manuelVeriOku(parsel);
  const manuelIlanlar = manuelVeri.emsaller.map(m => manuelEmsaliIlanaCevir(parsel, m));
  const baseline = await bolgeBaseliniGetir(parsel, manuelIlanlar);

  // Faz 2 — Spatial emsal motoru: koordinat bazlı radius decay baseline.
  // Mevcut mahalle-norm baseline tamamlandıktan sonra spatial dene; yeterli
  // emsal varsa baseline değer ve kaynak adı override edilir. Backward compat:
  // lat/lng=null ilanlar spatial motorda elenir, eski testler bozulmadan geçer.
  if (parsel.merkezNokta?.lat != null && parsel.merkezNokta?.lng != null) {
    try {
      const { radiusEmsalGetir, spatialBaselineYeterliMi, D_BY_KATEGORI } = await import("./spatial-emsal");
      const spatialKategori = baseline.kategori === "tarla" ? "tarla" : "arsa";
      const D = D_BY_KATEGORI[spatialKategori];
      // Sorgu yarıçapı = 2 × D (decay ile uzak emsal weight'i zaten düşer)
      const radiusM = 2 * D;
      const spatial = await radiusEmsalGetir(
        parsel.merkezNokta.lat,
        parsel.merkezNokta.lng,
        radiusM,
        spatialKategori,
      );

      // Sprint C — Hibrit blend: yerel spatial + backend havuz weighted ortalama
      // Backend baseline yereli destekler (cross-user havuz).
      let blendBaseline: number | null = spatial.baseline;
      let blendAdet = spatial.emsaller.length;
      let blendNot: string | null = null;
      try {
        const { apiSpatialEmsalGetir } = await import("./api-fiyat");
        const remote = await apiSpatialEmsalGetir(
          parsel.merkezNokta.lat,
          parsel.merkezNokta.lng,
          radiusM / 1000,
          spatialKategori,
        );
        if (remote?.baseline != null && remote.adet > 0) {
          const wLocal = Math.min((spatial.emsaller.length || 0) / 20, 0.6);
          const wRemote = 1 - wLocal;
          if (spatial.baseline != null && spatial.emsaller.length > 0) {
            blendBaseline = Math.round(
              spatial.baseline * wLocal + remote.baseline * wRemote,
            );
            blendNot = `Hibrit (yerel ${spatial.emsaller.length} × ${(wLocal * 100).toFixed(0)}% + backend ${remote.adet} × ${(wRemote * 100).toFixed(0)}%)`;
          } else {
            blendBaseline = remote.baseline;
            blendNot = `Sadece backend havuz (${remote.adet} emsal)`;
          }
          blendAdet = (spatial.emsaller.length || 0) + remote.adet;
        }
      } catch {
        // Backend erişilemezse sadece yerel spatial kullan
      }

      if (
        (spatialBaselineYeterliMi(spatial) || (blendNot && blendBaseline != null)) &&
        blendBaseline != null
      ) {
        baseline.baseline = blendBaseline;
        baseline.kaynak = "spatial-radius";
        baseline.guvenAdet = Math.max(baseline.guvenAdet, blendAdet);
        baseline.veriKalitesiNotlari.unshift(
          `Spatial emsal: ${spatial.emsaller.length} ilan (1km: ${spatial.halkaDagilimi.r0_1km}, 3km: ${spatial.halkaDagilimi.r1_3km}, 5km: ${spatial.halkaDagilimi.r3_5km}), D=${spatial.D}m${blendNot ? " · " + blendNot : ""}`,
        );
      }
    } catch (e) {
      // Spatial motor başarısızsa sessizce eski baseline ile devam et
      console.warn("[fiyat-tahmin] spatial baseline hatası:", e);
    }
  }
  const resmiImarVar = !!resmiImar && resmiImar.kaynakUrl !== "manuel";
  const manuelImarVar =
    !!(resmiImar as { manuelGirildi?: boolean } | null)?.manuelGirildi ||
    (!!resmiImar && resmiImar.kaynakUrl === "manuel");
  const manuelImarDetayAdet = [
    resmiImar?.kullanimKarari || resmiImar?.planKarari,
    resmiImar?.taks,
    resmiImar?.emsal,
    resmiImar?.maksKat,
    resmiImar?.yapiNizami,
  ].filter((v) => v != null && v !== "").length;
  let nitelik = nitelikCarpani(parsel.nitelik);
  // Tarla baseline kullanılıyorsa nitelik çarpanını normalize et:
  // Baseline zaten tarımsal kalibreli, tarla için 0.25 uygulamak çift indirim olur.
  // Tarla=1.0, zeytinlik/bahçe=biraz prim, arsa kategorik upgrade (tarla→arsa).
  if (baseline.kategori === "tarla") {
    if (/tarla/i.test(parsel.nitelik)) {
      nitelik = { ad: "Tarla", carpan: 1.0, not: "Tarımsal baseline kalibreli" };
    } else if (/zeytin/i.test(parsel.nitelik)) {
      nitelik = { ad: "Zeytinlik", carpan: 1.4, not: "Zeytinlik primi (3573 sayılı kanun)" };
    } else if (/bahçe|bahce/i.test(parsel.nitelik)) {
      nitelik = { ad: "Bahçe", carpan: 1.3, not: "Bahçe primi (sulu/yetiştirme)" };
    } else if (/bağ\b|bag\b/iu.test(parsel.nitelik)) {
      nitelik = { ad: "Bağ", carpan: 1.1, not: "Bağ niteliği" };
    } else if (/arsa/i.test(parsel.nitelik)) {
      // Tarla baseline'ından arsa'ya kategori upgrade
      nitelik = { ad: "Arsa", carpan: 4.0, not: "Tarımsal baseline'dan arsa kategorisine upgrade" };
    } else if (/mesken|bina/i.test(parsel.nitelik)) {
      nitelik = { ad: "Yapılı", carpan: 8.0, not: "Yapı + arsa kombo, tarımsal baseline üzeri" };
    }
  }
  const imar = fiyatIcinImarSec(parsel, resmiImar);
  const imarC = imarCarpani(imar, baseline.kategori);

  // İmar-koşullu nitelik düzeltmesi:
  // Parselin nitelik metni "tarla/bahçe" olsa bile resmi/ilan imarı konut/ticari/sanayi
  // ise çift cezayı kıralım — nitelik 0.25 + tarımsal varsayım baseline → overshoot aşağı.
  if (
    baseline.kategori !== "tarla" &&
    (imar.sinif === "konut-imarli" ||
      imar.sinif === "ticari-imarli" ||
      imar.sinif === "sanayi-imarli")
  ) {
    if (/tarla/i.test(parsel.nitelik) && nitelik.carpan < 0.5) {
      nitelik = { ad: nitelik.ad, carpan: 0.5, not: `${nitelik.not} (imar ${imar.sinif} ile yukarı çekildi)` };
    } else if (/bahçe|bahce/i.test(parsel.nitelik) && nitelik.carpan < 0.85) {
      nitelik = { ad: nitelik.ad, carpan: 0.85, not: `${nitelik.not} (imar ${imar.sinif} ile yukarı çekildi)` };
    } else if (/bağ\b|bag\b/iu.test(parsel.nitelik) && nitelik.carpan < 0.7) {
      nitelik = { ad: nitelik.ad, carpan: 0.7, not: `${nitelik.not} (imar ${imar.sinif} ile yukarı çekildi)` };
    } else if (/zeytin/i.test(parsel.nitelik) && nitelik.carpan < 0.6) {
      nitelik = { ad: nitelik.ad, carpan: 0.6, not: `${nitelik.not} (imar ${imar.sinif} ile yukarı çekildi)` };
    }
  }

  const alan = alanCarpani(parsel.alan);
  const konum = konumCarpani(parsel);
  const cevreC = cevreCarpani(cevre);
  const egimC = egimCarpani(egim);
  const kirsalC = kirsalCarpani(parsel.nitelik, cevre?.kirsal ?? null);
  // Kategori çarpanları (nitelik + imar) — clamp DIŞI:
  // Tarla→Arsa kategori sıçraması doğal olarak 4-10x büyüklükte; clamp etmek
  // tarla'nın asla arsa fiyatına çekilmemesi gereken durumda overshoot yaratır.
  const kategoriMultiplier = nitelik.carpan * imarC.carpan;

  // İnce ayar çarpanları (alan + konum + çevre + eğim + kırsal) — clamp İÇİ:
  // Bunlar fine-tuning sinyalleri, aşırı sapma genelde eksik veriye işaret.
  // Not: nüfus çarpanı ilNormForBias gerektirir, aşağıda tanımlandıktan sonra eklenir.
  const rawIncearMultiplier = alan.carpan * konum.carpan * cevreC.carpan * egimC.carpan * kirsalC.carpan;
  const clampedIncearMultiplier =
    rawIncearMultiplier <= 0
      ? 0
      : clamp(rawIncearMultiplier, HEURISTIC_MULTIPLIER_MIN, HEURISTIC_MULTIPLIER_MAX);
  const incearClampFactor =
    rawIncearMultiplier > 0 ? clampedIncearMultiplier / rawIncearMultiplier : 1;
  const incearClamped = Math.abs(incearClampFactor - 1) > 0.01;

  const clampedMultiplier = kategoriMultiplier * clampedIncearMultiplier;
  // Backward compat: guvenHesapla'ya hâlâ multiplierClamped flag'ini geçiyoruz.
  // Ayrıca kategoriMultiplier > 6 ise (tarla→arsa upgrade + agresif imar gibi) → güven düşür.
  const kategoriMultiplierAsiri = kategoriMultiplier > 6.0;
  const multiplierClamped = incearClamped || kategoriMultiplierAsiri;

  const bilesenler: FiyatBileseni[] = [
    {
      ad: `Bölge baseline (${baseline.kaynak})`,
      carpan: baseline.baseline,
      not: baseline.not,
    },
    { ad: `Nitelik: ${nitelik.ad}`, carpan: nitelik.carpan, not: nitelik.not },
    { ad: "İmar sinyali", carpan: imarC.carpan, not: imarC.not },
    { ad: "Alan etkisi", carpan: alan.carpan, not: alan.not },
    { ad: "Konum etkisi", carpan: konum.carpan, not: konum.not },
    { ad: "Çevre/POI", carpan: cevreC.carpan, not: cevreC.not },
    { ad: "Eğim", carpan: egimC.carpan, not: egimC.not },
  ];
  if (kirsalC.carpan !== 1.0) {
    bilesenler.push({ ad: "Kırsal (Su/Yol/Köy)", carpan: kirsalC.carpan, not: kirsalC.not });
  }
  if (incearClamped) {
    bilesenler.push({
      ad: "İnce ayar koruma bandı",
      carpan: incearClampFactor,
      not: `İnce ayar çarpanları ham ×${rawIncearMultiplier.toFixed(2)} idi; ×${clampedIncearMultiplier.toFixed(2)} bandına çekildi (kategori çarpanları clamp dışı).`,
    });
  }
  if (kategoriMultiplierAsiri) {
    bilesenler.push({
      ad: "Aşırı kategori çarpanı uyarısı",
      carpan: kategoriMultiplier,
      not: `Nitelik × imar = ×${kategoriMultiplier.toFixed(2)} (>6). Kategori sıçraması (örn. tarla→arsa upgrade + agresif imar) doğal olabilir ama güven düşürüldü; manuel doğrulama önerilir.`,
    });
  }

  // Beklenen TL/m² = baseline × tüm çarpanlar
  let beklenenPerM2 = Math.round(
    baseline.baseline * clampedMultiplier,
  );

  // Cross-validation bias düzeltmesi (backend'den)
  const ilNormForBias = parsel.ilAd ? normalizeYerAdi(parsel.ilAd) : null;
  const ilceNormForBias = parsel.ilceAd ? normalizeYerAdi(parsel.ilceAd) : null;
  const biasKategori = baseline.kategori === "tarla" ? "tarla" : "arsa";
  const bias = await biasCarpani(ilNormForBias, ilceNormForBias, biasKategori);
  if (bias.carpan !== 1.0) {
    beklenenPerM2 = Math.round(beklenenPerM2 * bias.carpan);
    bilesenler.push({
      ad: "Bias düzeltme",
      carpan: bias.carpan,
      not: bias.aciklama,
    });
  }

  // Nüfus yoğunluğu çarpanı — TÜİK 2023 ADNKS (il bazlı)
  // Özellikle fallback/il-baseline durumlarında belirleyici; il baseline
  // nüfusu zaten kısmen yansıttığı için çarpan kasıtlı küçük (±%12 max).
  const nufusC = nufusYogunlukCarpani(ilNormForBias);
  if (nufusC.carpan !== 1.0) {
    beklenenPerM2 = Math.round(beklenenPerM2 * nufusC.carpan);
    bilesenler.push({
      ad: "Nüfus yoğunluğu",
      carpan: nufusC.carpan,
      not: nufusC.not,
    });
  }

  // Doğal risk faktörleri — deprem + taşkın
  // Deprem çarpanı PGA bantlarına göre (eski zon-tabanlı tablodan daha granüler).
  // Veri kaynağı şu an il-tablo (sync), ileride koordinat bazlı TDTH için
  // `depremRiskKoordGetir` (async) entegre edilecek — çarpan formülü aynı.
  const depremRisk = ilNormForBias ? depremRiskiGetir(ilNormForBias) : null;
  if (depremRisk) {
    const dCarpan = pgaCarpani(depremRisk.pga);
    if (dCarpan !== 1.0) {
      beklenenPerM2 = Math.round(beklenenPerM2 * dCarpan);
      bilesenler.push({
        ad: `Deprem riski: ${depremRisk.zon}`,
        carpan: dCarpan,
        not: `${depremRisk.not} (PGA ${depremRisk.pga.toFixed(2)}g)`,
      });
    }
  }

  const taskinBilgi = ilNormForBias ? taskinRiskiGetir(ilNormForBias) : null;
  if (taskinBilgi && taskinBilgi.risk !== "orta") {
    const tCarpan = taskinCarpani(taskinBilgi.risk);
    if (tCarpan !== 1.0) {
      beklenenPerM2 = Math.round(beklenenPerM2 * tCarpan);
      bilesenler.push({
        ad: `Taşkın riski: ${taskinBilgi.risk}`,
        carpan: tCarpan,
        not: taskinBilgi.not,
      });
    }
  }

  const guvenBilgisi = guvenHesapla({
    baseline,
    cevreVar: cevre != null,
    egimVar: egim != null,
    multiplierClamped,
    resmiImarVar,
  });
  const ekGuven = ekGuvenKatmani({
    baseline,
    cevreVar: cevre != null,
    egimVar: egim != null,
    multiplierClamped,
    resmiImarVar,
    manuelImarVar,
    manuelImarDetayAdet,
    manuelEmsalAdet: manuelVeri.emsaller.length,
  });
  // Baseline kaynağına göre üst tavan — kaynak zayıfsa ekGuven katmanı
  // skoru 95+'a çıkaramasın.
  const kaynakTavan = guvenSkoruTavani(baseline.kaynak);
  const guvenSkoru = Math.min(
    kaynakTavan,
    clamp(guvenBilgisi.guvenSkoru + ekGuven.ekSkor, 5, 98),
  );
  const veriKalitesiNotlari = [...guvenBilgisi.veriKalitesiNotlari, ...ekGuven.ekNotlar];

  // Likidite çarpanı — sapa bölgede tahmin range genişler, aktif bölgede daralır
  const ilNorm = parsel.ilAd ? normalizeYerAdi(parsel.ilAd) : "";
  const likidite = ilLikiditeCarpani(ilNorm);
  // Sapa piyasa (carpan < 1) → range genişle (belirsizlik)
  // Aktif piyasa (carpan > 1) → range daralt (güven)
  const rangeAyari = likidite.carpan < 1 ? (1 - likidite.carpan) * 0.5 : 0;
  // Baseline kaynağı + triangulasyon CV → bant ek genişlik (yarı genişlik)
  const bandEk = baselineBandGenisletme({
    kaynak: baseline.kaynak,
    uyumsuzluk: baseline.triUyumsuzluk,
  });
  const altRangeAyarli = clamp(
    guvenBilgisi.altRange + ekGuven.altRangeDelta - rangeAyari - bandEk,
    0.4, 0.96,
  );
  const ustRangeAyarli = clamp(
    guvenBilgisi.ustRange + ekGuven.ustRangeDelta + rangeAyari + bandEk,
    1.04, 1.6,
  );
  const altPerM2 = Math.round(beklenenPerM2 * altRangeAyarli);
  const ustPerM2 = Math.round(beklenenPerM2 * ustRangeAyarli);

  // Likidite veri kalitesi notuna ekle
  if (ilNorm && likidite.aciklama) {
    veriKalitesiNotlari.push(`Likidite: ${likidite.aciklama}.`);
  }

  return {
    altPerM2,
    beklenenPerM2,
    ustPerM2,
    toplamAlt: Math.round(altPerM2 * parsel.alan),
    toplamBeklenen: Math.round(beklenenPerM2 * parsel.alan),
    toplamUst: Math.round(ustPerM2 * parsel.alan),
    bilesenler,
    guven: guvenBilgisi.guven,
    guvenAciklama: guvenBilgisi.guvenAciklama,
    baselineKaynak: baseline.kaynak,
    baselineDeger: Math.round(baseline.baseline),
    baselineNot: baseline.not,
    baselineAdet: baseline.guvenAdet,
    guvenSkoru,
    veriKalitesiNotlari,
    guvenKirilimi: ekGuven.guvenKirilimi,
    sonrakiHamleler: ekGuven.sonrakiHamleler.slice(0, 3),
    aralikGenisligiYuzde: Math.round((ustRangeAyarli - altRangeAyarli) * 100),
    emsalOzeti: baseline.emsalOzeti,
    tazelikOzeti: baseline.tazelikOzeti,
    imarOzeti: {
      sinif: imar.sinif,
      kaynak: imar.kaynak,
      not: imar.not,
      resmiDetay: resmiImar
        ? {
            kullanimKarari: resmiImar.kullanimKarari,
            planKarari: resmiImar.planKarari,
            yapiNizami: resmiImar.yapiNizami,
            emsal: resmiImar.emsal,
            taks: resmiImar.taks,
            maksKat: resmiImar.maksKat,
            yakalandiAt: resmiImar.yakalandiAt,
            guvenSkoru: resmiImar.guvenSkoru,
          }
        : null,
    },
    emsalListesi: baseline.emsalListesi || [],
    manuelReviewGerek: baseline.triManuelReview === true ? true : undefined,
  };
}

// Para birimi gösterimi: 1.250.000 TL veya 1,25 M TL
export function fmtTL(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} Milyar TL`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} M TL`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K TL`;
  return `${n.toLocaleString("tr-TR")} TL`;
}

export function fmtTLM2(n: number): string {
  return `${n.toLocaleString("tr-TR")} TL/m²`;
}
