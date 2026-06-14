/**
 * TKGM resmi analiz endpoint'i — parselsorgu.tkgm.gov.tr Analiz tab'ının çağırdığı API.
 * Reverse-engineered 2026-05-02. Auth gerektirmiyor.
 *
 * GET /megsiswebapi.v3.1/api/analiz?AnalizTip={1-5}&Yil={yıl}&IlceId={ilçeKodu}
 *
 * Yanıt: nokta listesi — her nokta = o yıl o parselde gerçekleşen işlem sayısı.
 */

const TKGM_ANALIZ_URL =
  "https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/analiz";

export type AnalizTip = 1 | 2 | 3 | 4 | 5;

export const ANALIZ_TIPI_ETIKETLERI: Record<AnalizTip, string> = {
  1: "Alım Satım Yoğunluğu",
  2: "Ana Taşınmaz Satış",
  3: "Ana Taşınmaz İpotekli Satış",
  4: "Bağımsız Bölüm Satış",
  5: "Bağımsız Bölüm İpotekli Satış",
};

export interface AnalizNoktasi {
  parselId: number;
  enlem: number; // lat
  boylam: number; // lng
  sayi: number; // o yıldaki işlem sayısı
}

export interface AnalizSorgusuParams {
  analizTip: AnalizTip;
  yil: number;
  ilceKodu: number;
}

import { db } from "./db";

// TKGM analiz verisi yavaş değişir (bir ilçenin satış istatistikleri). Agresif cache:
// - Sert TTL 30 gün (cache hit = network yok)
// - Stale eşiği 14 gün (üzeri arkada refresh, kullanıcı bekletmiyoruz)
// TKGM günlük sorgu limitini büyük oranda absorbe eder.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün
const STALE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 gün

// Rate limiter: TKGM IP başına ~100-500 daily limit kullanıyor. Per-second cap ile
// agresif kullanımı engelleriz, fetch'leri smooth dağıtırız. 2 saniyede max 1 fetch.
const RATE_LIMIT_MS = 2000;
let sonNetworkCagrisi = 0;

async function rateLimitWait(): Promise<void> {
  const gecen = Date.now() - sonNetworkCagrisi;
  if (gecen < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - gecen));
  }
  sonNetworkCagrisi = Date.now();
}

// 3 katmanlı cache:
// 1) Memory — instant response (Dexie sorgusu bile yok), tab session boyunca
// 2) Dexie — 7 gün persistent, tab/extension restart sonrası kalıcı
// 3) Network — fetch
// + In-flight dedup: concurrent çağrılar aynı promise'ı paylaşır
// + Stale-while-revalidate: 3+ gün eski cache var → hızla dön + arkada güncelle
const memoryCache = new Map<string, { noktalar: AnalizNoktasi[]; fetchedAt: number }>();
const inflightFetches = new Map<string, Promise<AnalizNoktasi[]>>();

function cacheKey(p: AnalizSorgusuParams): string {
  return `${p.ilceKodu}|${p.analizTip}|${p.yil}`;
}

async function tkgmAnalizFetch(
  params: AnalizSorgusuParams,
  signal?: AbortSignal,
): Promise<AnalizNoktasi[]> {
  // Rate limit: dakikada max 30 çağrı (her 2 saniyede 1)
  await rateLimitWait();
  if (signal?.aborted) throw new Error("aborted");

  const url = `${TKGM_ANALIZ_URL}?AnalizTip=${params.analizTip}&Yil=${params.yil}&IlceId=${params.ilceKodu}`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`TKGM analiz HTTP ${res.status}`);
  const data = (await res.json()) as AnalizNoktasi[];
  const noktalar = Array.isArray(data) ? data : [];

  // Memory + Dexie cache — silent fail, quota error UI'ı bloklamaz
  const fetchedAt = Date.now();
  const key = cacheKey(params);
  memoryCache.set(key, { noktalar, fetchedAt });
  db.tkgmAnalizCache
    .put({
      ilceKodu: params.ilceKodu,
      analizTip: params.analizTip,
      yil: params.yil,
      noktalar,
      fetchedAt,
    })
    .catch(() => {});

  return noktalar;
}

/** In-flight dedup'lı fetch — aynı params'ı concurrent çağıran herkes aynı promise'ı paylaşır */
function tkgmAnalizFetchDedup(
  params: AnalizSorgusuParams,
  signal?: AbortSignal,
): Promise<AnalizNoktasi[]> {
  const key = cacheKey(params);
  const existing = inflightFetches.get(key);
  if (existing) return existing;
  const promise = tkgmAnalizFetch(params, signal).finally(() => {
    inflightFetches.delete(key);
  });
  inflightFetches.set(key, promise);
  return promise;
}

export async function tkgmAnalizGetir(
  params: AnalizSorgusuParams,
  signal?: AbortSignal,
): Promise<AnalizNoktasi[]> {
  const key = cacheKey(params);

  // Layer 1: Memory cache — Dexie sorgusu bile yok, tek pointer lookup
  const memHit = memoryCache.get(key);
  if (memHit && Date.now() - memHit.fetchedAt < CACHE_TTL_MS) {
    // SWR: 3+ gün eskiyse arka planda refresh (kullanıcı taze veriyle bir sonraki sorgusunda buluşacak)
    if (Date.now() - memHit.fetchedAt > STALE_TTL_MS) {
      tkgmAnalizFetchDedup(params).catch(() => {});
    }
    return memHit.noktalar;
  }

  // Layer 2: Dexie cache
  try {
    const cached = await db.tkgmAnalizCache.get([
      params.ilceKodu,
      params.analizTip,
      params.yil,
    ]);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      // Memory'ye warm
      memoryCache.set(key, { noktalar: cached.noktalar, fetchedAt: cached.fetchedAt });
      // SWR refresh
      if (Date.now() - cached.fetchedAt > STALE_TTL_MS) {
        tkgmAnalizFetchDedup(params).catch(() => {});
      }
      return cached.noktalar;
    }
  } catch {
    // Dexie sorunlu → network'e düş
  }

  // Layer 3: Network (in-flight dedup'lı)
  return tkgmAnalizFetchDedup(params, signal);
}

/** Memory cache'i sıfırla — tema değişimi vb. nadir senaryolar için */
export function tkgmAnalizCacheTemizle(): void {
  memoryCache.clear();
}

/**
 * Bir ilçe için son N yıl × M tip kombinasyonunu paralel-throttled prefetch.
 *
 * UYARI: Bu fonksiyon TKGM günlük sorgu limitini hızla tüketir
 * (5 yıl × 5 tip = 25 çağrı per ilçe). Default OFF — sadece kullanıcı
 * Lab içinde manuel "Tümünü prefetch et" derse tetiklenmeli.
 *
 * Default değerler küçültüldü: 2 yıl × 2 tip = 4 çağrı.
 */
export async function prefetchAnalizSerisi(
  ilceKodu: number,
  yilSayisi = 2,
  tipler: AnalizTip[] = [1, 2],
  signal?: AbortSignal,
): Promise<void> {
  // TKGM'de günlük sorgu limiti var. Önce cache'tekiler dolduruldu mu kontrol et,
  // sadece eksik olanları çek; concurrency=1 + 800ms delay ile çok nazik.
  const yilBaslangic = new Date().getFullYear() - 1;
  const yillar = Array.from({ length: yilSayisi }, (_, i) => yilBaslangic - i);

  const queue: AnalizSorgusuParams[] = [];
  for (const yil of yillar) {
    for (const analizTip of tipler) {
      // Cache'te varsa skip
      try {
        const c = await db.tkgmAnalizCache.get([ilceKodu, analizTip, yil]);
        if (c && Date.now() - c.fetchedAt < CACHE_TTL_MS) continue;
      } catch {}
      queue.push({ ilceKodu, analizTip, yil });
    }
  }

  // Tek worker, sakin tempo — limit dolmasın
  for (const params of queue) {
    if (signal?.aborted) return;
    try {
      await tkgmAnalizGetir(params, signal);
    } catch (e) {
      // 403 limit doldu mesajı geldiyse durdurun, daha fazla deneme
      const msg = e instanceof Error ? e.message : String(e);
      if (/limit|günlük/i.test(msg)) {
        console.warn("[arsa] prefetch durdu — TKGM limit:", msg);
        return;
      }
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}

export interface YilOzeti {
  yil: number;
  parselSayisi: number;
  toplamIslem: number;
  ortalamaIslem: number;
}

/** Bir tip için yıl-yıl serisi — sparkline ve bar chart için. */
export async function getYilSerisi(
  ilceKodu: number,
  analizTip: AnalizTip,
  yilBaslangic: number,
  yilBitis: number,
  signal?: AbortSignal,
): Promise<YilOzeti[]> {
  const out: YilOzeti[] = [];
  for (let yil = yilBaslangic; yil <= yilBitis; yil++) {
    if (signal?.aborted) break;
    try {
      const noktalar = await tkgmAnalizGetir({ ilceKodu, analizTip, yil }, signal);
      const toplamIslem = noktalar.reduce((s, n) => s + n.sayi, 0);
      out.push({
        yil,
        parselSayisi: noktalar.length,
        toplamIslem,
        ortalamaIslem:
          noktalar.length > 0 ? Math.round((toplamIslem / noktalar.length) * 10) / 10 : 0,
      });
    } catch {
      out.push({ yil, parselSayisi: 0, toplamIslem: 0, ortalamaIslem: 0 });
    }
  }
  return out;
}

export interface AnalizOzeti {
  toplamNokta: number;
  toplamIslem: number;
  ortalamaIslem: number;
  enYogunNokta: AnalizNoktasi | null;
}

export function analizOzetCikar(noktalar: AnalizNoktasi[]): AnalizOzeti {
  if (noktalar.length === 0) {
    return {
      toplamNokta: 0,
      toplamIslem: 0,
      ortalamaIslem: 0,
      enYogunNokta: null,
    };
  }
  const toplamIslem = noktalar.reduce((s, n) => s + n.sayi, 0);
  const enYogun = noktalar.reduce((m, n) => (n.sayi > m.sayi ? n : m), noktalar[0]!);
  return {
    toplamNokta: noktalar.length,
    toplamIslem,
    ortalamaIslem: Math.round((toplamIslem / noktalar.length) * 10) / 10,
    enYogunNokta: enYogun,
  };
}

/** Yıl seçenekleri — TKGM verisi 2003'ten itibaren mevcut görünüyor. */
export const YIL_SECENEKLERI = (() => {
  const out: number[] = [];
  for (let y = new Date().getFullYear() - 1; y >= 2003; y--) out.push(y);
  return out;
})();
