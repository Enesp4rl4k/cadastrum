import Dexie, { type EntityTable, type Table } from "dexie";
import type { Parsel } from "../types/tkgm";

export interface FavoriParsel {
  id?: number;
  mahalleKodu: number;
  adaNo: number;
  parselNo: number;
  ilAd: string;
  ilceAd: string;
  mahalleAd: string;
  not: string;
  eklenmeTarihi: number;
  parsel: Parsel;
}

export interface SorguGecmisi {
  id?: number;
  lat: number;
  lng: number;
  zaman: number;
  basarili: boolean;
  parsel?: Parsel;
  hata?: string;
}

export interface IlanGozlem {
  id?: number;
  /** İlan kaynağı — sahibinden, hepsiemlak vb. */
  kaynak?: "sahibinden" | "hepsiemlak";
  ilanNo: string | null;
  url: string;
  baslik: string | null;
  ilAd: string | null;
  ilceAd: string | null;
  mahalleAd: string | null;
  ilNorm?: string | null;
  ilceNorm?: string | null;
  mahalleNorm?: string | null;
  imarDurumu?: string | null;
  fiyat: number | null;
  m2: number | null;
  fiyatPerM2: number | null;
  paraBirimi: string | null;
  adaNo: number | null;
  parselNo: number | null;
  zaman: number;
  /**
   * Faz 2 (Spatial emsal motoru) — koordinat alanları.
   * Eski (v<10) kayıtlarda null; backfill mahalle-merkez fallback'iyle
   * doldurulur. Spatial motor null kayıtları yok sayar.
   */
  lat?: number | null;
  lng?: number | null;
  /** Koord kaynağı — DOM scrape, mahalle merkez, manuel */
  koordKaynagi?: "dom" | "mahalle-merkez" | "manuel" | null;
  /** Koord güvenilirliği — yüksek (DOM/manuel), orta (mahalle), düşük (ilçe fallback) */
  koordDogruluk?: "yuksek" | "orta" | "dusuk" | null;
}

export interface ParselCache {
  key: string;
  parsel: Parsel;
  fetchedAt: number;
}

export interface TkgmAnalizCache {
  ilceKodu: number;
  analizTip: number;
  yil: number;
  noktalar: { parselId: number; enlem: number; boylam: number; sayi: number }[];
  fetchedAt: number;
}

export interface BolgeTaramasi {
  id?: number;
  ad: string;
  not: string;
  olusmaTarihi: number;
  bbox: import("./bolge-profili").BBox;
  parseller: Parsel[];
  stats: import("./bolge-profili").BolgeStats;
}

/**
 * AI tahmin response cache — aynı parsel için aynı prompt = aynı sonuç.
 * 24 saat TTL (kullanıcı parsel bilgisi/baseline değişmemişse boşa AI çağrısı yapmasın).
 * Anahtar = parselKey + heuristic guvenSkoru bucket + ayar saglayici.
 */
export interface AiFiyatCache {
  /** Composite cache key */
  key: string;
  /** Serialize edilmiş AiFiyatSonucu */
  sonuc: import("./ai-fiyat").AiFiyatSonucu;
  fetchedAt: number;
}

/**
 * OSM çevre analizi cache — Overpass sorguları yavaş ve mirror'lar zaman zaman
 * 429/timeout dönüyor. Aynı parsel için tekrar sorgu yapma; lat/lng quantize
 * edilmiş key (~110m hassasiyet).
 *
 * TTL: 7 gün — POI/altyapı veriler yavaş değişir.
 */
export interface OsmCevreCache {
  key: string;
  cevre: import("./osm").CevreAnalizi;
  fetchedAt: number;
}

/**
 * Deprem risk cache — TDTH/USGS endpoint çağrısı yapılırsa burada cache'lenir.
 * Statik il-tablosu fallback için de cache şart değil ama tek noktadan akış için
 * burayı kullanırız.
 *
 * TTL: 90 gün — deprem tehlike haritası 5+ yılda bir revize edilir.
 */
export interface DepremRiskCache {
  key: string;
  risk: import("./deprem-tdth").DepremRiskKoord;
  fetchedAt: number;
}

/** TUCBS ÇDP WMS — koordinat bazlı üst plan cache (90 gün TTL). */
export interface TucbsCdpCache {
  key: string;
  sonuc: import("./tucbs").TucbsCdpSonuc;
  fetchedAt: number;
}

/**
 * Fiyat trendi cache — mahalle/ilçe bazlı haftalık TL/m² zaman serisi.
 *
 * Key: `${ilceNorm}|${mahalleNorm}|${kategori}` (mahalle) veya
 *      `${ilceNorm}||${kategori}` (ilçe fallback).
 *
 * TTL: 7 gün. Her hafta ilanGozlem tablosundan yeniden hesaplanır.
 * Haftalık bucket'lar: ISO hafta (2024-W01 formatı) → medyan TL/m².
 */
export interface HaftalikNokta {
  /** ISO hafta: "2024-W01" */
  hafta: string;
  /** Hafta başlangıcı unix timestamp (ms) */
  ts: number;
  /** Medyan TL/m² o haftaki ilanlardan */
  medyanPerM2: number;
  /** Ortalama TL/m² */
  ortalamaPerM2: number;
  /** O haftaki ilan sayısı */
  ilanAdet: number;
}

export interface FiyatTrendi {
  /** Composite key: `${ilceNorm}|${mahalleNorm}|${kategori}` */
  key: string;
  ilceNorm: string;
  mahalleNorm: string;
  /** "tum" = tüm kategoriler birlikte */
  kategori: "tum" | "arsa" | "tarla";
  /** Kronolojik sıralı haftalık noktalar (son 52 hafta) */
  noktalar: HaftalikNokta[];
  /** Toplam kullanılan ilan sayısı */
  toplamIlan: number;
  /** Hesaplama tarihi */
  fetchedAt: number;
  /** Veri kapsama bilgisi: "mahalle" veya "ilce" */
  seviye: "mahalle" | "ilce";
}

/**
 * Bootstrap detay zenginleştirme kuyruğu (Faz 5 / Sahibinden Scraper).
 *
 * Liste taramasında her yeni ilan koordsuz olarak Dexie'ye yazılır; ayrı bir
 * worker bu kuyruktan FIFO ilan alır, detay sayfasını arka plan tab'da açar,
 * sahibinden.ts content script `koordExtract` çalıştırır, lat/lng ile günceller.
 *
 * Durumlar:
 *   - 'beklemede' — yeni eklenmiş, henüz işlenmedi
 *   - 'isleniyor' — tab açık, content script bekleniyor
 *   - 'tamam'     — koord yakalandı, ilanGozlem güncellendi
 *   - 'hata'      — bu denemede başarısız (retry edilebilir)
 *   - 'kalici-hata' — max retry doldu, vazgeçildi
 */
/** Sahibinden/Hepsiemlak mahalle adı → TKGM mahalle kodu (öğrenen eşleşme) */
export interface MahalleAliasKayit {
  /** `${ilNorm}|${ilceNorm}|${mahalleNorm}` */
  key: string;
  ilNorm: string;
  ilceNorm: string;
  mahalleNorm: string;
  mahalleKodu: number;
  tkgmMahalleAd: string;
  kaynak: "otomatik" | "manuel";
  guncellenme: number;
  hit: number;
}

export interface DetayKuyrukKayit {
  /** Sahibinden ilanNo — primary key */
  ilanNo: string;
  url: string;
  durum: "beklemede" | "isleniyor" | "tamam" | "hata" | "kalici-hata";
  deneme: number;
  eklenmeTs: number;
  sonDenemeTs?: number;
  hata?: string;
}

class ArsaDB extends Dexie {
  favoriler!: EntityTable<FavoriParsel, "id">;
  gecmis!: EntityTable<SorguGecmisi, "id">;
  ilanGozlem!: EntityTable<IlanGozlem, "id">;
  parselCache!: Table<ParselCache, string>;
  tkgmAnalizCache!: Table<TkgmAnalizCache, [number, number, number]>;
  bolgeTaramalari!: EntityTable<BolgeTaramasi, "id">;
  aiFiyatCache!: Table<AiFiyatCache, string>;
  osmCevreCache!: Table<OsmCevreCache, string>;
  depremRiskCache!: Table<DepremRiskCache, string>;
  tucbsCdpCache!: Table<TucbsCdpCache, string>;
  detayKuyrugu!: Table<DetayKuyrukKayit, string>;
  mahalleAlias!: Table<MahalleAliasKayit, string>;
  fiyatTrendi!: Table<FiyatTrendi, string>;

  constructor() {
    super("ArsaTKGM");
    this.version(1).stores({
      favoriler: "++id, mahalleKodu, [adaNo+parselNo], eklenmeTarihi",
      gecmis: "++id, zaman",
    });
    this.version(2).stores({
      favoriler: "++id, mahalleKodu, [adaNo+parselNo], eklenmeTarihi",
      gecmis: "++id, zaman",
      ilanGozlem: "++id, &ilanNo, ilAd, ilceAd, mahalleAd, zaman",
    });
    this.version(3).stores({
      favoriler: "++id, mahalleKodu, [adaNo+parselNo], eklenmeTarihi",
      gecmis: "++id, zaman",
      ilanGozlem: "++id, &ilanNo, ilAd, ilceAd, mahalleAd, zaman",
      tkgmAnalizCache: "&[ilceKodu+analizTip+yil], ilceKodu, fetchedAt",
      parselCache: "&key, fetchedAt",
    });
    this.version(4).stores({
      favoriler: "++id, mahalleKodu, [adaNo+parselNo], eklenmeTarihi",
      gecmis: "++id, zaman",
      ilanGozlem: "++id, &ilanNo, ilAd, ilceAd, mahalleAd, zaman",
      tkgmAnalizCache: "&[ilceKodu+analizTip+yil], ilceKodu, fetchedAt",
      parselCache: "&key, fetchedAt",
      bolgeTaramalari: "++id, ad, olusmaTarihi",
    });
    this.version(5).stores({
      favoriler: "++id, mahalleKodu, [adaNo+parselNo], eklenmeTarihi",
      gecmis: "++id, zaman",
      ilanGozlem:
        "++id, &ilanNo, ilAd, ilceAd, mahalleAd, ilNorm, ilceNorm, mahalleNorm, zaman",
      tkgmAnalizCache: "&[ilceKodu+analizTip+yil], ilceKodu, fetchedAt",
      parselCache: "&key, fetchedAt",
      bolgeTaramalari: "++id, ad, olusmaTarihi",
    });
    this.version(6).stores({
      favoriler: "++id, mahalleKodu, [adaNo+parselNo], eklenmeTarihi",
      gecmis: "++id, zaman",
      ilanGozlem:
        "++id, &ilanNo, ilAd, ilceAd, mahalleAd, ilNorm, ilceNorm, mahalleNorm, zaman",
      tkgmAnalizCache: "&[ilceKodu+analizTip+yil], ilceKodu, fetchedAt",
      parselCache: "&key, fetchedAt",
      bolgeTaramalari: "++id, ad, olusmaTarihi",
    });
    // v7: Hepsiemlak desteği — `kaynak` field'ı + composite [kaynak+ilanNo] unique
    // Aynı ilanNo'nun farklı kaynaklarda çakışmasını önler.
    this.version(7).stores({
      favoriler: "++id, mahalleKodu, [adaNo+parselNo], eklenmeTarihi",
      gecmis: "++id, zaman",
      ilanGozlem:
        "++id, &[kaynak+ilanNo], ilanNo, kaynak, ilAd, ilceAd, mahalleAd, ilNorm, ilceNorm, mahalleNorm, zaman",
      tkgmAnalizCache: "&[ilceKodu+analizTip+yil], ilceKodu, fetchedAt",
      parselCache: "&key, fetchedAt",
      bolgeTaramalari: "++id, ad, olusmaTarihi",
    }).upgrade(async (tx) => {
      // Eski kayıtları "sahibinden" olarak etiketle
      await tx
        .table<IlanGozlem>("ilanGozlem")
        .toCollection()
        .modify((kayit) => {
          if (!kayit.kaynak) kayit.kaynak = "sahibinden";
        });
    });
    // v8: AI fiyat tahmin cache — aynı parsel için tekrar AI çağrısı yapma
    this.version(8).stores({
      favoriler: "++id, mahalleKodu, [adaNo+parselNo], eklenmeTarihi",
      gecmis: "++id, zaman",
      ilanGozlem:
        "++id, &[kaynak+ilanNo], ilanNo, kaynak, ilAd, ilceAd, mahalleAd, ilNorm, ilceNorm, mahalleNorm, zaman",
      tkgmAnalizCache: "&[ilceKodu+analizTip+yil], ilceKodu, fetchedAt",
      parselCache: "&key, fetchedAt",
      bolgeTaramalari: "++id, ad, olusmaTarihi",
      aiFiyatCache: "&key, fetchedAt",
    });
    // v9: OSM çevre + deprem risk cache (Faz 1 — koordinat bazlı PGA + Overpass cache).
    this.version(9).stores({
      favoriler: "++id, mahalleKodu, [adaNo+parselNo], eklenmeTarihi",
      gecmis: "++id, zaman",
      ilanGozlem:
        "++id, &[kaynak+ilanNo], ilanNo, kaynak, ilAd, ilceAd, mahalleAd, ilNorm, ilceNorm, mahalleNorm, zaman",
      tkgmAnalizCache: "&[ilceKodu+analizTip+yil], ilceKodu, fetchedAt",
      parselCache: "&key, fetchedAt",
      bolgeTaramalari: "++id, ad, olusmaTarihi",
      aiFiyatCache: "&key, fetchedAt",
      osmCevreCache: "&key, fetchedAt",
      depremRiskCache: "&key, fetchedAt",
    });
    // v10: Spatial emsal motoru — IlanGozlem'e lat/lng + koord meta.
    // Composite index [lat+lng] bbox prefilter (Dexie .where().between()) için kritik.
    // Schema değişikliği additive — eski kayıtlar null (backward compat).
    this.version(10).stores({
      favoriler: "++id, mahalleKodu, [adaNo+parselNo], eklenmeTarihi",
      gecmis: "++id, zaman",
      ilanGozlem:
        "++id, &[kaynak+ilanNo], ilanNo, kaynak, ilAd, ilceAd, mahalleAd, ilNorm, ilceNorm, mahalleNorm, zaman, [lat+lng], [kaynak+zaman]",
      tkgmAnalizCache: "&[ilceKodu+analizTip+yil], ilceKodu, fetchedAt",
      parselCache: "&key, fetchedAt",
      bolgeTaramalari: "++id, ad, olusmaTarihi",
      aiFiyatCache: "&key, fetchedAt",
      osmCevreCache: "&key, fetchedAt",
      depremRiskCache: "&key, fetchedAt",
    }).upgrade(async (tx) => {
      // Eski kayıtlara default null koord — backfill ayrı bir adım (lazy,
      // arka planda mahalle-merkezleri tablosundan doldurulur).
      await tx
        .table<IlanGozlem>("ilanGozlem")
        .toCollection()
        .modify((kayit) => {
          if (kayit.lat === undefined) kayit.lat = null;
          if (kayit.lng === undefined) kayit.lng = null;
          if (kayit.koordKaynagi === undefined) kayit.koordKaynagi = null;
          if (kayit.koordDogruluk === undefined) kayit.koordDogruluk = null;
        });
    });
    // v11: Bootstrap detay zenginleştirme kuyruğu (Faz 5 / Sahibinden Scraper).
    // Schema additive — eski tablolar değişmedi.
    this.version(11).stores({
      favoriler: "++id, mahalleKodu, [adaNo+parselNo], eklenmeTarihi",
      gecmis: "++id, zaman",
      ilanGozlem:
        "++id, &[kaynak+ilanNo], ilanNo, kaynak, ilAd, ilceAd, mahalleAd, ilNorm, ilceNorm, mahalleNorm, zaman, [lat+lng], [kaynak+zaman]",
      tkgmAnalizCache: "&[ilceKodu+analizTip+yil], ilceKodu, fetchedAt",
      parselCache: "&key, fetchedAt",
      bolgeTaramalari: "++id, ad, olusmaTarihi",
      aiFiyatCache: "&key, fetchedAt",
      osmCevreCache: "&key, fetchedAt",
      depremRiskCache: "&key, fetchedAt",
      detayKuyrugu: "&ilanNo, durum, eklenmeTs, [durum+eklenmeTs]",
    });
    // v12: Öğrenen mahalle alias (Sahibinden adı → TKGM kodu)
    this.version(12).stores({
      favoriler: "++id, mahalleKodu, [adaNo+parselNo], eklenmeTarihi",
      gecmis: "++id, zaman",
      ilanGozlem:
        "++id, &[kaynak+ilanNo], ilanNo, kaynak, ilAd, ilceAd, mahalleAd, ilNorm, ilceNorm, mahalleNorm, zaman, [lat+lng], [kaynak+zaman]",
      tkgmAnalizCache: "&[ilceKodu+analizTip+yil], ilceKodu, fetchedAt",
      parselCache: "&key, fetchedAt",
      bolgeTaramalari: "++id, ad, olusmaTarihi",
      aiFiyatCache: "&key, fetchedAt",
      osmCevreCache: "&key, fetchedAt",
      depremRiskCache: "&key, fetchedAt",
      detayKuyrugu: "&ilanNo, durum, eklenmeTs, [durum+eklenmeTs]",
      mahalleAlias: "&key, ilNorm, ilceNorm, mahalleNorm, mahalleKodu, guncellenme",
    });
    // v13: TUCBS Çevre Düzeni Planı cache
    this.version(13).stores({
      favoriler: "++id, mahalleKodu, [adaNo+parselNo], eklenmeTarihi",
      gecmis: "++id, zaman",
      ilanGozlem:
        "++id, &[kaynak+ilanNo], ilanNo, kaynak, ilAd, ilceAd, mahalleAd, ilNorm, ilceNorm, mahalleNorm, zaman, [lat+lng], [kaynak+zaman]",
      tkgmAnalizCache: "&[ilceKodu+analizTip+yil], ilceKodu, fetchedAt",
      parselCache: "&key, fetchedAt",
      bolgeTaramalari: "++id, ad, olusmaTarihi",
      aiFiyatCache: "&key, fetchedAt",
      osmCevreCache: "&key, fetchedAt",
      depremRiskCache: "&key, fetchedAt",
      detayKuyrugu: "&ilanNo, durum, eklenmeTs, [durum+eklenmeTs]",
      mahalleAlias: "&key, ilNorm, ilceNorm, mahalleNorm, mahalleKodu, guncellenme",
      tucbsCdpCache: "&key, fetchedAt",
    });
    // v14: useBolgeOrtalama performans fix — [ilceNorm+mahalleNorm] compound index.
    // v13'te ilanGozlem full-scan yapılıyordu (toArray() → client-side filter).
    // Bu index ile direkt where().equals() sorgusu mümkün: 10-50x hız farkı.
    // Schema additive — tablolar değişmedi, sadece yeni index eklendi.
    this.version(14).stores({
      favoriler: "++id, mahalleKodu, [adaNo+parselNo], eklenmeTarihi",
      gecmis: "++id, zaman",
      ilanGozlem:
        "++id, &[kaynak+ilanNo], ilanNo, kaynak, ilAd, ilceAd, mahalleAd, ilNorm, ilceNorm, mahalleNorm, zaman, [lat+lng], [kaynak+zaman], [ilceNorm+mahalleNorm], [ilceNorm+zaman]",
      tkgmAnalizCache: "&[ilceKodu+analizTip+yil], ilceKodu, fetchedAt",
      parselCache: "&key, fetchedAt",
      bolgeTaramalari: "++id, ad, olusmaTarihi",
      aiFiyatCache: "&key, fetchedAt",
      osmCevreCache: "&key, fetchedAt",
      depremRiskCache: "&key, fetchedAt",
      detayKuyrugu: "&ilanNo, durum, eklenmeTs, [durum+eklenmeTs]",
      mahalleAlias: "&key, ilNorm, ilceNorm, mahalleNorm, mahalleKodu, guncellenme",
      tucbsCdpCache: "&key, fetchedAt",
    });
    // v15: fiyatTrendi cache — mahalle/ilçe bazlı haftalık fiyat zaman serisi.
    // Key format: `${ilceNorm}|${mahalleNorm}|${kategori}` (mahalle) veya
    //             `${ilceNorm}||${kategori}` (ilçe seviyesi fallback).
    // TTL: 7 gün — haftalık yeniden hesaplama yeterli.
    this.version(15).stores({
      favoriler: "++id, mahalleKodu, [adaNo+parselNo], eklenmeTarihi",
      gecmis: "++id, zaman",
      ilanGozlem:
        "++id, &[kaynak+ilanNo], ilanNo, kaynak, ilAd, ilceAd, mahalleAd, ilNorm, ilceNorm, mahalleNorm, zaman, [lat+lng], [kaynak+zaman], [ilceNorm+mahalleNorm], [ilceNorm+zaman]",
      tkgmAnalizCache: "&[ilceKodu+analizTip+yil], ilceKodu, fetchedAt",
      parselCache: "&key, fetchedAt",
      bolgeTaramalari: "++id, ad, olusmaTarihi",
      aiFiyatCache: "&key, fetchedAt",
      osmCevreCache: "&key, fetchedAt",
      depremRiskCache: "&key, fetchedAt",
      detayKuyrugu: "&ilanNo, durum, eklenmeTs, [durum+eklenmeTs]",
      mahalleAlias: "&key, ilNorm, ilceNorm, mahalleNorm, mahalleKodu, guncellenme",
      tucbsCdpCache: "&key, fetchedAt",
      fiyatTrendi: "&key, fetchedAt",
    });
  }
}

export const db = new ArsaDB();
