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

export interface TersFizibiliteGirdi {
  parselM2: number;
  taks: number;
  arsaMaliyeti: number;
  insaatBirimMaliyet: number;
  satisBirimFiyat: number;
  /** Hedef kârlılık % — örn. 25 */
  hedefKarlilikYuzde?: number;
  /** Hedef daire adedi — verilirse min emsal buradan da türetilir */
  hedefDaireAdedi?: number;
  ortalamaDaireM2?: number;
  satilabilirOran?: number;
}

export interface TersFizibiliteSonuc {
  /** Hedef kâr için gereken minimum emsal (KAKS) */
  minEmsal: number | null;
  /** Hedef kâr için max arsa maliyeti (mevcut emsal ile) */
  maxArsaMaliyeti: number | null;
  /** Hedef daire için gereken minimum emsal */
  minEmsalDaireIcin: number | null;
  yorum: string;
}

/**
 * Ters fizibilite: hedef kâr % veya daire adedi → gereken min emsal / max arsa bedeli.
 * Mevcut emsal bilinmiyorsa yalnız daire hedefi veya arsa=sabit + emsal çözümü.
 */
export function tersFizibiliteHesapla(
  g: TersFizibiliteGirdi & { mevcutKaks?: number },
): TersFizibiliteSonuc {
  const satilabilirOran = g.satilabilirOran ?? 0.82;
  const ortalamaDaireM2 = g.ortalamaDaireM2 ?? 120;
  const hedef = (g.hedefKarlilikYuzde ?? 25) / 100;

  let minEmsalDaireIcin: number | null = null;
  if (g.hedefDaireAdedi != null && g.hedefDaireAdedi > 0 && g.parselM2 > 0) {
    // daire = floor(parsel * kaks * oran / daireM2) ≥ hedef → kaks ≥ hedef * daireM2 / (parsel * oran)
    minEmsalDaireIcin =
      Math.round(((g.hedefDaireAdedi * ortalamaDaireM2) / (g.parselM2 * satilabilirOran)) * 100) / 100;
  }

  // geliri = parsel * kaks * oran * satis
  // maliyet = arsa + parsel * kaks * insaat
  // (gelir - maliyet) / maliyet = hedef
  // gelir = maliyet * (1+hedef)
  // parsel*kaks*oran*satis = (arsa + parsel*kaks*insaat) * (1+hedef)
  // kaks * parsel * (oran*satis - insaat*(1+hedef)) = arsa * (1+hedef)
  let minEmsal: number | null = null;
  const katsayi =
    g.parselM2 * (satilabilirOran * g.satisBirimFiyat - g.insaatBirimMaliyet * (1 + hedef));
  if (katsayi > 0 && g.arsaMaliyeti >= 0) {
    minEmsal = Math.round(((g.arsaMaliyeti * (1 + hedef)) / katsayi) * 100) / 100;
  }

  let maxArsaMaliyeti: number | null = null;
  const kaks = g.mevcutKaks;
  if (kaks != null && kaks > 0 && g.parselM2 > 0) {
    const gelir = g.parselM2 * kaks * satilabilirOran * g.satisBirimFiyat;
    const insaat = g.parselM2 * kaks * g.insaatBirimMaliyet;
    // (gelir - arsa - insaat) / (arsa + insaat) = hedef
    // gelir - arsa - insaat = hedef * arsa + hedef * insaat
    // gelir - insaat - hedef*insaat = arsa * (1+hedef)
    const pay = gelir - insaat * (1 + hedef);
    if (pay > 0) {
      maxArsaMaliyeti = Math.round(pay / (1 + hedef));
    } else {
      maxArsaMaliyeti = 0;
    }
  }

  const parts: string[] = [];
  if (minEmsal != null) parts.push(`Hedef %${g.hedefKarlilikYuzde ?? 25} kâr için min emsal ≈ ${minEmsal}.`);
  if (maxArsaMaliyeti != null) parts.push(`Mevcut emsal ile max arsa bedeli ≈ ${maxArsaMaliyeti.toLocaleString("tr-TR")} ₺.`);
  if (minEmsalDaireIcin != null) parts.push(`${g.hedefDaireAdedi} daire için min emsal ≈ ${minEmsalDaireIcin}.`);
  if (parts.length === 0) {
    parts.push("Girdiler yetersiz veya satış birim fiyatı inşaat maliyetine göre düşük — hedef tutmuyor.");
  }

  return {
    minEmsal,
    maxArsaMaliyeti,
    minEmsalDaireIcin,
    yorum: parts.join(" "),
  };
}

export interface SenaryoKarsilastirma {
  a: FizibiliteSonuc;
  b: FizibiliteSonuc;
  deltaKarlilik: number;
  deltaBrutKar: number;
  deltaDaire: number;
  kazanan: "A" | "B" | "berabere";
}

/** İki imar/maliyet setini yan yana karşılaştır. */
export function senaryoKarsilastir(a: FizibiliteGirdi, b: FizibiliteGirdi): SenaryoKarsilastirma {
  const sa = fizibiliteHesapla(a);
  const sb = fizibiliteHesapla(b);
  const deltaKarlilik = Math.round((sb.karlilikYuzde - sa.karlilikYuzde) * 10) / 10;
  const deltaBrutKar = sb.brutKar - sa.brutKar;
  const deltaDaire = sb.daireAdedi - sa.daireAdedi;
  let kazanan: "A" | "B" | "berabere" = "berabere";
  if (sb.karlilikYuzde > sa.karlilikYuzde + 0.5) kazanan = "B";
  else if (sa.karlilikYuzde > sb.karlilikYuzde + 0.5) kazanan = "A";
  return { a: sa, b: sb, deltaKarlilik, deltaBrutKar, deltaDaire, kazanan };
}
