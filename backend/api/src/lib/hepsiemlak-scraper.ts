/**
 * Hepsiemlak liste scraper — İKİNCİ BAĞIMSIZ İLAN KAYNAĞI.
 *
 * NEDEN: fiyat verisinin tamamı tek bir ticari kaynaktan (emlakjet) geliyordu.
 * Tek kaynak hem hacim tavanı hem de sistematik yanlılık riski demek — o
 * sitenin ilan havuzu neyi eksik/fazla temsil ediyorsa motor da onu miras
 * alıyor. Hepsiemlak tek başına 61.796 satılık arsa ilanı listeliyor
 * (tarla ayrı); mevcut toplam veri setimiz ~34 bin.
 *
 * ERİŞİM NOTU: bu kaynak bir ara "403 veriyor, bot koruması var" diye
 * elenmişti — YANLIŞTI. 403'ün sebebi hatalı URL kalıbıydı
 * (`/istanbul-catalca-satilik/arsa` diye bir yol yok). Doğru kalıplar:
 *   ülke geneli : /satilik/arsa
 *   il          : /{ilNorm}-satilik/arsa
 *   ilçe        : /{ilceNorm}-satilik/arsa      ← il ÖNEKİ YOK
 * Üçü de normal bir tarayıcı User-Agent ile 200 dönüyor.
 *
 * robots.txt: `Allow: /`. Sayfalama `?page=N` ile yapılıyor ve bu YASAK
 * DEĞİL — yasaklı kalıp `/*?p=*`, ki `?page=` onunla eşleşmiyor (`?p` sonrası
 * `=` bekleniyor, bizde `a` geliyor). Yine de nezaket için istekler arası
 * bekleme konuldu.
 *
 * Veri kaynağı liste sayfasındaki JSON-LD ItemList: her ilan için fiyat,
 * net alan (m²), tam adres ve başlık yapısal olarak geliyor — detay sayfasına
 * gitmeye gerek yok, sayfa başına 24 ilan tek istekte.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { ilanYaz, taramaDamgala } from "./veri-katmani.js";
import { log } from "./logger.js";

const BASE = "https://www.hepsiemlak.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36";

/** İstekler arası bekleme — kaynağa yük bindirmemek için. */
const ISTEK_ARASI_MS = 600;

export interface HeIlan {
  ilanNo: string;
  ilN: string;
  ilceN: string;
  mahN: string | null;
  kategori: "arsa" | "tarla";
  tlm2: number;
  m2: number;
  baslik: string | null;
  /** URL kategori slug undan türetilen imar durumu — bkz. KATEGORI_ESLEME. */
  imarDurumu: string | null;
}

/**
 * Hepsiemlak URL kategori slug u → (motor kategorisi, imar durumu).
 *
 * ÖLÇÜM: 6 ilçede (ceyhan, cukurova, catalca, silivri, milas, menderes) görülen
 * slug dağılımı — tarla 173, imarli-konut 24, bahce 10, zeytinlik 6,
 * imarli-villa 6, ozel-kullanim 2, muhtelif-arsa 2, imarli-sanayi 2,
 * turistik-arsa 1, imarli-ticari 1.
 *
 * DÜZ `arsa` SLUG U HİÇ YOK. İlk yazımda sadece "arsa" ve "tarla" slug larını
 * kabul ediyordum; sonuç olarak arsa tarafını TAMAMEN kaçırıyor, Ceyhan gibi
 * ilçelerde (hepsi `bahce`) sıfır ilan üretiyordum.
 *
 * BONUS: `imarli-*` slug ları imar durumunu YAPISAL olarak taşıyor. Bu tam da
 * uzun süredir peşinde olduğumuz özellik derinliği — emlakjet tarafında imar
 * kapsamı %1.4 iken burada her ilanda kategoriden bedavaya geliyor. Değerler
 * carpan-zinciri.ts::imarSiniflandir in aradığı anahtar kelimelere göre seçildi.
 */
const KATEGORI_ESLEME: Record<string, { kategori: "arsa" | "tarla"; imar: string | null }> = {
  arsa:            { kategori: "arsa",  imar: null },
  "muhtelif-arsa": { kategori: "arsa",  imar: null },
  "imarli-konut":  { kategori: "arsa",  imar: "Konut İmarlı" },
  "imarli-villa":  { kategori: "arsa",  imar: "Konut İmarlı (villa)" },
  "imarli-sanayi": { kategori: "arsa",  imar: "Sanayi İmarlı" },
  "imarli-ticari": { kategori: "arsa",  imar: "Ticari İmarlı" },
  "turistik-arsa": { kategori: "arsa",  imar: "Turizm İmarlı" },
  tarla:           { kategori: "tarla", imar: "Tarla" },
  bahce:           { kategori: "tarla", imar: "Bahçe" },
  bag:             { kategori: "tarla", imar: "Bağ" },
  zeytinlik:       { kategori: "tarla", imar: "Zeytinlik" },
  // ozel-kullanim, arsa-ciftlik vb. bilinçli olarak DIŞARIDA: ne olduğu belirsiz,
  // yanlış kategoriye koymak emsal havuzunu kirletir.
};

/** normalize.ts ile aynı kurallar — modül bağımsız kalsın diye yerel kopya. */
export function normalizeTr(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
    .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/â/g, "a").replace(/î/g, "i").replace(/û/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * İlan URL inden mahalle slug u, kategori ve ilan numarasını çıkarır.
 *
 * Biçim: /{il}-{ilce}-{mahalle}-satilik/{kategori}/{id}
 *   ör. /istanbul-catalca-nakkas-satilik/tarla/167147-415
 *
 * Mahalle adı birden çok tire içerebildiği için (ör. yeni-mahalle) parçalama
 * baştan DEĞİL, bilinen il/ilçe değerleri soyularak yapılır: bilinen önekler
 * atıldıktan sonra kalan kısım mahalledir.
 */
export function ilanUrlParse(
  url: string,
  ilN: string,
  ilceN: string,
): {
  ilanNo: string;
  mahN: string | null;
  kategori: "arsa" | "tarla";
  imarDurumu: string | null;
} | null {
  const m = url.match(/\/([a-z0-9-]+)-satilik\/([a-z-]+)\/([0-9-]+)(?:$|[?#])/);
  if (!m) return null;
  const yerSlug = m[1]!;
  const katSlug = m[2]!;
  const id = m[3]!;

  const esleme = KATEGORI_ESLEME[katSlug];
  if (!esleme) return null;

  let kalan = yerSlug;
  for (const onek of [ilN, ilceN]) {
    if (!onek) continue;
    if (kalan.startsWith(`${onek}-`)) kalan = kalan.slice(onek.length + 1);
    else if (kalan === onek) kalan = "";
  }
  const mahN = kalan && kalan !== yerSlug ? kalan : null;

  return {
    ilanNo: `he_${id}`,
    mahN,
    kategori: esleme.kategori,
    imarDurumu: esleme.imar,
  };
}

/** "Nakkaş, Çatalca/İstanbul" → { mahalle, ilce, il } (ham, normalize edilmemiş). */
export function adresParse(
  streetAddress: string | undefined | null,
): { mahalle: string | null; ilce: string | null; il: string | null } {
  if (!streetAddress) return { mahalle: null, ilce: null, il: null };
  const parcalar = streetAddress.split(",").map((s) => s.trim());
  const mahKisim = parcalar[0];
  const ilKisim = parcalar[1];
  if (!ilKisim) return { mahalle: null, ilce: null, il: mahKisim ?? null };
  const ik = ilKisim.split("/").map((s) => s.trim());
  return { mahalle: mahKisim || null, ilce: ik[0] || null, il: ik[1] || null };
}

interface LdItem {
  "@type"?: string;
  url?: string;
  name?: string;
  about?: {
    address?: { streetAddress?: string; addressLocality?: string };
    additionalProperty?: Array<{ name?: string; value?: number | string; unitCode?: string }>;
  };
  offers?: { price?: number | string; priceCurrency?: string };
}

/** Sayfadaki JSON-LD ItemList ten ham ilan nesnelerini çeker. */
export function listeJsonLdCikar(html: string): LdItem[] {
  const bloklar = [
    ...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g),
  ];
  for (const b of bloklar) {
    let j: unknown;
    try { j = JSON.parse(b[1]!); } catch { continue; }
    const arr = Array.isArray(j)
      ? j
      : ((j as { "@graph"?: unknown[] })["@graph"] ?? [j]);
    for (const o of arr as Array<{ "@type"?: string; itemListElement?: Array<{ item?: LdItem }> }>) {
      if (o?.["@type"] === "ItemList" && Array.isArray(o.itemListElement)) {
        return o.itemListElement.map((e) => e.item).filter((x): x is LdItem => !!x);
      }
    }
  }
  return [];
}

/** JSON-LD kaydını normalize eder; eksik/saçma veri varsa null. */
export function ilanNormalize(it: LdItem, ilN: string, ilceN: string): HeIlan | null {
  if (!it.url) return null;
  const u = ilanUrlParse(it.url, ilN, ilceN);
  if (!u) return null;

  // Fiyat — TRY dışı para birimini alma (kur dönüşümü bu katmanın işi değil).
  const pc = it.offers?.priceCurrency;
  if (pc && pc !== "TRY" && pc !== "TL") return null;
  const fiyat = Number(it.offers?.price);
  if (!Number.isFinite(fiyat) || fiyat <= 0) return null;

  const alanProp = (it.about?.additionalProperty ?? []).find(
    (p) => p.name === "Net Alan" || p.name === "Brüt Alan",
  );
  const m2 = Number(alanProp?.value);
  if (!Number.isFinite(m2) || m2 < 50) return null;
  // unitCode MTK = m². Başka birim gelirse güvenme.
  if (alanProp?.unitCode && alanProp.unitCode !== "MTK") return null;

  const tlm2 = Math.round(fiyat / m2);
  // emlakjet hattıyla aynı akıl sağlığı bandı.
  if (tlm2 < 100 || tlm2 > 10_000_000) return null;

  // Mahalle: URL den çıkan normalize slug tercih edilir; yoksa adresten türet.
  let mahN = u.mahN;
  if (!mahN) {
    const a = adresParse(it.about?.address?.streetAddress);
    mahN = a.mahalle ? normalizeTr(a.mahalle) : null;
  }

  return {
    ilanNo: u.ilanNo,
    ilN,
    ilceN,
    mahN,
    kategori: u.kategori,
    tlm2,
    m2: Math.round(m2),
    baslik: it.name?.trim() || null,
    imarDurumu: u.imarDurumu,
  };
}

/**
 * Sayfa çekme sonucu — HTTP DURUMU ÇAĞIRANA MUTLAKA DÖNER (Sprint B.4).
 *
 * Yerel hatta (scripts/hepsiemlak-scrape.mjs) bu düzeltildi ama WORKER hattında
 * aynı kusur duruyordu: `!res.ok → null` ve çağıran bunu "sayfalama bitti"
 * sayıyordu. 3. sayfada gelen 429, ilçeyi "tarandı" diye damgalayıp taramayı
 * bitiriyordu — yerelde 254 ilçeyi kaybettiren hatanın birebir aynısı.
 *
 * `status: 0` → ağ hatası / zaman aşımı.
 */
interface HeSayfaSonuc {
  status: number;
  govde: string | null;
}

/** Kaynağın bizi kısıtladığını söyleyen durumlar — veri yokluğu DEĞİL. */
export function heBotEngelMi(status: number): boolean {
  return status === 429 || status === 403 || status === 503;
}

async function sayfaCek(url: string, timeoutMs = 20_000): Promise<HeSayfaSonuc> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "tr-TR,tr;q=0.9",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { status: res.status, govde: null };
    return { status: res.status, govde: await res.text() };
  } catch (e) {
    log.warn("hepsiemlak.sayfa-cek.ag-hatasi", {
      url, hata: e instanceof Error ? e.message : String(e),
    });
    return { status: 0, govde: null };
  }
}

export interface HeIlceSonuc {
  ilN: string; ilceN: string; kategori: string;
  eklenen: number; atlanan: number; sayfa: number; hata: boolean;
  /** Kaynak bizi kısıtladı (429/403/503) — "ilan yok" ile karıştırılmamalı. */
  botEngel: boolean;
  /** Son görülen HTTP durumu; 0 ise yanıt hiç alınamadı. */
  sonDurum: number;
}

/**
 * Bir ilçeyi tarar.
 *
 * DURMA KOŞULU: sayfanın hiç ilan döndürmemesi. "Bu sayfada yeni ilan yok" ile
 * "sayfalama bitti" bilinçli olarak AYRIŞTIRILDI — emlakjet hattında bu ikisini
 * karıştırmak, daha önce sığ taranmış ilçelerde 1. sayfa tamamen tanıdık
 * çıktığı için derin sayfalara hiç ulaşılamamasına yol açmıştı.
 */
export async function hepsiemlakIlceTara(
  db: D1Database,
  ilN: string,
  ilceN: string,
  kategori: "arsa" | "tarla",
  maxSayfa = 25,
): Promise<HeIlceSonuc> {
  const s: HeIlceSonuc = {
    ilN, ilceN, kategori, eklenen: 0, atlanan: 0, sayfa: 0, hata: false,
    botEngel: false, sonDurum: 0,
  };

  for (let sayfa = 1; sayfa <= maxSayfa; sayfa++) {
    const url = `${BASE}/${ilceN}-satilik/${kategori}${sayfa > 1 ? `?page=${sayfa}` : ""}`;
    const r = await sayfaCek(url);
    s.sonDurum = r.status;
    if (heBotEngelMi(r.status)) {
      // Engellenme sayfalama sonu DEĞİL: burada durup ilçeyi 'bot-engel'
      // damgalıyoruz ki rotasyonda yeniden sıraya girsin.
      s.botEngel = true;
      log.warn("hepsiemlak.bot-engel", { il: ilN, ilce: ilceN, kategori, sayfa, status: r.status });
      break;
    }
    const html = r.govde;
    if (!html) { if (sayfa === 1) s.hata = true; break; }

    const items = listeJsonLdCikar(html);
    if (items.length === 0) break; // gerçek sayfalama sonu
    s.sayfa = sayfa;

    for (const it of items) {
      const ilan = ilanNormalize(it, ilN, ilceN);
      if (!ilan) { s.atlanan++; continue; }
      // Koordinat, başlık, imar ve rotasyon veri katmanının işi — bkz.
      // lib/veri-katmani.ts. Buradaki tek sorumluluk PARSE.
      const yazildi = await ilanYaz(db, {
        kaynak: "hepsiemlak",
        ilanNo: ilan.ilanNo,
        ilNorm: ilan.ilN,
        ilceNorm: ilan.ilceN,
        mahalleNorm: ilan.mahN,
        fiyatPerM2: ilan.tlm2,
        m2: ilan.m2,
        kategori: ilan.kategori,
        baslik: ilan.baslik,
        imarDurumu: ilan.imarDurumu,
      });
      if (yazildi) s.eklenen++; else s.atlanan++;
    }

    await new Promise((r) => setTimeout(r, ISTEK_ARASI_MS));
  }
  return s;
}

export interface HeRunSonuc {
  islenenIlce: number; toplamEklenen: number; toplamAtlanan: number;
  hataAdet: number; botEngelAdet: number; erkenDurdu: boolean; sure_ms: number;
}

/** Üst üste kaç bot engeli sonrası koşu, toplananı koruyarak durur. */
const MAX_ARDISIK_BOT_ENGEL = 3;

/** Verilen ilçeleri arsa + tarla için tarar. */
export async function hepsiemlakRunBaslat(
  db: D1Database,
  hedefler: Array<{ ilN: string; ilceN: string }>,
  maxIlce = 4,
  maxSayfa = 25,
): Promise<HeRunSonuc> {
  const t0 = Date.now();
  const s: HeRunSonuc = {
    islenenIlce: 0, toplamEklenen: 0, toplamAtlanan: 0, hataAdet: 0,
    botEngelAdet: 0, erkenDurdu: false, sure_ms: 0,
  };
  let ardisikBotEngel = 0;

  for (const { ilN, ilceN } of hedefler.slice(0, maxIlce)) {
    let ilceEklenen = 0;
    let ilceHata = false;
    let ilceBotEngel = false;
    for (const kat of ["arsa", "tarla"] as const) {
      try {
        const r = await hepsiemlakIlceTara(db, ilN, ilceN, kat, maxSayfa);
        s.toplamEklenen += r.eklenen;
        s.toplamAtlanan += r.atlanan;
        ilceEklenen += r.eklenen;
        if (r.hata) { s.hataAdet++; ilceHata = true; }
        if (r.botEngel) { s.botEngelAdet++; ilceBotEngel = true; }
      } catch (e) {
        s.hataAdet++;
        ilceHata = true;
        log.warn("hepsiemlak.ilce-tara.istisna", {
          il: ilN, ilce: ilceN, kategori: kat,
          hata: e instanceof Error ? e.message : String(e),
        });
      }
      await new Promise((r) => setTimeout(r, ISTEK_ARASI_MS));
    }
    // Bot engeli 'hata'dan ayrı damgalanır: veri katmanı bu durumda son_tarama'yı
    // ilerletmez, ilçe rotasyonun önünde kalır.
    await taramaDamgala(db, "hepsiemlak", { ilNorm: ilN, ilceNorm: ilceN }, ilceEklenen,
                        ilceBotEngel ? "bot-engel" : ilceHata ? "hata" : "tamam");

    s.islenenIlce++;

    // Üst üste engelleniyorsak devam etmek hem kısıtlamayı derinleştirir hem de
    // kalan ilçeleri boş yere "tarandı" damgalar — toplananı koruyup duruyoruz.
    if (ilceBotEngel) {
      if (++ardisikBotEngel >= MAX_ARDISIK_BOT_ENGEL) {
        s.erkenDurdu = true;
        log.error("hepsiemlak.run.bot-engel-durdu", {
          ardisik: ardisikBotEngel, islenenIlce: s.islenenIlce, toplamEklenen: s.toplamEklenen,
        });
        break;
      }
    } else {
      ardisikBotEngel = 0;
    }
  }

  s.sure_ms = Date.now() - t0;
  return s;
}
