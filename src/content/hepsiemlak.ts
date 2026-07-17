/**
 * Hepsiemlak.com ilan detay sayfası içerik scripti.
 *
 * Sahibinden scripti ile aynı pattern: sayfayı SADECE okur, ilan bilgisi
 * çıkarıp side panel'e iletir. Çoklu sample boyutu için ikinci kaynak.
 *
 * URL örneği: https://www.hepsiemlak.com/.../satilik/...-arsa-...
 */

import type { IlanBilgisi } from "../types/ilan";
import { createContextGuard } from "./context-guard";
import { yerTemizleVeDogrula } from "../lib/yer-temizle";

const guard = createContextGuard("[arsa-he]");

/**
 * Detay sayfası URL'i: ...satilik|kiralik/[tip]/[numerik-id]
 * URL'in son segmenti numerik ID değilse (örn: liste sayfası "/satilik-arsa")
 * detail script çalışmasın.
 */
function detayMi(): boolean {
  if (!/hepsiemlak\.com\/.+(?:satilik|kiralik)/i.test(location.href)) return false;
  // Son path segmentinde numerik ID var mı? Örn: /120239-3336 veya /146829-161
  return /\/\d{5,11}(?:-\d{1,5})?(?:\/?$|\?|#)/.test(location.pathname);
}

// Yüklenme tanılaması — script enjekte edildi mi kontrolü için
console.log("[arsa-he] hepsiemlak content script yüklendi", {
  url: location.href,
  pathname: location.pathname,
  detayMi: detayMi(),
});

function guvenliMesajGonder(msg: unknown): void {
  guard.mesajGonder(msg);
}

(function init() {
  let sonUrl = "";
  const tarama = () => {
    if (!guard.gecerli()) return;
    if (location.href === sonUrl) return;
    sonUrl = location.href;
    if (!detayMi()) {
      console.log("[arsa-he] detay değil, atlanıyor:", location.href);
      return;
    }
    console.log("[arsa-he] detay sayfası tespit, parse başlıyor:", location.href);
    setTimeout(() => {
      try { parseliCalistir(); } catch (e) {
        if (!guard.contextGecersiz(e)) console.error("[arsa-he] parse hatası (800ms):", e);
      }
    }, 800);
    setTimeout(() => {
      try { parseliCalistir(); } catch (e) {
        if (!guard.contextGecersiz(e)) console.error("[arsa-he] parse hatası (2500ms):", e);
      }
    }, 2500);
  };
  tarama();
  guard.kaydet(setInterval(tarama, 2000));
})();

let lastSentIlanNo = "";

function parseliCalistir(): void {
  const ilan = parselDOM();
  if (!ilan.baslik && !ilan.fiyat && !ilan.adaNo && !ilan.ilanNo) {
    console.log("[arsa-he] parseDOM verisi boş — DOM selector match etmemiş veya sayfa hazır değil", {
      url: location.href,
      baslikDenendi: !!document.querySelector("h1"),
      fiyatDenendi: !!document.querySelector('[class*="price"], [class*="Price"]'),
    });
    return;
  }

  const ilanKey = ilan.ilanNo ?? ilan.url;
  if (ilanKey === lastSentIlanNo) return;
  lastSentIlanNo = ilanKey;

  console.log("[arsa-he] hepsiemlak ilan tespit:", {
    ilanNo: ilan.ilanNo,
    baslik: ilan.baslik?.slice(0, 60),
    fiyat: ilan.fiyatStr,
    m2: ilan.m2,
    il: ilan.il,
    ilce: ilan.ilce,
    mahalle: ilan.mahalle,
  });

  guvenliMesajGonder({ tip: "ilan-tespit", ilan });
}

function parselDOM(debug = false): IlanBilgisi {
  // --- Başlık ---
  const baslik = txt(
    "h1.det-title",
    "h1.fontRB.fz24-cont",
    'h1[class*="detail"]',
    'h1[class*="title"]',
    'h1[class*="Title"]',
    "h1",
  );

  // --- Fiyat ---
  const fiyatStr = txt(
    ".fz-list-price-cont",
    "p.fz24-text.price",
    'span[class*="price"]',
    'div[class*="price"]',
    'p[class*="price"]',
    'h3[class*="price"]',
    '[data-testid="price"]',
    ".price",
    ".det-price",
  );
  const { fiyat, paraBirimi } = parseFiyat(fiyatStr);

  // --- Bilgi tablosu (özellikler listesi) ---
  const tablo = bilgiTablosuCikar();

  // --- Açıklama (ada/parsel ipucu için) ---
  const aciklama = txt(
    ".det-content-html",
    ".description-content",
    'div[class*="description"]',
    'div[class*="Description"]',
    "#descriptionContent",
    ".desc",
  );
  const aciklamadaAdaParsel = aciklamadanAdaParselCikar(aciklama ?? "");

  // --- JSON-LD fallback ---
  const jsonLd = jsonLdParse();
  const ldAddress = jsonLd?.address as Record<string, string> | undefined;
  const ldName = jsonLd?.name as string | undefined;
  const ldId = jsonLd?.identifier as string | undefined;
  const ldFloorSize = jsonLd?.floorSize as number | undefined;

  // --- Lokasyon (breadcrumb / location header) ---
  const breadcrumb = breadcrumbCikar();

  // URL fallback'i — DOM scraper boş kaldığında veya yanlış cevap verdiğinde
  // Hepsiemlak URL'i her zaman: /[en/]il-ilce-mahalle-satilik/tip/id formatında
  const urlLok = urldenLokasyon();

  // Öncelik: BREADCRUMB + URL > tablo (satıcı serbest girişi)
  // Hepsiemlak URL'si sabit pattern'de — il/ilçe/mahalle güvenilir kaynak.
  const ilHam = breadcrumb.il ?? urlLok.il ?? tablo["il"] ?? tablo["sehir"]
    ?? tablo["city"] ?? tablo["province"] ?? ldAddress?.region ?? null;
  const ilceHam = breadcrumb.ilce ?? urlLok.ilce ?? tablo["ilce"]
    ?? tablo["district"] ?? tablo["county"] ?? ldAddress?.locality ?? null;
  const mahalleHam = breadcrumb.mahalle ?? urlLok.mahalle ?? tablo["mahalle"]
    ?? tablo["neighborhood"] ?? tablo["quarter"] ?? null;

  // Temizle + doğrula: parantez ekleri, suffix, geçersiz değerler
  const il = yerTemizleVeDogrula(ilHam, "il");
  const ilce = yerTemizleVeDogrula(ilceHam, "ilce");
  const mahalle = yerTemizleVeDogrula(mahalleHam, "mahalle");

  // Ada/parsel — Hepsiemlak "Plot / Parcel No: 138 / 19" tek field'da verebiliyor
  const plotParcel = tablo["plotparcelno"] ?? tablo["plotparcel"]
    ?? tablo["adaparselno"] ?? tablo["adaparsel"] ?? null;
  const { ada: pAda, parsel: pParsel } = ayirAdaParsel(plotParcel);

  const adaNo =
    parseSayi(tablo["adano"] ?? tablo["ada"] ?? tablo["plotno"] ?? tablo["plot"] ?? null)
    ?? pAda
    ?? aciklamadaAdaParsel[0]?.ada ?? null;
  const parselNo =
    parseSayi(tablo["parselno"] ?? tablo["parsel"] ?? tablo["parcelno"] ?? tablo["parcel"] ?? null)
    ?? pParsel
    ?? aciklamadaAdaParsel[0]?.parsel ?? null;

  // --- İlan No — Hepsiemlak URL'inde son segment numerik (genelde 7-10 digit)
  // Hepsiemlak URL ID formatı: /<6-haneli-id>-<3-4-haneli-suffix>
  // Örn: /120239-3336, /146829-161 — full kombinasyonu unique key olarak alıyoruz
  const ilanNoFromUrl = /\/(\d{5,11}(?:-\d{1,5})?)(?:\/|\?|#|$)/.exec(location.href)?.[1] ?? null;
  const ilanNo = tablo["ilanno"] ?? tablo["hepsiemlakno"] ?? ilanNoFromUrl ?? ldId ?? null;

  // Faz 2 — koordinat extract (Spatial emsal motoru için)
  const koord = koordExtractHepsi(jsonLd);

  const ilan: IlanBilgisi = {
    kaynak: "hepsiemlak",
    url: location.href,
    baslik: baslik ?? ldName ?? null,
    fiyat,
    fiyatStr: fiyatStr ?? null,
    paraBirimi,
    m2:
      parseM2(
        tablo["metrekare"] ??
          tablo["m"] ??
          tablo["m2brut"] ??
          tablo["m2net"] ??
          tablo["arsam"] ??
          tablo["arsam2"] ??
          tablo["brutm"] ??
          tablo["netm"] ??
          // EN labels
          tablo["squaremeters"] ??
          tablo["area"] ??
          tablo["size"] ??
          tablo["surface"] ??
          tablo["grossm2"] ??
          tablo["netm2"] ??
          null,
      ) ?? ldFloorSize ?? null,
    il,
    ilce,
    mahalle,
    adaNo,
    parselNo,
    pafta: tablo["pafta"] ?? null,
    imarDurumu:
      tablo["imardurumu"] ??
      tablo["imar"] ??
      tablo["yapidurumu"] ??
      tablo["arsadurumu"] ??
      tablo["tapudurumu"] ??
      // EN labels: "Land Type" / "Title Deed Status" / "Zoning Status"
      tablo["landtype"] ??
      tablo["zoningstatus"] ??
      tablo["zoning"] ??
      tablo["titledeedstatus"] ??
      tablo["propertytype"] ??
      null,
    ilanNo,
    aciklamadaAdaParsel,
    yakalanmaZamani: Date.now(),
    lat: koord?.lat ?? null,
    lng: koord?.lng ?? null,
    koordKaynagi: koord ? "dom" : null,
    koordDogruluk: koord ? "yuksek" : null,
  };

  if (debug) {
    console.group("[arsa-he] hepsiemlak parse debug");
    console.log("URL:", location.href);
    console.log("Bilgi tablosu:", tablo);
    console.log("JSON-LD:", jsonLd);
    console.log("Breadcrumb:", breadcrumb);
    console.log("İlan:", ilan);
    console.groupEnd();
  }

  return ilan;
}

/**
 * Hepsiemlak özellikler tablosu — birkaç farklı yapı dener:
 * 1. ul.adv-info-list > li: "<span>label</span><span>value</span>"
 * 2. .info-list-wrapper li > .info-key + .info-value
 * 3. dl > dt + dd
 * 4. Generic table tr > td
 */
function bilgiTablosuCikar(): Record<string, string> {
  const tablo: Record<string, string> = {};

  // Pattern 1+2: ul/li
  const liler = document.querySelectorAll<HTMLLIElement>(
    "ul.adv-info-list li, .info-list-wrapper li, .det-info li, .property-features li, .features li, .det-list li, ul.spec li",
  );
  for (const li of liler) {
    const key = li.querySelector(".info-key, .key, span:first-child, em:first-child, strong:first-child");
    const val = li.querySelector(".info-value, .value, span:last-child, em:last-child, strong:last-child");
    if (key && val && key !== val) {
      const k = (key.textContent ?? "").trim();
      const v = (val.textContent ?? "").trim();
      if (k && v && k.length < 35) tablo[normalize(k)] = v;
    } else {
      // Fallback: "Label: Value" tek text içinde
      const text = (li.textContent ?? "").trim();
      const m = /^([^:]{2,30}):\s*(.+)$/.exec(text);
      if (m && m[1] && m[2]) tablo[normalize(m[1])] = m[2].trim();
    }
  }

  // Pattern 3: dl > dt + dd
  const dts = document.querySelectorAll<HTMLElement>("dl dt");
  for (const dt of dts) {
    const dd = dt.nextElementSibling;
    if (dd && dd.tagName === "DD") {
      const k = (dt.textContent ?? "").trim();
      const v = (dd.textContent ?? "").trim();
      if (k && v) tablo[normalize(k)] = v;
    }
  }

  // Pattern 4: tr > td
  const trs = document.querySelectorAll<HTMLElement>("tr");
  for (const tr of trs) {
    const cells = tr.querySelectorAll("td, th");
    if (cells.length >= 2) {
      const k = (cells[0]?.textContent ?? "").trim();
      const v = (cells[1]?.textContent ?? "").trim();
      if (k && v && k.length < 30) tablo[normalize(k)] = v;
    }
  }

  return tablo;
}

/**
 * Hepsiemlak'ta breadcrumb / lokasyon — class-bağımsız, "Mh." / "Mahallesi"
 * içeren anchor üzerinden traverse.
 */
/** ASCII slug — Türkçe karakterleri normalize eder, alfanumerikten arınır */
function asciiSlug(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" })[c] ?? c)
    .replace(/[^a-z0-9]/g, "");
}

function breadcrumbCikar(): { il: string | null; ilce: string | null; mahalle: string | null } {
  const boş = { il: null, ilce: null, mahalle: null };

  // ÖNCE URL slug'larını al — sayfanın "ground truth"u
  // Hepsiemlak URL'si /[en/]il-ilce-mahalle-satilik/... formatında, hep güvenilir
  const urlLok = urldenLokasyon();
  const urlSlugs = [urlLok.il, urlLok.ilce, urlLok.mahalle]
    .filter((s): s is string => !!s)
    .map(asciiSlug);

  // Strategy 0 (en güvenilir): Sayfadaki TÜM anchor'ları URL slug'larıyla eşleştir.
  // EN sayfalarda breadcrumb sonunda "Zoned - Residential" gibi land type item'ları
  // var. Bu, slug match yaptığı için doğru lokasyon item'larını seçer ve kategori
  // sızıntısını önler. Anchor metni Türkçe karakter içerirse onu döner (display friendly).
  if (urlSlugs.length >= 2) {
    const tümAnchorlarText = Array.from(document.querySelectorAll<HTMLAnchorElement>("a"))
      .map((a) => a.textContent?.trim() ?? "")
      .filter((t) => t.length > 0 && t.length < 60);
    const matched: (string | null)[] = [null, null, null];
    for (const t of tümAnchorlarText) {
      const slug = asciiSlug(t);
      if (!slug) continue;
      const idx = urlSlugs.indexOf(slug);
      if (idx >= 0 && matched[idx] == null) matched[idx] = t;
      // Bazen anchor metni "Yenikonacık Mah." → URL slug "yenikonacik" — strip mh
      if (idx < 0) {
        const stripped = slug.replace(/(mahallesi|mahalle|mah|mh|koyu|koy)$/i, "");
        const idx2 = urlSlugs.indexOf(stripped);
        if (idx2 >= 0 && matched[idx2] == null) matched[idx2] = t;
      }
    }
    if (matched[0] && matched[1]) {
      return {
        il: matched[0],
        ilce: matched[1],
        // Mahalle anchor'ı bulunmadıysa URL slug'ından geri çevir (ASCII)
        mahalle: matched[2] ?? urlLok.mahalle,
      };
    }
  }
  const GECERSİZ = new Set([
    // TR kategoriler
    "Anasayfa", "Emlak", "Arsa", "Konut", "Tarla", "Bahçe", "Bahce",
    "Satılık", "Satilik", "Kiralık", "Kiralik", "Tümü", "Tumu",
    "Hepsiemlak", "Geri", "İlan", "Ilan", "Detay",
    "Mahalleler", "Mahalle", "Köyler", "Köy", "Beldeler", "Belde",
    // UI butonlar
    "Karşılaştır", "Vazgeç", "Kaydet", "Favori", "Favoriler",
    "Hesabım", "Çıkış", "İlana Git", "Mağazaya Git", "Şikayet Et",
    // EN kategoriler — Hepsiemlak'ın /en/ versiyonu
    "Home", "Real Estate", "RealEstate", "Land", "Field", "Garden",
    "For Sale", "Sale", "For Rent", "Rent", "All", "Listing", "Detail",
    "Apartment", "House", "Villa", "Office", "Shop", "Property",
    "Compare", "Save", "Cancel", "Account", "Logout",
  ]);

  const MAHALLE_SUFFIX_RE = /(?:Mah\.?|Mh\.?|Mahalle(?:si)?|Köy[üu]?|Beldesi|Belde|Mevkii?|Sitesi?|Bölgesi)$/i;

  // 1) "Mh." / "Mahallesi" / "Köyü" içeren anchor → parent chain'de komşu links
  // TÜM anchor'ları gez, en iyi skoru kazananı seç (early-return değil) +
  // il/ilçe slot'ında mahalle suffix varsa adayı reddet ("diğer mahalleler" widget'ından korunma)
  const tümAnchorlar = Array.from(document.querySelectorAll<HTMLAnchorElement>("a"));
  let globalBest: { score: number; anchors: string[]; idx: number } | null = null;

  for (const a of tümAnchorlar) {
    const mahalle = a.textContent?.trim() ?? "";
    if (mahalle.length < 3 || mahalle.length > 60) continue;
    if (!MAHALLE_SUFFIX_RE.test(mahalle)) continue;
    if (GECERSİZ.has(mahalle)) continue;

    let el: Element | null = a.parentElement;

    for (let depth = 0; depth < 6; depth++) {
      if (!el) break;
      const allAnchors = Array.from(el.querySelectorAll<HTMLAnchorElement>("a"));
      const hasAnasayfa = allAnchors.some((x) => {
        const t = x.textContent?.trim();
        return t === "Anasayfa" || t === "Ana Sayfa" || t === "Home";
      });

      const anchors = allAnchors
        .map((x) => x.textContent?.trim())
        .filter((t): t is string => !!t && t.length > 0 && t.length < 60 && !GECERSİZ.has(t));

      if (anchors.length >= 2 && anchors.length <= 12) {
        const idx = anchors.lastIndexOf(mahalle);
        if (idx >= 1) {
          // il/ilçe slot validasyonu — mahalle adı olamaz
          const ilCand = anchors[0] ?? "";
          const ilceCand = anchors[1] ?? "";
          if (MAHALLE_SUFFIX_RE.test(ilCand)) { el = el.parentElement; continue; }
          if (anchors.length >= 3 && MAHALLE_SUFFIX_RE.test(ilceCand)) { el = el.parentElement; continue; }

          const score = anchors.length + (hasAnasayfa ? 10 : 0);
          if (!globalBest || score > globalBest.score) {
            globalBest = { score, anchors, idx };
          }
        }
      }
      el = el.parentElement;
    }
  }

  if (globalBest) {
    // il = anchors[0], ilçe = anchors[1] (sub-level içeren chain'lere dayanıklı)
    return {
      il: globalBest.anchors.length >= 3 ? (globalBest.anchors[0] ?? null) : null,
      ilce:
        globalBest.anchors.length >= 3
          ? (globalBest.anchors[1] ?? null)
          : (globalBest.anchors[0] ?? null),
      mahalle: globalBest.anchors[globalBest.idx] ?? null,
    };
  }

  // 2) Bilinen Hepsiemlak lokasyon class'ları
  const lokSel = [
    ".det-area-info",
    ".detail-info-location",
    ".short-info-location",
    'div[class*="LocationInfo"]',
    'div[class*="locationInfo"]',
    'span[class*="location"]',
    '[data-testid*="location"]',
    "h2.fontRR.fz14-text",
  ];
  for (const sel of lokSel) {
    try {
      const el = document.querySelector(sel);
      const metin = el?.textContent?.trim();
      if (metin && metin.length > 2) {
        const parcalar = metin.split(/\s*[/»›,]\s*/).map((s) => s.trim()).filter(Boolean);
        if (parcalar.length >= 2) {
          return {
            il: parcalar[0] ?? null,
            ilce: parcalar[1] ?? null,
            mahalle: parcalar[2] ?? null,
          };
        }
      }
    } catch { /* skip */ }
  }

  // 3) Breadcrumb nav
  const bcSel = [
    ".breadcrumb a",
    'nav[aria-label="breadcrumb"] a',
    'div[class*="readcrumb"] a',
    'ul[class*="readcrumb"] a',
    'ol[class*="readcrumb"] a',
  ];
  for (const sel of bcSel) {
    try {
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(sel))
        .map((a) => a.textContent?.trim())
        .filter((t): t is string => !!t && t.length > 0 && !GECERSİZ.has(t));
      if (links.length >= 2) {
        const son = links.slice(-3);
        return {
          il: son.length >= 3 ? (son[0] ?? null) : null,
          ilce: son[son.length >= 3 ? 1 : 0] ?? null,
          mahalle: son[son.length - 1] ?? null,
        };
      }
    } catch { /* skip */ }
  }

  // 4) Meta tag fallback
  try {
    for (const mSel of ['meta[property="og:description"]', 'meta[name="description"]']) {
      const c = document.querySelector<HTMLMetaElement>(mSel)?.content ?? "";
      const m = /([A-ZÇŞĞÜÖİ][a-zçşğüöı]+(?:\s+[A-ZÇŞĞÜÖİ][a-zçşğüöı]+)*)\s*\/\s*([A-ZÇŞĞÜÖİ][a-zçşğüöı]+(?:\s+[A-ZÇŞĞÜÖİ][a-zçşğüöı]+)*)\s*\/\s*([A-ZÇŞĞÜÖİ][a-zçşğüöı]+(?:\s+[A-ZÇŞĞÜÖİ][a-zçşğüöı]+)*\s*(?:Mah(?:allesi|alle)?|Mh|Köy[üu]?|Belde(?:si)?|Mevkii?|Sitesi?)\.?)/i.exec(c);
      if (m) return { il: m[1] ?? null, ilce: m[2] ?? null, mahalle: m[3]?.trim() ?? null };
    }
  } catch { /* skip */ }

  return boş;
}

function jsonLdParse(): Record<string, unknown> | null {
  const scripts = document.querySelectorAll<HTMLScriptElement>(
    'script[type="application/ld+json"]',
  );
  for (const s of scripts) {
    try {
      const data = JSON.parse(s.textContent || "{}");
      if (data["@type"] === "Product" || data["@type"] === "RealEstateListing") return data;
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item["@type"] === "Product" || item["@type"] === "RealEstateListing") return item;
        }
      }
    } catch { /* ignore */ }
  }
  return null;
}

/**
 * Hepsiemlak ilan koordinatı — 3 katmanlı:
 *   1) `__NEXT_DATA__` JSON → `props.pageProps.listing.geoLocation` veya `.coordinates`
 *   2) JSON-LD `geo.{latitude,longitude}`
 *   3) DOM `[data-map-coordinate]`, `#listing-map[data-lat]`
 *
 * Hepsiemlak Next.js + SSR yapıda; __NEXT_DATA__ en güvenilir kaynak.
 */
function koordExtractHepsi(jsonLd: Record<string, unknown> | null): {
  lat: number;
  lng: number;
} | null {
  const inRange = (lat: number, lng: number): boolean =>
    Number.isFinite(lat) && Number.isFinite(lng) && lat > 35 && lat < 43 && lng > 25 && lng < 46;

  // 1) __NEXT_DATA__
  try {
    const nd = document.getElementById("__NEXT_DATA__");
    if (nd?.textContent) {
      const data = JSON.parse(nd.textContent) as Record<string, unknown>;
      const listing = ((data["props"] as Record<string, unknown> | undefined)?.["pageProps"] as
        | Record<string, unknown>
        | undefined)?.["listing"] as Record<string, unknown> | undefined;
      const candidates: Array<{ lat?: unknown; lng?: unknown; latitude?: unknown; longitude?: unknown } | undefined> = [
        listing?.["geoLocation"] as { lat?: unknown; lng?: unknown } | undefined,
        listing?.["coordinates"] as { lat?: unknown; lng?: unknown } | undefined,
        listing?.["location"] as { latitude?: unknown; longitude?: unknown } | undefined,
        (listing?.["mapLocation"] as { lat?: unknown; lng?: unknown } | undefined),
      ];
      for (const c of candidates) {
        if (!c) continue;
        const latRaw = (c.lat ?? c.latitude) as number | string | undefined;
        const lngRaw = (c.lng ?? c.longitude) as number | string | undefined;
        const lat = typeof latRaw === "string" ? parseFloat(latRaw) : (latRaw as number | undefined);
        const lng = typeof lngRaw === "string" ? parseFloat(lngRaw) : (lngRaw as number | undefined);
        if (typeof lat === "number" && typeof lng === "number" && inRange(lat, lng)) {
          return { lat, lng };
        }
      }
    }
  } catch {
    // __NEXT_DATA__ parse hatası — fallback'e geç
  }

  // 2) JSON-LD geo
  const geo = jsonLd?.["geo"] as Record<string, unknown> | undefined;
  if (geo) {
    const latRaw = geo["latitude"];
    const lngRaw = geo["longitude"];
    const lat = typeof latRaw === "string" ? parseFloat(latRaw) : (latRaw as number | undefined);
    const lng = typeof lngRaw === "string" ? parseFloat(lngRaw) : (lngRaw as number | undefined);
    if (typeof lat === "number" && typeof lng === "number" && inRange(lat, lng)) return { lat, lng };
  }

  // 3) DOM
  const mapEl = document.querySelector<HTMLElement>(
    "[data-map-coordinate], #listing-map[data-lat], [data-lat][data-lng]",
  );
  if (mapEl) {
    const coordStr = mapEl.getAttribute("data-map-coordinate");
    if (coordStr) {
      const parts = coordStr.split(",").map((s) => parseFloat(s.trim()));
      if (parts.length === 2 && inRange(parts[0]!, parts[1]!)) {
        return { lat: parts[0]!, lng: parts[1]! };
      }
    }
    const lat = parseFloat(mapEl.dataset["lat"] ?? "");
    const lng = parseFloat(mapEl.dataset["lng"] ?? mapEl.dataset["lon"] ?? "");
    if (inRange(lat, lng)) return { lat, lng };
  }

  return null;
}

function txt(...selectors: string[]): string | null {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el?.textContent && el.textContent.trim().length > 0) return el.textContent.trim();
    } catch { /* invalid selector */ }
  }
  return null;
}

function normalize(k: string): string {
  return k
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" })[c] ?? c)
    .replace(/[^a-z0-9]/g, "");
}

function parseFiyat(s: string | null): { fiyat: number | null; paraBirimi: string | null } {
  if (!s) return { fiyat: null, paraBirimi: null };
  let paraBirimi = "TL";
  if (/USD|\$/.test(s)) paraBirimi = "USD";
  else if (/EUR|€/.test(s)) paraBirimi = "EUR";
  else if (/TL|TRY|₺/.test(s)) paraBirimi = "TL";
  const sayilar = s.replace(/[^\d.,]/g, "").trim();
  if (!sayilar) return { fiyat: null, paraBirimi };
  let normalized: string;
  if (sayilar.includes(",") && sayilar.includes(".")) {
    normalized = sayilar.replace(/\./g, "").replace(",", ".");
  } else if (sayilar.includes(",")) {
    const lastComma = sayilar.lastIndexOf(",");
    const afterComma = sayilar.length - lastComma - 1;
    normalized = afterComma === 3 ? sayilar.replace(/,/g, "") : sayilar.replace(",", ".");
  } else {
    const lastDot = sayilar.lastIndexOf(".");
    const afterDot = sayilar.length - lastDot - 1;
    normalized = afterDot === 3 || sayilar.split(".").length > 2
      ? sayilar.replace(/\./g, "")
      : sayilar;
  }
  const n = Number.parseFloat(normalized);
  return { fiyat: Number.isFinite(n) ? n : null, paraBirimi };
}

function parseM2(s: string | null): number | null {
  if (!s) return null;
  const sayilar = s.replace(/[^\d.,]/g, "");
  if (!sayilar) return null;
  let normalized: string;
  if (sayilar.includes(",") && sayilar.includes(".")) {
    normalized = sayilar.replace(/\./g, "").replace(",", ".");
  } else if (sayilar.includes(".") && sayilar.split(".").length > 2) {
    normalized = sayilar.replace(/\./g, "");
  } else if (sayilar.includes(".")) {
    const afterDot = sayilar.length - sayilar.lastIndexOf(".") - 1;
    normalized = afterDot === 3 ? sayilar.replace(/\./g, "") : sayilar;
  } else {
    normalized = sayilar.replace(",", ".");
  }
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseSayi(s: string | null): number | null {
  if (!s) return null;
  const onlyDigits = s.replace(/[^\d]/g, "");
  if (!onlyDigits) return null;
  const n = Number.parseInt(onlyDigits, 10);
  return Number.isFinite(n) ? n : null;
}

function aciklamadanAdaParselCikar(
  aciklama: string,
): { ada?: number; parsel?: number }[] {
  const out: { ada?: number; parsel?: number }[] = [];
  const patterns = [
    /ada[\s:no.#]*?(\d{1,6})[\s\-/,vea.&]*?parsel[\s:no.#]*?(\d{1,6})/gi,
    /(\d{1,6})\s*ada[\s\-/,vea.]*?(\d{1,6})\s*parsel/gi,
    /ada\s*no[\s:.]*?(\d{1,6})[\s\S]{0,30}parsel\s*no[\s:.]*?(\d{1,6})/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(aciklama)) !== null) {
      const ada = Number(m[1]);
      const parsel = Number(m[2]);
      if (ada > 0 && parsel > 0 && ada < 100000 && parsel < 100000) {
        if (!out.some((p) => p.ada === ada && p.parsel === parsel)) {
          out.push({ ada, parsel });
        }
      }
    }
  }
  return out.slice(0, 5);
}

/**
 * Hepsiemlak URL'i her zaman lokasyon slug'ı içerir:
 *   /[en/]<il>-<ilce>-<mahalle>-satilik/<tip>/<id>
 *   /[en/]<il>-<ilce>-<mahalle>-kiralik/<tip>/<id>
 * DOM'dan lokasyon alamadığımızda güvenilir fallback.
 *
 * Slug ASCII'dir ("cukurcimen") — gerçek mahalle adı "Çukurçimen". Bu fonksiyon
 * URL'den ASCII versiyonu döner; eşleşme TKGM tarafında zaten ASCII-normalize edildiği
 * için sorun olmaz, sadece display'de İngilizce karakter görünebilir.
 */
function urldenLokasyon(): { il: string | null; ilce: string | null; mahalle: string | null } {
  const path = location.pathname.replace(/^\/en\//, "/").replace(/^\/tr\//, "/");
  // /<lokasyon-slug>-(satilik|kiralik) → location-slug
  const m = /\/([a-z0-9-]+?)-(?:satilik|kiralik)(?:\/|$)/i.exec(path);
  if (!m || !m[1]) return { il: null, ilce: null, mahalle: null };
  const parts = m[1].split("-").filter(Boolean);
  if (parts.length < 2) return { il: null, ilce: null, mahalle: null };
  const cap = (s: string) => s.charAt(0).toLocaleUpperCase("tr") + s.slice(1);
  return {
    il: cap(parts[0] ?? ""),
    ilce: cap(parts[1] ?? ""),
    mahalle: parts.length >= 3 ? parts.slice(2).map(cap).join(" ") : null,
  };
}

/**
 * "138 / 19" / "138/19" / "Ada 138 Parsel 19" → { ada: 138, parsel: 19 }
 * Hepsiemlak ada+parsel'i tek field'da combine ederek verebiliyor.
 */
function ayirAdaParsel(s: string | null): { ada: number | null; parsel: number | null } {
  if (!s) return { ada: null, parsel: null };
  // "Ada X Parsel Y" pattern
  const m1 = /ada[\s:.#]*(\d{1,6})[\s\S]{0,15}parsel[\s:.#]*(\d{1,6})/i.exec(s);
  if (m1 && m1[1] && m1[2]) {
    const a = Number(m1[1]); const p = Number(m1[2]);
    if (a > 0 && p > 0 && a < 100000 && p < 100000) return { ada: a, parsel: p };
  }
  // "138 / 19" pattern — slash veya tire ile ayrılmış 2 sayı
  const m2 = /^\s*(\d{1,6})\s*[/\\\-]\s*(\d{1,6})\s*$/.exec(s);
  if (m2 && m2[1] && m2[2]) {
    const a = Number(m2[1]); const p = Number(m2[2]);
    if (a > 0 && p > 0 && a < 100000 && p < 100000) return { ada: a, parsel: p };
  }
  return { ada: null, parsel: null };
}

// Manuel debug için global hook
(window as unknown as { __arsaHepsiDebug?: () => IlanBilgisi }).__arsaHepsiDebug = () =>
  parselDOM(true);
