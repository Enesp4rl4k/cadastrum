/**
 * Korpus yakalanma tarihi — yazıp okuyunca KORUNUR.
 *
 * NEDEN: `sqlYaz` her satıra `Date.now()` basıyordu ve `sqlKayitlariYukle`
 * tarihi hiç okumuyordu. Her yazış TÜM ilanların tarihini "şimdi" yapıyordu.
 * Ölçüldü (2026-09-11): korpusun git geçmişindeki her sürümünde TEK bir tarih
 * vardı — HEAD'de 66.621 ilanın hepsi aynı anda "görülmüş". Motorun tazelik
 * ağırlığı backtest'te bu yüzden hiç çalışmadı.
 *
 * MUTASYON: emlakjet-lib.mjs sqlYaz'da `${k.yakalanma ?? now}`'u `${now}`
 * yap → "farklı tarihler korunur" testi kırılır.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sqlYaz, sqlKayitlariYukle } from "../scripts/emlakjet-lib.mjs";

type Kayit = {
  id: string; ilN: string; ilceN: string; mahN: string | null; tlm2: number; m2: number;
  kategori: string; lat: number | null; lng: number | null; baslik: string | null; yakalanma?: number;
};

function kayit(id: string, yakalanma?: number): Kayit {
  return {
    id, ilN: "istanbul", ilceN: "catalca", mahN: "merkez", tlm2: 1000, m2: 500,
    kategori: "arsa", lat: null, lng: null, baslik: null, yakalanma,
  };
}

const HAZIRAN = Date.UTC(2026, 5, 14);
const AGUSTOS = Date.UTC(2026, 7, 29);

describe("korpus yakalanma tarihi", () => {
  it("farklı tarihler yazıp okuyunca KORUNUR — hepsi 'şimdi' olmaz", () => {
    const d = mkdtempSync(join(tmpdir(), "korpus-tarih-"));
    try {
      const yol = join(d, "k.sql");
      sqlYaz([kayit("1000001", HAZIRAN), kayit("1000002", AGUSTOS)], yol, "test");
      const geri = sqlKayitlariYukle(yol) as Kayit[];
      const t = Object.fromEntries(geri.map((k) => [k.id, k.yakalanma]));
      expect(t["1000001"]).toBe(HAZIRAN);
      expect(t["1000002"]).toBe(AGUSTOS);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("İKİNCİ yazışta da korunur — tarayıcının resume döngüsü (yükle → yaz)", () => {
    const d = mkdtempSync(join(tmpdir(), "korpus-tarih-"));
    try {
      const yol = join(d, "k.sql");
      sqlYaz([kayit("1000001", HAZIRAN)], yol, "test");
      const bir = sqlKayitlariYukle(yol) as Kayit[];
      sqlYaz(bir, yol, "test");
      const iki = sqlKayitlariYukle(yol) as Kayit[];
      expect(iki[0]!.yakalanma).toBe(HAZIRAN);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("yeni (tarihsiz) kayıt yazıldığı anı alır — ilk görülme", () => {
    const d = mkdtempSync(join(tmpdir(), "korpus-tarih-"));
    try {
      const yol = join(d, "k.sql");
      const once = Date.now();
      sqlYaz([kayit("1000003")], yol, "test");
      const geri = sqlKayitlariYukle(yol) as Kayit[];
      expect(geri[0]!.yakalanma).toBeGreaterThanOrEqual(once);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("aynı ilan iki dosyada: EN ESKİ tarih kazanır", () => {
    const d = mkdtempSync(join(tmpdir(), "korpus-tarih-"));
    try {
      const a = join(d, "a.sql");
      const b = join(d, "b.sql");
      sqlYaz([kayit("1000004", AGUSTOS)], a, "test");
      sqlYaz([kayit("1000004", HAZIRAN)], b, "test");
      const geri = sqlKayitlariYukle(a, b) as Kayit[];
      expect(geri[0]!.yakalanma).toBe(HAZIRAN);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("gerçek korpus formatındaki satırı okur (başlıklı ve başlıksız)", () => {
    const d = mkdtempSync(join(tmpdir(), "korpus-tarih-"));
    try {
      const yol = join(d, "k.sql");
      writeFileSync(yol,
        "INSERT OR IGNORE INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, fiyat_per_m2, m2, kategori, para_birimi, yakalanma_tarihi, lat, lng, koord_kaynagi, baslik, aktif) VALUES\n" +
        "('emlakjet','ej_2000001','istanbul','catalca','merkez',1000,500,'arsa','TL',1785568758019,41.1,28.4,'mahalle-merkez','Satılık Arsa (Acil)',1),\n" +
        "('emlakjet','ej_2000002','istanbul','catalca',NULL,900,700,'tarla','TL',1788257379461,NULL,NULL,NULL,1);\n");
      const geri = sqlKayitlariYukle(yol) as Kayit[];
      const t = Object.fromEntries(geri.map((k) => [k.id, k]));
      expect(t["2000001"]!.yakalanma).toBe(1785568758019);
      expect(t["2000001"]!.lat).toBe(41.1);
      expect(t["2000001"]!.baslik).toBe("Satılık Arsa (Acil)");
      expect(t["2000002"]!.yakalanma).toBe(1788257379461);
      expect(t["2000002"]!.lat).toBeNull();
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
