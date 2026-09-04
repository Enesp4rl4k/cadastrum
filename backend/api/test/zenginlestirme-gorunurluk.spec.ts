/**
 * ZENGİNLEŞTİRME HATTI GÖRÜNÜRLÜĞÜ.
 *
 * Repo kökündeki `VERI-HATTI-KONTROL-LISTESI.md` şu kuralı koyuyor:
 * "alarm olanlar pipeline-health'e bir kontrol olarak eklenir". Kural
 * `poi_noktalari` ve `mahalle_merkez` için uygulanmış ama ZENGİNLEŞTİRME
 * HATTI için hiç uygulanmamıştı — oysa aynı belge madde 2'de tam olarak bu
 * hattın sessiz başarısızlığını kendi örneği olarak veriyor.
 *
 * Sonuç: üretimdeki %1,9 imar kapsamı rakamı elle atılmış tek seferlik bir
 * sorgudan geliyordu. Hat bugün tamamen dursa kod tabanında bunu bildirecek
 * tek bir mekanizma yoktu — `ZenginlestirmeSonuc` yalnızca console.log'a
 * gidiyordu ve Cloudflare log saklama süresi dolunca kayboluyordu.
 */
import { describe, it, expect } from "vitest";
import { pipelineHealthKontrol } from "../src/routes/pipeline-health.js";
import { createMockEnv } from "./test-helper.js";

function kontrolBul(sonuc: { kontroller: Array<{ ad: string }> }, ad: string) {
  const k = sonuc.kontroller.find((x) => x.ad === ad);
  if (!k) throw new Error(`Kontrol bulunamadı: ${ad}`);
  return k as { ad: string; deger: number; esik: number; gecti: boolean; mesaj: string };
}

/** n adet emlakjet ilanı ekle; ilk `imarli` tanesinde imar durumu dolu. */
async function ilanEkle(db: D1Database, n: number, opts: {
  imarli?: number; tapulu?: number; parselKoord?: number;
} = {}) {
  const satirlar = Array.from({ length: n }, (_, i) =>
    `('emlakjet','z-${i}','istanbul','catalca','arsa',5000,unixepoch(),1,` +
    `${i < (opts.imarli ?? 0) ? "'Tarla'" : "NULL"},` +
    `${i < (opts.tapulu ?? 0) ? "'Hisseli Tapu'" : "NULL"},` +
    `${i < (opts.parselKoord ?? 0) ? "'parsel'" : "NULL"})`).join(",");
  await db.prepare(
    `INSERT INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, kategori,
       fiyat_per_m2, yakalanma_tarihi, aktif, imar_durumu, tapu_durumu, koord_kaynagi)
     VALUES ${satirlar}`,
  ).run();
}

describe("zenginleştirme hattı sağlık kontrolleri", () => {
  it("imar doluluk oranını yüzde olarak raporlar", async () => {
    const env = createMockEnv();
    await ilanEkle(env.DB, 100, { imarli: 12 });
    const k = kontrolBul(await pipelineHealthKontrol(env.DB), "İmar durumu doluluk (%)");
    expect(k.deger).toBe(12);
    expect(k.gecti).toBe(true);
  });

  /**
   * ASIL SENARYO: hat duruyor, imar hiç dolmuyor. Eskiden bu durum hiçbir
   * yerde görünmüyordu — ilan sayısı normaldi, hata yoktu.
   */
  it("imar hiç dolmuyorsa ALARM verir", async () => {
    const env = createMockEnv();
    await ilanEkle(env.DB, 100, { imarli: 0 });
    const k = kontrolBul(await pipelineHealthKontrol(env.DB), "İmar durumu doluluk (%)");
    expect(k.deger).toBe(0);
    expect(k.gecti).toBe(false);
  });

  /**
   * GERÇEK PARSEL koordinatı, mevcut "Koordinat kapsamı (%)" kontrolünden
   * FARKLI olmalı. O kontrol `lat IS NOT NULL` sayıyor; tüm koordinatlar
   * mahalle merkezi olsa bile %100 geçer. Spatial motor gerçek konum istiyor.
   */
  it("parsel koordinatı, mahalle merkezinden ayrı sayılır", async () => {
    const env = createMockEnv();
    // 100 ilan, hepsinde lat dolu ama yalnızca 3'ü gerçek parsel koordinatı.
    await env.DB.prepare(
      `INSERT INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, kategori,
         fiyat_per_m2, yakalanma_tarihi, aktif, lat, lng, koord_kaynagi)
       VALUES ${Array.from({ length: 100 }, (_, i) =>
        `('emlakjet','p-${i}','istanbul','catalca','arsa',5000,unixepoch(),1,41.1,28.4,` +
        `${i < 3 ? "'parsel'" : "'mahalle-merkez'"})`).join(",")}`,
    ).run();

    const s = await pipelineHealthKontrol(env.DB);
    // Eski kontrol: hepsi koordinatlı → %100, geçer.
    expect(kontrolBul(s, "Koordinat kapsamı (%)").deger).toBe(100);
    // Yeni kontrol: yalnızca %3 gerçek parsel.
    const p = kontrolBul(s, "Gerçek parsel koordinatı (%)");
    expect(p.deger).toBe(3);
  });

  /**
   * Hat tamamen durursa (cron ölmüş, tur kaydı yok) bunun görünmesi gerek.
   * Eskiden tek iz console.log'du ve o da kaybolurdu.
   */
  it("son 24 saatte hiç tur yoksa ALARM verir", async () => {
    const env = createMockEnv();
    const k = kontrolBul(await pipelineHealthKontrol(env.DB), "Zenginleştirme turu (son 24s)");
    expect(k.deger).toBe(0);
    expect(k.gecti).toBe(false);
    expect(k.mesaj).toContain("hiç tur kaydı yok");
  });

  it("tur kaydı varsa denenen sayısını raporlar", async () => {
    const env = createMockEnv();
    await env.DB.prepare(
      `INSERT INTO zenginlestirme_log
         (calisti, denenen, zenginlesen, imar_bulunan, tapu_bulunan,
          koord_bulunan, baslik_bulunan, kalici_hata, gecici_hata, sure_ms)
       VALUES (?, 2880, 400, 120, 90, 300, 380, 12, 4, 95000)`,
    ).bind(Date.now()).run();
    const k = kontrolBul(await pipelineHealthKontrol(env.DB), "Zenginleştirme turu (son 24s)");
    expect(k.deger).toBe(2880);
    expect(k.gecti).toBe(true);
  });

  /**
   * Eski tur kayıtları 24 saatlik pencerenin dışında kalmalı — aksi hâlde
   * aylar önce durmuş bir hat "sağlıklı" görünür.
   */
  it("25 saat önceki tur sayılmaz", async () => {
    const env = createMockEnv();
    await env.DB.prepare(
      `INSERT INTO zenginlestirme_log
         (calisti, denenen, zenginlesen, imar_bulunan, tapu_bulunan,
          koord_bulunan, baslik_bulunan, kalici_hata, gecici_hata, sure_ms)
       VALUES (?, 2880, 400, 120, 90, 300, 380, 12, 4, 95000)`,
    ).bind(Date.now() - 25 * 3600_000).run();
    const k = kontrolBul(await pipelineHealthKontrol(env.DB), "Zenginleştirme turu (son 24s)");
    expect(k.deger).toBe(0);
    expect(k.gecti).toBe(false);
  });
});
