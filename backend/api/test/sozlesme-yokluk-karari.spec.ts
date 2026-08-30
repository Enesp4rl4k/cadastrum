/**
 * SÖZLEŞME TESTİ — yokluk kararı (Roadmap Sprint B.2).
 *
 * KURAL: boş dönebilen her endpoint, boşluğun ÇAĞIRAN TARAFINDAN ayırt
 * edilebilir olduğundan emin olmalı. "İstek başarılı ama içerik yok" ile
 * "istek başarılı ve içerik bu" aynı yanıt şekliyle temsil edilemez.
 *
 * NEDEN: canlıda ölçüldü —
 *
 *     GET /v1/fiyat/ilce/istanbul/hicolmayanilce → 200 {"mahalleler":[]}
 *     GET /v1/fiyat/il/hicolmayanil              → 200 {"ilceler":[]}
 *
 * `ilceIstatistik` undefined olduğunda spread hiçbir şey eklemiyor, gövde boş
 * kalıyor ama status 200. Site yalnızca `res.ok`e baktığı için boş durum kartı
 * hiç tetiklenmiyor; kullanıcıya "— TL/m²", "— güncellendi", "Kaynak —" dolu
 * bir kart gösteriliyordu. Aynı dosyadaki mahalle yolu doğru davranıyordu (404)
 * — yani doğru davranış zaten kodda vardı, iki yola uygulanmamıştı.
 */
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";

type Env = ReturnType<typeof createMockEnv>;

/** İlçe + mahalle istatistiği olan bir il kurar. */
async function veriYaz(env: Env) {
  await env.DB.prepare(
    `INSERT INTO ilce_istatistik (il_norm, ilce_norm, kategori, medyan, q1, q3, ilan_adet, son_guncelleme)
     VALUES ('istanbul', 'catalca', 'arsa', 4567, 3000, 6430, 244, ?)`,
  ).bind(Date.now()).run();
  await env.DB.prepare(
    `INSERT INTO mahalle_istatistik (il_norm, ilce_norm, mahalle_norm, kategori, medyan, ilan_adet, son_guncelleme)
     VALUES ('istanbul', 'catalca', 'nakkas', 'arsa', 2043, 7, ?)`,
  ).bind(Date.now()).run();
}

describe("/v1/fiyat/ilce/:il/:ilce", () => {
  it("veri varken 200 ve dolu gövde döner", async () => {
    const env = createMockEnv();
    await veriYaz(env);
    const res = await app.request("/v1/fiyat/ilce/istanbul/catalca?kategori=arsa", {}, env);
    expect(res.status).toBe(200);

    const j = await res.json() as { medyan: number; mahalleler: unknown[] };
    expect(j.medyan).toBe(4567);
    expect(j.mahalleler).toHaveLength(1);
  });

  it("VERİ YOKKEN 404 döner — 200 + boş gövde DEĞİL", async () => {
    const env = createMockEnv();
    const res = await app.request("/v1/fiyat/ilce/istanbul/hicolmayanilce?kategori=arsa", {}, env);

    expect(res.status).toBe(404);
    const j = await res.json() as { error?: string; medyan?: number };
    expect(j.error).toBeTruthy();
    expect(j.medyan).toBeUndefined();
  });
});

describe("/v1/fiyat/il/:il", () => {
  it("veri varken 200 ve dolu gövde döner", async () => {
    const env = createMockEnv();
    await veriYaz(env);
    const res = await app.request("/v1/fiyat/il/istanbul?kategori=arsa", {}, env);
    expect(res.status).toBe(200);

    const j = await res.json() as { ilceler: unknown[] };
    expect(j.ilceler.length).toBeGreaterThan(0);
  });

  it("VERİ YOKKEN 404 döner", async () => {
    const env = createMockEnv();
    const res = await app.request("/v1/fiyat/il/hicolmayanil?kategori=arsa", {}, env);
    expect(res.status).toBe(404);
  });
});

describe("kısmi veri ATILMAZ", () => {
  it("il özeti düşmüş ama ilçe listesi doluysa 200 döner", async () => {
    // 404'ü fazla geniş koymak yeni bir kayıp yaratırdı: `il_istatistik` satırı
    // yoksa bile `ilce_istatistik` doluysa yanıt hâlâ işe yarıyor. 404 yalnızca
    // HİÇBİR ŞEY yokken.
    const env = createMockEnv();
    await env.DB.prepare(
      `INSERT INTO ilce_istatistik (il_norm, ilce_norm, kategori, medyan, q1, q3, ilan_adet, son_guncelleme)
       VALUES ('istanbul', 'catalca', 'arsa', 4567, 3000, 6430, 244, ?)`,
    ).bind(Date.now()).run();

    const res = await app.request("/v1/fiyat/il/istanbul?kategori=arsa", {}, env);
    expect(res.status).toBe(200);
    const j = await res.json() as { ilceler: unknown[] };
    expect(j.ilceler.length).toBeGreaterThan(0);
  });
});

describe("/v1/fiyat/mahalle/... (referans davranış)", () => {
  it("veri yokken 404 — üç yol artık aynı sözleşmede", async () => {
    const env = createMockEnv();
    const res = await app.request(
      "/v1/fiyat/mahalle/istanbul/catalca/hicolmayanmahalle?kategori=arsa",
      {},
      env,
    );
    expect(res.status).toBe(404);
  });
});
