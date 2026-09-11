/**
 * Okuma bütçesi sayacı + "bilinmiyor" kuralı.
 *
 * NEDEN BU TESTLER VAR: `okuma_butcesi_gunluk` tablosu 2026-09-04 kesintisinden
 * sonra kuruldu ama ona YAZAN KOD hiç yazılmadı. `pipeline-health` boş tabloyu
 * okuyup `0 <= 3.500.000` ile HER KOŞUMDA yeşil döndü; 09-09'da limit yine
 * doldu, pano yine yeşildi.
 *
 * Yani asıl sınanması gereken şey "sayaç doğru topluyor mu" değil, **kapı
 * boşlukta yeşil dönüyor mu**. Aşağıdaki son iki test o soruyu soruyor.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  maliyetEkle,
  butceyiBosalt,
  gunlukButceOku,
  sayaclariOku,
  sayaclariSifirla,
} from "../src/lib/okuma-butcesi.js";

/** Yazılan satırları bellekte tutan sahte D1 — ON CONFLICT toplamasını taklit eder. */
function sahteDb() {
  const satirlar = new Map<string, {
    gun: string; kaynak: string;
    satir_okuma: number; satir_yazma: number;
    sorgu_adet: number; metasiz_adet: number; hata_adet: number;
  }>();

  const db = {
    prepare(_sql: string) {
      return {
        bind(...v: unknown[]) {
          return {
            async run() {
              const [gun, kaynak, okuma, yazma, sorgu, metasiz, hata] = v as [
                string, string, number, number, number, number, number,
              ];
              const k = `${gun}|${kaynak}`;
              const m = satirlar.get(k) ?? {
                gun, kaynak, satir_okuma: 0, satir_yazma: 0, sorgu_adet: 0, metasiz_adet: 0, hata_adet: 0,
              };
              m.satir_okuma += okuma;
              m.satir_yazma += yazma;
              m.sorgu_adet += sorgu;
              m.metasiz_adet += metasiz;
              m.hata_adet += hata;
              satirlar.set(k, m);
              return { meta: {} };
            },
            async all() {
              const gun = v[0] as string;
              const results = [...satirlar.values()]
                .filter((s) => s.gun === gun)
                .sort((a, b) => b.satir_okuma - a.satir_okuma);
              return { results, meta: {} };
            },
          };
        },
        async all() {
          return { results: [...satirlar.values()], meta: {} };
        },
      };
    },
    _satirlar: satirlar,
  } as unknown as D1Database & { _satirlar: typeof satirlar };
  return db;
}

const GUN_MS = Date.UTC(2026, 8, 11, 12, 0, 0); // 2026-09-11

describe("okuma bütçesi sayacı", () => {
  beforeEach(() => sayaclariSifirla());

  it("kaynak bazında okuma/yazma toplar", () => {
    maliyetEkle("cron-gunluk", { rows_read: 1000, rows_written: 5 });
    maliyetEkle("cron-gunluk", { rows_read: 2000, rows_written: 0 });
    maliyetEkle("cron-saatlik", { rows_read: 50, rows_written: 100 });

    const s = sayaclariOku();
    expect(s["cron-gunluk"]).toEqual({ okuma: 3000, yazma: 5, sorgu: 2, metasiz: 0, hata: 0 });
    expect(s["cron-saatlik"]).toEqual({ okuma: 50, yazma: 100, sorgu: 1, metasiz: 0, hata: 0 });
  });

  it("meta'sız çağrıyı SIFIR saymaz, `metasiz` olarak sayar", () => {
    // `first()` D1'de meta döndürmüyor. Maliyeti bilinmiyor — ama çağrının
    // olduğu biliniyor ve bu görünür kalmalı, yoksa rapor olduğundan iyi görünür.
    maliyetEkle("x", undefined);
    maliyetEkle("x", { rows_read: 10 });

    const s = sayaclariOku();
    expect(s["x"]).toEqual({ okuma: 10, yazma: 0, sorgu: 2, metasiz: 1, hata: 0 });
  });

  it("boşaltma tabloya yazar ve belleği temizler", async () => {
    const db = sahteDb();
    maliyetEkle("cron-gunluk", { rows_read: 4_000_000, rows_written: 0 });

    const yazilan = await butceyiBosalt(db, GUN_MS);
    expect(yazilan).toBe(1);
    // Bellek temizlendi — aynı sayı ikinci kez yazılmamalı.
    expect(sayaclariOku()).toEqual({});

    const butce = await gunlukButceOku(db, "2026-09-11");
    expect(butce?.toplamOkuma).toBe(4_000_000);
    expect(butce?.kaynaklar[0]?.kaynak).toBe("cron-gunluk");
  });

  it("aynı gün ikinci boşaltma ÜSTÜNE ekler, ezmez", async () => {
    const db = sahteDb();
    maliyetEkle("cron-saatlik", { rows_read: 100 });
    await butceyiBosalt(db, GUN_MS);
    maliyetEkle("cron-saatlik", { rows_read: 250 });
    await butceyiBosalt(db, GUN_MS);

    const butce = await gunlukButceOku(db, "2026-09-11");
    expect(butce?.toplamOkuma).toBe(350);
  });

  it("sayaç boşken boşaltma yazma yapmaz — gereksiz yazma bütçe yer", async () => {
    const db = sahteDb();
    expect(await butceyiBosalt(db, GUN_MS)).toBe(0);
    expect(await gunlukButceOku(db, "2026-09-11")).toBeNull();
  });

  it("KAYIT YOKSA null döner — 'sıfır tüketim' ile karıştırılamaz", async () => {
    const db = sahteDb();
    // Bu ayrım kapının tamamı: eski kod burada 0 üretiyor ve yeşil dönüyordu.
    expect(await gunlukButceOku(db, "2026-01-01")).toBeNull();
  });
});
