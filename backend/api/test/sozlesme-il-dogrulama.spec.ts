/**
 * SÖZLEŞME TESTİ — il alanı bilinen 81 ile karşı doğrulanıyor mu.
 *
 * NEDEN: canlı üretimde `/v1/fiyat/toplu-ozet?kategori=arsa` **83 il**
 * döndürüyordu. Türkiye'de 81 il var. Fazladan gelen ikisi:
 *
 *   "el zig"          ← Elâzığ, kaynak sayfa bozuk charset ile çözülmüş
 *   "emlak endeksi"   ← parser bir sayfa etiketini il alanına yazmış
 *
 * KÖK NEDEN ÖLÇÜLDÜ: `normalizeYerAdi("Elâzığ")` doğru çalışıyor ("elazig").
 * Ama â yerine tanınmayan bir karakter geldiğinde normalizasyon onu boşluğa
 * çeviriyor:
 *
 *   "El?zığ" → "el zig"
 *
 * Sonuç geçerli bir yer adı GİBİ görünüyor, hiçbir katman itiraz etmiyor ve
 * D1'e yeni bir il olarak yazılıyor. Var olmayan bir ilin istatistikleri
 * birikiyor — yine "hata yok ama veri yanlış".
 */
import { describe, it, expect } from "vitest";
import { ilanRoutes } from "../src/routes/ilan.js";
import { ILLER_81, ilKanonik, gecerliIl } from "../src/data/iller.js";
import { normalizeYerAdi } from "../src/lib/normalize.js";

function fakeDB() {
  const seen = new Set<string>();
  const rows: unknown[][] = [];
  return {
    prepare() {
      return { bind: (...args: unknown[]) => { rows.push(args); return { _args: args }; } };
    },
    async batch(stmts: Array<{ _args: unknown[] }>) {
      return stmts.map((s) => {
        const no = String(s._args[1]);
        const dup = seen.has(no);
        if (!dup) seen.add(no);
        return { meta: { changes: dup ? 0 : 1 } };
      });
    },
    _rows: rows,
  } as unknown as D1Database & { _rows: unknown[][] };
}

const env = (DB: unknown) => ({ DB } as never);
const ilan = (no: string, over: Record<string, unknown> = {}) => ({
  kaynak: "extension", ilan_no: no, il: "Muğla", ilce: "Bodrum", mahalle: "Yalıkavak",
  fiyat_per_m2: 12500, m2: 1000, kategori: "arsa", ...over,
});
const katkiGonder = (ilanlar: unknown[], DB = fakeDB()) =>
  ilanRoutes.request(
    "/katki",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ilanlar }) },
    env(DB),
  );

describe("il listesi", () => {
  it("tam 81 il, tekrarsız", () => {
    expect(ILLER_81).toHaveLength(81);
    expect(new Set(ILLER_81).size).toBe(81);
  });

  it("hepsi normalize biçimde (sadece küçük harf, rakam, boşluk)", () => {
    // Listeye Türkçe karakterli bir ad girerse hiçbir zaman eşleşmez ve
    // o il sessizce reddedilir.
    for (const il of ILLER_81) expect(il).toMatch(/^[a-z0-9 ]+$/);
  });

  it("normalizeYerAdi çıktısıyla birebir örtüşüyor", () => {
    // Liste ile normalizasyon ayrışırsa geçerli iller reddedilir.
    for (const [ham, beklenen] of [
      ["İstanbul", "istanbul"],
      ["Elâzığ", "elazig"],
      ["Şanlıurfa", "sanliurfa"],
      ["Kahramanmaraş", "kahramanmaras"],
      ["Çanakkale", "canakkale"],
      ["Iğdır", "igdir"],
    ] as const) {
      expect(normalizeYerAdi(ham)).toBe(beklenen);
      expect(gecerliIl(beklenen)).toBe(true);
    }
  });
});

describe("ilKanonik", () => {
  it("bilinen ili aynen döndürür", () => {
    expect(ilKanonik("istanbul")).toBe("istanbul");
  });

  it("yaygın alternatif adları kanonik hale getirir", () => {
    // Bunlar gerçek kullanımlar; körlemesine reddedilirse geçerli ilan kaybolur.
    expect(ilKanonik("afyon")).toBe("afyonkarahisar");
    expect(ilKanonik("urfa")).toBe("sanliurfa");
    expect(ilKanonik("maras")).toBe("kahramanmaras");
    expect(ilKanonik("icel")).toBe("mersin");
    expect(ilKanonik("antep")).toBe("gaziantep");
  });

  it("ÜRETİMDEKİ İKİ HAYALET İLİ reddeder", () => {
    expect(ilKanonik("el zig")).toBeNull();
    expect(ilKanonik("emlak endeksi")).toBeNull();
  });

  it("'el zig' bilerek alias'lanmamış — bozuk kaynak gizlenmemeli", () => {
    // Elazığ olduğu belli ama eşlemek, charset sorununu sonsuza kadar görünmez
    // kılardı. Reddetmek sebebi görünür tutuyor.
    expect(ilKanonik("el zig")).not.toBe("elazig");
  });

  it("boş/eksik girdi null", () => {
    expect(ilKanonik(null)).toBeNull();
    expect(ilKanonik(undefined)).toBeNull();
    expect(ilKanonik("")).toBeNull();
  });
});

describe("bozuk karakter yeni il DOĞURMUYOR", () => {
  it("normalizasyon 'El?zığ'ı 'el zig' yapıyor — doğrulama bunu yakalıyor", () => {
    // Hatanın kendisini yeniden üretiyoruz: normalizasyon hâlâ "el zig"
    // üretecek (bu davranış değişmedi), ama artık kabul EDİLMİYOR.
    const bozuk = normalizeYerAdi("El?zığ");
    expect(bozuk).toBe("el zig");
    expect(gecerliIl(bozuk)).toBe(false);
  });

  it("ingest bozuk illi ilanı reddeder ve AYRI sayar", async () => {
    const DB = fakeDB();
    const res = await katkiGonder(
      [ilan("iyi-1"), ilan("bozuk-1", { il: "El?zığ" }), ilan("bozuk-2", { il: "Emlak Endeksi" })],
      DB,
    );
    expect(res.status).toBe(200);

    const j = await res.json() as { basarili: number; hata: number; bilinmeyen_il: number };
    expect(j.basarili).toBe(1);
    expect(j.bilinmeyen_il).toBe(2);
    // Şema hatası DEĞİL: iki sayaç ayrı tutuluyor, aksi hâlde hangisinin
    // arttığı görünmez.
    expect(j.hata).toBe(0);

    // D1'e yalnızca geçerli kayıt gitti.
    expect(DB._rows).toHaveLength(1);
  });

  it("geçerli alternatif ad KANONİK biçimde yazılır", async () => {
    // "afyon" kabul edilmeli ama D1'e ikinci bir il adı olarak düşmemeli.
    const DB = fakeDB();
    const res = await katkiGonder([ilan("afyon-1", { il: "Afyon" })], DB);
    const j = await res.json() as { basarili: number; bilinmeyen_il: number };

    expect(j.basarili).toBe(1);
    expect(j.bilinmeyen_il).toBe(0);
    // bind sırası: kaynak, ilan_no, il_norm, ...
    expect(DB._rows[0]![2]).toBe("afyonkarahisar");
  });

  it("tekil POST yolu da reddediyor ve sebebi söylüyor", async () => {
    const res = await ilanRoutes.request(
      "/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ilan("tekil-bozuk", { il: "El?zığ" })),
      },
      env(fakeDB()),
    );
    expect(res.status).toBe(422);
    const j = await res.json() as { sebep: string; error: string };
    expect(j.sebep).toBe("bilinmeyen-il");
    expect(j.error).toContain("81");
  });
});
