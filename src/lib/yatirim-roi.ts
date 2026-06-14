/**
 * Yatırım ROI/IRR/Cap Rate hesaplamaları — Faz 3 Sprint E.
 *
 * Konut + kira getirisi için klasik gayrimenkul yatırım metrikleri:
 *   - Brüt kira getirisi (gross yield) = yıllık kira / satın alma fiyatı
 *   - Cap rate (NOI yield)             = (yıllık kira − giderler) / fiyat
 *   - 10 yıl IRR                       = Newton-Raphson iterasyonu
 *
 * Kira tahmini şu an statik baseline ile (mahalle bazlı backend kira endpoint'i
 * Sprint G'de gelecek). Konut dışı (arsa/tarla) için kira null döner.
 */

export interface RoiGirdi {
  /** Satın alma fiyatı (TL) */
  fiyat: number;
  /** Yıllık brüt kira geliri (TL) — null ise kira hesabı atlanır */
  yillikKira: number | null;
  /** Yıllık giderler (TL) — bakım + vergi + sigorta. Varsayılan: yıllık kiranın %20'si */
  yillikGider?: number;
  /** Yıllık değer artış oranı tahmini (%) — varsayılan TCMB KFE ~%30 */
  yillikDegerArtisYuzdesi?: number;
  /** Projeksiyon süresi (yıl) — varsayılan 10 */
  yilSayisi?: number;
}

export interface RoiSonuc {
  /** Brüt kira getirisi (%) — yıllık kira / fiyat */
  brutKiraGetirisi: number | null;
  /** Net cap rate (%) = (yıllık kira − giderler) / fiyat */
  capRate: number | null;
  /** 10 yıl Internal Rate of Return (%) */
  irr10y: number | null;
  /** 10 yıl toplam getiri (TL) — kira + değer artışı */
  toplamGetiri10y: number;
  /** Yıllık brüt kira (computed) — fiyatın %5'i fallback */
  yillikKiraEfektif: number;
  /** Yıllık gider (computed) */
  yillikGiderEfektif: number;
}

/**
 * Newton-Raphson ile NPV=0 çözen IRR.
 * Cash flow: [-fiyat, NOI_yil1, NOI_yil2, ..., NOI_yil10 + satis_degeri]
 */
function irrHesapla(cashflow: number[]): number | null {
  if (cashflow.length < 2) return null;
  const npv = (r: number) =>
    cashflow.reduce((s, cf, i) => s + cf / Math.pow(1 + r, i), 0);
  const dnpv = (r: number) =>
    cashflow.reduce((s, cf, i) => (i === 0 ? s : s - (i * cf) / Math.pow(1 + r, i + 1)), 0);

  let r = 0.10; // başlangıç tahmin %10
  for (let iter = 0; iter < 50; iter++) {
    const v = npv(r);
    if (Math.abs(v) < 1) return r;
    const d = dnpv(r);
    if (Math.abs(d) < 1e-6) break;
    const yeni = r - v / d;
    if (!Number.isFinite(yeni)) break;
    if (Math.abs(yeni - r) < 1e-6) return yeni;
    r = yeni;
  }
  return Number.isFinite(r) ? r : null;
}

export function roiHesapla(girdi: RoiGirdi): RoiSonuc {
  const fiyat = girdi.fiyat;
  const yilSayisi = girdi.yilSayisi ?? 10;
  const degerArtisYuzdesi = girdi.yillikDegerArtisYuzdesi ?? 30;
  const yillikKira = girdi.yillikKira;
  const giderOrani = 0.20; // varsayılan: kiranın %20'si

  if (!Number.isFinite(fiyat) || fiyat <= 0) {
    return {
      brutKiraGetirisi: null,
      capRate: null,
      irr10y: null,
      toplamGetiri10y: 0,
      yillikKiraEfektif: 0,
      yillikGiderEfektif: 0,
    };
  }

  // Kira yoksa NULL döner — değer artışı tek başına IRR hesabı için
  // gross yield/cap rate anlamsız.
  const yillikKiraEf = yillikKira ?? 0;
  const yillikGiderEf =
    girdi.yillikGider ?? (yillikKira != null ? yillikKira * giderOrani : 0);
  const noi = yillikKiraEf - yillikGiderEf;

  const brutKiraGetirisi = yillikKira != null ? (yillikKira / fiyat) * 100 : null;
  const capRate = yillikKira != null ? (noi / fiyat) * 100 : null;

  // 10 yıl cash flow: ilk yıl -fiyat, yıllar 1-9 NOI, yıl 10 NOI + satış değeri
  const satisFiyati = fiyat * Math.pow(1 + degerArtisYuzdesi / 100, yilSayisi);
  const cashflow: number[] = [-fiyat];
  for (let y = 1; y < yilSayisi; y++) cashflow.push(noi);
  cashflow.push(noi + satisFiyati);

  const irr = irrHesapla(cashflow);
  const toplamGetiri = noi * yilSayisi + (satisFiyati - fiyat);

  return {
    brutKiraGetirisi: brutKiraGetirisi != null ? Math.round(brutKiraGetirisi * 100) / 100 : null,
    capRate: capRate != null ? Math.round(capRate * 100) / 100 : null,
    irr10y: irr != null ? Math.round(irr * 10000) / 100 : null, // % olarak 2 ondalık
    toplamGetiri10y: Math.round(toplamGetiri),
    yillikKiraEfektif: Math.round(yillikKiraEf),
    yillikGiderEfektif: Math.round(yillikGiderEf),
  };
}
