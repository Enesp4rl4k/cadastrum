/**
 * Backend'e giden ilan payload'ının sözleşme testi.
 *
 * NEDEN: bu payload'ı kuran kod iki ayrı yerde kopyalanmıştı
 * (`background/service-worker.ts` ve `background/scraping-runtime.ts`) ve
 * kopyalar AYRIŞMIŞTI — koordinat çözümlemesi yalnızca birinde vardı. Liste
 * parser'ları koordinat üretmediği için toplu hattan gelen crowdsource ilanların
 * TAMAMI `lat = NULL` yükleniyordu ve `GET /v1/emsal/spatial` sonuçlarına hiç
 * giremiyordu: uzantı kendi topladığı veriyi göremiyordu.
 *
 * Ayrıca bu, `src/background/` altındaki kodun ilk testi. 56 spec dosyasının
 * hiçbiri `background/` ya da `content/` içinden import yapmıyordu — yani veri
 * GİRİŞ katmanının tamamı test dışıydı ve bu sınıf hataların neden fark
 * edilmediğini birebir açıklıyor.
 */
import { describe, it, expect } from "vitest";
import { ilanPayloadKur, ilanPayloadlariKur, kategoriCikar } from "../src/lib/ilan-payload";
import type { IlanBilgisi } from "../src/types/ilan";

function ilan(over: Partial<IlanBilgisi> = {}): IlanBilgisi {
  return {
    kaynak: "sahibinden",
    url: "https://www.sahibinden.com/ilan/1234567",
    baslik: "Çatalca Nakkaş'ta Satılık Arsa",
    fiyat: 2_300_000,
    fiyatStr: "2.300.000 TL",
    paraBirimi: "TL",
    m2: 456,
    il: "İstanbul",
    ilce: "Çatalca",
    mahalle: "Nakkaş",
    adaNo: null,
    parselNo: null,
    pafta: null,
    imarDurumu: null,
    ilanNo: "1234567",
    aciklamadaAdaParsel: [],
    ...over,
  } as IlanBilgisi;
}

describe("kategoriCikar", () => {
  it("başlıktaki anahtar kelimeden kategori çıkarır", () => {
    expect(kategoriCikar("Satılık Tarla")).toBe("tarla");
    expect(kategoriCikar("Zeytinlik satılık")).toBe("zeytinlik");
    expect(kategoriCikar("Hobi bahçesi")).toBe("bahce");
    expect(kategoriCikar("Müstakil ev")).toBe("konut");
  });

  it("SIRA korunuyor: tarla > bahçe > zeytinlik (iki kopyadaki davranış)", () => {
    // Birleştirme sırasında sıra bilerek DEĞİŞTİRİLMEDİ. "Zeytinlik tarla"
    // burada tarla çıkıyor; daha spesifik olanı öne almak makul görünse de
    // segment dağılımını sessizce kaydırırdı. Değişecekse ölçümle değişmeli.
    expect(kategoriCikar("Zeytinlik tarla satılık")).toBe("tarla");
    expect(kategoriCikar("Bahçeli tarla")).toBe("tarla");
    expect(kategoriCikar("Zeytin bahçesi")).toBe("bahce");
  });

  it("çıplak 'ev' alt dizesi artık konut saymıyor", () => {
    // İki kopyada da /ev/ çıplaktı ve alt dize eşleşiyordu: "devren satılık
    // arsa" KONUT sayılıyordu. Kelime sınırına çekildi.
    expect(kategoriCikar("Devren satılık arsa")).toBe("arsa");
    expect(kategoriCikar("Seviye farkı olan arsa")).toBe("arsa");
    expect(kategoriCikar("Satılık ev")).toBe("konut");
    expect(kategoriCikar("Satılık evler")).toBe("konut");
  });

  it("'kiraz' konut saymıyor — tek kopyadaki yazım hatası taşınmadı", () => {
    expect(kategoriCikar("Kiraz bahçesi satılık")).toBe("bahce");
  });

  it("başlık yoksa/tanımsızsa arsaya düşer", () => {
    expect(kategoriCikar(null)).toBe("arsa");
    expect(kategoriCikar("")).toBe("arsa");
    expect(kategoriCikar("Yatırımlık fırsat")).toBe("arsa");
  });
});

describe("ilanPayloadKur", () => {
  it("temel alanları doğru kurar", () => {
    const p = ilanPayloadKur(ilan())!;
    expect(p.kaynak).toBe("extension");
    expect(p.ilan_no).toBe("1234567");
    expect(p.fiyat_per_m2).toBe(5044);   // 2.300.000 / 456
    expect(p.m2).toBe(456);
    expect(p.para_birimi).toBe("TL");
  });

  it("BAŞLIĞI payload'a koyar", () => {
    // Regresyon: başlık yerel kategori çıkarımında kullanılıyor ama payload'a
    // konmuyordu — üretimde 530 extension ilanının hiçbirinde başlık yoktu.
    expect(ilanPayloadKur(ilan())!.baslik).toBe("Çatalca Nakkaş'ta Satılık Arsa");
  });

  it("KOORDİNAT yoksa mahalle merkezinden çözer", () => {
    // Asıl regresyon: toplu hat bunu yapmıyordu, tekil hat yapıyordu.
    const p = ilanPayloadKur(ilan())!;
    expect(p.lat).toBeTypeOf("number");
    expect(p.lng).toBeTypeOf("number");
    expect(p.koord_kaynagi).toBe("mahalle-merkez");
  });

  it("GERÇEK koordinat varsa mahalle merkezi onu EZMEZ", () => {
    // Zenginleştirme/DOM'dan gelen gerçek parsel koordinatı daha değerli;
    // mahalle merkeziyle değiştirilirse spatial emsal çözünürlüğü düşer.
    const p = ilanPayloadKur(ilan({ lat: 41.1417, lng: 28.4631, koordKaynagi: "dom" }))!;
    expect(p.lat).toBe(41.1417);
    expect(p.lng).toBe(28.4631);
    expect(p.koord_kaynagi).toBe("dom");
  });

  it("bilinmeyen mahallede koordinat UYDURMAZ", () => {
    const p = ilanPayloadKur(ilan({ mahalle: "Hiç Olmayan Mahalle 42" }))!;
    expect(p.lat).toBeUndefined();
    expect(p.koord_kaynagi).toBeUndefined();
  });

  it("koordinat yokken koord_kaynagi de yazılmaz", () => {
    // "kaynak var ama koordinat yok" tutarsız bir kayıt üretirdi.
    const p = ilanPayloadKur(ilan({ mahalle: null, koordKaynagi: "dom" }))!;
    expect(p.lat).toBeUndefined();
    expect(p.koord_kaynagi).toBeUndefined();
  });

  it("zorunlu alan eksikse null döner (sessiz kayıt yok)", () => {
    expect(ilanPayloadKur(ilan({ ilanNo: null }))).toBeNull();
    expect(ilanPayloadKur(ilan({ il: null }))).toBeNull();
    expect(ilanPayloadKur(ilan({ m2: null }))).toBeNull();
    expect(ilanPayloadKur(ilan({ fiyat: null }))).toBeNull();
  });

  it("mantıksız fiyat/m² elenir", () => {
    expect(ilanPayloadKur(ilan({ fiyat: 1, m2: 1_000_000 }))).toBeNull();      // ~0 TL/m²
    expect(ilanPayloadKur(ilan({ fiyat: 1e15, m2: 1 }))).toBeNull();           // üst sınır
  });
});

describe("ilanPayloadlariKur", () => {
  it("atlanan kayıtları SAYAR — sessizce yutmaz", () => {
    // "0 ilan gönderildi" ile "10 ilanın 10'u eksikti" farkı çağıranda
    // görünmeli; aksi hâlde bozuk parser 'veri yok' gibi raporlanır.
    const { payloadlar, atlanan } = ilanPayloadlariKur([
      ilan(),
      ilan({ ilanNo: null }),
      ilan({ ilanNo: "999", fiyat: null }),
    ]);
    expect(payloadlar).toHaveLength(1);
    expect(atlanan).toBe(2);
  });

  it("boş girdide boş sonuç", () => {
    expect(ilanPayloadlariKur([])).toEqual({ payloadlar: [], atlanan: 0 });
  });
});
