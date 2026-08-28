/**
 * Veri Rafinerisi — İlan Sanitizer & NLP Kural Filtresi
 *
 * Ham ilan verilerini (Sahibinden, Emlakjet, Hepsiemlak, manuel emsal)
 * değerleme havuzuna almadan önce temizler ve etiketler:
 *
 * 1. Hukuki & Mülkiyet Kısıtları:
 *    - Hisseli tapu / paylı mülkiyet
 *    - Kooperatif hissesi / kooperatif payı
 *    - Hobi bahçesi / rızai taksimli hisse
 *    - 2B / Zilliyetlik / Orman tahsis
 *    - İcra / Haciz / Şerh / Davalı
 *    - 5403 sayılı Toprak Koruma Kanunu (bölünemez tarımsal büyüklük)
 *
 * 2. Giriş & Birim Hataları:
 *    - Dönüm/dekar yerine m² alanına 1-10 gibi rakam girilmesi
 *    - Toplam fiyat yerine m² fiyatı girilmesi (veya tersi)
 *    - Absürd fiyatlar (örn. 5 TL/m² veya 5.000.000 TL/m² köy tarlası)
 */

import { IL_KATEGORI_SINIR } from "../fiyat-correction";
import { normalizeYerAdi } from "../tkgm-api";

export interface RawIlanGirdisi {
  ilanNo?: string;
  baslik?: string;
  aciklama?: string;
  fiyatTL: number;
  m2: number;
  ilAd?: string;
  ilceAd?: string;
  mahalleAd?: string;
  nitelik?: string;
  imarDurumu?: string;
  tarih?: string | number | Date;
}

export type HukukiKisitTipi =
  | "hisseli_tapu"
  | "kooperatif_hisse"
  | "hobi_bahcesi"
  | "zilliyet_2b"
  | "icra_haciz"
  | "tarimsal_kisit";

export interface SanitizedIlanSonuc {
  /** Havuzda referans olarak kullanılabilir mi? */
  kullanilabilir: boolean;
  /** İlan üzerinde ciddi risk/kısıt tespit edildi mi? */
  guvenilirMi: boolean;
  /** Orijinal değerler */
  hamFiyatTL: number;
  hamM2: number;
  hamFiyatPerM2: number;
  /** Düzeltilmiş/normalize edilmiş değerler */
  duzeltilmisFiyatTL: number;
  duzeltilmisM2: number;
  duzeltilmisFiyatPerM2: number;
  /** Tespit edilen hukuki ve mülkiyet kısıtları */
  tespitEdilenKisitlar: HukukiKisitTipi[];
  /** Yapılan düzeltme veya eleme gerekçeleri */
  aciklamalar: string[];
  /** Değerleme güven ağırlığı cezası (0.0 ile 1.0 arası katsayı, 1.0 = tam temiz) */
  guvenlikCarpani: number;
}

// ── NLP & RegEx Kalıpları ───────────────────────────────────────────────────

const HISSELI_PATTERNS = [
  /\bhisse(li)?\b/i,
  /\bpayl[ıi]\s+m[uü]lkiyet\b/i,
  /\b[0-9]+(\/|\s*b[oö]l[uü]\s*)[0-9]+\s*(hisse|pay)\b/i,
  /\br[ıi]za-?[ıi]\s*taksim(li)?\b/i,
  /\bmuvafakatname(li)?\b/i,
  /\bhisse\s*sat[ıi][sş][ıi]\b/i,
  /\bm[uü]stakil\s*parsel\s*de[gğ]il\b/i,
];

const KOOPERATIF_PATTERNS = [
  /\bkooperatif\b/i,
  /\bkoop\.?\b/i,
  /\bkooperatif\s*hisse(si)?\b/i,
  /\bkooperatif\s*pay[ıi]\b/i,
  /\bkooperatif\s*[uü]yeli[gğ]i\b/i,
  /\bnoter\s*devirli\b/i,
  /\btapu\s*tahsisi\b/i,
];

const HOBI_BAHCESI_PATTERNS = [
  /\bhobi\s*bah[cç]e(si)?\b/i,
  /\btel\s*[oö]rg[uü](l[uü])?\s*(parsel|hisse|alan)\b/i,
  /\bkonteyner(l[ıi])?\s*bah[cç]e\b/i,
  /\btiny\s*house\s*yeri\b/i,
  // NOT: "elektrik su bağlı parsel" kaldırıldı — bu, altyapısı hazır sıradan bir
  // arsa/tarla ilanında da geçer; hobi bahçesiyle ilişkisi yok (yanlış pozitif).
];

const ZILLIYET_2B_PATTERNS = [
  /\b2-?b\b/i,
  /\bzilliyet(lik)?\b/i,
  /\borman\s*(tahsis|kullan[ıi]m[ıi]|vasf[ıi])\b/i,
  /\bmilli\s*emlak\s*tahsis\b/i,
  // NOT: "kullanım hakkı" kaldırıldı — çok genel bir ifade, 2B/zilliyet dışı
  // bağlamlarda da sık geçer (yanlış pozitif).
  /\becrimisil(li)?\b/i,
];

// Belirsiz hukuki sinyaller: sert red değil, sadece güven cezası.
// "şerh" tek başına çok genel (tapu kaydı metinlerinde sık geçer); "davalı" da öyle.
// Yalnızca daha spesifik icra/haciz ifadeleri güven cezasına yol açar.
const ICRA_HACIZ_PATTERNS = [
  /\bicra(l[ıi])?\b/i,
  /\bhaciz(li)?\b/i,
  /\bmahkemelik\b/i,
  /\bihtilaf(l[ıi])?\b/i,
];

/**
 * Ham ilanı NLP ve metrik filtrelerinden geçirerek rafineden geçirir.
 */
export function ilanSanitizeEt(ilan: RawIlanGirdisi): SanitizedIlanSonuc {
  const metin = `${ilan.baslik ?? ""} ${ilan.aciklama ?? ""}`.toLocaleLowerCase("tr");
  const aciklamalar: string[] = [];
  const kisitlar: HukukiKisitTipi[] = [];

  let kullanilabilir = true;
  let guvenilir = true;
  let guvenlikCarpani = 1.0;

  let duzeltilmisM2 = Number(ilan.m2) || 0;
  let duzeltilmisFiyatTL = Number(ilan.fiyatTL) || 0;
  // Ham fiyat/m² her düzeltmeden ÖNCEki orijinal girdi değerlerinden hesaplanır —
  // "ham" alanı gerçekten kullanıcının girdiği değeri yansıtsın.
  const hamFiyatPerM2 = duzeltilmisM2 > 0 ? duzeltilmisFiyatTL / duzeltilmisM2 : 0;

  // 1. Temel Doğrulama
  if (duzeltilmisM2 <= 0 || duzeltilmisFiyatTL <= 0) {
    return {
      kullanilabilir: false,
      guvenilirMi: false,
      hamFiyatTL: duzeltilmisFiyatTL,
      hamM2: duzeltilmisM2,
      hamFiyatPerM2: 0,
      duzeltilmisFiyatTL,
      duzeltilmisM2,
      duzeltilmisFiyatPerM2: 0,
      tespitEdilenKisitlar: [],
      aciklamalar: ["Geçersiz fiyat veya alan (sıfır veya negatif)."],
      guvenlikCarpani: 0,
    };
  }

  // 2. Dönüm/Dekar vs m² Giriş Hatası Düzeltmesi
  // Örn: İlan başlığında "15 Dönüm" yazıyor ama m² alanına 15 girilmiş
  const donumMatch = metin.match(/([0-9]+([.,][0-9]+)?)\s*(d[oö]n[uü]m|dekar)\b/i);
  if (donumMatch && duzeltilmisM2 <= 100) {
    const donumMiktar = parseFloat((donumMatch[1] ?? "0").replace(",", "."));
    if (donumMiktar > 0 && Math.abs(donumMiktar - duzeltilmisM2) < 1) {
      const yeniM2 = donumMiktar * 1000;
      aciklamalar.push(`Dönüm giriş hatası düzeltildi: ${duzeltilmisM2} → ${yeniM2} m²`);
      duzeltilmisM2 = yeniM2;
    }
  }

  let duzeltilmisFiyatPerM2 = duzeltilmisM2 > 0 ? duzeltilmisFiyatTL / duzeltilmisM2 : 0;

  // 3. Fiyat/m² vs Toplam Fiyat Karmaşası
  // Örn: Fiyat 500 TL yazılmış ama m² 2000 (Aslında 500 TL/m² demek istemiş)
  if (duzeltilmisFiyatTL < 5000 && duzeltilmisM2 >= 100) {
    duzeltilmisFiyatTL = duzeltilmisFiyatTL * duzeltilmisM2;
    duzeltilmisFiyatPerM2 = duzeltilmisFiyatTL / duzeltilmisM2;
    aciklamalar.push(`Birim fiyat toplam fiyat yerine girilmiş: Toplam ${duzeltilmisFiyatTL.toLocaleString("tr-TR")} TL'ye normalize edildi.`);
  }

  // 4. Hukuki Kısıt Taraması
  for (const pat of KOOPERATIF_PATTERNS) {
    if (pat.test(metin)) {
      kisitlar.push("kooperatif_hisse");
      aciklamalar.push("Kooperatif hissesi/payı tespit edildi (Müstakil tapu değil).");
      kullanilabilir = false;
      guvenilir = false;
      guvenlikCarpani *= 0.3;
      break;
    }
  }

  for (const pat of HOBI_BAHCESI_PATTERNS) {
    if (pat.test(metin)) {
      kisitlar.push("hobi_bahcesi");
      aciklamalar.push("Hobi bahçesi / hisseli kullanım tespit edildi.");
      kullanilabilir = false;
      guvenilir = false;
      guvenlikCarpani *= 0.4;
      break;
    }
  }

  for (const pat of ZILLIYET_2B_PATTERNS) {
    if (pat.test(metin)) {
      kisitlar.push("zilliyet_2b");
      aciklamalar.push("2B / Zilliyetlik / Tahsisli arazi (Özel mülk tapusu değil).");
      kullanilabilir = false;
      guvenilir = false;
      guvenlikCarpani *= 0.2;
      break;
    }
  }

  for (const pat of ICRA_HACIZ_PATTERNS) {
    if (pat.test(metin)) {
      kisitlar.push("icra_haciz");
      aciklamalar.push("İcra/haciz/dava şerhi tespit edildi.");
      guvenilir = false;
      guvenlikCarpani *= 0.7;
      break;
    }
  }

  for (const pat of HISSELI_PATTERNS) {
    if (pat.test(metin) && !kisitlar.includes("kooperatif_hisse") && !kisitlar.includes("hobi_bahcesi")) {
      kisitlar.push("hisseli_tapu");
      aciklamalar.push("Hisseli tapu / paylı mülkiyet tespit edildi.");
      guvenilir = false;
      guvenlikCarpani *= 0.65; // Müstakil parsele göre %35 değer kaybı
      break;
    }
  }

  // 5. Absürd Değer Kontrolü (Outlier Bounds)
  // Tek doğruluk kaynağı: fiyat-correction.ts'teki IL_KATEGORI_SINIR — sanitizer
  // burada kendi gömülü sınırlarını tutmaz, aynı tabloyu kullanır.
  const nitelikMetin = ilan.nitelik ?? "";
  const kategoriAnahtari = /tarla/i.test(nitelikMetin)
    ? "tarla"
    : /zeytin/i.test(nitelikMetin)
      ? "zeytinlik"
      : /bahçe|bahce/i.test(nitelikMetin)
        ? "bahce"
        : /bağ|bag/i.test(nitelikMetin)
          ? "bag"
          : "arsa";
  const isTarim = kategoriAnahtari !== "arsa";
  const ilNorm = ilan.ilAd ? normalizeYerAdi(ilan.ilAd) : "_default";
  const sinir =
    IL_KATEGORI_SINIR[`${ilNorm}:${kategoriAnahtari}`] ??
    IL_KATEGORI_SINIR[`_default:${kategoriAnahtari}`] ??
    IL_KATEGORI_SINIR["_default:arsa"]!;

  if (duzeltilmisFiyatPerM2 < sinir.altMin) {
    kullanilabilir = false;
    aciklamalar.push(
      `${isTarim ? "Tarımsal arazide" : "Arsa arazisinde"} aşırı düşük m² fiyatı (${duzeltilmisFiyatPerM2.toFixed(1)} TL/m² < ${sinir.altMin.toLocaleString("tr-TR")} TL/m²).`,
    );
  } else if (duzeltilmisFiyatPerM2 > sinir.ustMax) {
    kullanilabilir = false;
    aciklamalar.push(
      `${isTarim ? "Tarımsal arazide" : "Arsa arazisinde"} aşırı yüksek m² fiyatı (${duzeltilmisFiyatPerM2.toLocaleString("tr-TR")} TL/m² > ${sinir.ustMax.toLocaleString("tr-TR")} TL/m²).`,
    );
  }

  return {
    kullanilabilir,
    guvenilirMi: guvenilir && kullanilabilir,
    hamFiyatTL: Number(ilan.fiyatTL),
    hamM2: Number(ilan.m2),
    hamFiyatPerM2: Math.round(hamFiyatPerM2),
    duzeltilmisFiyatTL: Math.round(duzeltilmisFiyatTL),
    duzeltilmisM2: Math.round(duzeltilmisM2),
    duzeltilmisFiyatPerM2: Math.round(duzeltilmisFiyatPerM2),
    tespitEdilenKisitlar: kisitlar,
    aciklamalar,
    guvenlikCarpani: Number(guvenlikCarpani.toFixed(2)),
  };
}
