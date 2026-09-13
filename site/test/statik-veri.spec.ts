/**
 * Statik veri katmanı — karar kuralı ve normalize eşdeğerliği.
 *
 * NEDEN: veri sayfaları ziyaretçi trafiğini D1'den çıkarmak için önce statik
 * dosyaya bakıyor. İki şey sessizce bozulabilir:
 *  1. Site ile backend normalizasyonu ayrışırsa statik anahtar tutmaz ve
 *     veri olan sayfa "veri yok" gösterir.
 *  2. Karar kuralı kayarsa ya veri olmayan her ziyaret yine D1'e gider
 *     (asıl amaç boşa çıkar) ya da bozuk dağıtımda site düşer.
 *
 * MUTASYONLAR:
 *  - statik-veri.ts'de `return g ? {…} : VERI_YOK` → `: null` (anahtar yoksa
 *    API'ye düş) → "manifestteki il, olmayan mahalle" testi kırılır
 *  - normalizeYerAdi'dan `koyu|koy` kelimelerini çıkar → eşdeğerlik testi kırılır
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  normalizeYerAdi,
  fiyatIstegiCoz,
  veriFetch,
  _testIcinSifirla,
  STATIK_KOK,
} from "../src/lib/statik-veri";
import { normalizeYerAdi as backendNormalize } from "../../backend/api/src/lib/normalize";

describe("normalizeYerAdi — backend ile birebir", () => {
  const ORNEKLER = [
    "İstanbul", "Çatalca", "Beşiktaş", "Bebek Mahallesi", "19 Mayıs", "Adıyaman Merkez",
    "Elâzığ", "Şanlıurfa", "Karşıyaka Mah.", "Yeniköy", "Kuzguncuk Köyü", "koy", "Ağrı",
    "Çekmeköy", "Belde", "Güzelbahçe  Mh", "Iğdır", "ÖRNEK-İLÇE", "  boşluklu   ad  ", "",
  ];
  it.each(ORNEKLER)("%s", (s) => {
    expect(normalizeYerAdi(s)).toBe(backendNormalize(s));
  });
});

describe("fiyatIstegiCoz", () => {
  const B = "https://api.example/v1";
  it("beş fiyat yolunu tanıyor, adları normalize ediyor", () => {
    expect(fiyatIstegiCoz(`${B}/fiyat/il/İstanbul?kategori=arsa`)).toEqual({ tur: "il", kategori: "arsa", il: "istanbul" });
    expect(fiyatIstegiCoz(`${B}/fiyat/ilce/istanbul/19-mayis?kategori=tarla`)).toEqual({ tur: "ilce", kategori: "tarla", il: "istanbul", ilce: "19 mayis" });
    expect(fiyatIstegiCoz(`${B}/fiyat/mahalle/istanbul/besiktas/bebek-mahallesi`)).toEqual({ tur: "mahalle", kategori: "arsa", il: "istanbul", ilce: "besiktas", mahalle: "bebek" });
    expect(fiyatIstegiCoz(`${B}/fiyat/trend/a/b/c?kategori=arsa`)).toEqual({ tur: "trend", kategori: "arsa", il: "a", ilce: "b", mahalle: "c" });
    expect(fiyatIstegiCoz(`${B}/fiyat/toplu-ilce-ozet/izmir?kategori=arsa`)).toEqual({ tur: "harita-ilce", kategori: "arsa", il: "izmir" });
  });
  it("statik karşılığı olmayanlar null: konut, toplu-ozet, başka uç, boş ad", () => {
    expect(fiyatIstegiCoz(`${B}/fiyat/il/istanbul?kategori=konut`)).toBeNull();
    expect(fiyatIstegiCoz(`${B}/fiyat/toplu-ozet?kategori=arsa`)).toBeNull();
    expect(fiyatIstegiCoz(`${B}/harita/ozet?analizTip=1`)).toBeNull();
    expect(fiyatIstegiCoz(`${B}/fiyat/ilce/istanbul/koy?kategori=arsa`)).toBeNull();
  });
});

describe("veriFetch karar kuralı", () => {
  const API = "https://api.example/v1";
  let apiCagrilari: string[];
  let dosyalar: Record<string, unknown>;
  let dosyaDurumu: Record<string, number>;

  beforeEach(() => {
    apiCagrilari = [];
    dosyaDurumu = {};
    dosyalar = {
      [`${STATIK_KOK}/manifest.json`]: { surum: 1, uretildi: 1, iller: { arsa: ["istanbul"], tarla: [] } },
      [`${STATIK_KOK}/arsa/ilce/istanbul.json`]: { besiktas: { medyan: 111, mahalleler: [] } },
      [`${STATIK_KOK}/arsa/mahalle/istanbul/besiktas.json`]: {
        mahalleler: { bebek: { medyan: 222 } },
        trend: { mahalle: { bebek: { trend: "yukseliyor" } }, varsayilan: { trend: "duruyor" } },
      },
    };
    _testIcinSifirla(async (url) => {
      const d = dosyaDurumu[url];
      if (d) return new Response("x", { status: d });
      if (url in dosyalar) return new Response(JSON.stringify(dosyalar[url]), { status: 200 });
      return new Response("yok", { status: 404 });
    });
    vi.stubGlobal("fetch", async (url: string) => {
      apiCagrilari.push(url);
      return new Response(JSON.stringify({ kaynak: "api" }), { status: 200 });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    _testIcinSifirla();
  });

  it("manifestteki il → statik cevap, API'ye gidilmez", async () => {
    const r = await veriFetch(`${API}/fiyat/mahalle/istanbul/besiktas/bebek?kategori=arsa`);
    expect(r.status).toBe(200);
    expect(r.headers.get("X-Veri-Kaynagi")).toBe("statik");
    expect(await r.json()).toEqual({ medyan: 222 });
    expect(apiCagrilari).toEqual([]);
  });

  it("manifestteki il, pakette olmayan mahalle → KESİN 404, API'ye gidilmez", async () => {
    const r = await veriFetch(`${API}/fiyat/mahalle/istanbul/besiktas/olmayan?kategori=arsa`);
    expect(r.status).toBe(404);
    const r2 = await veriFetch(`${API}/fiyat/ilce/istanbul/olmayan-ilce?kategori=arsa`);
    expect(r2.status).toBe(404);
    expect(apiCagrilari).toEqual([]);
  });

  it("trend: mahallenin serisi yoksa ilçe varsayılanı", async () => {
    const r = await veriFetch(`${API}/fiyat/trend/istanbul/besiktas/serisiz?kategori=arsa`);
    expect(await r.json()).toEqual({ trend: "duruyor" });
  });

  it("manifestte olmayan il → canlı API (eski davranış)", async () => {
    const r = await veriFetch(`${API}/fiyat/il/ankara?kategori=arsa`);
    expect(await r.json()).toEqual({ kaynak: "api" });
    expect(apiCagrilari).toHaveLength(1);
  });

  it("manifest hiç yok (yerel geliştirme) → canlı API", async () => {
    delete dosyalar[`${STATIK_KOK}/manifest.json`];
    _testIcinSifirla(async (url) =>
      url in dosyalar ? new Response(JSON.stringify(dosyalar[url])) : new Response("", { status: 404 }));
    await veriFetch(`${API}/fiyat/ilce/istanbul/besiktas?kategori=arsa`);
    expect(apiCagrilari).toHaveLength(1);
  });

  it("statik dosya bozuk (500) → canlı API'ye düşer, site düşmez", async () => {
    dosyaDurumu[`${STATIK_KOK}/arsa/ilce/istanbul.json`] = 500;
    const r = await veriFetch(`${API}/fiyat/ilce/istanbul/besiktas?kategori=arsa`);
    expect(await r.json()).toEqual({ kaynak: "api" });
    expect(apiCagrilari).toHaveLength(1);
  });

  it("statik karşılığı olmayan istek (toplu-ozet) doğrudan API", async () => {
    await veriFetch(`${API}/fiyat/toplu-ozet?kategori=arsa`);
    expect(apiCagrilari).toHaveLength(1);
  });
});
