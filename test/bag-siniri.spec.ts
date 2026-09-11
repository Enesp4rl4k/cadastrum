/**
 * bağ\b hatası — "Bağ" parseli tarımsal sayılır, "Bağımsız Bölüm" sayılmaz.
 *
 * JS `\b` ASCII; "ğ" kelime karakteri değil. `/bağ\b/` saf "Bağ"ı hiç
 * eşleştirmiyor, "Bağlık"ı eşleştiriyordu. Motor bağları ARSA sayıyordu.
 * Ölçüm: data/tarimsal-mi-ayrisma-olcum.json — beş sınıflandırıcının beşi de
 * "Bağ", "BAĞ", "Kargir Ev ve Bağ"da yanılıyordu.
 *
 * MUTASYON: carpan-zinciri.ts tarımsalMi'yi eski `/tarla|bahçe|bahce|bağ\b|bag\b|zeytin/iu`
 * desenine geri al → ilk test kırılır.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { tarımsalMi, nitelikCarpani } from "../src/lib/carpan-zinciri";

describe("tarımsalMi — Türkçe sınır ve büyük harf", () => {
  it.each(["Bağ", "BAĞ", "Bağ ve Tarla", "Kargir Ev ve Bağ", "Bağlık", "Bağlar", "Bag", "ZEYTİNLİK", "TARLA", "Bahçe"])(
    "%s → tarımsal", (n) => {
      expect(tarımsalMi(n)).toBe(true);
    },
  );

  it.each(["Arsa", "Mesken", "Bağımsız Bölüm", "Mesken ve Bağımsız Bölüm", "Hisseli Arsa"])(
    "%s → tarımsal DEĞİL", (n) => {
      expect(tarımsalMi(n)).toBe(false);
    },
  );

  it("Bağ nitelik çarpanı artık 'Bilinmeyen' 0,5'e düşmüyor", () => {
    expect(nitelikCarpani("Bağ").ad).toBe("Bağ");
  });
});

describe("KORUMA — hiçbir kaynak dosyada Türkçe harf + \\b kalmadı", () => {
  it("src/ altında 'ğ\\b' (ve benzeri) regex parçası yok", () => {
    const kok = join(__dirname, "..", "src");
    const bulunan: string[] = [];
    const desen = /[ğşçüöıĞŞÇÜÖİ]\\b/;
    const gez = (d: string) => {
      for (const ad of readdirSync(d)) {
        const p = join(d, ad);
        if (statSync(p).isDirectory()) { gez(p); continue; }
        if (!/\.(ts|tsx)$/.test(ad)) continue;
        readFileSync(p, "utf8").split(/\r?\n/).forEach((l, i) => {
          // Yorumlar hatayı ANLATIYOR olabilir — yalnızca kod satırları.
          const t = l.trim();
          if (t.startsWith("*") || t.startsWith("//")) return;
          if (desen.test(l)) bulunan.push(`${p}:${i + 1}`);
        });
      }
    };
    gez(kok);
    expect(bulunan).toEqual([]);
  });
});
