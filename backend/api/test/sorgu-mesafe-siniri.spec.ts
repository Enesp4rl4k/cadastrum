/**
 * /v1/sorgu — "en yakın mahalle" yedeği MESAFE SINIRSIZDI.
 *
 * NEDEN (2026-09-13, canlı sorgu sayfası kullanılırken yakalandı): spatial
 * yarıçap araması (5→10→20 km) yetersiz kalınca kod, mesafeye HİÇ bakmadan
 * veritabanındaki EN YAKIN ilanı buluyor ve onun mahallesinin istatistiğini
 * sabit %65 güvenle döndürüyordu. Kayseri kırsalına tıklayınca 700 km
 * uzaktaki İstanbul/Çatalca verisi geldi — "%65 güven" etiketiyle.
 *
 * Sınır artık MAHALLE_FALLBACK_MAX_KM (30 km): aşılırsa il-fallback'e
 * (kaynak "il-fallback", güven 30 — kabalığını açıkça söylüyor) düşülüyor.
 *
 * MUTASYON: sorgu.ts'de "en yakın ilan" sorgusundaki
 * `AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?` satırını kaldır →
 * ilk test kırılır (700 km uzaktaki ilan yine mahalle-istatistik'i tetikler).
 */
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv, MockD1Database } from "./test-helper.js";

// Kayseri civarı — sorgu noktası.
const SORGU = { lat: 38.7, lng: 35.5 };

/**
 * Rota `c.executionCtx.waitUntil(...)` ile arka plana telemetri atıyor
 * (bkz. sorgu.ts, Ö3). `app.request()` bir ExecutionContext olmadan
 * çağrılırsa Hono "This context has no ExecutionContext" ile 500 döner —
 * gerçek bir istek değil, test kablolamasının eksik bıraktığı bir şey.
 */
const yurutmeBaglami: ExecutionContext = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

function ilanEkle(db: MockD1Database, opts: {
  ilanNo: string; lat: number; lng: number; ilce: string; mahalle: string; fiyat: number;
}) {
  db.db.prepare(
    `INSERT INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, fiyat_per_m2, m2, kategori, lat, lng, aktif, yakalanma_tarihi)
     VALUES ('emlakjet', ?, 'testil', ?, ?, ?, 500, 'arsa', ?, ?, 1, ?)`,
  ).run(opts.ilanNo, opts.ilce, opts.mahalle, opts.fiyat, opts.lat, opts.lng, Date.now());
}

function mahalleIstatistigiEkle(db: MockD1Database, ilce: string, mahalle: string, medyan: number) {
  db.db.prepare(
    `INSERT INTO mahalle_istatistik (il_norm, ilce_norm, mahalle_norm, kategori, medyan, q1, q3, ortalama, ilan_adet, son_guncelleme)
     VALUES ('testil', ?, ?, 'arsa', ?, ?, ?, ?, 12, ?)`,
  ).run(ilce, mahalle, medyan, medyan * 0.8, medyan * 1.2, medyan, Date.now());
}

describe("/v1/sorgu — en yakın mahalle yedeğinde mesafe sınırı", () => {
  it("700 km uzaktaki tek ilan mahalle-istatistiğini TETİKLEMEZ — il-fallback'e düşer", async () => {
    const env = createMockEnv();
    const db = env.DB as unknown as MockD1Database;
    // İstanbul/Çatalca — Kayseri'den ~700 km, spatial'ın 20 km üst sınırının ve
    // yeni 30 km fallback sınırının çok dışında.
    ilanEkle(db, { ilanNo: "uzak-1", lat: 41.14, lng: 28.46, ilce: "catalca", mahalle: "ferhatpasa", fiyat: 4200 });
    mahalleIstatistigiEkle(db, "catalca", "ferhatpasa", 4200);

    const r = await app.request("/v1/sorgu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...SORGU, kategori: "arsa" }),
    }, env, yurutmeBaglami);
    expect(r.status).toBe(200);
    const g = await r.json() as { kaynak: string; guven_skoru: number; medyan_tlm2: number | null };

    expect(g.kaynak).toBe("il-fallback");
    expect(g.guven_skoru).toBe(30);
    // 4200 (İstanbul/Çatalca'nın gerçek medyanı) DÖNMEMELİ.
    expect(g.medyan_tlm2).not.toBe(4200);
  });

  it("30 km sınırı içindeki (ama 20 km spatial yarıçapının dışındaki) ilan HÂLÂ eşleşiyor — yedek kırılmadı", async () => {
    const env = createMockEnv();
    const db = env.DB as unknown as MockD1Database;
    // Sorgu noktasının ~25 km kuzeyi — spatial döngü (max 20 km) bulamaz,
    // ama 30 km'lik fallback penceresi bulmalı.
    ilanEkle(db, { ilanNo: "yakin-1", lat: 38.925, lng: 35.5, ilce: "merkez", mahalle: "yenimahalle", fiyat: 1800 });
    mahalleIstatistigiEkle(db, "merkez", "yenimahalle", 1800);

    const r = await app.request("/v1/sorgu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...SORGU, kategori: "arsa" }),
    }, env, yurutmeBaglami);
    const g = await r.json() as { kaynak: string; guven_skoru: number; medyan_tlm2: number | null };

    expect(g.kaynak).toBe("mahalle-istatistik");
    expect(g.guven_skoru).toBe(65);
    expect(g.medyan_tlm2).toBe(1800);
  });

  it("hiç ilan yoksa il-fallback'e düşer (regresyon: en dış yedek hâlâ çalışıyor)", async () => {
    const env = createMockEnv();
    const r = await app.request("/v1/sorgu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...SORGU, kategori: "arsa" }),
    }, env, yurutmeBaglami);
    const g = await r.json() as { kaynak: string; guven_skoru: number; medyan_tlm2: number | null };
    expect(g.kaynak).toBe("il-fallback");
    expect(g.guven_skoru).toBe(30);
    expect(g.medyan_tlm2).toBeGreaterThan(0);
  });
});
