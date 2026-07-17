/**
 * Büyük şehir belediyeleri imar sorgu portalları
 *
 * Kaynak: Belediye resmi e-imar/imar sorgu sistemleri.
 * TUCBS WMS kapsamadığı illerde kullanıcıyı doğrudan belediye portalına yönlendiririz.
 * Parsel koordinatları varsa URL'ye gömülür (lat/lng prefill).
 */

import { normalizeYerAdi } from "./tkgm-api";

export interface BelediyeImarPortali {
  il: string;
  ilNorm: string;
  ilceNorm?: string; // İlçe bazlı farklı portal varsa
  ad: string; // Kullanıcıya gösterilecek isim
  url: string; // Portal ana sayfası
  /** URL'ye koordinat gömülüp gömülemeyeceği */
  latLngDestekli: boolean;
  /** Açık WMS/REST API URL'si (varsa) */
  wmsUrl?: string;
}

/** Büyük şehir belediyesi imar portalları */
export const BELEDIYE_IMAR_PORTALLERI: BelediyeImarPortali[] = [
  // ── İstanbul ──────────────────────────────────────────────────────────────
  {
    il: "İstanbul",
    ilNorm: "istanbul",
    ad: "İBB Şehir Haritası (İmar)",
    url: "https://sehirharitasi.ibb.gov.tr",
    latLngDestekli: false,
    // İBB'nin açık ArcGIS REST servisi — imar planı katmanları
    wmsUrl: "https://sehirharitasi.ibb.gov.tr/webservice/GoruntulemeOGCService",
  },
  {
    il: "İstanbul",
    ilNorm: "istanbul",
    ad: "İBB e-İmar Sorgu",
    url: "https://imarsorgu.ibb.gov.tr",
    latLngDestekli: false,
  },
  // ── Ankara ────────────────────────────────────────────────────────────────
  {
    il: "Ankara",
    ilNorm: "ankara",
    ad: "ABB İmar Durumu Sorgulama",
    url: "https://eimar.ankara.bel.tr",
    latLngDestekli: false,
  },
  {
    il: "Ankara",
    ilNorm: "ankara",
    ad: "ABB Harita Portalı",
    url: "https://harita.ankara.bel.tr",
    latLngDestekli: false,
  },
  // ── İzmir ─────────────────────────────────────────────────────────────────
  {
    il: "İzmir",
    ilNorm: "izmir",
    ad: "İzmir CBS Portalı",
    url: "https://cbs.izmir.bel.tr",
    latLngDestekli: false,
  },
  // ── Bursa ─────────────────────────────────────────────────────────────────
  {
    il: "Bursa",
    ilNorm: "bursa",
    ad: "Bursa BB e-İmar",
    url: "https://eimar.bursa.bel.tr",
    latLngDestekli: false,
  },
  // ── Antalya (TUCBS var ama ek portal) ──────────────────────────────────────
  {
    il: "Antalya",
    ilNorm: "antalya",
    ad: "Antalya BB İmar Sorgu",
    url: "https://imarsorgu.antalya.bel.tr",
    latLngDestekli: false,
  },
  // ── Adana (TUCBS var ama ek portal) ────────────────────────────────────────
  {
    il: "Adana",
    ilNorm: "adana",
    ad: "Adana BB İmar",
    url: "https://imarsorgu.adana.bel.tr",
    latLngDestekli: false,
  },
  // ── Konya (TUCBS var) ──────────────────────────────────────────────────────
  {
    il: "Konya",
    ilNorm: "konya",
    ad: "Konya BB e-Belediye İmar",
    url: "https://konya.bel.tr/imarsorgu",
    latLngDestekli: false,
  },
  // ── Mersin (TUCBS var) ─────────────────────────────────────────────────────
  {
    il: "Mersin",
    ilNorm: "mersin",
    ad: "Mersin BB İmar Sorgu",
    url: "https://imarsorgu.mersin.bel.tr",
    latLngDestekli: false,
  },
  // ── Kocaeli ────────────────────────────────────────────────────────────────
  {
    il: "Kocaeli",
    ilNorm: "kocaeli",
    ad: "Kocaeli BB İmar Sorgu",
    url: "https://eimar.kocaeli.bel.tr",
    latLngDestekli: false,
  },
  // ── Diyarbakır (TUCBS var) ─────────────────────────────────────────────────
  {
    il: "Diyarbakır",
    ilNorm: "diyarbakir",
    ad: "Diyarbakır BB İmar",
    url: "https://imarsorgu.diyarbakir.bel.tr",
    latLngDestekli: false,
  },
  // ── Fallback — her il için e-Plan ──────────────────────────────────────────
];

/** CSB e-Plan'ın herkese açık imar sorgu URL'si */
export const EPLAN_IMAR_URL = "https://eplan.csb.gov.tr";

/** TKGM parselsorgu URL — ada/parsel prefill ile */
export function tkgmParselsorguUrl(
  mahalleKodu?: number | null,
  adaNo?: number,
  parselNo?: number,
): string {
  const base = "https://parselsorgu.tkgm.gov.tr";
  if (mahalleKodu && adaNo && parselNo) {
    return `${base}/#ara/${mahalleKodu}/${adaNo}/${parselNo}`;
  }
  return base;
}

/** İl adına göre belediye imar portallarını döndür */
export function belediyePortalBul(ilAd: string): BelediyeImarPortali[] {
  const norm = normalizeYerAdi(ilAd);
  return BELEDIYE_IMAR_PORTALLERI.filter((p) => p.ilNorm === norm);
}

/** TUCBS kapsamı dışındaki büyük illerin listesi */
export const TUCBS_KAPSAM_DISI_ILLER = new Set([
  "istanbul",
  "ankara",
  "bursa",
  "kocaeli",
  "sakarya",
  "tekirdag", // Ergene bölgesi var ama sadece Tekirdağ/Kırklareli/Edirne
]);
