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
 *   4. scraper_ilce_durum tablosunu güncelle
 *
 * Worker sınırlamaları:
 *   - CPU timeout: 30s (default) veya 5dk (Unbound plan)
 *   - Paralel fetch: context.waitUntil ile arka planda çalışır
 *   - MERKEZ_TUPLES: Worker'a bundle edilemeyecek kadar büyük — koordinatlar
 *     D1'daki mahalle_merkez tablosundan çekilir (lazy, yoksa null)
 *
 * Kullanım:
 *   import { emlakjetIlceTara, emlakjetRunBaslat } from "../lib/emlakjet-scraper.js";
 */

import type { D1Database } from "@cloudflare/workers-types";

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

interface IlanKayit {
  ejId: string;
  ilN: string;
  ilceN: string;
  mahN: string | null;
  kategori: "arsa" | "tarla";
  tlm2: number;
  m2: number;
  lat: number | null;
  lng: number | null;
}

export interface EmlakjetRunSonuc {
  islenen_ilce: number;
  toplam_insert: number;
  toplam_skip: number;
  hata_adet: number;
  sure_ms: number;
}

// ── HTML parse araçları ───────────────────────────────────────────────────────

/**
 * Liste sayfasındaki JSON-LD @graph'tan RealEstateListing objelerini çıkar.
 * Detay sayfasına gitmeden 30 ilan/sayfa parse eder — çok daha hızlı.
 */
function listeJsonLdParse(html: string, kategoriHedef: string): IlanKayit[] {
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
      });
    }
  }
  return sonuc;
}

/**
 * Detay sayfası JSON-LD parse (liste JSON-LD yoksa fallback).
 * BreadcrumbList + Product @type kullanır.
 */
function detayParse(html: string): { il: string | null; ilce: string | null; mahalle: string | null; kategori: "arsa" | "tarla"; fiyat: number | null; m2: number | null } {
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

/** İlan bağlantılarını HTML'den çıkar. */
function ilanLinkleriCikar(html: string): string[] {
  const set = new Set<string>();
  for (const m of html.matchAll(/\/ilan\/[a-z0-9-]+-\d{7,}/g)) set.add(m[0]);
  return [...set];
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function sayfaCek(url: string, timeoutMs = 20_000): Promise<string | null> {
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
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ── Koordinat lookup (D1'dan) ─────────────────────────────────────────────────

async function koordinatAra(
  db: D1Database,
  ilN: string,
  ilceN: string,
  mahN: string | null,
): Promise<{ lat: number; lng: number } | null> {
  if (!mahN) return null;
  try {
    const row = await db
      .prepare(
        `SELECT lat, lng FROM mahalle_merkez
         WHERE il_norm = ? AND ilce_norm = ? AND mahalle_norm = ?
         LIMIT 1`,
      )
      .bind(ilN, ilceN, mahN)
      .first<{ lat: number; lng: number }>();
    return row ?? null;
  } catch {
    return null;
  }
}

// ── D1 INSERT ─────────────────────────────────────────────────────────────────

async function ilanKaydet(db: D1Database, ilan: IlanKayit): Promise<boolean> {
  try {
    const ts = Date.now();
    await db
      .prepare(
        `INSERT OR IGNORE INTO ilanlar
         (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, fiyat_per_m2, m2,
          kategori, para_birimi, yakalanma_tarihi, lat, lng, koord_kaynagi, aktif)
         VALUES ('emlakjet', ?, ?, ?, ?, ?, ?, ?, 'TL', ?, ?, ?, ?, 1)`,
      )
      .bind(
        `ej_${ilan.ejId}`,
        ilan.ilN,
        ilan.ilceN,
        ilan.mahN,
        ilan.tlm2,
        ilan.m2,
        ilan.kategori,
        ts,
        ilan.lat,
        ilan.lng,
        ilan.lat ? "mahalle-merkez" : null,
      )
      .run();
    return true;
  } catch {
    return false;
  }
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
  const sonuc: IlceTaramaSonuc = { ilN, ilceN, kategori, eklenen: 0, atlanan: 0, sayfa: 0, hata: false };

  // URL pattern'ları — il-ilce önce, sadece ilce fallback
  const urlPat = [
    (s: string) => `${EMLAKJET_BASE}/satilik-${kategori}/${ilN}-${ilceN}${s}`,
    (s: string) => `${EMLAKJET_BASE}/satilik-${kategori}/${ilceN}${s}`,
  ];
  let patIdx = 0;
  const gorulenler = new Set<string>();

  for (let sayfa = 1; sayfa <= maxSayfa; sayfa++) {
    const suffix = sayfa > 1 ? `?sayfa=${sayfa}` : "";
    let html: string | null = null;

    for (let p = patIdx; p < urlPat.length; p++) {
      html = await sayfaCek(urlPat[p](suffix));
      if (html) { patIdx = p; break; }
    }
    if (!html) {
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

        // Koordinat lookup
        const koord = await koordinatAra(db, ilan.ilN, ilan.ilceN, ilan.mahN);
        if (koord) { ilan.lat = koord.lat; ilan.lng = koord.lng; }

        const ok = await ilanKaydet(db, ilan);
        if (ok) { sonuc.eklenen++; yeniBuSayfa++; }
        else sonuc.atlanan++;
      }
      if (yeniBuSayfa === 0) break; // Tüm ilanlar zaten DB'de — son sayfa
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

      const dhtml = await sayfaCek(`${EMLAKJET_BASE}${link}`);
      if (!dhtml) continue;

      const r = detayParse(dhtml);
      if (!r.fiyat || !r.m2 || !r.ilce) continue;
      const tlm2 = Math.round(r.fiyat / r.m2);
      if (tlm2 < 100 || tlm2 > 10_000_000) continue;

      const mahN = r.mahalle ? normalizeYerAdi(r.mahalle) : null;
      const koord = await koordinatAra(db, ilN, ilceN, mahN);

      const ilan: IlanKayit = {
        ejId,
        ilN,
        ilceN: normalizeTr(r.ilce ?? ilceN),
        mahN,
        kategori: r.kategori,
        tlm2,
        m2: r.m2,
        lat: koord?.lat ?? null,
        lng: koord?.lng ?? null,
      };

      const ok = await ilanKaydet(db, ilan);
      if (ok) { sonuc.eklenen++; yeniBuSayfa++; }
      else sonuc.atlanan++;
    }
    if (yeniBuSayfa === 0) break;
  }

  // İlçe durum tablosunu güncelle
  try {
    await db
      .prepare(
        `INSERT INTO scraper_ilce_durum (il_norm, ilce_norm, kategori, son_tarama, son_insert_adet, son_durum)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(il_norm, ilce_norm, kategori)
         DO UPDATE SET son_tarama = excluded.son_tarama,
                       son_insert_adet = excluded.son_insert_adet,
                       son_durum = excluded.son_durum`,
      )
      .bind(ilN, ilceN, kategori, Date.now(), sonuc.eklenen, sonuc.hata ? "hata" : "tamam")
      .run();
  } catch { /* scraper_ilce_durum tablosu yoksa sessizce geç */ }

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
  let islenen = 0;

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
  } catch { /* scraper_run yoksa sessiz */ }

  for (const { ilN, ilceN } of hedeflerSlice) {
    for (const kat of ["arsa", "tarla"] as const) {
      if (!GECERLI_KATEGORI.has(kat)) continue;
      try {
        const s = await emlakjetIlceTara(db, ilN, ilceN, kat, maxSayfaPerIlce);
        toplamInsert += s.eklenen;
        toplamSkip += s.atlanan;
        if (s.hata) hataAdet++;
      } catch {
        hataAdet++;
      }
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
           hata_adet = ?, durum = ? WHERE id = ?`,
        )
        .bind(Date.now(), islenen, toplamInsert, hataAdet, hataAdet > islenen * 2 ? "hata" : "tamam", runId)
        .run();
    } catch { /* sessiz */ }
  }

  return {
    islenen_ilce: islenen,
    toplam_insert: toplamInsert,
    toplam_skip: toplamSkip,
    hata_adet: hataAdet,
    sure_ms: sureMs,
  };
}
