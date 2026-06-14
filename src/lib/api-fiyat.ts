/**
 * Cadastrum API client — backend'den mahalle fiyat verisi çek.
 *
 * Yerleşim: src/lib/baseline-engine.ts'in opsiyonel veri kaynağı.
 *   - Backend deploy edildiğinde aktif olur
 *   - Backend yoksa veya hata varsa null döner (fallback'e düşer)
 *
 * Cache: chrome.storage.local üzerinden 24 saat TTL.
 */

// Production worker URL. Custom domain (api.cadastrum.com.tr) Cloudflare'de
// bağlandığında bu satırı değiştir. Pilot: workers.dev subdomain.
const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat
const CACHE_PREFIX = "api_fiyat__";
const FETCH_TIMEOUT_MS = 5000;

export type ApiKategori = "arsa" | "tarla" | "konut";

export interface ApiFiyatSonuc {
  /** TL/m² medyan */
  medyan: number;
  q1?: number;
  q3?: number;
  ortalama?: number;
  ilan_adet: number;
  son_guncelleme: number;
  /** "ilan-istatistik" = gerçek ilan, "ai-research" = backend AI baseline */
  kaynak: "ilan-istatistik" | "ai-research" | "knn-smoothing" | "ilce-fallback";
  /** 6 aylık trend (varsa) */
  trend?: Array<{ yil: number; ay: number; medyan: number; ilan_adet: number }>;
}

interface CachedSonuc {
  veri: ApiFiyatSonuc | null;
  ts: number;
}

function cacheKey(il: string, ilce: string, mahalle: string | null, kategori: ApiKategori): string {
  return `${CACHE_PREFIX}${il}__${ilce}__${mahalle ?? "_"}__${kategori}`;
}

async function cacheOku(key: string): Promise<CachedSonuc | null> {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return null;
  try {
    const data = await chrome.storage.local.get(key);
    const cached = data[key] as CachedSonuc | undefined;
    if (!cached) return null;
    if (Date.now() - cached.ts > CACHE_TTL_MS) return null;
    return cached;
  } catch {
    return null;
  }
}

async function cacheYaz(key: string, veri: ApiFiyatSonuc | null): Promise<void> {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return;
  try {
    await chrome.storage.local.set({ [key]: { veri, ts: Date.now() } satisfies CachedSonuc });
  } catch {
    // sessizce yok say
  }
}

/**
 * Backend API'den mahalle fiyat sorgu.
 * Hata/timeout durumunda null döner — caller fallback'e düşmeli.
 */
export async function apiFiyatMahalleSorgula(
  il: string,
  ilce: string,
  mahalle: string,
  kategori: ApiKategori = "arsa",
): Promise<ApiFiyatSonuc | null> {
  const key = cacheKey(il, ilce, mahalle, kategori);
  const cached = await cacheOku(key);
  if (cached) return cached.veri;

  const url = `${API_BASE}/fiyat/mahalle/${encodeURIComponent(il)}/${encodeURIComponent(ilce)}/${encodeURIComponent(mahalle)}?kategori=${kategori}`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) {
      // 404 = veri yok, normal durum — cache'e null yaz
      if (res.status === 404) {
        await cacheYaz(key, null);
      }
      return null;
    }
    const veri = await res.json() as ApiFiyatSonuc;
    if (!veri.medyan || veri.medyan <= 0) {
      await cacheYaz(key, null);
      return null;
    }
    await cacheYaz(key, veri);
    return veri;
  } catch {
    // Network error — cache'e yazma, bir sonraki sorguda tekrar dene
    return null;
  }
}

/**
 * İlçe bazlı sorgu — mahalle'de veri yoksa fallback.
 */
export async function apiFiyatIlceSorgula(
  il: string,
  ilce: string,
  kategori: ApiKategori = "arsa",
): Promise<ApiFiyatSonuc | null> {
  const key = cacheKey(il, ilce, null, kategori);
  const cached = await cacheOku(key);
  if (cached) return cached.veri;

  const url = `${API_BASE}/fiyat/ilce/${encodeURIComponent(il)}/${encodeURIComponent(ilce)}?kategori=${kategori}`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) {
      if (res.status === 404) await cacheYaz(key, null);
      return null;
    }
    const veri = await res.json() as ApiFiyatSonuc & { mahalleler?: unknown[] };
    if (!veri.medyan || veri.medyan <= 0) {
      await cacheYaz(key, null);
      return null;
    }
    const sonuc: ApiFiyatSonuc = { ...veri, kaynak: veri.kaynak ?? "ilan-istatistik" };
    await cacheYaz(key, sonuc);
    return sonuc;
  } catch {
    return null;
  }
}

/**
 * Extension crowdsource — bir ilan gözlemini backend'e POST et.
 * Fire-and-forget, hata olursa sessizce devam eder.
 */
export async function apiIlanGonder(payload: {
  kaynak: "extension";
  ilan_no: string;
  il: string;
  ilce: string;
  mahalle?: string;
  fiyat_per_m2: number;
  m2?: number;
  kategori: string;
  imar_durumu?: string;
  para_birimi?: string;
}): Promise<{ ok: boolean; duplicate?: boolean }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`${API_BASE}/ilan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.status === 201) return { ok: true };
    if (res.status === 409) return { ok: true, duplicate: true };
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

// ── Faz 2 — Spatial emsal client ────────────────────────────────────────────

export interface ApiSpatialEmsalSonuc {
  emsaller: Array<{
    id: number;
    fiyat_per_m2: number;
    m2: number | null;
    lat: number;
    lng: number;
    mesafeM: number;
    guven_skoru?: number;
    yakalanma_tarihi: number;
  }>;
  halkaDagilimi: { r0_1km: number; r1_3km: number; r3_5km: number; r5_10km: number };
  baseline: number | null;
  adet: number;
  D: number;
  radiusM: number;
}

/**
 * Backend spatial emsal sorgu — koord bazlı radius decay.
 * 60sn memoize (extension içi) + CDN 5dk cache. Aynı 110m quantize karede
 * tek istek atılır.
 */
const SPATIAL_MEMO = new Map<string, { veri: ApiSpatialEmsalSonuc | null; ts: number }>();
const SPATIAL_MEMO_TTL_MS = 60_000;

export async function apiSpatialEmsalGetir(
  lat: number,
  lng: number,
  radiusKm: number,
  kategori: ApiKategori = "arsa",
): Promise<ApiSpatialEmsalSonuc | null> {
  // Quantize 3 ondalık → aynı 110m karede tek istek
  const key = `${lat.toFixed(3)}|${lng.toFixed(3)}|${radiusKm}|${kategori}`;
  const hit = SPATIAL_MEMO.get(key);
  if (hit && Date.now() - hit.ts < SPATIAL_MEMO_TTL_MS) return hit.veri;

  const url = `${API_BASE}/emsal/spatial?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}&radius_km=${radiusKm}&kategori=${kategori}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) {
      SPATIAL_MEMO.set(key, { veri: null, ts: Date.now() });
      return null;
    }
    const veri = (await res.json()) as ApiSpatialEmsalSonuc;
    SPATIAL_MEMO.set(key, { veri, ts: Date.now() });
    return veri;
  } catch {
    return null;
  }
}

/**
 * Opt-in anonim emsal upload. Lat/lng quantize zaten server'da yapılır;
 * burada extension Settings'teki "Anonim emsal paylaş" toggle aktifse çağrılır.
 */
export async function apiEmsalGonder(payload: {
  lat: number;
  lng: number;
  fiyat_per_m2: number;
  m2?: number;
  kategori: ApiKategori;
  ilan_tarihi?: number;
}): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`${API_BASE}/emsal/gonder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/** Kullanıcı bir backend emsalini "gerçekçi" işaretler. */
export async function apiEmsalDogrula(id: number): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`${API_BASE}/emsal/${id}/dogrula`, {
      method: "POST",
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Backend health check — UI'da "API çalışıyor mu?" göstergesi için.
 */
export async function apiSagliklimi(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${API_BASE}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}
