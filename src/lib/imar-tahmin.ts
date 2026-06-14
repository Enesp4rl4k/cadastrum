/**
 * İmar Tahmin Sistemi
 *
 * e-Plan portali bozuksa veya parsel için resmi imar verisi yoksa,
 * mahalle/ilçe ortalaması + nitelik bazlı kural setiyle tahmini imar
 * değerleri üretir.
 *
 * Bu KESİN değildir — kullanıcıya "tahmini" olarak gösterilmeli, resmi imar
 * için belediye e-imar portali yönlendirmesi yapılmalı.
 *
 * Tahmin kaynakları:
 *   1. Mahalle baseline kategori (arsa/konut/tarla baz alınır → ortalama TAKS/Emsal)
 *   2. Nitelik (parselin tapu niteliği — tarla/arsa/mesken)
 *   3. Konum (kentsel/kırsal — il merkezine mesafe)
 *   4. Yapı yoğunluğu (mahalle özellik vector — şehirleşme)
 */

import type { Parsel } from "../types/tkgm";
import { MAHALLE_OZELLIK } from "./data/mahalle-ozellik";
import { mahalleKeyOlustur } from "./baseline-engine";

export interface ImarTahmini {
  /** Tahmini TAKS (taban alan kat sayısı) */
  taks: number | null;
  /** Tahmini emsal (kat alan kat sayısı) */
  emsal: number | null;
  /** Tahmini maksimum kat sayısı */
  maksKat: number | null;
  /** Yapı nizamı tahmini */
  yapiNizami: string | null;
  /** Kullanım kararı tahmini */
  kullanimKarari: string | null;
  /** Tahmin gerekçesi (kullanıcıya açıklama) */
  gerekce: string;
  /** Güven skoru 0-100 (ne kadar güvenilir tahmin) */
  guven: number;
  /** Bu tahmin için kullanılan kaynak */
  kaynak: "mahalle-tahmin" | "ilce-tahmin" | "nitelik-tahmin" | "fallback";
}

/**
 * Ana tahmin fonksiyonu — parselin niteliği + mahalle özellik vector'ünden
 * mantıklı bir imar tahmini üretir.
 */
export function imarTahminEt(parsel: Parsel): ImarTahmini {
  const nitelik = (parsel.nitelik ?? "").toLowerCase();
  const ozellikKey = mahalleKeyOlustur(parsel.ilAd, parsel.ilceAd, parsel.mahalleAd);
  const ozellik = ozellikKey ? MAHALLE_OZELLIK[ozellikKey] : undefined;

  // Mahalle özellik vector: [sahilKm, metroKm, uniKm, anayolKm, ilMerkezKm]
  const sahilKm = ozellik?.[0] ?? 0;
  const metroKm = ozellik?.[1] ?? 0;
  const uniKm = ozellik?.[2] ?? 0;
  const ilMerkezKm = ozellik?.[4] ?? 100;

  // Kentsel mi kırsal mı?
  const kentsel = (
    (metroKm > 0 && metroKm <= 5) ||
    (uniKm > 0 && uniKm <= 5) ||
    (ilMerkezKm > 0 && ilMerkezKm <= 15)
  );
  const yariKentsel = !kentsel && ilMerkezKm > 0 && ilMerkezKm <= 35;
  const kirsal = !kentsel && !yariKentsel;

  const sahile_yakin = sahilKm > 0 && sahilKm <= 2;

  // Tarla / Bağ / Bahçe / Zeytinlik → tarımsal nitelik (yapı izni sınırlı)
  if (/tarla|bağ\b|bag\b|bahç|bahce|zeytin|çayır|cayır|mer'a|mera/.test(nitelik)) {
    return {
      taks: null,
      emsal: null,
      maksKat: null,
      yapiNizami: null,
      kullanimKarari: "Tarımsal Alan",
      gerekce:
        "Parsel tapu niteliği tarımsal. 3194 sayılı İmar Kanunu kapsamında yapı izni sınırlı; " +
        "sadece tarımsal yapı (1 katı + bağ evi) ya da 2A/2B arazi dönüşüm sürecinde imar talep edilebilir. " +
        "Resmi imar için Köy Yerleşim Planı veya Tarım Bakanlığı izni kontrol edin.",
      guven: 70,
      kaynak: "nitelik-tahmin",
    };
  }

  // Mesken / Bina / Ev / Apartman → konut imarı
  if (/mesken|bina|apartman|daire|konut|ev\b|villa/.test(nitelik)) {
    if (sahile_yakin) {
      return {
        taks: 0.30,
        emsal: 1.50,
        maksKat: 4,
        yapiNizami: "Ayrık nizam",
        kullanimKarari: "Turistik Konut",
        gerekce: "Mahalle profili: sahile yakın konut bölgesi. Sahilde tipik turistik konut imarı (ayrık nizam, düşük yoğunluk).",
        guven: 50,
        kaynak: "mahalle-tahmin",
      };
    }
    if (kentsel) {
      return {
        taks: 0.30,
        emsal: 2.00,
        maksKat: 6,
        yapiNizami: "Bitişik nizam",
        kullanimKarari: "Konut Alanı",
        gerekce: "Mahalle profili: kentsel/şehir merkezi. Tipik 5-7 katlı konut imarı (orta yoğunluk).",
        guven: 50,
        kaynak: "mahalle-tahmin",
      };
    }
    if (yariKentsel) {
      return {
        taks: 0.25,
        emsal: 1.00,
        maksKat: 3,
        yapiNizami: "Ayrık nizam",
        kullanimKarari: "Konut Alanı",
        gerekce: "Mahalle profili: ilçe merkezine yakın yarı-kentsel. Düşük yoğunluk konut imarı tahmini.",
        guven: 45,
        kaynak: "mahalle-tahmin",
      };
    }
    // Kırsal mesken
    return {
      taks: 0.20,
      emsal: 0.40,
      maksKat: 2,
      yapiNizami: "Ayrık nizam",
      kullanimKarari: "Köy Yerleşim Alanı",
      gerekce: "Mahalle profili: kırsal/köy. Köy Yerleşim Planı çerçevesinde küçük ölçekli yapı.",
      guven: 40,
      kaynak: "mahalle-tahmin",
    };
  }

  // Arsa → mahalle profiline göre
  if (/arsa/.test(nitelik)) {
    if (sahile_yakin) {
      return {
        taks: 0.30,
        emsal: 1.50,
        maksKat: 4,
        yapiNizami: "Ayrık nizam",
        kullanimKarari: "Konut + Turistik",
        gerekce: "Sahile <2km arsa. Tipik turistik konut imarı, ayrık nizam, düşük-orta yoğunluk.",
        guven: 45,
        kaynak: "mahalle-tahmin",
      };
    }
    if (kentsel) {
      return {
        taks: 0.30,
        emsal: 1.80,
        maksKat: 5,
        yapiNizami: "Bitişik nizam",
        kullanimKarari: "Konut Alanı",
        gerekce:
          "Kentsel arsa. Şehir merkezi/yakın çevrede tipik konut imarı (bitişik nizam, orta yoğunluk). " +
          "Bu tahmin mahalle profilinden — kesin değer için belediye e-imar portali sorgulayın.",
        guven: 45,
        kaynak: "mahalle-tahmin",
      };
    }
    if (yariKentsel) {
      return {
        taks: 0.25,
        emsal: 0.90,
        maksKat: 3,
        yapiNizami: "Ayrık nizam",
        kullanimKarari: "Konut Alanı",
        gerekce: "Yarı-kentsel arsa. İlçe merkezine yakın, düşük yoğunluk konut imarı tahmini.",
        guven: 40,
        kaynak: "mahalle-tahmin",
      };
    }
    // Kırsal arsa — büyük ihtimalle imar dışı veya köy iskan
    return {
      taks: 0.20,
      emsal: 0.40,
      maksKat: 2,
      yapiNizami: "Ayrık nizam",
      kullanimKarari: "Köy Yerleşim Alanı (varsayım)",
      gerekce:
        "Kırsal arsa. Köy yerleşik alanı içindeyse 0.20/0.40, dışındaysa imar dışı olabilir. " +
        "Köy Yerleşim Planı kontrol edin.",
      guven: 30,
      kaynak: "mahalle-tahmin",
    };
  }

  // Bilinmeyen nitelik
  return {
    taks: null,
    emsal: null,
    maksKat: null,
    yapiNizami: null,
    kullanimKarari: null,
    gerekce:
      "Parsel niteliğinden imar tahmini yapılamadı. Belediye e-imar portali, " +
      "1/1000 uygulama imar planı veya Köy Yerleşim Planı'na başvurun.",
    guven: 0,
    kaynak: "fallback",
  };
}

/** Yapı hakları hesabı — tahmin değerleri varsa */
export function yapiHaklariHesapla(parsel: Parsel, taks: number | null, emsal: number | null): {
  tabanAlan: number | null;
  insaatAlan: number | null;
  tahminiKonut: number | null;
} {
  const tabanAlan = taks != null ? Math.round(parsel.alan * taks) : null;
  const insaatAlan = emsal != null ? Math.round(parsel.alan * emsal) : null;
  const tahminiKonut = insaatAlan != null && insaatAlan > 0 ? Math.floor(insaatAlan / 100) : null;
  return { tabanAlan, insaatAlan, tahminiKonut };
}
