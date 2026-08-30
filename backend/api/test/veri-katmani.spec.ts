/**
 * Veri yönetim katmanı testleri.
 *
 * Regresyon bağlamı — bu modül üç somut hatayı tek yerde çözmek için var:
 *   1. koordinatAra() iki scraper'da kopyalanmıştı, ikisi de var olmayan bir
 *      tabloya sorup sessizce null dönüyordu.
 *   2. hepsiemlak INSERT'ü lat/lng kolonlarını hiç yazmıyordu.
 *   3. Rotasyon damgalanmazsa aynı hedefler sonsuza kadar seçiliyordu.
 */
import { describe, it, expect, vi } from "vitest";
import {
  mahalleKoordinatBul,
  ilanYaz,
  taramaHedefleriGetir,
  taramaDamgala,
} from "../src/lib/veri-katmani.js";

/** Sorgu SQL'ini ve bind parametrelerini yakalayan sahte D1. */
function sahteDb(cevaplar: { first?: unknown; all?: unknown; changes?: number } = {}) {
  const cagrilar: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => {
        cagrilar.push({ sql, args });
        return {
          first: async () => cevaplar.first ?? null,
          all: async () => cevaplar.all ?? { results: [] },
          run: async () => ({ meta: { changes: cevaplar.changes ?? 1 } }),
        };
      },
    }),
  };
  return { db: db as never, cagrilar };
}

describe("mahalleKoordinatBul", () => {
  it("guven >= 0.85 için mahalle-merkez etiketler", async () => {
    const { db } = sahteDb({ first: { lat: 41.1, lng: 28.0, guven: 0.92 } });
    const k = await mahalleKoordinatBul(db, "istanbul", "catalca", "nakkas");
    expect(k).toEqual({ lat: 41.1, lng: 28.0, guven: 0.92, kaynak: "mahalle-merkez" });
  });

  it("guven < 0.85 için ilce-fallback etiketler", async () => {
    // Bu ayrım kritik: düşük güvende koordinat mahallenin değil ilçenin
    // merkezi, yani bir ilçedeki tüm mahalleler aynı noktada. Spatial motor
    // bunu ayırt edemezse mesafe ağırlıkları anlamsızlaşır.
    const { db } = sahteDb({ first: { lat: 41.1, lng: 28.0, guven: 0.6 } });
    const k = await mahalleKoordinatBul(db, "istanbul", "catalca", "nakkas");
    expect(k!.kaynak).toBe("ilce-fallback");
  });

  it("mahalle yoksa sorgu bile atmaz", async () => {
    const { db, cagrilar } = sahteDb();
    expect(await mahalleKoordinatBul(db, "istanbul", "catalca", null)).toBeNull();
    expect(cagrilar).toHaveLength(0);
  });

  it("D1 patlarsa null döner, THROW ETMEZ", async () => {
    const patlayan = { prepare: () => { throw new Error("tablo yok"); } } as never;
    await expect(mahalleKoordinatBul(patlayan, "a", "b", "c")).resolves.toBeNull();
  });
});

describe("ilanYaz", () => {
  it("koordinat verilmemişse mahalle merkezinden çözer", async () => {
    const { db, cagrilar } = sahteDb({ first: { lat: 41.1, lng: 28.0, guven: 0.9 } });
    await ilanYaz(db, {
      kaynak: "hepsiemlak", ilanNo: "he_1", ilNorm: "istanbul", ilceNorm: "catalca",
      mahalleNorm: "nakkas", fiyatPerM2: 5000, m2: 456, kategori: "arsa",
    });
    const insert = cagrilar.find((c) => c.sql.includes("INSERT OR IGNORE INTO ilanlar"))!;
    expect(insert.args).toContain(41.1);
    expect(insert.args).toContain("mahalle-merkez");
  });

  it("verilen koordinatı EZMEZ (gerçek parsel koordinatı korunur)", async () => {
    // Zenginleştirme hattı gerçek parsel poligonundan koordinat üretiyor;
    // bunun mahalle merkeziyle ezilmesi niteliksel bir kayıp olurdu.
    const { db, cagrilar } = sahteDb({ first: { lat: 99, lng: 99, guven: 1 } });
    await ilanYaz(db, {
      kaynak: "emlakjet", ilanNo: "ej_1", ilNorm: "istanbul", ilceNorm: "catalca",
      mahalleNorm: "nakkas", fiyatPerM2: 5000, m2: 456, kategori: "arsa",
      lat: 41.5, lng: 28.5, koordKaynagi: "parsel",
    });
    const insert = cagrilar.find((c) => c.sql.includes("INSERT OR IGNORE"))!;
    expect(insert.args).toContain(41.5);
    expect(insert.args).toContain("parsel");
    expect(insert.args).not.toContain(99);
  });

  it("baslik, imar ve tapu alanlarını yazar", async () => {
    const { db, cagrilar } = sahteDb({ first: null });
    await ilanYaz(db, {
      kaynak: "hepsiemlak", ilanNo: "he_2", ilNorm: "a", ilceNorm: "b",
      mahalleNorm: null, fiyatPerM2: 100, m2: 500, kategori: "tarla",
      baslik: "Satılık Tarla", imarDurumu: "Tarla", tapuDurumu: "Hisseli Tapu",
    });
    const insert = cagrilar.find((c) => c.sql.includes("INSERT OR IGNORE"))!;
    expect(insert.args).toContain("Satılık Tarla");
    expect(insert.args).toContain("Tarla");
    expect(insert.args).toContain("Hisseli Tapu");
  });

  it("çakışmada (changes=0) false döner", async () => {
    const { db } = sahteDb({ first: null, changes: 0 });
    const ok = await ilanYaz(db, {
      kaynak: "emlakjet", ilanNo: "ej_x", ilNorm: "a", ilceNorm: "b",
      mahalleNorm: null, fiyatPerM2: 100, m2: 500, kategori: "arsa",
    });
    expect(ok).toBe(false);
  });
});

describe("taramaHedefleriGetir", () => {
  it("NULLS FIRST ile hiç taranmamışları öne alır", async () => {
    const { db, cagrilar } = sahteDb({
      all: { results: [{ il_norm: "adana", ilce_norm: "ceyhan", kategori: "arsa" }] },
    });
    const h = await taramaHedefleriGetir(db, "emlakjet", 3, "arsa");
    expect(h).toEqual([{ ilNorm: "adana", ilceNorm: "ceyhan", kategori: "arsa" }]);
    expect(cagrilar[0]!.sql).toContain("son_tarama ASC NULLS FIRST");
    expect(cagrilar[0]!.args).toEqual(["emlakjet", "arsa", 3]);
  });

  it("kategori verilmezse kaynak bazında seçer", async () => {
    const { db, cagrilar } = sahteDb({ all: { results: [] } });
    await taramaHedefleriGetir(db, "hepsiemlak", 5);
    expect(cagrilar[0]!.args).toEqual(["hepsiemlak", 5]);
  });
});

describe("taramaDamgala", () => {
  it("kategori verilmezse '_' kullanır (kaynak kategori ayrımı yapmıyorsa)", async () => {
    const { db, cagrilar } = sahteDb();
    await taramaDamgala(db, "hepsiemlak", { ilNorm: "a", ilceNorm: "b" }, 12, "tamam");
    expect(cagrilar[0]!.args[3]).toBe("_");
    expect(cagrilar[0]!.args).toContain(12);
    expect(cagrilar[0]!.args).toContain("tamam");
  });

  it("D1 patlarsa THROW ETMEZ — damga kaybı taramayı bozmamalı, ama false döner", async () => {
    const patlayan = { prepare: () => { throw new Error("x"); } } as never;
    await expect(
      taramaDamgala(patlayan, "emlakjet", { ilNorm: "a", ilceNorm: "b" }, 0, "hata"),
    ).resolves.toBe(false);
  });

  it("başarılı damga true döner — çağıran kaybı ayırt edebilir", async () => {
    const { db } = sahteDb();
    await expect(
      taramaDamgala(db, "emlakjet", { ilNorm: "a", ilceNorm: "b" }, 3, "tamam"),
    ).resolves.toBe(true);
  });

  it("bot-engel damgası son_tarama'yı İLERLETMEZ (rotasyon sırasını korur)", async () => {
    // Engellenen ilçe "tarandı" sayılırsa `son_tarama ASC NULLS FIRST` sırasında
    // en sona düşer ve bir daha bakılmaz — hepsiemlak'ta 254 ilçe böyle kayboldu.
    const { db, cagrilar } = sahteDb();
    await taramaDamgala(db, "emlakjet", { ilNorm: "a", ilceNorm: "b" }, 0, "bot-engel");
    expect(cagrilar[0]!.args[4]).toBeNull();          // son_tarama parametresi
    expect(cagrilar[0]!.sql).toContain("CASE WHEN excluded.son_durum = 'bot-engel'");

    const { db: db2, cagrilar: c2 } = sahteDb();
    await taramaDamgala(db2, "emlakjet", { ilNorm: "a", ilceNorm: "b" }, 4, "tamam");
    expect(typeof c2[0]!.args[4]).toBe("number");     // normal damgada ilerler
  });
});
