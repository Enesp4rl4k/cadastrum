/**
 * HUKUKİ KISIT KÖPRÜSÜ — ajan katmanının fiyat motoruna bağlanması.
 *
 * Repoda 1.754 satırlık ajan + RAG altyapısı vardı ve TAMAMI bağlanmamıştı:
 * `HukukImarAjani` mevzuattan deterministik kısıt çıkarıyor (5403 bölünemez
 * parsel, 3573 zeytinlik) ama hiçbir üretim yolu onu çağırmıyordu.
 *
 * ── BU DOSYANIN KORUDUĞU TEK KURAL ──────────────────────────────────────────
 *
 *   AJAN FİYATA DOKUNMAZ.
 *
 * Motorun çıktısı hold-out'ta koşturulabildiği için ölçülebilir. Araya fiyatı
 * oynatan bir katman girerse backtest anlamını yitirir ve regresyon kapısı
 * çöker. Ajanın değeri doğrulukta değil, mahalle medyanının söyleyemeyeceği
 * şeyi söylemesinde: bir zeytinlik 3573'e tabidir, hisseli bir tarla 5403 m.8
 * yüzünden ifraz edilemez.
 */
import { describe, it, expect } from "vitest";
import { hukukKisitlariniBul, hukukNotlari } from "../src/lib/fiyat/hukuk-kisitlari";
import type { Parsel } from "../src/types/tkgm";

function parsel(over: Partial<Parsel> = {}): Parsel {
  return {
    mahalleKodu: null, ilKodu: null, ilceKodu: null,
    adaNo: 100, parselNo: 5, alan: 25_000, nitelik: "Tarla", pafta: "",
    ilAd: "Muğla", ilceAd: "Milas", mahalleAd: "Bafa", durum: "",
    gittigiParseller: [],
    geometri: { type: "Polygon", coordinates: [[[27.4, 37.5], [27.4, 37.5], [27.4, 37.5], [27.4, 37.5]]] },
    merkezNokta: { lat: 37.5, lng: 27.4 },
    koordinatlar: [], malikSayisi: null, payBilgisi: null,
    ...over,
  } as Parsel;
}

describe("hukuki kısıt köprüsü", () => {
  it("kısıt yoksa null döner — boş uyarı üretmez", () => {
    // Müstakil, eşiğin üstünde, zeytinlik değil.
    expect(hukukKisitlariniBul(parsel({ alan: 50_000 }), "tarla")).toBeNull();
  });

  /**
   * 5403 m.8: hisseli tarla 20.000 m² altında ifraz edilemez.
   * HER İKİ ŞART birlikte gerekli — yalnızca küçük olmak yetmez.
   */
  it("hisseli + eşik altı tarla → 5403 riski", () => {
    const r = hukukKisitlariniBul(parsel({ alan: 8_000, malikSayisi: 3 }), "tarla");
    expect(r).not.toBeNull();
    expect(r!.tespitEdilenRiskler.some((x) => x.ilgiliKanun.includes("5403"))).toBe(true);
  });

  it("müstakil tarla eşik altında olsa da 5403 riski YOK", () => {
    const r = hukukKisitlariniBul(parsel({ alan: 8_000, payBilgisi: "1/1" }), "tarla");
    expect(r?.tespitEdilenRiskler.some((x) => x.ilgiliKanun.includes("5403")) ?? false).toBe(false);
  });

  /**
   * "Bilinmiyor" hâlinde risk ÜRETİLMEZ. Olmayan bir hisse uyarısı göstermek,
   * olan bir uyarıyı kaçırmaktan daha kötü: kullanıcı uyarılara güvenmeyi
   * bırakır ve gerçek olanı da atlar.
   */
  it("hisse bilgisi yoksa hisseli sayılmaz", () => {
    const r = hukukKisitlariniBul(parsel({ alan: 8_000 }), "tarla");
    expect(r?.tespitEdilenRiskler.some((x) => x.ilgiliKanun.includes("5403")) ?? false).toBe(false);
  });

  it("payBilgisi 1/1 tam mülkiyet, 1/4 hisseli sayılır", () => {
    const tam = hukukKisitlariniBul(parsel({ alan: 8_000, payBilgisi: "1/1" }), "tarla");
    const hisse = hukukKisitlariniBul(parsel({ alan: 8_000, payBilgisi: "1/4" }), "tarla");
    expect(tam?.tespitEdilenRiskler.some((x) => x.ilgiliKanun.includes("5403")) ?? false).toBe(false);
    expect(hisse!.tespitEdilenRiskler.some((x) => x.ilgiliKanun.includes("5403"))).toBe(true);
  });

  it("zeytinlik niteliği → 3573 riski", () => {
    const r = hukukKisitlariniBul(parsel({ nitelik: "Zeytinlik" }), "tarla");
    expect(r).not.toBeNull();
    expect(r!.tespitEdilenRiskler.some((x) => x.ilgiliKanun.includes("3573"))).toBe(true);
  });

  it("imar durumundan gelen zeytinlik de yakalanır", () => {
    const r = hukukKisitlariniBul(parsel({ nitelik: "Tarla" }), "tarla", "Zeytinlik");
    expect(r!.tespitEdilenRiskler.some((x) => x.ilgiliKanun.includes("3573"))).toBe(true);
  });

  /**
   * Her not KANUN ATFI taşımalı. Atıfsız hukuki iddia, bu projede ayıkladığımız
   * "sahte otorite" sınıfının ta kendisi olurdu.
   */
  it("her not kanun atfı taşır", () => {
    const r = hukukKisitlariniBul(parsel({ nitelik: "Zeytinlik", alan: 8_000, malikSayisi: 2 }), "tarla")!;
    const notlar = hukukNotlari(r);
    expect(notlar.length).toBeGreaterThan(0);
    for (const n of notlar) {
      expect(n, `atıfsız not: ${n}`).toMatch(/\d{4}/); // kanun numarası
    }
  });

  it("alanı olmayan parsel için null — uydurma girdiyle çalışmaz", () => {
    expect(hukukKisitlariniBul(parsel({ alan: 0 }), "tarla")).toBeNull();
  });
});

/**
 * MOTOR SÖZLEŞMESİ — "ajan fiyata dokunmaz" NEREDE korunuyor?
 *
 * Burada DEĞİL, ve sebebi dürüstçe yazılıyor: `fiyatTahminEt` girişi DB +
 * storage'a bağlı olduğu için node ortamında koşmuyor (bkz.
 * test/fiyat-engine.spec.ts başlığı). Onu burada mock'layarak çağırmak
 * denendi ve kırıldı.
 *
 * Kural iki yerde korunuyor:
 *
 *   1. BACKTEST KAPISI (asıl koruma). Ajan motora bağlandıktan sonra
 *      `npm run backtest:real` sayıları BİREBİR aynı kaldı — arsa ±%20 26,7 /
 *      bias 19,08, tarla 43,9 / 11,03. Ajan fiyatı oynatsaydı eşik kırılırdı.
 *      Bu, gerçek bir uçtan uca kanıt.
 *
 *   2. KÖPRÜNÜN TİPİ. `hukukKisitlariniBul` yalnızca `HukukDenetimRaporu`
 *      döndürüyor; fiyat alanlarına erişimi yok. `hukukNotlari` string[]
 *      üretiyor ve çağrı yeri `veriKalitesiNotlari.push(...)`. Fiyatı
 *      değiştirmek için önce bu imzayı değiştirmek gerekir.
 *
 * Yani kural yapısal olarak korunuyor ve ölçümle doğrulanıyor; buraya sahte
 * bir birim testi koymak koruma sanrısı yaratırdı.
 */
