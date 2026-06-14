/**
 * İstatistik refresh — ham ilan datasından mahalle/ilçe/il istatistiklerini
 * yeniden hesaplar. Cron tetiklemesi (her gün 03:00 UTC) ya da
 * GET /v1/istatistik/refresh?secret=XXX ile manuel.
 *
 * Algoritma:
 *   1. Son 90 günün aktif ilanlarını grupla (mahalle × kategori)
 *   2. Tukey IQR outlier temizle, medyan/q1/q3/ortalama hesapla
 *   3. mahalle_istatistik tablosunu yeniden doldur
 *   4. Aynısı ilçe ve il seviyesi için
 *   5. Aylık snapshot mahalle_zaman_serisi'ne yaz
 */
import { istatistikOzetiHesapla } from "../lib/istatistik.js";

const PENCERE_GUN = 90;
const GUN_MS = 86_400_000;

export interface RefreshSonuc {
  basladi: number;
  bitti: number;
  sureMs: number;
  mahalleAdet: number;
  ilceAdet: number;
  ilAdet: number;
  toplamIlan: number;
}

export async function istatistikRefresh(db: D1Database): Promise<RefreshSonuc> {
  const basladi = Date.now();
  const minTarih = basladi - PENCERE_GUN * GUN_MS;

  // 0. Eski tabloları temizle (sınırsız büyümeyi önle)
  // - rate_limit: 24+ saat öncesi
  // - giris_denemesi: 7 gün öncesi
  // - ai_kullanim: 60 gün öncesi (kayıt değil sayaç bilgisi, eski gerek yok)
  const dakika24 = Math.floor(basladi / 60_000) - 60 * 24;
  const saatNow = Math.floor(basladi / 3_600_000);
  const gun60 = Math.floor(basladi / 86_400_000) - 60;
  await Promise.all([
    db.prepare("DELETE FROM rate_limit WHERE saat < ?").bind(saatNow - 24).run().catch(() => {}),
    db.prepare("DELETE FROM giris_denemesi WHERE dakika < ?").bind(dakika24 - 60 * 24 * 6).run().catch(() => {}),
    db.prepare("DELETE FROM ai_kullanim WHERE gun < ?").bind(gun60).run().catch(() => {}),
    db.prepare("DELETE FROM admin_log WHERE ts < ?").bind(basladi - 365 * 86_400_000).run().catch(() => {}),
  ]);

  // 1. Aktif ilanları çek (90 gün penceresi)
  const ilanlar = await db.prepare(
    `SELECT il_norm, ilce_norm, mahalle_norm, kategori, fiyat_per_m2
     FROM ilanlar
     WHERE aktif = 1 AND yakalanma_tarihi >= ?`,
  ).bind(minTarih).all<{
    il_norm: string;
    ilce_norm: string;
    mahalle_norm: string | null;
    kategori: string;
    fiyat_per_m2: number;
  }>();

  const tum = ilanlar.results ?? [];

  // 2. Mahalle gruplaması
  type Group = Record<string, number[]>;
  const mahalleGrup: Group = {};
  const ilceGrup: Group = {};
  const ilGrup: Group = {};

  for (const r of tum) {
    if (r.mahalle_norm) {
      const k = `${r.il_norm}|${r.ilce_norm}|${r.mahalle_norm}|${r.kategori}`;
      (mahalleGrup[k] ??= []).push(r.fiyat_per_m2);
    }
    const ki = `${r.il_norm}|${r.ilce_norm}|${r.kategori}`;
    (ilceGrup[ki] ??= []).push(r.fiyat_per_m2);
    const kil = `${r.il_norm}|${r.kategori}`;
    (ilGrup[kil] ??= []).push(r.fiyat_per_m2);
  }

  const now = Date.now();

  // Batch helper — D1 batch limit ~100. Chunklı çalıştır.
  async function batchRun(stmts: D1PreparedStatement[]) {
    const chunk = 50;
    for (let i = 0; i < stmts.length; i += chunk) {
      await db.batch(stmts.slice(i, i + chunk));
    }
  }

  // 3. Mahalle istatistik upsert (parse + IQR)
  const mahalleStmt = db.prepare(
    `INSERT INTO mahalle_istatistik (
      il_norm, ilce_norm, mahalle_norm, kategori,
      medyan, q1, q3, ortalama, ilan_adet, son_guncelleme
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(il_norm, ilce_norm, mahalle_norm, kategori) DO UPDATE SET
      medyan = excluded.medyan,
      q1 = excluded.q1,
      q3 = excluded.q3,
      ortalama = excluded.ortalama,
      ilan_adet = excluded.ilan_adet,
      son_guncelleme = excluded.son_guncelleme`
  );
  const mahalleStmts: D1PreparedStatement[] = [];
  for (const [key, fiyatlar] of Object.entries(mahalleGrup)) {
    if (fiyatlar.length < 2) continue;
    const [il, ilce, mahalle, kategori] = key.split("|");
    const stat = istatistikOzetiHesapla(fiyatlar);
    if (stat.adet === 0) continue;
    mahalleStmts.push(mahalleStmt.bind(il!, ilce!, mahalle!, kategori!, stat.medyan, stat.q1, stat.q3, stat.ortalama, stat.adet, now));
  }
  const mahalleAdet = mahalleStmts.length;
  await batchRun(mahalleStmts);

  // 4. İlçe istatistik upsert
  const ilceStmt = db.prepare(
    `INSERT INTO ilce_istatistik (il_norm, ilce_norm, kategori, medyan, q1, q3, ilan_adet, son_guncelleme)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(il_norm, ilce_norm, kategori) DO UPDATE SET
       medyan = excluded.medyan, q1 = excluded.q1, q3 = excluded.q3,
       ilan_adet = excluded.ilan_adet, son_guncelleme = excluded.son_guncelleme`
  );
  const ilceStmts: D1PreparedStatement[] = [];
  for (const [key, fiyatlar] of Object.entries(ilceGrup)) {
    if (fiyatlar.length < 5) continue;
    const [il, ilce, kategori] = key.split("|");
    const stat = istatistikOzetiHesapla(fiyatlar);
    if (stat.adet === 0) continue;
    ilceStmts.push(ilceStmt.bind(il!, ilce!, kategori!, stat.medyan, stat.q1, stat.q3, stat.adet, now));
  }
  const ilceAdet = ilceStmts.length;
  await batchRun(ilceStmts);

  // 5. İl istatistik upsert
  const ilStmt = db.prepare(
    `INSERT INTO il_istatistik (il_norm, kategori, medyan, ilan_adet, son_guncelleme)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(il_norm, kategori) DO UPDATE SET
       medyan = excluded.medyan, ilan_adet = excluded.ilan_adet, son_guncelleme = excluded.son_guncelleme`
  );
  const ilStmts: D1PreparedStatement[] = [];
  for (const [key, fiyatlar] of Object.entries(ilGrup)) {
    if (fiyatlar.length < 10) continue;
    const [il, kategori] = key.split("|");
    const stat = istatistikOzetiHesapla(fiyatlar);
    if (stat.adet === 0) continue;
    ilStmts.push(ilStmt.bind(il!, kategori!, stat.medyan, stat.adet, now));
  }
  const ilAdet = ilStmts.length;
  await batchRun(ilStmts);

  // 6. Aylık snapshot — bu ay için (UPSERT, batched)
  const d = new Date();
  const yil = d.getUTCFullYear();
  const ay = d.getUTCMonth() + 1;
  const snapshotStmt = db.prepare(
    `INSERT INTO mahalle_zaman_serisi (
      il_norm, ilce_norm, mahalle_norm, kategori, yil, ay, medyan, ilan_adet
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(il_norm, ilce_norm, mahalle_norm, kategori, yil, ay) DO UPDATE SET
      medyan = excluded.medyan, ilan_adet = excluded.ilan_adet`
  );
  const snapshotStmts: D1PreparedStatement[] = [];
  for (const [key, fiyatlar] of Object.entries(mahalleGrup)) {
    if (fiyatlar.length < 2) continue;
    const [il, ilce, mahalle, kategori] = key.split("|");
    const stat = istatistikOzetiHesapla(fiyatlar);
    if (stat.adet === 0) continue;
    snapshotStmts.push(snapshotStmt.bind(il!, ilce!, mahalle!, kategori!, yil, ay, stat.medyan, stat.adet));
  }
  await batchRun(snapshotStmts);

  const bitti = Date.now();
  return {
    basladi,
    bitti,
    sureMs: bitti - basladi,
    mahalleAdet,
    ilceAdet,
    ilAdet,
    toplamIlan: tum.length,
  };
}
