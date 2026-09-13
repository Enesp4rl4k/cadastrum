/**
 * Okuma/yazma bütçesi — iki pahalı sorgunun planı ve kuyruk kurulumunun yazımı.
 *
 * NEDEN (wrangler d1 insights, 7 gün, 2026-09-13):
 *   okuma %25  zenginleştirme bekleyen ilanlar — sorgu başına 24.970 satır
 *   okuma %5   kuyruk önceliği — sorgu başına 28.551 satır (TEMP B-TREE)
 *   yazma %68  kuyruk her gün DELETE + tüm satırlar INSERT
 *
 * Plan testleri test ortamının gerçek SQLite'ında `EXPLAIN QUERY PLAN`
 * çalıştırıyor — D1 de SQLite; migration'lar aynı dosyalardan yükleniyor.
 *
 * MUTASYONLAR:
 *  - 0042'deki idx_ilanlar_zeng_bekleyen'i sil → 1. test kırılır
 *  - ozet-tablolari.ts'de `degismeyen++; continue;` satırını kaldır → 3. test kırılır
 */
import { describe, it, expect } from "vitest";
import { createMockEnv, MockD1Database } from "./test-helper.js";
import { zenginlestirmeKuyruguKur } from "../src/lib/ozet-tablolari.js";

function plan(db: MockD1Database, sql: string): string {
  const satirlar = db.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as Array<{ detail: string }>;
  return satirlar.map((s) => s.detail).join(" | ");
}

describe("sorgu planları", () => {
  it("zenginleştirme bekleyen ilan sorgusu kısmi indeksi kullanıyor, sıralama için ek iş yok", () => {
    const env = createMockEnv();
    const p = plan(
      env.DB as unknown as MockD1Database,
      `SELECT id, ilan_no FROM ilanlar
       WHERE kaynak = 'emlakjet' AND aktif = 1 AND zenginlestirildi IS NULL
         AND il_norm = 'a' AND ilce_norm = 'b' AND mahalle_norm = 'c'
       ORDER BY yakalanma_tarihi DESC LIMIT 25`,
    );
    expect(p).toContain("idx_ilanlar_zeng_bekleyen");
    expect(p).not.toContain("TEMP B-TREE");
  });

  it("kuyruk öncelik sorgusu geçici B-ağacında sıralamıyor", () => {
    const env = createMockEnv();
    const p = plan(
      env.DB as unknown as MockD1Database,
      `SELECT il_norm, ilce_norm, mahalle_norm, toplam, islenen
       FROM zenginlestirme_kuyruk WHERE islenen < 3 ORDER BY toplam DESC LIMIT 5`,
    );
    expect(p).toContain("idx_zenginlestirme_kuyruk_toplam");
    expect(p).not.toContain("TEMP B-TREE");
  });
});

describe("kuyruk kurulumu — fark bazlı", () => {
  function ilanEkle(db: MockD1Database, mahalle: string, adet: number, zengin: number) {
    for (let i = 0; i < adet; i++) {
      db.db.prepare(
        `INSERT INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, fiyat_per_m2, m2, kategori, aktif, yakalanma_tarihi, zenginlestirildi)
         VALUES ('emlakjet', ?, 'il', 'ilce', ?, 1000, 500, 'arsa', 1, ?, ?)`,
      ).run(`${mahalle}-${i}`, mahalle, Date.now(), i < zengin ? Date.now() : null);
    }
  }

  it("ikinci kurulumda değişmeyen mahalle YAZILMAZ; değişen yazılır, boşalan silinir", async () => {
    const env = createMockEnv();
    const db = env.DB as unknown as MockD1Database;
    ilanEkle(db, "sabit", 5, 2);
    ilanEkle(db, "degisen", 4, 0);
    ilanEkle(db, "bosalan", 3, 0);

    const ilk = await zenginlestirmeKuyruguKur(env.DB);
    expect(ilk.yazilan).toBe(3);

    // 'degisen'de bir ilan zenginleşti, 'bosalan' tamamen pasifleşti.
    db.db.prepare(`UPDATE ilanlar SET zenginlestirildi = ? WHERE ilan_no = 'degisen-0'`).run(Date.now());
    db.db.prepare(`UPDATE ilanlar SET aktif = 0 WHERE mahalle_norm = 'bosalan'`).run();

    const ikinci = await zenginlestirmeKuyruguKur(env.DB);
    expect(ikinci.degismeyen).toBe(1);
    expect(ikinci.yazilan).toBe(1);
    expect(ikinci.silinen).toBe(1);

    const kalan = db.db.prepare(
      `SELECT mahalle_norm, toplam, islenen FROM zenginlestirme_kuyruk ORDER BY mahalle_norm`,
    ).all();
    expect(kalan).toEqual([
      { mahalle_norm: "degisen", toplam: 4, islenen: 1 },
      { mahalle_norm: "sabit", toplam: 5, islenen: 2 },
    ]);
  });
});
