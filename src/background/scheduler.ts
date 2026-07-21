/**
 * Chrome Alarms — periyodik veri tazeleme.
 *
 * Service worker MV3'te kalıcı çalışmaz; alarms API olayı tetikleyince
 * service worker uyanır, görevi yapar, tekrar uyur.
 *
 * Periyodik görevler:
 *   - bias kalibrasyon: günde 1
 *   - TCMB KFE: günde 1
 *   - validation özet: 12 saatte 1
 *   - radar imar: 14 günde 1 — scrapesiz, yalnız e-Plan proxy
 */

import {
  RADAR_ALARM_PERIYOD_DK,
  radarImarTurunuCalistir,
} from "../lib/degisim-radari";

const ALARM_BIAS = "cadastrum:bias-refresh";
const ALARM_TCMB = "cadastrum:tcmb-refresh";
const ALARM_VALIDATION = "cadastrum:validation-refresh";
/** Güvenli radar — 14 günde bir e-Plan özeti (ilan scrape YOK) */
const ALARM_IMAR_KONTROL = "cadastrum:imar-degisiklik-kontrol";

const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

/** Tüm alarm'ları kayıt et (service worker boot'unda çağrılır). */
export function alarmlariKaydet(): void {
  if (typeof chrome === "undefined" || !chrome?.alarms) return;

  chrome.alarms.create(ALARM_BIAS, {
    delayInMinutes: 5,
    periodInMinutes: 24 * 60,
  });

  chrome.alarms.create(ALARM_TCMB, {
    delayInMinutes: 10,
    periodInMinutes: 24 * 60,
  });

  chrome.alarms.create(ALARM_VALIDATION, {
    delayInMinutes: 15,
    periodInMinutes: 12 * 60,
  });

  chrome.alarms.create(ALARM_IMAR_KONTROL, {
    delayInMinutes: 120,
    periodInMinutes: RADAR_ALARM_PERIYOD_DK,
  });

  console.log("[scheduler] 4 periyodik alarm (radar: 14g scrapesiz)");
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

async function tcmbRefresh(): Promise<void> {
  try {
    const ayarRaw = await chrome.storage.local.get("ayarlar");
    const ayarlar = ayarRaw.ayarlar as { tcmbApiKey?: string } | undefined;
    if (!ayarlar?.tcmbApiKey || ayarlar.tcmbApiKey.length < 10) {
      console.log("[scheduler] TCMB API key yok, refresh atlandı");
      return;
    }
    await chrome.storage.local.remove("tcmbKfeCache");
    console.log("[scheduler] ✓ TCMB cache temizlendi");
  } catch (e) {
    console.warn("[scheduler] tcmb refresh hata:", e);
  }
}

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
 * Güvenli radar — ilan scrape YOK.
 * Yalnızca /v1/proxy/eplan + Dexie izlenen favoriler (max 5, 14g, 5sn ara).
 */
export async function imarDegisiklikKontrol(): Promise<void> {
  try {
    const sonuc = await radarImarTurunuCalistir({ kaynak: "arka-plan", zorla: false });
    if (sonuc.atlandiSebep) {
      console.log(`[scheduler] radar atlandı: ${sonuc.atlandiSebep}`);
      return;
    }
    console.log(
      `[scheduler] ✓ radar scrapesiz: ${sonuc.kontrolEdilen} parsel, ${sonuc.degisiklik} değişiklik`,
    );
  } catch (e) {
    console.warn("[scheduler] radar hata:", e);
  }
}
