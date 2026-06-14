/**
 * Yatırım Skoru — Faz 3 Sprint E.
 *
 * 1-100 arası birleşik bir skor: parsele yatırım yapmaya değer mi?
 *
 * 6 boyut weighted (toplam 100):
 *   1. Fiyat avantajı (%30) — bölge medianına göre indirim/prim
 *   2. Likidite      (%15) — bölge il likidite çarpanı (mevcut il-likidite)
 *   3. Lojistik     (%15) — OSM altyapı + POI yakınlığı
 *   4. Risk        (%15) — deprem + taşkın (düşük risk = yüksek skor)
 *   5. İmar potansiyel (%15) — ePlan TAKS/Emsal/Kat
 *   6. Büyüme trendi  (%10) — son 6 ay fiyat trendi
 *
 * Çıktı: { toplam: 0-100, boyutlar: { boyutAdi: 0-100, ... } } — radar grafiği için
 *
 * Bu skor heuristic — gerçek ML değil. Sahibinden/Hepsiemlak'tan gelen sinyaller
 * + mevcut analiz modüllerinin çıktısını birleştirir. Tek başına karar verme
 * aracı değil; ek bilgi.
 */

import type { Parsel } from "../types/tkgm";
import type { FiyatTahmini } from "./fiyat-tahmin";
import type { CevreAnalizi } from "./osm";
import type { EPlanImarVerisi } from "./eplan";
import { depremRiskiGetir } from "./data/deprem-zonlari";
import { taskinRiskiGetir } from "./data/taskin-risk";
import { ilLikiditeCarpani } from "./data/il-likidite";
import { normalizeYerAdi } from "./tkgm-api";

export interface YatirimBoyutu {
  ad: string;
  skor: number; // 0-100
  agirlik: number; // 0-1
  aciklama: string;
}

export interface YatirimSkoru {
  /** 1-100 birleşik skor */
  toplam: number;
  /** Kategorik seviye */
  seviye: "mukemmel" | "iyi" | "orta" | "zayif" | "riskli";
  /** 6 boyut breakdown — radar/explainability için */
  boyutlar: YatirimBoyutu[];
  /** Kısa özet (1-2 cümle) */
  ozet: string;
}

function clamp(v: number, mn: number, mx: number): number {
  return Math.max(mn, Math.min(mx, v));
}

/**
 * Boyut 1 — Fiyat avantajı.
 * Tahmini alım fiyatı (FiyatTahmini.beklenenFiyat) ile bölge median'ın
 * karşılaştırılması. İndirim → yüksek skor.
 *
 * - Median'ın %20+ altı → 95
 * - Median civarı     → 50
 * - Median'ın %20+ üstü → 15
 */
function fiyatAvantajBoyutu(fiyat: FiyatTahmini | null): YatirimBoyutu {
  if (!fiyat) {
    return { ad: "Fiyat avantajı", skor: 50, agirlik: 0.30, aciklama: "Fiyat verisi yok" };
  }
  // Beklenen vs gerçek karşılaştırması: TL/m² alanında
  // FiyatTahmini'nde baselineDeger = bölge ortalaması; ortalamaPerM2 tahmin
  const beklenen = fiyat.beklenenPerM2;
  const baz = fiyat.baselineDeger;
  if (!beklenen || !baz || baz <= 0) {
    return { ad: "Fiyat avantajı", skor: 50, agirlik: 0.30, aciklama: "Kıyaslama yok" };
  }
  const oran = beklenen / baz; // 1.0 = ortalama, <1 = ucuz, >1 = pahalı
  // Lineer eşleme: 0.8 → 95, 1.0 → 50, 1.2 → 15
  const skor = clamp(Math.round(95 - (oran - 0.8) * 200), 5, 99);
  const yuzdeFark = Math.round((oran - 1) * 100);
  const aciklama =
    oran < 0.92
      ? `Bölge medianının %${Math.abs(yuzdeFark)} altında — fırsat`
      : oran > 1.08
        ? `Bölge medianının %${yuzdeFark} üstünde — pahalı`
        : "Bölge median'ı civarında";
  return { ad: "Fiyat avantajı", skor, agirlik: 0.30, aciklama };
}

/** Boyut 2 — Likidite (il bazlı). */
function likiditeBoyutu(parsel: Parsel): YatirimBoyutu {
  const ilNorm = parsel.ilAd ? normalizeYerAdi(parsel.ilAd) : "";
  const lik = ilLikiditeCarpani(ilNorm); // { carpan, aciklama }
  const c = lik.carpan;
  // 0.85 → 30 / 1.0 → 60 / 1.15 → 90
  const skor = clamp(Math.round(60 + (c - 1.0) * 200), 5, 99);
  const aciklama =
    c >= 1.1
      ? "Yüksek likidite (hızlı satış)"
      : c >= 0.95
        ? "Normal likidite"
        : "Düşük likidite (uzun satış süresi)";
  return { ad: "Likidite", skor, agirlik: 0.15, aciklama };
}

/** Boyut 3 — Lojistik (OSM altyapı + POI). */
function lojistikBoyutu(cevre: CevreAnalizi | null): YatirimBoyutu {
  if (!cevre) {
    return { ad: "Lojistik", skor: 40, agirlik: 0.15, aciklama: "Çevre analizi yok" };
  }
  let skor = 30; // baseline
  // POI yakınlığı bonus
  if ((cevre.poi.okul ?? 0) > 0) skor += 8;
  if ((cevre.poi.hastane ?? 0) > 0) skor += 8;
  if ((cevre.poi.duraklar ?? 0) >= 3) skor += 10;
  // Anayol yakınlığı
  const motorwayEl = cevre.enYakinlar.find((e) => e.tip === "motorway" || e.tip === "trunk");
  if (motorwayEl && motorwayEl.mesafeM < 5000) skor += 15;
  else if (motorwayEl && motorwayEl.mesafeM < 15000) skor += 8;
  // Altyapı (elektrik/su)
  if (cevre.altyapi.elektrikHattiM != null && cevre.altyapi.elektrikHattiM < 1000) skor += 8;
  if (cevre.altyapi.suBoruM != null && cevre.altyapi.suBoruM < 1000) skor += 6;
  // Havalimanı / liman bonus (lojistik konut/sanayi premium)
  const airport = cevre.enYakinlar.find((e) => e.tip === "airport");
  if (airport && airport.mesafeM < 30_000) skor += 5;

  skor = clamp(skor, 5, 99);
  const aciklama =
    skor >= 75
      ? "Çok zengin lojistik (POI + altyapı + anayol)"
      : skor >= 50
        ? "Orta lojistik"
        : "Zayıf lojistik / kırsal";
  return { ad: "Lojistik", skor, agirlik: 0.15, aciklama };
}

/** Boyut 4 — Risk (deprem + taşkın; düşük risk = yüksek skor). */
function riskBoyutu(parsel: Parsel): YatirimBoyutu {
  const ilNorm = parsel.ilAd ? normalizeYerAdi(parsel.ilAd) : "";
  const dep = depremRiskiGetir(ilNorm);
  const tas = taskinRiskiGetir(ilNorm);

  let depSkor = 70; // bilinmeyen → orta
  if (dep) {
    // Z1=20, Z2=40, Z3=60, Z4=80, Z5=95
    depSkor =
      dep.zon === "Z1" ? 20 : dep.zon === "Z2" ? 40 : dep.zon === "Z3" ? 60 : dep.zon === "Z4" ? 80 : 95;
  }
  let tasSkor = 70;
  if (tas) {
    tasSkor = tas.risk === "yuksek" ? 25 : tas.risk === "orta" ? 60 : 90;
  }
  const skor = Math.round(depSkor * 0.6 + tasSkor * 0.4);
  const aciklama =
    skor >= 75
      ? "Düşük doğal risk (güvenli bölge)"
      : skor >= 50
        ? "Orta risk (standart önlem)"
        : "Yüksek doğal risk (deprem/taşkın)";
  return { ad: "Risk", skor, agirlik: 0.15, aciklama };
}

/** Boyut 5 — İmar potansiyeli (TAKS/Emsal/Kat). */
function imarPotansiyelBoyutu(ePlan: EPlanImarVerisi | null): YatirimBoyutu {
  if (!ePlan || ePlan.taks == null || ePlan.emsal == null) {
    return {
      ad: "İmar potansiyel",
      skor: 40,
      agirlik: 0.15,
      aciklama: "Resmi imar bilgisi yok — manuel doğrulama önerilir",
    };
  }
  // Emsal × 100m² baseline kıyas: emsal 0.5 → 25, 1.0 → 50, 2.0 → 85, 3.5+ → 99
  const skor = clamp(Math.round(25 + ePlan.emsal * 30), 10, 99);
  const aciklama =
    ePlan.emsal >= 2.0
      ? `Yüksek emsal (E=${ePlan.emsal.toFixed(2)}) — yoğun yapılaşma`
      : ePlan.emsal >= 1.0
        ? `Standart emsal (E=${ePlan.emsal.toFixed(2)})`
        : `Düşük emsal (E=${ePlan.emsal.toFixed(2)}) — sınırlı yapılaşma`;
  return { ad: "İmar potansiyel", skor, agirlik: 0.15, aciklama };
}

/** Boyut 6 — Büyüme trendi (son 6 ay TL/m² değişimi). */
function buyumeTrendi(fiyat: FiyatTahmini | null): YatirimBoyutu {
  // Trend datası FiyatTahmini'nde doğrudan yok; bölge ortalaması artışını
  // bilmiyoruz. TCMB KFE enflasyonu üzeri/altı kıyas için bilgi olmadan,
  // mevcut emsal yaş dağılımından yumuşatma yapacağız.
  if (!fiyat || !fiyat.tazelikOzeti || fiyat.tazelikOzeti.ortalamaYasGun == null) {
    return { ad: "Büyüme trendi", skor: 50, agirlik: 0.10, aciklama: "Trend verisi yetersiz" };
  }
  // Taze ilan oranı yüksekse → aktif piyasa, büyüme sinyali güçlü
  const ozet = fiyat.tazelikOzeti;
  const tazeOran = ozet.tazeAdet > 0 ? ozet.son30Gun / ozet.tazeAdet : 0;
  const skor = clamp(Math.round(35 + tazeOran * 65), 10, 99);
  const aciklama =
    skor >= 70
      ? "Aktif piyasa (taze ilan oranı yüksek)"
      : skor >= 45
        ? "Orta hareketlilik"
        : "Yavaş piyasa (eski ilanlar baskın)";
  return { ad: "Büyüme trendi", skor, agirlik: 0.10, aciklama };
}

function seviyeAtama(toplam: number): YatirimSkoru["seviye"] {
  if (toplam >= 80) return "mukemmel";
  if (toplam >= 65) return "iyi";
  if (toplam >= 45) return "orta";
  if (toplam >= 30) return "zayif";
  return "riskli";
}

function ozetOlustur(skor: number, boyutlar: YatirimBoyutu[]): string {
  const enGuclu = [...boyutlar].sort((a, b) => b.skor - a.skor)[0];
  const enZayif = [...boyutlar].sort((a, b) => a.skor - b.skor)[0];
  return `Yatırım skoru ${skor}/100. En güçlü: ${enGuclu?.ad} (${enGuclu?.skor}). En zayıf: ${enZayif?.ad} (${enZayif?.skor}).`;
}

/**
 * Ana giriş — tüm boyutları hesapla, weighted toplam üret.
 */
export function yatirimSkoruHesapla(args: {
  parsel: Parsel;
  fiyat: FiyatTahmini | null;
  cevre: CevreAnalizi | null;
  ePlan: EPlanImarVerisi | null;
}): YatirimSkoru {
  const boyutlar: YatirimBoyutu[] = [
    fiyatAvantajBoyutu(args.fiyat),
    likiditeBoyutu(args.parsel),
    lojistikBoyutu(args.cevre),
    riskBoyutu(args.parsel),
    imarPotansiyelBoyutu(args.ePlan),
    buyumeTrendi(args.fiyat),
  ];
  const toplam = Math.round(
    boyutlar.reduce((s, b) => s + b.skor * b.agirlik, 0),
  );
  return {
    toplam,
    seviye: seviyeAtama(toplam),
    boyutlar,
    ozet: ozetOlustur(toplam, boyutlar),
  };
}
