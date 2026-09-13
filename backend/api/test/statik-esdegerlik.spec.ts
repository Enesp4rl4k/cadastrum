/**
 * STATİK PAKET ↔ CANLI ROTA EŞDEĞERLİĞİ
 *
 * NEDEN: site, ziyaretçi trafiğini D1'den çıkarmak için veriyi build'de
 * /v1/statik/il/:il'den alıp statik dosya olarak sunuyor. Statik dosya canlı
 * API'den FARKLI bir şey söylerse site sessizce yanlış veri gösterir. Bu test
 * paketteki HER yanıtı, aynı saat altında canlı rotanın yanıtıyla birebir
 * karşılaştırıyor — 404'ler dahil (pakette anahtar yoksa canlı 404 dönmeli).
 *
 * Veri kasıtlı olarak zor: AI yedeğine düşen ilçe ve il, eşit ilan_adet,
 * 1-2 ve 3+ noktalı seriler, istatistiği olup ilanı 0 olan mahalle, 50'den
 * fazla mahallesi olan ilçe (LIMIT 50 ve eşitlik sırası).
 *
 * MUTASYONLAR:
 *  - statik.ts'de mahalle son 6 trendinde `.reverse()`'u kaldır → kırılır
 *  - statik.ts'de ILCE_MAHALLE_LIMIT'i 49 yap → kırılır
 *  - fiyat.ts'de ilçe mahalle sorgusundan `mahalle_norm ASC` ikincil sırasını
 *    kaldır → eşit ilan_adet'li mahalleler farklı sırada gelip kırılabilir
 *    (SQLite'a bağlı; bu mutasyon garanti kırmayabilir, not olarak duruyor)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv, MockD1Database } from "./test-helper.js";
import { ilPaketiKur, type IlPaketi } from "../src/routes/statik.js";

const SIMDI = Date.UTC(2026, 8, 13, 12, 0, 0);
const IL = "testil";

function tohumla(db: MockD1Database) {
  const q = (sql: string, ...p: unknown[]) => db.db.prepare(sql).run(...(p as never[]));

  // İlçe "merkez": gerçek istatistik, 55 mahalle (LIMIT 50), eşit ilan_adet'ler.
  q(`INSERT INTO ilce_istatistik (il_norm, ilce_norm, kategori, medyan, q1, q3, ilan_adet, son_guncelleme) VALUES (?, 'merkez', 'arsa', 5000, 4000, 6000, 300, 111)`, IL);
  for (let i = 0; i < 55; i++) {
    const ad = `mah${String(i).padStart(2, "0")}`;
    q(`INSERT INTO mahalle_istatistik (il_norm, ilce_norm, mahalle_norm, kategori, medyan, q1, q3, ortalama, ilan_adet, son_guncelleme)
       VALUES (?, 'merkez', ?, 'arsa', ?, ?, ?, ?, ?, 222)`, IL, ad, 3000 + i * 10.5, 2500, 3500, 3100.25, i % 4 === 0 ? 0 : 10 - (i % 3));
  }
  // Seriler: mah01 → 5 nokta, mah02 → 2 nokta, mah03 → 20 nokta (LIMIT 18 ve son 6)
  const seri = (mah: string, n: number, taban: number) => {
    for (let k = 0; k < n; k++) {
      const yil = 2024 + Math.floor(k / 12);
      const ay = (k % 12) + 1;
      q(`INSERT INTO mahalle_zaman_serisi (il_norm, ilce_norm, mahalle_norm, kategori, yil, ay, medyan, ilan_adet) VALUES (?, 'merkez', ?, 'arsa', ?, ?, ?, ?)`,
        IL, mah, yil, ay, taban + k * 37.5, 3 + (k % 5));
    }
  };
  seri("mah01", 5, 3000);
  seri("mah02", 2, 3200);
  seri("mah03", 20, 2800);

  // İlçe "kirsal": istatistik yok, yalnızca AI → ai-aggregate yolu. Bir mahallede hem 0 ilanlı istatistik hem AI.
  for (let i = 0; i < 7; i++) {
    q(`INSERT INTO mahalle_baseline_ai (il_norm, ilce_norm, mahalle_norm, kategori, tlm2, guven, kaynak, yakalandi) VALUES (?, 'kirsal', ?, 'arsa', ?, 40, 'knn-smoothing', 333)`,
      IL, `k${i}`, i === 3 ? 1500 : 1000 + i * 100);
  }
  q(`INSERT INTO mahalle_istatistik (il_norm, ilce_norm, mahalle_norm, kategori, medyan, q1, q3, ortalama, ilan_adet, son_guncelleme) VALUES (?, 'kirsal', 'k1', 'arsa', 999, 900, 1100, 1000, 0, 444)`, IL);

  // İlçe "yalniz": ilçe istatistiği var, mahalle satırı yok, AI de yok → ozet + boş liste.
  q(`INSERT INTO ilce_istatistik (il_norm, ilce_norm, kategori, medyan, q1, q3, ilan_adet, son_guncelleme) VALUES (?, 'yalniz', 'arsa', 5000, 1, 2, 3, 555)`, IL);
  // İlçe "ailiyalniz": ilçe istatistiği var, mahalle satırı yok, AI var → AI yanıtı tamamen değiştirir.
  q(`INSERT INTO ilce_istatistik (il_norm, ilce_norm, kategori, medyan, q1, q3, ilan_adet, son_guncelleme) VALUES (?, 'ailiyalniz', 'arsa', 7000, 1, 2, 3, 666)`, IL);
  q(`INSERT INTO mahalle_baseline_ai (il_norm, ilce_norm, mahalle_norm, kategori, tlm2, guven, kaynak, yakalandi) VALUES (?, 'ailiyalniz', 'z1', 'arsa', 2000, 10, 'ai-research', 777)`, IL);
  // il_istatistik YOK → il yanıtı: ilce_istatistik listesi dolu olduğu için AI'ye DÜŞMEZ.

  // ULAŞILAMAYAN AD: normalizeYerAdi("koy") === "" — canlı rota bu ilçeye hiçbir
  // istekle denk gelemez; paket de onu içermemeli ve saymalı.
  q(`INSERT INTO mahalle_baseline_ai (il_norm, ilce_norm, mahalle_norm, kategori, tlm2, guven, kaynak, yakalandi) VALUES (?, 'koy', 'kk', 'arsa', 1, 1, 'x', 1)`, IL);
}

async function canli(env: ReturnType<typeof createMockEnv>, yol: string) {
  const r = await app.request(yol, { method: "GET" }, env);
  return { durum: r.status, govde: await r.json() };
}

describe("statik paket ↔ canlı rota", () => {
  let env: ReturnType<typeof createMockEnv>;
  let paket: IlPaketi;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(SIMDI);
    env = createMockEnv();
    tohumla(env.DB as unknown as MockD1Database);
    paket = await ilPaketiKur(env.DB, IL, "arsa", SIMDI);
  });
  afterAll(() => vi.useRealTimers());

  it("il yanıtı birebir", async () => {
    const c = await canli(env, `/v1/fiyat/il/${IL}?kategori=arsa`);
    expect(paket.il_yaniti).toEqual(c);
  });

  it("her ilçe yanıtı birebir — ve paketteki ilçeler canlıda 200", async () => {
    const adaylar = ["merkez", "kirsal", "yalniz", "ailiyalniz", "olmayan"];
    for (const ilce of adaylar) {
      const c = await canli(env, `/v1/fiyat/ilce/${IL}/${ilce}?kategori=arsa`);
      if (paket.ilceler[ilce]) {
        expect({ ilce, ...c }).toEqual({ ilce, durum: 200, govde: paket.ilceler[ilce] });
      } else {
        expect({ ilce, durum: c.durum }).toEqual({ ilce, durum: 404 });
      }
    }
    expect(Object.keys(paket.ilceler).sort()).toEqual(["ailiyalniz", "kirsal", "merkez", "yalniz"]);
  });

  it("her mahalle yanıtı birebir — pakette olmayan mahalle canlıda 404", async () => {
    const adaylar: Array<[string, string]> = [];
    for (let i = 0; i < 55; i++) adaylar.push(["merkez", `mah${String(i).padStart(2, "0")}`]);
    for (let i = 0; i < 7; i++) adaylar.push(["kirsal", `k${i}`]);
    adaylar.push(["ailiyalniz", "z1"], ["merkez", "yok"], ["yalniz", "hic"], ["koy", "kk"]);

    let karsilastirilan = 0;
    for (const [ilce, m] of adaylar) {
      const c = await canli(env, `/v1/fiyat/mahalle/${IL}/${ilce}/${m}?kategori=arsa`);
      const p = paket.mahalleler[ilce]?.[m];
      if (p) expect({ m, ...c }).toEqual({ m, durum: 200, govde: p });
      else expect({ m, durum: c.durum }).toEqual({ m, durum: 404 });
      karsilastirilan++;
    }
    expect(karsilastirilan).toBe(adaylar.length);
  });

  it("her trend yanıtı birebir — serisi olan, olmayan (varsayılan) ve ilçesi bilinmeyen", async () => {
    const adaylar: Array<[string, string]> = [
      ["merkez", "mah01"], ["merkez", "mah02"], ["merkez", "mah03"], ["merkez", "mah10"], ["kirsal", "k1"],
    ];
    for (const [ilce, m] of adaylar) {
      const c = await canli(env, `/v1/fiyat/trend/${IL}/${ilce}/${m}?kategori=arsa`);
      const t = paket.trendler[ilce];
      const p = t ? (t.mahalle[m] ?? t.varsayilan) : null;
      if (p) expect({ ilce, m, ...c }).toEqual({ ilce, m, durum: 200, govde: p });
      else expect({ ilce, m, durum: c.durum }).toEqual({ ilce, m, durum: 404 });
    }
  });

  it("canlı rotanın ulaşamayacağı ad pakete girmez ve sayılır", () => {
    expect(paket.ilceler["koy"]).toBeUndefined();
    expect(paket.mahalleler["koy"]).toBeUndefined();
    expect(paket.erisilemeyen).toBeGreaterThanOrEqual(1);
  });

  it("harita ilçe özeti birebir", async () => {
    const c = await canli(env, `/v1/fiyat/toplu-ilce-ozet/${IL}?kategori=arsa`);
    expect({ durum: 200, govde: paket.toplu_ilce_ozet }).toEqual(c);
  });

  it("paket, D1'in çağrı başına 50 sorgu sınırının altında kalıyor", async () => {
    const say = { n: 0 };
    const db = env.DB as unknown as { prepare: (sql: string) => unknown };
    const asil = db.prepare.bind(db);
    db.prepare = (sql: string) => { say.n++; return asil(sql); };
    try {
      await ilPaketiKur(env.DB, IL, "arsa", SIMDI);
    } finally {
      db.prepare = asil;
    }
    expect(say.n).toBeLessThanOrEqual(8);
  });
});

describe("il AI yedeği — il_istatistik ve ilçe istatistiği yok", () => {
  it("il yanıtı ai-aggregate yolunda da birebir", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(SIMDI);
    try {
      const env = createMockEnv();
      const db = env.DB as unknown as MockD1Database;
      for (const [ilce, mah, t] of [["a", "x", 1234.5], ["a", "y", 999.25], ["b", "z", 5000]] as const) {
        db.db.prepare(`INSERT INTO mahalle_baseline_ai (il_norm, ilce_norm, mahalle_norm, kategori, tlm2, guven, kaynak, yakalandi) VALUES ('aiil', ?, ?, 'tarla', ?, 5, 'ai-research', 1)`).run(ilce, mah, t);
      }
      const paket = await ilPaketiKur(env.DB, "aiil", "tarla", SIMDI);
      const r = await app.request(`/v1/fiyat/il/aiil?kategori=tarla`, { method: "GET" }, env);
      expect(paket.il_yaniti).toEqual({ durum: r.status, govde: await r.json() });
      expect((paket.il_yaniti.govde as { kaynak: string }).kaynak).toBe("ai-aggregate");
    } finally {
      vi.useRealTimers();
    }
  });
});
