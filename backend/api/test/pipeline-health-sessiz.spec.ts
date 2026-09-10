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

  it("HAYALET İL birikirse ALARM verir", async () => {
    // GERÇEK OLAY: üretimde 83 farklı il_norm vardı. "el zig" (Elâzığ'ın bozuk
    // charset ile normalizasyonu) ve "emlak endeksi" (parser sayfa etiketini il
    // sanmış). İlan sayısı normaldi, hiçbir kontrol uyarmadı.
    const env = createMockEnv();
    const satirlar = Array.from({ length: 83 }, (_, i) =>
      `('emlakjet','g-${i}','il${i}','ilce','arsa',5000,unixepoch(),1)`).join(",");
    await env.DB.prepare(
      `INSERT INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, kategori,
         fiyat_per_m2, yakalanma_tarihi, aktif) VALUES ${satirlar}`,
    ).run();

    const k = kontrolBul(await pipelineHealthKontrol(env.DB), "Farklı il sayısı (üst sınır)");
    expect(k.deger).toBe(83);
    expect(k.gecti).toBe(false);
  });

  it("81 il ve altı GEÇER", async () => {
    const env = createMockEnv();
    const satirlar = Array.from({ length: 81 }, (_, i) =>
      `('emlakjet','n-${i}','il${i}','ilce','arsa',5000,unixepoch(),1)`).join(",");
    await env.DB.prepare(
      `INSERT INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, kategori,
         fiyat_per_m2, yakalanma_tarihi, aktif) VALUES ${satirlar}`,
    ).run();

    const k = kontrolBul(await pipelineHealthKontrol(env.DB), "Farklı il sayısı (üst sınır)");
    expect(k.gecti).toBe(true);
  });

  /**
   * F.1 — EMSAL KAPSAMI. Toplam ilan sayisinin GIZLEDIGI tek sey.
   *
   * Backtest olctu (arsa): 1-4 emsalli mahallede MAPE %94, 5-19'da %50.
   * Yani mahalle basina 5 gozleme ulasmak hatayi yariya indiriyor. Toplam
   * ilan sayisi bu bosluga kordur: hepsi ayni mahallelere yigilmis 40 bin
   * ilan "saglikli" gorunur ama motor yine kor kalir.
   */
  it("ilanlar tek mahalleye yiginsa havuzlu mahalle sayisi ALARM verir", async () => {
    const env = createMockEnv();
    const satirlar = Array.from({ length: 60 }, (_, i) =>
      `('emlakjet','yigin-${i}','istanbul','catalca','ferhatpasa','arsa',5000,unixepoch(),1)`).join(",");
    await env.DB.prepare(
      `INSERT INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm,
         kategori, fiyat_per_m2, yakalanma_tarihi, aktif) VALUES ${satirlar}`,
    ).run();

    const k = kontrolBul(await pipelineHealthKontrol(env.DB), "Havuzlu mahalle (arsa, >=5 emsal)");
    // 60 ilan var ama TEK mahallede — kapsam 1.
    expect(k.deger).toBe(1);
    expect(k.gecti).toBe(false);
  });

  it("havuz esigini asmayan mahalleler sayilmaz", async () => {
    // 4 emsal, esik 5. Motorun hatasinin yariya indigi bant 5'ten basliyor;
    // 4'te durmus bir mahalleyi "kapsandi" saymak, tam da olcumu yalanlamak
    // olurdu.
    const env = createMockEnv();
    const satirlar = Array.from({ length: 4 }, (_, i) =>
      `('emlakjet','az-${i}','ankara','cankaya','yesilkent','arsa',5000,unixepoch(),1)`).join(",");
    await env.DB.prepare(
      `INSERT INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm,
         kategori, fiyat_per_m2, yakalanma_tarihi, aktif) VALUES ${satirlar}`,
    ).run();

    const k = kontrolBul(await pipelineHealthKontrol(env.DB), "Havuzlu mahalle (arsa, >=5 emsal)");
    expect(k.deger).toBe(0);
  });

  it("mahalle_norm bos olan ilanlar kapsama girmez", async () => {
    // Mahallesi bilinmeyen ilan emsal havuzu kuramaz — sayilirsa kapsam
    // oldugundan buyuk gorunur ve F.1 ilerlemesi yalan soyler.
    const env = createMockEnv();
    const satirlar = Array.from({ length: 30 }, (_, i) =>
      `('emlakjet','bos-${i}','izmir','bornova',NULL,'arsa',5000,unixepoch(),1)`).join(",");
    await env.DB.prepare(
      `INSERT INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm,
         kategori, fiyat_per_m2, yakalanma_tarihi, aktif) VALUES ${satirlar}`,
    ).run();

    const k = kontrolBul(await pipelineHealthKontrol(env.DB), "Havuzlu mahalle (arsa, >=5 emsal)");
    expect(k.deger).toBe(0);
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

describe("okuma bütçesi kontrolü — 'bilinmiyor' YEŞİL değildir", () => {
  const AD = "Günlük D1 satır okuma (üst sınır)";

  it("bütçe kaydı YOKSA 'bilinmiyor' döner ve alarm sayılır", async () => {
    /**
     * GERÇEK OLAY — bu dosyadaki en pahalı vaka.
     *
     * `okuma_butcesi_gunluk` tablosu 2026-09-04 kesintisinden sonra kuruldu ama
     * ona YAZAN KOD hiç yazılmadı. Kontrol boş tabloyu okuyup `okunanSatir = 0`
     * yapıyor, `0 <= 3.500.000` doğru çıkıyor ve HER KOŞUMDA YEŞİL dönüyordu.
     * 2026-09-09'da limit yine doldu, servis 500 vermeye başladı, pano yine
     * yeşildi.
     *
     * MUTASYON: `pipeline-health.ts`'de `!butce` dalını
     * `durum: "gecti"` yapın ya da eski `okunanSatir = okuma?.satir_okuma ?? 0`
     * davranışına dönün → bu test kırılır.
     */
    const env = createMockEnv();
    const s = await pipelineHealthKontrol(env.DB);
    const k = s.kontroller.find((x) => x.ad === AD);
    expect(k).toBeDefined();
    expect(k!.durum).toBe("bilinmiyor");
    // Eski `gecti` okuyucuları da artık yeşil GÖRMÜYOR.
    expect(k!.gecti).toBe(false);
    // "Bilinmiyor" alarm sayısına dahil — sistem sağlıklı ilan edilemez.
    expect(s.alarmSayisi).toBeGreaterThan(0);
  });

  it("bütçe kaydı VARSA ve eşiğin altındaysa GEÇER — kaynak kırılımıyla", async () => {
    const env = createMockEnv();
    const bugun = new Date().toISOString().slice(0, 10);
    await env.DB.prepare(
      `INSERT INTO okuma_butcesi_gunluk
         (gun, kaynak, satir_okuma, satir_yazma, sorgu_adet, metasiz_adet, guncellendi)
       VALUES (?, 'cron-saatlik', 120000, 0, 40, 0, 0),
              (?, 'cron-gunluk',   80000, 0, 12, 0, 0)`,
    ).bind(bugun, bugun).run();

    const s = await pipelineHealthKontrol(env.DB);
    const k = s.kontroller.find((x) => x.ad === AD)!;
    expect(k.durum).toBe("gecti");
    expect(k.deger).toBe(200000);
    // Kırılım mesaja giriyor: "kim yedi" cevabı olmadan sayı eyleme dönüşmüyor.
    expect(k.mesaj).toContain("cron-saatlik");
  });

  it("bütçe eşiği aşılmışsa KALDI döner", async () => {
    const env = createMockEnv();
    const bugun = new Date().toISOString().slice(0, 10);
    await env.DB.prepare(
      `INSERT INTO okuma_butcesi_gunluk
         (gun, kaynak, satir_okuma, satir_yazma, sorgu_adet, metasiz_adet, guncellendi)
       VALUES (?, 'cron-saatlik', 4200000, 0, 40, 0, 0)`,
    ).bind(bugun).run();

    const s = await pipelineHealthKontrol(env.DB);
    const k = s.kontroller.find((x) => x.ad === AD)!;
    expect(k.durum).toBe("kaldi");
    expect(k.gecti).toBe(false);
  });

  it("ölçülemeyen çağrılar varsa mesaj bunu SÖYLER — rapor olduğundan iyi görünmesin", async () => {
    const env = createMockEnv();
    const bugun = new Date().toISOString().slice(0, 10);
    await env.DB.prepare(
      `INSERT INTO okuma_butcesi_gunluk
         (gun, kaynak, satir_okuma, satir_yazma, sorgu_adet, metasiz_adet, guncellendi)
       VALUES (?, 'cron-gunluk', 1000, 0, 50, 37, 0)`,
    ).bind(bugun).run();

    const s = await pipelineHealthKontrol(env.DB);
    const k = s.kontroller.find((x) => x.ad === AD)!;
    // `first()` çağrıları D1'de meta döndürmüyor; maliyetleri bilinmiyor.
    // Bunu gizlemek, sayacın önlemek için kurulduğu hatayı tekrarlamak olurdu.
    expect(k.mesaj).toContain("ÖLÇÜLEMEDİ");
  });
});
