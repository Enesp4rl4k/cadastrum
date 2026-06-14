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
 *
 * Not: chrome.alarms minimum periyod 1 dakika (debug için).
 * Production: 12-24 saat.
 */

const ALARM_BIAS = "cadastrum:bias-refresh";
const ALARM_TCMB = "cadastrum:tcmb-refresh";
const ALARM_VALIDATION = "cadastrum:validation-refresh";

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

  console.log("[scheduler] 3 periyodik alarm kayıt edildi");
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
