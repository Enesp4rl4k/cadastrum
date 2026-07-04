/**
 * Admin-only scraping — bootstrap Sahibinden tarama, liste batch, detay kuyruğu.
 * Store build'de bu modül bundle'a dahil edilmez (VITE_SCRAPING_ENABLED=false).
 */
import type { IlanBilgisi } from "../types/ilan";
import {
  bootstrapHedefler,
  type BootstrapAyar,
  type BootstrapDurum,
} from "../lib/sahibinden-bootstrap";
import { decodeJwt } from "../lib/jwt-decode";
import {
  detayKuyrugaToplaEkle,
  detayZenginlestirmeBaslat,
  detayZenginlestirmeDurdur,
  detayDurumGetir,
  detaySayilariniGuncelle,
  detayKuyruguTemizle,
} from "../lib/detay-zenginlestirme";

const BACKEND_API = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

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

const bekleyenIlanlar = new Map<string, (basarili: boolean) => void>();

function bootstrapDurAk() {
  bootstrapDurAkBayrak = true;
}

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
    await new Promise((r) => setTimeout(r, Math.max(2500, bekleMs / 2)));

    if (await botEngeliMi(tabId)) {
      console.warn("[bootstrap] bot engeli tespit edildi — 60sn backoff");
      try { await chrome.tabs.remove(tabId); } catch {}
      await new Promise((r) => setTimeout(r, 60_000));
      return -1;
    }

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
        console.log(
          `[bootstrap] inject: ${result.totalAnchors} anchor → ${result.linkler.length} unique ilan link`,
        );
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

    await new Promise((r) => setTimeout(r, 800));
  } finally {
    try {
      await chrome.tabs.remove(tabId);
    } catch {}
  }
  return tabId;
}

function yatJitter(base: number): Promise<void> {
  const ms = base + (Math.random() - 0.5) * base * 0.4;
  return new Promise((r) => setTimeout(r, Math.max(2000, ms)));
}

async function backendIlanBatchGonder(ilanlar: IlanBilgisi[]): Promise<void> {
  try {
    const ayar = await chrome.storage.local.get("backendTelemetri");
    if (ayar.backendTelemetri === false) return;
    if (ilanlar.length === 0) return;

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
        lat: ilan.lat ?? undefined,
        lng: ilan.lng ?? undefined,
        koord_kaynagi: ilan.koordKaynagi ?? undefined,
      }];
    });

    if (batch.length === 0) return;

    const sec = await chrome.storage.local.get("scraper_api_secret");
    const secret = typeof sec.scraper_api_secret === "string" ? sec.scraper_api_secret : null;
    const endpoint = secret ? "/ilan/batch" : "/ilan/katki";

    let toplamBasarili = 0, toplamHata = 0, toplamDup = 0;
    for (let i = 0; i < batch.length; i += 100) {
      const grup = batch.slice(i, i + 100);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (secret) headers["Authorization"] = `Bearer ${secret}`;
      const res = await fetch(`${BACKEND_API}${endpoint}`, {
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

/** Bootstrap detay kuyruğunda bekleyen ilan mı? */
export function bootstrapAkisiMi(ilanNo: string | undefined): boolean {
  return !!(ilanNo && bekleyenIlanlar.has(ilanNo));
}

/** Bootstrap akışında ilan parse edildiğinde resolver'ı çağır. */
export function bootstrapIlanTespitTamamla(ilan: IlanBilgisi): void {
  if (!ilan.ilanNo) return;
  const resolver = bekleyenIlanlar.get(ilan.ilanNo);
  if (!resolver) return;
  const parseBasarili = ilan.fiyat != null || ilan.m2 != null;
  resolver(parseBasarili);
}

type ScrapingDeps = {
  backendIlanGonder: (ilan: IlanBilgisi, force?: boolean) => Promise<void>;
};

/**
 * Scraping mesajlarını işler. `undefined` = bu mesaj scraping'e ait değil.
 * `true` = async handler (sendResponse sonra çağrılır).
 * `false` = sync handler tamamlandı.
 */
export function handleScrapingMessage(
  msg: { tip?: string; [key: string]: unknown },
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
  _deps: ScrapingDeps,
): boolean | undefined {
  if (msg?.tip === "ilan-listesi-tespit" && Array.isArray(msg.ilanlar)) {
    const ilanlar = msg.ilanlar as IlanBilgisi[];
    chrome.storage.local
      .set({ listeIlanlari: { ilanlar, zaman: Date.now() } })
      .then(async () => {
        backendIlanBatchGonder(ilanlar).catch(() => {});
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

  if (msg?.tip === "bootstrap-tara") {
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
        const sonuc = await bootstrapBaslat(msg.ayar as BootstrapAyar);
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

  return undefined;
}
