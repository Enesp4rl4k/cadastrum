/**
 * DERİN TARAMA DAMGASI — sığ tur, derin rotasyonu aç bırakmamalı.
 *
 * GERÇEK SORUN: `tarama_durum` rotasyonu tek damgaya (`son_tarama`) bakıyordu
 * ve taramanın ne kadar derin olduğunu bilmiyordu. İki cron aynı kuyruğu
 * tüketiyor:
 *
 *   günlük  maxSayfa = 25  ← derin (eski hâli)
 *   ayın 15 maxSayfa =  3  ← sığ
 *
 * Sığ tur bir ilçeyi 3 sayfa tarayıp `son_tarama`yı ilerletiyor, ilçe kuyruğun
 * sonuna gidiyor ve derin tarama ona aylarca uğramıyordu. Yani sığ tarama
 * derin taramayı aç bırakıyordu.
 *
 * Ölçülen sonuç: emlakjet kapsamı ~%39'da takılı. Kaynakta bizdekinin ~2,5
 * katı ilan var; sebep piyasada ilan olmaması değil, taramanın sığ kalması.
 *
 * Bu mekanizma sessizce bozulabilir — bozulduğunda hiçbir hata çıkmaz, sadece
 * kapsam artmaz. O yüzden testi var.
 */
import { describe, it, expect } from "vitest";
import { taramaDamgala } from "../src/lib/veri-katmani.js";
import { createMockEnv } from "./test-helper.js";

async function damgaOku(db: D1Database, ilce: string) {
  return db.prepare(
    `SELECT son_tarama, son_derin_tarama, son_durum FROM tarama_durum
     WHERE kaynak='emlakjet' AND il_norm='istanbul' AND ilce_norm=? AND kategori='arsa'`,
  ).bind(ilce).first<{ son_tarama: number | null; son_derin_tarama: number | null; son_durum: string }>();
}

const hedef = (ilce: string) => ({ ilNorm: "istanbul", ilceNorm: ilce, kategori: "arsa" });

describe("derin tarama damgası", () => {
  it("derin tarama her iki damgayı da ilerletir", async () => {
    const env = createMockEnv();
    await taramaDamgala(env.DB, "emlakjet", hedef("catalca"), 120, "tamam", true);
    const d = await damgaOku(env.DB, "catalca");
    expect(d?.son_tarama).toBeGreaterThan(0);
    expect(d?.son_derin_tarama).toBeGreaterThan(0);
  });

  it("sığ tarama yalnızca son_tarama'yı ilerletir", async () => {
    const env = createMockEnv();
    await taramaDamgala(env.DB, "emlakjet", hedef("silivri"), 30, "tamam", false);
    const d = await damgaOku(env.DB, "silivri");
    expect(d?.son_tarama).toBeGreaterThan(0);
    expect(d?.son_derin_tarama).toBeNull();
  });

  /**
   * ASIL REGRESYON TESTİ: derin taranmış bir ilçeye sığ tur uğradığında,
   * derin damga KORUNMALI. Aksi hâlde COALESCE kalkarsa sığ tur derin
   * geçmişi siler ve ilçe derin kuyruğa yeniden düşer — ya da tersi, hiç
   * düşmez. İki durumda da rotasyon bozulur.
   */
  it("sığ tur, önceki derin damgayı SİLMEZ", async () => {
    const env = createMockEnv();
    await taramaDamgala(env.DB, "emlakjet", hedef("tuzla"), 200, "tamam", true);
    const derin = (await damgaOku(env.DB, "tuzla"))!.son_derin_tarama;
    expect(derin).toBeGreaterThan(0);

    await taramaDamgala(env.DB, "emlakjet", hedef("tuzla"), 5, "tamam", false);
    const sonra = await damgaOku(env.DB, "tuzla");
    expect(sonra?.son_derin_tarama).toBe(derin);
  });

  /**
   * Bot engeli hiçbir damgayı ilerletmemeli. Mevcut kural `son_tarama` için
   * zaten böyleydi (hepsiemlak'ta 254 ilçe engellenip "tarandı" sayılarak
   * kaybolmuştu); aynısı derinlik için de geçerli olmalı.
   */
  it("bot engeli derin damgayı da ilerletmez", async () => {
    const env = createMockEnv();
    await taramaDamgala(env.DB, "emlakjet", hedef("pendik"), 0, "bot-engel", true);
    const d = await damgaOku(env.DB, "pendik");
    expect(d?.son_tarama).toBeNull();
    expect(d?.son_derin_tarama).toBeNull();
    expect(d?.son_durum).toBe("bot-engel");
  });

  /**
   * Derin rotasyonun sorgusu: hiç derin taranmamış (NULL) olanlar önce.
   * Sığ taranmış bir ilçe hâlâ derin kuyruğun BAŞINDA olmalı — sığ tur onu
   * geriye atmamalı.
   */
  it("sığ taranmış ilçe derin kuyruğun başında kalır", async () => {
    const env = createMockEnv();
    await taramaDamgala(env.DB, "emlakjet", hedef("a-derin"), 100, "tamam", true);
    await taramaDamgala(env.DB, "emlakjet", hedef("b-sig"), 10, "tamam", false);

    const sira = await env.DB.prepare(
      `SELECT ilce_norm FROM tarama_durum
       WHERE kaynak='emlakjet' AND kategori='arsa'
       ORDER BY son_derin_tarama ASC NULLS FIRST`,
    ).all<{ ilce_norm: string }>();
    expect(sira.results?.[0]?.ilce_norm).toBe("b-sig");
  });
});
