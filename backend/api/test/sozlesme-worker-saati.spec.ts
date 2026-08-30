/**
 * SÖZLEŞME TESTİ — Cloudflare Workers global saati.
 *
 * NEDEN: Workers, modül seviyesindeki (global kapsam) kodu çalıştırırken saati
 * İLERLETMEZ. Orada `Date.now()` **0** döner. Yani:
 *
 *     const YIL_MAX = new Date().getFullYear();   // modül seviyesi → 1970
 *
 * Üretimde tam olarak bu vardı ve iki endpoint'i tamamen ölü bıraktı:
 *
 *     GET /v1/harita/analiz?ilceKodu=118&analizTip=1&yil=2024
 *       → 400 {"error":"yil 2003–1970 arasında olmalı"}
 *     GET /v1/proxy/tkgm-analiz?analizTip=1&yil=2024&ilceKodu=118
 *       → 400 {"error":"yil 2003–1970 arasında olmalı"}
 *
 * Yıl verilmediğinde de varsayılan `YIL_MAX - 1` = 1969 sorgulanıyor, sonuç hep
 * boş dönüyordu. Veri D1'de duruyordu; yalnızca erişilemiyordu.
 *
 * Bu hatanın sinsiliği: hata mesajı sebebi AÇIKÇA yazıyordu ("1970") ama
 * kimse o endpoint'e bakmadı — testi olmadığı için de CI hiç sormadı.
 *
 * NASIL TAKLİT EDİLİYOR: modül grafiği sıfırlanıp saat 0'a alınıyor, modül O
 * ANDA import ediliyor (Workers'ın global kapsamı değerlendirmesi), sonra saat
 * gerçek zamana dönüyor (ilk isteğin gelmesi). Sabit modül seviyesindeyse 1970
 * olarak donar ve testler kırılır.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createMockEnv } from "./test-helper.js";

const GERCEK_YIL = new Date().getFullYear();

/** Workers başlangıcını taklit ederek app'i yeniden yükler. */
async function donmusSaatleYukle() {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(0);            // global kapsam: saat 0 (= 1970)
  const mod = await import("../src/index.js");
  vi.setSystemTime(Date.UTC(GERCEK_YIL, 6, 1)); // ilk istek: saat ilerledi
  return mod.app;
}

beforeEach(() => { vi.useRealTimers(); });
afterEach(() => { vi.useRealTimers(); vi.resetModules(); });

describe("Workers global saati modül seviyesinde donuk (Date.now() = 0)", () => {
  it("/v1/harita/analiz geçerli yılı REDDETMEZ", async () => {
    const app = await donmusSaatleYukle();
    const env = createMockEnv();

    const res = await app.request(
      `/v1/harita/analiz?ilceKodu=118&analizTip=1&yil=${GERCEK_YIL - 2}`,
      {},
      env,
    );

    // Sabit modül seviyesinde kalırsa burada 400 + "2003–1970" gelir.
    expect(res.status).not.toBe(400);
    const govde = await res.text();
    expect(govde).not.toContain("1970");
  });

  it("/v1/proxy/tkgm-analiz geçerli yılı REDDETMEZ", async () => {
    const app = await donmusSaatleYukle();
    const env = createMockEnv();

    const res = await app.request(
      `/v1/proxy/tkgm-analiz?analizTip=1&yil=${GERCEK_YIL - 2}&ilceKodu=118`,
      {},
      env,
    );

    // Ağ çağrısına kadar gidebilir (fetch stub'lanmadı) — tek iddia: yıl
    // doğrulaması bu isteği reddetmiyor.
    if (res.status === 400) {
      expect(await res.text()).not.toContain("arasında olmalı");
    }
  });

  it("gelecekteki yıl HÂLÂ reddediliyor — sınır gerçekten uygulanıyor", async () => {
    // Üst sınırın çalıştığını da sabitliyoruz; aksi hâlde "hep kabul et" diye
    // düzeltmek de testi geçerdi.
    const app = await donmusSaatleYukle();
    const env = createMockEnv();

    const res = await app.request(
      `/v1/harita/analiz?ilceKodu=118&analizTip=1&yil=${GERCEK_YIL + 5}`,
      {},
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe("varsayılan yıl: sabit varsayım değil, VERİYE sorulur", () => {
  it("yil verilmezse D1'deki en yeni yıl kullanılır", async () => {
    // Saat düzeltilse bile `YIL_MAX - 1` varsayımı bozuktu: seed 2024'te
    // donmuşken bugünün "geçen yıl"ı 2025 sorulup boş dönerdi.
    const env = createMockEnv();
    await env.DB.prepare(
      `INSERT INTO tkgm_analiz_noktalari (ilce_kodu, analiz_tip, yil, parsel_id, enlem, boylam, sayi, seed_at)
       VALUES (118, 1, 2024, 56936339, 37.54, 37.91, 3, ?)`,
    ).bind(Date.now()).run();

    const { app } = await import("../src/index.js");
    const res = await app.request("/v1/harita/analiz?ilceKodu=118&analizTip=1", {}, env);
    expect(res.status).toBe(200);

    const j = await res.json() as { yil: number; noktalar: unknown[]; veri_var: boolean };
    expect(j.yil).toBe(2024);
    expect(j.veri_var).toBe(true);
    expect(j.noktalar).toHaveLength(1);
  });

  it("hiç seed edilmemiş tipte 'veri yok' AÇIKÇA bildirilir", async () => {
    // Yokluk kararı (Sprint B.2): boş nokta listesi ile "hiç seed edilmemiş"
    // ayrı şeyler; çağıran ayırt edebilmeli.
    const env = createMockEnv();
    const { app } = await import("../src/index.js");
    const res = await app.request("/v1/harita/analiz?ilceKodu=118&analizTip=3", {}, env);

    expect(res.status).toBe(200);
    const j = await res.json() as { veri_var: boolean; yil: number | null };
    expect(j.veri_var).toBe(false);
    expect(j.yil).toBeNull();
  });

  it("/v1/harita/ozet varsayılanı da veriye sorar", async () => {
    const env = createMockEnv();
    await env.DB.prepare(
      `INSERT INTO tkgm_analiz_ozet (ilce_kodu, analiz_tip, yil, nokta_sayisi, toplam_islem, seed_at)
       VALUES (159, 1, 2024, 3188, 4050, ?)`,
    ).bind(Date.now()).run();

    const { app } = await import("../src/index.js");
    const res = await app.request("/v1/harita/ozet?analizTip=1", {}, env);
    const j = await res.json() as { ozet: Array<{ ilce_kodu: number }> };

    expect(j.ozet).toHaveLength(1);
    expect(j.ozet[0]!.ilce_kodu).toBe(159);
  });
});
