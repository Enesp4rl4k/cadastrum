/**
 * Yatırım ROI/IRR/Cap Rate hesaplamaları — vergi dahil.
 *
 * Konut + kira getirisi için gayrimenkul yatırım metrikleri:
 *   - Brüt kira getirisi (gross yield) = yıllık kira / satın alma fiyatı
 *   - Cap rate (NOI yield)             = (yıllık kira − giderler) / fiyat
 *   - 10 yıl IRR                       = Newton-Raphson iterasyonu (vergi sonrası)
 *
 * VERGİ KATMANI (Türkiye 2026):
 *   - Tapu harcı: Alıcı + satıcı her biri %2 = toplam %4 (alım maliyeti)
 *   - Döner Sermaye: 750-1500 TL sabit
 *   - KDV: Arsa alımında yok; inşaat yapılacaksa %8-18
 *   - Kira gelir vergisi: İlk 33.000 TL istisna, kalan %15-35 dilimli
 *   - Değer artış kazancı vergisi: Satışta 5 yıl sonra sıfır, öncesi %15-40
 *   - Emlak vergisi: Yıllık değerin %0.1-0.3'ü (arsa %0.3)
 */

export interface RoiGirdi {
  /** Satın alma fiyatı (TL) */
  fiyat: number;
  /** Yıllık brüt kira geliri (TL) — null ise kira hesabı atlanır */
  yillikKira: number | null;
  /** Yıllık giderler (TL) — bakım + sigorta. Varsayılan: kiranın %15'i */
  yillikGider?: number;
  /** Yıllık değer artış oranı tahmini (%) — varsayılan TCMB KFE ~%35 */
  yillikDegerArtisYuzdesi?: number;
  /** Projeksiyon süresi (yıl) — varsayılan 10 */
  yilSayisi?: number;
  /** Vergi hesaplamalarını dahil et? Varsayılan: true */
  vergiDahil?: boolean;
  /** Parsel türü: arsa için emlak vergisi %0.3, konut %0.1 */
  parselTuru?: "arsa" | "konut" | "ticari" | "tarla";
  /** Alım yılı — 5 yıl dolunca değer artış vergisi sıfır */
  alimYili?: number;
}

export interface VergiDetay {
  /** Alımda ödenen tapu harcı (TL) — fiyatın %2'si */
  tapuHarciTL: number;
  /** Döner sermaye ücreti (TL) */
  donerSermayreTL: number;
  /** Toplam alım masrafı (TL) */
  toplamAlimMasrafi: number;
  /** Yıllık emlak vergisi (TL) */
  yillikEmlakVergiTL: number;
  /** Kira geliri üzerinden yıllık vergi (TL) */
  yillikKiraVergiTL: number;
  /** Satışta ödenen değer artış kazancı vergisi (TL) */
  degerArtisVergiTL: number;
  /** Net kira (brüt − gider − vergi) */
  netKiraYillikTL: number;
}

export interface RoiSonuc {
  /** Brüt kira getirisi (%) — yıllık kira / fiyat */
  brutKiraGetirisi: number | null;
  /** Net cap rate (%) = (yıllık kira − giderler) / fiyat */
  capRate: number | null;
  /** Net cap rate vergi sonrası (%) */
  capRateVergiSonrasi: number | null;
  /** 10 yıl Internal Rate of Return (%) — vergi dahil */
  irr10y: number | null;
  /** 10 yıl IRR vergi öncesi */
  irr10yBrut: number | null;
  /** 10 yıl toplam getiri (TL) — kira + değer artışı, vergi öncesi */
  toplamGetiri10y: number;
  /** 10 yıl toplam getiri vergi sonrası (TL) */
  toplamGetiriNet10y: number;
  /** Yıllık brüt kira (TL) */
  yillikKiraEfektif: number;
  /** Yıllık gider (TL) */
  yillikGiderEfektif: number;
  /** Vergi detayları */
  vergi: VergiDetay;
  /** Geri ödeme süresi (yıl) — net NOI ile alım fiyatı kaplama */
  geriOdemeSuresiYil: number | null;
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

// ─── Vergi hesaplama yardımcıları ─────────────────────────────────────────────

/** Türkiye kira geliri gelir vergisi (2026 dilimleri) */
function kiraVergiHesapla(yillikBrutKira: number): number {
  const istisna = 33_000; // 2026 kira geliri istisnası
  const vergiMatrahi = Math.max(0, yillikBrutKira - istisna);
  if (vergiMatrahi <= 0) return 0;

  // Gelir vergisi dilimleri 2026 (TL)
  const dilimler = [
    { limit: 158_000, oran: 0.15 },
    { limit: 330_000, oran: 0.20 },
    { limit: 800_000, oran: 0.27 },
    { limit: 4_300_000, oran: 0.35 },
    { limit: Infinity, oran: 0.40 },
  ];

  let vergi = 0;
  let kalan = vergiMatrahi;
  let oncekiLimit = 0;

  for (const dilim of dilimler) {
    const dilimTutari = Math.min(kalan, dilim.limit - oncekiLimit);
    if (dilimTutari <= 0) break;
    vergi += dilimTutari * dilim.oran;
    kalan -= dilimTutari;
    oncekiLimit = dilim.limit;
    if (kalan <= 0) break;
  }
  return Math.round(vergi);
}

/** Değer artış kazancı vergisi (5 yıl sonrası sıfır) */
function degerArtisVergiHesapla(
  alisFiyati: number,
  satisFiyati: number,
  elindeKacYil: number,
): number {
  if (elindeKacYil >= 5) return 0; // 5 yıl sonra muafiyet

  // İstisna tutarı 2026: ~115.000 TL
  const istisna = 115_000;
  const kazanc = Math.max(0, satisFiyati - alisFiyati - istisna);
  if (kazanc <= 0) return 0;

  // Değer artış kazancı için aynı gelir vergisi dilimleri
  return kiraVergiHesapla(kazanc);
}

// ─── Ana fonksiyon ────────────────────────────────────────────────────────────

export function roiHesapla(girdi: RoiGirdi): RoiSonuc {
  const fiyat = girdi.fiyat;
  const yilSayisi = girdi.yilSayisi ?? 10;
  const degerArtisYuzdesi = girdi.yillikDegerArtisYuzdesi ?? 35;
  const yillikKira = girdi.yillikKira;
  const vergiDahil = girdi.vergiDahil !== false;
  const parselTuru = girdi.parselTuru ?? "arsa";

  const BOSH_SONUC: RoiSonuc = {
    brutKiraGetirisi: null, capRate: null, capRateVergiSonrasi: null,
    irr10y: null, irr10yBrut: null, toplamGetiri10y: 0, toplamGetiriNet10y: 0,
    yillikKiraEfektif: 0, yillikGiderEfektif: 0, geriOdemeSuresiYil: null,
    vergi: { tapuHarciTL: 0, donerSermayreTL: 0, toplamAlimMasrafi: 0, yillikEmlakVergiTL: 0, yillikKiraVergiTL: 0, degerArtisVergiTL: 0, netKiraYillikTL: 0 },
  };

  if (!Number.isFinite(fiyat) || fiyat <= 0) return BOSH_SONUC;

  // ─── Vergi hesabı ─────────────────────────────────────────────────────────
  // Tapu harcı: alıcı %2 (satıcı da %2 ama yatırımcı perspektifinden sadece alıcı)
  const tapuHarciTL = Math.round(fiyat * 0.02);
  const donerSermayreTL = 1_200; // 2026 ortalama döner sermaye
  const toplamAlimMasrafi = tapuHarciTL + donerSermayreTL;

  // Emlak vergisi oranı (yıllık)
  const emlakVergiOrani = parselTuru === "konut" ? 0.001
    : parselTuru === "ticari" ? 0.002
    : 0.003; // arsa + tarla
  const yillikEmlakVergiTL = Math.round(fiyat * emlakVergiOrani);

  // Kira geliri vergisi
  const yillikKiraEf = yillikKira ?? 0;
  const giderOrani = 0.15;
  const yillikGiderEf = girdi.yillikGider ?? (yillikKira != null ? yillikKira * giderOrani : 0);
  const yillikKiraVergiTL = vergiDahil && yillikKira != null
    ? kiraVergiHesapla(yillikKira)
    : 0;

  // Değer artış vergisi (satışta — kaç yıl elde tutuldu?)
  const satisFiyati = fiyat * Math.pow(1 + degerArtisYuzdesi / 100, yilSayisi);
  const elindeKacYil = yilSayisi;
  const degerArtisVergiTL = vergiDahil
    ? degerArtisVergiHesapla(fiyat, satisFiyati, elindeKacYil)
    : 0;

  // Net kira (gider + vergi + emlak vergisi düşüldükten sonra)
  const noi = yillikKiraEf - yillikGiderEf;
  const noiNet = noi - yillikKiraVergiTL - yillikEmlakVergiTL;

  // ─── Getiri metrikleri ────────────────────────────────────────────────────
  const brutKiraGetirisi = yillikKira != null ? (yillikKira / fiyat) * 100 : null;
  const capRate = yillikKira != null ? (noi / fiyat) * 100 : null;
  const capRateVergiSonrasi = yillikKira != null ? (noiNet / fiyat) * 100 : null;

  // ─── Cash flow — brüt ─────────────────────────────────────────────────────
  const cfBrut: number[] = [-(fiyat + toplamAlimMasrafi)];
  for (let y = 1; y < yilSayisi; y++) cfBrut.push(noi);
  cfBrut.push(noi + satisFiyati);

  // ─── Cash flow — net (vergi dahil) ────────────────────────────────────────
  const cfNet: number[] = [-(fiyat + toplamAlimMasrafi)];
  for (let y = 1; y < yilSayisi; y++) cfNet.push(noiNet);
  cfNet.push(noiNet + satisFiyati - degerArtisVergiTL);

  const irrBrut = irrHesapla(cfBrut);
  const irrNet = irrHesapla(cfNet);

  const toplamGetiri = noi * yilSayisi + (satisFiyati - fiyat);
  const toplamGetiriNet = noiNet * yilSayisi + (satisFiyati - fiyat - degerArtisVergiTL);

  // Geri ödeme süresi (net NOI / toplam maliyet)
  const geriOdeme = noiNet > 0
    ? Math.round((fiyat + toplamAlimMasrafi) / noiNet * 10) / 10
    : null;

  return {
    brutKiraGetirisi: brutKiraGetirisi != null ? Math.round(brutKiraGetirisi * 100) / 100 : null,
    capRate: capRate != null ? Math.round(capRate * 100) / 100 : null,
    capRateVergiSonrasi: capRateVergiSonrasi != null ? Math.round(capRateVergiSonrasi * 100) / 100 : null,
    irr10y: irrNet != null ? Math.round(irrNet * 10000) / 100 : null,
    irr10yBrut: irrBrut != null ? Math.round(irrBrut * 10000) / 100 : null,
    toplamGetiri10y: Math.round(toplamGetiri),
    toplamGetiriNet10y: Math.round(toplamGetiriNet),
    yillikKiraEfektif: Math.round(yillikKiraEf),
    yillikGiderEfektif: Math.round(yillikGiderEf),
    geriOdemeSuresiYil: geriOdeme,
    vergi: {
      tapuHarciTL,
      donerSermayreTL,
      toplamAlimMasrafi,
      yillikEmlakVergiTL,
      yillikKiraVergiTL,
      degerArtisVergiTL,
      netKiraYillikTL: Math.round(noiNet),
    },
  };
}
