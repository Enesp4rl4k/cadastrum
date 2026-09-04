/**
 * OKUMA BÜTÇESİ — sıcak yolda tam tablo taraması kalmadı.
 *
 * NEDEN: Cloudflare D1 ücretsiz katmanı günde 5M satır okuma veriyor ve
 * 2026-09-04'te bu limit doldu — sistemin hiç kullanıcısı olmadığı hâlde.
 * `wrangler d1 execute` ve canlı uçlar "exceeded D1's free tier daily row read
 * limit" döndürmeye başladı. Belirti "sunucu hatası"ydı; sebebi görünmüyordu,
 * çünkü hiçbir yerde `meta.rows_read` toplanmıyordu.
 *
 * İki sorgu bütçeyi eritiyordu:
 *   /v1/fiyat/toplu-ozet   → 188.697 satırlık GROUP BY, her cache-miss'te
 *   zenginleştirme kuyruğu → `ilanlar` üzerinde iki CTE tam tarama, SAATLİK
 *
 * Bu testler o iki yolun geri gelmediğini kilitliyor.
 */
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";
import { ilFiyatOzetiKur } from "../src/lib/ozet-tablolari.js";
import { pipelineHealthKontrol } from "../src/routes/pipeline-health.js";

function kontrolBul(sonuc: { kontroller: Array<{ ad: string }> }, ad: string) {
  const k = sonuc.kontroller.find((x) => x.ad === ad);
  if (!k) throw new Error(`Kontrol bulunamadı: ${ad}`);
  return k as { ad: string; deger: number; esik: number; gecti: boolean; mesaj: string };
}

describe("il_fiyat_ozet — /toplu-ozet'in tam taraması yerine", () => {
  it("ölçülmüş ve türetilmiş değerleri AYRI kolonlara yazar", async () => {
    const env = createMockEnv();
    await env.DB.prepare(
      `INSERT INTO il_istatistik (il_norm, kategori, medyan, ilan_adet, son_guncelleme)
       VALUES ('istanbul','arsa',8000,120,unixepoch())`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO mahalle_baseline_ai (il_norm, ilce_norm, mahalle_norm, kategori, tlm2, guven, kaynak, yakalandi)
       VALUES ('agri','merkez','x','arsa',300,40,'knn-smoothing',unixepoch()),
              ('agri','merkez','y','arsa',400,40,'knn-smoothing',unixepoch())`,
    ).run();

    await ilFiyatOzetiKur(env.DB);

    const ist = await env.DB.prepare(
      `SELECT * FROM il_fiyat_ozet WHERE il_norm='istanbul' AND kategori='arsa'`,
    ).first<Record<string, number | null>>();
    expect(ist?.medyan_ilan).toBe(8000);
    expect(ist?.adet_ilan).toBe(120);

    const agri = await env.DB.prepare(
      `SELECT * FROM il_fiyat_ozet WHERE il_norm='agri' AND kategori='arsa'`,
    ).first<Record<string, number | null>>();
    // Ölçülmüş veri yok → medyan_ilan NULL, adet 0. Türetilmiş ayrı kolonda.
    expect(agri?.medyan_ilan).toBeNull();
    expect(agri?.adet_ilan).toBe(0);
    expect(agri?.medyan_ai).toBe(350);
    expect(agri?.mahalle_ai_adet).toBe(2);
  });

  /**
   * ASIL DÜZELTME: eskiden AI satırlarında `ilan_adet` alanına
   * `mahalle_baseline_ai` SATIR SAYISI yazılıyordu ve uzantı haritası bunu
   * "650 ilan · ● AI tahmin" diye gösteriyordu — o ilde sıfır gözlem varken.
   */
  it("AI ile sunulan ilde ilan_adet SIFIR döner (uydurma sayı değil)", async () => {
    const env = createMockEnv();
    await env.DB.prepare(
      `INSERT INTO mahalle_baseline_ai (il_norm, ilce_norm, mahalle_norm, kategori, tlm2, guven, kaynak, yakalandi)
       VALUES ('agri','merkez','x','arsa',300,40,'knn-smoothing',unixepoch()),
              ('agri','merkez','y','arsa',400,40,'knn-smoothing',unixepoch())`,
    ).run();
    await ilFiyatOzetiKur(env.DB);

    const res = await app.request("/v1/fiyat/toplu-ozet?kategori=arsa", {}, env);
    expect(res.status).toBe(200);
    const j = await res.json() as { iller: Array<{ il_norm: string; kaynak: string; ilan_adet: number }> };
    const agri = j.iller.find((x) => x.il_norm === "agri");
    expect(agri?.kaynak).toBe("ai-baseline");
    expect(agri?.ilan_adet).toBe(0);
  });

  it("ölçülmüş veri >=5 ilan ise onu tercih eder", async () => {
    const env = createMockEnv();
    await env.DB.prepare(
      `INSERT INTO il_istatistik (il_norm, kategori, medyan, ilan_adet, son_guncelleme)
       VALUES ('istanbul','arsa',8000,120,unixepoch())`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO mahalle_baseline_ai (il_norm, ilce_norm, mahalle_norm, kategori, tlm2, guven, kaynak, yakalandi)
       VALUES ('istanbul','x','y','arsa',999,40,'knn-smoothing',unixepoch())`,
    ).run();
    await ilFiyatOzetiKur(env.DB);

    const res = await app.request("/v1/fiyat/toplu-ozet?kategori=arsa", {}, env);
    const j = await res.json() as { iller: Array<{ il_norm: string; kaynak: string; medyan: number }> };
    const ist = j.iller.find((x) => x.il_norm === "istanbul");
    expect(ist?.kaynak).toBe("ilan");
    expect(ist?.medyan).toBe(8000);
  });

  /**
   * Özet tablosu boşsa uç nokta sessizce boş liste döner — eski hâlde tam
   * tarama en azından bir cevap üretiyordu. Bu yüzden pipeline-health'te
   * ayrı bir kontrol var.
   */
  it("özet tablosu boşsa sağlık kontrolü ALARM verir", async () => {
    const env = createMockEnv();
    const k = kontrolBul(await pipelineHealthKontrol(env.DB), "İl fiyat özeti (önden hesaplanmış)");
    expect(k.deger).toBe(0);
    expect(k.gecti).toBe(false);
  });
});

describe("okuma bütçesi kontrolü", () => {
  it("kayıt yoksa 0 okuma raporlar ve alarm vermez", async () => {
    const env = createMockEnv();
    const k = kontrolBul(await pipelineHealthKontrol(env.DB), "Günlük D1 satır okuma (üst sınır)");
    expect(k.deger).toBe(0);
    expect(k.gecti).toBe(true);
  });

  /**
   * Bu kontrol diğerlerinin AKSİNE üst sınır: değer eşiğin ALTINDA olmalı.
   * Eşik 3,5M — ücretsiz katman limitinin (5M) %70'i, yani alarm servis
   * durmadan önce çalar.
   */
  it("eşik aşılınca ALARM verir", async () => {
    const env = createMockEnv();
    const bugun = new Date().toISOString().slice(0, 10);
    await env.DB.prepare(
      `INSERT INTO okuma_butcesi_gunluk (gun, satir_okuma, satir_yazma, guncellendi)
       VALUES (?, 4200000, 0, unixepoch())`,
    ).bind(bugun).run();

    const k = kontrolBul(await pipelineHealthKontrol(env.DB), "Günlük D1 satır okuma (üst sınır)");
    expect(k.deger).toBe(4_200_000);
    expect(k.gecti).toBe(false);
    // Eşik gerçek limitin altında olmalı — alarm çok geç çalmasın.
    expect(k.esik).toBeLessThan(5_000_000);
  });

  it("eşiğin altında geçer", async () => {
    const env = createMockEnv();
    const bugun = new Date().toISOString().slice(0, 10);
    await env.DB.prepare(
      `INSERT INTO okuma_butcesi_gunluk (gun, satir_okuma, satir_yazma, guncellendi)
       VALUES (?, 1000000, 0, unixepoch())`,
    ).bind(bugun).run();
    const k = kontrolBul(await pipelineHealthKontrol(env.DB), "Günlük D1 satır okuma (üst sınır)");
    expect(k.gecti).toBe(true);
  });
});
