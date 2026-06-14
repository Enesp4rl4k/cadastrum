/**
 * Sahibinden.com ARAMA / LİSTE sayfası içerik scripti.
 *
 * Kullanıcı arsa arama sonuçlarını açtığında görünen tüm ilanları
 * otomatik çekip ilanGozlem tablosuna biriktirir.
 * Tek ilan sayfasından (~10 ilan) çok daha hızlı veri toplama sağlar.
 *
 * Tetiklenir: /arsa*, /konut-arsasi*, /ticari-arsa*
 */

import type { IlanBilgisi } from "../types/ilan";
import { createContextGuard } from "./context-guard";
import { lokasyonMetniniAyir } from "../lib/lokasyon-ayir";
import { yerTemizleVeDogrula } from "../lib/yer-temizle";

const guard = createContextGuard("[arsa-liste]");

/** Script tüm sahibinden.com'a yüklenir — sadece arsa/tarla liste sayfalarında çalışsın. */
function listeSayfasiMi(): boolean {
  const p = location.pathname.toLowerCase();
  return (
    p.includes("/satilik-arsa") ||
    p.includes("/satilik-tarla") ||
    p.includes("/konut-arsasi") ||
    p.includes("/ticari-arsa") ||
    p.startsWith("/arsa") ||
    p.startsWith("/arsalar")
  );
}

(function init() {
  console.log(`[arsa-liste] yüklendi: ${location.pathname}`);
  if (!listeSayfasiMi()) {
    console.log(`[arsa-liste] arsa liste sayfası değil, çıkılıyor`);
    return;
  }
  console.log(`[arsa-liste] ✓ arsa liste sayfası tespit edildi, tarama başlıyor`);

  // Sayfa ilk yüklemede + SPA nav'larda çalış
  let sonUrl = "";
  const tara = () => {
    if (!guard.gecerli()) return;
    if (!listeSayfasiMi()) return;
    if (location.href === sonUrl) return;
    sonUrl = location.href;
    // Liste sayfası yerleşmesi için bekle
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

  console.log(`[arsa-liste] ${ilanlar.length} ilan tespit edildi`);
  guard.mesajGonder({ tip: "ilan-listesi-tespit", ilanlar });
}

function listedenIlanlarCikar(): IlanBilgisi[] {
  const sonuclar: IlanBilgisi[] = [];
  const gorulen = new Set<string>();

  // ── Strateji 1: Klasik DOM selector'lar ────────────────────────
  const rows = document.querySelectorAll<HTMLElement>(
    ".searchResultsRowList .searchResultsItem, " +
    ".classified-list .classified-item, " +
    "[data-testid='search-results-list'] > li, " +
    ".searchResults .searchResultsItem",
  );

  for (const row of rows) {
    try {
      const ilan = satirdanIlanCikar(row);
      if (ilan && ilan.ilanNo && !gorulen.has(ilan.ilanNo)) {
        gorulen.add(ilan.ilanNo);
        sonuclar.push(ilan);
      }
    } catch {}
  }
  if (sonuclar.length > 0) {
    console.log(`[arsa-liste] strateji-1 (DOM): ${sonuclar.length} ilan`);
    return sonuclar;
  }

  // ── Strateji 2: Heuristik — her /ilan/ link'inin yakın container'ında text ara ─
  // DOM selector'ları tutmadığında (Sahibinden HTML değişti) fallback.
  const links = document.querySelectorAll<HTMLAnchorElement>("a[href*='/ilan/']");
  for (const link of links) {
    try {
      const href = link.href;
      const ilanNoMatch = /\/ilan\/[^/]*?[-_](\d{8,11})(?:\/|$|\?)/i.exec(href);
      const ilanNo = ilanNoMatch?.[1];
      if (!ilanNo || gorulen.has(ilanNo)) continue;

      // Yakın container — atayı 6 seviye yukarı tara
      let container: HTMLElement = link;
      for (let i = 0; i < 6; i++) {
        if (!container.parentElement) break;
        container = container.parentElement;
        const tag = container.tagName;
        if (tag === "TR" || tag === "ARTICLE" || tag === "LI") break;
        if (container.className && /card|item|row|result/i.test(container.className)) break;
      }

      const allText = (container.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!allText) continue;

      // Sahibinden format: "<m²> <toplam_fiyat> TL <fiyat_per_m2> TL/m²"
      // Örn: "717 7.500.000 TL 10.460 TL/m²"
      // En güvenilir: TL/m² desenini ara, m²'yi fiyat/(fiyat_per_m2)'den türet.
      const fpmMatch = allText.match(/(\d{1,3}(?:[.,]\d{3})*)\s*(TL|USD|EUR|GBP|\$|€|£)\s*\/\s*m[²2]/i);
      const fiyatMatch = allText.match(/(\d{1,3}(?:[.,]\d{3})+)\s*(TL|USD|EUR|GBP|\$|€|£)(?!\s*\/)/i);
      if (!fpmMatch || !fiyatMatch) continue;

      const fiyatPerM2 = parseInt(fpmMatch[1]!.replace(/[.,]/g, ""), 10);
      const fiyat = parseInt(fiyatMatch[1]!.replace(/[.,]/g, ""), 10);
      if (!fiyatPerM2 || !fiyat || fiyatPerM2 < 50 || fiyatPerM2 > 10_000_000) continue;
      const m2 = Math.round(fiyat / fiyatPerM2);
      if (m2 < 10 || m2 > 10_000_000) continue;

      const cur = fpmMatch[2]!;
      const paraBirimi =
        /\$|usd/i.test(cur) ? "USD" :
        /€|eur/i.test(cur) ? "EUR" :
        /£|gbp/i.test(cur) ? "GBP" : "TL";

      // Mahalle: "Moda Mah." / "Kadıköy Mahallesi"
      const mahalleMatch = allText.match(
        /([A-Za-zçğıöşüÇĞİÖŞÜ][\w\sçğıöşüÇĞİÖŞÜ]+?)\s+(?:Mah\.?|Mahallesi|Mh\.?)/,
      );

      const baslik = (link.textContent ?? "").trim().slice(0, 200) || null;

      sonuclar.push({
        kaynak: "sahibinden",
        url: href,
        baslik,
        fiyat,
        fiyatStr: `${fiyatMatch[1]} ${cur}`,
        paraBirimi,
        m2,
        il: null,
        ilce: null,
        mahalle: mahalleMatch ? yerTemizleVeDogrula(mahalleMatch[1] ?? null, "mahalle") : null,
        adaNo: null,
        parselNo: null,
        pafta: null,
        imarDurumu: null,
        ilanNo,
        aciklamadaAdaParsel: [],
        yakalanmaZamani: Date.now(),
      });
      gorulen.add(ilanNo);
    } catch {}
  }

  console.log(
    `[arsa-liste] strateji-2 (heuristik): ${sonuclar.length} ilan (${links.length} link tarandı)`,
  );
  return sonuclar;
}

function satirdanIlanCikar(row: HTMLElement): IlanBilgisi | null {
  // Listing URL — ilanNo için
  const link = row.querySelector<HTMLAnchorElement>("a[href*='/ilan/']");
  const href = link?.href ?? "";
  const ilanNoMatch = /\/ilan\/[^/]*?[-_](\d{8,11})(?:\/|$|\?)/i.exec(href);
  const ilanNo = ilanNoMatch?.[1] ?? null;

  // ilanNo olmadan ekleme; URL tekrarlıysa skip
  if (!ilanNo) return null;

  // Başlık
  const baslik =
    row.querySelector(".searchResultsTitleValue, h3.classifiedTitle, .classified-title, h3 a")
      ?.textContent?.trim() ?? null;

  // Fiyat
  const fiyatStr =
    row.querySelector(
      ".searchResultsPriceValue, .classified-price, [data-testid='price'], .price-value",
    )?.textContent?.trim() ?? null;
  const { fiyat, paraBirimi } = parseFiyat(fiyatStr);

  // m² — "1.250 m²" formatı
  const m2Str =
    row.querySelector(
      ".searchResultsTagAttributeList li:first-child, .classified-attributes li, .size",
    )?.textContent ?? null;
  const m2 = parseM2(m2Str);

  // Lokasyon — "İstanbul / Kadıköy / Moda Mah" veya "İstanbul, Kadıköy"
  const lokasyon =
    row.querySelector(
      ".searchResultsLocationValue, .classified-location, [data-testid='location'], .location",
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
    kaynak: "sahibinden",
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
