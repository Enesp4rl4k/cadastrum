/**
 * `wrapD1` bütçe sayımı — özellikle `first()`.
 *
 * NEDEN: G2'nin ilk sürümü `first()` çağrılarını "metasiz" sayıp maliyetini
 * yok sayıyordu. Oysa cron yolundaki COUNT(*) tam taramalarının neredeyse
 * tamamı `first()` kullanıyor. Yani bütçeyi en çok yiyen sorgu sınıfı sayaca
 * görünmezdi ve sağlık kontrolü, gerçek tüketim limiti aşmışken "geçti"
 * diyebilirdi.
 *
 * MUTASYON: db-timing.ts'de `first()`'ü `this.stmt.first<T>()` +
 * `maliyetEkle(ctx, undefined)` hâline geri al → ilk test kırılır
 * (okuma 67000 yerine 0, metasiz 0 yerine 1).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { wrapD1 } from "../src/lib/db-timing.js";
import { sayaclariOku, sayaclariSifirla } from "../src/lib/okuma-butcesi.js";

/**
 * Gerçek D1'in davranışını taklit eden sahte: `all()` meta taşır, yerel
 * `first()` TAŞIMAZ — tam da gerçek sürücünün farkı. Sahte `first()` kasıtlı
 * olarak meta döndürmüyor ki sarmalayıcı onu çağırırsa maliyet kaybolsun ve
 * mutasyon görünür olsun.
 */
function sahteD1(satirlar: unknown[], rowsRead: number): D1Database {
  const stmt = {
    bind() { return stmt; },
    async all() {
      return { results: satirlar, success: true, meta: { rows_read: rowsRead, rows_written: 0 } };
    },
    async first() { return satirlar[0] ?? null; },
    async run() { return { results: [], success: true, meta: { rows_read: 0, rows_written: 1 } }; },
  };
  return { prepare: () => stmt } as unknown as D1Database;
}

describe("wrapD1 — first() maliyeti SAYILIR", () => {
  beforeEach(() => sayaclariSifirla());

  it("COUNT(*) tam taraması first() ile çağrılsa da okuma sayılır", async () => {
    const db = wrapD1(sahteD1([{ n: 67000 }], 67000), "cron-gunluk");
    const r = await db.prepare("SELECT COUNT(*) AS n FROM ilanlar WHERE aktif = 1")
      .first<{ n: number }>();

    // Davranış değişmedi: çağıran yine ilk satırı alıyor.
    expect(r).toEqual({ n: 67000 });
    // Ve maliyet görünür — eski sürümde bu 0 okuma + 1 metasiz idi.
    expect(sayaclariOku()["cron-gunluk"]).toEqual({ okuma: 67000, yazma: 0, sorgu: 1, metasiz: 0 });
  });

  it("sonuç yoksa null döner — first() sözleşmesi korunuyor", async () => {
    const db = wrapD1(sahteD1([], 500), "x");
    expect(await db.prepare("SELECT 1 WHERE 0").first()).toBeNull();
    expect(sayaclariOku()["x"]?.okuma).toBe(500);
  });

  it("çok satır dönerse İLK satırı döndürür (davranış yerel first() ile aynı)", async () => {
    const db = wrapD1(sahteD1([{ id: 1 }, { id: 2 }, { id: 3 }], 3), "y");
    expect(await db.prepare("SELECT id FROM t").first()).toEqual({ id: 1 });
  });
});
