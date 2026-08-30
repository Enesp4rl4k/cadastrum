/**
 * Sessiz hata sözleşmesi — Roadmap Sprint B.3 / B.4.
 *
 * Bu oturumda bulunan 13 hatanın "A ve B sınıfı"nı davranış düzeyinde
 * sabitler. Her testin karşılığı gerçek bir üretim kaybı:
 *
 *   B.3  "bu sayfada yeni ilan yok" ile "sayfalama bitti" karıştırıldı
 *        → daha önce sığ taranmış ilçelerde envanterin %61'i hiç alınmadı.
 *   B.4  HTTP durumu yutuldu (429 → null → "ilan yok")
 *        → engellenen 254 ilçe "tarandı" damgalanıp rotasyondan düştü.
 *
 * Kabul ölçütü: düzeltmeyi geri al, test kırılsın.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { emlakjetIlceTara } from "../src/lib/emlakjet-scraper.js";
import { hepsiemlakIlceTara } from "../src/lib/hepsiemlak-scraper.js";

// ── Sahte D1 ─────────────────────────────────────────────────────────────────

interface SahteDb {
  db: never;
  yazilanIlanlar: string[];
  damgalar: Array<{ sql: string; args: unknown[] }>;
}

/**
 * @param yeniIlan - INSERT'in yeni satır yazıp yazmadığı. `false` → ilan zaten
 *   vardı (dedupe). Testlerin çoğu bu durumu kullanıyor: "hepsi tanıdık".
 */
function sahteDb(yeniIlan = true): SahteDb {
  const yazilanIlanlar: string[] = [];
  const damgalar: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => null,          // mahalle_merkez'de kayıt yok
        all: async () => ({ results: [] }),
        run: async () => {
          if (sql.includes("INSERT OR IGNORE INTO ilanlar")) {
            yazilanIlanlar.push(String(args[1]));
            return { meta: { changes: yeniIlan ? 1 : 0 } };
          }
          if (sql.includes("tarama_durum")) damgalar.push({ sql, args });
          return { meta: { changes: 1 } };
        },
      }),
    }),
  };
  return { db: db as never, yazilanIlanlar, damgalar };
}

// ── Sahte sayfalar ───────────────────────────────────────────────────────────

function ejListeSayfasi(idler: string[]): string {
  return `<script type="application/ld+json">${JSON.stringify({
    "@graph": idler.map((id) => ({
      "@type": "RealEstateListing",
      url: `https://www.emlakjet.com/ilan/catalca-satilik-arsa-${id}`,
      name: `Test ilan ${id}`,
      offers: { price: 1_000_000 },
      additionalProperty: [
        { name: "Metrekare", value: "500 m²" },
        { name: "Konum", value: "Nakkaş Mahallesi, Çatalca" },
        { name: "İlan Tipi", value: "Satılık Arsa" },
      ],
    })),
  })}</script>`;
}

function heListeSayfasi(idler: string[]): string {
  return `<script type="application/ld+json">${JSON.stringify({
    "@type": "ItemList",
    itemListElement: idler.map((id) => ({
      item: {
        "@type": "RealEstateListing",
        url: `https://www.hepsiemlak.com/istanbul-catalca-nakkas-satilik/arsa/${id}`,
        name: `Test ilan ${id}`,
        about: {
          address: { addressLocality: "İstanbul", streetAddress: "Nakkaş, Çatalca/İstanbul" },
          additionalProperty: [{ name: "Net Alan", value: 500, unitCode: "MTK" }],
        },
        offers: { price: 1_000_000, priceCurrency: "TRY" },
      },
    })),
  })}</script>`;
}

function yanit(govde: string, status = 200): Response {
  return new Response(govde, { status }) as unknown as Response;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// ── B.3 — bitiş koşulu ile veri yokluğunun ayrımı ────────────────────────────

describe("B.3 — 'yeni ilan yok' ile 'sayfalama bitti' aynı şey değil", () => {
  it("1. sayfa tamamen TANIDIK ilanlardan oluşsa bile derin sayfalara devam eder", async () => {
    // Üretimdeki kayıp buydu: sığ taranmış ilçede 1. sayfa hep tanıdık çıkıyor,
    // döngü anında kırılıyor ve 2+ sayfalara HİÇ ulaşılamıyordu (kapsam ~%39).
    const sayfalar: string[] = [];
    const fetchSahte = vi.fn(async (url: string) => {
      sayfalar.push(url);
      const m = /sayfa=(\d+)/.exec(url);
      return yanit(ejListeSayfasi([`1747290${m ? m[1] : "1"}`]));
    });
    vi.stubGlobal("fetch", fetchSahte);

    const { db } = sahteDb(false); // HİÇBİR ilan yeni değil
    const s = await emlakjetIlceTara(db, "istanbul", "catalca", "arsa", 3);

    expect(s.eklenen).toBe(0);
    expect(sayfalar.filter((u) => u.includes("sayfa=2"))).toHaveLength(1);
    expect(sayfalar.filter((u) => u.includes("sayfa=3"))).toHaveLength(1);
  });

  it("sayfa HİÇ ilan döndürmediğinde durur — gerçek sayfalama sonu", async () => {
    const fetchSahte = vi.fn(async (url: string) =>
      yanit(url.includes("sayfa=") ? "<html>ilan yok</html>" : ejListeSayfasi(["17472901"])),
    );
    vi.stubGlobal("fetch", fetchSahte);

    const { db } = sahteDb();
    const s = await emlakjetIlceTara(db, "istanbul", "catalca", "arsa", 5);
    expect(s.eklenen).toBe(1);
    expect(s.hata).toBe(false);
  });
});

// ── B.4 — HTTP durumu yutulmaz ───────────────────────────────────────────────

describe("B.4 — engellenme veri yokluğu değildir (emlakjet)", () => {
  it("2. sayfadaki 429 ilçeyi 'tamam' değil 'bot-engel' damgalar", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("sayfa=2") ? yanit("", 429) : yanit(ejListeSayfasi(["17472901"])),
    ));

    const { db, damgalar } = sahteDb();
    const s = await emlakjetIlceTara(db, "istanbul", "catalca", "arsa", 5);

    expect(s.botEngel).toBe(true);
    expect(s.sonDurum).toBe(429);
    expect(damgalar).toHaveLength(1);
    expect(damgalar[0]!.args).toContain("bot-engel");
  });

  it("bot engelinde son_tarama İLERLEMEZ — ilçe rotasyonun önünde kalır", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => yanit("", 429)));

    const { db, damgalar } = sahteDb();
    await emlakjetIlceTara(db, "istanbul", "catalca", "arsa", 3);

    // son_tarama, INSERT parametre sırasında 5. sırada (index 4).
    expect(damgalar[0]!.args[4]).toBeNull();
  });

  it("404 bot engeli DEĞİL — 'hata' damgalanır, tarama durmaz", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => yanit("", 404)));

    const { db, damgalar } = sahteDb();
    const s = await emlakjetIlceTara(db, "istanbul", "catalca", "arsa", 3);

    expect(s.botEngel).toBe(false);
    expect(s.hata).toBe(true);
    expect(damgalar[0]!.args).toContain("hata");
  });
});

describe("B.4 — engellenme veri yokluğu değildir (hepsiemlak Worker hattı)", () => {
  it("3. sayfadaki 429 taramayı 'ilan bitti' saymaz", async () => {
    // Bu kusur yerel script'te düzeltilmişti ama Worker hattında duruyordu.
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("page=3") ? yanit("", 429) : yanit(heListeSayfasi(["167147-415"])),
    ));

    const { db } = sahteDb();
    const s = await hepsiemlakIlceTara(db, "istanbul", "catalca", "arsa", 10);

    expect(s.botEngel).toBe(true);
    expect(s.sonDurum).toBe(429);
    expect(s.hata).toBe(false); // engellenme "hata" ile de karıştırılmıyor
  });

  it("boş sayfa gerçek sayfalama sonudur — bot engeli sayılmaz", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("page=2") ? yanit("<html></html>") : yanit(heListeSayfasi(["167147-415"])),
    ));

    const { db } = sahteDb();
    const s = await hepsiemlakIlceTara(db, "istanbul", "catalca", "arsa", 10);

    expect(s.botEngel).toBe(false);
    expect(s.sayfa).toBe(1);
  });
});
