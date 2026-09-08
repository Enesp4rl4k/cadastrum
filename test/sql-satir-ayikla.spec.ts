/**
 * SQL AYIKLAYICI — başlık kolonunun kırdığı ölçüm hattı.
 *
 * Üç okuyucu (backtest, kapsam raporu, ilçe baseline üreteci) aynı naif
 * regex'leri kullanıyordu:
 *   blok:  /INSERT OR IGNORE INTO ilanlar\s*\(([^)]*)\)\s*VALUES([^;]+);/gs
 *   satır: /\(([^()]*)\)/g
 *
 * Korpus yalnızca sayı ve yer adı taşıdığı sürece çalıştılar. `baslik` kolonu
 * eklenince ikisi de kırıldı — başlıklar hem parantez hem noktalı virgül
 * içeriyor. ÖLÇÜLDÜ: 66.621 ilanın 53.339'u okunuyordu, %20 kayıp, hiçbir
 * hata vermeden.
 *
 * Bu dosya her iki kırılganlığı da ayrı ayrı kilitliyor.
 */
import { describe, it, expect } from "vitest";
// @ts-expect-error — .mjs modül, tipleri .d.mts dosyasında.
import { sqlBloklariniAyikla, sqlSatirlariniAyikla, sqlDegerleriniAyir } from "../src/lib/data/sql-satir-ayikla.mjs";

const KOLONLAR = "kaynak, ilan_no, il_norm, fiyat_per_m2, baslik, aktif";
const blok = (satirlar: string) =>
  `INSERT OR IGNORE INTO ilanlar (${KOLONLAR}) VALUES\n${satirlar};\n`;

describe("SQL satır ayıklama", () => {
  it("düz satırları ayıklıyor", () => {
    const s = sqlSatirlariniAyikla("('a','b',1),('c','d',2)");
    expect(s).toHaveLength(2);
  });

  /**
   * ASIL KIRILGANLIK 1: başlıkta parantez.
   * Naif regex "parantez içermeyen grup" aradığı için satırı bölüyordu.
   */
  it("BAŞLIKTA PARANTEZ satırı bölmüyor", () => {
    const s = sqlSatirlariniAyikla("('a','Satılık Arsa (Acil Fırsat)',1),('b','Normal',2)");
    expect(s, "parantezli başlık satırı böldü").toHaveLength(2);
    expect(s[0]).toContain("Acil Fırsat");
  });

  it("iç içe parantezli başlık da tek satır", () => {
    const s = sqlSatirlariniAyikla("('a','Arsa ((çift)) parantez',1)");
    expect(s).toHaveLength(1);
  });

  it("SQL kaçışı ('') dizgeyi bitirmiyor", () => {
    const s = sqlSatirlariniAyikla("('a','Deniz''e Yakın (Bafa)',1),('b','X',2)");
    expect(s).toHaveLength(2);
    expect(s[0]).toContain("Deniz''e");
  });
});

describe("SQL blok ayıklama", () => {
  /**
   * ASIL KIRILGANLIK 2: başlıkta noktalı virgül.
   * `VALUES([^;]+);` bloğu ORTASINDAN kesiyordu — 256 başlık ';' içeriyordu
   * ve o blokların kalan satırları hiç görünmüyordu.
   */
  it("BAŞLIKTA NOKTALI VİRGÜL bloğu kesmiyor", () => {
    const b = sqlBloklariniAyikla(
      blok("('emlakjet','ej_1','x',100,'Acil; Sahibinden',1),\n('emlakjet','ej_2','y',200,'Normal',1)"),
    );
    expect(b).toHaveLength(1);
    expect(b[0].satirlar, "';' içeren başlık bloğu kesti").toHaveLength(2);
  });

  it("kolon adlarını doğru okuyor", () => {
    const b = sqlBloklariniAyikla(blok("('emlakjet','ej_1','x',100,'T',1)"));
    expect(b[0].kolonlar).toEqual(
      ["kaynak", "ilan_no", "il_norm", "fiyat_per_m2", "baslik", "aktif"],
    );
  });

  it("birden çok blok — her biri kendi kolon listesiyle", () => {
    const metin =
      blok("('emlakjet','ej_1','x',100,'A; B (C)',1)") +
      `INSERT OR IGNORE INTO ilanlar (kaynak, ilan_no) VALUES ('emlakjet','ej_2');\n`;
    const b = sqlBloklariniAyikla(metin);
    expect(b).toHaveLength(2);
    expect(b[1].kolonlar).toHaveLength(2);
  });

  it("`INSERT INTO` (OR IGNORE'suz) da tanınıyor", () => {
    const b = sqlBloklariniAyikla(
      `INSERT INTO ilanlar (kaynak, ilan_no) VALUES ('emlakjet','ej_9');\n`,
    );
    expect(b).toHaveLength(1);
  });
});

describe("SQL değer ayırma", () => {
  it("tırnak içindeki virgül alanı bölmüyor", () => {
    const v = sqlDegerleriniAyir("'emlakjet','Arsa, Bahçe ve Tarla',100");
    expect(v).toEqual(["emlakjet", "Arsa, Bahçe ve Tarla", "100"]);
  });

  it("kaçışlı tırnak çözülüyor", () => {
    expect(sqlDegerleriniAyir("'Deniz''e Yakın'")).toEqual(["Deniz'e Yakın"]);
  });

  it("NULL olduğu gibi kalıyor — boş dizgeden ayırt edilebilsin", () => {
    expect(sqlDegerleriniAyir("'a',NULL,''")).toEqual(["a", "NULL", ""]);
  });
});
