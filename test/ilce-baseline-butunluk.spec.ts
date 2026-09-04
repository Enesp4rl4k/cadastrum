/**
 * TABLO BÜTÜNLÜĞÜ — anahtarlar `normalizeYerAdi` çıktısıyla aynı biçimde mi?
 *
 * GERÇEK SORUN: `ilce-baseline.ts` aramaları `${normalizeYerAdi(il)}__${normalizeYerAdi(ilce)}`
 * ile yapıyor; o fonksiyon saf ASCII üretiyor ve boşlukları KORUYOR. Ama
 * tabloda elle yazılmış 8 anahtar bu biçime uymuyordu ve dolayısıyla HİÇBİR
 * ZAMAN eşleşemezlerdi:
 *
 *   eskisehir__tepebaси                  ← Kiril с ve и (!)
 *   eskisehir__mihalıccık                ← Türkçe ı
 *   samsun__tekkeköy                     ← Türkçe ö
 *   aydin__kuşadasi                      ← Türkçe ş
 *   aydin__söke                          ← Türkçe ö
 *   istanbul__atasehir__acıbadem         ← Türkçe ı
 *   tekirdag__marmara-ereglisi           ← tire (dosya başlığı "boşluk→tire"
 *   istanbul__atasehir__atasehir-merkez     diyordu ama normalizeYerAdi
 *                                            boşluğu korur — başlık yanlıştı)
 *
 * Hiçbir hata vermiyorlardı: arama basitçe `undefined` dönüyor ve motor bir
 * alt basamağa düşüyordu. Yani o ilçeler için elle girilmiş fiyat bilgisi
 * vardı ama kullanılmıyordu.
 *
 * Kiril harfleri özellikle öğretici: bir insanın gözüyle "tepebaси" ile
 * "tepebasi" ayırt edilemez.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeYerAdi } from "../src/lib/tkgm-api";
import { ILCE_BASELINE_ARSA, ILCE_BASELINE_TARLA, ILCE_SEMT_CARPANI } from "../src/lib/data/ilce-baseline";

const KAYNAK = join(__dirname, "..", "src", "lib", "data", "ilce-baseline.ts");

/** Anahtarın her parçası kendi normalize edilmiş hâline eşit olmalı. */
function bicimBozuk(anahtar: string): boolean {
  return anahtar.split("__").some((p) => normalizeYerAdi(p) !== p);
}

describe("ilce-baseline anahtar biçimi", () => {
  for (const [ad, tablo] of [
    ["ILCE_BASELINE_ARSA", ILCE_BASELINE_ARSA],
    ["ILCE_BASELINE_TARLA", ILCE_BASELINE_TARLA],
    ["ILCE_SEMT_CARPANI", ILCE_SEMT_CARPANI],
  ] as const) {
    it(`${ad}: her anahtar normalizeYerAdi biçiminde`, () => {
      const bozuk = Object.keys(tablo).filter(bicimBozuk);
      expect(
        bozuk,
        bozuk.length
          ? `Bu anahtarlar HİÇBİR ZAMAN eşleşmez — arama normalizeYerAdi ` +
            `çıktısıyla yapılıyor:\n` +
            bozuk.map((k) => `  ${JSON.stringify(k)} → beklenen ` +
              JSON.stringify(k.split("__").map(normalizeYerAdi).join("__"))).join("\n")
          : "",
      ).toEqual([]);
    });
  }

  /**
   * Kaynak dosyada ASCII dışı karakter taşıyan anahtar OLMAMALI. Bu, yukarıdaki
   * testin ham metin üzerinden tekrarı: bir anahtar tablodan silinip yorumda
   * kalırsa yukarıdaki yakalamaz, bu yakalar.
   */
  it("kaynak dosyada ASCII dışı anahtar yok", () => {
    const metin = readFileSync(KAYNAK, "utf8");
    const bulunan: string[] = [];
    for (const m of metin.matchAll(/"([^"]*)":\s*[0-9_.]+/g)) {
      const k = m[1]!;
      if (!/^[\x20-\x7E]*$/.test(k)) bulunan.push(k);
    }
    expect(bulunan).toEqual([]);
  });

  it("dosya başlığı normalizeYerAdi davranışını doğru anlatıyor", () => {
    // Başlıkta "boşluk→tire" yazıyordu; normalizeYerAdi boşluğu KORUYOR.
    // Yanlış yorum, tireli anahtarların yazılmasına yol açtı.
    expect(normalizeYerAdi("Marmara Ereğlisi")).toBe("marmara ereglisi");
    expect(normalizeYerAdi("Marmara Ereğlisi")).not.toContain("-");
  });
});
