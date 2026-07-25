/**
 * Veri katkısı sayaç yardımcıları — lib katmanı.
 * VeriKatkiSkoru.tsx bileşeni + sahibinden-liste-ingest.ts content script
 * bu modülü paylaşır.
 */

export interface KatkiSayaci {
  toplamIlan: number;
  mahalleliIlan: number;
  koordinatliIlan: number;
  sonEklemeTs: number | null;
  gunlukGecmis: Record<string, number>;
}

const STORAGE_KEY = "cadastrum_katki_sayaci";

export async function katkiSayaciniOku(): Promise<KatkiSayaci> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return { toplamIlan: 0, mahalleliIlan: 0, koordinatliIlan: 0, sonEklemeTs: null, gunlukGecmis: {} };
  }
  const raw = await chrome.storage.local.get(STORAGE_KEY);
  const v = raw[STORAGE_KEY] as KatkiSayaci | undefined;
  return v ?? { toplamIlan: 0, mahalleliIlan: 0, koordinatliIlan: 0, sonEklemeTs: null, gunlukGecmis: {} };
}

export async function katkiSayaciniGuncelle(opts: {
  ilanSayisi: number;
  mahalleliSayisi?: number;
  koordinatliSayisi?: number;
}): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;
  const mevcut = await katkiSayaciniOku();
  const bugun = new Date().toISOString().slice(0, 10);
  const gunluk = { ...mevcut.gunlukGecmis };
  gunluk[bugun] = (gunluk[bugun] ?? 0) + opts.ilanSayisi;

  // Son 30 gün tut
  const gunler = Object.keys(gunluk).sort().slice(-30);
  const temizGunluk: Record<string, number> = {};
  for (const g of gunler) temizGunluk[g] = gunluk[g]!;

  const yeni: KatkiSayaci = {
    toplamIlan: mevcut.toplamIlan + opts.ilanSayisi,
    mahalleliIlan: mevcut.mahalleliIlan + (opts.mahalleliSayisi ?? 0),
    koordinatliIlan: mevcut.koordinatliIlan + (opts.koordinatliSayisi ?? 0),
    sonEklemeTs: Date.now(),
    gunlukGecmis: temizGunluk,
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: yeni });
}
