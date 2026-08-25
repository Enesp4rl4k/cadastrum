/**
 * Emlakjet.com ilan detay sayfası içerik scripti.
 *
 * Sayfayı SADECE okur, hiçbir şey değiştirmez. Kullanıcı sayfayı zaten
 * görüntülüyor; ekstra istek gönderilmiyor. Veri chrome.storage.session
 * üzerinden side panel'e iletilir, oradan TKGM sorgusu yapılarak doğrulanır.
 *
 * URL örneği:
 *   https://www.emlakjet.com/ilan/bodrum-gokpinar-da-asfalt-yola-cepheli-717-m-satilik-tarla-pazarlikli-19680530
 *
 * DOM yapısı (2024-2026 gözlemi):
 *   - Başlık: h1[class*="title"], h1[class*="Title"], h1
 *   - Fiyat:  [class*="price"], [class*="Price"], [data-testid="price"]
 *   - Bilgi tablosu: [class*="detail"], dl dt/dd çiftleri, [class*="feature"]
 *   - JSON-LD: <script type="application/ld+json"> (RealEstateListing)
 *   - __NEXT_DATA__: window.__NEXT_DATA__ (Next.js SSR)
 */

import type { IlanBilgisi } from "../types/ilan";
import { createContextGuard } from "./context-guard";
import { yerTemizleVeDogrula } from "../lib/yer-temizle";

const guard = createContextGuard("[arsa-ej]");

/** Detay sayfası URL kontrolü — ilan/ segment + sonunda numerik id */
function detayMi(): boolean {
  return /emlakjet\.com\/ilan\/.+-\d{5,12}\/?(\?|#|$)/.test(location.href);
}

console.log("[arsa-ej] emlakjet content script yüklendi", {
  url: location.href,
  detayMi: detayMi(),
});

function guvenliMesajGonder(msg: unknown): void {
  guard.mesajGonder(msg);
}

let lastSentIlanNo = "";

(function init() {
  let sonUrl = "";

  const tarama = () => {
    if (!guard.gecerli()) return;
    if (location.href === sonUrl) return;
    sonUrl = location.href;
    lastSentIlanNo = "";

    if (!detayMi()) {
      console.log("[arsa-ej] detay değil, atlanıyor:", location.href);
      return;
    }

    console.log("[arsa-ej] detay sayfası tespit, parse başlıyor:", location.href);

    // İlk deneme — 800ms (Next.js hydration tamamlanmış olur)
    setTimeout(() => {
      try { parseliCalistir(); } catch (e) {
        if (!guard.contextGecersiz(e)) console.error("[arsa-ej] parse hatası (800ms):", e);
      }
    }, 800);

    // İkinci deneme — 2500ms (yavaş bağlantı / lazy load)
    setTimeout(() => {
      try { parseliCalistir(); } catch (e) {
        if (!guard.contextGecersiz(e)) console.error("[arsa-ej] parse hatası (2500ms):", e);
      }
    }, 2500);
  };

  tarama();
  guard.kaydet(setInterval(tarama, 2000));

  window.addEventListener("popstate", () => {
    setTimeout(tarama, 0);
  });
})();

function parseliCalistir(): void {
  const ilan = parselDOM();

  if (!ilan.baslik && !ilan.fiyat && !ilan.adaNo && !ilan.ilanNo) {
    console.log("[arsa-ej] parseDOM verisi boş — DOM selector match etmemiş veya sayfa hazır değil", {
      url: location.href,
      h1Var: !!document.querySelector("h1"),
    });
    return;
  }

  const ilanKey = ilan.ilanNo ?? ilan.url;
  if (ilanKey === lastSentIlanNo) return;
  lastSentIlanNo = ilanKey;

  console.log("[arsa-ej] emlakjet ilan tespit:", {
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

/* ── DOM parse ─────────────────────────────────────────────────────────── */

function parselDOM(): IlanBilgisi {
  // ── Başlık ──────────────────────────────────────────────────────────────
  const baslik = txt(
    'h1[class*="title"]',
    'h1[class*="Title"]',
    'h1[class*="header"]',
    "h1",
  );

  // ── Fiyat ───────────────────────────────────────────────────────────────
  const fiyatStr = txt(
    '[data-testid="price"]',
    '[class*="price__value"]',
    '[class*="priceValue"]',
    '[class*="PriceValue"]',
    '[class*="price-value"]',
    '[class*="listing-price"]',
    '[class*="listingPrice"]',
    '[class*="detail-price"]',
    '[class*="Price"]',
    '[class*="price"]',
  );
  const { fiyat, paraBirimi } = parseFiyat(fiyatStr);

  // ── İlan No — URL'nin son numerik segmenti ───────────────────────────────
  // Emlakjet URL: /ilan/[slug]-[numerik-id]
  const ilanNoFromUrl = /(\d{5,12})\/?(?:\?|#|$)/.exec(location.pathname)?.[1] ?? null;

  // ── JSON-LD fallback ─────────────────────────────────────────────────────
  const jsonLd = jsonLdParse();

  // ── __NEXT_DATA__ fallback (Next.js SSR) ─────────────────────────────────
  const nextData = nextDataParse();

  // ── Breadcrumb / URL'den lokasyon ────────────────────────────────────────
  const urlLok = urldenLokasyon();
  const breadcrumb = breadcrumbCikar();

  // ── Özellikler tablosu ───────────────────────────────────────────────────
  const tablo = bilgiTablosuCikar();

  // ── Açıklama (ada/parsel ipucu) ──────────────────────────────────────────
  const aciklama = txt(
    '[class*="description"]',
    '[class*="Description"]',
    '[class*="detail-desc"]',
    "#description",
    ".description",
  );
  const aciklamadaAdaParsel = aciklamadanAdaParselCikar(aciklama ?? "");

  // ── Lokasyon öncelik zinciri ─────────────────────────────────────────────
  // Breadcrumb > URL slug > Tablo > JSON-LD > __NEXT_DATA__
  const ilHam =
    breadcrumb.il ??
    urlLok.il ??
    tablo["il"] ?? tablo["sehir"] ?? tablo["city"] ??
    (jsonLd?.address as Record<string, string> | undefined)?.addressRegion ??
    nextData?.il ?? null;

  const ilceHam =
    breadcrumb.ilce ??
    urlLok.ilce ??
    tablo["ilce"] ?? tablo["district"] ??
    (jsonLd?.address as Record<string, string> | undefined)?.addressLocality ??
    nextData?.ilce ?? null;

  const mahalleHam =
    breadcrumb.mahalle ??
    urlLok.mahalle ??
    tablo["mahalle"] ?? tablo["neighborhood"] ??
    nextData?.mahalle ?? null;

  const il = yerTemizleVeDogrula(ilHam, "il");
  const ilce = yerTemizleVeDogrula(ilceHam, "ilce");
  const mahalle = yerTemizleVeDogrula(mahalleHam, "mahalle");

  // ── Ada / Parsel ─────────────────────────────────────────────────────────
  // Emlakjet bazen "Ada No / Parsel No: 116 / 977" birleşik verebiliyor
  const plotParcel =
    tablo["adaparselno"] ?? tablo["adaparsel"] ?? tablo["plotparcelno"] ?? null;
  const { ada: pAda, parsel: pParsel } = ayirAdaParsel(plotParcel);

  const adaNo =
    parseSayi(tablo["adano"] ?? tablo["ada"] ?? tablo["plotno"] ?? null) ??
    pAda ??
    aciklamadaAdaParsel[0]?.ada ??
    nextData?.adaNo ?? null;

  const parselNo =
    parseSayi(tablo["parselno"] ?? tablo["parsel"] ?? tablo["parcelno"] ?? null) ??
    pParsel ??
    aciklamadaAdaParsel[0]?.parsel ??
    nextData?.parselNo ?? null;

  // ── Alan (m²) ────────────────────────────────────────────────────────────
  const m2 =
    parseM2(
      tablo["metrekare"] ??
      tablo["m2"] ??
      tablo["alan"] ??
      tablo["arsaalani"] ??
      tablo["arsam2"] ??
      tablo["area"] ??
      tablo["size"] ??
      tablo["squaremeters"] ?? null,
    ) ??
    (jsonLd?.floorSize as number | undefined) ??
    nextData?.m2 ?? null;

  // ── İmar durumu ──────────────────────────────────────────────────────────
  const imarDurumu =
    tablo["imardurumu"] ?? tablo["imar"] ?? tablo["tapudurumu"] ??
    tablo["arsadurumu"] ?? tablo["zoningstatus"] ?? tablo["landtype"] ?? null;

  // ── Koordinat (JSON-LD geo veya __NEXT_DATA__) ───────────────────────────
  const koord = koordExtract(jsonLd, nextData);

  const ilanNo = ilanNoFromUrl ??
    tablo["emlakjetno"] ?? tablo["ilanno"] ??
    (jsonLd?.identifier as string | undefined) ?? null;

  return {
    kaynak: "emlakjet",
    url: location.href,
    baslik: baslik ?? (jsonLd?.name as string | undefined) ?? null,
    fiyat,
    fiyatStr: fiyatStr ?? null,
    paraBirimi,
    m2,
    il,
    ilce,
    mahalle,
    adaNo,
    parselNo,
    pafta: tablo["pafta"] ?? null,
    imarDurumu,
    ilanNo,
    aciklamadaAdaParsel,
    yakalanmaZamani: Date.now(),
    lat: koord?.lat ?? null,
    lng: koord?.lng ?? null,
    koordKaynagi: koord ? "dom" : null,
    koordDogruluk: koord ? "yuksek" : null,
  };
}

/* ── Yardımcı: tek text seçici ──────────────────────────────────────────── */

function txt(...selectors: string[]): string | null {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      const t = el?.textContent?.trim();
      if (t) return t;
    } catch { /* geçersiz selector */ }
  }
  return null;
}

/* ── Fiyat parse ────────────────────────────────────────────────────────── */

function parseFiyat(str: string | null): { fiyat: number | null; paraBirimi: string | null } {
  if (!str) return { fiyat: null, paraBirimi: null };

  const paraBirimi = str.includes("₺") || /TL/i.test(str)
    ? "TL"
    : str.includes("$") ? "USD"
    : str.includes("€") ? "EUR"
    : "TL"; // Emlakjet Türkiye'de hep TL

  const temiz = str.replace(/[₺$€TL\s.]/gi, "").replace(",", ".");
  const sayi = parseFloat(temiz);
  return { fiyat: isNaN(sayi) ? null : sayi, paraBirimi };
}

/* ── Alan parse ─────────────────────────────────────────────────────────── */

function parseM2(str: string | null): number | null {
  if (!str) return null;
  const temiz = str.replace(/m[²2]?/gi, "").replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(temiz);
  return isNaN(n) || n <= 0 ? null : n;
}

/* ── Sayı parse ─────────────────────────────────────────────────────────── */

function parseSayi(str: string | null): number | null {
  if (!str) return null;
  const n = parseInt(str.replace(/\D/g, ""), 10);
  return isNaN(n) ? null : n;
}

/* ── Ada/Parsel ayır ────────────────────────────────────────────────────── */

function ayirAdaParsel(str: string | null): { ada: number | null; parsel: number | null } {
  if (!str) return { ada: null, parsel: null };
  // "116 / 977" veya "116/977"
  const eslesti = /(\d+)\s*[/\\]\s*(\d+)/.exec(str);
  if (eslesti) {
    return {
      ada: parseInt(eslesti[1]!, 10),
      parsel: parseInt(eslesti[2]!, 10),
    };
  }
  return { ada: null, parsel: null };
}

/* ── Açıklamadan ada/parsel ─────────────────────────────────────────────── */

function aciklamadanAdaParselCikar(
  metin: string,
): { ada?: number; parsel?: number }[] {
  if (!metin) return [];
  const sonuclar: { ada?: number; parsel?: number }[] = [];

  // "Ada: 116 Parsel: 977" veya "ada no: 116, parsel no: 977"
  const adaM = /ada\s*(?:no[.:])?\s*[:\s]\s*(\d+)/i.exec(metin);
  const parselM = /parsel\s*(?:no[.:])?\s*[:\s]\s*(\d+)/i.exec(metin);

  if (adaM ?? parselM) {
    sonuclar.push({
      ada: adaM ? parseInt(adaM[1]!, 10) : undefined,
      parsel: parselM ? parseInt(parselM[1]!, 10) : undefined,
    });
  }

  return sonuclar;
}

/* ── Bilgi tablosu — dl/dt/dd ve class-tabanlı listeler ────────────────── */

function bilgiTablosuCikar(): Record<string, string> {
  const tablo: Record<string, string> = {};

  function ekle(etiket: string, deger: string): void {
    const anahtar = etiket
      .toLowerCase()
      .replace(/[\s\-_:/]+/g, "")
      .replace(/[^a-z0-9çğıöşüâîû]/gi, "");
    if (anahtar && deger) tablo[anahtar] = deger.trim();
  }

  // dl > dt + dd çiftleri
  const dts = document.querySelectorAll("dl dt");
  dts.forEach((dt) => {
    const dd = dt.nextElementSibling;
    if (dd?.tagName === "DD") {
      ekle(dt.textContent ?? "", dd.textContent ?? "");
    }
  });

  // [class*="feature"] veya [class*="detail"] li'ler içinde span çiftleri
  const featureItems = document.querySelectorAll(
    '[class*="feature"] li, [class*="Feature"] li, [class*="detail"] li, [class*="Detail"] li, [class*="spec"] li',
  );
  featureItems.forEach((li) => {
    const spans = li.querySelectorAll("span, strong, b");
    if (spans.length >= 2) {
      ekle(spans[0]?.textContent ?? "", spans[1]?.textContent ?? "");
    } else {
      // "Etiket: Değer" formatı
      const metin = li.textContent ?? "";
      const idx = metin.indexOf(":");
      if (idx > 0) {
        ekle(metin.slice(0, idx), metin.slice(idx + 1));
      }
    }
  });

  // Tablo satırları
  document.querySelectorAll("table tr").forEach((tr) => {
    const cells = tr.querySelectorAll("td, th");
    if (cells.length >= 2) {
      ekle(cells[0]?.textContent ?? "", cells[1]?.textContent ?? "");
    }
  });

  return tablo;
}

/* ── JSON-LD parse ──────────────────────────────────────────────────────── */

function jsonLdParse(): Record<string, unknown> | null {
  try {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      const parsed = JSON.parse(script.textContent ?? "{}");
      const obj = Array.isArray(parsed) ? parsed[0] : parsed;
      if (obj && typeof obj === "object") return obj as Record<string, unknown>;
    }
  } catch { /* JSON parse hatası */ }
  return null;
}

/* ── __NEXT_DATA__ parse ────────────────────────────────────────────────── */

interface NextDataIlan {
  il?: string | null;
  ilce?: string | null;
  mahalle?: string | null;
  adaNo?: number | null;
  parselNo?: number | null;
  m2?: number | null;
}

function nextDataParse(): NextDataIlan | null {
  try {
    const script = document.getElementById("__NEXT_DATA__");
    if (!script) return null;
    const data = JSON.parse(script.textContent ?? "{}") as Record<string, unknown>;
    // Emlakjet Next.js yapısında ilan verisi genellikle props.pageProps.listing veya
    // props.pageProps.detail içinde bulunur
    const props = (data.props as Record<string, unknown> | undefined);
    const pageProps = props?.pageProps as Record<string, unknown> | undefined;
    const listing =
      (pageProps?.listing ?? pageProps?.detail ?? pageProps?.ilanDetay) as Record<string, unknown> | undefined;

    if (!listing) return null;

    return {
      il: strOrNull(listing["il"] ?? listing["city"] ?? listing["province"]),
      ilce: strOrNull(listing["ilce"] ?? listing["district"] ?? listing["county"]),
      mahalle: strOrNull(listing["mahalle"] ?? listing["neighborhood"] ?? listing["quarter"]),
      adaNo: numOrNull(listing["adaNo"] ?? listing["ada"] ?? listing["plotNo"]),
      parselNo: numOrNull(listing["parselNo"] ?? listing["parsel"] ?? listing["parcelNo"]),
      m2: numOrNull(listing["m2"] ?? listing["area"] ?? listing["squareMeters"]),
    };
  } catch { /* parse hatası */ }
  return null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && !isNaN(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^\d.]/g, ""));
    return isNaN(n) ? null : n;
  }
  return null;
}

/* ── Breadcrumb çıkar ───────────────────────────────────────────────────── */

function breadcrumbCikar(): { il: string | null; ilce: string | null; mahalle: string | null } {
  // Emlakjet breadcrumb: Anasayfa > İl > İlçe > Mahalle > ...
  const items: string[] = [];
  document.querySelectorAll(
    'nav[aria-label*="breadcrumb"] a, [class*="breadcrumb"] a, [class*="Breadcrumb"] a',
  ).forEach((a) => {
    const t = a.textContent?.trim();
    if (t && t !== "Anasayfa" && t !== "İlanlar") items.push(t);
  });

  if (items.length === 0) return { il: null, ilce: null, mahalle: null };

  return {
    il: items[0] ?? null,
    ilce: items[1] ?? null,
    mahalle: items[2] ?? null,
  };
}

/* ── URL'den lokasyon ───────────────────────────────────────────────────── */

/**
 * Emlakjet URL formatı:
 *   /ilan/[il]-[ilce]-[mahalle?]-[tip-aciklama]-[id]
 *
 * Slug'dan il/ilçe çıkarmak güvenilir değil çünkü birden fazla kelime
 * içerebilir. URL slug'ı sadece yedek olarak kullanıyoruz — breadcrumb
 * ve DOM tablo daha güvenilir.
 */
function urldenLokasyon(): { il: string | null; ilce: string | null; mahalle: string | null } {
  // Slug temizleyip token listesi çıkar — büyük şehirler için basit eşleştirme
  const slug = location.pathname.replace("/ilan/", "").replace(/-\d+\/?$/, "");
  const tokenler = slug.split("-").filter((t) => t.length > 1);

  // En az 2 token yoksa anlamsız
  if (tokenler.length < 2) return { il: null, ilce: null, mahalle: null };

  // İlk token il, ikinci token ilçe (heuristic) — yerTemizleVeDogrula ile valide et
  const ilHam = tokenler[0] ?? null;
  const ilceHam = tokenler[1] ?? null;

  return {
    il: ilHam ? capitalizeFirst(ilHam) : null,
    ilce: ilceHam ? capitalizeFirst(ilceHam) : null,
    mahalle: null, // Slug'dan mahalle çıkarmak çok hatalı — atla
  };
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/* ── Koordinat çıkar (JSON-LD geo + __NEXT_DATA__) ──────────────────────── */

function koordExtract(
  jsonLd: Record<string, unknown> | null,
  nextData: NextDataIlan | null,
): { lat: number; lng: number } | null {
  // JSON-LD geo
  if (jsonLd) {
    const geo = jsonLd.geo as Record<string, unknown> | undefined;
    if (geo) {
      const lat = numOrNull(geo["latitude"] ?? geo["lat"]);
      const lng = numOrNull(geo["longitude"] ?? geo["lng"] ?? geo["lon"]);
      if (lat != null && lng != null) return { lat, lng };
    }
    const lat = numOrNull(jsonLd["latitude"]);
    const lng = numOrNull(jsonLd["longitude"]);
    if (lat != null && lng != null) return { lat, lng };
  }

  // Suppress unused warning — nextData koordinat içermiyorsa null dön
  void nextData;
  return null;
}
