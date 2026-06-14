/**
 * Manuel kullanıcı verisi — e-Plan veya emsal verisi gelmediğinde
 * kullanıcının kendi girdiği imar/emsal bilgileri.
 *
 * Storage: chrome.storage.local
 *   anahtar: "manuel:{mahalleKodu}-{adaNo}-{parselNo}"
 *
 * Bu veri kullanıcı kendi parseline özeldir, başka bir kullanıcıya gönderilmez.
 */

import type { Parsel } from "../types/tkgm";

export interface ManuelImar {
  taks?: number;
  emsal?: number;
  maksKat?: number;
  yapiNizami?: string;       // 'Bitişik nizam', 'Ayrık nizam', 'Blok'
  kullanimKarari?: string;    // 'Konut', 'Ticaret', 'Sanayi', vs
  planKarari?: string;
  notlar?: string;
  girilmeTarihi: number;
  kaynak?: string;            // "Belediye e-imar", "1/1000 plan", vs
}

export interface ManuelEmsal {
  id: string;
  fiyatTL: number;
  m2: number;
  fiyatPerM2: number;         // = fiyatTL / m2
  kategori: "arsa" | "tarla" | "konut";
  konum?: string;             // serbest metin: "aynı sokak", "Çayır mevkii"
  notlar?: string;
  girilmeTarihi: number;
}

export interface ManuelVeri {
  imar?: ManuelImar;
  emsaller: ManuelEmsal[];
}

const PREFIX = "manuel:";

function parselAnahtari(parsel: { mahalleKodu: number | null; adaNo: number; parselNo: number }): string {
  return `${PREFIX}${parsel.mahalleKodu ?? "x"}-${parsel.adaNo}-${parsel.parselNo}`;
}

export async function manuelVeriOku(parsel: Parsel): Promise<ManuelVeri> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return { emsaller: [] };
  }
  const anahtar = parselAnahtari(parsel);
  const data = await chrome.storage.local.get(anahtar);
  const v = data[anahtar] as ManuelVeri | undefined;
  return v ?? { emsaller: [] };
}

export async function manuelImarKaydet(parsel: Parsel, imar: Omit<ManuelImar, "girilmeTarihi">): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;
  const mevcut = await manuelVeriOku(parsel);
  const yeni: ManuelVeri = {
    ...mevcut,
    imar: { ...imar, girilmeTarihi: Date.now() },
  };
  await chrome.storage.local.set({ [parselAnahtari(parsel)]: yeni });
}

export async function manuelImarSil(parsel: Parsel): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;
  const mevcut = await manuelVeriOku(parsel);
  const yeni: ManuelVeri = { ...mevcut, imar: undefined };
  await chrome.storage.local.set({ [parselAnahtari(parsel)]: yeni });
}

export async function manuelEmsalEkle(parsel: Parsel, emsal: Omit<ManuelEmsal, "id" | "girilmeTarihi" | "fiyatPerM2">): Promise<ManuelEmsal> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    throw new Error("Storage yok");
  }
  const mevcut = await manuelVeriOku(parsel);
  const yeniEmsal: ManuelEmsal = {
    ...emsal,
    id: `me-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fiyatPerM2: Math.round(emsal.fiyatTL / emsal.m2),
    girilmeTarihi: Date.now(),
  };
  const yeni: ManuelVeri = { ...mevcut, emsaller: [...mevcut.emsaller, yeniEmsal] };
  await chrome.storage.local.set({ [parselAnahtari(parsel)]: yeni });
  return yeniEmsal;
}

export async function manuelEmsalSil(parsel: Parsel, emsalId: string): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;
  const mevcut = await manuelVeriOku(parsel);
  const yeni: ManuelVeri = { ...mevcut, emsaller: mevcut.emsaller.filter(e => e.id !== emsalId) };
  await chrome.storage.local.set({ [parselAnahtari(parsel)]: yeni });
}

/**
 * ePlan + manuel imar birleştirme:
 * Manuel veri ePlan'ı tamamen değil, alan bazında override eder.
 * (Kullanıcı sadece TAKS girdiyse, ePlan emsal'i korunur.)
 */
import type { EPlanImarVerisi } from "./eplan";

export interface BirlesikImar extends EPlanImarVerisi {
  manuelGirildi: boolean;       // herhangi bir alan manuel mi?
  alanKaynaklari: Record<string, "eplan" | "manuel">;
}

export function imarBirlestir(ePlan: EPlanImarVerisi | null | undefined, manuel: ManuelImar | undefined): BirlesikImar | null {
  if (!ePlan && !manuel) return null;

  // Default tüm EPlanImarVerisi alanlarıyla başla — ePlan veya boş şablon
  const sablon: EPlanImarVerisi = ePlan ?? {
    parselKey: "",
    kaynakUrl: "manuel",
    yakalandiAt: manuel?.girilmeTarihi ?? Date.now(),
    ilAd: null, ilceAd: null, mahalleAd: null,
    adaNo: null, parselNo: null, pin: null,
    kullanimKarari: null, planKarari: null, planNotu: null,
    yapiNizami: null, emsal: null, taks: null, maksKat: null,
    hamMetin: [], guvenSkoru: 50,
  };

  const alanKaynaklari: Record<string, "eplan" | "manuel"> = {};
  const sonuc: any = { ...sablon };

  // Manuel override edilebilen alanlar
  const overrideAlanlari = ["taks", "emsal", "maksKat", "yapiNizami", "kullanimKarari", "planKarari"] as const;
  for (const alan of overrideAlanlari) {
    const manuelDeger = manuel?.[alan as keyof ManuelImar];
    const ePlanDeger = ePlan?.[alan as keyof EPlanImarVerisi];

    if (manuelDeger != null && manuelDeger !== "") {
      sonuc[alan] = manuelDeger;
      alanKaynaklari[alan] = "manuel";
    } else if (ePlanDeger != null && ePlanDeger !== "") {
      sonuc[alan] = ePlanDeger;
      alanKaynaklari[alan] = "eplan";
    }
  }

  return {
    ...sonuc,
    manuelGirildi: !!manuel,
    alanKaynaklari,
  };
}
