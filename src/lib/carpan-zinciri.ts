/**
 * Çarpan Zinciri — fiyat-tahmin.ts'ten çıkarılan pure çarpan fonksiyonları.
 *
 * Bu modül tamamen I/O bağımsız (no DB, no API calls).
 * Her fonksiyon: girdi → { carpan, not } döndürür.
 * Bu yapı sayesinde her fonksiyon bağımsız test edilebilir.
 *
 * Kümülatif çarpan güvenliği:
 *   carpanZinciriUygula() tüm çarpanları sırayla uygular ve toplam
 *   sapmanın ±%60'ı aşmamasını garanti eder (CARPAN_CAP).
 *   Bireysel çarpanlar kendi sınırlarına sahip olsa da interaksiyonlar
 *   bu cap olmadan aşırı sapmalara yol açabilir.
 *
 * Re-export:
 *   fiyat-tahmin.ts bu dosyadan re-export eder — geriye dönük uyumlu.
 */

import type { Parsel } from "../types/tkgm";
import type { CevreAnalizi } from "./osm";
import type { EgimAnalizi } from "./elevation";
import type { EPlanImarVerisi } from "./eplan";
import { nufusCarpani } from "./data/il-nufus";
import { nufusCarpaniGelismis } from "./data/mahalle-nufus";

// ─── Tipler ──────────────────────────────────────────────────────────────────

export type ImarSinifi =
  | "konut-imarli"
  | "ticari-imarli"
  | "sanayi-imarli"
  | "arsa-imar-belirsiz"
  | "tarimsal"
  | "korumali"
  | "yapi-mevcut"
  | "belirsiz";

export type EmsalSegment =
  | "arsa" | "tarla" | "bahce" | "bag"
  | "zeytinlik" | "built" | "road" | "other";

export type AlanBand = "micro" | "kucuk" | "orta" | "buyuk" | "cok-buyuk";

export interface CarpanSonucu {
  carpan: number;
  not: string;
  ad?: string;
}

export interface CarpanZinciriGirdisi {
  parsel: Parsel;
  alan: number;
  cevre: CevreAnalizi | null;
  egim: EgimAnalizi | null;
  resmiImar?: EPlanImarVerisi | null;
  ilNorm: string | null;
  ilceNorm: string | null;
}

export interface CarpanZinciriCiktisi {
  /** Tüm çarpanların ürünü (cap uygulanmış) */
  toplamCarpan: number;
  /** Bireysel bileşenler */
  bilesenler: Array<{ ad: string; carpan: number; not: string }>;
  /** Cap uygulandı mı? */
  capUygulandiMi: boolean;
  /** Cap öncesi ham toplam */
  hamCarpan: number;
}

// ─── Sabitler ────────────────────────────────────────────────────────────────

/**
 * Toplam çarpan zinciri güvenlik sınırı.
 * Tüm çarpanların ürünü bu aralık dışına çıkamazı:
 *   Min: 0.40 (baseline'dan %60 düşüş)
 *   Max: 1.60 (baseline'dan %60 artış)
 *
 * NEDEN: 12+ çarpan birlikte uygulandığında interaksiyon efektleri
 * birikir. İstanbul + sıfır eğim + yola cephe + köy içi + temiz hava
 * = 1.04 × 1.05 × 1.30 × 1.30 × 1.04 = ~1.93 → mantıksız.
 * Cap bunu 1.60'a kırpar ve kırpma loglanır.
 */
export const CARPAN_CAP_MIN = 0.40;
export const CARPAN_CAP_MAX = 1.60;

export const NITELIK_CARPANI_TABLOSU: {
  ad: string;
  pattern: RegExp;
  carpan: number;
  not: string;
}[] = [
  { ad: "Arsa",          pattern: /arsa/i,                          carpan: 1.0,  not: "İmara açık (baseline)" },
  // G4 — 2,5× ÖLÇÜLMEDEN uygulanıyordu ve 1,0'a çekildi. Gerekçe aşağıda
  // `yapiliParselNotu` başında.
  { ad: "Mesken / Bina", pattern: /mesken|bina|işyeri|isyeri/i,     carpan: 1.0,  not: "Yapılı parsel — yalnızca arazi değeri (yapı değeri dahil değil)" },
  { ad: "Bahçe",         pattern: /bahçe|bahce/i,                   carpan: 0.7,  not: "Yarı tarımsal, -%30" },
  { ad: "Bağ",           pattern: /bağ\b|bag\b/iu,                  carpan: 0.55, not: "Bağ niteliği, -%45" },
  { ad: "Tarla",         pattern: /tarla/i,                         carpan: 0.25, not: "Tarımsal, -%75 (imar değişikliği zor)" },
  { ad: "Zeytinlik",     pattern: /zeytin/i,                        carpan: 0.4,  not: "3573 sayılı kanun kısıtlaması" },
  { ad: "Yol",           pattern: /^yol/i,                          carpan: 0,    not: "Kamu yolu — özel mülk değil" },
];

// ─── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

/**
 * Yapılı parsel (mesken/bina/işyeri) için kullanıcıya gösterilecek not.
 *
 * ── NEDEN ÇARPAN DEĞİL NOT ──────────────────────────────────────────────────
 *
 * Bu nitelik 2,5× çarpan alıyordu ("Yapı var, +%150") ve bu zincir HİÇ
 * ÖLÇÜLMEDİ: backtest parselleri yalnızca "Tarla"/"Arsa" niteliği taşıyor
 * (`minimalParsel`), korpusta mesken ilanı 0 (tarayıcı konut toplamıyor —
 * data/o2-konut-kategorisi-olcum.json). Hold-out kurulamıyor.
 *
 * GELISTIRME-PLANI-3 §G4 karar kuralı ÖLÇÜMDEN ÖNCE yazıldı: "hold-out
 * kurulamıyorsa çarpan 1,0'a çekilir ve nitelik bilgisi fiyata değil nota
 * yazılır" — A2'de hukuk ajanı için konan kuralın aynısı.
 *
 * Ayrıca kavramsal bir sorun vardı: bu motor ARAZİ fiyatı üretiyor. Üzerindeki
 * binanın değeri arazinin m² fiyatı değil; 2,5× ikisini karıştırıyordu.
 *
 * AYNI NİTELİĞİN İKİ ADI 5 KAT FARK ÜRETİYORDU: tablo ilk eşleşmeyi alıyor ve
 * "ev" desende yok — "Kargir Bina" 2,5×, "Kargir Ev" "Bilinmeyen nitelik" 0,5×
 * alıyordu. Bu düzeltmeden sonra fark 2× (1,0 vs 0,5); "Bilinmeyen" 0,5 da
 * ölçülmemiş ama bu maddenin kapsamı dışında — ayrıca raporlandı.
 */
export function yapiliParselNotu(nitelik: string): string | null {
  // Türkçe küçük harf: "İşyeri", "KARGİR BİNA" — bkz. nitelikCarpani notu.
  if (!nitelik) return null;
  const trKucuk = nitelik.toLocaleLowerCase("tr");
  if (!/mesken|bina|işyeri|isyeri/i.test(nitelik) && !/mesken|bina|işyeri|isyeri/.test(trKucuk)) {
    return null;
  }
  return (
    `Parsel yapılı ("${nitelik}"). Gösterilen fiyat yalnızca ARAZİ değeri — ` +
    `üzerindeki yapının değeri dahil değil ve yapılı parseller için motorun ` +
    `isabeti ölçülmedi.`
  );
}

export function tarımsalMi(nitelik: string): boolean {
  return /tarla|bahçe|bahce|bağ\b|bag\b|zeytin/iu.test(nitelik);
}

export function alanBandi(alan: number): AlanBand {
  if (alan < 250)   return "micro";
  if (alan < 1000)  return "kucuk";
  if (alan < 5000)  return "orta";
  if (alan < 20000) return "buyuk";
  return "cok-buyuk";
}

export function segmentBul(metin: string | null | undefined): EmsalSegment {
  const text = (metin ?? "").toLocaleLowerCase("tr");
  if (/\barsa\b/.test(text))   return "arsa";
  if (/tarla/.test(text))      return "tarla";
  if (/bahçe|bahce/.test(text))return "bahce";
  if (/\bbağ\b|\bbag\b/.test(text)) return "bag";
  if (/zeytin/.test(text))     return "zeytinlik";
  if (/mesken|bina|daire|dükkan/.test(text)) return "built";
  if (/^yol/.test(text))       return "road";
  return "other";
}

// ─── Nitelik çarpanı ─────────────────────────────────────────────────────────

/**
 * Nitelik çarpanı — tablo sırasıyla İLK eşleşme.
 *
 * TÜRKÇE BÜYÜK HARF TUZAĞI: JS `/i` bayrağı büyük `İ`yi (U+0130) `i`ye
 * katlamıyor — `/u` ile de katlamıyor. Ölçüldü (2026-09-11): "İşyeri",
 * "KARGİR BİNA", "ZEYTİNLİK" hiçbir satırla eşleşmiyor ve "Bilinmeyen
 * nitelik" 0,5× alıyordu. TKGM'nin kanonik yazımı "İşyeri".
 *
 * Girdi hem OLDUĞU GİBİ hem Türkçe küçük harfle deneniyor. Ekleyici: eskiden
 * eşleşen hiçbir şey artık eşleşmemezlik yapamaz — yalnızca İ yüzünden düşen
 * girdiler kurtuluyor. Tek başına `toLocaleLowerCase("tr")` yetmezdi: ASCII
 * "ISYERI" onunla "ısyerı" olur ve "isyeri" alternatifini kaybeder.
 *
 * Backtest parselleri yalnızca "Tarla"/"Arsa" taşıyor ve ikisi de ilk denemede
 * eşleşiyor — yani backtest sayıları DEĞİŞMEMELİ.
 */
export function nitelikCarpani(nitelik: string): CarpanSonucu {
  // `?? ""` ŞART: tip `string` diyor ama nitelik'i olmayan parseller (ajanlar,
  // eksik TKGM yanıtı) `undefined` geçiriyor. Eski kod `pattern.test(undefined)`
  // yapıyordu — "undefined" dizesine çevirip varsayılana düşüyordu, fırlatmıyordu.
  // Türkçe küçültme eklenince `undefined.toLocaleLowerCase` TypeError fırlattı
  // ve üç ajan testi zaman aşımına düştü. Üretimde nitelik'siz her parsel fiyat
  // tahminini çökertirdi; backtest her kayda nitelik verdiği için göremedi.
  const trKucuk = (nitelik ?? "").toLocaleLowerCase("tr");
  for (const n of NITELIK_CARPANI_TABLOSU) {
    if (n.pattern.test(nitelik) || n.pattern.test(trKucuk)) {
      return { carpan: n.carpan, not: n.not, ad: n.ad };
    }
  }
  return { carpan: 0.5, not: `Bilinmeyen nitelik: ${nitelik}`, ad: "Diğer" };
}

// ─── Alan çarpanı ─────────────────────────────────────────────────────────────

/**
 * Parsel alanına göre m² fiyat çarpanı.
 * Kademeler 13K emlakjet ilanından mahalle-içi leave-one-out ile kalibre edildi.
 * Küçük arsa → yüksek m² fiyatı (mikro prim), büyük arsa → düşük m² fiyatı.
 */
/**
 * Parsel büyüklüğünün m² fiyatına etkisi — kategori bazlı.
 *
 * NEDEN kategori bazlı: bu çarpan bölge baseline'ının ÜZERİNE uygulanır ve
 * baseline o mahalledeki *tipik* parselin fiyatını temsil eder. Tipik büyüklük
 * kategoriye göre çok farklı: arsa medyanı ~1.4 dönüm, tarla medyanı ~3.7 dönüm.
 * Tek bir arsa-kalibreli ölçek tarlaya uygulanınca, tipik tarla "büyük parsel"
 * sayılıp 0.66x iskonto yiyordu — baseline zaten büyük-parsel fiyatı olduğu
 * için boyut etkisi ÇİFT sayılıyordu (backtest: tarla baseline bias +%4.7 iken
 * nihai tahmin -%26).
 *
 * Oranlar tahmin değil, veriden türetildi: emlakjet veri setinde (33k ilan)
 * AYNI MAHALLE içindeki farklı büyüklük bantlarının medyan TL/m² oranları
 * karşılaştırıldı — böylece "büyük parsel = daha kırsal = daha ucuz" konum
 * etkisi izole edilip saf boyut etkisi ölçüldü.
 *   arsa  (referans 750-2.5k): <200=1.47 · 200-750=1.27 · 2.5k-10k=0.67 · 10k-50k=0.38
 *   tarla (referans 2.5k-10k): 200-750=2.46 · 750-2.5k=1.49 · 10k-50k=0.80
 *
 * DİKKAT — yukarı yöndeki değerler pratikte kırpılır: fiyat-tahmin.ts bu çarpanı
 * HEURISTIC_MULTIPLIER_BANT ile sınırlıyor ve o bandın üst ucu her iki kategoride
 * de ~1.05-1.10 (hold-out backtest'te ölçüldü). Sebep: ölçülen küçük-parsel primi
 * gerçek ama baseline'ın kendisi o mahalledeki ilan karışımını zaten yansıtıyor,
 * dolayısıyla primi tam uygulamak ikinci kez saymak oluyor. Aşağı yöndeki
 * (büyük parsel) iskontolar kırpılmadan geçer — asıl kazanç orada.
 */
export function alanCarpani(alan: number, kategori: "arsa" | "tarla" = "arsa"): CarpanSonucu {
  if (kategori === "tarla") {
    // Referans: 2.500-10.000 m² — tipik tarla parseli, baseline'ın temsil ettiği büyüklük.
    if (alan < 750)   return { carpan: 1.50, not: "Çok küçük tarla — bahçe/hobi segmentine yakın, m² primi yüksek" };
    if (alan < 2500)  return { carpan: 1.49, not: "Küçük tarla, m² primi var" };
    if (alan < 10000) return { carpan: 0.95,  not: "Tipik tarla büyüklüğü — referans" };
    if (alan < 50000) return { carpan: 0.80, not: "Büyük tarla, m² fiyatı düşer" };
    return { carpan: 0.70, not: "Çok büyük tarımsal arazi — m² fiyatı belirgin düşer" };
  }
  // Referans: 750-2.500 m² — tipik arsa parseli.
  if (alan < 200)   return { carpan: 1.47, not: "Mikro arsa, m² primi yüksek" };
  if (alan < 750)   return { carpan: 1.27, not: "Küçük arsa, m² primi var" };
  if (alan < 2500)  return { carpan: 1.0,  not: "Orta — referans" };
  if (alan < 10000) return { carpan: 0.67, not: "Büyük, m² fiyatı belirgin düşer" };
  if (alan < 50000) return { carpan: 0.38, not: "Çok büyük, parsellenmesi gerek — m² fiyatı yarıdan aşağı" };
  return { carpan: 0.32, not: "Devasa parsel — toplu arazi fiyatlaması" };
}

// ─── İmar sınıflandırma ───────────────────────────────────────────────────────

export function imarSiniflandir(parsel: Parsel, imarDurumu?: string | null): {
  sinif: ImarSinifi;
  kaynak: "ilan-imar" | "parsel-nitelik";
  not: string;
} {
  const text = (imarDurumu ?? "").toLocaleLowerCase("tr");
  if (text) {
    if (/sit|koruma|orman|mera|kıyı|kiyi|sulak|askeri/.test(text))
      return { sinif: "korumali", kaynak: "ilan-imar", not: `Korumalı/kısıtlı sinyal: ${imarDurumu}` };
    if (/sanayi|depo|lojistik|organize sanayi|osb/.test(text))
      return { sinif: "sanayi-imarli", kaynak: "ilan-imar", not: `Sanayi/depo: ${imarDurumu}` };
    if (/ticari|ticaret|akaryakıt|avm|dükkan|dukkan/.test(text))
      return { sinif: "ticari-imarli", kaynak: "ilan-imar", not: `Ticari sinyal: ${imarDurumu}` };
    if (/villa|konut|imarlı|imarli|resmi kurum|turizm/.test(text))
      return { sinif: "konut-imarli", kaynak: "ilan-imar", not: `Konut imarlı sinyal: ${imarDurumu}` };
    if (/tarla|bahçe|bahce|bağ|bag|zeytin|tarım|tarim/.test(text))
      return { sinif: "tarimsal", kaynak: "ilan-imar", not: `Tarımsal sinyal: ${imarDurumu}` };
    if (/arsa/.test(text))
      return { sinif: "arsa-imar-belirsiz", kaynak: "ilan-imar", not: `Arsa, imar tipi net değil: ${imarDurumu}` };
  }

  const nitelik = (parsel.nitelik ?? "").toLocaleLowerCase("tr");
  if (/mesken|bina|işyeri|isyeri/.test(nitelik))
    return { sinif: "yapi-mevcut", kaynak: "parsel-nitelik", not: `Yapı mevcut: ${parsel.nitelik}` };
  if (/tarla|bahçe|bahce|bağ|bag|zeytin/.test(nitelik))
    return { sinif: "tarimsal", kaynak: "parsel-nitelik", not: `Tarımsal nitelik: ${parsel.nitelik}` };
  if (/arsa/.test(nitelik))
    return { sinif: "arsa-imar-belirsiz", kaynak: "parsel-nitelik", not: `Arsa, imar tipi net değil: ${parsel.nitelik}` };
  return { sinif: "belirsiz", kaynak: "parsel-nitelik", not: `İmar sınıfı çıkarılamadı: ${parsel.nitelik}` };
}

export function resmiImarSiniflandir(veri: EPlanImarVerisi): {
  sinif: ImarSinifi;
  kaynak: "eplan-resmi";
  not: string;
} {
  const metin = [
    veri.kullanimKarari, veri.planKarari, veri.planNotu,
    veri.yapiNizami, veri.hamMetin.join(" "),
  ].filter(Boolean).join(" ").toLocaleLowerCase("tr");

  if (/sit|koruma|orman|mera|kıyı|kiyi|sulak|askeri/.test(metin))
    return { sinif: "korumali", kaynak: "eplan-resmi", not: `Kısıt/koruma: ${veri.kullanimKarari ?? veri.planKarari ?? "detay yok"}` };
  if (/sanayi|depo|lojistik|organize sanayi|osb/.test(metin))
    return { sinif: "sanayi-imarli", kaynak: "eplan-resmi", not: `Sanayi/depo: ${veri.kullanimKarari ?? "detay yok"}` };
  if (/ticari|ticaret|akaryakıt|akaryakit|avm|dükkan|dukkan/.test(metin))
    return { sinif: "ticari-imarli", kaynak: "eplan-resmi", not: `Ticari: ${veri.kullanimKarari ?? "detay yok"}` };
  if (/villa|konut|imarlı|imarli|resmi kurum|turizm/.test(metin))
    return { sinif: "konut-imarli", kaynak: "eplan-resmi", not: `Konut imarlı: ${veri.kullanimKarari ?? "detay yok"}` };
  if (/tarla|bahçe|bahce|bağ|bag|zeytin|tarım|tarim/.test(metin))
    return { sinif: "tarimsal", kaynak: "eplan-resmi", not: `Tarımsal: ${veri.kullanimKarari ?? "detay yok"}` };
  return { sinif: "arsa-imar-belirsiz", kaynak: "eplan-resmi", not: `Sınıf çıkarılamadı: ${veri.kullanimKarari ?? "detay yok"}` };
}

export function fiyatIcinImarSec(parsel: Parsel, resmiImar?: EPlanImarVerisi | null) {
  if (resmiImar) return resmiImarSiniflandir(resmiImar);
  return imarSiniflandir(parsel, null);
}

// ─── İmar çarpanı ─────────────────────────────────────────────────────────────

export function imarCarpani(
  imar: ReturnType<typeof imarSiniflandir> | ReturnType<typeof resmiImarSiniflandir>,
  baselineKategori: "arsa" | "tarla",
): CarpanSonucu {
  const sinif = imar.sinif;
  // Tarla baseline: imar gelişmesi büyük prim
  if (baselineKategori === "tarla") {
    switch (sinif) {
      case "konut-imarli":    return { carpan: 4.0, not: "Tarla baseline + konut imar = büyük prim" };
      case "ticari-imarli":   return { carpan: 5.0, not: "Tarla baseline + ticari imar = çok büyük prim" };
      case "sanayi-imarli":   return { carpan: 3.5, not: "Tarla baseline + sanayi imar" };
      case "yapi-mevcut":     return { carpan: 3.0, not: "Tarla baseline + yapı mevcut" };
      case "korumali":        return { carpan: 0.7, not: "Tarla + kısıt/koruma" };
      case "arsa-imar-belirsiz": return { carpan: 1.5, not: "Tarla + arsa imarı (belirsiz tür)" };
      case "tarimsal":        return { carpan: 1.0, not: "Tarla — zaten tarımsal baseline" };
      default:                return { carpan: 1.0, not: "Tarla — imar bilgisi yetersiz" };
    }
  }
  // Arsa baseline
  switch (sinif) {
    case "konut-imarli":    return { carpan: 1.8, not: "Arsa + konut imar = prim" };
    case "ticari-imarli":   return { carpan: 2.2, not: "Arsa + ticari imar = yüksek prim" };
    case "sanayi-imarli":   return { carpan: 1.6, not: "Arsa + sanayi imar" };
    case "yapi-mevcut":     return { carpan: 1.5, not: "Arsa + yapı mevcut" };
    case "korumali":        return { carpan: 0.6, not: "Arsa + kısıt/koruma" };
    case "arsa-imar-belirsiz": return { carpan: 1.0, not: "Arsa — imar tipi belirsiz" };
    case "tarimsal":        return { carpan: 0.7, not: "Arsa baseline ama tarımsal sinyal" };
    default:                return { carpan: 1.0, not: "İmar bilgisi yok" };
  }
}

// ─── Çevre çarpanı ───────────────────────────────────────────────────────────

export function cevreCarpani(cevre: CevreAnalizi | null): CarpanSonucu {
  if (!cevre) return { carpan: 1.0, not: "veri yok" };
  const p = cevre.poi;
  const toplam = p.okul + p.hastane + p.duraklar;
  if (toplam >= 15) return { carpan: 1.15, not: `${toplam} POI (yoğun şehir)` };
  if (toplam >= 8)  return { carpan: 1.10, not: `${toplam} POI (gelişmiş)` };
  if (toplam >= 3)  return { carpan: 1.05, not: `${toplam} POI (orta)` };
  if (toplam >= 1)  return { carpan: 1.0,  not: `${toplam} POI (banliyö)` };
  return { carpan: 0.90, not: "POI yok (kırsal/sapa)" };
}

// ─── Kırsal çarpanı ───────────────────────────────────────────────────────────

export function kirsalCarpani(
  nitelik: string,
  kirsal: CevreAnalizi["kirsal"] | null,
): CarpanSonucu {
  if (!/tarla|bahçe|bahce|zeytinlik|bağ\b|bag\b/i.test(nitelik)) {
    return { carpan: 1.0, not: "Uygulanmaz (kentsel parsel)" };
  }
  if (!kirsal) return { carpan: 1.0, not: "Kırsal veri alınamadı" };

  let carpan = 1.0;
  const notlar: string[] = [];

  if (kirsal.yolaCepheM != null && kirsal.yolaCepheM <= 15) {
    carpan *= 1.30; notlar.push("Yola cephe (+%30)");
  } else if (kirsal.yolaCepheM != null && kirsal.yolaCepheM <= 150) {
    carpan *= 1.10; notlar.push("Yola yakın (+%10)");
  } else if (kirsal.yolaCepheM != null) {
    carpan *= 0.80; notlar.push("Yola uzak (-%20)");
  } else {
    carpan *= 0.85; notlar.push("OSM yol işareti yok (-%15)");
  }

  if (kirsal.suKaynagiM != null && kirsal.suKaynagiM <= 300) {
    carpan *= 1.20; notlar.push("Suya yakın (+%20)");
  }
  if (kirsal.koyMerkeziM != null && kirsal.koyMerkeziM <= 300) {
    carpan *= 1.30; notlar.push("Köy içi (+%30)");
  }

  carpan = Math.max(0.6, Math.min(1.8, carpan));
  return {
    carpan: Number(carpan.toFixed(2)),
    not: notlar.length ? notlar.join(", ") : "Standart tarla",
  };
}

// ─── Eğim çarpanı ─────────────────────────────────────────────────────────────

export function egimCarpani(egim: EgimAnalizi | null): CarpanSonucu {
  if (!egim) return { carpan: 1.0, not: "veri yok" };
  switch (egim.egimKategori) {
    case "duz":      return { carpan: 1.05, not: "Düz, +%5" };
    case "hafif":    return { carpan: 1.0,  not: "Hafif eğim" };
    case "orta":     return { carpan: 0.92, not: "Orta eğim, -%8" };
    case "dik":      return { carpan: 0.78, not: "Dik, -%22" };
    case "cok-dik":  return { carpan: 0.55, not: "Çok dik, -%45" };
    default:         return { carpan: 1.0,  not: "Bilinmeyen eğim kategorisi" };
  }
}

// ─── Nüfus yoğunluğu çarpanı ──────────────────────────────────────────────────

export function nufusYogunlukCarpani(
  ilNorm: string | null,
  ilceNorm?: string | null,
): CarpanSonucu {
  if (!ilNorm) return { carpan: 1.0, not: "İl bilgisi yok" };

  if (ilceNorm) {
    const sonuc = nufusCarpaniGelismis(ilNorm, ilceNorm);
    if (sonuc.seviye === "ilce") return { carpan: sonuc.carpan, not: sonuc.aciklama };
  }

  const sonuc = nufusCarpani(ilNorm);
  if (sonuc.yogunluk === null) return { carpan: 1.0, not: "İl bulunamadı" };
  return { carpan: sonuc.carpan, not: sonuc.aciklama };
}

// ─── Kümülatif çarpan zinciri ─────────────────────────────────────────────────

/**
 * Tüm çarpanları sırayla uygula ve toplam sapmanın CARPAN_CAP aralığında
 * kalmasını garantile.
 *
 * @param bilesenler  ad + carpan + not içeren dizi
 * @returns           cap uygulanmış toplam çarpan + breakdown
 */
export function carpanZinciriUygula(
  bilesenler: Array<{ ad: string; carpan: number; not: string }>,
): CarpanZinciriCiktisi {
  const hamCarpan = bilesenler.reduce((acc, b) => acc * b.carpan, 1);
  const capUygulandiMi = hamCarpan < CARPAN_CAP_MIN || hamCarpan > CARPAN_CAP_MAX;
  const toplamCarpan = Math.max(CARPAN_CAP_MIN, Math.min(CARPAN_CAP_MAX, hamCarpan));

  return { toplamCarpan, bilesenler, capUygulandiMi, hamCarpan };
}

/**
 * Emsal uyum skorları — emsal seçiminde kullanılır.
 * Bu fonksiyonlar pure, I/O yok.
 */
export function alanBandUyumu(parselAlan: number, ilanM2: number | null): number {
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

/**
 * Segmentler arası ÖLÇÜLMÜŞ fiyat oranı — arsa = 1 referans.
 *
 * NEDEN VAR: emsal havuzu şimdiye kadar segment bilgisini yalnızca CEZA olarak
 * kullanıyordu (`segmentUyumu`), yani uyumsuz emsali havuzdan eliyordu. Ölçüldü
 * ve bu ZARARLI çıktı: korpusa 14.899 başlık eklenince arsa MAPE 65,92 → 72,52,
 * bias 19,08 → 28,76. Sebep seçim yanlılığı — ucuz segmentler (tarla,
 * zeytinlik) elenince kalan havuz pahalıya kayıyor. Cezayı deneysel olarak
 * kapatınca zarar kayboldu (MAPE farkı +6,60 → +0,13), yani kaynak kesin.
 *
 * ŞU AN KULLANILMIYOR — bilerek. "Eleme değil düzeltme" fikri denendi (emsalin
 * fiyatını kendi oranına bölüp parselin oranıyla çarpmak) ve ÖLÇÜM GEÇMEDİ:
 * üç varyantın üçü de arsada bias'ı kötüleştirdi. Ayrıntı ve sayılar:
 * data/segment-duzeltme-negatif-sonuc.json.
 *
 * Sabit yine de duruyor çünkü ORANLARIN KENDİSİ ölçülmüş bir bulgu ve
 * NITELIK_CARPANI_TABLOSU ile çeliştiğini gösteriyor. Silmek, ölçümü
 * kaybetmek olurdu. Kullanacak doğru mekanizma bulunursa hazır.
 *
 * ORANLAR ÖLÇÜLDÜ (2026-09-07, korpus n=13.982 başlıklı ilan): AYNI MAHALLE
 * içinde, o mahalledeki arsa medyanına bölünerek — böylece "zeytinlik kırsalda
 * olur" konum etkisi izole edildi, saf segment etkisi kaldı.
 *
 * NITELIK_CARPANI_TABLOSU ile ÇELİŞİYOR ve çelişki kasıtlı bırakılıyor:
 *   zeytinlik  ölçülen 0,108  ·  tablo 0,40   (tablo 3,7 kat yüksek)
 *   bahçe      ölçülen 0,356  ·  tablo 0,70   (tablo 2 kat yüksek)
 *   tarla      ölçülen 0,219  ·  tablo 0,25   (yakın)
 *   bağ        ölçülen 0,542  ·  tablo 0,55   (yakın, ama n=18 — temkinli)
 * O tablo PARSELİN kendi niteliğine uygulanıyor ve ayrı kalibre edilmiş;
 * ikisini tek sayıya indirmek ölçülmemiş bir değişiklik olurdu.
 *
 * `other` LİSTEDE YOK ve bilerek: "other" segment yokluğu değil, SİNYAL
 * yokluğu. Ölçümde oranı 0,596 çıkıyor ama bunu uygulamak, bilgi eksikliğini
 * bilgi gibi işlemek olur.
 */
export const SEGMENT_FIYAT_ORANI: Partial<Record<EmsalSegment, number>> = {
  arsa: 1.0,
  tarla: 0.219,
  bahce: 0.356,
  zeytinlik: 0.108,
  bag: 0.542,
};

/**
 * Bir emsalin fiyatını, parselin segmentine çevirir.
 *
 * İki taraftan biri ölçülmüş oran taşımıyorsa (other/built/road ya da eksik
 * başlık) düzeltme YAPILMAZ — 1 döner. Bilinmeyeni tahmin etmek, mevcut
 * davranıştan kötüdür.
 */
export function segmentFiyatDuzeltmesi(
  parselSegment: EmsalSegment,
  ilanSegment: EmsalSegment,
): number {
  const p = SEGMENT_FIYAT_ORANI[parselSegment];
  const i = SEGMENT_FIYAT_ORANI[ilanSegment];
  if (p == null || i == null || i <= 0) return 1;
  return p / i;
}

export function segmentUyumu(parselSegment: EmsalSegment, ilanSegment: EmsalSegment): number {
  if (parselSegment === "road" || ilanSegment === "road") return 0;
  if (parselSegment === ilanSegment) return 1;
  // "other" = segment SINYALI YOK (segmentBul girdi metninde hiçbir anahtar kelime
  // bulamadı), segment UYUMSUZ demek değil. Eskiden bu durum uyumsuzluk sayılıp
  // arsa'da 0.75, tarla'da 0.40 ceza uygulanıyordu — yani bilgi yokluğu, yanlış
  // segmentte olma kanıtı gibi işleniyordu. Bu ceza benzerlik ağırlığını
  // EMSAL_MIN_BENZERLIK eşiğinin altına düşürüp gerçek emsallerin havuzdan
  // elenmesine yol açıyordu: aynı-ilçe arsa tavanı 0.402 (< 0.45) ile
  // "ilanGozlem-ilce" yapısal olarak imkânsız, tarla aynı-mahalle tavanı 0.289
  // ile tarla gerçek emsale hiç ulaşamıyordu. Bilgi yoksa nötr say.
  if (parselSegment === "other" || ilanSegment === "other") return 1;
  /**
   * SEGMENT FARKI ARTIK CEZALANDIRILMIYOR — ölçüm sonucu.
   *
   * Buradaki eski değerler (aynı-tip 0,80/0,75; kentsel-vs-tarımsal 0,40)
   * emsali havuzdan ELİYORDU: ceza benzerliği EMSAL_MIN_BENZERLIK'in altına
   * düşürünce `emsal-havuzu.ts` o kaydı atlıyor. Korpus başlık taşımadığı
   * sürece bu görünmüyordu (başlıksız kayıt "other" → nötr), ama korpusa
   * 14.899 başlık girince ortaya çıktı:
   *
   *   arsa A/B (kontrol → deney)   ceza AÇIK        ceza KAPALI
   *     MAPE                       65,92 → 72,52    65,92 → 66,05
   *     bias                       19,08 → 28,76    19,08 → 19,51
   *
   * Yani segment bilgisi geldikçe motor KÖTÜLEŞİYORDU. Sebep seçim yanlılığı:
   * ucuz segmentler (tarla, zeytinlik) elenince kalan havuz pahalıya kayıyor.
   *
   * ÜÇ ALTERNATİF DENENDİ, ÜÇÜ DE ÖLÇÜMDE BAŞARISIZ (bkz.
   * data/segment-duzeltme-negatif-sonuc.json):
   *   (a) fiyatı segment oranıyla düzelt → etkisiz (ceza emsali zaten eliyor)
   *   (b) ceza yumuşat + düzelt        → bias 19,08 → 31,32, daha kötü
   *   (c) parsel niteliğini başlıktan türet + düzelt → bias +5,15, yine kötü
   *
   * Kalan tek ölçülmüş kazanç cezayı kaldırmak. Kontrol kolunu HİÇ
   * değiştirmiyor (başlıksız kayıt zaten "other" → 1) ve başlık geldiğinde
   * zararı sıfırlıyor. Segment oranları ölçülüp `SEGMENT_FIYAT_ORANI`'nda
   * duruyor — kullanılmıyorlar, çünkü kullanan hiçbir varyant ölçümü geçmedi.
   */
  return 1;
}

export function imarUyumu(parselImar: ImarSinifi, ilanImar: ImarSinifi): number {
  if (parselImar === ilanImar) return 1;
  const belirsiz: ImarSinifi[] = ["belirsiz", "arsa-imar-belirsiz"];
  if (belirsiz.includes(parselImar) || belirsiz.includes(ilanImar)) return 0.7;
  return 0.4;
}

export function alanBenzerlikSkoru(parselAlan: number, ilanM2: number | null): number {
  if (!ilanM2 || ilanM2 <= 0 || parselAlan <= 0) return 0.45;
  const oran = parselAlan > ilanM2 ? ilanM2 / parselAlan : parselAlan / ilanM2;
  if (oran >= 0.7) return 1;
  if (oran >= 0.4) return 0.8;
  if (oran >= 0.2) return 0.6;
  return 0.4;
}
