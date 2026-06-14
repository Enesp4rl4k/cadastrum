/**
 * Bias kalibrasyon — backend'in cross-validation çıktısından gelen
 * ilçe-bazlı düzeltme çarpanları.
 *
 * Backend D1'den gerçek ilan verisi train/test split:
 *   - "balikesir__bandirma__arsa" → 1.05 (sistem %5 düşük tahmin yapıyor, +%5 düzelt)
 *   - "istanbul__besiktas__arsa" → 0.95 (sistem %5 yüksek, -%5 düzelt)
 *
 * Cache: 24 saat IndexedDB (kullanıcı her seferinde fetch yapmasın).
 * Fallback: hata varsa carpan = 1.0 (no-op).
 */

const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";
const CACHE_KEY = "biasKalibrasyonCache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface BiasResponse {
  olusturuldu: number;
  tabloAdet: number;
  bias: Record<string, number>;
}

interface CachedBias {
  veri: BiasResponse;
  cachedAt: number;
}

let memCache: BiasResponse | null = null;
let memCacheAt = 0;

async function loadFromStorage(): Promise<BiasResponse | null> {
  if (memCache && Date.now() - memCacheAt < CACHE_TTL_MS) return memCache;
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return null;
  try {
    const data = await chrome.storage.local.get(CACHE_KEY);
    const c = data[CACHE_KEY] as CachedBias | undefined;
    if (!c) return null;
    if (Date.now() - c.cachedAt > CACHE_TTL_MS) return null;
    memCache = c.veri;
    memCacheAt = c.cachedAt;
    return c.veri;
  } catch {
    return null;
  }
}

async function saveToStorage(veri: BiasResponse): Promise<void> {
  memCache = veri;
  memCacheAt = Date.now();
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return;
  try {
    await chrome.storage.local.set({
      [CACHE_KEY]: { veri, cachedAt: Date.now() } satisfies CachedBias,
    });
  } catch {
    // ignore
  }
}

export async function biasTablosuYukle(): Promise<BiasResponse | null> {
  const cached = await loadFromStorage();
  if (cached) return cached;

  try {
    const res = await fetch(`${API_BASE}/validation/bias`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const veri = await res.json() as BiasResponse;
    await saveToStorage(veri);
    return veri;
  } catch {
    return null;
  }
}

/**
 * Bir ilçe + kategori için bias düzeltme çarpanı.
 * @returns 1.0 (no-op) eğer veri yoksa veya bias küçükse
 */
export async function biasCarpani(
  ilNorm: string | null,
  ilceNorm: string | null,
  kategori: string,
): Promise<{ carpan: number; aciklama: string }> {
  if (!ilNorm || !ilceNorm) return { carpan: 1.0, aciklama: "" };
  const tablo = await biasTablosuYukle();
  if (!tablo?.bias) return { carpan: 1.0, aciklama: "" };

  const key = `${ilNorm}__${ilceNorm}__${kategori}`;
  const carpan = tablo.bias[key];
  if (!carpan || carpan === 1.0) return { carpan: 1.0, aciklama: "" };

  const yon = carpan > 1 ? "yukarı" : "aşağı";
  const yuzde = Math.abs(carpan - 1) * 100;
  return {
    carpan,
    aciklama: `Cross-validation bias düzeltme (${yon} %${yuzde.toFixed(1)})`,
  };
}

/**
 * Public validation summary — Sistem Sağlığı UI için.
 */
export interface ValidationOzet {
  olusturuldu: number;
  pencereGun: number;
  toplamIlan: number;
  trainAdet: number;
  testAdet: number;
  global: { mape: number; mae: number; rmse: number; n: number };
  topPositiveBias: Array<{ il: string; ilce: string; kategori: string; mape: number; bias: number; n: number }>;
  topNegativeBias: Array<{ il: string; ilce: string; kategori: string; mape: number; bias: number; n: number }>;
}

export async function validationOzetYukle(): Promise<ValidationOzet | null> {
  try {
    const res = await fetch(`${API_BASE}/validation/public`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json() as ValidationOzet;
  } catch {
    return null;
  }
}
