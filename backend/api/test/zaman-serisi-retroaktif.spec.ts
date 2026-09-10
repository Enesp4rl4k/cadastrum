import { describe, it, expect, beforeEach } from "vitest";
import { MockD1Database } from "./test-helper.js";
import { zamanSerisiRetroaktifDoldur } from "../src/lib/zaman-serisi-retroaktif.js";

describe("Retroaktif Zaman Serisi Doldurma (zaman-serisi-retroaktif)", () => {
  let mockD1: MockD1Database;
  let db: any;

  beforeEach(() => {
    mockD1 = new MockD1Database();
    db = mockD1;
  });

  it("geçmiş aylardaki ilanları doğru yıl ve aylara bölüp mahalle_zaman_serisi tablosunu doldurur", async () => {
    // 3 farklı döneme ait ilanlar ekleyelim (Ocak 2026, Şubat 2026, Mart 2026)
    // 2026-01-15 UTC
    const tsOcak = new Date(Date.UTC(2026, 0, 15)).getTime();
    // 2026-02-15 UTC
    const tsSubat = new Date(Date.UTC(2026, 1, 15)).getTime();
    // 2026-03-15 UTC
    const tsMart = new Date(Date.UTC(2026, 2, 15)).getTime();

    // Ocak: 1000 ve 2000 TL/m² -> medyan 1500
    mockD1.db.prepare(`
      INSERT INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, fiyat_per_m2, kategori, yakalanma_tarihi, aktif)
      VALUES 
        ('sahibinden', 'ocak-1', 'istanbul', 'catalca', 'nakkas', 1000, 'arsa', ?, 1),
        ('sahibinden', 'ocak-2', 'istanbul', 'catalca', 'nakkas', 2000, 'arsa', ?, 1)
    `).run(tsOcak, tsOcak);

    // Şubat: 3000 TL/m² -> medyan 3000
    mockD1.db.prepare(`
      INSERT INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, fiyat_per_m2, kategori, yakalanma_tarihi, aktif)
      VALUES 
        ('sahibinden', 'subat-1', 'istanbul', 'catalca', 'nakkas', 3000, 'arsa', ?, 1)
    `).run(tsSubat);

    // Mart: 4000, 5000, 6000 TL/m² -> medyan 5000
    mockD1.db.prepare(`
      INSERT INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, fiyat_per_m2, kategori, yakalanma_tarihi, aktif)
      VALUES 
        ('sahibinden', 'mart-1', 'istanbul', 'catalca', 'nakkas', 4000, 'arsa', ?, 1),
        ('sahibinden', 'mart-2', 'istanbul', 'catalca', 'nakkas', 5000, 'arsa', ?, 1),
        ('sahibinden', 'mart-3', 'istanbul', 'catalca', 'nakkas', 6000, 'arsa', ?, 1)
    `).run(tsMart, tsMart, tsMart);

    // Doldurma fonksiyonunu çalıştır
    const res = await zamanSerisiRetroaktifDoldur(db as any, 1);

    expect(res.toplamIlan).toBe(6);
    expect(res.islenenAyAdet).toBe(3);
    expect(res.yazilanSnapshotAdet).toBe(3);
    expect(res.donemler).toEqual([
      { yil: 2026, ay: 1, snapshotAdet: 1 },
      { yil: 2026, ay: 2, snapshotAdet: 1 },
      { yil: 2026, ay: 3, snapshotAdet: 1 },
    ]);

    // mahalle_zaman_serisi tablosunu kontrol et
    const rows = mockD1.db.prepare(`
      SELECT yil, ay, medyan, ilan_adet 
      FROM mahalle_zaman_serisi 
      WHERE il_norm = 'istanbul' AND ilce_norm = 'catalca' AND mahalle_norm = 'nakkas'
      ORDER BY yil ASC, ay ASC
    `).all() as any[];

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ yil: 2026, ay: 1, medyan: 1500, ilan_adet: 2 });
    expect(rows[1]).toMatchObject({ yil: 2026, ay: 2, medyan: 3000, ilan_adet: 1 });
    expect(rows[2]).toMatchObject({ yil: 2026, ay: 3, medyan: 5000, ilan_adet: 3 });
  });

  it("aynı dönem tekrar çalıştırıldığında (idempotent) kayıtları çoğaltmaz, günceller", async () => {
    const ts = new Date(Date.UTC(2026, 4, 1)).getTime();

    mockD1.db.prepare(`
      INSERT INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, fiyat_per_m2, kategori, yakalanma_tarihi, aktif)
      VALUES ('sahibinden', 'tek-1', 'ankara', 'cankaya', 'ayranci', 10000, 'arsa', ?, 1)
    `).run(ts);

    await zamanSerisiRetroaktifDoldur(db as any, 1);
    const res2 = await zamanSerisiRetroaktifDoldur(db as any, 1);

    expect(res2.yazilanSnapshotAdet).toBe(1);

    const rows = mockD1.db.prepare(`
      SELECT count(*) as sayi FROM mahalle_zaman_serisi WHERE il_norm = 'ankara'
    `).get() as any;

    expect(rows.sayi).toBe(1);
  });
});
