/**
 * Sahibinden.com ilan sayfası içerik scripti.
 *
 * Sayfayı SADECE okur, hiçbir şey değiştirmez. Kullanıcı sayfayı zaten görüntülüyor;
 * ekstra istek gönderilmiyor. Veri chrome.storage.local üzerinden side panel'e
 * iletilir, oradan TKGM sorgusu yapılarak doğrulanır.
 *
 * v2 — daha sağlam selector zinciri:
 * - 6+ alternatif başlık selector'ü
 * - 8+ fiyat selector'ü
 * - Bilgi tablosu için 4 farklı yapı kontrolü
 * - "Etiket: Değer" pattern + label-value variants
 * - Coğrafi koordinat sayfa içinden çıkarılır (varsa)
 * - JSON-LD structured data backup (sahibinden bazen embed eder)
 */

import type { IlanBilgisi } from "../types/ilan";
import { yerTemizleVeDogrula, ilIlceAyir } from "../lib/yer-temizle";
import { sahibindenUrldenLokasyon } from "../lib/lokasyon-slug";
import { createContextGuard } from "./context-guard";

const guard = createContextGuard("[arsa]");

// IIFE içinden referans alındığı için TDZ hatasından kaçınmak adına IIFE'den ÖNCE
// declare edilmeli — `let` hoist edilmez, IIFE hemen çalışıp yeniSayfaIslem
// içinden lastSentIlanNo'yu sıfırlarsa "Cannot access 'N' before initialization" atar.
let lastSentIlanNo = "";

(function init() {
  let sonUrl = "";
  let aktifObserver: MutationObserver | null = null;
  let aktifTimeout: ReturnType<typeof setTimeout> | null = null;
  let safetyTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Bilgi tablosu DOM'a geldi mi? */
  const ilanHazir = (): boolean => {
    return !!document.querySelector(
      "ul.classifiedInfoList li, .classifiedInfo, [class*='classifiedInfoList'], h1.classifiedTitle, h1[class*='classifiedTitle'], h1[class*='ClassifiedTitle']",
    );
  };

  const parseTetikle = () => {
    if (!guard.gecerli()) return;
    parseliCalistir("");
  };

  const yeniSayfaIslem = () => {
    if (!guard.gecerli()) return;
    if (!/sahibinden\.com\/ilan\//.test(location.href)) {
      sonUrl = location.href;
      return;
    }
    if (location.href === sonUrl) return;
    sonUrl = location.href;
    lastSentIlanNo = ""; // Yeni sayfa → önceki "duplicate" kilidini sıfırla

    // Eski observer/timeout temizle
    if (aktifObserver) { aktifObserver.disconnect(); aktifObserver = null; }
    if (aktifTimeout) { clearTimeout(aktifTimeout); aktifTimeout = null; }
    if (safetyTimeout) { clearTimeout(safetyTimeout); safetyTimeout = null; }

    // Hızlı yol: ilan zaten DOM'da → 100ms stabilizasyon
    if (ilanHazir()) {
      aktifTimeout = setTimeout(parseTetikle, 100);
      return;
    }

    // Aksi halde MutationObserver — info container geldiği an parse
    aktifObserver = new MutationObserver(() => {
      if (!ilanHazir()) return;
      aktifObserver?.disconnect();
      aktifObserver = null;
      aktifTimeout = setTimeout(parseTetikle, 50);
    });
    aktifObserver.observe(document.body, { childList: true, subtree: true });

    // 4sn safety — observer tetiklenmediyse mevcut DOM ile dene
    safetyTimeout = setTimeout(() => {
      if (aktifObserver) { aktifObserver.disconnect(); aktifObserver = null; }
      parseTetikle();
    }, 4000);
  };

  // İlk yükleme
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", yeniSayfaIslem, { once: true });
  } else {
    yeniSayfaIslem();
  }

  // SPA navigasyonu için URL polling — content script ISOLATED world'da çalışır,
  // sahibinden'in main-world pushState'i yakalanamaz. Polling tek güvenilir yol.
  // 1000ms — kullanıcı algısı açısından "anında" + MutationObserver hazır olunca anında parse.
  guard.kaydet(setInterval(yeniSayfaIslem, 1000));

  // popstate (geri/ileri) — bu event isolated world'a propagate olur
  window.addEventListener("popstate", () => {
    setTimeout(yeniSayfaIslem, 0);
  });
})();

function parseliCalistir(_oncekiIlanNo: string): void {
  const ilan = parselDOM();
  if (!ilan.baslik && !ilan.fiyat && !ilan.adaNo && !ilan.ilanNo) {
    console.warn("[arsa-sahibinden] hiçbir alan bulunamadı, ilan gönderilmiyor", {
      url: location.href,
    });
    return;
  }

  // Aynı ilanı tekrar gönderme (race condition + duplicate)
  const ilanKey = ilan.ilanNo ?? ilan.url;
  if (ilanKey === lastSentIlanNo) return;
  lastSentIlanNo = ilanKey;

  console.log("[arsa] sahibinden ilan tespit edildi:", {
    ilanNo: ilan.ilanNo,
    baslik: ilan.baslik?.slice(0, 60),
    fiyat: ilan.fiyatStr,
    m2: ilan.m2,
    il: ilan.il,
    ilce: ilan.ilce,
    mahalle: ilan.mahalle,
    ada: ilan.adaNo,
    parsel: ilan.parselNo,
  });

  guard.mesajGonder({ tip: "ilan-tespit", ilan });
}

function parselDOM(debug = false): IlanBilgisi {
  const baslik = txt(
    "h1.classifiedTitle",
    'h1[class*="classifiedTitle"]',
    'h1[class*="ClassifiedTitle"]',
    'h1[data-testid="classified-title"]',
    "h1.product-title",
    "h1",
  );

  const fiyatStr = txt(
    ".classifiedInfo .classified-price-wrapper .classified-price",
    'div[class*="classifiedPrice"]',
    'div[class*="ClassifiedPrice"]',
    'span[class*="price"]',
    'div[data-testid="price"]',
    ".price",
    ".product-price",
    'h3[class*="price"]',
  );

  const { fiyat, paraBirimi } = parseFiyat(fiyatStr);

  // Bilgi tablosu — birkaç farklı yapı dene
  const tablo = bilgiTablosuCikar();

  const aciklama = txt(
    "#classifiedDescription",
    'div[class*="classifiedDescription"]',
    'div[class*="ClassifiedDescription"]',
    'div[data-testid="description"]',
    'div[class*="description"]',
    ".description",
  );

  const aciklamadaAdaParsel = aciklamadanAdaParselCikar(aciklama ?? "");

  // JSON-LD'de gizli structured data var mı? (sahibinden bazen ekler)
  const jsonLd = jsonLdParse();
  const ldAddress = jsonLd?.address as Record<string, string> | undefined;
  const ldName = jsonLd?.name as string | undefined;
  const ldId = jsonLd?.identifier as string | undefined;
  const ldFloorSize = jsonLd?.floorSize as number | undefined;

  const breadcrumb = breadcrumbCikar();
  // Öncelik: BREADCRUMB önce (sahibinden'in kendi sınıflandırması, en güvenilir).
  // Tablo satıcı tarafından girilen serbest metin — sıkça yanlış (örn. il yerine semt,
  // mahalle yerine başka mahalle). Sadece breadcrumb yetersizse tabloya başvur.
  const breadcrumbTam = breadcrumb.il && breadcrumb.ilce && breadcrumb.mahalle;

  // Tablo "il/ilçe" tek değer olabilir: "Tekirdağ/Marmara Ereğlisi" → ayır
  const tabloIlIlce = ilIlceAyir(tablo["ililce"] ?? tablo["konum"] ?? null);

  const urlLok = sahibindenUrldenLokasyon(location.href);
  const ilHam =
    breadcrumb.il ?? tablo["il"] ?? tabloIlIlce.il ?? urlLok.il ?? ldAddress?.region ?? null;
  const ilceHam =
    breadcrumb.ilce ?? tablo["ilce"] ?? tabloIlIlce.ilce ?? urlLok.ilce ?? ldAddress?.locality ?? null;
  const mahalleHam =
    breadcrumb.mahalle ??
    (breadcrumbTam ? null : tablo["mahalle"]) ??
    urlLok.mahalle ??
    null;

  // Temizle + doğrula — "Yeniçiftlik(Sahil)" → "Yeniçiftlik", "Mh." suffix'i sil, vb.
  const il = yerTemizleVeDogrula(ilHam, "il");
  const ilce = yerTemizleVeDogrula(ilceHam, "ilce");
  const mahalle = yerTemizleVeDogrula(mahalleHam, "mahalle");
  // Diagnostic — kullanıcı debug için console'da görebilir
  if (typeof console !== "undefined") {
    console.log("[arsa-sahibinden] yer cıkarımı:", {
      tablo: { il: tablo["il"], ilce: tablo["ilce"], mahalle: tablo["mahalle"] },
      breadcrumb,
      jsonLd: ldAddress ? { region: ldAddress.region, locality: ldAddress.locality } : null,
      sonuc: { il, ilce, mahalle },
    });
  }

  const adaNo =
    parseSayi(tablo["adano"] ?? tablo["ada"] ?? null) ??
    aciklamadaAdaParsel[0]?.ada ?? null;
  const parselNo =
    parseSayi(tablo["parselno"] ?? tablo["parsel"] ?? null) ??
    aciklamadaAdaParsel[0]?.parsel ?? null;

  // İlan No — URL'den de çekilebilir (sahibinden URL pattern: /ilan/.../{id})
  const ilanNoFromUrl = /\/ilan\/[^/]+(?:-(\d{8,11}))(?:\/|$|\?)/.exec(location.href)?.[1] ?? null;
  const ilanNo = tablo["ilanno"] ?? ilanNoFromUrl ?? ldId ?? null;

  // Faz 2 — koordinat extract (Spatial emsal motoru için)
  const koord = koordExtract(jsonLd);

  const ilan: IlanBilgisi = {
    kaynak: "sahibinden",
    url: location.href,
    baslik: baslik ?? ldName ?? null,
    fiyat,
    fiyatStr: fiyatStr ?? null,
    paraBirimi,
    m2:
      parseM2(
        tablo["metrekare"] ??
          tablo["m"] ??
          tablo["arsam"] ??
          tablo["arsam2"] ??
          tablo["brutm"] ??
          tablo["netm"] ??
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
    console.group("[arsa] sahibinden parse debug");
    console.log("URL:", location.href);
    console.log("Bilgi tablosu (normalized):", tablo);
    console.log("JSON-LD:", jsonLd);
    console.log("İlan:", ilan);
    console.groupEnd();
  }

  // S3.4 — DOM anomaly tespit: parse fail kritik alanlarda → admin'i bilgilendir
  if (!ilan.fiyat || !ilan.m2 || !ilan.il) {
    // Dinamik import — circular ve build size etkisini azalt
    import("../lib/sahibinden-dom-monitor")
      .then((m) => m.anomalyKaydet(location.href))
      .catch(() => { /* ignore */ });
  }

  return ilan;
}

/**
 * Sahibinden bilgi tablosu — 4 farklı yapı denenir:
 * 1. ul.classifiedInfoList → li > strong + span (klasik)
 * 2. .classifiedInfo dl > dt + dd (yeni stil)
 * 3. .classifiedInfo .uiBoxContainer li
 * 4. data-testid="info-table" tr td
 */
function bilgiTablosuCikar(): Record<string, string> {
  const tablo: Record<string, string> = {};
  const sayac = { p1: 0, p2: 0, p3: 0, p4Etiket: 0 };

  // Pattern 1: ul.classifiedInfoList li > strong + span
  const liler = document.querySelectorAll<HTMLLIElement>(
    "ul.classifiedInfoList li, .classifiedInfo li, .uiBoxContainer li, .classifiedDetail li",
  );
  for (const li of liler) {
    const strong = li.querySelector("strong, .label, span:first-child");
    const value = li.querySelector("span:not(:first-child), .value, em");
    if (strong && value) {
      const k = (strong.textContent ?? "").trim();
      const v = (value.textContent ?? "").trim();
      if (k && v) {
        tablo[normalize(k)] = v;
        sayac.p1++;
      }
    }
  }

  // Pattern 2: dl > dt + dd
  const dts = document.querySelectorAll<HTMLElement>("dl dt");
  for (const dt of dts) {
    const dd = dt.nextElementSibling;
    if (dd && dd.tagName === "DD") {
      const k = (dt.textContent ?? "").trim();
      const v = (dd.textContent ?? "").trim();
      if (k && v) {
        tablo[normalize(k)] = v;
        sayac.p2++;
      }
    }
  }

  // Pattern 3: tr > td (ada tablo varyantı)
  // Sadece ilan-bilgi container'larındaki <tr>'ları al — sayfanın diğer
  // tablolarından (benzer ilanlar, mağaza vb.) değer sızdırma
  const trScopes = document.querySelectorAll<HTMLElement>(
    '.classifiedInfo, [class*="classified"], [class*="Classified"], [class*="detail" i], [class*="Detail"]',
  );
  const seenTr = new Set<HTMLElement>();
  for (const scope of trScopes) {
    for (const tr of scope.querySelectorAll<HTMLElement>("tr")) {
      if (seenTr.has(tr)) continue;
      seenTr.add(tr);
      const cells = tr.querySelectorAll("td, th");
      if (cells.length >= 2) {
        const k = (cells[0]?.textContent ?? "").trim();
        const v = (cells[1]?.textContent ?? "").trim();
        if (k && v && k.length < 30) {
          tablo[normalize(k)] = v;
          sayac.p3++;
        }
      }
    }
  }

  // Pattern 4: Etiket-metni-tabanlı (class-bağımsız, en dayanıklı)
  // Sahibinden CSS class'ları obfuscate ettiğinde Pattern 1-3 boş döner;
  // bu pattern bilinen Türkçe etiket metnini arayıp kardeş/parent'tan değer çıkarır.
  const HEDEF_ETIKETLER = new Set(
    [
      "İlan No", "İlan Tarihi", "Emlak Tipi", "İmar Durumu",
      "m²", "m² Fiyatı", "Metrekare", "Brüt m²", "Net m²",
      "Ada No", "Parsel No", "Pafta No",
      "Kaks (Emsal)", "Kaks", "Emsal", "Gabari",
      "Krediye Uygunluk", "Tapu Durumu", "Kimden", "Takas",
      // İl/İlçe/Mahalle/Konum kasten YOK — bu alanlar breadcrumb'dan çekiliyor.
      // Pattern 4 sayfanın her yerinde "İl"/"İlçe" etiketi arar; sidebar/filter
      // widget'larından yanlış değer (Avcılar/Bolluca gibi) sızdırma riski yüksek.
    ].map(normalize),
  );
  const PLACEHOLDER_RE = /^(belirtilmemi[şs]|sahibinden|-+)$/i;

  // Hayati alanlar — bunlar yoksa Pattern 4 çalışsın
  const hayatiAlanlarVar =
    !!tablo["adano"] && !!tablo["parselno"] && !!tablo["ilanno"];

  // Pattern 4 — önce DAR scope (info container'lar), gerekirse genel sayfa fallback.
  // Pattern 1-3 sınıf-bağımlı; class adı obfuscate'lendiğinde tablo boş kalır →
  // bu durumda etiket metnine göre arama tek dayanıklı çare.
  const pattern4Calistir = (kokler: ParentNode[]) => {
    const dugumSeti = new Set<HTMLElement>();
    for (const kok of kokler) {
      kok.querySelectorAll<HTMLElement>("li, dt, th, strong, label").forEach((d) =>
        dugumSeti.add(d),
      );
    }
    for (const dugum of dugumSeti) {
      const metin = (dugum.textContent ?? "").trim();
      if (!metin || metin.length > 30) continue;
      const anahtar = normalize(metin);
      if (!HEDEF_ETIKETLER.has(anahtar)) continue;
      if (tablo[anahtar]) continue;

      let deger: string | null = null;

      const sib = dugum.nextElementSibling;
      if (sib instanceof HTMLElement) {
        const t = (sib.textContent ?? "").trim();
        if (t && t !== metin) deger = t;
      }

      if (!deger && dugum.parentElement) {
        const kardesler = Array.from(dugum.parentElement.children) as HTMLElement[];
        const idx = kardesler.indexOf(dugum);
        for (let i = idx + 1; i < kardesler.length; i++) {
          const t = (kardesler[i]?.textContent ?? "").trim();
          if (t && t !== metin) { deger = t; break; }
        }
      }

      if (!deger && dugum.parentElement) {
        const tumu = (dugum.parentElement.textContent ?? "").trim();
        const kalan = tumu.replace(metin, "").trim();
        if (kalan && kalan !== tumu) deger = kalan;
      }

      if (!deger) continue;
      if (PLACEHOLDER_RE.test(deger) && anahtar === "paftano") continue;
      tablo[anahtar] = deger;
      sayac.p4Etiket++;
    }
  };

  // Adım 1: dar scope (sayfa-genel taramayı %95 vakada eler)
  const darScope = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.classifiedInfo, [class*="classifiedInfo"], [class*="ClassifiedInfo"], [class*="classifiedDetail"], [class*="ClassifiedDetail"], [class*="uiBoxContainer"]',
    ),
  );
  if (darScope.length > 0) pattern4Calistir(darScope);

  // Adım 2: hâlâ hayati alanlar eksikse → genel sayfa taraması (fallback)
  const hayatiAlanlarBulundu =
    !!tablo["adano"] && !!tablo["parselno"] && !!tablo["ilanno"];
  if (!hayatiAlanlarVar && !hayatiAlanlarBulundu) {
    pattern4Calistir([document.body]);
  }

  console.log("[arsa-sahibinden] tablo cıkarımı:", {
    toplamAnahtar: Object.keys(tablo).length,
    ada: tablo["adano"],
    parsel: tablo["parselno"],
    pafta: tablo["paftano"],
    ilanNo: tablo["ilanno"],
    m2: tablo["metrekare"] ?? tablo["m"],
    patternBasarisi: sayac,
  });

  return tablo;
}

/**
 * Sahibinden'deki "Balıkesir / Altıeylül / Pamukçu Mh." konumunu çıkarır.
 * Sahibinden CSS obfuscation yaptığından class-bağımsız DOM traversal kullanılır.
 */
function breadcrumbCikar(): { il: string | null; ilce: string | null; mahalle: string | null } {
  const boş = { il: null, ilce: null, mahalle: null };
  // Kategori başlıkları + UI sidebar button'ları — yer adı olamaz
  const GECERSİZ = new Set([
    // Top breadcrumb kategorileri
    "Anasayfa", "Emlak", "Arsa", "Konut", "Satılık", "Kiralık", "Tümü", "Geri", "İlan Detay",
    "Mahalleler", "Mahalle", "Köyler", "Köy", "Beldeler", "Belde", "Semtler", "Semt", "Caddeler",
    // UI sidebar / favori / iletişim
    "Karşılaştır", "Vazgeç", "Kaydet", "Favorile", "Favori", "Favoriler",
    "Favori Aramalarım'a Git", "Favori Aramalarım", "Aramalarım",
    "Hesabım", "Hesap Hareketlerim", "Çıkış", "İlana Git",
    "Bildirimleri Aç", "Şikayet Et", "Mağazaya Git",
    // Yetkili numara
    "Telefon", "Mesaj Gönder", "Whatsapp", "WhatsApp",
  ]);

  /** Bir anchor lokasyon linki mi? — sahibinden URL'leri "/arsa-il-ilce-mahalle" benzeri pattern */
  const lokasyonLinki = (a: HTMLAnchorElement): boolean => {
    const href = a.getAttribute("href") ?? "";
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return false;
    // Sahibinden lokasyon URL'leri: /arsa-X-Y, /konut-arsasi-X-Y, /ticari-arsa-X-Y, /satilik-X
    return /\/(?:arsa|konut-arsasi|ticari-arsa|satilik|kiralik|emlak)-/i.test(href);
  };

  // Mahalle suffix tespiti — il/ilçe slot'larında olmamalı
  // ÖNEMLİ: word boundary (boşluk/tire/başlangıç) gerekli; aksi halde "Arnavutköy",
  // "Çekmeköy", "Sancaktepe" gibi -köy/-tepe ile biten ilçeler yanlışlıkla mahalle
  // olarak reject edilir. Suffix ayrı bir kelime olarak gelmeli ("Çamlıca Köyü" ✓).
  const MAHALLE_SUFFIX_RE = /(?:^|[\s\-/.])(?:Mah\.?|Mh\.?|Mahalle(?:si)?|Köy[üu]?|Beldesi|Belde|Mevkii?|Sitesi?|Bölgesi)$/i;

  // 1) "Mh." / "Mahallesi" / "Köyü" içeren anchor bul → parent chain'de komşular
  // TÜM anchor'ları gez ve EN İYİ skoru kazananı seç (early-return değil) —
  // sayfada hem top breadcrumb hem "diğer mahalleler" widget'ı varsa, breadcrumb (Anasayfa+10) kazansın.
  const tümAnchorlar = Array.from(document.querySelectorAll<HTMLAnchorElement>("a"));
  let globalBest: { score: number; anchors: string[]; idx: number } | null = null;

  for (const a of tümAnchorlar) {
    const mahalle = a.textContent?.trim() ?? "";
    if (mahalle.length < 3 || mahalle.length > 60) continue;
    if (!MAHALLE_SUFFIX_RE.test(mahalle)) continue;
    if (GECERSİZ.has(mahalle)) continue;
    if (!lokasyonLinki(a)) continue;

    let el: Element | null = a.parentElement;

    for (let depth = 0; depth < 6; depth++) {
      if (!el) break;
      const allAnchors = Array.from(el.querySelectorAll<HTMLAnchorElement>("a"));
      const hasAnasayfa = allAnchors.some((x) => {
        const t = x.textContent?.trim();
        return t === "Anasayfa" || t === "Ana Sayfa";
      });

      const locAnchors = allAnchors
        .filter(lokasyonLinki)
        .map((x) => x.textContent?.trim())
        .filter((t): t is string => !!t && t.length > 0 && t.length < 60 && !GECERSİZ.has(t));

      if (locAnchors.length >= 2 && locAnchors.length <= 12) {
        const idx = locAnchors.lastIndexOf(mahalle);
        if (idx >= 1) {
          // Validasyon: il (anchors[0]) ve ilçe (anchors[1]) mahalle adı OLMAMALI.
          // Aksi takdirde container "diğer mahalleler" widget'ıdır, atla.
          const ilCand = locAnchors[0] ?? "";
          const ilceCand = locAnchors[1] ?? "";
          if (MAHALLE_SUFFIX_RE.test(ilCand)) { el = el.parentElement; continue; }
          if (locAnchors.length >= 3 && MAHALLE_SUFFIX_RE.test(ilceCand)) { el = el.parentElement; continue; }

          const score = locAnchors.length + (hasAnasayfa ? 10 : 0);
          if (!globalBest || score > globalBest.score) {
            globalBest = { score, anchors: locAnchors, idx };
          }
        }
      }
      el = el.parentElement;
    }
  }

  if (globalBest) {
    // il = ilk geo-anchor (slot 0), ilçe = ikinci (slot 1).
    // Bu sub-level içeren chain'lerde de doğru çalışır:
    //   [Uşak, Eşme, Eşme, İstasyon Mh.] → il=Uşak, ilçe=Eşme (idx-2 yöntemi il=Eşme verirdi)
    return {
      il: globalBest.anchors.length >= 3 ? (globalBest.anchors[0] ?? null) : null,
      ilce:
        globalBest.anchors.length >= 3
          ? (globalBest.anchors[1] ?? null)
          : (globalBest.anchors[0] ?? null),
      mahalle: globalBest.anchors[globalBest.idx] ?? null,
    };
  }

  // 2) Bilinen selector listesi (class adları değişmemişse hızlı yol)
  const lokSel = [
    ".classifiedInfo .classifiedInfoAddress",
    ".classified-info-address",
    ".classifiedLocation",
    ".classified-location",
    'div[class*="classifiedLocation"]',
    'div[class*="classifiedInfoAddress"]',
    'div[class*="ClassifiedInfoAddress"]',
    'span[class*="location"]',
    '[data-testid*="location"]',
    '[data-testid*="address"]',
  ];
  for (const sel of lokSel) {
    try {
      const el = document.querySelector(sel);
      const metin = el?.textContent?.trim();
      if (metin && metin.length > 2) {
        const parcalar = metin.split(/\s*[/»›,]\s*/).map((s) => s.trim()).filter(Boolean);
        if (parcalar.length >= 2) {
          // Sahibinden'de bazen 4 element olur: İl / İlçe / Semt / Mahalle Mh.
          // Mahalle her zaman SON element ("Mh.", "Mahallesi" suffix'iyle bitiyorsa).
          // Aksi halde 3. element (semt = ilçe alt-bölgesi, mahalle değil).
          // Word boundary gerekli — "Arnavutköy" gibi -köy ile biten ilçeleri yanlış işaretleme
          const mahalleRe = /(?:^|[\s\-/.])(?:Mah\.?|Mh\.?|Mahalle(?:si)?|K[öo]y[üu]?|Beldesi|Belde|Mevkii?)\s*$/i;
          const sonEl = parcalar[parcalar.length - 1];
          const mahalleVar = sonEl && mahalleRe.test(sonEl);
          return {
            il: parcalar[0] ?? null,
            ilce: parcalar[1] ?? null,
            // 4+ element ve sonuncusu Mh. ile bitiyor → o gerçek mahalle
            // 3 element → 3. element mahalle (eski davranış)
            // Aksi → null (semt'e güvenme)
            mahalle: mahalleVar ? sonEl : (parcalar.length === 3 ? (parcalar[2] ?? null) : null),
          };
        }
      }
    } catch { /* skip */ }
  }

  // 3) Breadcrumb nav — Anasayfa > Emlak > Arsa > Satılık > Balıkesir > Altıeylül > Pamukçu Mh.
  const bcSel = [
    "#classified-detail-breadcrumb a",
    ".classified-breadcrumb a",
    'nav[aria-label="breadcrumb"] a',
    ".breadcrumb a",
    'ol[class*="readcrumb"] a',
    'ul[class*="readcrumb"] a',
    'div[class*="Breadcrumb"] a',
    'div[class*="breadcrumb"] a',
  ];
  for (const sel of bcSel) {
    try {
      // Sadece location-pattern href'li anchor'ları al — UI butonlar elenir
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(sel))
        .filter(lokasyonLinki)
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

  // 4) Meta tag regex fallback
  try {
    for (const mSel of ['meta[property="og:description"]', 'meta[name="description"]']) {
      const c = document.querySelector<HTMLMetaElement>(mSel)?.content ?? "";
      const m = /([A-ZÇŞĞÜÖİ][a-zçşğüöı]+(?:\s+[A-ZÇŞĞÜÖİ][a-zçşğüöı]+)*)\s*\/\s*([A-ZÇŞĞÜÖİ][a-zçşğüöı]+(?:\s+[A-ZÇŞĞÜÖİ][a-zçşğüöı]+)*)\s*\/\s*([A-ZÇŞĞÜÖİ][a-zçşğüöı]+(?:\s+[A-ZÇŞĞÜÖİ][a-zçşğüöı]+)*\s*(?:Mah(?:allesi|alle)?|Mh|Köy[üu]?|Belde(?:si)?|Mevkii?|Sitesi?)\.?)/i.exec(c);
      if (m) return { il: m[1] ?? null, ilce: m[2] ?? null, mahalle: m[3]?.trim() ?? null };
    }
  } catch { /* skip */ }

  return boş;
}

/**
 * Sahibinden ilan koordinatı — 3 katmanlı fallback:
 *   1) JSON-LD `geo.{latitude,longitude}` (GeoCoordinates) — en güvenilir
 *   2) Harita widget DOM attribute (`#mapWidget`, `[data-lat]`, `[data-coordinates]`)
 *   3) Inline script — `classifiedDetail.location` veya `mapAttributes` regex
 *
 * Bot koruması bazen JSON-LD'yi vermez; üç katman da boş ise null döner ve
 * çağıran tarafta `mahalle-merkez` fallback'e düşülür.
 */
function koordExtract(jsonLd: Record<string, unknown> | null): {
  lat: number;
  lng: number;
} | null {
  // 1) JSON-LD geo
  const geo = jsonLd?.["geo"] as Record<string, unknown> | undefined;
  if (geo) {
    const latRaw = geo["latitude"];
    const lngRaw = geo["longitude"];
    const lat = typeof latRaw === "string" ? parseFloat(latRaw) : (latRaw as number | undefined);
    const lng = typeof lngRaw === "string" ? parseFloat(lngRaw) : (lngRaw as number | undefined);
    if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
      // Türkiye bbox: lat 36–42, lng 26–45 (genel kontrol — yanlış parse'ları ele)
      if (lat > 35 && lat < 43 && lng > 25 && lng < 46) return { lat, lng };
    }
  }

  // 2) Harita widget DOM
  const mapEl = document.querySelector<HTMLElement>(
    "#mapWidget, [data-lat][data-lng], [data-coordinates], #classifiedMap, [data-map-center]",
  );
  if (mapEl) {
    const latStr =
      mapEl.dataset["lat"] ??
      mapEl.getAttribute("data-latitude") ??
      mapEl.dataset["mapCenter"]?.split(",")[0] ??
      null;
    const lngStr =
      mapEl.dataset["lng"] ??
      mapEl.dataset["lon"] ??
      mapEl.getAttribute("data-longitude") ??
      mapEl.dataset["mapCenter"]?.split(",")[1] ??
      null;
    const lat = latStr ? parseFloat(latStr) : NaN;
    const lng = lngStr ? parseFloat(lngStr) : NaN;
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat > 35 && lat < 43 && lng > 25 && lng < 46) {
      return { lat, lng };
    }
  }

  // 3) Inline script regex — `mapAttributes: { lat: 41.0, lng: 29.0 }` veya
  // `classifiedDetail.location = { latitude:..., longitude:... }`
  const scripts = document.querySelectorAll<HTMLScriptElement>("script:not([src])");
  for (const s of scripts) {
    const txt = s.textContent || "";
    if (!txt.includes("lat") && !txt.includes("Lat")) continue;
    const m =
      txt.match(/(?:latitude|lat)\s*[:=]\s*['"]?(-?\d+\.\d+)['"]?[\s,;}]+\s*(?:longitude|lng|lon)\s*[:=]\s*['"]?(-?\d+\.\d+)/);
    if (m) {
      const lat = parseFloat(m[1]!);
      const lng = parseFloat(m[2]!);
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat > 35 && lat < 43 && lng > 25 && lng < 46) {
        return { lat, lng };
      }
    }
  }

  return null;
}

/** JSON-LD structured data — sahibinden bazen embed eder, fallback için iyi */
function jsonLdParse(): Record<string, unknown> | null {
  const scripts = document.querySelectorAll<HTMLScriptElement>(
    'script[type="application/ld+json"]',
  );
  for (const s of scripts) {
    try {
      const data = JSON.parse(s.textContent || "{}");
      if (data["@type"] === "Product" || data["@type"] === "RealEstateListing") {
        return data;
      }
      // Bazen array içinde gelir
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item["@type"] === "Product" || item["@type"] === "RealEstateListing") {
            return item;
          }
        }
      }
    } catch {
      // ignore parse errors
    }
  }
  return null;
}

function txt(...selectors: string[]): string | null {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el?.textContent && el.textContent.trim().length > 0) {
        return el.textContent.trim();
      }
    } catch {
      // selector geçersiz olabilir
    }
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
  // Para birimi tespit
  let paraBirimi = "TL";
  if (/USD|\$/.test(s)) paraBirimi = "USD";
  else if (/EUR|€/.test(s)) paraBirimi = "EUR";
  else if (/TL|TRY|₺/.test(s)) paraBirimi = "TL";

  // Sayıyı çıkar — Türkçe format: 1.250.000,50 → 1250000.50
  // Önce ayırıcıları belirle: . binlik, , ondalık
  const sayilar = s.replace(/[^\d.,]/g, "").trim();
  if (!sayilar) return { fiyat: null, paraBirimi };

  let normalized: string;
  // Eğer hem nokta hem virgül var: nokta=binlik, virgül=ondalık (TR)
  if (sayilar.includes(",") && sayilar.includes(".")) {
    normalized = sayilar.replace(/\./g, "").replace(",", ".");
  } else if (sayilar.includes(",")) {
    // Sadece virgül — pozisyona göre: 1,250,000 (US format) veya 1250,50 (TR ondalık)
    const lastComma = sayilar.lastIndexOf(",");
    const afterComma = sayilar.length - lastComma - 1;
    if (afterComma === 3) {
      // 1,250 → US binlik
      normalized = sayilar.replace(/,/g, "");
    } else {
      // 1250,50 → TR ondalık
      normalized = sayilar.replace(",", ".");
    }
  } else {
    // Sadece nokta — TR binlik (1.250.000) veya US ondalık (1.5)
    const lastDot = sayilar.lastIndexOf(".");
    const afterDot = sayilar.length - lastDot - 1;
    if (afterDot === 3 || sayilar.split(".").length > 2) {
      // 1.250 veya 1.250.000 → TR binlik
      normalized = sayilar.replace(/\./g, "");
    } else {
      normalized = sayilar;
    }
  }

  const n = Number.parseFloat(normalized);
  return { fiyat: Number.isFinite(n) ? n : null, paraBirimi };
}

function parseM2(s: string | null): number | null {
  if (!s) return null;
  // Türkçe sayı format: "1.250 m²" → 1250
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
  // "Ada 1234 Parsel 5", "ada:1234, parsel:5", "1234 ada 5 parsel" vb.
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
        // Duplicate kontrolü
        if (!out.some((p) => p.ada === ada && p.parsel === parsel)) {
          out.push({ ada, parsel });
        }
      }
    }
  }
  return out.slice(0, 5);
}

// Console'dan manuel debug için global hook
(window as unknown as { __arsaTkgmDebug?: () => IlanBilgisi }).__arsaTkgmDebug = () =>
  parselDOM(true);
