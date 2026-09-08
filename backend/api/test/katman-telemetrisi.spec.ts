/**
 * KATMAN TELEMETRİSİ (Ö3) — "üretimde hangi katman ne sıklıkta çalışıyor?"
 *
 * Backtest'te kayıtların %62'si `ilanGozlem-mahalle` katmanına düşüyor ve bu
 * dağılımın üretimi TEMSİL ETTİĞİ varsayılıyordu. Varsayım hiç sınanmadı ve
 * sınanması gerekiyor, çünkü iki küme yapısal olarak farklı:
 *   - Backtest korpusu ilan OLAN mahallelerden örnekleniyor
 *   - Üretimde kullanıcı herhangi bir konuma bakıyor
 *   - Havuzlu mahalle oranı yalnızca %4,5
 *
 * Ağırlık ölçülmemiş katmandaysa M1'in kalibre aralığının faydası da sanal —
 * o tablo yalnızca n ≥ 100 olan katmanları kapsıyor.
 *
 * Bu dosya iki şeyi kilitliyor: (1) sayaç mantığı doğru topluyor,
 * (2) GİZLİLİK — tabloya parsel/koordinat/fiyat yazılamıyor.
 */
import { describe, it, expect } from "vitest";
import {
  katmaniKaydet,
  katmanDagilimi,
  guvenBandi,
  emsalBandi,
} from "../src/lib/katman-telemetrisi.js";
import { createMockEnv } from "./test-helper.js";

const GUN = 86_400_000;

describe("katman telemetrisi — bantlama", () => {
  it("güven skoru banda çevriliyor, ham skor tutulmuyor", () => {
    expect(guvenBandi(95)).toBe("80+");
    expect(guvenBandi(80)).toBe("80+");
    expect(guvenBandi(79)).toBe("60-79");
    expect(guvenBandi(40)).toBe("40-59");
    expect(guvenBandi(0)).toBe("0-39");
  });

  /** Bantlar backtest kovalarıyla AYNI olmalı — yoksa kıyas anlamsızlaşır. */
  it("emsal bantları backtest kovalarıyla aynı sınırlarda", () => {
    expect(emsalBandi(0)).toBe("0");
    expect(emsalBandi(4)).toBe("1-4");
    expect(emsalBandi(5)).toBe("5-19");
    expect(emsalBandi(19)).toBe("5-19");
    expect(emsalBandi(20)).toBe("20+");
  });
});

describe("katman telemetrisi — sayaç", () => {
  it("aynı gün + aynı katman ARTIRIYOR, yeni satır açmıyor", async () => {
    const env = createMockEnv();
    const kayit = { kategori: "arsa", katman: "spatial-radius", guvenSkoru: 85, emsalAdet: 7 };
    for (let i = 0; i < 3; i++) expect(await katmaniKaydet(env.DB, kayit)).toBe(true);

    const r = await env.DB.prepare(
      `SELECT COUNT(*) AS satir, SUM(adet) AS toplam FROM fiyat_katman_gunluk`,
    ).first<{ satir: number; toplam: number }>();
    expect(r?.satir, "3 çağrı 1 satır olmalı — günlük toplam").toBe(1);
    expect(r?.toplam).toBe(3);
  });

  it("farklı katman ayrı satır", async () => {
    const env = createMockEnv();
    await katmaniKaydet(env.DB, { kategori: "arsa", katman: "spatial-radius", guvenSkoru: 85, emsalAdet: 7 });
    await katmaniKaydet(env.DB, { kategori: "arsa", katman: "il-fallback", guvenSkoru: 30, emsalAdet: 0 });
    const d = await katmanDagilimi(env.DB, "arsa", 7);
    expect(d).toHaveLength(2);
    expect(d.map((x) => x.oran).sort()).toEqual([50, 50]);
  });

  it("dağılım oranları toplamı ~100", async () => {
    const env = createMockEnv();
    for (let i = 0; i < 7; i++) {
      await katmaniKaydet(env.DB, { kategori: "arsa", katman: "spatial-radius", guvenSkoru: 85, emsalAdet: 7 });
    }
    await katmaniKaydet(env.DB, { kategori: "arsa", katman: "il-fallback", guvenSkoru: 30, emsalAdet: 0 });
    const d = await katmanDagilimi(env.DB, "arsa", 7);
    const toplam = d.reduce((t, x) => t + x.oran, 0);
    expect(Math.abs(toplam - 100)).toBeLessThan(0.5);
  });

  /** Pencere dışındaki kayıtlar sayılmamalı — aksi hâlde eski dağılım güncel görünür. */
  it("pencere dışı günler dağılıma girmiyor", async () => {
    const env = createMockEnv();
    const simdi = Date.now();
    await katmaniKaydet(env.DB, { kategori: "arsa", katman: "il-fallback", guvenSkoru: 30, emsalAdet: 0 }, simdi - 30 * GUN);
    await katmaniKaydet(env.DB, { kategori: "arsa", katman: "spatial-radius", guvenSkoru: 85, emsalAdet: 7 }, simdi);
    const d = await katmanDagilimi(env.DB, "arsa", 7, simdi);
    expect(d).toHaveLength(1);
    expect(d[0]!.katman).toBe("spatial-radius");
  });

  it("kategori ayrımı çalışıyor", async () => {
    const env = createMockEnv();
    await katmaniKaydet(env.DB, { kategori: "arsa", katman: "spatial-radius", guvenSkoru: 85, emsalAdet: 7 });
    await katmaniKaydet(env.DB, { kategori: "tarla", katman: "il-fallback", guvenSkoru: 30, emsalAdet: 0 });
    expect(await katmanDagilimi(env.DB, "arsa", 7)).toHaveLength(1);
    expect((await katmanDagilimi(env.DB, "tarla", 7))[0]!.katman).toBe("il-fallback");
  });

  it("kayıt yoksa boş dizi — çağıran bunu 'sağlıklı' saymalı", async () => {
    const env = createMockEnv();
    expect(await katmanDagilimi(env.DB, "arsa", 7)).toEqual([]);
  });
});

/**
 * GİZLİLİK SÖZLEŞMESİ — asıl korunan şey.
 *
 * Bu tabloda parsel kimliği, koordinat, fiyat, kullanıcı kimliği OLMAMALI.
 * Cevaplanan soru ("hangi katman ne sıklıkta") için hiçbiri gerekmiyor ve
 * toplanmayan veri sızdırılamaz. Şema değişip böyle bir kolon eklenirse bu
 * test kırılır ve o an bilinçli bir karar vermeyi zorlar.
 */
describe("katman telemetrisi — gizlilik", () => {
  it("şemada konum/fiyat/kimlik kolonu YOK", async () => {
    const env = createMockEnv();
    await katmaniKaydet(env.DB, { kategori: "arsa", katman: "spatial-radius", guvenSkoru: 85, emsalAdet: 7 });
    const r = await env.DB.prepare(`SELECT * FROM fiyat_katman_gunluk LIMIT 1`).first<Record<string, unknown>>();
    const kolonlar = Object.keys(r ?? {});
    expect(kolonlar.sort()).toEqual(
      ["adet", "emsal_bandi", "gun", "guven_bandi", "kategori", "katman"],
    );
    for (const yasak of ["lat", "lng", "parsel", "ada", "fiyat", "kullanici", "ip", "email"]) {
      expect(kolonlar.some((k) => k.includes(yasak)), `yasak kolon: ${yasak}`).toBe(false);
    }
  });

  /** Gün çözünürlüğü — saat tutmak tek bir sorgunun izini bırakırdı. */
  it("zaman damgası GÜN çözünürlüğünde", async () => {
    const env = createMockEnv();
    await katmaniKaydet(env.DB, { kategori: "arsa", katman: "spatial-radius", guvenSkoru: 85, emsalAdet: 7 });
    const r = await env.DB.prepare(`SELECT gun FROM fiyat_katman_gunluk LIMIT 1`).first<{ gun: string }>();
    expect(r?.gun).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

/**
 * SAĞLIK KONTROLÜ — zayıf katmanın payı görünür olmalı.
 *
 * `il-fallback` hiçbir emsale dayanmıyor, sabit bir il tablosu okuyor. Payı
 * büyükse kullanıcıların çoğunluğu ölçülmemiş bir sayı görüyor demektir — ve
 * M1'in kalibre aralığı o katmanı KAPSAMIYOR (tabloda yalnızca n ≥ 100 olan
 * katmanlar var), yani aralık vaadi de tutmuyor.
 */
import { pipelineHealthKontrol } from "../src/routes/pipeline-health.js";

function kontrolBul(s: { kontroller: Array<{ ad: string }> }, ad: string) {
  const k = s.kontroller.find((x) => x.ad === ad);
  if (!k) throw new Error(`Kontrol yok: ${ad}`);
  return k as { deger: number; gecti: boolean; mesaj: string };
}

const AD = "En zayıf katmanın payı (%, arsa, 7 gün)";

describe("katman dağılımı sağlık kontrolü", () => {
  it("zayıf katman baskınsa ALARM verir", async () => {
    const env = createMockEnv();
    for (let i = 0; i < 8; i++) {
      await katmaniKaydet(env.DB, { kategori: "arsa", katman: "il-fallback", guvenSkoru: 30, emsalAdet: 0 });
    }
    await katmaniKaydet(env.DB, { kategori: "arsa", katman: "spatial-radius", guvenSkoru: 85, emsalAdet: 7 });
    const k = kontrolBul(await pipelineHealthKontrol(env.DB), AD);
    expect(k.deger).toBeGreaterThan(40);
    expect(k.gecti).toBe(false);
  });

  it("sağlıklı dağılımda geçer", async () => {
    const env = createMockEnv();
    for (let i = 0; i < 9; i++) {
      await katmaniKaydet(env.DB, { kategori: "arsa", katman: "spatial-radius", guvenSkoru: 85, emsalAdet: 7 });
    }
    await katmaniKaydet(env.DB, { kategori: "arsa", katman: "il-fallback", guvenSkoru: 30, emsalAdet: 0 });
    const k = kontrolBul(await pipelineHealthKontrol(env.DB), AD);
    expect(k.gecti).toBe(true);
  });

  /**
   * Kayıt yokluğu ARIZA DEĞİL: telemetri yeni açılmış ya da trafik yok
   * olabilir. Bunu alarm saymak, gerçek alarmların değerini düşürürdü —
   * kullanıcı uyarıya güvenmeyi bırakır.
   */
  it("hiç kayıt yoksa geçer ve durumu SÖYLER", async () => {
    const env = createMockEnv();
    const k = kontrolBul(await pipelineHealthKontrol(env.DB), AD);
    expect(k.gecti).toBe(true);
    expect(k.mesaj).toContain("katman kaydı yok");
  });

  it("mesaj tüm katmanların payını gösteriyor", async () => {
    const env = createMockEnv();
    await katmaniKaydet(env.DB, { kategori: "arsa", katman: "spatial-radius", guvenSkoru: 85, emsalAdet: 7 });
    await katmaniKaydet(env.DB, { kategori: "arsa", katman: "mahalle-istatistik", guvenSkoru: 65, emsalAdet: 3 });
    const k = kontrolBul(await pipelineHealthKontrol(env.DB), AD);
    expect(k.mesaj).toContain("spatial-radius");
    expect(k.mesaj).toContain("mahalle-istatistik");
  });
});
