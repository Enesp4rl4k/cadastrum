/**
 * Detay Zenginleştirme Kuyruk Worker — Faz 5 / Sahibinden Scraper.
 *
 * Bootstrap liste taraması ilanları lat/lng'siz biriktirir (kart üzerinde
 * koordinat yok). Bu worker arka planda ilan detay sayfalarını sırayla açar,
 * sahibinden.ts content script otomatik `koordExtract` yapar ve `ilan-tespit`
 * mesajını yollar; service-worker o noktada kuyruğu günceller.
 *
 * Akış:
 *   1. `db.detayKuyrugu` FIFO: durum='beklemede' → durum='isleniyor'
 *   2. chrome.tabs.create({ url, active: false })
 *   3. 5 sn bekle → ilan-tespit alındıysa durum='tamam'
 *   4. Yoksa timeout (15 sn) → durum='hata', deneme++
 *   5. Tab kapat → rate limit (4-8 sn jitter)
 *   6. Max 3 deneme → durum='kalici-hata'
 *
 * State machine değil; `service-worker.ts` global `detayDurum` ile track ediyor.
 */

import { db, type DetayKuyrukKayit } from "./db";

const MAX_DENEME = 3;
// Sahibinden detay sayfası Chrome MV3 background tab'da yavaş yüklenir; image/JS
// throttle var. Pilot test: active:false → fiyat/m²/lat hepsi null. Çözüm:
// active:true sequential — kullanıcı browser'a dokunmaz, tab'lar sırayla
// foreground'da açılıp kapanır. Süreler de buna göre.
const NAV_COMPLETE_MS = 25_000; // max sayfa yüklenme
const PARSE_GRACE_MS = 3_500;   // JS render için ekstra grace
const RATE_BASE_MS = 6_000;

export interface DetayDurum {
  calisiyor: boolean;
  bekleyenSayi: number;
  isleniyorSayi: number;
  tamamSayi: number;
  hataSayi: number;
  kaliciHataSayi: number;
  sonIlanNo: string | null;
  baslangic: number;
  sonHata: string | null;
}

const VARSAYILAN_DURUM: DetayDurum = {
  calisiyor: false,
  bekleyenSayi: 0,
  isleniyorSayi: 0,
  tamamSayi: 0,
  hataSayi: 0,
  kaliciHataSayi: 0,
  sonIlanNo: null,
  baslangic: 0,
  sonHata: null,
};

/** Worker state — service-worker scope'unda tek instance. */
let detayDurum: DetayDurum = { ...VARSAYILAN_DURUM };
let durdurmaBayrak = false;

export function detayDurumGetir(): DetayDurum {
  return { ...detayDurum };
}

export async function detayKuyrugaEkle(ilanNo: string, url: string): Promise<void> {
  // Zaten varsa atla
  const mevcut = await db.detayKuyrugu.get(ilanNo);
  if (mevcut) return;
  const kayit: DetayKuyrukKayit = {
    ilanNo,
    url,
    durum: "beklemede",
    deneme: 0,
    eklenmeTs: Date.now(),
  };
  await db.detayKuyrugu.put(kayit);
}

export async function detayKuyrugaToplaEkle(
  girdiler: Array<{ ilanNo: string; url: string }>,
): Promise<number> {
  let eklenen = 0;
  for (const g of girdiler) {
    const mevcut = await db.detayKuyrugu.get(g.ilanNo);
    if (mevcut) continue;
    await db.detayKuyrugu.put({
      ilanNo: g.ilanNo,
      url: g.url,
      durum: "beklemede",
      deneme: 0,
      eklenmeTs: Date.now(),
    });
    eklenen++;
  }
  return eklenen;
}

export async function detaySayilariniGuncelle(): Promise<void> {
  const [bekleyen, isleniyor, tamam, hata, kaliciHata] = await Promise.all([
    db.detayKuyrugu.where("durum").equals("beklemede").count(),
    db.detayKuyrugu.where("durum").equals("isleniyor").count(),
    db.detayKuyrugu.where("durum").equals("tamam").count(),
    db.detayKuyrugu.where("durum").equals("hata").count(),
    db.detayKuyrugu.where("durum").equals("kalici-hata").count(),
  ]);
  detayDurum.bekleyenSayi = bekleyen;
  detayDurum.isleniyorSayi = isleniyor;
  detayDurum.tamamSayi = tamam;
  detayDurum.hataSayi = hata;
  detayDurum.kaliciHataSayi = kaliciHata;
}

function jitter(base: number): number {
  return base + (Math.random() - 0.5) * base * 0.4;
}

/**
 * Detay sayfasından inline parse — Chrome MV3 background tab'larında
 * content_scripts throttle olduğu için content script'e bağımlı olmuyoruz.
 * `chrome.scripting.executeScript` ile sayfanın kendi context'inde minimal
 * parse yapıyoruz; JSON-LD + DOM fallback + bilgi tablosu.
 */
interface InlineParse {
  fiyat: number | null;
  m2: number | null;
  paraBirimi: string | null;
  il: string | null;
  ilce: string | null;
  mahalle: string | null;
  baslik: string | null;
  imarDurumu: string | null;
  adaNo: number | null;
  parselNo: number | null;
  lat: number | null;
  lng: number | null;
  ilanNoUrl: string | null;
}

/** Sayfa context'inde çalışacak — minimal sahibinden detay parser. */
function inlineSayfadanParse(): InlineParse {
  const result: InlineParse = {
    fiyat: null, m2: null, paraBirimi: null, il: null, ilce: null,
    mahalle: null, baslik: null, imarDurumu: null, adaNo: null, parselNo: null,
    lat: null, lng: null, ilanNoUrl: null,
  };

  // JSON-LD scan
  let jsonLd: Record<string, unknown> | null = null;
  for (const s of document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')) {
    try {
      const d = JSON.parse(s.textContent || "{}");
      if (d["@type"] === "Product" || d["@type"] === "RealEstateListing") {
        jsonLd = d;
        break;
      }
      if (Array.isArray(d)) {
        for (const i of d) {
          if (i["@type"] === "Product" || i["@type"] === "RealEstateListing") { jsonLd = i; break; }
        }
      }
    } catch { /* ignore */ }
  }

  // Başlık
  const h1 = document.querySelector<HTMLElement>(
    "h1.classifiedTitle, h1[class*='classifiedTitle'], h1[class*='ClassifiedTitle'], h1",
  );
  result.baslik = h1?.textContent?.trim() || (jsonLd?.name as string | undefined) || null;

  // Fiyat — DOM
  const fiyatEl = document.querySelector<HTMLElement>(
    ".classifiedInfo .price, .classified-price, [class*='Price'], [class*='price']",
  );
  const fiyatTxt = fiyatEl?.textContent?.trim() || "";
  const fpm = fiyatTxt.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*(TL|USD|EUR|GBP|\$|€|£)/i);
  if (fpm) {
    result.fiyat = parseFloat(fpm[1]!.replace(/\./g, "").replace(",", ".")) || null;
    const cur = fpm[2]!;
    result.paraBirimi = /\$|usd/i.test(cur) ? "USD" : /€|eur/i.test(cur) ? "EUR" : /£|gbp/i.test(cur) ? "GBP" : "TL";
  }

  // Bilgi tablosu — "Metrekare", "Mahalle", "Ada No", "Parsel No", "İmar Durumu" vb
  const labelToKey: Record<string, string> = {
    "metrekare": "m2", "m": "m2", "arsa m2": "m2", "brüt m2": "m2",
    "mahalle": "mahalle",
    "ada no": "adaNo", "ada": "adaNo",
    "parsel no": "parselNo", "parsel": "parselNo",
    "imar durumu": "imarDurumu", "imar": "imarDurumu",
  };
  const liler = document.querySelectorAll<HTMLElement>(
    "ul.classifiedInfoList li, .classifiedInfoList li, [class*='classifiedInfoList'] li",
  );
  for (const li of liler) {
    const t = (li.textContent || "").trim();
    const m = t.match(/^([^:]+?)[:\s]+(.+)$/);
    if (!m) continue;
    const label = m[1]!.toLocaleLowerCase("tr").trim();
    const value = m[2]!.trim();
    const key = labelToKey[label];
    if (!key) continue;
    if (key === "m2") {
      const v = parseFloat(value.replace(/[^\d.,]/g, "").replace(",", "."));
      if (Number.isFinite(v) && v > 0) result.m2 = v;
    } else if (key === "adaNo") {
      const v = parseInt(value.replace(/\D/g, ""), 10);
      if (Number.isFinite(v)) result.adaNo = v;
    } else if (key === "parselNo") {
      const v = parseInt(value.replace(/\D/g, ""), 10);
      if (Number.isFinite(v)) result.parselNo = v;
    } else if (key === "mahalle") {
      result.mahalle = value.replace(/Mah\.?$/i, "").trim();
    } else if (key === "imarDurumu") {
      result.imarDurumu = value;
    }
  }

  // il/ilçe — breadcrumb veya h2 yer linkleri
  const breadcrumbs = document.querySelectorAll<HTMLAnchorElement>(
    ".classifiedInfo .breadCrumb a, .breadCrumb a, .geographicLocations a, [class*='breadCrumb'] a, [class*='BreadCrumb'] a",
  );
  const lokAdlari = Array.from(breadcrumbs).map((a) => a.textContent?.trim()).filter(Boolean);
  // Tipik breadcrumb: Emlak > Arsa > Satılık > İSTANBUL > BEYKOZ > KAVACIK
  if (lokAdlari.length >= 2) {
    result.il = lokAdlari[lokAdlari.length - 3] || null;
    result.ilce = lokAdlari[lokAdlari.length - 2] || null;
    if (!result.mahalle) result.mahalle = lokAdlari[lokAdlari.length - 1] || null;
  }

  // Koord — JSON-LD geo
  const geo = jsonLd?.["geo"] as Record<string, unknown> | undefined;
  if (geo) {
    const lat = typeof geo.latitude === "string" ? parseFloat(geo.latitude) : (geo.latitude as number | undefined);
    const lng = typeof geo.longitude === "string" ? parseFloat(geo.longitude) : (geo.longitude as number | undefined);
    if (typeof lat === "number" && typeof lng === "number" && lat > 35 && lat < 43 && lng > 25 && lng < 46) {
      result.lat = lat;
      result.lng = lng;
    }
  }
  // Koord — DOM
  if (result.lat == null) {
    const mapEl = document.querySelector<HTMLElement>(
      "#mapWidget, [data-lat][data-lng], [data-coordinates], #classifiedMap, [data-map-center]",
    );
    if (mapEl) {
      const latStr = mapEl.dataset["lat"] ?? mapEl.getAttribute("data-latitude") ?? mapEl.dataset["mapCenter"]?.split(",")[0] ?? null;
      const lngStr = mapEl.dataset["lng"] ?? mapEl.dataset["lon"] ?? mapEl.getAttribute("data-longitude") ?? mapEl.dataset["mapCenter"]?.split(",")[1] ?? null;
      const lat = latStr ? parseFloat(latStr) : NaN;
      const lng = lngStr ? parseFloat(lngStr) : NaN;
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat > 35 && lat < 43 && lng > 25 && lng < 46) {
        result.lat = lat;
        result.lng = lng;
      }
    }
  }
  // Koord — inline script regex
  if (result.lat == null) {
    for (const s of document.querySelectorAll<HTMLScriptElement>("script:not([src])")) {
      const t = s.textContent || "";
      if (!t.includes("lat") && !t.includes("Lat")) continue;
      const m = t.match(/(?:latitude|lat)\s*[:=]\s*['"]?(-?\d+\.\d+)['"]?[\s,;}]+\s*(?:longitude|lng|lon)\s*[:=]\s*['"]?(-?\d+\.\d+)/);
      if (m) {
        const lat = parseFloat(m[1]!);
        const lng = parseFloat(m[2]!);
        if (Number.isFinite(lat) && Number.isFinite(lng) && lat > 35 && lat < 43 && lng > 25 && lng < 46) {
          result.lat = lat;
          result.lng = lng;
          break;
        }
      }
    }
  }

  // İlan no URL'den
  const m = location.pathname.match(/\/ilan\/[^/]+(?:-(\d{8,11}))/);
  result.ilanNoUrl = m?.[1] ?? null;

  return result;
}

type IsleSonuc = "tamam" | "bot" | "hata";

/** Worker: detay tabı aç → content script parse → mesaj bekle → tab kapat.
 *  Dönüş: "tamam" | "bot" (rate-limit) | "hata" (parse/diğer). */
async function birIlaniIsle(
  kayit: DetayKuyrukKayit,
  ilanTespitBekleyici: (ilanNo: string, timeoutMs: number) => Promise<boolean>,
): Promise<IsleSonuc> {
  detayDurum.sonIlanNo = kayit.ilanNo;
  await db.detayKuyrugu.update(kayit.ilanNo, {
    durum: "isleniyor",
    sonDenemeTs: Date.now(),
  });

  let tabId: number | undefined;
  try {
    // active:true — sequential foreground tab, Sahibinden throttle bypass.
    // Content script (sahibinden.ts) tab açıldığında otomatik çalışır,
    // parse edip "ilan-tespit" mesajı yollar — biz onu bekliyoruz.
    const tab = await chrome.tabs.create({ url: kayit.url, active: true });
    tabId = tab.id;
    if (!tabId) throw new Error("Tab açılamadı");

    // Content script'in mesajını dinle (max NAV_COMPLETE_MS + grace)
    const basarili = await ilanTespitBekleyici(kayit.ilanNo, NAV_COMPLETE_MS + PARSE_GRACE_MS);

    if (!basarili) {
      // Mesaj gelmedi — bot interstitial mi yoksa parse fail mi tespit et
      let hataMsg = "ilan-tespit mesajı gelmedi";
      let botMu = false;
      try {
        const probe = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => ({ len: document.body?.innerText?.length ?? 0, title: document.title, url: location.href }),
        });
        const p = probe?.[0]?.result as { len: number; title: string; url: string } | undefined;
        if (p) {
          if (p.len < 500 || /olağan dışı|unusual|access denied|captcha|robot/i.test(p.title)) {
            hataMsg = `bot-bloke (body ${p.len}B, title:${p.title.slice(0, 30)})`;
            botMu = true;
          } else if (!/sahibinden\.com\/ilan\//.test(p.url)) {
            hataMsg = `redirect: ${p.url.slice(0, 60)}`;
            botMu = true; // redirect de genelde bot koruması
          } else {
            hataMsg = `parse fail (body ${p.len}B)`;
          }
        }
      } catch { /* tab kapalı vs */ }

      if (botMu) {
        // Bot blokesi → deneme YAKMA, beklemede'ye geri koy (cooldown sonrası retry)
        await db.detayKuyrugu.update(kayit.ilanNo, { durum: "beklemede", hata: hataMsg });
        detayDurum.sonHata = `${kayit.ilanNo}: ${hataMsg}`;
        return "bot";
      }

      // Gerçek parse hatası → deneme artır
      const yeniDeneme = kayit.deneme + 1;
      const yeniDurum = yeniDeneme >= MAX_DENEME ? "kalici-hata" : "hata";
      await db.detayKuyrugu.update(kayit.ilanNo, {
        durum: yeniDurum,
        deneme: yeniDeneme,
        hata: hataMsg,
      });
      detayDurum.sonHata = `${kayit.ilanNo}: ${hataMsg}`;
      return "hata";
    }

    // Content script başarıyla parse edip backend'e yolladı — TAMAM
    await db.detayKuyrugu.update(kayit.ilanNo, { durum: "tamam" });
    detayDurum.sonHata = null;
    return "tamam";
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    const yeniDeneme = kayit.deneme + 1;
    const yeniDurum = yeniDeneme >= MAX_DENEME ? "kalici-hata" : "hata";
    await db.detayKuyrugu.update(kayit.ilanNo, {
      durum: yeniDurum,
      deneme: yeniDeneme,
      hata: mesaj,
    });
    detayDurum.sonHata = `${kayit.ilanNo}: ${mesaj}`;
    return "hata";
  } finally {
    if (tabId !== undefined) {
      try { await chrome.tabs.remove(tabId); } catch { /* zaten kapalı */ }
    }
  }
}

/**
 * Worker döngüsü — durum 'beklemede' veya retry için 'hata' kayıtları işler.
 * Service-worker `detay-zenginlestir-baslat` mesajı geldiğinde çağrılır.
 */
export async function detayZenginlestirmeBaslat(
  ilanTespitBekleyici: (ilanNo: string, timeoutMs: number) => Promise<boolean>,
): Promise<void> {
  if (detayDurum.calisiyor) return;
  detayDurum = { ...VARSAYILAN_DURUM, calisiyor: true, baslangic: Date.now() };
  durdurmaBayrak = false;

  // Arka plan döngüsü — ardışık bot-blok devre kesici
  (async () => {
    let ardisikBot = 0;
    const BOT_ESIK = 3;          // 3 ardışık bot → cooldown
    const COOLDOWN_MS = 5 * 60_000; // 5 dk soğuma

    while (!durdurmaBayrak) {
      await detaySayilariniGuncelle();
      // Önce beklemedekiler, sonra retry edilebilir hatalar
      const sonraki = await db.detayKuyrugu
        .where("durum")
        .equals("beklemede")
        .first()
        .then((b) =>
          b ?? db.detayKuyrugu.where("durum").equals("hata").first(),
        );
      if (!sonraki) {
        // Kuyruk boş — bekle ve kontrol et (yeni ilanlar gelebilir)
        await new Promise((r) => setTimeout(r, 30_000));
        continue;
      }

      const sonuc = await birIlaniIsle(sonraki, ilanTespitBekleyici);

      if (sonuc === "bot") {
        ardisikBot++;
        if (ardisikBot >= BOT_ESIK) {
          // Sahibinden rate-limit etti — uzun soğuma, kuyruğu yakma
          detayDurum.sonHata = `⏸ Sahibinden bot koruması — ${COOLDOWN_MS / 60000} dk soğuma (${new Date(Date.now() + COOLDOWN_MS).toLocaleTimeString("tr")})`;
          const cooldownBitis = Date.now() + COOLDOWN_MS;
          while (Date.now() < cooldownBitis && !durdurmaBayrak) {
            await new Promise((r) => setTimeout(r, 5000));
          }
          ardisikBot = 0;
          continue;
        }
      } else {
        ardisikBot = 0; // başarı veya gerçek hata → sayaç sıfırla
      }

      // Rate limit jitter — bot sonrası daha uzun bekle
      const base = sonuc === "bot" ? RATE_BASE_MS * 2 : RATE_BASE_MS;
      await new Promise((r) => setTimeout(r, Math.max(3000, jitter(base))));
    }
    detayDurum.calisiyor = false;
  })().catch((e) => {
    console.error("[detay-zenginlestirme] döngü hatası:", e);
    detayDurum.calisiyor = false;
  });
}

export function detayZenginlestirmeDurdur(): void {
  durdurmaBayrak = true;
}

/**
 * Bekleyen kuyruğu temizle (kalici-hata olanlar dahil) — UI'dan reset için.
 */
export async function detayKuyruguTemizle(): Promise<void> {
  await db.detayKuyrugu.clear();
  detayDurum = { ...VARSAYILAN_DURUM };
}
