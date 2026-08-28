import { describe, it, expect } from "vitest";
import { emsalHavuzunuRafineEt } from "../src/lib/fiyat/outlier-engine";
import type { RawIlanGirdisi } from "../src/lib/fiyat/data-sanitizer";

describe("Veri Rafinerisi: outlier-engine", () => {
  it("karışık bir ilan havuzunu rafineden geçirip temiz havuz ve elenenleri doğru ayırır", async () => {
    const hamIlanlar: RawIlanGirdisi[] = [
      // Temiz ilan 1
      {
        ilanNo: "ilan_1",
        baslik: "Müstakil Tarla 5000m2",
        fiyatTL: 2_500_000,
        m2: 5000,
        nitelik: "Tarla",
        tarih: new Date(),
      },
      // Temiz ilan 2
      {
        ilanNo: "ilan_2",
        baslik: "Yola Cepheli Tarla",
        fiyatTL: 3_000_000,
        m2: 5000,
        nitelik: "Tarla",
        tarih: new Date(),
      },
      // Temiz ilan 3
      {
        ilanNo: "ilan_3",
        baslik: "Köy İçi Tarla",
        fiyatTL: 2_800_000,
        m2: 5000,
        nitelik: "Tarla",
        tarih: new Date(),
      },
      // Temiz ilan 4
      {
        ilanNo: "ilan_4",
        baslik: "Düz Arazi Tarla",
        fiyatTL: 2_600_000,
        m2: 5000,
        nitelik: "Tarla",
        tarih: new Date(),
      },
      // Elenecek: Hisseli / Kooperatif
      {
        ilanNo: "ilan_5",
        baslik: "Kooperatif Hobi Bahçesi Satılık",
        fiyatTL: 300_000,
        m2: 500,
        nitelik: "Tarla",
        tarih: new Date(),
      },
      // Elenecek: İstatistiksel Aşırı Yüksek Outlier
      {
        ilanNo: "ilan_6",
        baslik: "Aşırı Fiyatlı Tarla",
        fiyatTL: 50_000_000,
        m2: 5000, // 10.000 TL/m2 (diğerleri ~500-600 TL/m2 iken)
        nitelik: "Tarla",
        tarih: new Date(),
      },
    ];

    const res = await emsalHavuzunuRafineEt(hamIlanlar, "Balıkesir", "tarla");

    expect(res.istatistikler.hamAdet).toBe(6);
    expect(res.istatistikler.temizAdet).toBe(4);
    expect(res.istatistikler.elenenAdet).toBe(2);

    // Temiz havuzdaki medyan fiyat ~500-600 TL/m² civarında olmalı
    expect(res.istatistikler.medyanFiyatPerM2).toBeGreaterThanOrEqual(500);
    expect(res.istatistikler.medyanFiyatPerM2).toBeLessThanOrEqual(600);

    // Elenenlerde kooperatif ve IQR outlier olmalı
    const nedenler = res.elenenler.map((e) => e.asama);
    expect(nedenler).toContain("sanitasyon");
    expect(nedenler).toContain("istatistiksel_iqr");
  });

  it("il+ilçe+kategori bazlı gruplu IQR, farklı bölgeleri birbirine karıştırmaz", async () => {
    // Antalya arsa fiyatları (yüksek segment) ile Erzurum tarla fiyatları (düşük
    // segment) aynı çağrıya karışsa da her biri kendi grubunda IQR'a tabi olmalı.
    // Global bir IQR uygulansaydı Erzurum'un tüm değerleri Antalya'ya göre
    // "aşırı düşük outlier" sayılıp elenirdi — bu, tam olarak önlenmesi gereken hata.
    const hamIlanlar: RawIlanGirdisi[] = [
      ...[15000, 16000, 15500, 15800, 16200].map((tlm2, i): RawIlanGirdisi => ({
        ilanNo: `antalya_${i}`,
        baslik: "Müstakil Merkezi Arsa",
        fiyatTL: tlm2 * 1000,
        m2: 1000,
        nitelik: "Arsa",
        ilAd: "Antalya",
        ilceAd: "Muratpaşa",
        tarih: new Date(),
      })),
      ...[600, 650, 620, 610, 640].map((tlm2, i): RawIlanGirdisi => ({
        ilanNo: `erzurum_${i}`,
        baslik: "Müstakil Köy Tarlası",
        fiyatTL: tlm2 * 3000,
        m2: 3000,
        nitelik: "Tarla",
        ilAd: "Erzurum",
        ilceAd: "Merkez",
        tarih: new Date(),
      })),
    ];

    const res = await emsalHavuzunuRafineEt(hamIlanlar, "Antalya", "arsa");

    // Hiçbir istatistiksel eleme olmamalı — her grup kendi içinde tutarlı.
    const iqrElenen = res.elenenler.filter((e) => e.asama === "istatistiksel_iqr");
    expect(iqrElenen).toHaveLength(0);
    expect(res.istatistikler.temizAdet).toBe(10);
  });

  it("havuz istatistikleri ağırlıklıdır — güven cezalı ilanlar medyanı daha az etkiler", async () => {
    // Hisseli tapu (guvenlikCarpani ~0.65) olan ucuz bir ilan, ağırlıksız medyanı
    // aşağı çekerdi; ağırlıklı medyanda etkisi küçültülmeli.
    const temizler: RawIlanGirdisi[] = [1000, 1050, 980, 1020, 1010].map((tlm2, i): RawIlanGirdisi => ({
      ilanNo: `temiz_${i}`,
      baslik: "Müstakil Tarla",
      fiyatTL: tlm2 * 2000,
      m2: 2000,
      nitelik: "Tarla",
      ilAd: "Balıkesir",
      ilceAd: "Bandırma",
      tarih: new Date(),
    }));
    const hisseli: RawIlanGirdisi = {
      ilanNo: "hisseli_1",
      baslik: "1/4 Hisseli Tarla Fırsat",
      aciklama: "Hisse satışı yapılacaktır.",
      fiyatTL: 950 * 2000,
      m2: 2000,
      nitelik: "Tarla",
      ilAd: "Balıkesir",
      ilceAd: "Bandırma",
      tarih: new Date(),
    };

    const res = await emsalHavuzunuRafineEt([...temizler, hisseli], "Balıkesir", "tarla");
    // Hisseli ilan (950 TL/m²) kümenin içinde kaldığı için istatistiksel olarak
    // elenmez, sanitasyonda da sert red almaz (yalnızca guvenlikCarpani cezası) —
    // temiz havuzda 6 ilan olmalı.
    expect(res.istatistikler.temizAdet).toBe(6);
    // Ama düşük ağırlığı (guvenlikCarpani ≈ 0.65) yüzünden ağırlıklı medyanı aşağı
    // çekme etkisi zayıflar: ağırlıksız medyan 1000 olurdu, ağırlıklı medyan 1010'a çıkar.
    expect(res.istatistikler.medyanFiyatPerM2).toBe(1010);
  });
});
