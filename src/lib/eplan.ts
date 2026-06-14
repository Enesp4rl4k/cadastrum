import type { Parsel } from "../types/tkgm";

export const EPLAN_STORAGE_KEY = "ePlanSonuc";
export const EPLAN_URL = "https://e-plan.gov.tr/e-plan/html/imarDurumu.html";

export interface EPlanImarVerisi {
  parselKey: string;
  kaynakUrl: string;
  yakalandiAt: number;
  ilAd: string | null;
  ilceAd: string | null;
  mahalleAd: string | null;
  adaNo: number | null;
  parselNo: number | null;
  pin: string | null;
  kullanimKarari: string | null;
  planKarari: string | null;
  planNotu: string | null;
  yapiNizami: string | null;
  emsal: number | null;
  taks: number | null;
  maksKat: number | null;
  hamMetin: string[];
  guvenSkoru: number;
}

export function ePlanParselKey(input: {
  ilAd?: string | null;
  ilceAd?: string | null;
  mahalleAd?: string | null;
  adaNo?: number | null;
  parselNo?: number | null;
}): string {
  const slug = (value: string | null | undefined) =>
    (value ?? "")
      .toLocaleLowerCase("tr")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  return [
    slug(input.ilAd),
    slug(input.ilceAd),
    slug(input.mahalleAd),
    input.adaNo ?? "",
    input.parselNo ?? "",
  ].join(":");
}

export function ePlanParselKeyFromParsel(parsel: Parsel): string {
  return ePlanParselKey({
    ilAd: parsel.ilAd,
    ilceAd: parsel.ilceAd,
    mahalleAd: parsel.mahalleAd,
    adaNo: parsel.adaNo,
    parselNo: parsel.parselNo,
  });
}

export function ePlanMetin(veri: EPlanImarVerisi | null | undefined): string {
  if (!veri) return "";
  return [
    veri.kullanimKarari,
    veri.planKarari,
    veri.planNotu,
    veri.yapiNizami,
    veri.hamMetin.join(" "),
  ]
    .filter(Boolean)
    .join(" ");
}

export function ePlanOzet(veri: EPlanImarVerisi | null | undefined): string {
  if (!veri) return "Resmi e-Plan verisi henüz yakalanmadı.";
  const parcalar = [
    veri.kullanimKarari,
    veri.planKarari,
    veri.yapiNizami,
    veri.emsal != null ? `Emsal ${veri.emsal}` : null,
    veri.taks != null ? `TAKS ${veri.taks}` : null,
    veri.maksKat != null ? `Maks kat ${veri.maksKat}` : null,
  ].filter(Boolean);
  return parcalar.join(" · ") || "Resmi e-Plan sonucu yakalandı ama özet alanlar sınırlı.";
}

export async function aktifEPlanVerisiGetir(
  parsel: Parsel,
): Promise<EPlanImarVerisi | null> {
  const data = await chrome.storage.local.get(EPLAN_STORAGE_KEY);
  const veri = (data[EPLAN_STORAGE_KEY] as EPlanImarVerisi | undefined) ?? null;
  if (!veri) return null;
  return veri.parselKey === ePlanParselKeyFromParsel(parsel) ? veri : null;
}
