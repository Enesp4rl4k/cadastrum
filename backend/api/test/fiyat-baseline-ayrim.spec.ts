import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";

describe("Fiyat Endpoint'leri — ilan_adet ↔ baseline_satir_sayisi Ayrımı (F0.4)", () => {
  it("Mahalle AI baseline fallback'inde ilan_adet: 0 ve baseline_satir_sayisi: 1 döner", async () => {
    const env = createMockEnv();
    await env.DB.prepare(
      `INSERT INTO mahalle_baseline_ai (il_norm, ilce_norm, mahalle_norm, kategori, tlm2, guven, kaynak, yakalandi)
       VALUES ('ankara', 'cankaya', 'ayranci', 'konut', 45000, 75, 'knn-smoothing', ?)`
    ).bind(Date.now()).run();

    const res = await app.request("/v1/fiyat/mahalle/ankara/cankaya/ayranci?kategori=konut", {}, env);
    expect(res.status).toBe(200);

    const j = await res.json() as { medyan: number; ilan_adet: number; baseline_satir_sayisi: number; kaynak: string };
    expect(j.medyan).toBe(45000);
    expect(j.ilan_adet).toBe(0);
    expect(j.baseline_satir_sayisi).toBe(1);
    expect(j.kaynak).toBe("knn-smoothing");
  });

  it("İlçe AI baseline fallback'inde ilceIstatistik.ilan_adet: 0 döner ve mahalle baseline sayısını baseline_satir_sayisi olarak verir", async () => {
    const env = createMockEnv();
    const simdi = Date.now();
    await env.DB.prepare(
      `INSERT INTO mahalle_baseline_ai (il_norm, ilce_norm, mahalle_norm, kategori, tlm2, guven, kaynak, yakalandi)
       VALUES ('izmir', 'bornova', 'kazimdirik', 'konut', 38000, 70, 'knn-smoothing', ?)`
    ).bind(simdi).run();
    await env.DB.prepare(
      `INSERT INTO mahalle_baseline_ai (il_norm, ilce_norm, mahalle_norm, kategori, tlm2, guven, kaynak, yakalandi)
       VALUES ('izmir', 'bornova', 'erzene', 'konut', 34000, 70, 'knn-smoothing', ?)`
    ).bind(simdi).run();

    const res = await app.request("/v1/fiyat/ilce/izmir/bornova?kategori=konut", {}, env);
    expect(res.status).toBe(200);

    const j = await res.json() as {
      medyan: number;
      ilan_adet: number;
      baseline_satir_sayisi: number;
      kaynak: string;
      mahalleler: Array<{ mahalle_norm: string; medyan: number; ilan_adet: number; baseline_satir_sayisi: number }>;
    };

    expect(j.kaynak).toBe("ai-aggregate");
    expect(j.ilan_adet).toBe(0);
    expect(j.baseline_satir_sayisi).toBe(2);
    expect(j.mahalleler).toHaveLength(2);
    expect(j.mahalleler[0]!.ilan_adet).toBe(0);
    expect(j.mahalleler[0]!.baseline_satir_sayisi).toBe(1);
  });

  it("İl AI baseline fallback'inde ilIstatistik.ilan_adet: 0 döner", async () => {
    const env = createMockEnv();
    const simdi = Date.now();
    await env.DB.prepare(
      `INSERT INTO mahalle_baseline_ai (il_norm, ilce_norm, mahalle_norm, kategori, tlm2, guven, kaynak, yakalandi)
       VALUES ('bursa', 'nilufer', 'ozluce', 'konut', 32000, 68, 'knn-smoothing', ?)`
    ).bind(simdi).run();

    const res = await app.request("/v1/fiyat/il/bursa?kategori=konut", {}, env);
    expect(res.status).toBe(200);

    const j = await res.json() as {
      medyan: number;
      ilan_adet: number;
      baseline_satir_sayisi: number;
      kaynak: string;
      ilceler: Array<{ ilce_norm: string; medyan: number; ilan_adet: number }>;
    };

    expect(j.kaynak).toBe("ai-aggregate");
    expect(j.ilan_adet).toBe(0);
    expect(j.baseline_satir_sayisi).toBe(1);
    expect(j.ilceler[0]!.ilan_adet).toBe(0);
  });
});
