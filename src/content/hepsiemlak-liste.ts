/**
 * Hepsiemlak.com ARAMA / LİSTE sayfası içerik scripti.
 * Sahibinden-liste ile aynı pattern: arsa arama sonuçlarını otomatik çekip
 * ilanGozlem tablosuna biriktirir.
 *
 * Tetiklenir: /satilik-arsa, /[il]-satilik-arsa, /arsa, /satilik
 */

import type { IlanBilgisi } from "../types/ilan";
import { lokasyonMetniniAyir } from "../lib/lokasyon-ayir";
import { yerTemizleVeDogrula } from "../lib/yer-temizle";
import { createContextGuard } from "./context-guard";

const guard = createContextGuard("[arsa-he-liste]");

/**
 * Liste sayfası: arama/kategori sayfası, son segmentte numerik ID yok.
 * Detay sayfaları (/.../120239-3336) bu script'i tetiklemesin.
 */
function listeMi(): boolean {
  if (!/hepsiemlak\.com\//i.test(location.href)) return false;
  // Path'te satilik veya kiralik geçmeli ama detail ID olmamalı
  if (!/satilik|kiralik|arsa|tarla|imarli/i.test(location.pathname)) return false;
  // Numerik ID ile biten URL'ler detail demek
  if (/\/\d{5,11}(?:-\d{1,5})?(?:\/?$|\?|#)/.test(location.pathname)) return false;
  return true;
}

(function init() {
  let sonUrl = "";
  const tara = () => {
    if (!guard.gecerli()) return;
    if (location.href === sonUrl) return;
    sonUrl = location.href;
    if (!listeMi()) return;
    console.log("[arsa-he-liste] liste sayfası tespit:", location.href);
    setTimeout(listeyiTara, 1500);
    setTimeout(listeyiTara, 4000); // lazy-load için ikinci geçiş
  };
  tara();
  guard.kaydet(setInterval(tara, 3000));
})();

function listeyiTara(): void {
  if (!guard.gecerli()) return;
  const ilanlar = listedenIlanlarCikar();
  if (ilanlar.length === 0) return;

  console.log(`[arsa-he-liste] ${ilanlar.length} ilan tespit edildi`);
  guard.mesajGonder({ tip: "ilan-listesi-tespit", ilanlar });
}

function listedenIlanlarCikar(): IlanBilgisi[] {
  const sonuclar: IlanBilgisi[] = [];

  // Hepsiemlak liste satırları — birkaç farklı DOM varyantı
  const rows = document.querySelectorAll<HTMLElement>(
    ".list-view-content .list-item, " +
    ".listing-list .listing-item, " +
    ".re-search-results-list > div, " +
    ".list-view .list-view-card, " +
    "ul.list > li, " +
    'div[class*="ListItem"], ' +
    'div[class*="listItem"], ' +
    'a[class*="ListingCard"], ' +
    "article",
  );

  for (const row of rows) {
    try {
      const ilan = satirdanIlanCikar(row);
      if (ilan) sonuclar.push(ilan);
    } catch { /* skip bad row */ }
  }

  return sonuclar;
}

function satirdanIlanCikar(row: HTMLElement): IlanBilgisi | null {
  // URL — ilanNo için
  const link = row.querySelector<HTMLAnchorElement>(
    'a[href*="/satilik/"], a[href*="/kiralik/"], a[href*="/ilan/"], a',
  );
  const href = link?.href ?? "";
  // Hepsiemlak URL pattern: /[lokasyon]/satilik/[slug]-[id]
  const ilanNoMatch = /[/-](\d{7,11})(?:\/|\?|#|$)/.exec(href);
  const ilanNo = ilanNoMatch?.[1] ?? null;
  if (!ilanNo) return null;

  // Başlık
  const baslik =
    row.querySelector(
      "h3.list-view-title, .card-title, h3 a, h2 a, .listing-card-title, " +
      'a[class*="title"], h3, h2, [data-testid="card-title"]',
    )?.textContent?.trim() ?? null;

  // Fiyat
  const fiyatStr =
    row.querySelector(
      ".list-view-price, .price-text, .card-price, " +
      'span[class*="price"], div[class*="price"], [data-testid="price"]',
    )?.textContent?.trim() ?? null;
  const { fiyat, paraBirimi } = parseFiyat(fiyatStr);

  // m² — özellikler içinde
  const m2Str =
    row.querySelector(
      ".short-property-info span, " +
      ".list-view-size, .card-info-area, " +
      'span[class*="m2"], span[class*="size"], li[class*="size"]',
    )?.textContent?.trim() ?? null;
  const m2 = parseM2(m2Str);

  // Lokasyon
  const lokasyon =
    row.querySelector(
      ".list-view-location, .card-location, " +
      'span[class*="location"], div[class*="location"], [data-testid="location"]',
    )?.textContent?.trim() ?? null;
  const { il, ilce, mahalle } = lokasyonMetniniAyir(lokasyon);

  // Fiyat/m² hesapla
  const fiyatPerM2 =
    fiyat && m2 && m2 > 0 && paraBirimi === "TL"
      ? Math.round(fiyat / m2)
      : null;

  // Anlamsız değerleri reddet
  if (!fiyat || fiyat < 1000) return null;
  if (fiyatPerM2 && (fiyatPerM2 < 10 || fiyatPerM2 > 5_000_000)) return null;

  return {
    kaynak: "hepsiemlak",
    url: href || location.href,
    baslik,
    fiyat,
    fiyatStr,
    paraBirimi,
    m2,
    il,
    ilce,
    mahalle,
    adaNo: null,
    parselNo: null,
    pafta: null,
    imarDurumu: null,
    ilanNo,
    aciklamadaAdaParsel: [],
    yakalanmaZamani: Date.now(),
  };
}

function parseFiyat(s: string | null): { fiyat: number | null; paraBirimi: string } {
  if (!s) return { fiyat: null, paraBirimi: "TL" };
  const paraBirimi = /USD|\$/.test(s) ? "USD" : /EUR|€/.test(s) ? "EUR" : "TL";
  const sayilar = s.replace(/[^\d.,]/g, "").trim();
  if (!sayilar) return { fiyat: null, paraBirimi };
  let normalized: string;
  if (sayilar.includes(",") && sayilar.includes(".")) {
    normalized = sayilar.replace(/\./g, "").replace(",", ".");
  } else if (sayilar.includes(".") && sayilar.split(".").length > 2) {
    normalized = sayilar.replace(/\./g, "");
  } else {
    normalized = sayilar.replace(",", ".");
  }
  const n = Number.parseFloat(normalized);
  return { fiyat: Number.isFinite(n) ? n : null, paraBirimi };
}

function parseM2(s: string | null): number | null {
  if (!s) return null;
  const sayilar = s.replace(/[^\d.,]/g, "");
  if (!sayilar) return null;
  let normalized: string;
  if (sayilar.includes(".") && sayilar.split(".").length > 2) {
    normalized = sayilar.replace(/\./g, "");
  } else {
    normalized = sayilar.replace(",", ".");
  }
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}
