/**
 * G4a — konut: ölçülemeyen kategori sayı değil gerekçe döner.
 *
 * Kural önceden yazıldı (GELISTIRME-PLANI-2 §Ö2): "ölçülemiyorsa kapat,
 * etiketle-bırak seçeneği yok". Kullanıcı "Kapat"ı seçti (2026-09-11).
 *
 * MUTASYON: fiyat.ts'de `/il/:il` rotasındaki `olculmeyenKategoriYaniti`
 * satırlarını kaldır → "fiyat/il konut 422" testi kırılır.
 */
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";
import { OLCULMEYEN_KATEGORI_KODU } from "../src/lib/kategori-olcum.js";

const env = createMockEnv();
const get = (yol: string) => app.request(yol, { method: "GET" }, env);

describe("konut — /v1/fiyat/* sayı DÖNMEZ", () => {
  it.each([
    "/v1/fiyat/il/istanbul?kategori=konut",
    "/v1/fiyat/ilce/istanbul/kadikoy?kategori=konut",
    "/v1/fiyat/mahalle/istanbul/kadikoy/moda?kategori=konut",
    "/v1/fiyat/toplu-ozet?kategori=konut",
    "/v1/fiyat/toplu-ilce-ozet/istanbul?kategori=konut",
    "/v1/fiyat/trend/istanbul/kadikoy/moda?kategori=konut",
  ])("%s → 422 + gerekçe", async (yol) => {
    const r = await get(yol);
    expect(r.status).toBe(422);
    const b = (await r.json()) as { kod: string; olcum: boolean; gerekce: string; medyan?: unknown };
    expect(b.kod).toBe(OLCULMEYEN_KATEGORI_KODU);
    expect(b.olcum).toBe(false);
    expect(b.gerekce).toContain("ölçülmüş");
    // Sözleşmenin özü: SAYI YOK.
    expect(b.medyan).toBeUndefined();
  });

  it("arsa ETKİLENMEZ — kapı yalnızca ölçülemeyen kategoriye", async () => {
    const r = await get("/v1/fiyat/il/istanbul?kategori=arsa");
    expect(r.status).not.toBe(422);
  });
});

describe("konut — /v1/sorgu sayı DÖNMEZ", () => {
  it("konut sorgusu 422 + gerekçe; sabit il tablosuna düşmez", async () => {
    const r = await app.request(
      "/v1/sorgu",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: 41.0, lng: 29.0, kategori: "konut" }),
      },
      env,
    );
    expect(r.status).toBe(422);
    const b = (await r.json()) as { kod: string };
    expect(b.kod).toBe(OLCULMEYEN_KATEGORI_KODU);
  });
});

describe("BİLİNÇLİ İSTİSNA — endeks konut açık kalır", () => {
  it("/v1/api/endeks?kategori=konut kapıdan GEÇMEZ (gerçek ilan medyanı, motor tahmini değil)", async () => {
    // Endeks gözlem medyanı; kural motorun ÖLÇÜLEMEYEN TAHMİNİ hakkında.
    // Veri olmayabilir (404/boş) — önemli olan 422 kategori reddi DÖNMEMESİ.
    const r = await get("/v1/api/endeks?kategori=konut");
    if (r.status === 422) {
      const b = (await r.json()) as { kod?: string };
      expect(b.kod).not.toBe(OLCULMEYEN_KATEGORI_KODU);
    }
  });
});
