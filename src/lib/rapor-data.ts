/**
 * PDF Rapor için tüm parsel/analiz verisini tek bir struct'a topla.
 * chrome.storage.local üzerinden side panel → rapor sayfası arası taşınır.
 */

import type { Parsel } from "../types/tkgm";
import type { CevreAnalizi } from "./osm";
import type { EgimAnalizi } from "./elevation";
import type { EPlanImarVerisi } from "./eplan";
import type { FiyatTahmini } from "./fiyat-tahmin";
import type { RiskUyarisi } from "./risk-uyarilari";
import type { AiFiyatSonucu } from "./ai-fiyat";

export interface RaporVerisi {
  /** Rapor versionu — gelecekte uyumluluk için */
  schema: 1;
  /** Rapor üretim zamanı */
  uretildiAt: number;
  /** Rapor başlığı (kullanıcı için, opsiyonel) */
  baslik?: string;
  parsel: Parsel;
  cevre: CevreAnalizi | null;
  egim: EgimAnalizi | null;
  ePlan: EPlanImarVerisi | null;
  fiyat: FiyatTahmini | null;
  riskler: RiskUyarisi[];
  /** AI fiyat tahmini (Pro/Pro+ kullanıcı için triangulation parçası) */
  aiSonuc?: AiFiyatSonucu | null;
  /** Kullanıcı tier'ı — rapor detay seviyesi belirler */
  tier?: "free" | "pro" | "pro_plus" | "kurumsal";
  /** TKGM resmi yıllık analiz (Pro+) — ipotekli satış oranı, alım-satım yoğunluğu */
  tkgmAnaliz?: {
    yil: number;
    ilceAd: string;
    tipler: { tip: number; etiket: string; toplamIslem: number; toplamParsel: number }[];
    /** İpotekli / ana satış oranı (%) */
    ipotekOrani: number;
    /** 5 yıllık alım-satım trend verisi */
    trend: { yil: number; sayi: number }[];
  } | null;
}

const STORAGE_KEY = "raporVerisi";

/**
 * Rapor verisini chrome.storage.local'a yaz.
 * Yeni tab açılırken oraya navigation event'inden önce yazılmalı.
 */
export async function raporVerisiniSakla(veri: RaporVerisi): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    throw new Error("Chrome storage API yok");
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: veri });
}

/** Rapor sayfası storage'tan veriyi okur */
export async function raporVerisiniOku(): Promise<RaporVerisi | null> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return (data[STORAGE_KEY] as RaporVerisi | undefined) ?? null;
}

/** Storage temizliği — rapor sayfası kapatılınca/yeni rapor açılınca eski silinir */
export async function raporVerisiniSil(): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;
  await chrome.storage.local.remove(STORAGE_KEY);
}
