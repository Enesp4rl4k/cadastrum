/**
 * KORPUS KOORDİNAT BÜTÜNLÜĞÜ — resume koşumu koordinatları silmemeli.
 *
 * GERÇEK OLAY: `sqlKayitlariYukle` mevcut kayıtları okurken `lat: null,
 * lng: null` yazıyordu ve regex'i o kolonları hiç yakalamıyordu. Tarayıcının
 * akışı şöyle:
 *
 *   1. sqlKayitlariYukle(...)  → mevcut kayıtlar belleğe (koordinatsız)
 *   2. yeni ilanlar taranıp koordinatlarıyla eklenir
 *   3. sqlYaz(kayitlar, ...)   → DOSYANIN TAMAMINI bu diziden yeniden yazar
 *
 * Yani her resume koşumu önceki koşumların koordinatlarını siliyordu. Hiçbir
 * hata verilmiyordu: dosya büyüyor, ilan sayısı artıyor, yalnızca bir kolon
 * sessizce boşalıyordu. Ölçülen sonuç: korpusun %3,9'unda koordinat vardı
 * (1.627/41.885). Tek koşumluk hepsiemlak korpusunda %69'du — fark tam olarak
 * "kaç kez resume edildi" sorusuydu.
 *
 * Koordinatsız ilan spatial emsal motoruna hiç girmiyor, yani toplanmış veri
 * kullanılamıyordu.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error — .mjs script, tip tanımı yok.
import { sqlKayitlariYukle, sqlYaz } from "../scripts/emlakjet-lib.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const KORPUS = join(__dirname, "..", "scripts", "emlakjet-data-turkiye.sql");

interface Kayit {
  id: string;
  ilN: string;
  ilceN: string;
  mahN: string | null;
  tlm2: number;
  m2: number;
  kategori: string;
  lat: number | null;
  lng: number | null;
}

describe("sqlKayitlariYukle koordinatları korur", () => {
  it("SQL'deki lat/lng değerlerini okur — null'a çevirmez", () => {
    const kayitlar = sqlKayitlariYukle(KORPUS) as Kayit[];
    const koordlu = kayitlar.filter((k) => k.lat != null && k.lng != null);
    // Tarihsel kusur %3,9'a düşürmüştü; geri doldurma sonrası %94,1.
    // Eşik ihtiyatlı: yükleyici kolonları okumayı bırakırsa bu 0'a düşer.
    expect(koordlu.length / kayitlar.length).toBeGreaterThan(0.5);
  });

  it("okunan koordinatlar Türkiye sınırları içinde", () => {
    const kayitlar = (sqlKayitlariYukle(KORPUS) as Kayit[])
      .filter((k) => k.lat != null).slice(0, 500);
    for (const k of kayitlar) {
      expect(k.lat!).toBeGreaterThan(35);
      expect(k.lat!).toBeLessThan(43);
      expect(k.lng!).toBeGreaterThan(25);
      expect(k.lng!).toBeLessThan(45);
    }
  });

  /**
   * ASIL REGRESYON TESTİ: yükle → yaz → yükle turunda koordinat kaybı olmamalı.
   * Tarayıcının resume akışı tam olarak budur.
   */
  it("yükle→yaz→yükle turunda koordinat KAYBOLMAZ", () => {
    const dizin = mkdtempSync(join(tmpdir(), "korpus-"));
    try {
      const gecici = join(dizin, "test.sql");
      const orijinal = [
        { id: "1", ilN: "adana", ilceN: "pozanti", mahN: "yeni konacik",
          tlm2: 3200, m2: 1000, kategori: "arsa", lat: 37.4281, lng: 34.8712 },
        { id: "2", ilN: "adana", ilceN: "pozanti", mahN: "eski konacik",
          tlm2: 2350, m2: 800, kategori: "arsa", lat: null, lng: null },
      ];
      sqlYaz(orijinal, gecici, "test");

      const turBir = sqlKayitlariYukle(gecici) as Kayit[];
      expect(turBir).toHaveLength(2);
      expect(turBir.find((k) => k.id === "1")?.lat).toBeCloseTo(37.4281, 4);
      expect(turBir.find((k) => k.id === "2")?.lat).toBeNull();

      // İkinci tur — resume simülasyonu. Koordinat hâlâ orada olmalı.
      sqlYaz(turBir, gecici, "test");
      const turIki = sqlKayitlariYukle(gecici) as Kayit[];
      expect(turIki.find((k) => k.id === "1")?.lat).toBeCloseTo(37.4281, 4);
      expect(turIki.find((k) => k.id === "1")?.lng).toBeCloseTo(34.8712, 4);
    } finally {
      rmSync(dizin, { recursive: true, force: true });
    }
  });

  /**
   * Koordinatı olan her satırda `koord_kaynagi` da dolu olmalı. Bu ayrım
   * önemli: mahalle merkezi koordinatı ile gerçek parsel koordinatı aynı şey
   * değil. Backend `koord_kaynagi='parsel'` olanları ayrı sayıyor; kaynak
   * alanı boş kalırsa o ayrım kaybolur.
   */
  it("koordinatlı satırlar koord_kaynagi taşır", () => {
    const metin = readFileSync(KORPUS, "utf8");
    const koordluSatir = (metin.match(/,3[5-9]\.\d+,\d\d\.\d+,'mahalle-merkez'/g) ?? []).length;
    const kaynaksizKoord = (metin.match(/,3[5-9]\.\d+,\d\d\.\d+,NULL/g) ?? []).length;
    expect(koordluSatir).toBeGreaterThan(0);
    expect(kaynaksizKoord).toBe(0);
  });
});
