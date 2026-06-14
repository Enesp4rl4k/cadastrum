import type { IlanBilgisi } from "../types/ilan";
import { alarmlariKaydet, alarmIsle } from "./scheduler";
import {
  bootstrapHedefler,
  type BootstrapAyar,
  type BootstrapDurum,
} from "../lib/sahibinden-bootstrap";
// Statik import'lar — Vite'ın preload-helper'ı (document.createElement) SW'de
// çalışmaz, bu yüzden dynamic `await import(...)` yerine top-level kullanıyoruz.
import { decodeJwt } from "../lib/jwt-decode";
import { getMahalleMerkez } from "../lib/data/mahalle-merkezleri";
import {
  detayKuyrugaToplaEkle,
  detayZenginlestirmeBaslat,
  detayZenginlestirmeDurdur,
  detayDurumGetir,
  detaySayilariniGuncelle,
  detayKuyruguTemizle,
} from "../lib/detay-zenginlestirme";

// ── Bootstrap state — admin-only Sahibinden tarama ──────────────────
let bootstrapDurum: BootstrapDurum = {
  calisiyor: false,
  toplamSayfa: 0,
  islenenSayfa: 0,
  hataAdet: 0,
  botEngelAdet: 0,
  sonIlce: null,
  baslangic: 0,
};
let bootstrapDurAkBayrak = false;

function bootstrapDurAk() {
  bootstrapDurAkBayrak = true;
}

async function bootstrapBaslat(ayar: BootstrapAyar): Promise<{ baslatildi: boolean; toplam: number }> {
  if (bootstrapDurum.calisiyor) {
    return { baslatildi: false, toplam: bootstrapDurum.toplamSayfa };
  }
  const hedefler = bootstrapHedefler(ayar);
  bootstrapDurum = {
    calisiyor: true,
    toplamSayfa: hedefler.length,
    islenenSayfa: 0,
    hataAdet: 0,
    botEngelAdet: 0,
    sonIlce: null,
    baslangic: Date.now(),
  };
  bootstrapDurAkBayrak = false;

  // Asenkron arka plan döngüsü — sendResponse anında dön, ilerleyiş sidepanel polling ile
  (async () => {
    for (const h of hedefler) {
      if (bootstrapDurAkBayrak) {
        console.log("[bootstrap] kullanıcı durdurdu");
        break;
      }
      try {
        bootstrapDurum.sonIlce = `${h.ilce.il}/${h.ilce.ilce} (${h.kategori})`;
        const tabId = await tabAcKapat(h.url, ayar.bekleMs ?? 4000);
        if (tabId === -1) bootstrapDurum.botEngelAdet++;
      } catch (e) {
        console.warn("[bootstrap] hata:", e);
        bootstrapDurum.hataAdet++;
      }
      bootstrapDurum.islenenSayfa++;
      // Sayfa arası bekleme — insan-tempo'su
      await yatJitter(ayar.rateMs ?? 6000);
    }
    bootstrapDurum.calisiyor = false;
    console.log("[bootstrap] ✓ tamamlandı", bootstrapDurum);
  })().catch((e) => {
    console.error("[bootstrap] döngü hatası:", e);
    bootstrapDurum.calisiyor = false;
  });

  return { baslatildi: true, toplam: hedefler.length };
}

/**
 * Bot engeli/captcha tespit edilirse `true` döner ve caller backoff uygular.
 * PerimeterX, Sahibinden robot doğrulama sayfaları title ve body içeriğinden
 * tespit edilir.
 */
async function botEngeliMi(tabId: number): Promise<boolean> {
  try {
    const r = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        title: document.title,
        snippet: (document.body?.textContent ?? "").slice(0, 400),
      }),
    });
    const data = r?.[0]?.result as { title: string; snippet: string } | undefined;
    if (!data) return false;
    const metin = `${data.title} ${data.snippet}`.toLocaleLowerCase("tr");
    return (
      /robot doğrulamas|robot dogrulama|access denied|captcha|press &.*hold|are you a robot|please verify/i.test(metin) ||
      /perimeterx|px-captcha|cf-browser/i.test(metin)
    );
  } catch {
    return false;
  }
}

async function tabAcKapat(url: string, bekleMs: number): Promise<number> {
  const tab = await chrome.tabs.create({ url, active: false });
  if (!tab.id) return -1;
  const tabId = tab.id;
  try {
    // Sayfanın DOM yüklenmesi için kısa bekle
    await new Promise((r) => setTimeout(r, Math.max(2500, bekleMs / 2)));

    // Bot engeli tespiti — content script execute etmeden önce
    if (await botEngeliMi(tabId)) {
      console.warn("[bootstrap] bot engeli tespit edildi — 60sn backoff");
      // Caller'a -1 dönerek bot engel sayacını artır
      try { await chrome.tabs.remove(tabId); } catch {}
      await new Promise((r) => setTimeout(r, 60_000));
      return -1;
    }

    // LINK-ONLY MODE — Sahibinden 2026 DOM'unda kart bazlı fiyat/m² parse'ı
    // istikrarsız (her layout değişiminde regex kırılıyor). Onun yerine sadece
    // ilan link'lerini topla → detay zenginleştirme kuyruğuna ekle. Detay
    // sayfası açıldığında sahibinden.ts content script'i tüm alanları (fiyat,
    // m², il/ilçe/mahalle, ada/parsel, lat/lng) zaten güvenilir biçimde çıkarır.
    let yakalananLinkSayisi = 0;
    try {
      const sonuc = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const links = document.querySelectorAll<HTMLAnchorElement>("a[href*='/ilan/']");
          const gorulen = new Set<string>();
          const linkler: Array<{ ilanNo: string; url: string }> = [];
          for (const link of links) {
            try {
              const href = link.href;
              const ilanNoMatch = /\/ilan\/[^/]*?[-_](\d{8,11})(?:\/|$|\?)/i.exec(href);
              const ilanNo = ilanNoMatch?.[1];
              if (!ilanNo || gorulen.has(ilanNo)) continue;
              gorulen.add(ilanNo);
              linkler.push({ ilanNo, url: href });
            } catch { /* ignore */ }
          }
          return { linkler, totalAnchors: links.length, url: location.href };
        },
      });
      const result = sonuc?.[0]?.result as
        | { linkler: Array<{ ilanNo: string; url: string }>; totalAnchors: number; url: string }
        | undefined;
      if (result?.linkler?.length) {
        yakalananLinkSayisi = result.linkler.length;
        console.log(
          `[bootstrap] inject: ${result.totalAnchors} anchor → ${yakalananLinkSayisi} unique ilan link`,
        );
        // Detay zenginleştirme kuyruğuna ekle — her detay sayfası açıldığında
        // sahibinden.ts otomatik tam parse + backend POST yapacak
        try {
          const eklenen = await detayKuyrugaToplaEkle(result.linkler);
          console.log(`[bootstrap] kuyruğa ${eklenen} yeni ilan eklendi (rest duplicate)`);
        } catch (e) {
          console.warn("[bootstrap] kuyruğa ekleme hatası:", e);
        }
      } else {
        console.log(`[bootstrap] inject: ${result?.totalAnchors ?? 0} anchor, 0 unique ilan link`);
      }
    } catch (e) {
      console.warn("[bootstrap] script inject hata:", e);
    }

    // Ek bekleme (sayfa kaynakları yüklensin, oluşan side-effect bitsin)
    await new Promise((r) => setTimeout(r, 800));
    void yakalananLinkSayisi;
  } finally {
    try {
      await chrome.tabs.remove(tabId);
    } catch {}
  }
  return tabId;
}

function yatJitter(base: number): Promise<void> {
  // ±20% jitter — bot pattern detect azaltma
  const ms = base + (Math.random() - 0.5) * base * 0.4;
  return new Promise((r) => setTimeout(r, Math.max(2000, ms)));
}

// Backend API URL — Cloudflare Worker production. Custom domain
// (api.cadastrum.com.tr) bağlandığında değiştir.
const BACKEND_API = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

/** Toplu ilan birikim — liste sayfasında 20-50 ilan tek seferde backend'e push eder.
 *  Telemetri opt-in kontrolü, fire-and-forget. */
async function backendIlanBatchGonder(ilanlar: IlanBilgisi[]): Promise<void> {
  try {
    const ayar = await chrome.storage.local.get("backendTelemetri");
    if (ayar.backendTelemetri === false) return;
    if (ilanlar.length === 0) return;

    // Hazırla — her ilan'ı validate edip schema'ya çevir
    const batch = ilanlar.flatMap((ilan) => {
      if (!ilan.ilanNo || !ilan.il || !ilan.ilce || !ilan.fiyat || !ilan.m2) return [];
      const fiyatPerM2 = ilan.fiyat / ilan.m2;
      if (fiyatPerM2 <= 0 || fiyatPerM2 > 10_000_000) return [];
      const baslik = (ilan.baslik ?? "").toLocaleLowerCase("tr");
      let kategori = "arsa";
      if (/tarla/.test(baslik)) kategori = "tarla";
      else if (/bahçe|bahce/.test(baslik)) kategori = "bahce";
      else if (/zeytin/.test(baslik)) kategori = "zeytinlik";
      else if (/villa|müstakil|mustakil|daire|apartman|ev|konut/.test(baslik)) kategori = "konut";
      return [{
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
        // Faz 2 — koord (varsa)
        lat: ilan.lat ?? undefined,
        lng: ilan.lng ?? undefined,
        koord_kaynagi: ilan.koordKaynagi ?? undefined,
      }];
    });

    if (batch.length === 0) return;

    // Admin bootstrap modu için scraper API secret (kullanıcı Boot tab'tan girer).
    // Set edilmişse backend /ilan/batch'in beklediği Bearer auth ile gönder.
    const sec = await chrome.storage.local.get("scraper_api_secret");
    const secret = typeof sec.scraper_api_secret === "string" ? sec.scraper_api_secret : null;

    // 100'er bölük gönder (backend max 100/batch)
    let toplamBasarili = 0, toplamHata = 0, toplamDup = 0;
    for (let i = 0; i < batch.length; i += 100) {
      const grup = batch.slice(i, i + 100);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (secret) headers["Authorization"] = `Bearer ${secret}`;
      const res = await fetch(`${BACKEND_API}/ilan/batch`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ilanlar: grup }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        console.warn(`[arsa] batch POST ${res.status} (secret ${secret ? "var" : "YOK"})`);
        toplamHata += grup.length;
        continue;
      }
      const sonuc = await res.json().catch(() => ({}));
      toplamBasarili += sonuc.basarili ?? 0;
      toplamDup += sonuc.duplicate ?? 0;
      toplamHata += sonuc.hata ?? 0;
    }
    console.log(
      `[arsa] batch sonuç: yüklenen=${toplamBasarili}, dup=${toplamDup}, hata=${toplamHata}` +
      (secret ? "" : " ⚠️ scraper_api_secret yok, backend reject etmiş olabilir"),
    );
  } catch (e) {
    console.warn("[arsa] batch gönderim hatası:", e);
  }
}

/** Bir ilanı backend'e POST et — opt-in kontrolü ayarlardan, default true.
 *  Fire-and-forget, hata yutulur. Privacy: ilan_no, fiyat, konum — kişisel veri yok.
 *  force=true ise telemetri ayarını atla (admin bootstrap akışı için). */
async function backendIlanGonder(ilan: IlanBilgisi, force = false): Promise<void> {
  try {
    // Opt-in kontrol — kullanıcı kapatabilir. Bootstrap akışında force=true.
    if (!force) {
      const ayar = await chrome.storage.local.get("backendTelemetri");
      if (ayar.backendTelemetri === false) return;
    }

    if (!ilan.ilanNo || !ilan.il || !ilan.ilce || !ilan.fiyat || !ilan.m2) return;
    const fiyatPerM2 = ilan.fiyat / ilan.m2;
    if (fiyatPerM2 <= 0 || fiyatPerM2 > 10_000_000) return;

    // Kategori inferensi — basit nitelik regex'i
    const baslik = (ilan.baslik ?? "").toLocaleLowerCase("tr");
    let kategori = "arsa";
    if (/tarla/.test(baslik)) kategori = "tarla";
    else if (/bahçe|bahce/.test(baslik)) kategori = "bahce";
    else if (/zeytin/.test(baslik)) kategori = "zeytinlik";
    else if (/villa|müstakil|mustakil|daire|apartman|ev|konut|kiraz/.test(baslik)) kategori = "konut";

    // Koordinat fallback — Sahibinden arsa ilanları çoğu koordinat gizler.
    // DOM'da yoksa mahalle merkez koordinatıyla doldur (spatial motor lat/lng şart).
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
        // Koord — DOM'dan veya mahalle merkez fallback
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
// TKGM, Origin: chrome-extension://... gördüğünde 403 atıyor.
// Static manifest rules CRXJS tarafından yanlış yola map'lenebilir,
// dynamic olarak runtime'da garanti yüklüyoruz.
/** Origin/Sec-Fetch-* başlıklarını strip eden ortak request header listesi */
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
  // TKGM — Referer parselsorgu olmalı
  dnrRule(1001, "||cbsapi.tkgm.gov.tr/", "https://parselsorgu.tkgm.gov.tr/"),
  dnrRule(1002, "||parselsorgu.tkgm.gov.tr/", "https://parselsorgu.tkgm.gov.tr/"),
  // Çevre analizi API'leri — Origin strip yeter
  dnrRule(1003, "||overpass-api.de/"),
  dnrRule(1004, "||nominatim.openstreetmap.org/"),
  dnrRule(1005, "||api.open-meteo.com/"),
  dnrRule(1006, "||overpass.private.coffee/"),
  dnrRule(1007, "||overpass.osm.ch/"),
  dnrRule(1008, "||lz4.overpass-api.de/"),
];


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
// Service worker yeniden uyandığında da bir kez çalıştır (idempotent)
dnrAyarla();

// Side panel'i toolbar tıklamasında aç
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error("[arsa] sidePanel.setPanelBehavior:", err));

// ----- TKGM fetch proxy (fallback for if DNR yine yetmezse) --------------
// Background SW fetch'i extension origin gönderir ama DNR rules de aktif olduğu
// için Origin/Referer doğru set edilir. side panel buradan çağırırsa
// double-protection sağlanır.
const PROXY_ALLOWED_HOSTS = new Set([
  "cbsapi.tkgm.gov.tr",
  "parselsorgu.tkgm.gov.tr",
  "e-plan.gov.tr",
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
  
  if (msg?.tip === "eplan-fetch" && typeof msg.url === "string") {
    if (!senderGuvenilirMi(sender) || !proxyUrlIzinliMi(msg.url)) {
      sendResponse({ ok: false, status: 403, error: "Unauthorized proxy request" });
      return false;
    }
    console.log("[eplan-fetch] →", msg.url);
    const options = msg.options || {};
    fetch(msg.url, options)
      .then(async (r) => {
        const text = await r.text();
        console.log(
          "[eplan-fetch] ←",
          r.status,
          msg.url.slice(-50),
          text.slice(0, 120),
        );
        return { ok: r.ok, status: r.status, text };
      })
      .then((d) => sendResponse(d))
      .catch((e) => {
        // "Failed to fetch" — e-plan.gov.tr geçici erişilemez. Sistem otomatik
        // content-script fallback'e düşüyor; gürültü olmaması için warn kullan.
        const mesaj = e instanceof Error ? e.message : String(e);
        if (/Failed to fetch|NetworkError/i.test(mesaj)) {
          console.warn("[eplan-fetch] e-plan ulaşılamıyor (fallback'e düşülüyor):", msg.url);
        } else {
          console.error("[eplan-fetch] ✗", msg.url, e);
        }
        sendResponse({ ok: false, status: 0, error: String(e) });
      });
    return true;
  }

  // Sahibinden/Hepsiemlak liste sayfasından toplu ilan — fiyat baseline için
  if (msg?.tip === "ilan-listesi-tespit" && Array.isArray(msg.ilanlar)) {
    const ilanlar = msg.ilanlar as IlanBilgisi[];
    chrome.storage.local
      .set({ listeIlanlari: { ilanlar, zaman: Date.now() } })
      .then(async () => {
        // Backend'e toplu telemetri (opt-in). Fire-and-forget.
        backendIlanBatchGonder(ilanlar).catch(() => {});
        // Faz 5 — koordsuz ilanları detay zenginleştirme kuyruğuna ekle.
        const koordsuzlar = ilanlar.filter(
          (il) => il.ilanNo && (il.lat == null || il.lng == null) && il.url,
        );
        if (koordsuzlar.length > 0) {
          try {
            await detayKuyrugaToplaEkle(
              koordsuzlar.map((il) => ({ ilanNo: il.ilanNo!, url: il.url })),
            );
          } catch (e) {
            console.warn("[detay-kuyruk] enqueue hata:", e);
          }
        }
        sendResponse({ ok: true, sayi: ilanlar.length });
      })
      .catch((e) => sendResponse({ ok: false, hata: String(e) }));
    return true;
  }

  // ── BOOTSTRAP TARA — admin-only Sahibinden ilçe gezme ──────────────────
  // Sadece development build'inde sidepanel UI bunu tetikler. Service worker
  // tarafında tetiklenmemesi için bir kapı kontrolü yok (sender kontrol edilebilir
  // ama trivial; UI gizli olduğundan kullanıcı bunu zaten manuel tetikliyor).
  if (msg?.tip === "bootstrap-tara") {
    // Admin guard — UI tab gating defansif olduğu için backend de doğrulasın.
    // JWT'de admin=1 yoksa veya token yoksa reddet.
    (async () => {
      const tokenData = await chrome.storage.local.get("cadastrum_token");
      const token = typeof tokenData["cadastrum_token"] === "string"
        ? tokenData["cadastrum_token"] : null;
      const payload = decodeJwt(token);
      if (payload?.admin !== 1 && payload?.adm !== 1) {
        sendResponse({ ok: false, hata: "Bootstrap admin-only — admin JWT claim yok" });
        return;
      }
      try {
        const sonuc = await bootstrapBaslat(msg.ayar);
        sendResponse({ ok: true, ...sonuc });
      } catch (e) {
        sendResponse({ ok: false, hata: String(e) });
      }
    })();
    return true;
  }
  if (msg?.tip === "bootstrap-durdur") {
    bootstrapDurAk();
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.tip === "bootstrap-durum") {
    sendResponse({ ok: true, durum: bootstrapDurum });
    return false;
  }

  // ── Faz 5: Detay zenginleştirme kuyruğu mesajları ─────────────────────────
  if (msg?.tip === "detay-zenginlestir-baslat") {
    detayZenginlestirmeBaslat(ilanTespitBekleyici);
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.tip === "detay-zenginlestir-durdur") {
    detayZenginlestirmeDurdur();
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.tip === "detay-zenginlestir-durum") {
    (async () => {
      await detaySayilariniGuncelle();
      sendResponse({ ok: true, durum: detayDurumGetir() });
    })();
    return true;
  }
  if (msg?.tip === "detay-kuyrugu-temizle") {
    (async () => {
      await detayKuyruguTemizle();
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg?.tip === "ilan-tespit" && msg.ilan) {
    const ilan = msg.ilan as IlanBilgisi;
    // Session storage — browser kapanınca temizlenir, kalıcı state kalmasın
    chrome.storage.session
      .set({ sonIlan: ilan })
      .then(async () => {
        // Otomatik side panel aç — kullanıcı sahibinden ilanı açtı, biz hazır olalım
        if (sender?.tab?.windowId) {
          try {
            await chrome.sidePanel.open({ windowId: sender.tab.windowId });
          } catch (e) {
            console.warn("[arsa] sidePanel.open hatası:", e);
          }
        }
        // Faz 5 — detay kuyruğunda bekleyen ilan mı? (Bootstrap akışı)
        // Eğer öyleyse telemetri ayarını atlayıp zorla backend'e gönder.
        const bootstrapAkisi = !!(ilan.ilanNo && bekleyenIlanlar.has(ilan.ilanNo));

        // Backend telemetri — bootstrap'ta zorla, normal browse'da opt-in. Fire-and-forget.
        backendIlanGonder(ilan, bootstrapAkisi).catch(() => {});

        // Bekleyen ilan ise resolver'ı çağır.
        // Başarı kriteri: content script parse etti VE en az fiyat veya m² yakaladı.
        // Koordinat çoğu Sahibinden ilanında yok (gizli) — bu yüzden koordsuz da TAMAM.
        if (bootstrapAkisi && ilan.ilanNo) {
          const resolver = bekleyenIlanlar.get(ilan.ilanNo);
          if (resolver) {
            const parseBasarili = (ilan.fiyat != null) || (ilan.m2 != null);
            resolver(parseBasarili);
          }
        }
        sendResponse({ ok: true });
      })
      .catch((e) => sendResponse({ ok: false, hata: String(e) }));
    return true;
  }
  return false;
});

// ── Detay zenginleştirme worker'ı için ilan-tespit bekleyici registry ─────────
const bekleyenIlanlar = new Map<string, (basarili: boolean) => void>();

function ilanTespitBekleyici(ilanNo: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      bekleyenIlanlar.delete(ilanNo);
      resolve(false);
    }, timeoutMs);
    bekleyenIlanlar.set(ilanNo, (basarili) => {
      clearTimeout(timer);
      bekleyenIlanlar.delete(ilanNo);
      resolve(basarili);
    });
  });
}

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
  // Periyodik alarm'ları kayıt et
  alarmlariKaydet();
});

// Service worker boot'ta da alarm'ları yenile (kullanıcı kapatıp açtıysa)
chrome.runtime.onStartup.addListener(() => {
  alarmlariKaydet();
});

// Alarm tetiklendiğinde işle
chrome.alarms.onAlarm.addListener((alarm) => {
  alarmIsle(alarm).catch(e => console.error("[alarm] hata:", e));
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "arsa-query-here" || !tab?.windowId) return;
  chrome.sidePanel.open({ windowId: tab.windowId });
});
