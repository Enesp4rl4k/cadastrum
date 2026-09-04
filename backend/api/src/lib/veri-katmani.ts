/**
 * Veri yönetim katmanı — ilan yazma, koordinat çözümleme ve tarama rotasyonu.
 *
 * NEDEN: bu üç işi emlakjet-scraper.ts, hepsiemlak-scraper.ts ve routes/ilan.ts
 * ayrı ayrı, birbirinden hafifçe farklı SQL'lerle yapıyordu. Bu oturumda ortaya
 * çıkan hataların çoğu tam olarak bu kopyalamadan doğdu:
 *
 *   - koordinatAra() iki scraper'da da kopyalanmıştı ve İKİSİ DE var olmayan
 *     bir tabloya (mahalle_merkez) sorgu atıyordu; try/catch hatayı yuttuğu
 *     için sessizce hep null dönüyorlardı. Tek yerde olsaydı bir kez fark
 *     edilirdi.
 *   - Rotasyon damgalama emlakjet'te vardı, hepsiemlak'a elle eklendi;
 *     unutulsaydı hepsiemlak da emlakjet gibi aynı 3 ilçeye kilitlenirdi.
 *   - INSERT kolon listeleri kaynak başına ayrı yazıldığı için hepsiemlak
 *     hattı lat/lng kolonlarını hiç yazmıyordu.
 *
 * Kural: yeni bir ilan kaynağı eklenirken SADECE parse mantığı yazılır;
 * yazma/koordinat/rotasyon bu modülden gelir.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { log } from "./logger.js";

/** ilanlar.kaynak CHECK kısıtındaki değerler. */
export type IlanKaynak = "emlakjet" | "hepsiemlak" | "extension" | "sahibinden";

/** ilanlar.kategori CHECK kısıtındaki değerler. */
export type IlanKategori =
  | "arsa" | "tarla" | "konut" | "bahce" | "bag" | "zeytinlik" | "diger";

export interface YeniIlan {
  kaynak: IlanKaynak;
  /** Kaynak içinde benzersiz — UNIQUE(kaynak, ilan_no). Ön ek dahil (ör. "ej_123"). */
  ilanNo: string;
  ilNorm: string;
  ilceNorm: string;
  mahalleNorm: string | null;
  fiyatPerM2: number;
  m2: number | null;
  kategori: IlanKategori;
  baslik?: string | null;
  imarDurumu?: string | null;
  tapuDurumu?: string | null;
  /** Verilirse koordinat çözümlemesi ATLANIR (ör. gerçek parsel koordinatı). */
  lat?: number | null;
  lng?: number | null;
  koordKaynagi?: string | null;
  ilanTarihi?: number | null;
}

export interface Koordinat {
  lat: number;
  lng: number;
  /** 0-1. <0.85 → koordinat mahallenin değil ilçenin merkezi. */
  guven: number;
  /** ilanlar.koord_kaynagi'na yazılacak etiket. */
  kaynak: "mahalle-merkez" | "ilce-fallback";
}

/**
 * Mahalle merkez koordinatını çözer.
 *
 * `guven` eşiği 0.85: altındaki kayıtlarda koordinat mahallenin değil ilçenin
 * merkezidir (üreteç ilçe-fallback uygulamış). Spatial emsal motorunun bu ikisini
 * ayırt edebilmesi için koord_kaynagi farklı etiketleniyor — aksi hâlde bir
 * ilçedeki tüm mahalleler aynı noktada görünür ve mesafe ağırlıkları anlamsızlaşır.
 */
export async function mahalleKoordinatBul(
  db: D1Database,
  ilNorm: string,
  ilceNorm: string,
  mahalleNorm: string | null,
): Promise<Koordinat | null> {
  if (!mahalleNorm) return null;
  try {
    const row = await db
      .prepare(
        `SELECT lat, lng, guven FROM mahalle_merkez
         WHERE il_norm = ? AND ilce_norm = ? AND mahalle_norm = ? LIMIT 1`,
      )
      .bind(ilNorm, ilceNorm, mahalleNorm)
      .first<{ lat: number; lng: number; guven: number }>();
    if (!row) return null;
    return {
      lat: row.lat,
      lng: row.lng,
      guven: row.guven,
      kaynak: row.guven >= 0.85 ? "mahalle-merkez" : "ilce-fallback",
    };
  } catch (e) {
    // "Tablo yok" ile "bu mahalle tabloda yok" AYNI ŞEY DEĞİL. Eskiden ikisi de
    // sessizce null dönüyordu ve `mahalle_merkez` tablosunun hiç var olmadığı
    // aylarca fark edilmedi — koordinat kapsamı %37'de takılıydı. Sorgu HATASI
    // artık loglanır; satır bulunamaması (yukarıdaki `!row`) sessiz kalır.
    log.error("veri-katmani.koordinat.sorgu-hatasi", {
      il: ilNorm, ilce: ilceNorm, mahalle: mahalleNorm,
      hata: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/**
 * Bir ilanı yazar. Zaten varsa (UNIQUE kaynak+ilan_no) dokunmaz.
 *
 * Koordinat verilmemişse mahalle merkezinden çözülür. Verilmişse olduğu gibi
 * kullanılır — zenginleştirme hattından gelen GERÇEK parsel koordinatının
 * mahalle merkeziyle ezilmemesi için bu ayrım kritik.
 *
 * @returns yeni satır eklendiyse true, çakışma/hata ise false.
 */
export async function ilanYaz(db: D1Database, ilan: YeniIlan): Promise<boolean> {
  let lat = ilan.lat ?? null;
  let lng = ilan.lng ?? null;
  let koordKaynagi = ilan.koordKaynagi ?? null;

  if (lat == null) {
    const k = await mahalleKoordinatBul(db, ilan.ilNorm, ilan.ilceNorm, ilan.mahalleNorm);
    if (k) { lat = k.lat; lng = k.lng; koordKaynagi = k.kaynak; }
  }

  try {
    const r = await db
      .prepare(
        `INSERT OR IGNORE INTO ilanlar
           (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, fiyat_per_m2, m2,
            kategori, para_birimi, yakalanma_tarihi, ilan_tarihi,
            lat, lng, koord_kaynagi, aktif, baslik, imar_durumu, tapu_durumu)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'TL', ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .bind(
        ilan.kaynak, ilan.ilanNo, ilan.ilNorm, ilan.ilceNorm, ilan.mahalleNorm,
        ilan.fiyatPerM2, ilan.m2, ilan.kategori,
        Date.now(), ilan.ilanTarihi ?? null,
        lat, lng, koordKaynagi,
        ilan.baslik ?? null, ilan.imarDurumu ?? null, ilan.tapuDurumu ?? null,
      )
      .run();
    return (r.meta?.changes ?? 0) > 0;
  } catch (e) {
    // Çakışma zaten INSERT OR IGNORE ile sessizce ele alınıyor; buraya düşmek
    // gerçek bir yazma hatası demek (şema kayması, CHECK ihlali, D1 erişimi).
    // Sessizce false dönmek bunu "duplicate" gibi gösterirdi.
    log.error("veri-katmani.ilan-yaz.hata", {
      kaynak: ilan.kaynak, ilanNo: ilan.ilanNo,
      hata: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

// ─── Tarama rotasyonu ────────────────────────────────────────────────────────

export interface TaramaHedefi {
  ilNorm: string;
  ilceNorm: string;
  kategori: string;
}

/**
 * Sıradaki tarama hedeflerini verir — en uzun süredir taranmamışlar önce.
 *
 * `son_tarama IS NULL` (hiç taranmamış) en yüksek öncelikli. Damgalama
 * yapılmazsa aynı hedefler sonsuza kadar seçilir; emlakjet tarafında tam bu
 * yüzden aylarca yalnızca 3 İstanbul ilçesi taranmıştı.
 */
export async function taramaHedefleriGetir(
  db: D1Database,
  kaynak: IlanKaynak,
  limit: number,
  kategori?: string,
): Promise<TaramaHedefi[]> {
  const sorgu = kategori
    ? db.prepare(
        `SELECT il_norm, ilce_norm, kategori FROM tarama_durum
         WHERE kaynak = ? AND kategori = ?
         ORDER BY son_tarama ASC NULLS FIRST LIMIT ?`,
      ).bind(kaynak, kategori, limit)
    : db.prepare(
        `SELECT il_norm, ilce_norm, kategori FROM tarama_durum
         WHERE kaynak = ?
         ORDER BY son_tarama ASC NULLS FIRST LIMIT ?`,
      ).bind(kaynak, limit);

  const r = await sorgu.all<{ il_norm: string; ilce_norm: string; kategori: string }>();
  return (r.results ?? []).map((x) => ({
    ilNorm: x.il_norm, ilceNorm: x.ilce_norm, kategori: x.kategori,
  }));
}

/**
 * Bir hedefi taranmış olarak damgalar. Tabloya yazamamak taramayı bozmamalı.
 *
 * Yazma başarısız olursa GÖRÜNÜR olur: rotasyon sırası bu tablodan okunuyor,
 * damga düşerse aynı ilçe sonsuza kadar yeniden seçilir ve rotasyon birkaç
 * ilçeye kilitlenir — `scraper_ilce_durum` tam olarak böyle aylarca fark
 * edilmeden 3 ilçeye kilitlenmişti. Sessizce yutulursa hiçbir yerde iz kalmaz.
 *
 * @returns damga yazıldıysa true.
 */
export async function taramaDamgala(
  db: D1Database,
  kaynak: IlanKaynak,
  hedef: { ilNorm: string; ilceNorm: string; kategori?: string },
  eklenen: number,
  durum: "tamam" | "hata" | "bot-engel",
  /**
   * Tarama DERIN miydi? Sig tur `son_derin_tarama`ya dokunmaz.
   *
   * NEDEN: iki cron ayni kuyrugu tuketiyor — gunluk derin (maxSayfa 25),
   * ayin 15'i sig (maxSayfa 3). Tek damga varken sig tur ilceyi "tarandi"
   * isaretleyip kuyrugun sonuna atiyor ve derin tarama ona aylarca ugramiyor.
   * Olculen sonuc: emlakjet kapsami ~%39'da takili — kaynakta bizdekinin
   * ~2,5 kati ilan var. Ayrinti: migration 0033.
   */
  derinMi = false,
): Promise<boolean> {
  try {
    await db
      .prepare(
        `INSERT INTO tarama_durum
           (kaynak, il_norm, ilce_norm, kategori, son_tarama, son_eklenen, son_durum, son_derin_tarama)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(kaynak, il_norm, ilce_norm, kategori) DO UPDATE SET
           -- Sig tur bu kolona DOKUNMAZ: derin rotasyonun sirasini bozmasin.
           son_derin_tarama = COALESCE(excluded.son_derin_tarama, tarama_durum.son_derin_tarama),
           -- Bot engelinde son_tarama İLERLETİLMEZ. Rotasyon 'son_tarama ASC
           -- NULLS FIRST' ile seçiyor; engellenen ilçeyi taranmış saymak onu
           -- sıranın en sonuna atar ve aylarca bir daha bakılmaz — hepsiemlak'ta
           -- 254 ilçe tam olarak böyle kayboldu.
           son_tarama = CASE WHEN excluded.son_durum = 'bot-engel'
                             THEN tarama_durum.son_tarama
                             ELSE excluded.son_tarama END,
           son_eklenen = excluded.son_eklenen,
           son_durum = excluded.son_durum`,
      )
      .bind(kaynak, hedef.ilNorm, hedef.ilceNorm, hedef.kategori ?? "_",
            durum === "bot-engel" ? null : Date.now(), eklenen, durum,
            derinMi && durum !== "bot-engel" ? Date.now() : null)
      .run();
    return true;
  } catch (e) {
    log.error("veri-katmani.tarama-damgala.basarisiz", {
      kaynak,
      il: hedef.ilNorm,
      ilce: hedef.ilceNorm,
      kategori: hedef.kategori ?? "_",
      hata: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}
