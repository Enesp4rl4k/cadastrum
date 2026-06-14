/**
 * AFAD Türkiye Deprem Tehlike Haritası — il bazlı risk skoru.
 *
 * Veri: Türkiye Bina Deprem Yönetmeliği (2018) PGA (Peak Ground Acceleration)
 * değerlerinden çıkarılmış il ortalama tablosu. Her il için:
 *   - pga: 475 yıllık dönemde aşılma olasılığı %10 olan ivme (g)
 *   - zone: Eski 1998 yönetmeliğinden 1-5 zone (1=en yüksek, 5=en düşük)
 *   - skor: 0-100 risk skoru (yüksek = riskli)
 *
 * Bu statik tablo Cadastrum içinde donmuş halde — hiç dış API çağrısı yok.
 * Mahalle/koordinat bazlı hassas hesap için ileride AFAD TDTH API entegrasyonu.
 */

export type DepremSeviyesi = "kritik" | "yuksek" | "orta" | "dusuk";

export interface DepremRiski {
  /** Peak Ground Acceleration (g cinsinden, 475 yıllık) */
  pga: number;
  /** Eski 1998 yönetmeliği zone (1-5) — referans */
  zone: 1 | 2 | 3 | 4 | 5;
  /** 0-100 risk skoru — yüksek değer daha riskli */
  skor: number;
  seviye: DepremSeviyesi;
  /** UI'da gösterilecek özet */
  ozet: string;
  /** Detaylı açıklama */
  aciklama: string;
}

/**
 * 81 il için PGA değerleri.
 * Kaynak: Türkiye Bina Deprem Yönetmeliği 2018 + il ortalamaları
 * (büyük illerde mahalle değişkenliği var; bu tablo conservative ortalama)
 */
const IL_PGA: Record<string, number> = {
  // Marmara — yüksek risk (Kuzey Anadolu Fay Hattı)
  "İstanbul": 0.40, "Tekirdağ": 0.40, "Kocaeli": 0.45, "Yalova": 0.45,
  "Sakarya": 0.42, "Bursa": 0.35, "Bilecik": 0.30, "Çanakkale": 0.32,
  "Edirne": 0.20, "Kırklareli": 0.18,

  // Ege — değişken risk
  "İzmir": 0.40, "Aydın": 0.40, "Muğla": 0.32, "Manisa": 0.35,
  "Denizli": 0.38, "Uşak": 0.30, "Kütahya": 0.28, "Afyonkarahisar": 0.30,
  "Balıkesir": 0.35,

  // Akdeniz — orta-yüksek
  "Antalya": 0.25, "Burdur": 0.40, "Isparta": 0.35,
  "Mersin": 0.20, "Adana": 0.30, "Osmaniye": 0.40, "Hatay": 0.50,
  "Kahramanmaraş": 0.50,

  // İç Anadolu — düşük-orta
  "Ankara": 0.15, "Konya": 0.15, "Eskişehir": 0.20, "Karaman": 0.18,
  "Aksaray": 0.20, "Niğde": 0.25, "Nevşehir": 0.20, "Kırşehir": 0.15,
  "Kırıkkale": 0.18, "Çankırı": 0.30, "Yozgat": 0.20, "Kayseri": 0.20,
  "Sivas": 0.25,

  // Karadeniz — değişken
  "Bartın": 0.25, "Bolu": 0.45, "Düzce": 0.50, "Zonguldak": 0.30,
  "Karabük": 0.25, "Kastamonu": 0.30, "Çorum": 0.30, "Amasya": 0.30,
  "Tokat": 0.35, "Sinop": 0.20, "Samsun": 0.18, "Ordu": 0.20,
  "Giresun": 0.20, "Trabzon": 0.18, "Rize": 0.18, "Artvin": 0.30,
  "Gümüşhane": 0.25, "Bayburt": 0.25,

  // Doğu Anadolu — yüksek (Doğu Anadolu Fay Hattı)
  "Erzurum": 0.40, "Erzincan": 0.45, "Tunceli": 0.40, "Bingöl": 0.45,
  "Muş": 0.40, "Bitlis": 0.40, "Van": 0.45, "Hakkari": 0.40,
  "Ağrı": 0.30, "Iğdır": 0.30, "Kars": 0.25, "Ardahan": 0.25,
  "Malatya": 0.45, "Elazığ": 0.45,

  // Güneydoğu — değişken
  "Gaziantep": 0.40, "Kilis": 0.30, "Şanlıurfa": 0.20, "Adıyaman": 0.45,
  "Diyarbakır": 0.30, "Mardin": 0.20, "Batman": 0.25, "Siirt": 0.30,
  "Şırnak": 0.30,
};

const FALLBACK_PGA = 0.25;

/**
 * lat/lng → mahalle/ilçe spesifik düzeltme. Şu an sadece il bazlı,
 * ileride TDTH API ile per-koordinat çıkarılabilir.
 */
function pgaIcinIl(ilAd: string | null | undefined): number {
  if (!ilAd) return FALLBACK_PGA;
  return IL_PGA[ilAd] ?? FALLBACK_PGA;
}

function pgaToZone(pga: number): 1 | 2 | 3 | 4 | 5 {
  if (pga >= 0.40) return 1;
  if (pga >= 0.30) return 2;
  if (pga >= 0.20) return 3;
  if (pga >= 0.10) return 4;
  return 5;
}

function pgaToSkor(pga: number): number {
  // Lineer eşleme: 0.05g → 10, 0.50g → 100
  return Math.min(100, Math.max(0, Math.round(((pga - 0.05) / 0.45) * 90 + 10)));
}

function skorToSeviye(skor: number): DepremSeviyesi {
  if (skor >= 80) return "kritik";
  if (skor >= 60) return "yuksek";
  if (skor >= 35) return "orta";
  return "dusuk";
}

function seviyeAciklama(seviye: DepremSeviyesi, pga: number, zone: number): string {
  const pgaFmt = pga.toFixed(2);
  const zoneFmt = `${zone}. derece`;
  switch (seviye) {
    case "kritik":
      return `${zoneFmt} deprem bölgesi, PGA ${pgaFmt}g — yüksek yıkım potansiyeli. Yapılaşmada güçlendirilmiş temel + sismik izolatör değerlendirilmeli.`;
    case "yuksek":
      return `${zoneFmt} deprem bölgesi, PGA ${pgaFmt}g — Yönetmelik standartlarında inşaat zorunlu. Zemin etüdü kritik.`;
    case "orta":
      return `${zoneFmt} deprem bölgesi, PGA ${pgaFmt}g — Standart yönetmelik kuralları yeterli, ek önlem gerekmiyor.`;
    case "dusuk":
      return `${zoneFmt} deprem bölgesi, PGA ${pgaFmt}g — Düşük sismik aktivite, standart inşaat güvenli.`;
  }
}

function seviyeOzet(seviye: DepremSeviyesi): string {
  switch (seviye) {
    case "kritik": return "Kritik risk";
    case "yuksek": return "Yüksek risk";
    case "orta": return "Orta risk";
    case "dusuk": return "Düşük risk";
  }
}

/**
 * Bir parsel için deprem risk hesabı.
 * @param ilAd parsel.ilAd (TKGM'den)
 */
export function depremRiskiHesapla(ilAd: string | null | undefined): DepremRiski {
  const pga = pgaIcinIl(ilAd);
  const zone = pgaToZone(pga);
  const skor = pgaToSkor(pga);
  const seviye = skorToSeviye(skor);
  return {
    pga,
    zone,
    skor,
    seviye,
    ozet: seviyeOzet(seviye),
    aciklama: seviyeAciklama(seviye, pga, zone),
  };
}

/** UI rengi için */
export function depremRengiSinif(seviye: DepremSeviyesi): {
  bg: string; border: string; text: string; ringColor: string;
} {
  switch (seviye) {
    case "kritik":
      return { bg: "bg-red-50", border: "border-red-300", text: "text-red-900", ringColor: "rgb(220, 38, 38)" };
    case "yuksek":
      return { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-900", ringColor: "rgb(234, 88, 12)" };
    case "orta":
      return { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-900", ringColor: "rgb(217, 119, 6)" };
    case "dusuk":
      return { bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-900", ringColor: "rgb(5, 150, 105)" };
  }
}
