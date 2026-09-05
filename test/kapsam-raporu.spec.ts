/**
 * Kapsam raporu — taramanın nereye gideceğini belirleyen sıralama.
 *
 * Bu dosyanın koruduğu tek karar: iş listesi DERİNLİĞİ önceliklendirir
 * (1-4 gözlemli mahalleler), genişliği değil. Gerekçe ölçüm:
 * arsa MAPE 1-4 emsalde %94, 5-19'da %50 — en büyük tek sıçrama orada ve
 * mahalle başına ~4 ilan istiyor. Hiç gözlemi olmayan mahalleyi eşiğe
 * çıkarmak daha çok iş isteyip daha az kazandırıyor.
 *
 * Sıralama sezgiye kayarsa (ör. "en çok boş mahallesi olan ilçe" demek)
 * tarama hacmi yine yanlış yere gider — ilk hâlde olduğu gibi.
 */
import { describe, it, expect } from "vitest";
// @ts-expect-error — .mjs script, tip tanımı yok; saf fonksiyonları test ediyoruz.
import { ilceBoslugunuHesapla, bant, HAVUZ_ESIGI, cozucuKur } from "../scripts/kapsam-raporu.mjs";

type IlceBosluk = {
  ilce: string;
  toplamMahalle: number;
  havuzlu: number;
  kismi: number;
  bos: number;
  gozlem: number;
  oncelik: number;
};

function hesapla(
  mahalleler: string[],
  adetler: Record<string, number>,
): { liste: IlceBosluk[]; ozet: { havuzlu: number; kismi: number; bos: number } } {
  return ilceBoslugunuHesapla(new Set(mahalleler), (k: string) => adetler[k]);
}

describe("kapsam raporu — bant sınıflandırması", () => {
  it("havuz eşiği motorun hatasının yarıya indiği yerde (5)", () => {
    expect(HAVUZ_ESIGI).toBe(5);
  });

  it("gözlemi olmayan mahalle 0 bandında", () => {
    expect(bant(0)).toBe("0");
  });

  it("eşiğin altındaki her şey 'kısmi' — 4 bile havuz sayılmaz", () => {
    expect(bant(1)).toBe("1-4");
    expect(bant(4)).toBe("1-4");
    expect(bant(5)).toBe("5-19");
  });
});

describe("kapsam raporu — iş listesi sıralaması", () => {
  it("kısmi mahallesi çok olan ilçe, boş mahallesi çok olandan ÖNCE gelir", () => {
    // A: 3 mahalle eşiğe yakın (her biri 1 ilan uzakta olabilir)
    // B: 50 mahalle bomboş — daha büyük görünüyor ama ilan başına kazanç düşük
    const liste = hesapla(
      [
        "il__a__m1", "il__a__m2", "il__a__m3",
        ...Array.from({ length: 50 }, (_, i) => `il__b__m${i}`),
      ],
      { "il__a__m1": 4, "il__a__m2": 3, "il__a__m3": 2 },
    ).liste;

    expect(liste[0]!.ilce).toBe("il__a");
    // B hiç kısmi mahalleye sahip değil → listeye girmiyor.
    expect(liste.find((x) => x.ilce === "il__b")).toBeUndefined();
  });

  it("zaten havuzlu olan mahalleler önceliği şişirmez", () => {
    // Bir ilçe tamamen doymuşsa yapacak iş yok; listeye girmemeli.
    const liste = hesapla(
      ["il__dolu__m1", "il__dolu__m2"],
      { "il__dolu__m1": 30, "il__dolu__m2": 12 },
    ).liste;
    expect(liste).toHaveLength(0);
  });

  it("eşit kısmi sayıda, gözlemi çok olan ilçe önde (kaynak daha verimli)", () => {
    const liste = hesapla(
      ["il__x__m1", "il__x__m2", "il__y__m1", "il__y__m2"],
      { "il__x__m1": 1, "il__x__m2": 1, "il__y__m1": 4, "il__y__m2": 4 },
    ).liste;
    expect(liste[0]!.ilce).toBe("il__y");
  });
});

describe("kapsam raporu — özet", () => {
  it("özet TÜM ilçeleri sayar, yalnızca iş listesindekileri değil", () => {
    // Bu ayrım önemli: özet filtrelenmiş listeden toplansaydı, tamamen
    // doymuş ilçeler kapsamdan düşer ve ilerleme olduğundan az görünürdü.
    const { liste, ozet } = hesapla(
      ["il__dolu__m1", "il__ac__m1", "il__ac__m2"],
      { "il__dolu__m1": 30, "il__ac__m1": 2 },
    );
    expect(liste).toHaveLength(1);          // yalnızca il__ac
    expect(ozet.havuzlu).toBe(1);           // il__dolu sayıldı
    expect(ozet.kismi).toBe(1);
    expect(ozet.bos).toBe(1);
  });

  it("hiç gözlem yoksa her mahalle boş sayılır ve iş listesi boş kalır", () => {
    const { liste, ozet } = hesapla(["il__a__m1", "il__a__m2"], {});
    expect(ozet.bos).toBe(2);
    expect(ozet.havuzlu).toBe(0);
    // Kısmi mahalle yoksa derinlik işi de yok — liste boş.
    expect(liste).toHaveLength(0);
  });
});

/**
 * MOTORLA HİZA — rapor ile motor aynı kural modülünü kullanmalı.
 *
 * Bu ayrışma sessizdir ve pahalıdır: rapor bir mahalleyi "eksik" sayarsa,
 * `--hedef-listesi` gecelik taramayı motorun ZATEN havuzlu saydığı ilçeye
 * yollar. Ölçüldü (2026-09-05): hizalama arsa havuzlu sayısını 1.389 → 1.417
 * yaptı, kanoniğe oturmayanı 113 → 85 düşürdü.
 *
 * KAPSAM SINIRI — dürüstlük notu: bu testler çözücünün DAVRANIŞINI kilitliyor,
 * `gozlemleriTopla`'nın onu çağırdığını değil. Çağrı kaldırılırsa testler geçer.
 * O yol sabit dosya okuyor; test edilebilir hâle getirmek raporu dosya
 * enjeksiyonuyla parçalamayı gerektirirdi ve kazanç bunu karşılamıyor.
 * Kural modülünün kendisi `test/mahalle-kanonik.spec.ts`'te mutasyonla
 * doğrulanmış durumda.
 */
describe("kapsam raporu — motorla aynı kanonik kurallar", () => {
  const kanonik = new Set([
    "elazig__elazig merkez__cip",
    "istanbul__catalca__yeni konacik",
    "sivas__sivas merkez__bahtiyar",
  ]);

  it("'merkez' ilçesi kanonik yazımına açılır", () => {
    // Kaynak site il merkezini kısaca "merkez" yazıyor.
    expect(cozucuKur(kanonik)("elazig__merkez__cip")).toBe("elazig__elazig merkez__cip");
  });

  it("boşluk farkı ve merkez açımı aynı kayıtta birlikte çözülür", () => {
    expect(cozucuKur(kanonik)("sivas__merkez__bahtiyar")).toBe("sivas__sivas merkez__bahtiyar");
    expect(cozucuKur(kanonik)("istanbul__catalca__yenikonacik"))
      .toBe("istanbul__catalca__yeni konacik");
  });

  /**
   * Çözülemeyen anahtar YUTULMAZ — olduğu gibi geri döner ki rapordaki
   * "kanoniğe oturmayan" sayacı onu görebilsin. Null dönmek kaydı sessizce
   * yok ederdi.
   */
  it("çözülemeyen anahtar olduğu gibi kalır, düşürülmez", () => {
    expect(cozucuKur(kanonik)("il__ilce__bilinmeyen")).toBe("il__ilce__bilinmeyen");
  });
});
