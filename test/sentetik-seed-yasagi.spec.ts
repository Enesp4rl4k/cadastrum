/**
 * Depo taraması — sentetik ilan üreten bir seed dosyası geri gelmesin.
 *
 * `backend/api/test/sentetik-ilan-reddi.spec.ts` API girişini koruyor; bu test
 * ASIL vektörü koruyor. Silinen `seed-baseline-sql.mjs` API'yi hiç kullanmıyordu:
 * SQL dosyası üretip `SEED-BASELINE.bat` ile doğrudan
 * `wrangler d1 execute --remote --file=...` çalıştırıyordu. Yani şema doğrulaması,
 * route mantığı, güvenlik katmanı — hepsi atlanıyordu.
 *
 * Bu yüzden koruma dosya sisteminde olmalı: `scripts/` altında `ilanlar` tablosuna
 * yazan ve `bl_` önekli ilan numarası taşıyan bir SQL dosyası varsa test kırılır.
 *
 * Ayrıntılı gerekçe: scripts/SENTETIK-ILAN-YASAGI.md
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const SCRIPTS = join(ROOT, "scripts");

/** `ilanlar`'a yazan SQL dosyaları — seed korpusları dahil. */
function ilanSqlDosyalari(): string[] {
  if (!existsSync(SCRIPTS)) return [];
  return readdirSync(SCRIPTS)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => {
      const metin = readFileSync(join(SCRIPTS, f), "utf8");
      return /INSERT (?:OR \w+ )?INTO ilanlar/i.test(metin);
    });
}

describe("sentetik seed yasağı", () => {
  it("scripts/ altında ilanlar'a yazan SQL dosyası var (test anlamlı)", () => {
    // Güvence: tarama boş küme üzerinde çalışıp boşuna yeşil yanmasın.
    expect(ilanSqlDosyalari().length).toBeGreaterThan(0);
  });

  it("hiçbir seed dosyası bl_ önekli ilan numarası taşımaz", () => {
    const kirli: Array<{ dosya: string; adet: number; ornek: string }> = [];
    for (const f of ilanSqlDosyalari()) {
      const metin = readFileSync(join(SCRIPTS, f), "utf8");
      const eslesme = metin.match(/'bl_[^']*'/g);
      if (eslesme && eslesme.length > 0) {
        kirli.push({ dosya: f, adet: eslesme.length, ornek: eslesme[0]! });
      }
    }
    expect(
      kirli,
      kirli.length
        ? `Sentetik baseline satırı bulundu:\n` +
          kirli.map((k) => `  ${k.dosya}: ${k.adet} satır, ör. ${k.ornek}`).join("\n") +
          `\nBkz. scripts/SENTETIK-ILAN-YASAGI.md`
        : "",
    ).toEqual([]);
  });

  /**
   * Üretecin kendisi de geri gelmemeli. Dosya adı değişse bile SQL taraması
   * yakalar, ama aynı adla geri dönmesi en olası senaryo.
   */
  it("seed-baseline-sql.mjs üreteci geri gelmemiş", () => {
    expect(existsSync(join(SCRIPTS, "seed-baseline-sql.mjs"))).toBe(false);
  });

  it("gerekçe belgesi duruyor — silinirse yasak sebepsiz kalır", () => {
    expect(existsSync(join(SCRIPTS, "SENTETIK-ILAN-YASAGI.md"))).toBe(true);
  });
});
