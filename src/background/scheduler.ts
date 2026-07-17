/**
 * Chrome Alarms — periyodik veri tazeleme.
 *
 * Service worker MV3'te kalıcı çalışmaz; alarms API olayı tetikleyince
 * service worker uyanır, görevi yapar, tekrar uyur.
 *
 * Periyodik görevler:
 *   - bias kalibrasyon: günde 1 (backend'den ilçe bazlı düzeltme tablosu)
 *   - TCMB KFE: günde 1 (kullanıcı API key girdiyse)
 *   - validation özet: 12 saatte 1 (sistem sağlığı dashboard cache)
 *   - imar değişiklik kontrolü: 7 günde 1 (favori parseller e-Plan sorgu)  [W2]
 *
 * Not: chrome.alarms minimum periyod 1 dakika (debug için).
 * Production: 12-24 saat.
 */

const ALARM_BIAS = "cadastrum:bias-refresh";
const ALARM_TCMB = "cadastrum:tcmb-refresh";
const ALARM_VALIDATION = "cadastrum:validation-refresh";
/** W2 — İmar değişikliği kontrolü: 7 günde bir favori parselleri kontrol et */
const ALARM_IMAR_KONTROL = "cadastrum:imar-degisiklik-kontrol";
/** İmar snapshot storage key — parsel başına son bilinen imar özeti */
const IMAR_SNAPSHOT_PREFIX = "imarSnapshot:";

const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

/** Tüm alarm'ları kayıt et (service worker boot'unda çağrılır). */
export function alarmlariKaydet(): void {
  if (typeof chrome === "undefined" || !chrome?.alarms) return;

  // Bias kalibrasyon: 24 saatte bir
  chrome.alarms.create(ALARM_BIAS, {
    delayInMinutes: 5, // ilk 5 dakika sonra
    periodInMinutes: 24 * 60, // 24 saat
  });

  // TCMB KFE: 24 saatte bir
  chrome.alarms.create(ALARM_TCMB, {
    delayInMinutes: 10,
    periodInMinutes: 24 * 60,
  });

  // Validation özet: 12 saatte bir
  chrome.alarms.create(ALARM_VALIDATION, {
    delayInMinutes: 15,
    periodInMinutes: 12 * 60,
  });

  // W2 — İmar değişiklik kontrolü: 7 günde bir (168 saat)
  chrome.alarms.create(ALARM_IMAR_KONTROL, {
    delayInMinutes: 60, // ilk kontrol 1 saat sonra
    periodInMinutes: 7 * 24 * 60, // 7 gün
  });

  console.log("[scheduler] 4 periyodik alarm kayıt edildi");
}

/** Alarm tetiklendiğinde işlenir (service-worker'dan çağrılır) */
export async function alarmIsle(alarm: chrome.alarms.Alarm): Promise<void> {
  console.log(`[scheduler] alarm: ${alarm.name}`);

  if (alarm.name === ALARM_BIAS) {
    await biasKalibrasyonRefresh();
  } else if (alarm.name === ALARM_TCMB) {
    await tcmbRefresh();
  } else if (alarm.name === ALARM_VALIDATION) {
    await validationOzetRefresh();
  } else if (alarm.name === ALARM_IMAR_KONTROL) {
    await imarDegisiklikKontrol();
  }
}

/**
 * Bias kalibrasyon tablosunu backend'den çek + chrome.storage.local'e yaz.
 * extension'ın bias-kalibrasyon.ts modülü bu cache'den okuyor.
 */
async function biasKalibrasyonRefresh(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/validation/bias`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`[scheduler] bias HTTP ${res.status}`);
      return;
    }
    const veri = await res.json();
    await chrome.storage.local.set({
      biasKalibrasyonCache: { veri, cachedAt: Date.now() },
    });
    console.log(`[scheduler] ✓ bias refresh: ${veri.tabloAdet ?? 0} ilçe`);
  } catch (e) {
    console.warn("[scheduler] bias refresh hata:", e);
  }
}

/**
 * TCMB KFE cache yenile — sadece kullanıcı API key girdiyse.
 */
async function tcmbRefresh(): Promise<void> {
  try {
    const ayarRaw = await chrome.storage.local.get("ayarlar");
    const ayarlar = ayarRaw.ayarlar as { tcmbApiKey?: string } | undefined;
    if (!ayarlar?.tcmbApiKey || ayarlar.tcmbApiKey.length < 10) {
      console.log("[scheduler] TCMB API key yok, refresh atlandı");
      return;
    }
    // Cache'i sil → bir sonraki sorgu fresh fetch yapsın
    await chrome.storage.local.remove("tcmbKfeCache");
    console.log("[scheduler] ✓ TCMB cache temizlendi");
  } catch (e) {
    console.warn("[scheduler] tcmb refresh hata:", e);
  }
}

/**
 * Sistem sağlığı dashboard için validation özet cache.
 */
async function validationOzetRefresh(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/validation/public`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return;
    const veri = await res.json();
    await chrome.storage.local.set({
      validationOzetCache: { veri, cachedAt: Date.now() },
    });
    console.log("[scheduler] ✓ validation özet refresh");
  } catch (e) {
    console.warn("[scheduler] validation refresh hata:", e);
  }
}

/**
 * W2 — İmar değişikliği alarm kontrolü.
 *
 * Favori parseller için e-Plan'ı sorgular. Son bilinen imar özeti ile
 * karşılaştırır; farklılık varsa Chrome notification + storage kaydı.
 *
 * Kapsam: mahalleKodu + adaNo + parselNo olan favori parseller.
 * e-Plan proxy: backend /v1/proxy/eplan endpoint'i.
 */
async function imarDegisiklikKontrol(): Promise<void> {
  try {
    const favorilerRaw = await chrome.storage.local.get("favoriler_v1");
    const favoriler = (favorilerRaw.favoriler_v1 as Array<{
      mahalleKodu: number;
      adaNo: number;
      parselNo: number;
      ilAd?: string;
      ilceAd?: string;
      mahalleAd?: string;
      parsel?: { ilceKodu?: number | null };
    }> | undefined) ?? [];

    if (favoriler.length === 0) return;

    let degisiklikAdet = 0;
    const PROXY_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1/proxy/eplan";

    // Max 10 favori — 429 riski ve alarmlarda süre sınırı
    const kontrolEdilecek = favoriler.slice(0, 10);

    for (const fav of kontrolEdilecek) {
      if (!fav.mahalleKodu || !fav.adaNo || !fav.parselNo) continue;

      // e-Plan için ilceKodu lazım — parsel içinde varsa kullan
      const ilceKodu = fav.parsel?.ilceKodu;
      if (!ilceKodu) continue;

      try {
        const url = `${PROXY_BASE}?ilceKodu=${ilceKodu}&mahalleKodu=${fav.mahalleKodu}&adaNo=${fav.adaNo}&parselNo=${fav.parselNo}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
        if (!res.ok) continue;

        const ePlanData = await res.json() as { kullanimKarari?: string; taks?: number; emsal?: number; maksKat?: number };

        // Özet: kullanım kararı + TAKS + emsal (değişim tespiti için)
        const yeniOzet = JSON.stringify({
          k: ePlanData.kullanimKarari ?? null,
          t: ePlanData.taks ?? null,
          e: ePlanData.emsal ?? null,
          m: ePlanData.maksKat ?? null,
        });

        const snapshotKey = `${IMAR_SNAPSHOT_PREFIX}${fav.mahalleKodu}:${fav.adaNo}:${fav.parselNo}`;
        const oncekiRaw = await chrome.storage.local.get(snapshotKey);
        const oncekiOzet = (oncekiRaw[snapshotKey] as string | undefined) ?? null;

        if (oncekiOzet === null) {
          // İlk kontrol — baseline kaydet, bildirim yok
          await chrome.storage.local.set({ [snapshotKey]: yeniOzet });
        } else if (oncekiOzet !== yeniOzet) {
          // İmar değişti!
          degisiklikAdet++;
          await chrome.storage.local.set({ [snapshotKey]: yeniOzet });

          const lokasyon = [fav.mahalleAd, fav.ilceAd, fav.ilAd].filter(Boolean).join(", ");
          const baslik = `İmar Değişikliği Tespit Edildi`;
          const mesaj = `${lokasyon || `Ada ${fav.adaNo} / Parsel ${fav.parselNo}`} için imar bilgisi güncellendi.`;

          // Chrome notification
          if (chrome.notifications) {
            chrome.notifications.create(`imar-degisiklik-${fav.adaNo}-${fav.parselNo}`, {
              type: "basic",
              iconUrl: "public/icon-48.png",
              title: baslik,
              message: mesaj,
            });
          }

          // Storage'a log yaz — kullanıcı panel açınca görsün
          const logKey = "imarDegisiklikLog";
          const logRaw = await chrome.storage.local.get(logKey);
          const log = (logRaw[logKey] as Array<{ ts: number; mesaj: string }> | undefined) ?? [];
          log.unshift({ ts: Date.now(), mesaj });
          // Son 20 kayıt
          await chrome.storage.local.set({ [logKey]: log.slice(0, 20) });
        }

        // Rate limit — her parsel arası 2 saniye
        await new Promise((r) => setTimeout(r, 2_000));
      } catch {
        // Bu parsel için hata — sessizce geç
      }
    }

    console.log(`[scheduler] ✓ imar kontrol: ${kontrolEdilecek.length} parsel, ${degisiklikAdet} değişiklik`);
  } catch (e) {
    console.warn("[scheduler] imar kontrol hata:", e);
  }
}


