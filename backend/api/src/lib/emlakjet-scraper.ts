/**
 * Emlakjet Worker-Native Scraper
 *
 * Cloudflare Workers üzerinde çalışır. Emlakjet bot koruması yok —
 * normal fetch ile çalışır, Sahibinden'in aksine PerimeterX engeli yoktur.
 *
 * Strateji:
 *   1. Liste sayfası fetch → JSON-LD @graph'tan RealEstateListing'leri parse et
 *      (detay sayfası gerekmez — çok daha hızlı)
 *   2. JSON-LD yoksa link listesi çek, her detay sayfasını parse et (fallback)
 *   3. ilanlar tablosuna batch INSERT (UNIQUE constraint duplicate'leri yutar)
 *   4. tarama_durum tablosunu güncelle (veri katmanı üzerinden)
 *
 * Worker sınırlamaları:
 *   - CPU timeout: 30s (default) veya 5dk (Unbound plan)
 *   - Paralel fetch: context.waitUntil ile arka planda çalışır
 *   - MERKEZ_TUPLES: Worker'a bundle edilemeyecek kadar büyük — koordinatlar
 *     D1'daki mahalle_merkez tablosundan çekilir (lib/veri-katmani.ts).
 *     O tablo migration 0030'a kadar HİÇ VAR DEĞİLDİ; koordinat çözümlemesi
 *     sessizce hep null dönüyordu.
 *
 * Kullanım:
 *   import { emlakjetIlceTara, emlakjetRunBaslat } from "../lib/emlakjet-scraper.js";
 */

import type { D1Database } from "@cloudflare/workers-types";
import { ilanYaz, taramaDamgala, type IlanKategori } from "./veri-katmani.js";
import { log } from "./logger.js";

const EMLAKJET_BASE = "https://www.emlakjet.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36";
const GECERLI_KATEGORI = new Set(["arsa", "tarla"]);

// ── Normalizasyon (extension/backend ile birebir) ────────────────────────────

function normalizeTr(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşüâîû]/g, (c) =>
      ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" } as Record<string, string>)[c] ?? c,
    )
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeYerAdi(s: string): string {
  return normalizeTr(s)
    .replace(/\b(mahallesi|mahalle|koyu|koy|beldesi|belde|mah|mh)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Veri tipleri ─────────────────────────────────────────────────────────────

export interface IlanKayit {
  ejId: string;
  ilN: string;
  ilceN: string;
  mahN: string | null;
  kategori: "arsa" | "tarla";
  tlm2: number;
  m2: number;
  lat: number | null;
  lng: number | null;
  /**
   * İlan başlığı — liste JSON-LD'sindeki `name` alanı, ek istek gerektirmiyor.
   * Rafineri NLP'si (hisseli tapu / kooperatif / hobi bahçesi tespiti) ve
   * `segmentBul()` bu metni kullanıyor; şu ana kadar backend tarafında hiç
   * saklanmadığı için ikisi de sinyalsiz çalışıyordu.
   */
  baslik: string | null;
}

export interface EmlakjetRunSonuc {
  islenen_ilce: number;
  toplam_insert: number;
  toplam_skip: number;
  hata_adet: number;
  /** Kaynağın bizi kısıtladığı (429/403/503) ilçe-kategori sayısı. */
  bot_engel_adet: number;
  /** Üst üste bot engeli nedeniyle run erken durduysa true. */
  erken_durdu: boolean;
  sure_ms: number;
}

// ── HTML parse araçları ───────────────────────────────────────────────────────

/**
 * Liste sayfasındaki JSON-LD @graph'tan RealEstateListing objelerini çıkar.
 * Detay sayfasına gitmeden 30 ilan/sayfa parse eder — çok daha hızlı.
 */
export function listeJsonLdParse(html: string, kategoriHedef: string): IlanKayit[] {
  const sonuc: IlanKayit[] = [];

  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let d: any;
    try { d = JSON.parse(m[1].trim()); } catch { continue; }
    if (!d["@graph"] || !Array.isArray(d["@graph"])) continue;

    for (const it of d["@graph"]) {
      if (it["@type"] !== "RealEstateListing") continue;

      // Fiyat
      const fiyat = it.offers?.price ?? it.price;
      if (!fiyat || typeof fiyat !== "number") continue;

      // m2 — additionalProperty'den "Metrekare" veya "Alan"
      const props: any[] = it.additionalProperty || [];
      const m2Prop = props.find((p: any) => p.name === "Metrekare" || p.name === "Alan");
      if (!m2Prop) continue;
      const m2 = parseInt(String(m2Prop.value).replace(/\D/g, ""), 10);
      if (!m2 || m2 < 1 || m2 > 10_000_000) continue;

      const tlm2 = Math.round(fiyat / m2);
      if (tlm2 < 100 || tlm2 > 10_000_000) continue;

      // Konum — "Mahalle, İlçe" formatı
      const konumProp = props.find((p: any) => p.name === "Konum");
      if (!konumProp) continue;
      const parcalar = String(konumProp.value).split(",").map((s: string) => s.trim());
      const mahRaw = parcalar[0] ?? "";
      const ilceRaw = parcalar[1] ?? "";
      if (!ilceRaw) continue;

      // Kategori — "Satılık Arsa" veya "Satılık Tarla"
      const tipProp = props.find((p: any) => p.name === "İlan Tipi");
      const tipStr = String(tipProp?.value ?? "").toLocaleLowerCase("tr-TR");
      let kategori: "arsa" | "tarla" = kategoriHedef as "arsa" | "tarla";
      if (tipStr.includes("tarla")) kategori = "tarla";
      else if (tipStr.includes("arsa")) kategori = "arsa";

      // ID — URL'den
      const idMatch = String(it.url ?? "").match(/-(\d{7,})$/);
      if (!idMatch) continue;

      const ilceN = normalizeTr(ilceRaw);
      const mahN = normalizeYerAdi(mahRaw) || null;

      // il_norm — "@breadcrumb" ya da başka JSON-LD'den çıkarılabilir ama
      // güvenilmez; scraper çağrısında il bilgisi zaten biliniyor, parametre olarak alacağız.
      // Şimdilik placeholder — ilceTara içinde override edilir.
      sonuc.push({
        ejId: idMatch[1],
        ilN: "", // scraper çağrısında doldurulur
        ilceN,
        mahN,
        kategori,
        tlm2,
        m2,
        lat: null,
        lng: null,
        baslik: typeof it.name === "string" ? it.name.slice(0, 300) : null,
      });
    }
  }
  return sonuc;
}

/**
 * Detay sayfası JSON-LD parse (liste JSON-LD yoksa fallback).
 * BreadcrumbList + Product @type kullanır.
 */
export function detayParse(html: string): { il: string | null; ilce: string | null; mahalle: string | null; kategori: "arsa" | "tarla"; fiyat: number | null; m2: number | null } {
  let fiyat: number | null = null;
  let bc: string[] = [];
  let kategori: "arsa" | "tarla" = "arsa";

  for (const m of html.matchAll(/application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let d: any;
    try { d = JSON.parse(m[1]); } catch { continue; }
    const items = Array.isArray(d) ? d : [d];
    for (const it of items) {
      if (it["@type"] === "Product") {
        const p = it.offers?.price;
        if (p) fiyat = parseInt(String(p).replace(/\D/g, ""), 10) || null;
      }
      if (it["@type"] === "BreadcrumbList") {
        bc = (it.itemListElement || [])
          .map((x: any) => (typeof x.item === "object" ? x.item?.name : x.name))
          .filter(Boolean);
      }
    }
  }

  for (const b of bc) {
    const l = b.toLocaleLowerCase("tr-TR");
    if (l.includes("tarla")) kategori = "tarla";
    else if (l.includes("arsa")) kategori = "arsa";
  }

  // Breadcrumb'dan il/ilce/mahalle — format: ["Anasayfa", "Satılık Arsa", "İstanbul", "Kadıköy", "Fenerbahçe Mah."]
  const yerler = bc
    .filter((b) => !/^anasayfa$/i.test(b) && !/satılık (arsa|tarla)/i.test(b))
    .map((b) => b.replace(/satılık (arsa|tarla)/i, "").trim())
    .filter((x) => x.length > 0);

  // m2 — "616 m²" regex
  const m2lar = [...html.matchAll(/(\d{1,3}(?:\.\d{3})*)\s*m²/g)]
    .map((m) => parseInt(m[1].replace(/\./g, ""), 10))
    .filter((v) => v > 0 && v < 1e7);
  let m2: number | null = null;
  if (m2lar.length) {
    const freq: Record<number, number> = {};
    for (const v of m2lar) freq[v] = (freq[v] ?? 0) + 1;
    m2 = Number(Object.entries(freq).sort((a, b) => Number(b[1]) - Number(a[1]))[0]![0]);
  }

  return {
    il: yerler[0] ?? null,
    ilce: yerler[1] ?? null,
    mahalle: yerler[2] ?? null,
    kategori,
    fiyat,
    m2,
  };
}

/** Detay sayfasından ilan başlığını çıkar (h1 önce, yoksa <title>). */
export function baslikCikar(html: string): string | null {
  const h1 = html.match(/<h1[^>]*>([^<]{3,300})<\/h1>/)?.[1];
  if (h1) return h1.trim().slice(0, 300);
  const t = html.match(/<title[^>]*>([^<]{3,300})<\/title>/)?.[1];
  return t ? t.trim().slice(0, 300) : null;
}

/** İlan bağlantılarını HTML'den çıkar. */
export function ilanLinkleriCikar(html: string): string[] {
  const set = new Set<string>();
  for (const m of html.matchAll(/\/ilan\/[a-z0-9-]+-\d{7,}/g)) set.add(m[0]);
  return [...set];
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

/**
 * Sayfa çekme sonucu — HTTP DURUMU ÇAĞIRANA MUTLAKA DÖNER (Sprint B.4).
 *
 * Eskiden bu fonksiyon `!res.ok` durumunda `null` dönüyordu ve çağıran bunu
 * "bu ilçede ilan yok" ile aynı şey sanıyordu. hepsiemlak'ta aynı kusur 254
 * ilçenin "tarandı, ilan yok" diye damgalanmasına yol açtı; engellenme veri
 * yokluğu gibi raporlandı. Durum kodu olmadan bu ikisi ayırt edilemez.
 *
 * `status: 0` → ağ hatası / zaman aşımı (yanıt hiç alınamadı).
 */
interface SayfaSonuc {
  status: number;
  govde: string | null;
}

/** Kaynağın bizi kısıtladığını söyleyen durumlar — veri yokluğu DEĞİL. */
export function botEngelMi(status: number): boolean {
  return status === 429 || status === 403 || status === 503;
}

async function sayfaCek(url: string, timeoutMs = 20_000): Promise<SayfaSonuc> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "tr-TR,tr;q=0.9",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) return { status: res.status, govde: null };
    return { status: res.status, govde: await res.text() };
  } catch (e) {
    log.warn("emlakjet.sayfa-cek.ag-hatasi", {
      url,
      hata: e instanceof Error ? e.message : String(e),
    });
    return { status: 0, govde: null };
  } finally {
    clearTimeout(t);
  }
}

// ── Koordinat lookup (D1'dan) ─────────────────────────────────────────────────

// ── D1 INSERT ─────────────────────────────────────────────────────────────────

/** Parse edilmiş emlakjet kaydını veri katmanı üzerinden yazar. */
async function ilanKaydet(db: D1Database, ilan: IlanKayit): Promise<boolean> {
  // Koordinat çözümlemesi, kolon listesi ve çakışma davranışı
  // lib/veri-katmani.ts'te — kopyalanan koordinatAra() bu modülde de var
  // olmayan mahalle_merkez tablosuna sorup sessizce null dönüyordu.
  return ilanYaz(db, {
    kaynak: "emlakjet",
    ilanNo: `ej_${ilan.ejId}`,
    ilNorm: ilan.ilN,
    ilceNorm: ilan.ilceN,
    mahalleNorm: ilan.mahN,
    fiyatPerM2: ilan.tlm2,
    m2: ilan.m2,
    kategori: ilan.kategori as IlanKategori,
    baslik: ilan.baslik,
    // lat/lng bilinçli olarak GEÇİLMİYOR: veri katmanı mahalle merkezinden
    // çözecek. Scraper'ın kendi koordinat kaynağı yok.
  });
}

// ── İlçe tarama ───────────────────────────────────────────────────────────────

export interface IlceTaramaSonuc {
  ilN: string;
  ilceN: string;
  kategori: string;
  eklenen: number;
  atlanan: number;
  sayfa: number;
  hata: boolean;
  /**
   * Kaynak bizi kısıtladı (429/403/503). `hata`dan AYRI tutuluyor: bot engeli
   * "burada ilan yok" değil "bakamadık" demek. Rotasyon damgası bunu
   * `son_durum='bot-engel'` olarak yazar ki ilçe yeniden sıraya girsin.
   */
  botEngel: boolean;
  /** Son görülen HTTP durumu — 0 ise yanıt hiç alınamadı. */
  sonDurum: number;
}

/**
 * Tek ilçe + kategori kombinasyonunu tara.
 * Liste JSON-LD → hızlı yol (detay sayfasız).
 * JSON-LD yoksa link listesi → detay sayfası fallback.
 */
export async function emlakjetIlceTara(
  db: D1Database,
  ilN: string,
  ilceN: string,
  kategori: "arsa" | "tarla",
  maxSayfa = 3,
): Promise<IlceTaramaSonuc> {
  const sonuc: IlceTaramaSonuc = {
    ilN, ilceN, kategori, eklenen: 0, atlanan: 0, sayfa: 0,
    hata: false, botEngel: false, sonDurum: 0,
  };

  // URL pattern'ları — il-ilce önce, sadece ilce fallback
  const urlPat = [
    (s: string) => `${EMLAKJET_BASE}/satilik-${kategori}/${ilN}-${ilceN}${s}`,
    (s: string) => `${EMLAKJET_BASE}/satilik-${kategori}/${ilceN}${s}`,
  ];
  let patIdx = 0;
  const gorulenler = new Set<string>();
  /** Fallback yolunda üst üste kaç sayfa hiç yeni ilan getirmedi. */
  let ardisikBosSayfa = 0;

  for (let sayfa = 1; sayfa <= maxSayfa; sayfa++) {
    const suffix = sayfa > 1 ? `?sayfa=${sayfa}` : "";
    let html: string | null = null;

    for (let p = patIdx; p < urlPat.length; p++) {
      const r = await sayfaCek(urlPat[p](suffix));
      sonuc.sonDurum = r.status;
      // Bot engeli URL kalıbı denemesini anlamsız kılar: ikinci kalıbı denemek
      // kısıtlamayı derinleştirir. Hemen çık, damga 'bot-engel' olsun.
      if (botEngelMi(r.status)) {
        sonuc.botEngel = true;
        break;
      }
      html = r.govde;
      if (html) { patIdx = p; break; }
    }
    if (sonuc.botEngel) {
      log.warn("emlakjet.bot-engel", { il: ilN, ilce: ilceN, kategori, sayfa, status: sonuc.sonDurum });
      break;
    }
    if (!html) {
      // 404/başka bir hata ya da ağ hatası — ilçe için VERİ YOK diyemeyiz,
      // yalnızca bu koşuda alamadık. `hata` bayrağı damgaya taşınıyor.
      sonuc.hata = true;
      break;
    }
    sonuc.sayfa = sayfa;

    // ── Hızlı yol: JSON-LD liste parse ──────────────────────────────────────
    const ilanlar = listeJsonLdParse(html, kategori);
    if (ilanlar.length > 0) {
      let yeniBuSayfa = 0;
      for (const ilan of ilanlar) {
        if (gorulenler.has(ilan.ejId)) { sonuc.atlanan++; continue; }
        gorulenler.add(ilan.ejId);

        // il_norm scraper'dan biliniyor — override et
        ilan.ilN = ilN;
        // ilceN'i JSON-LD'den gelen ile çakışma varsa parametre kazanır (güvenilir)
        if (!ilan.ilceN) ilan.ilceN = ilceN;

        // Koordinat çözümlemesi ilanKaydet -> veri-katmani içinde yapılıyor.
        const ok = await ilanKaydet(db, ilan);
        if (ok) { sonuc.eklenen++; yeniBuSayfa++; }
        else sonuc.atlanan++;
      }
      // NOT: eskiden burada `if (yeniBuSayfa === 0) break;` vardı ve bu
      // sessiz bir veri kaybıydı. "Bu sayfada yeni ilan yok" ile "sayfalama
      // bitti" AYNI ŞEY DEĞİL: daha önce sığ taranmış (ilk 3 sayfası alınmış)
      // bir ilçede 1. sayfa tamamen tanıdık çıkıyor, döngü anında kırılıyor ve
      // 4+ sayfalara HİÇ ulaşılamıyordu. Ölçüm: 6 ilçede kapsam ~%39.
      //
      // Doğru bitiş koşulu sayfanın HİÇ ilan döndürmemesi — o da yukarıdaki
      // `ilanlar.length > 0` dalına girmeyerek zaten aşağıda ele alınıyor.
      // Üst sınır maxSayfa; taranmış ilçede maliyet maxSayfa sayfa isteği
      // (ilan başına değil), yani kabul edilebilir.
      continue;
    }

    // ── Fallback: link listesi → detay sayfaları ─────────────────────────────
    const linkler = ilanLinkleriCikar(html);
    if (linkler.length === 0) {
      if (patIdx < urlPat.length - 1) { patIdx++; sayfa--; continue; }
      break;
    }

    let yeniBuSayfa = 0;
    for (const link of linkler) {
      const idMatch = link.match(/(\d{7,})$/);
      if (!idMatch) continue;
      const ejId = idMatch[1];
      if (gorulenler.has(ejId)) { sonuc.atlanan++; continue; }
      gorulenler.add(ejId);

      const detay = await sayfaCek(`${EMLAKJET_BASE}${link}`);
      sonuc.sonDurum = detay.status;
      if (botEngelMi(detay.status)) {
        // Detay yolunda engel: kalan linkleri denemek kısıtlamayı derinleştirir.
        sonuc.botEngel = true;
        log.warn("emlakjet.bot-engel", { il: ilN, ilce: ilceN, kategori, sayfa, status: detay.status });
        break;
      }
      const dhtml = detay.govde;
      if (!dhtml) continue;

      const r = detayParse(dhtml);
      if (!r.fiyat || !r.m2 || !r.ilce) continue;
      const tlm2 = Math.round(r.fiyat / r.m2);
      if (tlm2 < 100 || tlm2 > 10_000_000) continue;

      const mahN = r.mahalle ? normalizeYerAdi(r.mahalle) : null;

      const ilan: IlanKayit = {
        ejId,
        ilN,
        ilceN: normalizeTr(r.ilce ?? ilceN),
        mahN,
        kategori: r.kategori,
        tlm2,
        m2: r.m2,
        lat: null,
        lng: null,
        // Detay fallback yolunda başlığı <title>/<h1>'den al — liste JSON-LD'si
        // yoksa buraya düşülüyor, başlık yine de yakalanabiliyor.
        baslik: baslikCikar(dhtml),
      };

      const ok = await ilanKaydet(db, ilan);
      if (ok) { sonuc.eklenen++; yeniBuSayfa++; }
      else sonuc.atlanan++;
    }
    // Aynı düzeltme hızlı yoldaki gibi: "yeni ilan yok" ≠ "sayfalama bitti".
    // Bu fallback yolu ilan başına 1 detay isteği yaptığından pahalı; bu yüzden
    // burada tamamen sınırsız gitmiyoruz — üst üste 2 sayfa hiç yeni ilan
    // getirmediyse gerçekten sonun geldiğini kabul ediyoruz.
    if (sonuc.botEngel) break;
    if (yeniBuSayfa === 0) {
      if (++ardisikBosSayfa >= 2) break;
    } else {
      ardisikBosSayfa = 0;
    }
  }

  // Rotasyon damgası — veri katmanı üzerinden (tarama_durum, migration 0030).
  // Bot engeli 'hata'dan ayrı damgalanır: rotasyon 'bot-engel' gören ilçeyi
  // "tarandı, ilan yok" saymamalı, yeniden sıraya almalı.
  const damgaDurum = sonuc.botEngel ? "bot-engel" : sonuc.hata ? "hata" : "tamam";
  await taramaDamgala(db, "emlakjet", { ilNorm: ilN, ilceNorm: ilceN, kategori },
                      sonuc.eklenen, damgaDurum);

  return sonuc;
}

// ── Çoklu ilçe run ───────────────────────────────────────────────────────────

export interface EmlakjetRunGirdi {
  ilN: string;
  ilceN: string;
}

/**
 * Birden fazla ilçeyi sırayla tara.
 * Worker 30s CPU limitine dikkat — maxIlce ile sınırla.
 * Her ilçe için arsa + tarla (2 kategori × maxSayfa sayfa).
 */
/** Kategori taramaları arası bekleme — bkz. emlakjetRunBaslat içindeki not. */
const KATEGORI_ARASI_MS = 400;

/** Üst üste kaç bot engeli sonrası koşu, toplananı koruyarak durur. */
const MAX_ARDISIK_BOT_ENGEL = 3;

export async function emlakjetRunBaslat(
  db: D1Database,
  hedefler: EmlakjetRunGirdi[],
  maxIlce = 10,
  maxSayfaPerIlce = 3,
  tetik = "manuel",
): Promise<EmlakjetRunSonuc> {
  const t0 = Date.now();
  const hedeflerSlice = hedefler.slice(0, maxIlce);

  let toplamInsert = 0;
  let toplamSkip = 0;
  let hataAdet = 0;
  let botEngelAdet = 0;
  let islenen = 0;
  /** Üst üste bot engeli — kaynağı zorlamak yerine koşuyu bitiriyoruz. */
  let ardisikBotEngel = 0;
  let erkenDurdu = false;

  // Run kaydı oluştur
  let runId: number | null = null;
  try {
    const r = await db
      .prepare(
        `INSERT INTO scraper_run (baslangic, tetik, islenen_ilce, toplam_link, toplam_insert, bot_engel_adet, hata_adet, durum)
         VALUES (?, ?, 0, 0, 0, 0, 0, 'calisiyor')`,
      )
      .bind(t0, `emlakjet-${tetik}`)
      .run();
    runId = r.meta.last_row_id as number;
  } catch (e) {
    // scraper_run kaydı açılamadı — run görünmez olur ama tarama sürer.
    // Sessizce geçilmiyor: bu tablo panonun tek koşu geçmişi kaynağı.
    log.warn("emlakjet.run-kaydi.acilamadi", { hata: e instanceof Error ? e.message : String(e) });
  }

  for (const { ilN, ilceN } of hedeflerSlice) {
    if (erkenDurdu) break;
    for (const kat of ["arsa", "tarla"] as const) {
      if (!GECERLI_KATEGORI.has(kat)) continue;
      try {
        const s = await emlakjetIlceTara(db, ilN, ilceN, kat, maxSayfaPerIlce);
        toplamInsert += s.eklenen;
        toplamSkip += s.atlanan;
        if (s.hata) hataAdet++;
        if (s.botEngel) {
          botEngelAdet++;
          // Engellenme veri yokluğu değil: üst üste görüyorsak devam etmek hem
          // kısıtlamayı derinleştirir hem de ilçeleri "tarandı" diye damgalar.
          if (++ardisikBotEngel >= MAX_ARDISIK_BOT_ENGEL) {
            erkenDurdu = true;
            log.error("emlakjet.run.bot-engel-durdu", {
              ardisik: ardisikBotEngel, islenen, toplamInsert,
            });
            break;
          }
        } else {
          ardisikBotEngel = 0;
        }
      } catch (e) {
        hataAdet++;
        log.warn("emlakjet.ilce-tara.istisna", {
          il: ilN, ilce: ilceN, kategori: kat,
          hata: e instanceof Error ? e.message : String(e),
        });
      }
      // Kategori taramaları arası nezaket beklemesi. Tarama sıklığı aylıktan
      // günlüğe çıkarıldı (~30x hacim); kaynağa bindirilen anlık yükü aynı
      // tutmak için istekler arasına açıkça boşluk konuyor.
      await new Promise((r) => setTimeout(r, KATEGORI_ARASI_MS));
    }
    islenen++;
  }

  const sureMs = Date.now() - t0;

  // Run kaydını güncelle
  if (runId !== null) {
    try {
      await db
        .prepare(
          `UPDATE scraper_run SET bitis = ?, islenen_ilce = ?, toplam_insert = ?,
           bot_engel_adet = ?, hata_adet = ?, durum = ? WHERE id = ?`,
        )
        .bind(
          Date.now(), islenen, toplamInsert, botEngelAdet, hataAdet,
          erkenDurdu ? "bot-bloke" : hataAdet > islenen * 2 ? "hata" : "tamam",
          runId,
        )
        .run();
    } catch (e) {
      log.warn("emlakjet.run-kaydi.kapatilamadi", {
        runId, hata: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    islenen_ilce: islenen,
    toplam_insert: toplamInsert,
    toplam_skip: toplamSkip,
    hata_adet: hataAdet,
    bot_engel_adet: botEngelAdet,
    erken_durdu: erkenDurdu,
    sure_ms: sureMs,
  };
}
