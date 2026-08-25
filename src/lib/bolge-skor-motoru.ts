/**
 * Bölge Gelişim Skoru Motoru
 *
 * "Gelecek 5 yılda değer kazanacak ilçeler" öngörüsü için çok boyutlu skor.
 *
 * Metodoloji (5 boyut):
 *
 *   1. TKGM İşlem Momentum (30 puan)
 *      Son 5 yıl alım-satım yoğunluğu trend eğimi (OLS regresyon).
 *      Artan işlem = talep ısınması = fiyat baskısı.
 *
 *   2. Likidite Derinliği (20 puan)
 *      Son yıl toplam işlem hacmi × normalleştirilmiş.
 *      Yüksek hacim = kolay çıkış = düşük risk.
 *
 *   3. Altyapı Yakınlığı (20 puan)
 *      OSB, havalimanı, liman, otoyol mesafesi.
 *      Yakın altyapı = işgücü ve lojistik avantajı.
 *
 *   4. Nüfus Baskısı (15 puan)
 *      İlçenin il ortalamasına oranla yoğunluğu + büyüme proxy.
 *      Yüksek yoğunluk = konut ve ticari talep.
 *
 *   5. Fiyat Erişilebilirliği (15 puan)
 *      Ulusal medyana göre düşük fiyat = daha fazla değer artış potansiyeli.
 *      Zaten pahalı bölgelerde yukarı potansiyel azalmıştır.
 *
 * Toplam: 0–100 puan.
 * Sınıflar: Yüksek Potansiyel (70+) / Orta (50-69) / İzle (35-49) / Düşük (<35)
 *
 * Girdi kaynakları (mevcut extension lib'leri):
 *   - TKGM analiz: tkgm-analiz.ts → getYilSerisi()
 *   - Altyapı: statik-lojistik.ts + data/osblar, havalimanları, limanlar
 *   - Nüfus: data/il-nufus.ts + data/mahalle-nufus.ts (ilçe)
 *   - Fiyat: api-fiyat.ts veya backend /v1/fiyat/ilce
 */

import { IL_NUFUS_YOGUNLUGU } from "./data/il-nufus";
import { ILCE_NUFUS_YOGUNLUGU } from "./data/mahalle-nufus";
import { OSBLAR } from "./data/osblar";
import { HAVALIMANLARITÜMÜ } from "./data/havalimanları";
import { LIMANLAR } from "./data/limanlar";
import { haversineM } from "./analiz";
import { getYilSerisi, type YilOzeti, type AnalizTip } from "./tkgm-analiz";

// ── Tipler ────────────────────────────────────────────────────────────────────

export interface BolgeSkorBoyutu {
  ad: string;
  puan: number;       // 0–kendi_maks
  maksimum: number;   // bu boyutun azami puanı
  aciklama: string;
}

export interface BolgeSkorSonuc {
  ilNorm: string;
  ilceNorm: string;
  ilceKodu: number;
  toplamSkor: number; // 0–100

  boyutlar: {
    tkgmMomentum: BolgeSkorBoyutu;
    likiditeDerini: BolgeSkorBoyutu;
    altyapiYakini: BolgeSkorBoyutu;
    nufusBaskisi: BolgeSkorBoyutu;
    fiyatErisimi: BolgeSkorBoyutu;
  };

  sinif: "yuksek" | "orta" | "izle" | "dusuk";
  sinifRenk: string;
  ozet: string;

  /** Hangi veri katmanları tam/eksik — şeffaflık için */
  veriKalitesi: {
    tkgmVeriVar: boolean;
    fiyatVeriVar: boolean;
    nufusVeriVar: boolean;
    altyapiVeriVar: boolean;
  };
}

export interface BolgeSkorGirdisi {
  ilNorm: string;
  ilceNorm: string;
  ilceKodu: number;
  /** İlçenin enlem (merkez koordinat) */
  lat: number;
  /** İlçenin boylam (merkez koordinat) */
  lng: number;
  /** Arsa medyan TL/m² (opsiyonel — backend'den veya fallback) */
  arsaMedianTlm2?: number | null;
  /** Ulusal arsa medyanı (karşılaştırma için) */
  ulusalMedianTlm2?: number | null;
}

// ── Yardımcı: OLS lineer regresyon eğimi ─────────────────────────────────────

function olsEgim(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const xOrt = (n - 1) / 2;
  const yOrt = ys.reduce((s, v) => s + v, 0) / n;
  let ssXY = 0, ssXX = 0;
  for (let i = 0; i < n; i++) {
    ssXY += (i - xOrt) * (ys[i]! - yOrt);
    ssXX += (i - xOrt) ** 2;
  }
  return ssXX > 0 ? ssXY / ssXX : 0;
}

// ── Yardımcı: Değer normalleştirme ───────────────────────────────────────────

function normalizePuan(deger: number, min: number, max: number, maxPuan: number): number {
  if (max <= min) return maxPuan / 2;
  const normalized = Math.min(1, Math.max(0, (deger - min) / (max - min)));
  return Math.round(normalized * maxPuan * 10) / 10;
}

// ── Boyut 1: TKGM İşlem Momentum ─────────────────────────────────────────────

async function tkgmMomentumHesapla(
  ilceKodu: number,
  signal?: AbortSignal,
): Promise<{ boyut: BolgeSkorBoyutu; veriVar: boolean }> {
  const MAKS = 30;
  try {
    const sonYil = new Date().getFullYear() - 1;
    const ilkYil = sonYil - 4; // 5 yıl
    const seri = await getYilSerisi(ilceKodu, 1 as AnalizTip, ilkYil, sonYil, signal);

    if (seri.length < 3 || seri.every((s) => s.toplamIslem === 0)) {
      return {
        boyut: { ad: "İşlem Momentumu", puan: 0, maksimum: MAKS, aciklama: "Yetersiz TKGM verisi" },
        veriVar: false,
      };
    }

    const islemler = seri.map((s) => s.toplamIslem);
    const egim = olsEgim(islemler);
    const sonIslem = islemler[islemler.length - 1] ?? 1;
    // Normalize: egim / son_yıl_değer → göreceli büyüme oranı
    const buyumeOrani = sonIslem > 0 ? egim / sonIslem : 0;

    // -0.5 ile +1.0 arası → 0–30 puan
    const puan = normalizePuan(buyumeOrani, -0.5, 1.0, MAKS);

    const trend = buyumeOrani > 0.1 ? "güçlü artış" : buyumeOrani > 0 ? "hafif artış" : "gerileme";
    return {
      boyut: {
        ad: "İşlem Momentumu",
        puan,
        maksimum: MAKS,
        aciklama: `${ilkYil}–${sonYil} TKGM alım-satım ${trend} (%${Math.round(buyumeOrani * 100)} yıllık trend)`,
      },
      veriVar: true,
    };
  } catch {
    return {
      boyut: { ad: "İşlem Momentumu", puan: 0, maksimum: MAKS, aciklama: "TKGM verisi alınamadı" },
      veriVar: false,
    };
  }
}

// ── Boyut 2: Likidite Derinliği ───────────────────────────────────────────────

async function likiditeDeriniHesapla(
  ilceKodu: number,
  signal?: AbortSignal,
): Promise<{ boyut: BolgeSkorBoyutu; veriVar: boolean }> {
  const MAKS = 20;
  try {
    const sonYil = new Date().getFullYear() - 1;
    const seri = await getYilSerisi(ilceKodu, 1 as AnalizTip, sonYil - 1, sonYil, signal);
    const sonYilIslem = seri.find((s) => s.yil === sonYil)?.toplamIslem ?? 0;

    if (sonYilIslem === 0) {
      return {
        boyut: { ad: "Likidite Derinliği", puan: 0, maksimum: MAKS, aciklama: "İşlem verisi yok" },
        veriVar: false,
      };
    }

    // 0–10.000 işlem → 0–20 puan (log skala)
    const logIslem = Math.log10(Math.max(sonYilIslem, 1));
    const puan = normalizePuan(logIslem, 0, 4, MAKS); // 4 = log10(10000)

    const seviye = sonYilIslem > 5000 ? "çok aktif" : sonYilIslem > 1000 ? "aktif" : sonYilIslem > 200 ? "orta" : "zayıf";
    return {
      boyut: {
        ad: "Likidite Derinliği",
        puan,
        maksimum: MAKS,
        aciklama: `${sonYil} yılı ${sonYilIslem.toLocaleString("tr-TR")} işlem — ${seviye} piyasa`,
      },
      veriVar: true,
    };
  } catch {
    return {
      boyut: { ad: "Likidite Derinliği", puan: 0, maksimum: MAKS, aciklama: "Veri alınamadı" },
      veriVar: false,
    };
  }
}

// ── Boyut 3: Altyapı Yakınlığı ────────────────────────────────────────────────

function altyapiYakiniHesapla(
  lat: number,
  lng: number,
): { boyut: BolgeSkorBoyutu; veriVar: boolean } {
  const MAKS = 20;

  // En yakın OSB (büyük)
  // OSBLAR tüm OSB listesi — tip field yoksa hepsini kullan
  const osbMesafe = OSBLAR
    .map((o) => haversineM(lat, lng, o.lat, o.lng) / 1000)
    .sort((a, b) => a - b)[0] ?? Infinity;

  // En yakın havalimanı
  const havaMesafe = HAVALIMANLARITÜMÜ
    .map((h) => haversineM(lat, lng, h.lat, h.lng) / 1000)
    .sort((a, b) => a - b)[0] ?? Infinity;

  // En yakın liman
  const limanMesafe = LIMANLAR
    .map((l) => haversineM(lat, lng, l.lat, l.lng) / 1000)
    .sort((a, b) => a - b)[0] ?? Infinity;

  if (osbMesafe === Infinity && havaMesafe === Infinity) {
    return {
      boyut: { ad: "Altyapı Yakınlığı", puan: MAKS / 2, maksimum: MAKS, aciklama: "Altyapı verisi eksik" },
      veriVar: false,
    };
  }

  // Skor: mesafe ne kadar kısa, o kadar yüksek
  // OSB ağırlığı 0.4, hava 0.35, liman 0.25
  const osbSkor = normalizePuan(Math.max(0, 150 - osbMesafe), 0, 150, 40);   // 0–40 arası
  const havaSkor = normalizePuan(Math.max(0, 120 - havaMesafe), 0, 120, 35); // 0–35
  const limanSkor = normalizePuan(Math.max(0, 100 - limanMesafe), 0, 100, 25); // 0–25
  const ham = osbSkor * 0.4 + havaSkor * 0.35 + limanSkor * 0.25;
  const puan = normalizePuan(ham, 0, 40, MAKS);

  const yakinBilgiler: string[] = [];
  if (osbMesafe < 30) yakinBilgiler.push(`OSB ${Math.round(osbMesafe)}km`);
  if (havaMesafe < 50) yakinBilgiler.push(`hava ${Math.round(havaMesafe)}km`);
  if (limanMesafe < 80) yakinBilgiler.push(`liman ${Math.round(limanMesafe)}km`);

  return {
    boyut: {
      ad: "Altyapı Yakınlığı",
      puan,
      maksimum: MAKS,
      aciklama: yakinBilgiler.length > 0
        ? `Yakın: ${yakinBilgiler.join(", ")}`
        : `OSB ${Math.round(osbMesafe)}km · Hava ${Math.round(havaMesafe)}km`,
    },
    veriVar: true,
  };
}

// ── Boyut 4: Nüfus Baskısı ────────────────────────────────────────────────────

function nufusBaskisiHesapla(
  ilNorm: string,
  ilceNorm: string,
): { boyut: BolgeSkorBoyutu; veriVar: boolean } {
  const MAKS = 15;

  const ilYogunluk = IL_NUFUS_YOGUNLUGU[ilNorm] ?? null;
  const ilceYogunluk = ILCE_NUFUS_YOGUNLUGU[`${ilNorm}|${ilceNorm}`] ?? null;
  const yogunluk = ilceYogunluk ?? ilYogunluk;

  if (yogunluk == null) {
    return {
      boyut: { ad: "Nüfus Baskısı", puan: MAKS / 2, maksimum: MAKS, aciklama: "Nüfus verisi yok" },
      veriVar: false,
    };
  }

  // 0–10.000 kişi/km² log skala → 0–15 puan
  const logYogunluk = Math.log10(Math.max(yogunluk, 1));
  const puan = normalizePuan(logYogunluk, 0, 4, MAKS);

  const seviye = yogunluk > 5000 ? "çok yoğun" : yogunluk > 1000 ? "kentsel" : yogunluk > 200 ? "yarı-kentsel" : "kırsal";
  return {
    boyut: {
      ad: "Nüfus Baskısı",
      puan,
      maksimum: MAKS,
      aciklama: `${yogunluk.toLocaleString("tr-TR")} kişi/km² — ${seviye}${ilceYogunluk ? " (ilçe verisi)" : " (il ortalaması)"}`,
    },
    veriVar: ilceYogunluk != null,
  };
}

// ── Boyut 5: Fiyat Erişilebilirliği ──────────────────────────────────────────

function fiyatErisimiHesapla(
  arsaMedianTlm2: number | null | undefined,
  ulusalMedianTlm2: number | null | undefined,
): { boyut: BolgeSkorBoyutu; veriVar: boolean } {
  const MAKS = 15;
  const ULUSAL_FALLBACK = 8_000; // TL/m² — kaba ulusal arsa ortalaması

  if (!arsaMedianTlm2 || arsaMedianTlm2 <= 0) {
    return {
      boyut: { ad: "Fiyat Erişimi", puan: MAKS / 2, maksimum: MAKS, aciklama: "Fiyat verisi yok" },
      veriVar: false,
    };
  }

  const ulusal = ulusalMedianTlm2 && ulusalMedianTlm2 > 0 ? ulusalMedianTlm2 : ULUSAL_FALLBACK;
  // Ulusal ortalamanın altındakiler daha yüksek puan (daha fazla potansiyel kalmış)
  const oran = arsaMedianTlm2 / ulusal;
  // 0.1 (çok ucuz) → 15 puan, 3.0 (çok pahalı) → 0 puan
  const puan = normalizePuan(Math.max(0, 3.0 - oran), 0, 2.9, MAKS);

  const pahalilil = oran > 2 ? "çok pahalı" : oran > 1 ? "pahalı" : oran > 0.5 ? "uygun" : "ucuz";
  return {
    boyut: {
      ad: "Fiyat Erişimi",
      puan,
      maksimum: MAKS,
      aciklama: `${arsaMedianTlm2.toLocaleString("tr-TR")} TL/m² — ulusal ortalamanın ${Math.round(oran * 100)}%'i (${pahalilil})`,
    },
    veriVar: true,
  };
}

// ── Sınıf belirleyici ──────────────────────────────────────────────────────────

function sinifBelirle(skor: number): { sinif: BolgeSkorSonuc["sinif"]; sinifRenk: string; ozet: string } {
  if (skor >= 70) return {
    sinif: "yuksek",
    sinifRenk: "#16a34a",
    ozet: "Yüksek Potansiyel — güçlü momentum, iyi altyapı, erişilebilir fiyat. Öncelikli izleme bölgesi.",
  };
  if (skor >= 50) return {
    sinif: "orta",
    sinifRenk: "#2563eb",
    ozet: "Orta Potansiyel — bazı olumlu sinyaller var, belirli faktörler gelişmekte.",
  };
  if (skor >= 35) return {
    sinif: "izle",
    sinifRenk: "#d97706",
    ozet: "İzleme Listesi — henüz momentum zayıf, ama altyapı veya fiyat avantajı var.",
  };
  return {
    sinif: "dusuk",
    sinifRenk: "#dc2626",
    ozet: "Düşük Potansiyel — kısa vadede değer artışı için güçlü sinyal yok.",
  };
}

// ── Ana fonksiyon ─────────────────────────────────────────────────────────────

/**
 * Bir ilçe için çok boyutlu bölge gelişim skoru hesaplar.
 *
 * @param girdi   İlçe bilgisi + opsiyonel fiyat verisi
 * @param signal  AbortSignal (iptal için)
 * @returns       BolgeSkorSonuc — tüm boyutlar + toplam skor
 */
export async function bolgeSkorHesapla(
  girdi: BolgeSkorGirdisi,
  signal?: AbortSignal,
): Promise<BolgeSkorSonuc> {
  // 5 boyutu paralel hesapla (TKGM async, gerisi sync)
  const [momentumSonuc, likiditeSonuc] = await Promise.all([
    tkgmMomentumHesapla(girdi.ilceKodu, signal),
    likiditeDeriniHesapla(girdi.ilceKodu, signal),
  ]);

  const altyapiSonuc = altyapiYakiniHesapla(girdi.lat, girdi.lng);
  const nufusSonuc = nufusBaskisiHesapla(girdi.ilNorm, girdi.ilceNorm);
  const fiyatSonuc = fiyatErisimiHesapla(girdi.arsaMedianTlm2, girdi.ulusalMedianTlm2);

  const boyutlar = {
    tkgmMomentum: momentumSonuc.boyut,
    likiditeDerini: likiditeSonuc.boyut,
    altyapiYakini: altyapiSonuc.boyut,
    nufusBaskisi: nufusSonuc.boyut,
    fiyatErisimi: fiyatSonuc.boyut,
  };

  const toplamSkor = Math.round(
    boyutlar.tkgmMomentum.puan +
    boyutlar.likiditeDerini.puan +
    boyutlar.altyapiYakini.puan +
    boyutlar.nufusBaskisi.puan +
    boyutlar.fiyatErisimi.puan
  );

  const { sinif, sinifRenk, ozet } = sinifBelirle(toplamSkor);

  return {
    ilNorm: girdi.ilNorm,
    ilceNorm: girdi.ilceNorm,
    ilceKodu: girdi.ilceKodu,
    toplamSkor,
    boyutlar,
    sinif,
    sinifRenk,
    ozet,
    veriKalitesi: {
      tkgmVeriVar: momentumSonuc.veriVar,
      fiyatVeriVar: fiyatSonuc.veriVar,
      nufusVeriVar: nufusSonuc.veriVar,
      altyapiVeriVar: altyapiSonuc.veriVar,
    },
  };
}

/**
 * Çoklu ilçe için toplu skor — paralel hesap, rate limit korumalı.
 * Max 6 concurrent (TKGM rate limit).
 */
export async function cogulBolgeSkorHesapla(
  ilceler: BolgeSkorGirdisi[],
  signal?: AbortSignal,
): Promise<BolgeSkorSonuc[]> {
  const CONCURRENCY = 3; // TKGM 2s rate limit — 3 concurrent güvenli
  const sonuclar: BolgeSkorSonuc[] = [];

  for (let i = 0; i < ilceler.length; i += CONCURRENCY) {
    if (signal?.aborted) break;
    const grup = ilceler.slice(i, i + CONCURRENCY);
    const grupSonuclar = await Promise.allSettled(
      grup.map((g) => bolgeSkorHesapla(g, signal))
    );
    for (const r of grupSonuclar) {
      if (r.status === "fulfilled") sonuclar.push(r.value);
    }
  }

  return sonuclar.sort((a, b) => b.toplamSkor - a.toplamSkor);
}
