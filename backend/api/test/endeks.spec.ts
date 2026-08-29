/**
 * Cadex Fiyat Endeksi — In-memory test suite
 */
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";
import { endeksHesapla } from "../src/routes/endeks.js";

describe("Cadex Fiyat Endeksi API", () => {
  const env = createMockEnv();

  it("GET /v1/api/endeks → boş veride 200 döner", async () => {
    const res = await app.request("/v1/api/endeks", { method: "GET" }, env);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.kategori).toBe("arsa");
    expect(Array.isArray(body.noktalar)).toBe(true);
  });

  it("endeksHesapla() ilanlardan fiyat_endeksi tablosunu besler", async () => {
    // İlan ekle
    await env.DB.prepare(`
      INSERT INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, kategori, fiyat_per_m2, yakalanma_tarihi)
      VALUES
        ('sahibinden', 'endeks-101', 'istanbul', 'kadikoy', 'arsa', 25000, unixepoch()),
        ('sahibinden', 'endeks-102', 'istanbul', 'beykoz', 'arsa', 15000, unixepoch()),
        ('sahibinden', 'endeks-103', 'ankara', 'cankaya', 'arsa', 10000, unixepoch())
    `).run();

    const hesap = await endeksHesapla(env.DB);
    expect(hesap.hesaplanan).toBeGreaterThanOrEqual(1);

    // Endeks tablosunu doğrula
    const endeksRows = await env.DB.prepare(
      "SELECT * FROM fiyat_endeksi WHERE il_norm = 'istanbul' AND kategori = 'arsa'"
    ).all();
    expect(endeksRows.results.length).toBeGreaterThan(0);
    expect((endeksRows.results[0] as any).medyan).toBe(20000); // AVG(25000, 15000)
  });

  /**
   * REGRESYON: düşük hacimli dönem seriden çıkarılmalı.
   *
   * Canlı olay (Türkiye geneli, arsa): 2026-05 döneminde yalnızca 16 ilan
   * vardı ve medyanı 90.392 TL/m² çıkıyordu — sonraki ayların ~6.500 TL/m²
   * seviyesinin 14 katı. Önceki düzeltme (MIN_BAZ_ILAN_ADET) bu dönemin TABAN
   * seçilmesini engellemişti ama GÖSTERİLMESİNİ engellememişti; grafik
   * okunamaz hâle geliyor ve kullanıcıya olmayan bir fiyat çöküşü
   * gösteriliyordu.
   */
  it("GET /v1/api/endeks düşük hacimli dönemi seriden çıkarır", async () => {
    const e2 = createMockEnv();
    // 2 farklı dönem: biri 3 ilanlık (eşik altı, aykırı fiyatlı), biri yüksek
    // hacimli. Zaman serisi doğrudan besleniyor — endpoint onu okuyor.
    const satirlar: string[] = [];
    // Düşük hacimli dönem: 3 ilan, saçma yüksek medyan
    satirlar.push(`('istanbul','kadikoy','moda','arsa',2026,5,90000,3)`);
    // Yüksek hacimli dönem: 500 ilan, gerçekçi medyan
    satirlar.push(`('istanbul','kadikoy','moda','arsa',2026,6,6500,500)`);
    await e2.DB.prepare(
      `INSERT INTO mahalle_zaman_serisi
         (il_norm, ilce_norm, mahalle_norm, kategori, yil, ay, medyan, ilan_adet)
       VALUES ${satirlar.join(",")}`,
    ).run();

    const res = await app.request("/v1/api/endeks?kategori=arsa", { method: "GET" }, e2);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    const donemler = body.noktalar.map((n: any) => n.donem);
    expect(donemler).not.toContain("2026-05");
    expect(donemler).toContain("2026-06");
  });

  it("tüm dönemler eşik altındaysa seriyi boşaltmaz", async () => {
    // "Hiç veri yok" demektense zayıf veriyi göstermek daha yararlı — bu
    // durumda zaten yanına kıyaslanacak sağlam bir dönem yok, dolayısıyla
    // aykırılık grafiği bozmuyor.
    const e3 = createMockEnv();
    await e3.DB.prepare(
      `INSERT INTO mahalle_zaman_serisi
         (il_norm, ilce_norm, mahalle_norm, kategori, yil, ay, medyan, ilan_adet)
       VALUES ('izmir','bornova','merkez','arsa',2026,7,5000,4)`,
    ).run();
    const res = await app.request("/v1/api/endeks?kategori=arsa", { method: "GET" }, e3);
    const body: any = await res.json();
    expect(body.noktalar.length).toBe(1);
    expect(body.noktalar[0].donem).toBe("2026-07");
  });
});
