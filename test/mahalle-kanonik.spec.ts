/**
 * Kanonik mahalle çözümü — toplanmış ama eşleşmeyen emsalin kurtarılması.
 *
 * Korpusun %12,9'u (5.211 ilan) kanonik listeye oturmayan bir mahalle_norm
 * taşıyordu; en büyük tek sınıf bileşik adların bitişik yazılması. Bu emsal
 * toplanmış, diske yazılmış, tekrar tekrar taranmıştı — ama motor onları
 * hiçbir mahalleyle eşleştiremediği için hiç kullanılmıyordu.
 */
import { describe, it, expect } from "vitest";
import { mahalleKanonik, kanonikIndeksBoyutu } from "../src/lib/data/mahalle-kanonik";
import { mahalleKeyOlustur } from "../src/lib/baseline-engine";
import { MERKEZ_TUPLES } from "../src/lib/data/mahalle-merkezleri";

describe("mahalleKanonik", () => {
  it("zaten kanonik olan anahtarı olduğu gibi döner", () => {
    const kanonik = Object.keys(MERKEZ_TUPLES).find((k) => k.includes(" "))!;
    expect(mahalleKanonik(kanonik)).toBe(kanonik);
  });

  /**
   * Somut vaka: adana/pozanti'da 442 ilan "yenikonacik" mahallesindeydi;
   * kanonik ad "yeni konacik". Tek bir mahallede 442 ilanlık emsal havuzu
   * boşa gidiyordu — üstelik o mahalle havuz eşiğini fazlasıyla aşıyor.
   */
  it("bitişik yazılmış bileşik adı kanonik hâline çevirir", () => {
    expect(mahalleKanonik("adana__pozanti__yenikonacik")).toBe("adana__pozanti__yeni konacik");
    expect(mahalleKanonik("adana__pozanti__eskikonacik")).toBe("adana__pozanti__eski konacik");
  });

  it("eşleşme yoksa null döner — uydurmaz", () => {
    expect(mahalleKanonik("adana__pozanti__boyle bir yer yok")).toBeNull();
    // "merkez kaytazdere" → "kaytazdere" boşluk sorunu DEĞİL (fazladan önek).
    // Tahminle eşleştirmek yanlış mahalleye emsal yazma riski taşır.
    expect(mahalleKanonik("yalova__altinova__merkez kaytazdere")).toBeNull();
  });

  it("başka ilçenin mahallesine sızmaz", () => {
    const kanonik = mahalleKanonik("adana__pozanti__yenikonacik")!;
    expect(kanonik.startsWith("adana__pozanti__")).toBe(true);
  });

  it("indeks boş değil — kurtarılacak mahalle var", () => {
    expect(kanonikIndeksBoyutu()).toBeGreaterThan(100);
  });
});

describe("mahalleKeyOlustur kanonik çözümü kullanır", () => {
  it("bitişik yazılmış adı kanonik anahtara çevirir", () => {
    const key = mahalleKeyOlustur("Adana", "Pozantı", "Yenikonacık");
    expect(key).toBe("adana__pozanti__yeni konacik");
  });

  it("çözülen anahtar MERKEZ_TUPLES'ta gerçekten var (koordinat kurtarıldı)", () => {
    const key = mahalleKeyOlustur("Adana", "Pozantı", "Yenikonacık")!;
    expect(MERKEZ_TUPLES[key]).toBeDefined();
  });

  it("eşleşmeyen adı ham hâliyle döner — veri kaybetmez", () => {
    // Çözemediğimizde eskisi gibi davranıyoruz; kurtarma bir iyileştirme,
    // yeni bir başarısızlık yolu değil.
    // NOT: "Mahalle/Mahallesi" eki normalizeYerAdi tarafindan zaten atiliyor,
    // o yuzden burada ek icermeyen bir ad kullaniliyor.
    const key = mahalleKeyOlustur("Adana", "Pozantı", "Olmayan Yer");
    expect(key).toBe("adana__pozanti__olmayan yer");
  });

  it("eksik alanla null döner (mevcut davranış korunuyor)", () => {
    expect(mahalleKeyOlustur("Adana", "Pozantı", null)).toBeNull();
    expect(mahalleKeyOlustur(null, "Pozantı", "Merkez")).toBeNull();
  });
});
