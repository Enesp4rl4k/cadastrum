/**
 * YASAL METİN TUTARLILIĞI — kayıt ve ödeme akışının dayandığı belgeler.
 *
 * NEDEN (2026-09-13 denetimi):
 *  1. Gizlilik (KVKK veri sorumlusu), Mesafeli Satış (satıcı) ve Kullanım
 *     Koşulları'nda `[İşletme Adı]`, `[Açık Adres]`, `[Numara]` şablon yer
 *     tutucuları CANLIDA yayındaydı — sözleşmenin karşı tarafı belirsizdi.
 *  2. İade modeli ikiye bölünmüştü: fiyat sayfası ve İade Politikası "7 gün
 *     ücretsiz deneme, sonra iade yok"; SSS, Mesafeli Satış ve ikinci bir
 *     kullanım sözleşmesi "7 gün koşulsuz iade" diyordu.
 *  3. İki ayrı kullanım sözleşmesi vardı: kayıt formu /kullanim-kosullari'nı,
 *     sitemap /kullanim-sartlari'nı gösteriyordu.
 *
 * Karar (kullanıcı): tek model = ücretsiz deneme + iade yok; tek sözleşme =
 * Kullanım Koşulları. Şirket henüz yok → yer tutucu yerine durum yazıyor.
 *
 * MUTASYON: sss.astro'daki iade cevabına "koşulsuz iade" geri yaz → 2. test
 * kırılır; gizlilik.astro'ya `[İşletme Adı]` geri koy → 1. test kırılır.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const SAYFALAR = join(process.cwd(), "src", "pages");
const oku = (ad: string) => readFileSync(join(SAYFALAR, ad), "utf8");

/** Kullanıcının kabul ettiği ya da ödeme öncesi okuduğu belgeler. */
const YASAL = ["gizlilik.astro", "kullanim-kosullari.astro", "mesafeli-satis.astro", "iade-iptal.astro"];

/** HTML yorumlarını at — gerekçe yorumları yer tutucunun adını anabilir. */
const yorumsuz = (s: string) => s.replace(/<!--[\s\S]*?-->/g, "");

describe("yasal belgeler", () => {
  it("şablon yer tutucusu YOK — [İşletme Adı], [Açık Adres], [Numara] …", () => {
    // Köşeli parantez içinde büyük harfle başlayan metin: şablon kalıntısı.
    const YER_TUTUCU = /\[(?:[A-ZÇĞİÖŞÜ][^\]\n]{0,40})\]/g;
    const bulunan = YASAL.flatMap((ad) =>
      (yorumsuz(oku(ad)).match(YER_TUTUCU) ?? []).map((m) => `${ad}: ${m}`),
    );
    expect(bulunan).toEqual([]);
  });

  it("iade modeli TEK — hiçbir sayfa 'koşulsuz iade' ya da gönüllü iade hakkı vaat etmiyor", () => {
    // Tüm sayfalar taranıyor: çelişki SSS gibi yasal olmayan bir sayfadan da geliyordu.
    const CELISKI = /koşulsuz iade|iade ederiz|gönüllü olarak tanıdığı\s+7\s+günlük iade/i;
    const bulunan = readdirSync(SAYFALAR, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith(".astro"))
      .filter((f) => CELISKI.test(yorumsuz(readFileSync(join(SAYFALAR, f), "utf8"))));
    expect(bulunan).toEqual([]);
  });

  it("iade politikası deneme modelini söylüyor — silinip boşalmadı", () => {
    const s = oku("iade-iptal.astro");
    expect(s).toContain("7 gün ücretsiz deneme");
    expect(s).toMatch(/iade yapılmamaktadır/);
  });
});

describe("tek kullanım sözleşmesi", () => {
  it("/kullanim-sartlari sayfası geri gelmedi, 301 ile yönleniyor", () => {
    expect(existsSync(join(SAYFALAR, "kullanim-sartlari.astro"))).toBe(false);
    const r = readFileSync(join(process.cwd(), "public", "_redirects"), "utf8");
    expect(r).toMatch(/^\/kullanim-sartlari\s+\/kullanim-kosullari\s+301/m);
  });

  it("sitemap kullanıcının kabul ettiği sözleşmeyi bildiriyor", () => {
    const s = oku("sitemap.xml.ts");
    expect(s).toContain("/kullanim-kosullari`");
    expect(s).not.toContain("/kullanim-sartlari`");
  });
});
