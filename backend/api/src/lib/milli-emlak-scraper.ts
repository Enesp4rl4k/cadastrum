/**
 * Milli Emlak ihale çekici — resmi devlet API'sinden Hazine taşınmaz satışları.
 *
 * NEDEN YENİ BİR KAYNAK: mevcut fiyat verisinin tamamı İLAN (asking) fiyatı ve
 * tek bir ticari kaynaktan (emlakjet) geliyor. Milli Emlak niteliksel olarak
 * farklı üç şey veriyor:
 *   1. ADA/PARSEL numarası — motorun `hasAdaParsel` kalite bonusu ve parselin
 *      kendisiyle birebir eşleşme. Emlakjet ilanlarının hemen hiçbirinde yok.
 *   2. RESMİ DEĞERLEME (muhammen bedel) — piyasa ilanından bağımsız, devletin
 *      kendi kıymet takdiri. İlan fiyatı yanlılığından etkilenmez.
 *   3. Yapısal imar durumu + taşınmaz cinsi, ülke geneli kapsam.
 *
 * KAYNAK: milliemlak.gov.tr Angular SPA'sının arkasındaki JSON API
 * (mebis-s-p.csb.gov.tr/api/MileWeb/GetSatisIlanList). Kamuya açık, kimlik
 * doğrulaması yok, bot koruması yok. Sayfa başına 100 kayıt; aktif ilan sayısı
 * ~390, yani tam tarama 4 istek — çok ucuz.
 *
 * ÖNEMLİ — BU VERİ FİYAT MOTORUNA EMSAL OLARAK BESLENMİYOR:
 * `muhammen_bedel` ihalenin ÇIKIŞ (taban) bedelidir, piyasa değeri değil;
 * tipik olarak piyasanın altındadır ve ihalede üzerine çıkılır. `ilanlar`
 * tablosuna karıştırmak tahminleri sistematik olarak aşağı çekerdi. Bu yüzden
 * kendi tablosunda (milli_emlak_ihale) tutuluyor ve `/v1/milli-emlak/*`
 * endpoint'lerinden ayrı bir sinyal olarak sunuluyor. İhale SONUÇ bedeli
 * (`ihale_bedeli`) API'de yayımlanmıyor; yayımlanırsa gerçek kapanış fiyatı
 * olarak motora bağlanabilir — o zaman asking/kapanış ölçüm sorunu için
 * gerçek bir çapa elde ederiz.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { log } from "./logger.js";

const API = "https://mebis-s-p.csb.gov.tr/api/MileWeb/GetSatisIlanList";
const ORIGIN = "https://milliemlak.gov.tr";
const SAYFA_BOYUT = 100;
const ISTEK_ARASI_MS = 500;

/** Arazi sayılan taşınmaz cinsleri — bina/konut/işyeri dışarıda kalır. */
const ARAZI_CINSLERI = /arsa|arazi|tarla|bağ|bahçe|zeytinlik|çayır|mera|fundalık/i;

interface MeTasinmaz {
  il?: string; ilce?: string; mahalle?: string;
  ada?: string; parsel?: string;
  tasinmaz_cinsi?: string;
  imar_durumu?: string;
  yuzolcumu?: number | null;
  satilacak_yuzolcumu?: number | null;
  hazine_yuzolcumu?: number | null;
  toplam_tahmini_bedel?: number | null;
  ihale_tarihi?: string | null;
}
interface MeIlan { id?: number; tasinmazlar?: MeTasinmaz[] }

/** normalize.ts ile aynı kurallar — Worker içinde tekrar import etmemek için yerel. */
function norm(s: string | undefined | null): string {
  if (!s) return "";
  return s
    .toLocaleLowerCase("tr")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
    .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/â/g, "a").replace(/î/g, "i").replace(/û/g, "u")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Salördek Köyü" → "salordek" — mahalle_norm ilanlar tablosuyla uyumlu olmalı. */
export function mahalleNormalize(s: string | undefined | null): string | null {
  const t = norm(s).replace(/\s+(koyu|mahallesi|mah|mh)\.?$/u, "").trim();
  return t || null;
}

/** ISO tarih → unix ms. Geçersizse null. */
export function tarihMs(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

export interface MeKayit {
  ilNorm: string;
  ilceNorm: string;
  mahalleNorm: string | null;
  adaNo: string | null;
  parselNo: string | null;
  m2: number | null;
  nitelik: string | null;
  muhammenBedel: number | null;
  fiyatPerM2: number | null;
  ihaleTarihi: number | null;
  kaynakUrl: string | null;
}

/**
 * Tek bir taşınmaz kaydını normalize eder. Arazi değilse veya zorunlu alanlar
 * eksikse null döner.
 *
 * Yüzölçümü seçimi: `satilacak_yuzolcumu` varsa o kullanılır (Hazine parselin
 * tamamını değil bir kısmını satıyor olabilir), yoksa `yuzolcumu`. Bedel zaten
 * satılan kısma ait olduğundan TL/m² ancak bu eşleşmeyle doğru çıkar.
 */
export function tasinmazNormalize(t: MeTasinmaz, ilanId?: number): MeKayit | null {
  const cins = t.tasinmaz_cinsi ?? "";
  if (!ARAZI_CINSLERI.test(cins)) return null;

  const ilNorm = norm(t.il);
  const ilceNorm = norm(t.ilce);
  if (!ilNorm || !ilceNorm) return null;

  const m2raw = t.satilacak_yuzolcumu ?? t.yuzolcumu ?? null;
  const m2 = typeof m2raw === "number" && m2raw > 0 ? m2raw : null;

  const bedel =
    typeof t.toplam_tahmini_bedel === "number" && t.toplam_tahmini_bedel > 0
      ? t.toplam_tahmini_bedel
      : null;

  // Saçma TL/m² değerlerini ele — veri hatası ya da birim karışıklığı.
  let fiyatPerM2: number | null = null;
  if (bedel && m2) {
    const p = bedel / m2;
    if (p >= 1 && p <= 5_000_000) fiyatPerM2 = Math.round(p);
  }

  return {
    ilNorm,
    ilceNorm,
    mahalleNorm: mahalleNormalize(t.mahalle),
    adaNo: t.ada?.trim() || null,
    parselNo: t.parsel?.trim() || null,
    m2,
    nitelik: cins.trim() || null,
    muhammenBedel: bedel,
    fiyatPerM2,
    ihaleTarihi: tarihMs(t.ihale_tarihi),
    kaynakUrl: ilanId ? `${ORIGIN}/#/ilan-detay/20/${ilanId}` : null,
  };
}

/**
 * Sayfalama parametresi `offset` — ve bu SAYFA indeksi, satır indeksi değil.
 *
 * DİKKAT: API'nin yanıtında `pageNumber` alanı var ve istek gövdesinde
 * `pageIndex`/`page`/`pageNumber`/`skip`/`start` gönderilirse SESSİZCE yok
 * sayılıp hep 0. sayfa dönüyor (hata vermiyor). İlk yazımda `pageIndex`
 * kullanmıştım ve 8 sayfa çekmeme rağmen aynı 100 kaydı 8 kez almıştım —
 * 792 taşınmazın 696'sı kopya çıktı. Doğrulama: offset 0..3 → 100+100+100+90
 * = 390 = totalRow, offset 4 → boş.
 */
interface MeSayfaSonuc {
  /** HTTP durumu; 0 → yanıt hiç alınamadı, -1 → gövdede hasError. */
  status: number;
  ilanlar: MeIlan[] | null;
}

async function sayfaCek(offset: number): Promise<MeSayfaSonuc> {
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ORIGIN,
        Referer: `${ORIGIN}/`,
        "User-Agent": "Mozilla/5.0 (compatible; CadastrumBot/1.0; +https://cadastrum.com.tr)",
      },
      body: JSON.stringify({ offset, pageSize: SAYFA_BOYUT }),
      signal: AbortSignal.timeout(25_000),
    });
    // Sprint B.4: durum kodu çağırana döner. "Boş sayfa" (sayfalama sonu) ile
    // "istek başarısız" ayrımı buna bağlı; ikisi karışırsa taşınmazların bir
    // kısmı sessizce alınmamış olur.
    if (!res.ok) return { status: res.status, ilanlar: null };
    const j = (await res.json()) as { response_object?: MeIlan[]; hasError?: boolean };
    if (j.hasError) return { status: -1, ilanlar: null };
    return { status: res.status, ilanlar: j.response_object ?? [] };
  } catch (e) {
    log.warn("milli-emlak.sayfa-cek.ag-hatasi", {
      offset, hata: e instanceof Error ? e.message : String(e),
    });
    return { status: 0, ilanlar: null };
  }
}

export interface MeTaramaSonuc {
  /** Başarısız istekte son görülen HTTP durumu (0 = ağ hatası, -1 = hasError). */
  sonDurum?: number;
  sayfa: number;
  gorulenTasinmaz: number;
  araziOlan: number;
  eklenen: number;
  guncellenen: number;
  hata: number;
  sure_ms: number;
}

/**
 * Aktif Milli Emlak satış ihalelerini tarar ve `milli_emlak_ihale`'ye yazar.
 *
 * Tablo UNIQUE(il_norm, ilce_norm, ada_no, parsel_no, ihale_tarihi) ile
 * korunuyor; aynı ihale tekrar görülürse bedel/m² güncelleniyor (ihale ertelenip
 * bedel revize edilebiliyor).
 */
export async function milliEmlakTaramaTuru(
  db: D1Database,
  maxSayfa = 6,
): Promise<MeTaramaSonuc> {
  const basladi = Date.now();
  const s: MeTaramaSonuc = {
    sayfa: 0, gorulenTasinmaz: 0, araziOlan: 0,
    eklenen: 0, guncellenen: 0, hata: 0, sure_ms: 0,
  };

  for (let p = 0; p < maxSayfa; p++) {
    const { status, ilanlar } = await sayfaCek(p);
    if (ilanlar === null) {
      // İstek başarısız — "kayıt bitti" DEĞİL. Durum kodu loglanıyor ki
      // engellenme ile gerçek son ayırt edilebilsin.
      s.hata++;
      s.sonDurum = status;
      log.warn("milli-emlak.sayfa-basarisiz", { offset: p, status });
      break;
    }
    if (ilanlar.length === 0) break; // gerçek sayfalama sonu (kaynağın sinyali)
    s.sayfa++;

    for (const ilan of ilanlar) {
      for (const t of ilan.tasinmazlar ?? []) {
        s.gorulenTasinmaz++;
        const k = tasinmazNormalize(t, ilan.id);
        if (!k) continue;
        s.araziOlan++;

        try {
          const r = await db
            .prepare(
              `INSERT INTO milli_emlak_ihale (
                 il_norm, ilce_norm, mahalle_norm, ada_no, parsel_no, m2, nitelik,
                 muhammen_bedel, fiyat_per_m2, ihale_tarihi, ihale_tipi,
                 kaynak_url, yakalanma_tarihi, aktif
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'satis', ?, ?, 1)
               ON CONFLICT(il_norm, ilce_norm, ada_no, parsel_no, ihale_tarihi)
               DO UPDATE SET
                 m2 = excluded.m2,
                 muhammen_bedel = excluded.muhammen_bedel,
                 fiyat_per_m2 = excluded.fiyat_per_m2,
                 nitelik = excluded.nitelik,
                 yakalanma_tarihi = excluded.yakalanma_tarihi,
                 aktif = 1`,
            )
            .bind(
              k.ilNorm, k.ilceNorm, k.mahalleNorm, k.adaNo, k.parselNo,
              k.m2, k.nitelik, k.muhammenBedel, k.fiyatPerM2, k.ihaleTarihi,
              k.kaynakUrl, Date.now(),
            )
            .run();
          // D1 upsert'te INSERT ve UPDATE ayrımı meta.changes'ten net çıkmıyor;
          // last_row_id değişimi yeni satır işareti olarak kullanılıyor.
          if (r.meta?.last_row_id) s.eklenen++;
          else s.guncellenen++;
        } catch {
          s.hata++;
        }
      }
    }

    await new Promise((r) => setTimeout(r, ISTEK_ARASI_MS));
  }

  s.sure_ms = Date.now() - basladi;
  return s;
}
