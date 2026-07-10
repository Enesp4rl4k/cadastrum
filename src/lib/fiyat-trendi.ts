/**
 * Fiyat Trendi Motoru — kullanıcının kendi ilanGozlem verisinden
 * mahalle/ilçe bazlı haftalık TL/m² zaman serisi üretir.
 *
 * Dış veri gerekmez — extension'ın birikim yaptığı Sahibinden/Hepsiemlak
 * ilanları (ilanGozlem tablosu) ham materyal olarak kullanılır.
 *
 * Algoritma:
 *   1. ilceNorm + mahalleNorm ile ilanGozlem tablosunu [ilceNorm+mahalleNorm]
 *      compound index'i üzerinden sorgula (v14'te eklendi — full scan YOK).
 *   2. TL cinsinden, fiyatPerM2 > 0 olan kayıtları filtrele.
 *   3. Kayıtları ISO hafta bucket'larına grupla (son 52 hafta).
 *   4. Her bucket için medyan + ortalama + adet hesapla.
 *   5. Sonucu fiyatTrendi tablosuna 7 gün TTL ile cache'le.
 *   6. Trend yorumu: lineer regresyon ile aylık değişim yüzdesi.
 */

import { db, type FiyatTrendi, type HaftalikNokta } from "./db";
import { normalizeYerAdi } from "./tkgm-api";

const TREND_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün
/** Son kaç haftaya bak */
const MAX_HAFTA = 52;
/** Bir bucket'ın geçerli sayılması için minimum ilan sayısı */
const MIN_ILAN_ADET = 2;

// ─── ISO hafta yardımcıları ───────────────────────────────────────────────────

/** Unix timestamp'ten "YYYY-Www" döndür. */
function tsToIsoHafta(ts: number): string {
  const d = new Date(ts);
  // ISO hafta: Pazartesi başlangıcı, Perşembe haftanın ortası
  const day = d.getUTCDay() || 7; // 0=Pazar → 7
  d.setUTCDate(d.getUTCDate() + 4 - day); // Perşembe'ye git
  const yil = d.getUTCFullYear();
  const yilBaslangic = new Date(Date.UTC(yil, 0, 1));
  const hafta = Math.ceil(((d.getTime() - yilBaslangic.getTime()) / 86400000 + 1) / 7);
  return `${yil}-W${String(hafta).padStart(2, "0")}`;
}

/** ISO hafta string'inden o haftanın Pazartesi'sinin timestamp'ini döndür. */
function isoHaftaToTs(hafta: string): number {
  const [yilStr, haftaStr] = hafta.split("-W");
  const yil = Number(yilStr);
  const haftaNo = Number(haftaStr);
  // ISO haftasının Pazartesi'si: 4 Ocak her zaman 1. haftadadır
  const d = new Date(Date.UTC(yil, 0, 4));
  const gunOfset = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - gunOfset + 1 + (haftaNo - 1) * 7);
  return d.getTime();
}

// ─── İstatistik yardımcıları ──────────────────────────────────────────────────

function medyan(dizi: number[]): number {
  if (dizi.length === 0) return 0;
  const s = [...dizi].sort((a, b) => a - b);
  const orta = Math.floor(s.length / 2);
  return s.length % 2 === 0
    ? Math.round(((s[orta - 1] ?? 0) + (s[orta] ?? 0)) / 2)
    : Math.round(s[orta] ?? 0);
}

function ortalama(dizi: number[]): number {
  if (dizi.length === 0) return 0;
  return Math.round(dizi.reduce((s, v) => s + v, 0) / dizi.length);
}

// ─── Lineer regresyon ─────────────────────────────────────────────────────────

export interface TrendYorumu {
  /** Aylık değişim yüzdesi (+/- % olarak) */
  aylikDegisimYuzde: number;
  /** "artan" | "dusen" | "yatay" */
  yon: "artan" | "dusen" | "yatay";
  /** Regresyon R² (0-1) — ne kadar güvenilir */
  r2: number;
  /** Başlangıç - bitiş fiyat farkı yüzdesi */
  toplamDegisimYuzde: number;
  /** Veri noktası sayısı */
  noktaSayisi: number;
}

/**
 * Basit lineer regresyon (x = hafta indeksi, y = medyan TL/m²).
 * Eğim / ortalama y → aylık % değişim.
 */
export function trendHesapla(noktalar: HaftalikNokta[]): TrendYorumu | null {
  const gecerli = noktalar.filter((n) => n.ilanAdet >= MIN_ILAN_ADET);
  if (gecerli.length < 3) return null;

  const n = gecerli.length;
  const xs = gecerli.map((_, i) => i);
  const ys = gecerli.map((n) => n.medyanPerM2);

  const xOrt = xs.reduce((s, v) => s + v, 0) / n;
  const yOrt = ys.reduce((s, v) => s + v, 0) / n;

  let ssXY = 0;
  let ssXX = 0;
  let ssYY = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] ?? 0) - xOrt;
    const dy = (ys[i] ?? 0) - yOrt;
    ssXY += dx * dy;
    ssXX += dx * dx;
    ssYY += dy * dy;
  }

  if (ssXX === 0) return null;

  const egim = ssXY / ssXX; // TL/m² / hafta
  const r2 = ssYY > 0 ? Math.min(1, Math.max(0, (ssXY * ssXY) / (ssXX * ssYY))) : 0;

  // Aylık değişim: egim * 4.33 hafta / yOrt * 100
  const aylikDegisimYuzde =
    yOrt > 0 ? Math.round((egim * 4.33 * 100) / yOrt * 10) / 10 : 0;

  const toplamDegisimYuzde =
    (ys[0] ?? 0) > 0
      ? Math.round((((ys[n - 1] ?? 0) - (ys[0] ?? 0)) / (ys[0] ?? 1)) * 1000) / 10
      : 0;

  const yonEsik = 0.5; // %0.5/ay altı yatay kabul
  const yonDeger: TrendYorumu["yon"] =
    aylikDegisimYuzde > yonEsik
      ? "artan"
      : aylikDegisimYuzde < -yonEsik
        ? "dusen"
        : "yatay";

  return {
    aylikDegisimYuzde,
    yon: yonDeger,
    r2: Math.round(r2 * 100) / 100,
    toplamDegisimYuzde,
    noktaSayisi: n,
  };
}

// ─── Ana hesaplama fonksiyonu ─────────────────────────────────────────────────

function trendiKey(
  ilceNorm: string,
  mahalleNorm: string,
  kategori: FiyatTrendi["kategori"],
): string {
  return `${ilceNorm}|${mahalleNorm}|${kategori}`;
}

/**
 * Mahalle veya ilçe bazlı fiyat trendini hesaplar.
 *
 * Önce cache'e bakar (7 gün TTL). Cache miss'te ilanGozlem tablosundan
 * [ilceNorm+mahalleNorm] compound index'i ile sorgular — full scan YOK.
 *
 * @param ilce  - İlçe adı (normalize edilmemiş) veya norm
 * @param mahalle - Mahalle adı (boş string = ilçe seviyesi)
 * @param kategori - "tum" | "arsa" | "tarla"
 * @param forceRefresh - Cache'i atla, yeniden hesapla
 */
export async function fiyatTrendiGetir(
  ilce: string,
  mahalle: string,
  kategori: FiyatTrendi["kategori"] = "tum",
  forceRefresh = false,
): Promise<FiyatTrendi | null> {
  const ilceNorm = normalizeYerAdi(ilce) ?? "";
  const mahalleNorm = mahalle ? (normalizeYerAdi(mahalle) ?? "") : "";

  if (!ilceNorm) return null;

  const key = trendiKey(ilceNorm, mahalleNorm, kategori);

  // Cache hit kontrolü
  if (!forceRefresh) {
    try {
      const cached = await db.fiyatTrendi.get(key);
      if (cached && Date.now() - cached.fetchedAt < TREND_CACHE_TTL_MS) {
        return cached;
      }
    } catch {
      // Dexie hatası → cache yok say
    }
  }

  // ilanGozlem'den veri çek — v14 compound index ile hızlı
  let kayitlar;
  try {
    if (mahalleNorm) {
      // Mahalle seviyesi: [ilceNorm+mahalleNorm] compound index
      kayitlar = await db.ilanGozlem
        .where("[ilceNorm+mahalleNorm]")
        .equals([ilceNorm, mahalleNorm])
        .toArray();
    } else {
      // İlçe seviyesi: [ilceNorm+zaman] index üzerinden ilce filtresi
      kayitlar = await db.ilanGozlem
        .where("[ilceNorm+zaman]")
        .between([ilceNorm, 0], [ilceNorm, Date.now()])
        .toArray();
    }
  } catch {
    return null;
  }

  // Filtrele: TL, pozitif fiyatPerM2, son MAX_HAFTA hafta
  const sinirTs = Date.now() - MAX_HAFTA * 7 * 24 * 60 * 60 * 1000;
  const filtrelenmis = kayitlar.filter((k) => {
    if (!k.fiyatPerM2 || k.fiyatPerM2 <= 0) return false;
    if (k.paraBirimi && k.paraBirimi !== "TL") return false;
    if ((k.zaman ?? 0) < sinirTs) return false;
    // Kategori filtresi — basit nitelik/imar tespiti
    if (kategori !== "tum") {
      const baslik = (k.baslik ?? "").toLowerCase();
      const imar = (k.imarDurumu ?? "").toLowerCase();
      if (kategori === "tarla") {
        if (!/tarla|tarım|tarim/.test(baslik + imar)) return false;
      } else if (kategori === "arsa") {
        if (/tarla|tarım|tarim/.test(baslik + imar)) return false;
      }
    }
    return true;
  });

  if (filtrelenmis.length === 0) return null;

  // Haftalık bucket'lara grupla
  const bucketMap = new Map<string, number[]>();
  for (const k of filtrelenmis) {
    const hafta = tsToIsoHafta(k.zaman ?? Date.now());
    const fiyatlar = bucketMap.get(hafta) ?? [];
    fiyatlar.push(k.fiyatPerM2!);
    bucketMap.set(hafta, fiyatlar);
  }

  // Kronolojik sırala + MIN_ILAN_ADET filtresi
  const noktalar: HaftalikNokta[] = [...bucketMap.entries()]
    .filter(([, fiyatlar]) => fiyatlar.length >= MIN_ILAN_ADET)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hafta, fiyatlar]) => ({
      hafta,
      ts: isoHaftaToTs(hafta),
      medyanPerM2: medyan(fiyatlar),
      ortalamaPerM2: ortalama(fiyatlar),
      ilanAdet: fiyatlar.length,
    }));

  if (noktalar.length === 0) return null;

  const sonuc: FiyatTrendi = {
    key,
    ilceNorm,
    mahalleNorm,
    kategori,
    noktalar,
    toplamIlan: filtrelenmis.length,
    fetchedAt: Date.now(),
    seviye: mahalleNorm ? "mahalle" : "ilce",
  };

  // Cache'e yaz — silently fail
  db.fiyatTrendi.put(sonuc).catch(() => {});

  return sonuc;
}

/**
 * Hem mahalle hem ilçe trendini getir, hangisi daha iyi veri içeriyorsa onu döndür.
 * Mahalle en az 3 veri noktasına sahipse öncelikli; yoksa ilçeye fall back.
 */
export async function enIyiTrendiGetir(
  ilce: string,
  mahalle: string,
  kategori: FiyatTrendi["kategori"] = "tum",
): Promise<{ trend: FiyatTrendi; yorum: TrendYorumu | null } | null> {
  // Paralel çek
  const [mahalleTrend, ilceTrend] = await Promise.all([
    mahalle ? fiyatTrendiGetir(ilce, mahalle, kategori) : Promise.resolve(null),
    fiyatTrendiGetir(ilce, "", kategori),
  ]);

  // Mahalle yeterli veriye sahipse öncelikli
  const gecerliMahalle =
    mahalleTrend && mahalleTrend.noktalar.length >= 3
      ? mahalleTrend
      : null;

  const secilen = gecerliMahalle ?? ilceTrend;
  if (!secilen) return null;

  const yorum = trendHesapla(secilen.noktalar);
  return { trend: secilen, yorum };
}
