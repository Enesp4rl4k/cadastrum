import type { IlanBilgisi } from "../types/ilan";
import { alarmlariKaydet, alarmIsle } from "./scheduler";
import { SCRAPING_ENABLED } from "../lib/build-flags";
import { getMahalleMerkez } from "../lib/data/mahalle-merkezleri";
import { telemetriKur } from "../lib/telemetri";

const scrapingMod = SCRAPING_ENABLED
  ? await import("./scraping-runtime")
  : null;

telemetriKur("service-worker");

const BACKEND_API = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

/** Bir ilanı backend'e POST et — opt-in kontrolü ayarlardan, default true.
 *  Fire-and-forget, hata yutulur. Privacy: ilan_no, fiyat, konum — kişisel veri yok.
 *  force=true ise telemetri ayarını atla (admin bootstrap akışı için). */
async function backendIlanGonder(ilan: IlanBilgisi, force = false): Promise<void> {
  try {
    if (!force) {
      const ayar = await chrome.storage.local.get("backendTelemetri");
      if (ayar.backendTelemetri === false) return;
    }

    if (!ilan.ilanNo || !ilan.il || !ilan.ilce || !ilan.fiyat || !ilan.m2) return;
    const fiyatPerM2 = ilan.fiyat / ilan.m2;
    if (fiyatPerM2 <= 0 || fiyatPerM2 > 10_000_000) return;

    const baslik = (ilan.baslik ?? "").toLocaleLowerCase("tr");
    let kategori = "arsa";
    if (/tarla/.test(baslik)) kategori = "tarla";
    else if (/bahçe|bahce/.test(baslik)) kategori = "bahce";
    else if (/zeytin/.test(baslik)) kategori = "zeytinlik";
    else if (/villa|müstakil|mustakil|daire|apartman|ev|konut|kiraz/.test(baslik)) kategori = "konut";

    let lat = ilan.lat ?? undefined;
    let lng = ilan.lng ?? undefined;
    let koordKaynagi = ilan.koordKaynagi ?? undefined;
    if (lat == null || lng == null) {
      const merkez = getMahalleMerkez(ilan.il, ilan.ilce, ilan.mahalle);
      if (merkez) {
        lat = merkez.lat;
        lng = merkez.lng;
        koordKaynagi = "mahalle-merkez";
      }
    }

    await fetch(`${BACKEND_API}/ilan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kaynak: "extension",
        ilan_no: ilan.ilanNo,
        il: ilan.il,
        ilce: ilan.ilce,
        mahalle: ilan.mahalle ?? undefined,
        fiyat_per_m2: Math.round(fiyatPerM2),
        m2: ilan.m2,
        kategori,
        imar_durumu: ilan.imarDurumu ?? undefined,
        para_birimi: ilan.paraBirimi ?? "TL",
        lat,
        lng,
        koord_kaynagi: koordKaynagi,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Sessizce yok say
  }
}

// ----- DNR DYNAMIC RULES (static rules yedek) ----------------------------
const ORIGIN_STRIP_HEADERS: chrome.declarativeNetRequest.ModifyHeaderInfo[] = [
  { header: "Origin", operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
  { header: "Sec-Fetch-Site", operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
  { header: "Sec-Fetch-Mode", operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
  { header: "Sec-Fetch-Dest", operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
  { header: "sec-ch-ua", operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
  { header: "sec-ch-ua-mobile", operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
  { header: "sec-ch-ua-platform", operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
];

function dnrRule(
  id: number,
  hostFilter: string,
  refererSet?: string,
): chrome.declarativeNetRequest.Rule {
  const headers = [...ORIGIN_STRIP_HEADERS];
  if (refererSet) {
    headers.unshift({
      header: "Referer",
      operation: chrome.declarativeNetRequest.HeaderOperation.SET,
      value: refererSet,
    });
  } else {
    headers.unshift({
      header: "Referer",
      operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
    });
  }
  return {
    id,
    priority: 1,
    action: {
      type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
      requestHeaders: headers,
    },
    condition: {
      urlFilter: hostFilter,
      resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST],
    },
  };
}

const DYNAMIC_RULES: chrome.declarativeNetRequest.Rule[] = [
  dnrRule(1001, "||cbsapi.tkgm.gov.tr/", "https://parselsorgu.tkgm.gov.tr/"),
  dnrRule(1002, "||parselsorgu.tkgm.gov.tr/", "https://parselsorgu.tkgm.gov.tr/"),
  dnrRule(1009, "||eplan.csb.gov.tr/", "https://eplan.csb.gov.tr/e-plan/html/imarDurumu.html"),
  dnrRule(1003, "||overpass-api.de/"),
  dnrRule(1004, "||nominatim.openstreetmap.org/"),
  dnrRule(1005, "||api.open-meteo.com/"),
  dnrRule(1006, "||overpass.private.coffee/"),
  dnrRule(1007, "||overpass.osm.ch/"),
  dnrRule(1008, "||lz4.overpass-api.de/"),
];

const EPLAN_ORIGIN = "https://eplan.csb.gov.tr";
const EPLAN_REFERER = `${EPLAN_ORIGIN}/e-plan/html/imarDurumu.html`;
let eplanGuestLoggedIn = false;
let eplanGuestLoginPromise: Promise<boolean> | null = null;

function eplanGuestSifirla() {
  eplanGuestLoggedIn = false;
  eplanGuestLoginPromise = null;
}

async function ensureEplanGuestSession(): Promise<boolean> {
  if (eplanGuestLoggedIn) return true;
  if (eplanGuestLoginPromise) return eplanGuestLoginPromise;

  eplanGuestLoginPromise = (async () => {
    const url = `${EPLAN_ORIGIN}/fSession/loginAsGuest?preventCache=${Date.now()}`;
    const r = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        Origin: EPLAN_ORIGIN,
        Referer: EPLAN_REFERER,
      },
    });
    eplanGuestLoggedIn = r.ok;
    return r.ok;
  })();

  try {
    return await eplanGuestLoginPromise;
  } finally {
    eplanGuestLoginPromise = null;
  }
}

async function dnrAyarla() {
  try {
    const mevcut = await chrome.declarativeNetRequest.getDynamicRules();
    const silinecek = mevcut.map((r) => r.id);
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: silinecek,
      addRules: DYNAMIC_RULES,
    });
    console.log(
      "[arsa] DNR dynamic rules aktif — TKGM Origin/Referer set",
      DYNAMIC_RULES.length,
    );
  } catch (err) {
    console.error("[arsa] DNR setup başarısız:", err);
  }
}

chrome.runtime.onInstalled.addListener(dnrAyarla);
chrome.runtime.onStartup.addListener(dnrAyarla);
dnrAyarla();

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error("[arsa] sidePanel.setPanelBehavior:", err));

const PROXY_ALLOWED_HOSTS = new Set([
  "cbsapi.tkgm.gov.tr",
  "parselsorgu.tkgm.gov.tr",
  "e-plan.gov.tr",
  "eplan.csb.gov.tr",
]);

function senderGuvenilirMi(sender: chrome.runtime.MessageSender): boolean {
  const senderUrl = sender.url ?? "";
  if (sender.id && sender.id === chrome.runtime.id) return true;
  if (senderUrl.startsWith(`chrome-extension://${chrome.runtime.id}/`)) return true;
  return false;
}

function proxyUrlIzinliMi(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") return false;
    return PROXY_ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (scrapingMod) {
    const scrapingSonuc = scrapingMod.handleScrapingMessage(
      msg,
      sender,
      sendResponse,
      { backendIlanGonder },
    );
    if (scrapingSonuc !== undefined) return scrapingSonuc;
  }

  if (msg?.tip === "tkgm-fetch" && typeof msg.url === "string") {
    if (!senderGuvenilirMi(sender) || !proxyUrlIzinliMi(msg.url)) {
      sendResponse({ ok: false, status: 403, error: "Unauthorized proxy request" });
      return false;
    }
    console.log("[arsa-fetch] →", msg.url);
    fetch(msg.url, { headers: { Accept: "application/json" } })
      .then(async (r) => {
        const text = await r.text();
        console.log(
          "[arsa-fetch] ←",
          r.status,
          msg.url.slice(-50),
          text.slice(0, 120),
        );
        return { ok: r.ok, status: r.status, text };
      })
      .then((d) => sendResponse(d))
      .catch((e) => {
        console.error("[arsa-fetch] ✗", msg.url, e);
        sendResponse({ ok: false, status: 0, error: String(e) });
      });
    return true;
  }

  if (msg?.tip === "eplan-reset-guest") {
    eplanGuestSifirla();
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.tip === "eplan-fetch" && typeof msg.url === "string") {
    if (!senderGuvenilirMi(sender) || !proxyUrlIzinliMi(msg.url)) {
      sendResponse({ ok: false, status: 403, error: "Unauthorized proxy request" });
      return false;
    }
    console.log("[eplan-fetch] →", msg.url);
    void (async () => {
      try {
        const isLogin = msg.url.includes("loginAsGuest");
        if (!isLogin) {
          const loggedIn = await ensureEplanGuestSession();
          if (!loggedIn) {
            sendResponse({ ok: false, status: 401, text: "", error: "Guest login failed" });
            return;
          }
        }
        const raw = (msg.options ?? {}) as RequestInit;
        const headers = new Headers(raw.headers as HeadersInit | undefined);
        if (!headers.has("Origin")) headers.set("Origin", EPLAN_ORIGIN);
        if (!headers.has("Referer")) headers.set("Referer", EPLAN_REFERER);
        headers.delete("Cookie");

        const r = await fetch(msg.url, {
          ...raw,
          headers,
          credentials: "include",
        });
        if (r.status === 401) eplanGuestSifirla();

        const text = await r.text();
        console.log("[eplan-fetch] ←", r.status, msg.url.slice(-50), text.slice(0, 120));
        sendResponse({ ok: r.ok, status: r.status, text });
      } catch (e) {
        const mesaj = e instanceof Error ? e.message : String(e);
        if (/Failed to fetch|NetworkError/i.test(mesaj)) {
          console.warn("[eplan-fetch] e-plan ulaşılamıyor (fallback'e düşülüyor):", msg.url);
        } else {
          console.error("[eplan-fetch] ✗", msg.url, e);
        }
        sendResponse({ ok: false, status: 0, error: String(e) });
      }
    })();
    return true;
  }

  if (msg?.tip === "ilan-tespit" && msg.ilan) {
    const ilan = msg.ilan as IlanBilgisi;
    chrome.storage.session
      .set({ sonIlan: ilan })
      .then(async () => {
        if (sender?.tab?.windowId) {
          try {
            await chrome.sidePanel.open({ windowId: sender.tab.windowId });
          } catch (e) {
            console.warn("[arsa] sidePanel.open hatası:", e);
          }
        }

        const bootstrapAkisi = scrapingMod?.bootstrapAkisiMi(ilan.ilanNo ?? undefined) ?? false;
        backendIlanGonder(ilan, bootstrapAkisi).catch(() => {});

        if (bootstrapAkisi && scrapingMod) {
          scrapingMod.bootstrapIlanTespitTamamla(ilan);
        }

        sendResponse({ ok: true });
      })
      .catch((e) => sendResponse({ ok: false, hata: String(e) }));
    return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "arsa-query-here",
    title: "Bu noktayı TKGM'de sorgula",
    contexts: ["page", "link"],
    documentUrlPatterns: [
      "https://atlas.tkgm.gov.tr/*",
      "https://parselsorgu.tkgm.gov.tr/*",
    ],
  });
  alarmlariKaydet();
});

chrome.runtime.onStartup.addListener(() => {
  alarmlariKaydet();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  alarmIsle(alarm).catch(e => console.error("[alarm] hata:", e));
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "arsa-query-here" || !tab?.windowId) return;
  chrome.sidePanel.open({ windowId: tab.windowId });
});
