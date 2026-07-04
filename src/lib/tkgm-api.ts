import type {
  BagimsizBolum,
  Blok,
  Ilce,
  Il,
  Mahalle,
  Parsel,
} from "../types/tkgm";

const TKGM_API_BASE = "https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api";
const TKGM_PARSEL_BASE =
  "https://parselsorgu.tkgm.gov.tr/app/modules/administrativeQuery/data";

const HEADERS: HeadersInit = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (Arsa-TKGM-Extension)",
};

/**
 * Background SW'ye fetch'i devret — TKGM 403'leri için en sağlam yol.
 * Side panel'dan direkt fetch chrome-extension://... origin gönderir;
 * background fetch DNR rules ile Origin'i parselsorgu olarak rewrite eder.
 * (Aslında her iki yol da DNR'dan geçer ama bu her ihtimale karşı çift kontrol.)
 */
async function backgroundFetch(
  url: string,
): Promise<{ ok: boolean; status: number; text: string; error?: string }> {
  if (typeof chrome === "undefined" || !chrome?.runtime?.sendMessage) {
    // Browser preview / non-extension context — direkt fetch
    const r = await fetch(url, { headers: HEADERS });
    return { ok: r.ok, status: r.status, text: await r.text() };
  }
  return await chrome.runtime.sendMessage({ tip: "tkgm-fetch", url });
}

async function getJson<T>(url: string): Promise<T> {
  // Sadece TKGM host'ları için background proxy kullan; diğerlerini doğrudan
  const useProxy = /(?:cbsapi|parselsorgu)\.tkgm\.gov\.tr/.test(url);

  // 5xx için otomatik 1 retry (1 sn bekleyerek)
  const maxRetry = 1;
  for (let i = 0; i <= maxRetry; i++) {
    try {
      if (useProxy) {
        const result = await backgroundFetch(url);
        if (result.error) throw new Error(result.error);
        return parseTkgmResponse<T>(result.status, result.text);
      }
      const res = await fetch(url, { headers: HEADERS });
      const text = await res.text();
      return parseTkgmResponse<T>(res.status, text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 5xx hatalarını retry et (TKGM kararsız), diğer hataları direkt fırlat
      const retryable = /503|geçici|sunucu/i.test(msg);
      if (i < maxRetry && retryable) {
        await new Promise(r => setTimeout(r, 1000)); // 1 sn bekle
        continue;
      }
      throw e;
    }
  }
  throw new Error("TKGM erişilemedi");
}

function parseTkgmResponse<T>(status: number, text: string): T {
  // TKGM bazen 200 ile XML <string>Hata</string> döndürüyor
  if (text.startsWith("<")) {
    const m = /<string[^>]*>(.*?)<\/string>/i.exec(text);
    if (m && m[1]) throw new Error(decodeHtmlEntities(m[1].trim()));
  }

  // TKGM 403 + body'de mesaj varsa onu al ("Günlük sorgu limitini aştınız")
  if (status === 403) {
    // Body içinde mesaj olabilir (JSON string olarak): "Günlük sorgu limitini aştınız."
    const bodyMsg = text.trim().replace(/^"|"$/g, "");
    if (bodyMsg.toLowerCase().includes("günlük") || bodyMsg.toLowerCase().includes("limit")) {
      throw new Error(
        `TKGM günlük sorgu limiti doldu (${bodyMsg}). Yarın gece 00:00'da sıfırlanır.`,
      );
    }
    throw new Error(`TKGM 403: ${bodyMsg || "erişim reddedildi"}`);
  }

  // TKGM 5xx — devlet sunucusu kararsız, kullanıcıya net mesaj
  if (status >= 500 && status < 600) {
    if (status === 503) {
      throw new Error(
        "TKGM sunucusu şu an cevap vermiyor (geçici). Birkaç dakika sonra tekrar deneyin."
      );
    }
    throw new Error(
      `TKGM sunucu hatası (HTTP ${status}). Birkaç dakika sonra tekrar deneyin.`
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    // Boş cevap veya HTML — büyük ihtimal TKGM geçici sorun
    if (!text.trim() || text.trim().startsWith("<")) {
      throw new Error(
        `TKGM sunucusu geçersiz yanıt verdi (HTTP ${status}). Birkaç dakika sonra tekrar deneyin.`
      );
    }
    throw new Error(`Geçersiz JSON yanıtı (HTTP ${status})`);
  }

  if (status < 200 || status >= 300) {
    const msg = extractErrorMessage(data);
    throw new Error(msg ?? `TKGM HTTP ${status}`);
  }

  // 200 ama Message alanı varsa o aslında hata
  const msg = extractErrorMessage(data);
  if (msg) throw new Error(msg);

  return data as T;
}

function extractErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  for (const key of ["Message", "message", "error", "detail"] as const) {
    const v = d[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function decodeHtmlEntities(s: string): string {
  const el = document.createElement("textarea");
  el.innerHTML = s;
  return el.value;
}

// ===== İdari yapı cache'i — mahalle kodu lookup'ı 3-5x hızlanır =====
// İl listesi (81 il) zaten static — bir kez çek, session boyu cache'le.
// İlçe listesi her il için ayrı, mahalle listesi her ilçe için ayrı.
// Map<key, Promise> pattern: concurrent çağrılar aynı fetch'i paylaşır.
const IDARI_STORAGE_PREFIX = "tkgmIdari:";
const IDARI_STORAGE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface IdariStorageRow<T> {
  at: number;
  data: T;
}

async function readIdariStorage<T>(key: string): Promise<T | null> {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
    const sk = IDARI_STORAGE_PREFIX + key;
    const bag = await chrome.storage.local.get(sk);
    const row = bag[sk] as IdariStorageRow<T> | undefined;
    if (!row || Date.now() - row.at > IDARI_STORAGE_TTL_MS) return null;
    return row.data;
  } catch {
    return null;
  }
}

async function writeIdariStorage<T>(key: string, data: T): Promise<void> {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    const sk = IDARI_STORAGE_PREFIX + key;
    await chrome.storage.local.set({ [sk]: { at: Date.now(), data } satisfies IdariStorageRow<T> });
  } catch {
    // kota / izin — sessizce atla
  }
}

function parseIdariFeatures(
  data: { features?: Array<{ properties?: Record<string, unknown> }> },
): Array<Record<string, unknown>> {
  return (data.features ?? []).map((f) => (f.properties ?? {}) as Record<string, unknown>);
}

let ilListesiCache: Promise<Il[]> | null = null;
const ilceListesiCache = new Map<number, Promise<Ilce[]>>();
const mahalleListesiCache = new Map<number, Promise<Mahalle[]>>();

export async function getIlListesi(): Promise<Il[]> {
  if (ilListesiCache) return ilListesiCache;
  ilListesiCache = (async () => {
    const mapla = (data: { features?: Array<{ properties?: Record<string, unknown> }> }): Il[] =>
      (data.features ?? []).map((f) => {
        const p = (f.properties ?? {}) as Record<string, unknown>;
        return { id: Number(p.id), ad: String(p.text ?? p.ad ?? p.name ?? ""), kod: Number(p.id) };
      });
    try {
      // TKGM parselsorgu statik JSON'u kaldırıldı (302 → online.tkgm.gov.tr).
      // Canlı kaynak megsis idariYapi; parselsorgu geri dönerse fallback kalsın.
      try {
        const data = await getJson<{ features?: Array<{ properties?: Record<string, unknown> }> }>(
          `${TKGM_API_BASE}/idariYapi/ilListe`,
        );
        return mapla(data);
      } catch {
        const data = await getJson<{ features?: Array<{ properties?: Record<string, unknown> }> }>(
          `${TKGM_PARSEL_BASE}/ilListe.json`,
        );
        return mapla(data);
      }
    } catch (e) {
      ilListesiCache = null; // Hata durumunda cache'i sil ki sonraki çağrı tekrar dener
      throw e;
    }
  })();
  return ilListesiCache;
}

export async function getIlceListesi(ilKodu: number): Promise<Ilce[]> {
  const cached = ilceListesiCache.get(ilKodu);
  if (cached) return cached;
  const fetchPromise = (async () => {
    try {
      const disk = await readIdariStorage<Ilce[]>(`ilce:${ilKodu}`);
      if (disk?.length) return disk;

      const maplaIlce = (data: { features?: Array<{ properties?: Record<string, unknown> }> }): Ilce[] =>
        parseIdariFeatures(data).map((p) => ({
          ilceKodu: Number(p.id),
          ilceAdi: String(p.text ?? p.ilceAdi ?? p.ad ?? ""),
          ilKodu: Number(p.ilId ?? ilKodu),
        }));
      let liste: Ilce[];
      // Canlı kaynak megsis idariYapi; parselsorgu statik JSON kaldırıldı (302) — fallback.
      try {
        const data = await getJson<{ features?: Array<{ properties?: Record<string, unknown> }> }>(
          `${TKGM_API_BASE}/idariYapi/ilceListe/${ilKodu}`,
        );
        liste = maplaIlce(data);
      } catch {
        const data = await getJson<{ features?: Array<{ properties?: Record<string, unknown> }> }>(
          `${TKGM_PARSEL_BASE}/ilceListe/${ilKodu}.json`,
        );
        liste = maplaIlce(data);
      }
      void writeIdariStorage(`ilce:${ilKodu}`, liste);
      return liste;
    } catch (e) {
      ilceListesiCache.delete(ilKodu);
      throw e;
    }
  })();
  ilceListesiCache.set(ilKodu, fetchPromise);
  return fetchPromise;
}

export async function getMahalleListesi(ilceKodu: number): Promise<Mahalle[]> {
  const cached = mahalleListesiCache.get(ilceKodu);
  if (cached) return cached;
  const fetchPromise = (async () => {
    try {
      const disk = await readIdariStorage<Mahalle[]>(`mahalle:${ilceKodu}`);
      if (disk?.length) return disk;

      const maplaMahalle = (data: { features?: Array<{ properties?: Record<string, unknown> }> }): Mahalle[] =>
        parseIdariFeatures(data).map((p) => ({
          mahalleKodu: Number(p.id),
          mahalleAdi: String(p.text ?? p.mahalleAdi ?? p.ad ?? ""),
          ilceKodu: Number(p.ilceId ?? ilceKodu),
        }));
      let liste: Mahalle[];
      // Canlı kaynak megsis idariYapi; parselsorgu statik JSON kaldırıldı (302) — fallback.
      try {
        const data = await getJson<{ features?: Array<{ properties?: Record<string, unknown> }> }>(
          `${TKGM_API_BASE}/idariYapi/mahalleListe/${ilceKodu}`,
        );
        liste = maplaMahalle(data);
      } catch {
        const data = await getJson<{ features?: Array<{ properties?: Record<string, unknown> }> }>(
          `${TKGM_PARSEL_BASE}/mahalleListe/${ilceKodu}.json`,
        );
        liste = maplaMahalle(data);
      }
      void writeIdariStorage(`mahalle:${ilceKodu}`, liste);
      return liste;
    } catch (e) {
      mahalleListesiCache.delete(ilceKodu);
      throw e;
    }
  })();
  mahalleListesiCache.set(ilceKodu, fetchPromise);
  return fetchPromise;
}

interface RawParselFeature {
  type?: string;
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
  Message?: string;
}

/**
 * TKGM `alan` alanı endpoint'e göre farklı formatta geliyor:
 * - `/parsel/{mahalle}/{ada}/{parsel}` → `"260,08"` / `"4.036,38"` (TR)
 * - `/parsel/{lat}/{lng}/` → `"260.08"` (EN ondalık nokta)
 *
 * Eski parse tüm `.` karakterlerini binlik ayırıcı sanıp siliyordu;
 * haritadan tıklanınca `"260.08"` → 26008 oluyordu.
 */
export function parseTkgmAlan(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;

  const s = String(raw ?? "0")
    .trim()
    .replace(/[^\d.,-]/g, "");
  if (!s || s === "-" || s === "." || s === ",") return 0;

  let normalized: string;
  if (s.includes(",") && s.includes(".")) {
    // TR: 4.036,38
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    // TR ondalık: 260,08
    normalized = s.replace(",", ".");
  } else if (s.includes(".")) {
    const parts = s.split(".");
    const afterLast = parts[parts.length - 1] ?? "";
    // Birden fazla nokta veya son grup tam 3 hane → binlik (1.234.567 / 26.008)
    if (parts.length > 2 || afterLast.length === 3) {
      normalized = s.replace(/\./g, "");
    } else {
      // EN ondalık: 260.08 / 4036.38
      normalized = s;
    }
  } else {
    normalized = s;
  }

  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

function parseParselFeature(
  data: RawParselFeature,
  fallback: { mahalleKodu?: number; adaNo?: number; parselNo?: number } = {},
): Parsel {
  if (data.type !== "Feature") {
    throw new Error("Beklenmeyen API yanıtı (Feature değil)");
  }

  const props = (data.properties ?? {}) as Record<string, unknown>;
  const geom = data.geometry ?? {};

  const alan = parseTkgmAlan(props.alan);

  let centerLat = 0;
  let centerLng = 0;
  let ring: number[][] = [];
  if (geom.type === "Polygon" && Array.isArray(geom.coordinates)) {
    const coords = geom.coordinates as number[][][];
    ring = coords[0] ?? [];
    if (ring.length > 0) {
      centerLng = ring.reduce((s, c) => s + (c[0] ?? 0), 0) / ring.length;
      centerLat = ring.reduce((s, c) => s + (c[1] ?? 0), 0) / ring.length;
    }
  }

  const gittigiRaw = props.gittigiParselListe;
  const gittigiParseller = parseGittigiParseller(gittigiRaw);

  return {
    mahalleKodu: Number(props.mahalleId ?? fallback.mahalleKodu ?? 0) || null,
    ilKodu: Number(props.ilId ?? 0) || null,
    ilceKodu: Number(props.ilceId ?? 0) || null,
    adaNo: Number(props.adaNo ?? fallback.adaNo ?? 0),
    parselNo: Number(props.parselNo ?? fallback.parselNo ?? 0),
    alan: Number.isFinite(alan) ? alan : 0,
    nitelik: String(props.nitelik ?? ""),
    pafta: String(props.pafta ?? ""),
    ilAd: String(props.ilAd ?? ""),
    ilceAd: String(props.ilceAd ?? ""),
    mahalleAd: String(props.mahalleAd ?? ""),
    durum: String(props.durum ?? ""),
    gittigiParseller,
    geometri: {
      type: (geom.type as "Polygon" | "MultiPolygon") ?? "Polygon",
      coordinates: (geom.coordinates ?? []) as never,
    },
    merkezNokta: { lat: centerLat, lng: centerLng },
    koordinatlar: ring.map((c) => ({ lat: c[1] ?? 0, lng: c[0] ?? 0 })),
  };
}

function parseGittigiParseller(raw: unknown): string[] {
  if (raw == null) return [];
  let data: unknown = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return [];
    try {
      data = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!data || typeof data !== "object") return [];
  const features =
    (data as { features?: Array<{ properties?: Record<string, unknown> }> })
      .features ?? [];
  const out: string[] = [];
  for (const f of features) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const ada = String(p.adaNo ?? "").trim();
    const parsel = String(p.parselNo ?? "").trim();
    if (parsel) out.push(ada ? `${ada}/${parsel}` : parsel);
  }
  return out;
}

const PARSEL_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 gün
/** v2: lat/lng endpoint EN ondalık alan parse düzeltmesi — eski 26008 cache'lerini atla */
const PARSEL_CACHE_VER = "v2";

export async function parselCacheGet(key: string): Promise<Parsel | null> {
  try {
    const { db } = await import("./db");
    const c = await db.parselCache.get(`${PARSEL_CACHE_VER}:${key}`);
    if (c && Date.now() - c.fetchedAt < PARSEL_CACHE_TTL) return c.parsel;
  } catch {}
  return null;
}

export async function parselCacheSet(key: string, parsel: Parsel): Promise<void> {
  try {
    const { db } = await import("./db");
    await db.parselCache.put({
      key: `${PARSEL_CACHE_VER}:${key}`,
      parsel,
      fetchedAt: Date.now(),
    });
  } catch {}
}

export async function getParselByLatLng(
  lat: number,
  lng: number,
): Promise<Parsel> {
  // 5 ondalık ≈ 1m precision — yakın tıklamalar aynı cache'i kullanır
  const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = await parselCacheGet(cacheKey);
  if (cached) {
    console.log("[arsa-cache] hit", cacheKey, cached.adaNo + "/" + cached.parselNo);
    return cached;
  }

  const data = await getJson<RawParselFeature>(
    `${TKGM_API_BASE}/parsel/${lat}/${lng}/`,
  );
  const parsel = parseParselFeature(data);
  // Hem koordinat hem ada/parsel key'i ile cache'le
  await parselCacheSet(cacheKey, parsel);
  if (parsel.mahalleKodu) {
    await parselCacheSet(
      `${parsel.mahalleKodu}/${parsel.adaNo}/${parsel.parselNo}`,
      parsel,
    );
  }
  return parsel;
}

export async function getParselByCodes(
  mahalleKodu: number,
  adaNo: number,
  parselNo: number,
): Promise<Parsel> {
  const cacheKey = `${mahalleKodu}/${adaNo}/${parselNo}`;
  const cached = await parselCacheGet(cacheKey);
  if (cached) {
    console.log("[arsa-cache] hit", cacheKey);
    return cached;
  }
  const data = await getJson<RawParselFeature>(
    `${TKGM_API_BASE}/parsel/${mahalleKodu}/${adaNo}/${parselNo}`,
  );
  const parsel = parseParselFeature(data, { mahalleKodu, adaNo, parselNo });
  await parselCacheSet(cacheKey, parsel);
  return parsel;
}

export async function getParselBlokListesi(
  mahalleKodu: number,
  adaNo: number,
  parselNo: number,
): Promise<Blok[]> {
  const data = await getJson<{
    type?: string;
    features?: Array<{ properties?: Record<string, unknown> }>;
  }>(`${TKGM_API_BASE}/parsel/blok/${mahalleKodu}/${adaNo}/${parselNo}`);
  if (data.type !== "FeatureCollection") return [];
  return (data.features ?? []).map((f) => {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    return {
      blok: String(p.blok ?? ""),
      bagimsizBolumSayisi: Number(p.bagimsizBolumSayisi ?? 0),
      zeminKmdurum: String(p.zeminKmdurum ?? ""),
      atZeminId: (p.atZeminId as number | null) ?? null,
      mahalleId: Number(p.mahalleId ?? mahalleKodu),
      adaNo: String(p.adaNo ?? adaNo),
      parselNo: String(p.parselNo ?? parselNo),
    };
  });
}

/**
 * Türkçe metni normalize eder: lowercase + Türkçe karakterleri ASCII'ye çevir.
 * "İstanbul Büyükçekmece" → "istanbul buyukcekmece"
 */
export function normalizeTr(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    // Büyük harflerden gelen İ ve I özel durumu toLocaleLowerCase("tr") ile çözülür.
    // Kalan küçük Türkçe harfler:
    .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c] ?? c)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "Pamukçu Mh." / "Merkez Mahallesi" / "OSB Mah" → "pamukcu" / "merkez" / "osb"
 * Mahalle suffix'lerini tümünü kaldırır, normalize edilmiş taban adı döner.
 */
export function normalizeYerAdi(s: string): string {
  return normalizeTr(s)
    .replace(/\b(mahallesi|mahalle|koyu|koy|beldesi|belde|mah|mh)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** İlan sitelerinde geçen ama TKGM mahalle adında olmayan ekler */
const MAHALLE_GURULTU_RE =
  /\b(mevkii?|osb|organize\s*sanayi|siteleri|sitesi|bolgesi|bölgesi|yeni\s*yerlesim|yeni\s*yerleşim)\b/gi;

/** Sahibinden/Hepsiemlak mahalle adını TKGM araması için sadeleştirir */
export function normalizeMahalleAra(s: string): string {
  return normalizeYerAdi(s.replace(MAHALLE_GURULTU_RE, " ").replace(/\s+/g, " ").trim());
}

function mahalleTokenleri(s: string): string[] {
  return normalizeMahalleAra(s)
    .split(" ")
    .filter((t) => t.length >= 2);
}

/** İlandaki tüm anlamlı kelimeler TKGM adında geçiyor mu */
function tumTokenlerEslesir(ilanNorm: string, tkgmNorm: string): boolean {
  const tokens = mahalleTokenleri(ilanNorm);
  if (tokens.length === 0) return false;
  return tokens.every((t) => tkgmNorm.includes(t));
}

/**
 * Levenshtein edit mesafesi — max 2 karakter fark toleransı için.
 * DP O(mn) ama yer adları kısa olduğu için sorun değil.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  const cur: number[] = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1]
        ? (prev[j - 1] ?? 0)
        : 1 + Math.min(prev[j - 1] ?? 0, prev[j] ?? 0, cur[j - 1] ?? 0);
    }
    prev.splice(0, prev.length, ...cur);
  }
  return prev[n] ?? 0;
}

/**
 * İki normalize edilmiş yer adının "yeterince benzer" olup olmadığını kontrol eder.
 * 5+ karakter adlar için edit distance ≤ 1 tolerans, kısa adlar için tam eşleşme.
 */
function yerAdiEsleşir(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const minLen = Math.min(a.length, b.length);
  // Kısa adlar (≤4 karakter) sadece exact match — "os" ile "osp" eşleşmesin
  if (minLen <= 4) return a === b;
  // Biri diğerini içeriyor (prefix/suffix varyantlar için)
  if (a.startsWith(b) || b.startsWith(a)) return true;
  // Edit distance toleransı: 5-7 karakter → max 1, 8+ → max 2
  const maxDist = minLen >= 8 ? 2 : 1;
  return levenshtein(a, b) <= maxDist;
}

/**
 * Il + ilçe adından ilçe kodunu döner. IlanKarti mahalle dropdown'u için.
 */
export async function ilceKodunuBul(ilAd: string, ilceAd: string): Promise<number | null> {
  const ilN = normalizeTr(ilAd);
  const iller = await getIlListesi();
  const il =
    iller.find((i) => normalizeTr(i.ad) === ilN) ??
    iller.find((i) => yerAdiEsleşir(normalizeTr(i.ad), ilN));
  if (!il) return null;

  const ilceN = normalizeYerAdi(ilceAd);
  const ilceler = await getIlceListesi(il.kod);
  const ilce =
    ilceler.find((x) => normalizeYerAdi(x.ilceAdi) === ilceN) ??
    ilceler.find((x) => yerAdiEsleşir(normalizeYerAdi(x.ilceAdi), ilceN));
  return ilce?.ilceKodu ?? null;
}

export interface MahalleEslesmesi {
  ilKodu: number;
  ilAd: string;
  ilceKodu: number;
  ilceAd: string;
  mahalleKodu: number;
  mahalleAd: string;
}

export interface MahalleAdayi {
  mahalle: Mahalle;
  /** 0–100 — yüksek = daha güvenilir eşleşme */
  skor: number;
  neden: string;
}

function mahalleAdaySkoru(ilanHam: string, m: Mahalle): MahalleAdayi | null {
  const ilanN = normalizeMahalleAra(ilanHam);
  const tkgmHam = m.mahalleAdi;
  const tkgmN = normalizeMahalleAra(tkgmHam);
  if (!ilanN || !tkgmN) return null;

  if (normalizeTr(tkgmHam) === normalizeTr(ilanHam)) {
    return { mahalle: m, skor: 100, neden: "tam" };
  }
  if (tkgmN === ilanN) {
    return { mahalle: m, skor: 95, neden: "normalize" };
  }
  if (yerAdiEsleşir(tkgmN, ilanN)) {
    return { mahalle: m, skor: 88, neden: "fuzzy" };
  }
  if (tumTokenlerEslesir(ilanHam, tkgmN)) {
    return { mahalle: m, skor: 82, neden: "token" };
  }
  if (tkgmN.length >= 4 && (ilanN.includes(tkgmN) || tkgmN.includes(ilanN))) {
    return { mahalle: m, skor: 72, neden: "icerme" };
  }
  return null;
}

/** En iyi N mahalle adayı (manuel seçim / hata mesajı için) */
export function mahalleAdaylariFromListe(
  mahalleler: Mahalle[],
  mahalleAd: string,
  limit = 5,
): MahalleAdayi[] {
  const adaylar: MahalleAdayi[] = [];
  for (const m of mahalleler) {
    const a = mahalleAdaySkoru(mahalleAd, m);
    if (a) adaylar.push(a);
  }
  adaylar.sort((a, b) => b.skor - a.skor);
  return adaylar.slice(0, limit);
}

/** Önceden çekilmiş mahalle listesinde ilan mahalle adını arar (ağ çağrısı yok). */
export function mahalleEsleFromListe(
  mahalleler: Mahalle[],
  mahalleAd: string,
): Mahalle | null {
  const enIyi = mahalleAdaylariFromListe(mahalleler, mahalleAd, 1)[0];
  // Düşük skorlu "içerme" eşleşmelerini otomatik kabul etme (yanlış ilçe altı riski)
  if (!enIyi || enIyi.skor < 80) return null;
  return enIyi.mahalle;
}

/** İlan koordinatı varsa TKGM mahalle poligonundan kod bulur */
export async function mahalleBulKoordinatla(
  ilceKodu: number,
  lat: number,
  lng: number,
): Promise<Mahalle | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const geometriler = await getMahalleGeometrileri(ilceKodu);
  for (const g of geometriler) {
    if (!g.polygon?.length) continue;
    if (noktaPoligonIcinde(lat, lng, g.polygon)) {
      return {
        mahalleKodu: g.mahalleKodu,
        mahalleAdi: g.mahalleAdi,
        ilceKodu: g.ilceKodu,
      };
    }
  }
  return null;
}

export interface FindMahalleByAdOpts {
  /** İlçe kodu biliniyorsa il+ilçe API turu atlanır */
  ilceKodu?: number;
  /** Mahalle listesi önbellekteyse tek ağ turu (veya sıfır) kalır */
  mahalleler?: Mahalle[];
}

/**
 * İl/ilçe/mahalle adlarından mahalle koduna çevirir.
 * Cascading fetch + fuzzy Turkish name matching.
 */
export async function findMahalleByAd(
  ilAd: string,
  ilceAd: string,
  mahalleAd: string,
  opts: FindMahalleByAdOpts = {},
): Promise<MahalleEslesmesi | null> {
  let il: Il | undefined;
  let ilce: Ilce | undefined;

  if (opts.ilceKodu != null) {
    const ilN = normalizeTr(ilAd);
    const iller = await getIlListesi();
    il =
      iller.find((i) => normalizeTr(i.ad) === ilN) ??
      iller.find((i) => yerAdiEsleşir(normalizeTr(i.ad), ilN));
    const ilceler = il ? await getIlceListesi(il.kod) : [];
    const ilceN = normalizeYerAdi(ilceAd);
    ilce =
      ilceler.find((x) => x.ilceKodu === opts.ilceKodu) ??
      ilceler.find((x) => normalizeYerAdi(x.ilceAdi) === ilceN) ??
      ilceler.find((x) => yerAdiEsleşir(normalizeYerAdi(x.ilceAdi), ilceN)) ??
      ({ ilceKodu: opts.ilceKodu, ilceAdi: ilceAd, ilKodu: il?.kod ?? 0 } satisfies Ilce);
  } else {
    const ilN = normalizeTr(ilAd);
    const iller = await getIlListesi();
    il =
      iller.find((i) => normalizeTr(i.ad) === ilN) ??
      iller.find((i) => yerAdiEsleşir(normalizeTr(i.ad), ilN));
    if (!il) return null;

    const ilceN = normalizeYerAdi(ilceAd);
    const ilceler = await getIlceListesi(il.kod);
    ilce =
      ilceler.find((x) => normalizeYerAdi(x.ilceAdi) === ilceN) ??
      ilceler.find((x) => yerAdiEsleşir(normalizeYerAdi(x.ilceAdi), ilceN));
    if (!ilce) return null;
  }

  const mahalleler =
    opts.mahalleler ?? (await getMahalleListesi(ilce!.ilceKodu));
  const mahalle = mahalleEsleFromListe(mahalleler, mahalleAd);
  if (!mahalle) return null;

  return {
    ilKodu: il?.kod ?? 0,
    ilAd: il?.ad ?? ilAd,
    ilceKodu: ilce!.ilceKodu,
    ilceAd: ilce!.ilceAdi,
    mahalleKodu: mahalle.mahalleKodu,
    mahalleAd: mahalle.mahalleAdi,
  };
}

export interface MahalleGeometri {
  mahalleKodu: number;
  mahalleAdi: string;
  ilceKodu: number;
  /** Polygon outer ring: [[lng, lat], ...] — null ise API geometry dönmedi */
  polygon: number[][] | null;
}

export async function getMahalleGeometrileri(ilceKodu: number): Promise<MahalleGeometri[]> {
  const data = await getJson<{
    features?: Array<{
      properties?: Record<string, unknown>;
      geometry?: { type?: string; coordinates?: unknown };
    }>;
  }>(`${TKGM_API_BASE}/idariYapi/mahalleListe/${ilceKodu}`);

  return (data.features ?? []).map((f) => {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const geom = f.geometry;
    let polygon: number[][] | null = null;
    if (geom?.type === "Polygon" && Array.isArray(geom.coordinates)) {
      polygon = ((geom.coordinates as number[][][])[0]) ?? null;
    } else if (geom?.type === "MultiPolygon" && Array.isArray(geom.coordinates)) {
      polygon = (((geom.coordinates as number[][][][])[0])?.[0]) ?? null;
    }
    return {
      mahalleKodu: Number(p.id),
      mahalleAdi: String(p.text ?? p.mahalleAdi ?? p.ad ?? ""),
      ilceKodu: Number(p.ilceId ?? ilceKodu),
      polygon,
    };
  });
}

/** Ray-casting: nokta [lat,lng]'nin ring [[lng,lat],...] içinde olup olmadığını kontrol eder */
export function noktaPoligonIcinde(lat: number, lng: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!, yi = ring[i]![1]!;
    const xj = ring[j]![0]!, yj = ring[j]![1]!;
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export async function getBagimsizBolumListesi(
  mahalleKodu: number,
  adaNo: number,
  parselNo: number,
  blokNo: string | number,
): Promise<BagimsizBolum[]> {
  const blokEnc = encodeURIComponent(String(blokNo));
  const data = await getJson<{
    type?: string;
    features?: Array<{ properties?: Record<string, unknown> }>;
  }>(
    `${TKGM_API_BASE}/parsel/bagimsizbolum/${mahalleKodu}/${adaNo}/${parselNo}/${blokEnc}`,
  );
  if (data.type !== "FeatureCollection") return [];
  return (data.features ?? []).map((f) => {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    return {
      tip: String(p.tip ?? ""),
      kat: String(p.kat ?? ""),
      giris: String(p.giris ?? ""),
      nitelik: String(p.nitelik ?? ""),
      no: String(p.no ?? ""),
      blok: String(p.blok ?? blokNo),
      durum: String(p.durum ?? ""),
    };
  });
}
