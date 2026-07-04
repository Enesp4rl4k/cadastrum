/**
 * Mahalle nüfus yardımcıları — fiyat ve skor motoruna input.
 */
import { MAHALLE_NUFUS, NUFUS_ESIK, type MahalleNufusTuple } from "./data/mahalle-nufus";
import { normalizeYerAdi } from "./tkgm-api";

function mahalleKeyOlustur(
  ilAd: string | null | undefined,
  ilceAd: string | null | undefined,
  mahalleAd: string | null | undefined,
): string | null {
  if (!ilAd || !ilceAd || !mahalleAd) return null;
  const il = normalizeYerAdi(ilAd);
  const ilce = normalizeYerAdi(ilceAd);
  const mahalle = normalizeYerAdi(mahalleAd);
  if (!il || !ilce || !mahalle) return null;
  return `${il}__${ilce}__${mahalle}`;
}

export type YerlesimTipi = 0 | 1 | 2;

export interface MahalleNufusBilgi {
  toplam: number;
  tip: YerlesimTipi;
  sinif: "kirsal" | "kasaba" | "sehir" | "metropol";
}

export function mahalleNufusGetir(
  ilAd: string | null | undefined,
  ilceAd: string | null | undefined,
  mahalleAd: string | null | undefined,
): MahalleNufusBilgi | null {
  const key = mahalleKeyOlustur(ilAd, ilceAd, mahalleAd);
  if (!key) return null;
  const tuple = MAHALLE_NUFUS[key];
  if (!tuple) return null;
  return tupleToBilgi(tuple);
}

function tupleToBilgi([toplam, tip]: MahalleNufusTuple): MahalleNufusBilgi {
  let sinif: MahalleNufusBilgi["sinif"] = "kirsal";
  if (toplam >= NUFUS_ESIK.sehir) sinif = tip === 2 ? "metropol" : "sehir";
  else if (toplam >= NUFUS_ESIK.kasaba) sinif = "kasaba";
  return { toplam, tip, sinif };
}

/**
 * Nüfus yoğunluğu fiyat çarpanı — hafif sinyal (±%5 bandı).
 * Veri yoksa 1.0 (nötr).
 */
export function nufusCarpani(bilgi: MahalleNufusBilgi | null): { carpan: number; not: string | null } {
  if (!bilgi) return { carpan: 1.0, not: null };

  if (bilgi.sinif === "metropol" && bilgi.toplam >= 50_000) {
    return { carpan: 1.04, not: `Yoğun şehir mahallesi (~${formatNufus(bilgi.toplam)} nüfus)` };
  }
  if (bilgi.sinif === "sehir") {
    return { carpan: 1.02, not: `Şehir mahallesi (~${formatNufus(bilgi.toplam)} nüfus)` };
  }
  if (bilgi.sinif === "kasaba") {
    return { carpan: 1.0, not: `Kasaba ölçeği (~${formatNufus(bilgi.toplam)} nüfus)` };
  }
  if (bilgi.toplam < NUFUS_ESIK.kirsal) {
    return { carpan: 0.97, not: `Düşük nüfuslu kırsal (~${formatNufus(bilgi.toplam)} nüfus)` };
  }
  return { carpan: 0.99, not: `Kırsal yerleşim (~${formatNufus(bilgi.toplam)} nüfus)` };
}

function formatNufus(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}
