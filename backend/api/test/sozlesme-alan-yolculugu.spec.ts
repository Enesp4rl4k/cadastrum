/**
 * SÖZLEŞME TESTİ — alan yolculuğu (field round-trip).
 *
 * NEDEN BU DOSYA VAR: bu sistemde bulunan hataların en sinsi sınıfı, bir veri
 * alanının katmanlar arasında SESSİZCE düşmesiydi. Her katman kendi başına
 * doğruydu, hiçbir test kırılmadı, hiçbir hata loglanmadı — alan yalnızca
 * yok oldu.
 *
 * Gerçek olay (`baslik`):
 *   extension yakalıyor  ✓   (background/service-worker.ts)
 *   payload'a koyuyor    ✗   ← eksik
 *   şema kabul ediyor    ✗   ← eksik
 *   INSERT yazıyor       ✗   ← eksik
 *   D1'de duruyor        ✗
 * Sonuç: üretimde 530 extension ilanının hiçbirinde başlık yoktu ve rafinerinin
 * hisseli/kooperatif tespiti backend emsallerinde tamamen sinyalsiz çalışıyordu.
 * Aylarca fark edilmedi.
 *
 * Bu testler alanın TÜM YOLCULUĞUNU kat ediyor: HTTP payload → IlanIngestSchema
 * → INSERT → gerçek SQLite → SELECT. Aradaki herhangi bir katman alanı düşürürse
 * test kırılır.
 *
 * MockD1Database (test-helper.ts) schema.sql + tüm migration'ları gerçek
 * node:sqlite belleğine yüklüyor, yani gerçek şemaya karşı gerçek SQL çalışıyor.
 */
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";

/** Ingest için geçerli minimum payload. */
function payload(ilanNo: string, ek: Record<string, unknown> = {}) {
  return {
    kaynak: "extension",
    ilan_no: ilanNo,
    il: "İstanbul",
    ilce: "Çatalca",
    mahalle: "Nakkaş",
    fiyat_per_m2: 5044,
    m2: 456,
    kategori: "arsa",
    ...ek,
  };
}

async function katkiGonder(env: ReturnType<typeof createMockEnv>, ilanlar: unknown[]) {
  return app.request(
    "/v1/ilan/katki",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ilanlar }),
    },
    env,
  );
}

/** İlanı D1'den ham hâliyle okur — motorun göreceği şekil. */
async function d1denOku(env: ReturnType<typeof createMockEnv>, ilanNo: string) {
  return env.DB.prepare(
    `SELECT kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, fiyat_per_m2, m2,
            kategori, imar_durumu, baslik, tapu_durumu, lat, lng, koord_kaynagi
     FROM ilanlar WHERE ilan_no = ?`,
  ).bind(ilanNo).first<Record<string, unknown>>();
}

describe("sözleşme: alan yolculuğu (payload → şema → D1)", () => {
  it("TÜM kritik alanlar yolculuğu tamamlar", async () => {
    const env = createMockEnv();
    const res = await katkiGonder(env, [
      payload("yolculuk-1", {
        imar_durumu: "Konut İmarlı",
        baslik: "HİSSELİ TAPU Çatalca Nakkaş'ta Satılık Arsa",
        tapu_durumu: "Hisseli Tapu",
        lat: 41.1417,
        lng: 28.4631,
      }),
    ]);
    expect(res.status).toBe(200);

    const satir = await d1denOku(env, "yolculuk-1");
    expect(satir).not.toBeNull();

    // Her alan tek tek — biri düşerse hangisi olduğu doğrudan görünsün.
    expect(satir!.kaynak).toBe("extension");
    expect(satir!.fiyat_per_m2).toBe(5044);
    expect(satir!.m2).toBe(456);
    expect(satir!.kategori).toBe("arsa");
    expect(satir!.imar_durumu).toBe("Konut İmarlı");
    expect(satir!.baslik).toBe("HİSSELİ TAPU Çatalca Nakkaş'ta Satılık Arsa");
    expect(satir!.tapu_durumu).toBe("Hisseli Tapu");
    expect(satir!.lat).toBeCloseTo(41.142, 2);
    expect(satir!.lng).toBeCloseTo(28.463, 2);
  });

  /**
   * REGRESYON: `baslik` bu yolculuğu tamamlayamıyordu.
   * Bu test tek başına, düzeltme geri alındığında kırılır.
   */
  it("baslik alanı düşmez", async () => {
    const env = createMockEnv();
    await katkiGonder(env, [payload("baslik-yolculuk", { baslik: "Kooperatif Hissesi" })]);
    const satir = await d1denOku(env, "baslik-yolculuk");
    expect(satir!.baslik).toBe("Kooperatif Hissesi");
  });

  it("tapu_durumu alanı düşmez", async () => {
    const env = createMockEnv();
    await katkiGonder(env, [payload("tapu-yolculuk", { tapu_durumu: "Müstakil Tapu" })]);
    const satir = await d1denOku(env, "tapu-yolculuk");
    expect(satir!.tapu_durumu).toBe("Müstakil Tapu");
  });

  it("konum normalize edilerek yazılır (İstanbul → istanbul)", async () => {
    // Normalize kayması da bir sözleşme hatası: motor normalize slug ile
    // sorguluyor, ham ad yazılırsa emsal eşleşmesi sessizce sıfırlanır.
    const env = createMockEnv();
    await katkiGonder(env, [payload("normalize-1")]);
    const satir = await d1denOku(env, "normalize-1");
    expect(satir!.il_norm).toBe("istanbul");
    expect(satir!.ilce_norm).toBe("catalca");
    expect(String(satir!.mahalle_norm)).toContain("nakkas");
  });

  it("opsiyonel alanlar yoksa kayıt yine de tam yazılır", async () => {
    const env = createMockEnv();
    await katkiGonder(env, [payload("minimum-1")]);
    const satir = await d1denOku(env, "minimum-1");
    expect(satir).not.toBeNull();
    expect(satir!.baslik).toBeNull();
    expect(satir!.tapu_durumu).toBeNull();
    expect(satir!.fiyat_per_m2).toBe(5044);
  });

  /**
   * Zenginleştirme hattı detay sayfasından daha güvenilir başlık/tapu
   * çekiyor. Sonradan gelen boş bir extension payload'ı onun üzerine
   * yazmamalı — bu yüzden UPSERT'te COALESCE var.
   */
  it("boş payload, önceden yazılmış başlığı EZMEZ", async () => {
    const env = createMockEnv();
    // /v1/ilan tekil yolu UPSERT yapıyor (katki INSERT OR IGNORE).
    const gonder = (govde: unknown) =>
      app.request(
        "/v1/ilan",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(govde) },
        env,
      );

    await gonder(payload("ezme-1", { baslik: "Zenginleştirmeden gelen başlık" }));
    await gonder(payload("ezme-1")); // başlıksız ikinci gönderim

    const satir = await d1denOku(env, "ezme-1");
    expect(satir!.baslik).toBe("Zenginleştirmeden gelen başlık");
  });
});
