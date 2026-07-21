/**
 * Kat karşılığı hesaplayıcı — saf fonksiyon.
 * Arsa sahibi + müteahhit pay dağılımı (yaklaşık; hukuki sözleşme değildir).
 */

export interface KatKarsiligiGirdi {
  parselM2: number;
  kaks: number;
  /** Müteahhit payı % — örn. 50 → inşaatın %50'si müteahhitte */
  muteahhitPayYuzde: number;
  insaatBirimMaliyet: number;
  satisBirimFiyat: number;
  ortalamaDaireM2?: number;
  satilabilirOran?: number;
  /** Arsa sahibinin arsa bedeli (opsiyonel — değerleme) */
  arsaDegeri?: number;
}

export interface KatKarsiligiSonuc {
  toplamInsaatAlani: number;
  satilabilirAlan: number;
  daireAdedi: number;
  malikAlanM2: number;
  muteahhitAlanM2: number;
  malikDaire: number;
  muteahhitDaire: number;
  malikPayYuzde: number;
  muteahhitPayYuzde: number;
  muteahhitInsaatMaliyeti: number;
  muteahhitSatisGeliri: number;
  muteahhitBrutKar: number;
  malikSatisDegeri: number;
  yorum: string;
}

export function katKarsiligiHesapla(g: KatKarsiligiGirdi): KatKarsiligiSonuc {
  const satilabilirOran = g.satilabilirOran ?? 0.82;
  const ortalamaDaireM2 = g.ortalamaDaireM2 ?? 120;
  const muteahhitPay = Math.min(90, Math.max(10, g.muteahhitPayYuzde)) / 100;
  const malikPay = 1 - muteahhitPay;

  const toplamInsaatAlani = g.parselM2 * g.kaks;
  const satilabilirAlan = toplamInsaatAlani * satilabilirOran;
  const daireAdedi = ortalamaDaireM2 > 0 ? Math.floor(satilabilirAlan / ortalamaDaireM2) : 0;

  const malikAlanM2 = Math.round(satilabilirAlan * malikPay);
  const muteahhitAlanM2 = Math.round(satilabilirAlan * muteahhitPay);
  const malikDaire = ortalamaDaireM2 > 0 ? Math.floor(malikAlanM2 / ortalamaDaireM2) : 0;
  const muteahhitDaire = Math.max(0, daireAdedi - malikDaire);

  const muteahhitInsaatMaliyeti = Math.round(toplamInsaatAlani * g.insaatBirimMaliyet);
  const muteahhitSatisGeliri = Math.round(muteahhitAlanM2 * g.satisBirimFiyat);
  const muteahhitBrutKar = muteahhitSatisGeliri - muteahhitInsaatMaliyeti;
  const malikSatisDegeri = Math.round(malikAlanM2 * g.satisBirimFiyat);

  let yorum: string;
  if (muteahhitBrutKar < 0) {
    yorum = "Müteahhit tarafı zarar riskinde — pay veya satış varsayımlarını gözden geçirin.";
  } else if (g.arsaDegeri != null && g.arsaDegeri > 0 && malikSatisDegeri < g.arsaDegeri * 0.9) {
    yorum = "Malik daire değeri arsa bedelinin altında kalabilir — pazarlık veya pay artışı düşünün.";
  } else if (malikPay >= 0.45 && muteahhitBrutKar > 0) {
    yorum = "Dengeli görünüyor — malik payı makul, müteahhit marjı pozitif.";
  } else {
    yorum = "Yaklaşık dağılım; gerçek kat karşılığı sözleşmesi belediye/imar ve pazar koşullarına göre değişir.";
  }

  return {
    toplamInsaatAlani: Math.round(toplamInsaatAlani),
    satilabilirAlan: Math.round(satilabilirAlan),
    daireAdedi,
    malikAlanM2,
    muteahhitAlanM2,
    malikDaire,
    muteahhitDaire,
    malikPayYuzde: Math.round(malikPay * 1000) / 10,
    muteahhitPayYuzde: Math.round(muteahhitPay * 1000) / 10,
    muteahhitInsaatMaliyeti,
    muteahhitSatisGeliri,
    muteahhitBrutKar,
    malikSatisDegeri,
    yorum,
  };
}
