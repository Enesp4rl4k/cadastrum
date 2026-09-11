/**
 * G3.3 ölçüm betiğinin karar mantığı.
 *
 * NEDEN: karar kuralı ölçümden ÖNCE yazıldı (GELISTIRME-PLANI-3 §G3). Bu
 * testler kuralın kodda aynen uygulandığını kilitliyor — özellikle "n < 200
 * iken karar üretme" kısmını. Küçük örneklemde iyi görünen bir sayıya bakıp
 * sonuç çıkarmak, kuralı var olduğu hâlde delmenin en kolay yolu.
 *
 * MUTASYONLAR:
 *  - KARAR_KURALI.MIN_N'i 0 yap           → "199 satışta karar ÜRETMEZ" kırılır
 *  - olcumYap'taki GERCEK_ISLEM filtresini kaldır → "'bilgi' ölçüme girmez" kırılır
 *  - ilan eşdeğerini `tahmin * (1 − indirim)` yap → "ilan eşdeğeri" testi kırılır
 */
import { describe, it, expect } from "vitest";
import { metrik, olcumYap, karar, KARAR_KURALI } from "../scripts/gercek-satis-olcum.mjs";
import type { GercekSatisSatiri } from "../scripts/gercek-satis-olcum.mjs";

function satir(ek: Partial<GercekSatisSatiri> = {}): GercekSatisSatiri {
  return {
    kategori: "tarla",
    tip: "satin-alindi",
    gercek_per_m2: 1000,
    heuristic_per_m2: 1000,
    baseline_kaynak: "ilanGozlem-mahalle",
    uygulanan_indirim: 0.12,
    ...ek,
  };
}

/** n adet, APE'leri dağıtılmış gerçekçi satır — sızıntı alarmına takılmasın. */
function dagitik(n: number, isabetOrani: number): GercekSatisSatiri[] {
  const out: GercekSatisSatiri[] = [];
  const isabetli = Math.round(n * isabetOrani);
  for (let i = 0; i < n; i++) {
    // İsabetliler %15 sapma (±%20 içinde), diğerleri %45 sapma.
    const sapma = i < isabetli ? 0.15 : 0.45;
    out.push(satir({ heuristic_per_m2: Math.round(1000 * (1 + (i % 2 ? sapma : -sapma))) }));
  }
  return out;
}

describe("karar kuralı — önceden yazılmış", () => {
  /**
   * İLK YAZIMDA BU TEST MUTASYONA DUYARSIZDI.
   *
   * Girdisini `n: KARAR_KURALI.MIN_N - 1` ile kuruyordu — yani korumaya
   * çalıştığı sabitin KENDİSİNDEN türetiyordu. MIN_N 0'a çekildiğinde n = −1
   * oluyor, `−1 < 0` yine YETERSIZ veriyor ve test mutasyonla birlikte
   * kayıyordu. P10'un tam örneği: test, ölçtüğü şeye bağlıydı.
   *
   * Kural ÖNCEDEN YAZILDI (GELISTIRME-PLANI-3 §G3) ve sayısı 200. Test o
   * sayıyı SABİT olarak taşıyor; kuralı değiştirmek bu testi kırmayı, yani
   * bir gerekçe yazmayı zorunlu kılıyor.
   */
  it("n < 200 iken KARAR ÜRETMEZ — sayı ne kadar iyi görünürse görünsün", () => {
    expect(KARAR_KURALI.MIN_N).toBe(200);
    const m = { n: 199, medyanApe: 10, within10: 40, within20: 90, medyanSapma: 0 };
    const k = karar(m, 41.8);
    expect(k.durum).toBe("YETERSIZ");
    expect(k.fark).toBeUndefined();
  });

  it("n = 200'de karar ÜRETİR — eşik kapsayıcı değil, tam sınırda", () => {
    const k = karar({ n: 200, medyanApe: 28, within10: 20, within20: 44, medyanSapma: 0 }, 41.8);
    expect(k.durum).not.toBe("YETERSIZ");
  });

  it("fark 5 puandan azsa: ilan fiyatı iyi bir vekil", () => {
    const k = karar({ n: 300, medyanApe: 28, within10: 20, within20: 44, medyanSapma: -1 }, 41.8);
    expect(k.durum).toBe("VEKIL_IYI");
    expect(k.fark).toBe(2.2);
  });

  it("fark 5 puan ve üstüyse: hedef değişmeli", () => {
    const k = karar({ n: 300, medyanApe: 18, within10: 30, within20: 55, medyanSapma: -1 }, 41.8);
    expect(k.durum).toBe("HEDEF_DEGISMELI");
  });

  it("referans yoksa uydurmaz", () => {
    expect(karar({ n: 300, medyanApe: 20, within10: 20, within20: 50, medyanSapma: 0 }, null).durum)
      .toBe("REFERANS_YOK");
  });
});

describe("olcumYap", () => {
  it("'bilgi' (duyum) ölçüme GİRMEZ — yalnızca gerçek işlemler", () => {
    const o = olcumYap([
      ...dagitik(10, 0.5),
      ...Array.from({ length: 50 }, () => satir({ tip: "bilgi" })),
    ]);
    expect(o.tarla.islemHedefli.n).toBe(10);
  });

  it("kategoriler ayrı ölçülür", () => {
    const o = olcumYap([...dagitik(6, 0.5), satir({ kategori: "arsa" })]);
    expect(o.tarla.islemHedefli.n).toBe(6);
    expect(o.arsa.islemHedefli.n).toBe(1);
  });

  it("ilan eşdeğeri = tahmin / (1 − indirim) — iskontoyu GERİ ekler", () => {
    // Motor 880 dedi (iskontolu, %12). İlan eşdeğeri 1000. Gerçek 1000.
    // → iskontolu tahmin %12 düşük, ilan eşdeğeri tam isabet.
    const o = olcumYap([satir({ heuristic_per_m2: 880, gercek_per_m2: 1000, uygulanan_indirim: 0.12 })]);
    expect(o.tarla.iskontoTesti.iskontolu.medyanSapma).toBe(-12);
    expect(o.tarla.iskontoTesti.ilanEsdegeri.medyanSapma).toBe(0);
  });

  it("MÜKEMMEL SKOR ALARMDIR — gerçek kolon tahminden türetilmişse durur (P9)", () => {
    // Tahmin = gerçek, 150 kayıt: gerçek piyasada imkânsız.
    const sahte = Array.from({ length: 150 }, () => satir({ heuristic_per_m2: 1000, gercek_per_m2: 1000 }));
    expect(() => olcumYap(sahte)).toThrow(/SIZINTI/);
  });
});

describe("metrik", () => {
  it("ortalama bias ÜRETMEZ — yalnızca medyan sapma", () => {
    const m = metrik([{ tahmin: 500, gercek: 100 }, { tahmin: 100, gercek: 100 }, { tahmin: 90, gercek: 100 }]);
    expect(m).not.toHaveProperty("bias");
    // Sapmalar +400, 0, −10 → medyan 0. Ortalama olsaydı +130 çıkardı.
    expect(m.medyanSapma).toBe(0);
  });
});
