/**
 * KALICI YANIK — geçici hata, ilanı sonsuza kadar yakmamalı.
 *
 * GERÇEK SORUN: `emlakjet-zenginlestirme.ts` detay sayfasını çekemediğinde
 * ilanı KALICI olarak `zenginlestirildi = <şimdi>` damgalıyor ve bir daha
 * asla denemiyordu. `sayfaCek` hata türünü ayırmıyordu:
 *
 *   404 (ilan silinmiş)      → damgala DOĞRU
 *   403/429 (hız limiti)     → damgala YANLIŞ
 *   15 sn timeout / ağ hatası → damgala YANLIŞ
 *
 * Hepsi aynı `null` dönüyordu. Kaynak bir saat boyunca 429 verirse, o turdaki
 * 120 ilanın TAMAMI kalıcı olarak yanıyordu. Saatlik cron × 120 = günde 2.880
 * ilan risk altında, hiçbir alarm yok.
 *
 * Bu, üretimde imar kapsamının %1,9'da takılı kalmasının en olası açıklaması.
 *
 * Bu dosya davranış sözleşmesini kilitliyor. `sayfaCek` bir Worker fetch
 * yaptığı için tam turu burada koşturmuyoruz; test edilen şey SQL
 * sözleşmesi: geçici hata sayaç artırır ve MAKS_DENEME'ye kadar damgalamaz.
 */
import { describe, it, expect } from "vitest";
import { createMockEnv } from "./test-helper.js";

const MAKS_DENEME = 3;

/** Üretimdeki geçici-hata UPDATE'inin birebir kopyası. */
async function geciciHataIsle(db: D1Database, id: number) {
  await db.prepare(
    `UPDATE ilanlar SET
       zenginlestirme_deneme = COALESCE(zenginlestirme_deneme, 0) + 1,
       zenginlestirme_son_deneme = ?,
       zenginlestirildi = CASE
         WHEN COALESCE(zenginlestirme_deneme, 0) + 1 >= ? THEN ?
         ELSE zenginlestirildi END
     WHERE id = ?`,
  ).bind(Date.now(), MAKS_DENEME, Date.now(), id).run();
}

async function ilanKur(db: D1Database) {
  await db.prepare(
    `INSERT INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, kategori,
       fiyat_per_m2, yakalanma_tarihi, aktif)
     VALUES ('emlakjet','ej_19382914','adana','pozanti','arsa',3200,unixepoch(),1)`,
  ).run();
  const r = await db.prepare(`SELECT id FROM ilanlar WHERE ilan_no='ej_19382914'`)
    .first<{ id: number }>();
  return r!.id;
}

async function durum(db: D1Database, id: number) {
  return db.prepare(
    `SELECT zenginlestirildi, zenginlestirme_deneme FROM ilanlar WHERE id = ?`,
  ).bind(id).first<{ zenginlestirildi: number | null; zenginlestirme_deneme: number | null }>();
}

describe("geçici hata kalıcı yanık üretmez", () => {
  it("ilk geçici hata damgalamaz, yalnızca sayacı artırır", async () => {
    const env = createMockEnv();
    const id = await ilanKur(env.DB);
    await geciciHataIsle(env.DB, id);
    const d = await durum(env.DB, id);
    expect(d?.zenginlestirme_deneme).toBe(1);
    expect(d?.zenginlestirildi).toBeNull(); // KUYRUKTA KALIYOR
  });

  it("ikinci denemede de kuyrukta kalır", async () => {
    const env = createMockEnv();
    const id = await ilanKur(env.DB);
    await geciciHataIsle(env.DB, id);
    await geciciHataIsle(env.DB, id);
    const d = await durum(env.DB, id);
    expect(d?.zenginlestirme_deneme).toBe(2);
    expect(d?.zenginlestirildi).toBeNull();
  });

  /**
   * Sonsuz döngü de olmamalı: kaynak kalıcı olarak engelliyorsa kuyruk
   * aynı kayıtları sonsuza kadar denememeli.
   */
  it("MAKS_DENEME'ye ulaşınca damgalanır — sonsuz döngü yok", async () => {
    const env = createMockEnv();
    const id = await ilanKur(env.DB);
    for (let i = 0; i < MAKS_DENEME; i++) await geciciHataIsle(env.DB, id);
    const d = await durum(env.DB, id);
    expect(d?.zenginlestirme_deneme).toBe(MAKS_DENEME);
    expect(d?.zenginlestirildi).toBeGreaterThan(0);
  });

  /**
   * KURTARMA (migration 0034): damgalanmış ama hiçbir alan kazanmamış
   * kayıtlar kuyruğa dönmeli. Gerçek parsel koordinatı kazananlar HARİÇ —
   * onlarda zenginleştirme başarılı olmuş demektir.
   */
  it("kurtarma sorgusu: alan kazanmamışlar kuyruğa döner, kazananlar kalır", async () => {
    const env = createMockEnv();
    await env.DB.prepare(
      `INSERT INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, kategori,
         fiyat_per_m2, yakalanma_tarihi, aktif, zenginlestirildi,
         imar_durumu, tapu_durumu, baslik, koord_kaynagi)
       VALUES
         ('emlakjet','bos-1','adana','pozanti','arsa',1,unixepoch(),1,999,NULL,NULL,NULL,NULL),
         ('emlakjet','imarli','adana','pozanti','arsa',1,unixepoch(),1,999,'Tarla',NULL,NULL,NULL),
         ('emlakjet','parselli','adana','pozanti','arsa',1,unixepoch(),1,999,NULL,NULL,NULL,'parsel'),
         ('emlakjet','merkezli','adana','pozanti','arsa',1,unixepoch(),1,999,NULL,NULL,NULL,'mahalle-merkez')`,
    ).run();

    await env.DB.prepare(
      `UPDATE ilanlar SET zenginlestirildi = NULL
       WHERE kaynak = 'emlakjet' AND zenginlestirildi IS NOT NULL
         AND imar_durumu IS NULL AND tapu_durumu IS NULL AND baslik IS NULL
         AND (koord_kaynagi IS NULL OR koord_kaynagi <> 'parsel')`,
    ).run();

    const oku = async (no: string) => (await env.DB.prepare(
      `SELECT zenginlestirildi FROM ilanlar WHERE ilan_no = ?`,
    ).bind(no).first<{ zenginlestirildi: number | null }>())?.zenginlestirildi;

    expect(await oku("bos-1")).toBeNull();     // hiç alan yok → kuyruğa
    expect(await oku("merkezli")).toBeNull();  // yalnızca mahalle merkezi → kuyruğa
    expect(await oku("imarli")).toBe(999);     // imar kazanmış → kalıyor
    expect(await oku("parselli")).toBe(999);   // gerçek parsel koordinatı → kalıyor
  });
});
