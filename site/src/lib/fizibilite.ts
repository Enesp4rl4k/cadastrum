/**
 * İmar Fizibilite Hesap Motoru — saf fonksiyon, test edilebilir.
 *
 * Arsa + imar parametreleri → inşa edilebilir alan, daire sayısı, kârlılık.
 * Müteahhit/geliştirici için "bu arsaya ne yapılır, kâr eder mi?" sorusunu yanıtlar.
 */

export interface FizibiliteGirdi {
  parselM2: number;
  taks: number;           // Taban Alanı Kat Sayısı (0–1), örn 0.30
  kaks: number;           // Kat Alanı Kat Sayısı / Emsal, örn 1.50
  arsaMaliyeti: number;   // TL — arsanın alış/tahmini değeri
  insaatBirimMaliyet: number; // TL/m² — inşaat maliyeti (kaba+ince)
  satisBirimFiyat: number;    // TL/m² — bitmiş konut/işyeri satış fiyatı
  ortalamaDaireM2?: number;   // varsayılan 120
  satilabilirOran?: number;   // ortak alan düşüşü, varsayılan 0.82
}

export interface FizibiliteSonuc {
  tabanAlani: number;          // m² — zemin oturum
  toplamInsaatAlani: number;   // m² — emsal alanı (satılabilir brüt)
  tahminiKatAdedi: number;     // KAKS/TAKS
  satilabilirAlan: number;     // m² — ortak alan sonrası net
  daireAdedi: number;
  insaatMaliyetiToplam: number;
  satisGeliriToplam: number;
  toplamMaliyet: number;       // arsa + inşaat
  brutKar: number;
  karlilikYuzde: number;       // kâr / toplam maliyet × 100
  arsaPayiYuzde: number;       // arsa maliyeti / toplam maliyet
  basabasSatisFiyati: number;  // TL/m² — kâr 0 olması için min satış
  yorum: string;
}

export function fizibiliteHesapla(g: FizibiliteGirdi): FizibiliteSonuc {
  const ortalamaDaireM2 = g.ortalamaDaireM2 ?? 120;
  const satilabilirOran = g.satilabilirOran ?? 0.82;

  const tabanAlani = g.parselM2 * g.taks;
  const toplamInsaatAlani = g.parselM2 * g.kaks;
  const tahminiKatAdedi = g.taks > 0 ? g.kaks / g.taks : 0;
  const satilabilirAlan = toplamInsaatAlani * satilabilirOran;
  const daireAdedi = ortalamaDaireM2 > 0 ? Math.floor(satilabilirAlan / ortalamaDaireM2) : 0;

  const insaatMaliyetiToplam = toplamInsaatAlani * g.insaatBirimMaliyet;
  const satisGeliriToplam = satilabilirAlan * g.satisBirimFiyat;
  const toplamMaliyet = g.arsaMaliyeti + insaatMaliyetiToplam;
  const brutKar = satisGeliriToplam - toplamMaliyet;
  const karlilikYuzde = toplamMaliyet > 0 ? (brutKar / toplamMaliyet) * 100 : 0;
  const arsaPayiYuzde = toplamMaliyet > 0 ? (g.arsaMaliyeti / toplamMaliyet) * 100 : 0;
  const basabasSatisFiyati = satilabilirAlan > 0 ? toplamMaliyet / satilabilirAlan : 0;

  let yorum: string;
  if (karlilikYuzde >= 35) yorum = "Yüksek kârlılık — geliştirme cazip görünüyor.";
  else if (karlilikYuzde >= 20) yorum = "Makul kârlılık — piyasa riski hesaba katılmalı.";
  else if (karlilikYuzde >= 0) yorum = "Düşük marj — maliyet/satış varsayımlarına çok duyarlı.";
  else yorum = "Zarar riski — mevcut varsayımlarla geliştirme önerilmez.";

  return {
    tabanAlani: Math.round(tabanAlani),
    toplamInsaatAlani: Math.round(toplamInsaatAlani),
    tahminiKatAdedi: Math.round(tahminiKatAdedi * 10) / 10,
    satilabilirAlan: Math.round(satilabilirAlan),
    daireAdedi,
    insaatMaliyetiToplam: Math.round(insaatMaliyetiToplam),
    satisGeliriToplam: Math.round(satisGeliriToplam),
    toplamMaliyet: Math.round(toplamMaliyet),
    brutKar: Math.round(brutKar),
    karlilikYuzde: Math.round(karlilikYuzde * 10) / 10,
    arsaPayiYuzde: Math.round(arsaPayiYuzde * 10) / 10,
    basabasSatisFiyati: Math.round(basabasSatisFiyati),
    yorum,
  };
}

/** İl/bölge bazlı varsayılan inşaat birim maliyeti (TL/m², 2026 kaba tahmin). */
export function varsayilanInsaatMaliyeti(): number {
  return 18000; // Çevre ve Şehircilik Bakanlığı yaklaşık 2. sınıf yapı ~2026
}
