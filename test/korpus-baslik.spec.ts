/**
 * BAŞLIK GİDİŞ-DÖNÜŞÜ — kolon eklemek tek başına yetmez.
 *
 * NEDEN BU DOSYA VAR: `sqlYaz` dosyanın tamamını bellekteki diziden yeniden
 * yazıyor. Yani `sqlKayitlariYukle` bir kolonu geri OKUMUYORSA, o kolon bir
 * sonraki resume koşumunda SESSİZCE SİLİNİR. Korpustaki koordinatları %3,9'a
 * düşüren mekanizma tam olarak buydu; başlık aynı tuzağa düşmesin diye
 * sözleşme burada kilitleniyor.
 *
 * BAŞLIK NEDEN DEĞERLİ (2026-09-06 ölçümü, üretim n=1.235): başlıktan
 * çıkarılan segment, ilçe içi arsa fiyat varyansının %50,5'ini açıklıyor —
 * imar_durumu'nun (%61,3) neredeyse dengi ama SIFIR ek istekle, çünkü kaynak
 * onu zaten liste JSON-LD'sinde veriyor. "Satılık Arsa" ilan tipiyle gelen bir
 * kayıt başlığında "Zeytinlik" diyebiliyor: arsa medyanı 5.500, zeytinlik 945.
 *
 * MUTASYON: `sqlKayitlariYukle`'de `baslik` alanı kaldırılırsa ilk test kırılır.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error — .mjs script, tip tanımı yok.
import { sqlYaz, sqlKayitlariYukle } from "../scripts/emlakjet-lib.mjs";

interface Kayit {
  id: string; ilN: string; ilceN: string; mahN: string | null;
  tlm2: number; m2: number; kategori: string;
  lat: number | null; lng: number | null; baslik: string | null;
}

function kayit(over: Partial<Kayit> = {}): Kayit {
  return {
    id: "1234567", ilN: "mugla", ilceN: "milas", mahN: "gulluk",
    tlm2: 5000, m2: 293, kategori: "arsa",
    lat: 37.1, lng: 27.5, baslik: "Satılık Zeytinlik", ...over,
  };
}

function gidipGel(kayitlar: Kayit[]): Kayit[] {
  const dizin = mkdtempSync(join(tmpdir(), "korpus-baslik-"));
  const yol = join(dizin, "veri.sql");
  try {
    sqlYaz(kayitlar, yol, "test");
    return sqlKayitlariYukle(yol) as Kayit[];
  } finally {
    rmSync(dizin, { recursive: true, force: true });
  }
}

describe("korpus başlık gidiş-dönüşü", () => {
  it("başlık yazılıp geri okunuyor — resume onu SİLMİYOR", () => {
    const [geri] = gidipGel([kayit({ baslik: "Satılık Zeytinlik" })]);
    expect(geri?.baslik).toBe("Satılık Zeytinlik");
  });

  /** SQL kaçışı: kesme işareti başlıklarda yaygın ve satırı bozabilir. */
  it("kesme işareti içeren başlık bozulmadan dönüyor", () => {
    const ad = "Deniz'e Yakın Bafa'da Arsa";
    const [geri] = gidipGel([kayit({ baslik: ad })]);
    expect(geri?.baslik).toBe(ad);
  });

  it("başlığı olmayan kayıt null dönüyor, satır bozulmuyor", () => {
    const [geri] = gidipGel([kayit({ baslik: null, lat: null, lng: null })]);
    expect(geri?.baslik).toBeNull();
    expect(geri?.tlm2).toBe(5000);
  });

  it("başlık eklemek koordinat gidiş-dönüşünü bozmuyor", () => {
    const [geri] = gidipGel([kayit({ lat: 37.1, lng: 27.5 })]);
    expect(geri?.lat).toBe(37.1);
    expect(geri?.lng).toBe(27.5);
  });

  /**
   * ESKİ BİÇİM — mevcut korpusun 65.911 satırı başlık kolonu OLMADAN yazılmış.
   * Regex ikisini de tanımazsa resume tüm korpusu göremez ve tarayıcı her şeyi
   * yeniden toplamaya kalkar.
   */
  it("başlık kolonu olmayan ESKİ satırlar hâlâ okunuyor", () => {
    const dizin = mkdtempSync(join(tmpdir(), "korpus-eski-"));
    const yol = join(dizin, "eski.sql");
    try {
      const fs = require("node:fs") as typeof import("node:fs");
      fs.writeFileSync(
        yol,
        "INSERT OR IGNORE INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, " +
        "mahalle_norm, fiyat_per_m2, m2, kategori, para_birimi, yakalanma_tarihi, " +
        "lat, lng, koord_kaynagi, aktif) VALUES\n" +
        "('emlakjet','ej_777','mugla','milas','bafa',900,26000,'arsa','TL'," +
        "1788600000000,37.5,27.4,'mahalle-merkez',1);\n",
        "utf8",
      );
      const geri = sqlKayitlariYukle(yol) as Kayit[];
      expect(geri).toHaveLength(1);
      expect(geri[0]?.tlm2).toBe(900);
      expect(geri[0]?.lat).toBe(37.5);
      expect(geri[0]?.baslik).toBeNull();
    } finally {
      rmSync(dizin, { recursive: true, force: true });
    }
  });

  /**
   * İKİ DOSYADA AYNI ID: başlığı OLAN kayıt kazanmalı. Koordinatta aynı koruma
   * var ve sebebi ölçülmüştü (koordinatsız ikinci dosya 369 kaydı eziyordu).
   */
  it("aynı id iki kez geçerse başlığı olan kazanır", () => {
    const geri = gidipGel([
      kayit({ id: "999", baslik: "Satılık Bağ" }),
      kayit({ id: "999", baslik: null }),
    ]);
    expect(geri).toHaveLength(1);
    expect(geri[0]?.baslik).toBe("Satılık Bağ");
  });
});
