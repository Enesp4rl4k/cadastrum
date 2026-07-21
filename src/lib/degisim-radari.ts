/**
 * Parsel Değişim Radarı — GÜVENLİ SÜREÇ
 *
 * ============================================================
 * YASAK (bilerek yapılmaz)
 *   - Sahibinden / Hepsiemlak / Emlekjet arka plan scrape
 *   - İlan fiyatını periyodik crawl
 *   - Sık e-Plan poll (saatlik/günlük bot)
 *
 * İZİN VERİLEN
 *   1) Seyrek e-Plan özeti — kendi Workers proxy (/v1/proxy/eplan)
 *      · yalnız Pro + izleme=true
 *      · max RADAR_MAX_IZLEME parsel
 *      · en az RADAR_MIN_ARALIK_MS aralık
 *      · istekler arası RADAR_ISTEK_ARASI_MS
 *   2) Fiyat bandı delta — kullanıcı parseli AÇINCA model yeniden
 *      hesaplanır; snapshot ile karşılaştırılır (ilan scrape yok)
 *   3) Kullanıcı tetikli "Şimdi kontrol et" — aynı proxy, aynı limitler
 * ============================================================
 */

import { db, type FavoriFiyatSnapshot, type FavoriParsel } from "./db";

export const IMAR_DEGISIKLIK_LOG_KEY = "imarDegisiklikLog";
export const RADAR_SON_KONTROL_KEY = "radarSonKontrolAt";

/** Pro hesapta aynı anda izlenebilecek max parsel */
export const RADAR_MAX_IZLEME = 5;
/** İki arka plan turu arası minimum süre (14 gün) */
export const RADAR_MIN_ARALIK_MS = 14 * 24 * 60 * 60 * 1000;
/** e-Plan istekleri arası bekleme */
export const RADAR_ISTEK_ARASI_MS = 5_000;
/** Alarm periyodu (chrome.alarms) — dakikada; 14 gün */
export const RADAR_ALARM_PERIYOD_DK = 14 * 24 * 60;

export interface ImarDegisiklikLogKayit {
  ts: number;
  mesaj: string;
  adaNo?: number;
  parselNo?: number;
  onceki?: string;
  yeni?: string;
  kaynak?: "arka-plan" | "manuel";
}

export async function imarDegisiklikLogOku(): Promise<ImarDegisiklikLogKayit[]> {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return [];
  const raw = await chrome.storage.local.get(IMAR_DEGISIKLIK_LOG_KEY);
  return (raw[IMAR_DEGISIKLIK_LOG_KEY] as ImarDegisiklikLogKayit[] | undefined) ?? [];
}

export async function radarSonKontrolOku(): Promise<number | null> {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return null;
  const raw = await chrome.storage.local.get(RADAR_SON_KONTROL_KEY);
  const v = raw[RADAR_SON_KONTROL_KEY];
  return typeof v === "number" ? v : null;
}

export async function radarSonKontrolYaz(ts: number = Date.now()): Promise<void> {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return;
  await chrome.storage.local.set({ [RADAR_SON_KONTROL_KEY]: ts });
}

/** Arka plan turu için yeterli zaman geçti mi? */
export async function radarTurIzinliMi(): Promise<boolean> {
  const son = await radarSonKontrolOku();
  if (son == null) return true;
  return Date.now() - son >= RADAR_MIN_ARALIK_MS;
}

export async function izlenenFavoriSayisi(): Promise<number> {
  const tum = await db.favoriler.toArray();
  return tum.filter((f) => f.izleme === true).length;
}

/**
 * İzleme aç/kapa. Açarken RADAR_MAX_IZLEME aşılırsa hata fırlatır.
 * Scraping yok — sadece Dexie flag.
 */
export async function favoriIzlemeAyarla(
  id: number,
  izleme: boolean,
  fiyatSnapshot?: FavoriFiyatSnapshot | null,
): Promise<void> {
  if (izleme) {
    const mevcut = await db.favoriler.get(id);
    const zatenAcik = mevcut?.izleme === true;
    if (!zatenAcik) {
      const adet = await izlenenFavoriSayisi();
      if (adet >= RADAR_MAX_IZLEME) {
        throw new Error(
          `En fazla ${RADAR_MAX_IZLEME} parsel izlenebilir (güvenli limit). Başka birini kapatın.`,
        );
      }
    }
  }
  const patch: Partial<FavoriParsel> = { izleme };
  if (izleme && fiyatSnapshot) {
    patch.fiyatSnapshot = fiyatSnapshot;
  }
  await db.favoriler.update(id, patch);
}

export async function favoriFiyatSnapshotYaz(
  id: number,
  snapshot: FavoriFiyatSnapshot,
): Promise<void> {
  await db.favoriler.update(id, { fiyatSnapshot: snapshot });
}

/** Ada/parsel ile eşleşen favoriyi bul (en son eklenen). */
export async function favoriParselBul(
  adaNo: number,
  parselNo: number,
  mahalleKodu?: number | null,
): Promise<FavoriParsel | undefined> {
  const adaylar = await db.favoriler
    .where("[adaNo+parselNo]")
    .equals([adaNo, parselNo])
    .toArray();
  if (adaylar.length === 0) return undefined;
  if (mahalleKodu != null && mahalleKodu > 0) {
    const tam = adaylar.filter((f) => f.mahalleKodu === mahalleKodu);
    if (tam.length > 0) {
      return tam.sort((a, b) => b.eklenmeTarihi - a.eklenmeTarihi)[0];
    }
  }
  return adaylar.sort((a, b) => b.eklenmeTarihi - a.eklenmeTarihi)[0];
}

/** Snapshot vs güncel beklenen — yüzde fark (pozitif = yükseldi). */
export function fiyatSnapshotDeltaYuzde(
  snapshot: FavoriFiyatSnapshot,
  guncelBeklenenPerM2: number,
): number | null {
  if (!snapshot.beklenenPerM2 || snapshot.beklenenPerM2 <= 0) return null;
  if (!guncelBeklenenPerM2 || guncelBeklenenPerM2 <= 0) return null;
  return Math.round(
    ((guncelBeklenenPerM2 - snapshot.beklenenPerM2) / snapshot.beklenenPerM2) * 1000,
  ) / 10;
}

/** Kullanıcıya gösterilen güvenli süreç özeti */
export const RADAR_POLITIKA_OZET =
  "İlan sitesi scrape edilmez. Yalnızca seyrek e-Plan özeti (kendi proxy) + siz parseli açınca fiyat bandı karşılaştırması.";

const IMAR_SNAPSHOT_PREFIX = "imarSnapshot:";
const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

export interface RadarTurSonuc {
  kontrolEdilen: number;
  degisiklik: number;
  atlandiSebep?: string;
}

/**
 * Güvenli imar turu — scrape yok.
 * @param zorla true ise 14 gün kilidini aş (manuel buton); yine max 5 + rate limit
 */
export async function radarImarTurunuCalistir(opts: {
  zorla?: boolean;
  kaynak: "arka-plan" | "manuel";
}): Promise<RadarTurSonuc> {
  if (!opts.zorla) {
    const izin = await radarTurIzinliMi();
    if (!izin) {
      return { kontrolEdilen: 0, degisiklik: 0, atlandiSebep: "min-aralik" };
    }
  }

  const tumFavoriler = await db.favoriler.toArray();
  const favoriler = tumFavoriler
    .filter(
      (f) =>
        f.izleme === true &&
        f.mahalleKodu > 0 &&
        f.adaNo > 0 &&
        f.parselNo > 0 &&
        f.parsel?.ilceKodu != null &&
        f.parsel.ilceKodu > 0,
    )
    .sort((a, b) => b.eklenmeTarihi - a.eklenmeTarihi)
    .slice(0, RADAR_MAX_IZLEME);

  if (favoriler.length === 0) {
    return { kontrolEdilen: 0, degisiklik: 0, atlandiSebep: "izlenen-yok" };
  }

  let degisiklikAdet = 0;
  const PROXY_BASE = `${API_BASE}/proxy/eplan`;

  for (const fav of favoriler) {
    const ilceKodu = fav.parsel.ilceKodu!;
    try {
      const url =
        `${PROXY_BASE}?ilceKodu=${ilceKodu}&mahalleKodu=${fav.mahalleKodu}` +
        `&adaNo=${fav.adaNo}&parselNo=${fav.parselNo}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) continue;

      const ePlanData = (await res.json()) as {
        kullanimKarari?: string;
        taks?: number;
        emsal?: number;
        maksKat?: number;
      };

      const yeniOzet = JSON.stringify({
        k: ePlanData.kullanimKarari ?? null,
        t: ePlanData.taks ?? null,
        e: ePlanData.emsal ?? null,
        m: ePlanData.maksKat ?? null,
      });

      const snapshotKey =
        `${IMAR_SNAPSHOT_PREFIX}${fav.mahalleKodu}:${fav.adaNo}:${fav.parselNo}`;
      const oncekiRaw = await chrome.storage.local.get(snapshotKey);
      const oncekiOzet = (oncekiRaw[snapshotKey] as string | undefined) ?? null;

      if (oncekiOzet === null) {
        await chrome.storage.local.set({ [snapshotKey]: yeniOzet });
      } else if (oncekiOzet !== yeniOzet) {
        degisiklikAdet++;
        await chrome.storage.local.set({ [snapshotKey]: yeniOzet });

        const lokasyon = [fav.mahalleAd, fav.ilceAd, fav.ilAd].filter(Boolean).join(", ");
        const mesaj =
          `${lokasyon || `Ada ${fav.adaNo}/${fav.parselNo}`} · Ada ${fav.adaNo}/${fav.parselNo} imar güncellendi.`;

        if (typeof chrome !== "undefined" && chrome.notifications) {
          chrome.notifications.create(`imar-degisiklik-${fav.adaNo}-${fav.parselNo}`, {
            type: "basic",
            iconUrl: "public/icon-48.png",
            title: "İmar Değişikliği Tespit Edildi",
            message: mesaj,
          });
        }

        const logRaw = await chrome.storage.local.get(IMAR_DEGISIKLIK_LOG_KEY);
        const log =
          (logRaw[IMAR_DEGISIKLIK_LOG_KEY] as ImarDegisiklikLogKayit[] | undefined) ?? [];
        log.unshift({
          ts: Date.now(),
          mesaj,
          adaNo: fav.adaNo,
          parselNo: fav.parselNo,
          onceki: oncekiOzet,
          yeni: yeniOzet,
          kaynak: opts.kaynak,
        });
        await chrome.storage.local.set({
          [IMAR_DEGISIKLIK_LOG_KEY]: log.slice(0, 20),
        });
      }

      await new Promise((r) => setTimeout(r, RADAR_ISTEK_ARASI_MS));
    } catch {
      /* tek parsel hatası — devam */
    }
  }

  await radarSonKontrolYaz(Date.now());
  return { kontrolEdilen: favoriler.length, degisiklik: degisiklikAdet };
}
