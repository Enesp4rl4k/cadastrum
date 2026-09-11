/**
 * /v1/gercek-satis — ölçülebilir veri toplama sözleşmesi.
 *
 * Her test, ilk sürümde gerçekten var olan bir eksiği kilitliyor. İlk sürüm
 * deploy edilmişti ama tablosu yoktu (her POST 503); tablo olsaydı bile
 * toplanan veri ölçülemezdi.
 *
 * MUTASYONLAR (her biri bir testi kırmalı):
 *  - FIYAT_SINIRI.MIN'i 500'e geri al          → "ucuz tarla kabul edilir"
 *  - normalizeYerAdi yerine .toLowerCase()     → "yer adları motorla aynı anahtara"
 *  - ON CONFLICT satırını kaldır               → "aynı kayıt iki kez sayılmaz"
 *  - /ozet'ten jwtMiddleware+adminMiddleware'i kaldır → "yetkisiz okuyamaz"
 */
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";
import { gercekSatisDogrula, FIYAT_SINIRI } from "../src/routes/gercek-satis.js";

const env = createMockEnv();

let sayac = 0;
function kimlik(): string {
  sayac++;
  return `00000000-0000-4000-8000-${String(sayac).padStart(12, "0")}`;
}

function govde(ek: Record<string, unknown> = {}) {
  return {
    istemciKimligi: kimlik(),
    ilAd: "İstanbul",
    ilceAd: "Çatalca",
    mahalleAd: "Merkez Mahallesi",
    kategori: "tarla",
    gercekPerM2: 800,
    alanBant: "5000-20000m²",
    tip: "satin-alindi",
    tahminGorulduMu: true,
    heuristicPerM2: 900,
    baselineKaynak: "ilanGozlem-mahalle",
    uygulananIndirim: 0.12,
    girisTarihi: Date.now(),
    ...ek,
  };
}

function gonder(b: unknown) {
  return app.request(
    "/v1/gercek-satis",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) },
    env,
  );
}

async function kullaniciToken(admin: boolean): Promise<string> {
  const email = `gs${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cadastrum-test.com`;
  const r = await app.request(
    "/v1/auth/kayit",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, sifre: "abcdef12" }) },
    env,
  );
  const b = (await r.json()) as { token: string };
  if (admin) {
    // adminMiddleware token'da `adm` claim'i yoksa DB'ye bakıyor.
    await env.DB.prepare("UPDATE kullanicilar SET admin = 1 WHERE email = ?").bind(email).run();
  }
  return b.token;
}

describe("gercek-satis doğrulama", () => {
  it("UCUZ TARLA KABUL EDİLİR — eski 500 TL/m² tabanı işlemlerin üçte birini atıyordu", () => {
    // Korpus: tarla medyanı 800, %36,2'si 500'ün altında. 200 TL/m²'lik bir
    // kırsal tarla sıradan bir işlem; reddetmek hold-out'u yanlı yapardı.
    const d = gercekSatisDogrula(govde({ gercekPerM2: 200 }));
    expect(d.ok).toBe(true);
    expect(FIYAT_SINIRI.MIN).toBeLessThanOrEqual(1);
  });

  it("birim hatası (1 TL/m² altı ya da 5M üstü) reddedilir", () => {
    expect(gercekSatisDogrula(govde({ gercekPerM2: 0.5 })).ok).toBe(false);
    expect(gercekSatisDogrula(govde({ gercekPerM2: 6_000_000 })).ok).toBe(false);
  });

  it("yer adları motorla AYNI anahtara normalize edilir", () => {
    // Eski sürüm .toLowerCase() yapıyordu → "çatalca". Korpus "catalca".
    const d = gercekSatisDogrula(govde());
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.veri.il).toBe("istanbul");
    expect(d.veri.ilce).toBe("catalca");
    expect(d.veri.mahalle).toBe("merkez");
  });

  it("kategorisiz ya da konut kategorili kayıt reddedilir", () => {
    expect(gercekSatisDogrula(govde({ kategori: undefined })).ok).toBe(false);
    // Motor konut üretmiyor — kıyaslanacak tahmin yok.
    expect(gercekSatisDogrula(govde({ kategori: "konut" })).ok).toBe(false);
  });

  it("geçersiz bağlam REDDETMEZ, null yazar — işlem fiyatının kendisi yine değerli", () => {
    const d = gercekSatisDogrula(govde({ baselineKaynak: "uydurma", uygulananIndirim: 1.5 }));
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.veri.baselineKaynak).toBeNull();
    expect(d.veri.uygulananIndirim).toBeNull();
  });
});

describe("POST /v1/gercek-satis", () => {
  it("geçerli kayıt 201 ile yazılır", async () => {
    const r = await gonder(govde());
    expect(r.status).toBe(201);
  });

  it("aynı kayıt İKİ KEZ SAYILMAZ — tekrar gönderim 200 + tekrar:true", async () => {
    const b = govde();
    const r1 = await gonder(b);
    const r2 = await gonder(b);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(200);
    expect(((await r2.json()) as { tekrar: boolean }).tekrar).toBe(true);

    const n = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM gercek_satislar WHERE istemci_kimligi = ?",
    ).bind(b.istemciKimligi).first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it("veritabanına NORMALİZE ad yazılır", async () => {
    const b = govde();
    await gonder(b);
    const r = await env.DB.prepare(
      "SELECT il_norm, ilce_norm FROM gercek_satislar WHERE istemci_kimligi = ?",
    ).bind(b.istemciKimligi).first<{ il_norm: string; ilce_norm: string }>();
    expect(r).toEqual({ il_norm: "istanbul", ilce_norm: "catalca" });
  });
});

describe("GET /v1/gercek-satis/ozet — yetki", () => {
  it("token'sız okuyamaz (ilk sürümde herkes okuyabiliyordu)", async () => {
    const r = await app.request("/v1/gercek-satis/ozet?il=istanbul", { method: "GET" }, env);
    expect(r.status).toBe(401);
  });

  it("admin olmayan kullanıcı okuyamaz", async () => {
    const token = await kullaniciToken(false);
    const r = await app.request(
      "/v1/gercek-satis/ozet?il=istanbul",
      { method: "GET", headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(r.status).toBe(403);
  });

  it("admin okur; az örnekli mahalle gizlenir ama SAYILIR", async () => {
    // Aynı mahalleye 3 gerçek satış (min_n) + başka bir mahalleye 1.
    for (let i = 0; i < 3; i++) {
      await gonder(govde({ mahalleAd: "Ozet Koy", gercekPerM2: 1000, heuristicPerM2: 1100 }));
    }
    await gonder(govde({ mahalleAd: "Tek Kayit", gercekPerM2: 1000 }));

    const token = await kullaniciToken(true);
    const r = await app.request(
      "/v1/gercek-satis/ozet?il=istanbul&ilce=catalca",
      { method: "GET", headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(r.status).toBe(200);
    const b = (await r.json()) as {
      ozet: Array<{ mahalle_norm: string; n: number; medyan_sapma_yuzde: number | null }>;
      gizlenen_mahalle: number;
    };
    const ozetKoy = b.ozet.find((x) => x.mahalle_norm === "ozet");
    expect(ozetKoy?.n).toBe(3);
    // MEDYAN sapma: (1100 − 1000) / 1000 = +%10
    expect(ozetKoy?.medyan_sapma_yuzde).toBe(10);
    expect(b.ozet.find((x) => x.mahalle_norm === "tek kayit")).toBeUndefined();
    expect(b.gizlenen_mahalle).toBeGreaterThanOrEqual(1);
  });
});
