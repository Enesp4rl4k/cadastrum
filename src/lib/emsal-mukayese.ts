/**
 * Emsal Mukayese Motoru — gerçek ekspertiz raporu disiplini.
 *
 * Sales Comparison yöntemi: hedef parsele en benzer emsalleri seç,
 * her birine 4 boyutta düzeltme uygula:
 *   1) Alan farkı düzeltmesi   — büyük arsa m² primi düşer (negatif)
 *   2) Tarih düzeltmesi         — TR enflasyonuna göre güncelle (~%1.5/ay)
 *   3) Lokasyon düzeltmesi      — aynı mahalle vs ilçe vs yan ilçe
 *   4) Nitelik düzeltmesi       — tarla↔arsa, bahçe↔bağ farkları
 *
 * Çıktı: her emsal için düzeltilmiş TL/m² + 4 boyut breakdown.
 * Pro tier'da kullanıcı bu tabloyu görür, kararını gerekçeli alır.
 */

import type { Parsel } from "../types/tkgm";
import type { IlanGozlem } from "./db";
import { fiyatPerM2TLOlarak } from "./kur";
import { normalizeYerAdi } from "./tkgm-api";
import { haversineM } from "./analiz";

export interface EmsalDuzeltme {
  /** Düzeltme faktörü (-0.15 = %15 indirim, 0.10 = %10 prim) */
  carpan: number;
  /** Kullanıcıya gösterilecek açıklama */
  not: string;
}

export interface EmsalMukayese {
  /** Kaynak emsal */
  kayit: IlanGozlem;
  /** Emsal başlığı (UI için) */
  baslik: string;
  /** Ham TL/m² (kayıttan, döviz dönüştürülmüş) */
  hamPerM2: number;
  /** Toplam düzeltilmiş TL/m² */
  duzeltilmisPerM2: number;
  /** Toplam düzeltme yüzdesi (-0.10 = %10 indirim ham fiyata göre) */
  toplamDuzeltme: number;
  /** Boyut bazlı düzeltmeler */
  duzeltmeler: {
    alan: EmsalDuzeltme;
    tarih: EmsalDuzeltme;
    lokasyon: EmsalDuzeltme;
    nitelik: EmsalDuzeltme;
  };
  /** Hedef parselden m² farkı yüzdesi (örn 0.20 = emsal %20 daha büyük) */
  alanFarkPct: number;
  /** İlanın gün cinsinden yaşı */
  yasGun: number;
  /** Aynı mahalle mi */
  ayniMahalle: boolean;
  /** Aynı ilçe mi */
  ayniIlce: boolean;
}

const GUN_MS = 86_400_000;
/** TR aylık enflasyon ~%1.5 (yıllık ~%18-20) — emsal tarih düzeltmesi için */
const AYLIK_ENFLASYON = 0.015;

/**
 * Alan farkı düzeltmesi: büyük arsa m² primi düşer (10000m² 1000m²'den daha az/m²).
 * Logaritmik damping — 2x büyüme ≈ %5 indirim, 5x büyüme ≈ %15 indirim.
 */
function alanDuzeltme(parselAlan: number, emsalAlan: number | null): EmsalDuzeltme {
  if (!emsalAlan || emsalAlan <= 0 || parselAlan <= 0) {
    return { carpan: 0, not: "Alan bilinmiyor — düzeltme yapılmadı" };
  }
  const oran = emsalAlan / parselAlan;
  if (oran < 0.95 && oran > 0.95) return { carpan: 0, not: "Alan benzer, düzeltme yok" };

  // log10(2) = 0.30 → her 2x büyüme %5 düzeltme (basitleştirilmiş)
  // emsal büyükse fiyat/m² düşük olmalı, düzeltilmiş fiyat YÜKSELİR (positive carpan)
  // emsal küçükse fiyat/m² yüksek olmalı, düzeltilmiş fiyat DÜŞER (negative carpan)
  const logOran = Math.log10(oran);
  const carpan = logOran * 0.05; // 2x büyüme → +%1.5

  if (Math.abs(carpan) < 0.005) return { carpan: 0, not: "Alan farkı önemsiz" };

  const farkYuzde = Math.round((oran - 1) * 100);
  if (farkYuzde > 0) {
    return {
      carpan,
      not: `Emsal %${farkYuzde} daha büyük → birim fiyat %${Math.abs(Math.round(carpan * 100))} aşağı çekildi`,
    };
  }
  return {
    carpan,
    not: `Emsal %${Math.abs(farkYuzde)} daha küçük → birim fiyat %${Math.abs(Math.round(carpan * 100))} yukarı çekildi`,
  };
}

/**
 * Tarih düzeltmesi: enflasyona göre eski ilanları bugüne projekte et.
 * 6 ay önce 100 TL/m² ilan → bugün ~%9 daha pahalı.
 */
function tarihDuzeltme(yasGun: number): EmsalDuzeltme {
  if (yasGun <= 7) return { carpan: 0, not: "İlan güncel, düzeltme yok" };
  const ayFarki = yasGun / 30;
  const carpan = ayFarki * AYLIK_ENFLASYON;
  return {
    carpan,
    not: `${Math.round(ayFarki)} ay eski → enflasyon ile %${Math.round(carpan * 100)} yukarı projekte edildi`,
  };
}

/**
 * Lokasyon düzeltmesi — Faz 2 ile **continuous mesafe** desteği eklendi.
 *
 * Mantık:
 *   - Hem parsel hem emsal koordlu ise: gerçek mesafeden lineer iskonto
 *     `carpan = -min(d/5000, 0.30)` → 0m %0, 1km %2, 3km %6, 5km+ %10 sabit
 *     Bu mahalle/ilçe boolean'ından çok daha hassas.
 *   - Koord yoksa: mevcut string-match fallback (aynı mahalle 0 / aynı ilçe -%3 / farklı ilçe -%10)
 */
function lokasyonDuzeltme(
  parsel: Parsel,
  emsal: IlanGozlem,
): EmsalDuzeltme & { ayniMahalle: boolean; ayniIlce: boolean } {
  const mahalleNorm = parsel.mahalleAd ? normalizeYerAdi(parsel.mahalleAd) : "";
  const ilceNorm = parsel.ilceAd ? normalizeYerAdi(parsel.ilceAd) : "";
  const emsalMahalleNorm =
    emsal.mahalleNorm ?? (emsal.mahalleAd ? normalizeYerAdi(emsal.mahalleAd) : "");
  const emsalIlceNorm =
    emsal.ilceNorm ?? (emsal.ilceAd ? normalizeYerAdi(emsal.ilceAd) : "");

  const ayniMahalle = !!mahalleNorm && mahalleNorm === emsalMahalleNorm;
  const ayniIlce = !!ilceNorm && ilceNorm === emsalIlceNorm;

  // Continuous mesafe — koordlar varsa
  const pLat = parsel.merkezNokta?.lat;
  const pLng = parsel.merkezNokta?.lng;
  if (
    typeof pLat === "number" &&
    typeof pLng === "number" &&
    typeof emsal.lat === "number" &&
    typeof emsal.lng === "number"
  ) {
    const d = haversineM(pLat, pLng, emsal.lat, emsal.lng);
    const carpan = -Math.min(d / 5000, 0.30);
    const dKmStr = (d / 1000).toFixed(2);
    const yuzde = Math.round(Math.abs(carpan) * 100);
    if (Math.abs(carpan) < 0.005) {
      return {
        carpan: 0,
        not: `Aynı konum (${dKmStr} km) — düzeltme yok`,
        ayniMahalle,
        ayniIlce,
      };
    }
    return {
      carpan,
      not: `Koord mesafesi ${dKmStr} km — %${yuzde} belirsizlik indirimi`,
      ayniMahalle,
      ayniIlce,
    };
  }

  // Fallback: string-match
  if (ayniMahalle) {
    return { carpan: 0, not: "Aynı mahalle, lokasyon düzeltmesi yok", ayniMahalle, ayniIlce };
  }
  if (ayniIlce) {
    return {
      carpan: -0.03,
      not: `Aynı ilçe (${parsel.ilceAd}) ama farklı mahalle — %3 belirsizlik indirimi`,
      ayniMahalle,
      ayniIlce,
    };
  }
  return {
    carpan: -0.10,
    not: "Farklı ilçe — %10 lokasyon belirsizlik indirimi",
    ayniMahalle,
    ayniIlce,
  };
}

/**
 * Nitelik düzeltmesi: tarla↔arsa kategori farkı en büyük. Aynı kategori = 0.
 * Mantık: emsal "Arsa" hedef "Tarla" ise emsal fiyat aşağı düzeltilir (-%70 civarı).
 * Tersi ise yukarı düzeltilir.
 */
function nitelikKategori(nitelik: string): "arsa" | "tarla" | "bahce" | "zeytin" | "yapili" | "diger" {
  const t = nitelik.toLocaleLowerCase("tr");
  if (/mesken|bina|işyeri|isyeri/.test(t)) return "yapili";
  if (/zeytin/.test(t)) return "zeytin";
  if (/bahçe|bahce|bağ\b|bag\b/u.test(t)) return "bahce";
  if (/tarla/.test(t)) return "tarla";
  if (/arsa/.test(t)) return "arsa";
  return "diger";
}

const NITELIK_GORE_GORE_CARPAN: Record<string, Record<string, number>> = {
  // [emsal][hedef] = düzeltme (emsal fiyatına ne katsayı uygulamalı)
  arsa: { arsa: 0, tarla: -0.65, bahce: -0.45, zeytin: -0.55, yapili: 0.30, diger: -0.25 },
  tarla: { arsa: 0.65, tarla: 0, bahce: 0.20, zeytin: 0.10, yapili: 1.30, diger: 0.10 },
  bahce: { arsa: 0.45, tarla: -0.20, bahce: 0, zeytin: -0.10, yapili: 0.85, diger: -0.10 },
  zeytin: { arsa: 0.55, tarla: -0.10, bahce: 0.10, zeytin: 0, yapili: 0.95, diger: 0 },
  yapili: { arsa: -0.30, tarla: -1.30, bahce: -0.85, zeytin: -0.95, yapili: 0, diger: -0.50 },
  diger: { arsa: 0.25, tarla: -0.10, bahce: 0.10, zeytin: 0, yapili: 0.50, diger: 0 },
};

function nitelikDuzeltme(parsel: Parsel, emsal: IlanGozlem): EmsalDuzeltme {
  const hedefKat = nitelikKategori(parsel.nitelik);
  const emsalText = `${emsal.baslik ?? ""} ${emsal.imarDurumu ?? ""}`;
  const emsalKat = nitelikKategori(emsalText);

  if (hedefKat === emsalKat) {
    return { carpan: 0, not: `Aynı nitelik (${hedefKat}) — düzeltme yok` };
  }
  const carpan = NITELIK_GORE_GORE_CARPAN[emsalKat]?.[hedefKat] ?? 0;
  if (carpan === 0) {
    return { carpan: 0, not: `Nitelik kategorileri uyumlu (${emsalKat} ≈ ${hedefKat})` };
  }
  const yuzde = Math.round(Math.abs(carpan) * 100);
  return {
    carpan,
    not:
      carpan < 0
        ? `Emsal "${emsalKat}" hedef "${hedefKat}" — %${yuzde} aşağı düzeltildi`
        : `Emsal "${emsalKat}" hedef "${hedefKat}" — %${yuzde} yukarı düzeltildi`,
  };
}

/**
 * Bir emsal kaydı için tam mukayese — 4 boyut düzeltme + nihai TL/m².
 */
export function emsalMukayeseEt(parsel: Parsel, emsal: IlanGozlem): EmsalMukayese | null {
  // TL'ye çevir (USD/EUR varsa kur uygula)
  const hamPerM2 = fiyatPerM2TLOlarak(emsal.fiyat, emsal.m2, emsal.paraBirimi);
  if (hamPerM2 == null || hamPerM2 <= 0) return null;

  const yasGun = emsal.zaman ? Math.max(0, (Date.now() - emsal.zaman) / GUN_MS) : 0;
  const alanFarkPct = emsal.m2 && parsel.alan > 0 ? (emsal.m2 - parsel.alan) / parsel.alan : 0;

  const alanD = alanDuzeltme(parsel.alan, emsal.m2);
  const tarihD = tarihDuzeltme(yasGun);
  const lokasyonRes = lokasyonDuzeltme(parsel, emsal);
  const lokasyonD: EmsalDuzeltme = { carpan: lokasyonRes.carpan, not: lokasyonRes.not };
  const nitelikD = nitelikDuzeltme(parsel, emsal);

  const toplamDuzeltme =
    alanD.carpan + tarihD.carpan + lokasyonD.carpan + nitelikD.carpan;
  const duzeltilmisPerM2 = Math.round(hamPerM2 * (1 + toplamDuzeltme));

  const baslik =
    emsal.baslik?.trim() ||
    `${emsal.mahalleAd ?? "?"}, ${emsal.m2 ?? "?"}m²`.trim();

  return {
    kayit: emsal,
    baslik: baslik.length > 80 ? baslik.slice(0, 77) + "…" : baslik,
    hamPerM2,
    duzeltilmisPerM2,
    toplamDuzeltme,
    duzeltmeler: { alan: alanD, tarih: tarihD, lokasyon: lokasyonD, nitelik: nitelikD },
    alanFarkPct,
    yasGun: Math.round(yasGun),
    ayniMahalle: lokasyonRes.ayniMahalle,
    ayniIlce: lokasyonRes.ayniIlce,
  };
}

/**
 * Hedef parsele en uygun N emsal — score-sorted (aynı mahalle > aynı ilçe > diğer).
 * Aday emsalleri zaten elemiş listeden geçirilmesi tavsiye edilir.
 */
export function topEmsallerSec(
  parsel: Parsel,
  emsaller: IlanGozlem[],
  topN = 8,
): EmsalMukayese[] {
  const mukayeseler: EmsalMukayese[] = [];
  for (const emsal of emsaller) {
    const m = emsalMukayeseEt(parsel, emsal);
    if (m) mukayeseler.push(m);
  }
  // Score: aynı mahalle > aynı ilçe > taze ilan > küçük alan farkı
  mukayeseler.sort((a, b) => {
    if (a.ayniMahalle !== b.ayniMahalle) return a.ayniMahalle ? -1 : 1;
    if (a.ayniIlce !== b.ayniIlce) return a.ayniIlce ? -1 : 1;
    if (a.yasGun !== b.yasGun) return a.yasGun - b.yasGun;
    return Math.abs(a.alanFarkPct) - Math.abs(b.alanFarkPct);
  });
  return mukayeseler.slice(0, topN);
}

/**
 * Mukayese tablosu özeti — düzeltilmiş median + IQR.
 */
export function mukayeseOzet(mukayeseler: EmsalMukayese[]): {
  median: number;
  alt25: number;
  ust75: number;
  ortalamaDuzeltmeYuzde: number;
} | null {
  if (mukayeseler.length === 0) return null;
  const fiyatlar = mukayeseler.map((m) => m.duzeltilmisPerM2).sort((a, b) => a - b);
  const median = fiyatlar[Math.floor(fiyatlar.length / 2)] ?? 0;
  const alt25 = fiyatlar[Math.floor(fiyatlar.length * 0.25)] ?? 0;
  const ust75 = fiyatlar[Math.floor(fiyatlar.length * 0.75)] ?? 0;
  const ortDuz =
    mukayeseler.reduce((s, m) => s + m.toplamDuzeltme, 0) / mukayeseler.length;
  return { median, alt25, ust75, ortalamaDuzeltmeYuzde: ortDuz };
}
