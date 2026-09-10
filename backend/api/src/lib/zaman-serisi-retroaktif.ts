/**
 * Retroaktif Zaman Serisi Doldurma (Historical Snapshot Backfill)
 *
 * Problem:
 *   istatistikRefresh sadece tek bir ayı (mevcut ayı) snapshot olarak
 *   mahalle_zaman_serisi'ne yazıyordu. Geçmiş aylara ait ilanlar D1'de
 *   olmasına rağmen zaman serisi boş kalıyor, bu yüzden:
 *   - /v1/harita/trend (son 6 ay vs önceki 6 ay) "veri yetersiz" diyordu
 *   - /v1/harita/gelisen-bolgeler boş kalıyordu
 *   - /v1/fiyat/trend/:il/:ilce/:mahalle geçmiş trend çizemiyordu
 *
 * Çözüm:
 *   ilanlar tablosundaki tüm aktif ve geçerli ilanları yakalanma_tarihi
 *   üzerinden (yil, ay) dilimlerine grupla, mahalle x kategori bazında
 *   medyan ve adetleri hesaplayıp mahalle_zaman_serisi tablosuna UPSERT et.
 */

import { wrapD1 } from "./db-timing.js";
import { istatistikOzetiHesapla } from "./istatistik.js";

export interface ZamanSerisiRetroaktifSonuc {
  toplamIlan: number;
  islenenAyAdet: number;
  yazilanSnapshotAdet: number;
  donemler: Array<{ yil: number; ay: number; snapshotAdet: number }>;
}

export async function zamanSerisiRetroaktifDoldur(
  dbHam: D1Database,
  minIlanAdet = 1,
): Promise<ZamanSerisiRetroaktifSonuc> {
  const db = wrapD1(dbHam, "zaman-serisi-retroaktif");

  // 1. İlleri çek (Chunking by province to prevent Worker memory overflow)
  const iller = await db.prepare(
    `SELECT DISTINCT il_norm FROM ilanlar WHERE aktif = 1 AND yakalanma_tarihi > 0 AND mahalle_norm IS NOT NULL`
  ).all<{ il_norm: string }>();

  // [yil-ay] -> [il|ilce|mahalle|kategori] -> [fiyatlar]
  type Key = string; // `${il}|${ilce}|${mahalle}|${kategori}`
  const donemGruplari = new Map<string, Map<Key, number[]>>();
  let toplamIlan = 0;

  for (const row of iller.results ?? []) {
    const il = row.il_norm;
    if (!il) continue;

    const ilanlarIl = await db.prepare(
      `SELECT ilce_norm, mahalle_norm, kategori, fiyat_per_m2, yakalanma_tarihi
       FROM ilanlar
       WHERE aktif = 1 AND yakalanma_tarihi > 0 AND mahalle_norm IS NOT NULL AND fiyat_per_m2 > 0 AND il_norm = ?`
    ).bind(il).all<{
      ilce_norm: string;
      mahalle_norm: string;
      kategori: string;
      fiyat_per_m2: number;
      yakalanma_tarihi: number;
    }>();

    for (const r of ilanlarIl.results ?? []) {
      toplamIlan++;
      const ms = r.yakalanma_tarihi < 1e11 ? r.yakalanma_tarihi * 1000 : r.yakalanma_tarihi;
      const d = new Date(ms);
      const yil = d.getUTCFullYear();
      const ay = d.getUTCMonth() + 1;
      if (isNaN(yil) || isNaN(ay) || yil < 2000 || yil > 2100) continue;

      const donemKey = `${yil}-${ay}`;
      if (!donemGruplari.has(donemKey)) {
        donemGruplari.set(donemKey, new Map());
      }
      const mahalleMap = donemGruplari.get(donemKey)!;
      const key = `${il}|${r.ilce_norm}|${r.mahalle_norm}|${r.kategori}`;
      let fiyatlar = mahalleMap.get(key);
      if (!fiyatlar) {
        fiyatlar = [];
        mahalleMap.set(key, fiyatlar);
      }
      fiyatlar.push(r.fiyat_per_m2);
    }
  }

  const snapshotStmt = db.prepare(
    `INSERT INTO mahalle_zaman_serisi (
      il_norm, ilce_norm, mahalle_norm, kategori, yil, ay, medyan, ilan_adet
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(il_norm, ilce_norm, mahalle_norm, kategori, yil, ay) DO UPDATE SET
      medyan = excluded.medyan,
      ilan_adet = excluded.ilan_adet`
  );

  let yazilanSnapshotAdet = 0;
  const donemler: Array<{ yil: number; ay: number; snapshotAdet: number }> = [];

  for (const [donemKey, mahalleMap] of donemGruplari.entries()) {
    const [yilStr, ayStr] = donemKey.split("-");
    const yil = parseInt(yilStr!, 10);
    const ay = parseInt(ayStr!, 10);

    const stmts: D1PreparedStatement[] = [];
    for (const [key, fiyatlar] of mahalleMap.entries()) {
      if (fiyatlar.length < minIlanAdet) continue;
      const [il, ilce, mahalle, kategori] = key.split("|");
      const stat = istatistikOzetiHesapla(fiyatlar);
      if (stat.adet === 0) continue;

      stmts.push(snapshotStmt.bind(il!, ilce!, mahalle!, kategori!, yil, ay, stat.medyan, stat.adet));
    }

    // Chunked batch execution (D1 limit ~100)
    const chunk = 50;
    for (let i = 0; i < stmts.length; i += chunk) {
      await db.batch(stmts.slice(i, i + chunk));
    }

    yazilanSnapshotAdet += stmts.length;
    donemler.push({ yil, ay, snapshotAdet: stmts.length });
  }

  // Dönemleri kronolojik sırala
  donemler.sort((a, b) => (a.yil !== b.yil ? a.yil - b.yil : a.ay - b.ay));

  return {
    toplamIlan,
    islenenAyAdet: donemler.length,
    yazilanSnapshotAdet,
    donemler,
  };
}
