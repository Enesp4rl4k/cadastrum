/**
 * catch disiplini aracının kendi testi — Roadmap Sprint B.1.
 *
 * Bir lint kuralı, yanlış negatif verdiği anda değersizdir: CI yeşil kalır ve
 * kural "uygulanıyor" sanılır. Bu yüzden tarayıcının hem YAKALADIĞI hem de
 * BİLEREK GEÇTİĞİ durumlar sabitleniyor.
 *
 * Araç ayrı bir süreç olarak çalıştırılıyor (CI'da nasıl çağrılıyorsa öyle).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ARAC = join(process.cwd(), "scripts", "catch-disiplini.mjs");

let gecici: string;

/** Aracı geçici bir ağaç üzerinde çalıştırır; `src` kökü taranıyor. */
function tara(kaynak: string): { cikis: number; ciktı: string } {
  writeFileSync(join(gecici, "src", "ornek.ts"), kaynak, "utf8");
  try {
    const out = execFileSync(process.execPath, [ARAC, "--kok", gecici, "--liste"], {
      cwd: gecici,
      encoding: "utf8",
    });
    return { cikis: 0, ciktı: out };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { cikis: err.status, ciktı: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

beforeAll(() => {
  gecici = mkdtempSync(join(tmpdir(), "catch-disiplini-"));
  mkdirSync(join(gecici, "src"));
  mkdirSync(join(gecici, "scripts"));
});

afterAll(() => rmSync(gecici, { recursive: true, force: true }));

describe("ihlal sayılanlar", () => {
  it("tamamen boş catch", () => {
    expect(tara("try { f(); } catch {}").ciktı).toContain("ornek.ts");
  });

  it("yalnızca satır yorumu içeren catch", () => {
    expect(tara("try { f(); } catch (e) {\n  // sessiz\n}").ciktı).toContain("1 ihlal");
  });

  it("yalnızca blok yorumu içeren catch", () => {
    expect(tara("try { f(); } catch { /* ignore */ }").ciktı).toContain("1 ihlal");
  });

  it("gerekçesiz 'beklenen yokluk' işareti yetmez", () => {
    // İşaretin amacı sebebi yazdırmak; kuru etiket kaçış deliği olurdu.
    expect(tara("try { f(); } catch {\n  // beklenen yokluk:\n}").ciktı).toContain("1 ihlal");
  });
});

describe("ihlal SAYILMAYANLAR", () => {
  it("görünür fallback — blokta gerçek kod var", () => {
    expect(tara("try { f(); } catch { return null; }").ciktı).toContain("0 ihlal");
  });

  it("gerekçeli 'beklenen yokluk' işareti", () => {
    const k = "try { f(); } catch {\n  // beklenen yokluk: tablo isteğe bağlı\n}";
    expect(tara(k).ciktı).toContain("0 ihlal");
  });

  it("hataKaydet çağrısı", () => {
    expect(tara("try { f(); } catch (e) { hataKaydet(e); }").ciktı).toContain("0 ihlal");
  });

  it("dize içindeki 'catch {}' metni kod sanılmaz", () => {
    // Maskeleme olmasaydı bu satır hem yanlış eşleşir hem de süslü parantez
    // sayımını kaydırırdı.
    expect(tara('const s = "catch {}";\ntry { f(); } catch { g(); }').ciktı).toContain("0 ihlal");
  });

  it("regex literal'i süslü parantez sayımını KAYDIRMAZ", () => {
    // Aracın ilk sürümündeki gerçek kusur: `/\d{7,}/` içindeki `{` blok
    // derinliğini bozuyor ve dosyanın geri kalanındaki ihlaller görünmez
    // oluyordu. Sessiz hata yasağı koyan aracın kendisi sessizce bozulmuştu.
    const kaynak = ["const re = /\\d{7,}/g;", "try { f(); } catch { /* ignore */ }"].join("\n");
    expect(tara(kaynak).ciktı).toContain("1 ihlal");
  });

  it("bölme işareti regex sanılmaz", () => {
    const kaynak = ["const o = a / b;", "try { f(); } catch { g(); }"].join("\n");
    expect(tara(kaynak).ciktı).toContain("0 ihlal");
  });

  it("yorum içindeki catch bloğu sayılmaz", () => {
    expect(tara("// try { f(); } catch {}\nconst x = 1;").ciktı).toContain("0 ihlal");
  });

  it("test dosyaları kapsam dışı", () => {
    writeFileSync(join(gecici, "src", "sey.spec.ts"), "try { f(); } catch {}", "utf8");
    expect(tara("const x = 1;").ciktı).toContain("0 ihlal");
    rmSync(join(gecici, "src", "sey.spec.ts"));
  });
});

describe("baseline mandalı", () => {
  it("baseline yoksa var olan ihlal YENİ sayılır ve çıkış kodu 1 olur", () => {
    writeFileSync(join(gecici, "src", "ornek.ts"), "try { f(); } catch {}", "utf8");
    let kod = 0;
    try {
      execFileSync(process.execPath, [ARAC, "--kok", gecici], { cwd: gecici, encoding: "utf8" });
    } catch (e) {
      kod = (e as { status: number }).status;
    }
    expect(kod).toBe(1);
  });

  it("--guncelle sonrası aynı ağaç temiz geçer, bir ihlal eklenince kırılır", () => {
    execFileSync(process.execPath, [ARAC, "--kok", gecici, "--guncelle"], { cwd: gecici, encoding: "utf8" });
    expect(() =>
      execFileSync(process.execPath, [ARAC, "--kok", gecici], { cwd: gecici, encoding: "utf8" }),
    ).not.toThrow();

    writeFileSync(join(gecici, "src", "ornek.ts"), "try { f(); } catch {}\ntry { g(); } catch {}", "utf8");
    expect(() =>
      execFileSync(process.execPath, [ARAC, "--kok", gecici], { cwd: gecici, encoding: "utf8" }),
    ).toThrow();
  });

  it("ihlal AZALINCA da uyarır — kazanç baseline'a sabitlensin", () => {
    writeFileSync(join(gecici, "src", "ornek.ts"), "const x = 1;", "utf8");
    let ciktı = "";
    try {
      execFileSync(process.execPath, [ARAC, "--kok", gecici], { cwd: gecici, encoding: "utf8" });
    } catch (e) {
      const err = e as { stdout: string; stderr: string };
      ciktı = (err.stdout ?? "") + (err.stderr ?? "");
    }
    expect(ciktı).toContain("kazanç sabitlenmemiş");
  });
});

describe("Workers saat tuzağı kuralı", () => {
  it("backend/api/src altında modül seviyesinde Date.now() ihlal sayılır", () => {
    const backendDizin = join(gecici, "backend", "api", "src");
    mkdirSync(backendDizin, { recursive: true });
    writeFileSync(join(backendDizin, "tuzak.ts"), "const simdi = Date.now();\nexport function f() { return simdi; }", "utf8");

    try {
      const out = execFileSync(process.execPath, [ARAC, "--kok", gecici, "--liste"], {
        cwd: gecici,
        encoding: "utf8",
      });
      expect(out).toContain("Workers saat tuzağı");
    } finally {
      rmSync(join(gecici, "backend"), { recursive: true, force: true });
    }
  });

  it("fonksiyon içinde çağrılan Date.now() ihlal sayılmaz (güvenli kullanım)", () => {
    const backendDizin = join(gecici, "backend", "api", "src");
    mkdirSync(backendDizin, { recursive: true });
    writeFileSync(join(backendDizin, "guvenli.ts"), "export function f() {\n  const simdi = Date.now();\n  return simdi;\n}", "utf8");

    try {
      const out = execFileSync(process.execPath, [ARAC, "--kok", gecici, "--liste"], {
        cwd: gecici,
        encoding: "utf8",
      });
      expect(out).not.toContain("Workers saat tuzağı");
    } finally {
      rmSync(join(gecici, "backend"), { recursive: true, force: true });
    }
  });
});
