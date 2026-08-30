/**
 * Pipeline health — SESSİZ BOZULMA kontrolleri.
 *
 * Her test, bu sistemde GERÇEKTEN yaşanmış ve hiçbir alarma yakalanmamış bir
 * hatayı temsil ediyor. Hepsinin ortak özelliği: ilan sayısını düşürmediler,
 * hata fırlatmadılar, sadece sessizce yanlış/eksik veri ürettiler.
 */
import { describe, it, expect } from "vitest";
import { pipelineHealthKontrol } from "../src/routes/pipeline-health.js";
import { createMockEnv } from "./test-helper.js";

function kontrolBul(sonuc: { kontroller: Array<{ ad: string }> }, ad: string) {
  const k = sonuc.kontroller.find((x) => x.ad === ad);
  if (!k) throw new Error(`Kontrol bulunamadı: ${ad}`);
  return k as { ad: string; deger: number; esik: number; gecti: boolean; mesaj: string };
}

describe("pipeline-health sessiz bozulma kontrolleri", () => {
  it("mahalle_merkez boşsa ALARM verir", async () => {
    // GERÇEK OLAY: tablo hiçbir migration'da tanımlı değildi. Worker'daki
    // koordinatAra() try/catch içinde olduğu için her zaman null dönüyordu;
    // ilan sayısı normaldi, hiçbir kontrol uyarmadı.
    const env = createMockEnv();
    const s = await pipelineHealthKontrol(env.DB);
    const k = kontrolBul(s, "Mahalle merkez koordinatları");
    expect(k.gecti).toBe(false);
    expect(k.deger).toBe(0);
  });

  it("poi_noktalari boşsa ALARM verir", async () => {
    // GERÇEK OLAY: tablo migration 0017'de kuruldu ama hiç doldurulmadı.
    // /v1/harita/poi boş dizi dönüyordu — hata değil, ölü özellik.
    const env = createMockEnv();
    const s = await pipelineHealthKontrol(env.DB);
    const k = kontrolBul(s, "Harita POI noktaları");
    expect(k.gecti).toBe(false);
  });

  it("koordinat kapsamı düşükse ALARM verir", async () => {
    // GERÇEK OLAY: koordinat kapsamı %37'ye takılıydı çünkü Worker hattı
    // koordinat yazamıyordu. Mutlak ilan sayısı sağlıklı görünüyordu.
    const env = createMockEnv();
    await env.DB.prepare(
      `INSERT INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, kategori,
         fiyat_per_m2, yakalanma_tarihi, aktif, lat, lng)
       VALUES
         ('emlakjet','k-1','istanbul','catalca','arsa',5000,unixepoch(),1,NULL,NULL),
         ('emlakjet','k-2','istanbul','catalca','arsa',5000,unixepoch(),1,NULL,NULL),
         ('emlakjet','k-3','istanbul','catalca','arsa',5000,unixepoch(),1,41.1,28.4)`,
    ).run();
    const s = await pipelineHealthKontrol(env.DB);
    const k = kontrolBul(s, "Koordinat kapsamı (%)");
    expect(k.deger).toBe(33); // 1/3
    expect(k.gecti).toBe(false);
  });

  it("koordinat kapsamı yeterliyse GEÇER", async () => {
    const env = createMockEnv();
    await env.DB.prepare(
      `INSERT INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, kategori,
         fiyat_per_m2, yakalanma_tarihi, aktif, lat, lng)
       VALUES
         ('emlakjet','y-1','istanbul','catalca','arsa',5000,unixepoch(),1,41.1,28.4),
         ('emlakjet','y-2','istanbul','catalca','arsa',5000,unixepoch(),1,41.2,28.5)`,
    ).run();
    const s = await pipelineHealthKontrol(env.DB);
    expect(kontrolBul(s, "Koordinat kapsamı (%)").gecti).toBe(true);
  });

  it("tarama rotasyonu durmuşsa ALARM verir", async () => {
    // GERÇEK OLAY: scraper aylarca aynı 3 İstanbul ilçesini taradı. Toplam
    // ilan sayısı sabit kaldığı için "sağlıklı" görünüyordu; rotasyonun
    // ilerlemediğini gösteren tek sinyal damga sayısıydı.
    const env = createMockEnv();
    await env.DB.prepare(
      `INSERT INTO tarama_durum (kaynak, il_norm, ilce_norm, kategori, son_tarama)
       VALUES ('emlakjet','istanbul','beykoz','arsa', ?)`,
    ).bind(Date.now()).run();
    const s = await pipelineHealthKontrol(env.DB);
    const k = kontrolBul(s, "Son 30 günde taranan hedef");
    expect(k.deger).toBe(1);
    expect(k.gecti).toBe(false);
  });

  it("rotasyon sağlıklıysa GEÇER", async () => {
    const env = createMockEnv();
    const now = Date.now();
    const satirlar = Array.from({ length: 40 }, (_, i) =>
      `('emlakjet','il${i}','ilce${i}','arsa',${now})`).join(",");
    await env.DB.prepare(
      `INSERT INTO tarama_durum (kaynak, il_norm, ilce_norm, kategori, son_tarama)
       VALUES ${satirlar}`,
    ).run();
    expect(kontrolBul(await pipelineHealthKontrol(env.DB), "Son 30 günde taranan hedef").gecti).toBe(true);
  });

  it("30 günden eski damgalar sayılmaz", async () => {
    const env = createMockEnv();
    const eski = Date.now() - 60 * 86_400_000;
    const satirlar = Array.from({ length: 40 }, (_, i) =>
      `('emlakjet','il${i}','ilce${i}','arsa',${eski})`).join(",");
    await env.DB.prepare(
      `INSERT INTO tarama_durum (kaynak, il_norm, ilce_norm, kategori, son_tarama)
       VALUES ${satirlar}`,
    ).run();
    const k = kontrolBul(await pipelineHealthKontrol(env.DB), "Son 30 günde taranan hedef");
    expect(k.deger).toBe(0);
    expect(k.gecti).toBe(false);
  });

  it("bot-engel damgaları birikince ALARM verir (Sprint B.4)", async () => {
    // GERÇEK OLAY: hepsiemlak 429 verdi, engellenme "ilan yok" sayıldı ve 254
    // ilçe sessizce "tarandı" damgalandı. Artık damga 'bot-engel' oluyor —
    // ama damga da sessiz kalırsa aynı körlüğe döneriz, bu yüzden sayılıyor.
    const env = createMockEnv();
    const satirlar = Array.from({ length: 45 }, (_, i) =>
      `('hepsiemlak','il${i}','ilce${i}','arsa',NULL,'bot-engel')`).join(",");
    await env.DB.prepare(
      `INSERT INTO tarama_durum (kaynak, il_norm, ilce_norm, kategori, son_tarama, son_durum)
       VALUES ${satirlar}`,
    ).run();
    const k = kontrolBul(await pipelineHealthKontrol(env.DB), "Bot engelli hedef (üst sınır)");
    expect(k.deger).toBe(45);
    expect(k.gecti).toBe(false);
  });

  it("bot-engel damgası yokken GEÇER", async () => {
    const env = createMockEnv();
    const k = kontrolBul(await pipelineHealthKontrol(env.DB), "Bot engelli hedef (üst sınır)");
    expect(k.deger).toBe(0);
    expect(k.gecti).toBe(true);
  });

  it("olmayan tabloyu 'geçti' saymaz — hata yutma korumasi", async () => {
    // Bu, tüm sınıfın kök nedeni: sorgu patlayınca sessizce devam edip
    // kontrolü başarılı saymak. sayimKontrolEkle bunu 0/başarısız sayıyor.
    const env = createMockEnv();
    await env.DB.prepare("DROP TABLE IF EXISTS poi_noktalari").run();
    const k = kontrolBul(await pipelineHealthKontrol(env.DB), "Harita POI noktaları");
    expect(k.gecti).toBe(false);
    expect(k.mesaj).toContain("Tablo yok");
  });
});
