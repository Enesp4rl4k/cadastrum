/**
 * Milli Emlak ihale verisi — backend API client.
 *
 * İlçe bazlı özet, geçmiş ve yaklaşan ihale sorgular.
 * Cache: chrome.storage.local
 *   - Geçmiş verisi: 24 saat TTL
 *   - Yaklaşan verisi: 1 saat TTL (daha dinamik)
 */

const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_YAKLASAN_MS = 60 * 60 * 1000; // 1 saat
const CACHE_PREFIX = "milli_emlak__";
const CACHE_PREFIX_YAKLASAN = "milli_emlak_yaklasan__";
const FETCH_TIMEOUT_MS = 8_000;

export interface MilliEmlakIhale {
  id: number;
  il_norm: string;
  ilce_norm: string;
  mahalle_norm: string | null;
  ada_no: string | null;
  parsel_no: string | null;
  m2: number | null;
  nitelik: string | null;
  muhammen_bedel: number;
  ihale_bedeli: number;
  fiyat_per_m2: number | null;
  ihale_tarihi: number | null;
  ihale_tipi: string;
  kaynak_url: string | null;
}

export interface MilliEmlakOzet {
  adet: number;
  ort_fiyat_per_m2: number | null;
  min_fiyat_per_m2: number | null;
  max_fiyat_per_m2: number | null;
  ort_m2: number | null;
  son_ihale: number | null;
}

export interface MilliEmlakSonuc {
  ozet: MilliEmlakOzet | null;
  ilanlar: MilliEmlakIhale[];
  fetchedAt: number;
}

function cacheKey(il: string, ilce: string): string {
  return `${CACHE_PREFIX}${il}__${ilce}`;
}

async function cacheOku(key: string): Promise<MilliEmlakSonuc | null> {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
    const bag = await chrome.storage.local.get(key);
    const row = bag[key] as { veri: MilliEmlakSonuc; ts: number } | undefined;
    if (!row || Date.now() - row.ts > CACHE_TTL_MS) return null;
    return row.veri;
  } catch {
    return null;
  }
}

async function cacheYaz(key: string, veri: MilliEmlakSonuc): Promise<void> {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    await chrome.storage.local.set({ [key]: { veri, ts: Date.now() } });
  } catch {
    // Cache yazma hatası kritik değil
  }
}

/**
 * İlçe bazlı Milli Emlak ihale özeti + son ilanları çek.
 * Cache-first: 24 saat içinde aynı ilçe için sonuç varsa döner.
 */
export async function milliEmlakGetir(
  ilNorm: string,
  ilceNorm: string,
  signal?: AbortSignal,
): Promise<MilliEmlakSonuc | null> {
  if (!ilNorm || !ilceNorm) return null;

  const key = cacheKey(ilNorm, ilceNorm);
  const cached = await cacheOku(key);
  if (cached) return cached;

  try {
    // Özet + son 10 ilan paralel çek
    const [ozetRes, ilanlarRes] = await Promise.all([
      fetch(
        `${API_BASE}/milli-emlak/ozet/${encodeURIComponent(ilNorm)}/${encodeURIComponent(ilceNorm)}`,
        { signal: signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS) },
      ),
      fetch(
        `${API_BASE}/milli-emlak/sorgu?il=${encodeURIComponent(ilNorm)}&ilce=${encodeURIComponent(ilceNorm)}&limit=10`,
        { signal: signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS) },
      ),
    ]);

    const ozetData = ozetRes.ok
      ? ((await ozetRes.json()) as { ozet: MilliEmlakOzet | null })
      : null;
    const ilanlarData = ilanlarRes.ok
      ? ((await ilanlarRes.json()) as { ilanlar: MilliEmlakIhale[] })
      : null;

    const sonuc: MilliEmlakSonuc = {
      ozet: ozetData?.ozet ?? null,
      ilanlar: ilanlarData?.ilanlar ?? [],
      fetchedAt: Date.now(),
    };

    if (sonuc.ozet || sonuc.ilanlar.length > 0) {
      await cacheYaz(key, sonuc);
    }

    return sonuc;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return null;
    return null;
  }
}

export interface MilliEmlakYaklasanSonuc {
  ilanlar: MilliEmlakIhale[];
  adet: number;
  sorgu_tarihi: number;
  fetchedAt: number;
}

function cacheKeyYaklasan(il: string, ilce: string): string {
  return `${CACHE_PREFIX_YAKLASAN}${il}__${ilce}`;
}

async function cacheOkuYaklasan(key: string): Promise<MilliEmlakYaklasanSonuc | null> {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
    const bag = await chrome.storage.local.get(key);
    const row = bag[key] as { veri: MilliEmlakYaklasanSonuc; ts: number } | undefined;
    if (!row || Date.now() - row.ts > CACHE_TTL_YAKLASAN_MS) return null;
    return row.veri;
  } catch {
    return null;
  }
}

async function cacheYazYaklasan(key: string, veri: MilliEmlakYaklasanSonuc): Promise<void> {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    await chrome.storage.local.set({ [key]: { veri, ts: Date.now() } });
  } catch {
    // kritik değil
  }
}

/**
 * Yaklaşan / aktif ihaleler — ihale_tarihi > şimdi.
 * Cache TTL: 1 saat (geçmiş veriye göre daha kısa).
 */
export async function milliEmlakYaklasanGetir(
  ilNorm: string,
  ilceNorm: string,
  gun = 90,
  signal?: AbortSignal,
): Promise<MilliEmlakYaklasanSonuc | null> {
  if (!ilNorm || !ilceNorm) return null;

  const key = cacheKeyYaklasan(ilNorm, ilceNorm);
  const cached = await cacheOkuYaklasan(key);
  if (cached) return cached;

  try {
    const url = `${API_BASE}/milli-emlak/yaklasan?il=${encodeURIComponent(ilNorm)}&ilce=${encodeURIComponent(ilceNorm)}&limit=20&gun=${gun}`;
    const res = await fetch(url, {
      signal: signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { ilanlar: MilliEmlakIhale[]; adet: number; sorgu_tarihi: number };

    const sonuc: MilliEmlakYaklasanSonuc = {
      ilanlar: data.ilanlar ?? [],
      adet: data.adet ?? 0,
      sorgu_tarihi: data.sorgu_tarihi ?? Date.now(),
      fetchedAt: Date.now(),
    };

    // Sadece sonuç varsa cache'le
    if (sonuc.ilanlar.length > 0) {
      await cacheYazYaklasan(key, sonuc);
    }

    return sonuc;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return null;
    return null;
  }
}

/** TL formatla — "1.250.000 ₺" */
export function fmtTL(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString("tr-TR")} ₺`;
}

/** TL/m² formatla */
export function fmtTLm2(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString("tr-TR")} ₺/m²`;
}
