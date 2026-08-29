/**
 * SÖZLEŞME TESTİ — migration bütünlüğü.
 *
 * NEDEN: bu oturumda üretimde 9 migration'ın hiç uygulanmadığı elle keşfedildi.
 * Bunlardan `0021_webhook_idempotency.sql` SQLite'ta ayrılmış kelime olan `not`
 * adında bir kolon tanımladığı için SESSİZCE patlamıştı — ne CI ne de testler
 * fark etti.
 *
 * Neden fark etmedi: test-helper.ts'teki MockD1Database migration'ları
 * `try { ... } catch { /* Non-fatal migration error *\/ }` ile uyguluyor.
 * Yani bozuk bir migration testlerde de sessizce atlanıyor ve "her şey yolunda"
 * görünüyor — üretimdeki hatanın aynısı test altyapısında da vardı.
 *
 * Bu dosya migration'ları TEK TEK ve HATA YUTMADAN uygular. Bir migration
 * sözdizimi hatası taşıyorsa burada patlar.
 */
import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.resolve(__dirname, "../src/db");

/** test-helper.ts'teki ayıklama mantığıyla aynı — yorumları ve boş ifadeleri at. */
function ifadeleriAyir(script: string): string[] {
  return script
    .replace(/--.*$/gm, "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function migrationDosyalari(): string[] {
  return fs
    .readdirSync(DB_DIR)
    .filter(
      (f) =>
        f.endsWith(".sql") &&
        f !== "schema.sql" &&
        !f.includes("template") &&
        !f.startsWith("migrate-"),
    )
    // SAYISAL sıralama — test-helper.ts ile aynı kural. Alfabetik sıralama
    // 3 haneli eski ve 4 haneli yeni migration'ları yanlış iç içe geçiriyor.
    .sort((a, b) => {
      const na = parseInt(/^(\d+)/.exec(a)?.[1] ?? "0", 10);
      const nb = parseInt(/^(\d+)/.exec(b)?.[1] ?? "0", 10);
      return na !== nb ? na - nb : a.localeCompare(b);
    });
}

describe("sözleşme: migration bütünlüğü", () => {
  it("her migration HATA YUTMADAN uygulanabiliyor", () => {
    const db = new DatabaseSync(":memory:");
    // Önce temel şema
    for (const ifade of ifadeleriAyir(fs.readFileSync(path.join(DB_DIR, "schema.sql"), "utf-8"))) {
      db.exec(ifade);
    }

    const hatalar: string[] = [];
    for (const dosya of migrationDosyalari()) {
      const sql = fs.readFileSync(path.join(DB_DIR, dosya), "utf-8");
      for (const ifade of ifadeleriAyir(sql)) {
        try {
          db.exec(ifade);
        } catch (e) {
          const mesaj = e instanceof Error ? e.message : String(e);
          // "already exists" beklenen: schema.sql bazı nesneleri zaten kuruyor,
          // migration'lar IF NOT EXISTS kullanmıyor olabilir. Bu bir bozukluk
          // değil. Diğer HER hata gerçek bir migration kusuru.
          if (/already exists|duplicate column/i.test(mesaj)) continue;
          hatalar.push(`${dosya}: ${mesaj}\n    → ${ifade.slice(0, 120)}`);
        }
      }
    }

    expect(
      hatalar,
      `Bozuk migration(lar) var. Bunlar üretimde SESSİZCE uygulanmaz ve ` +
        `ilgili özellik ölü kalır:\n  ${hatalar.join("\n  ")}`,
    ).toEqual([]);
  });

  it("uygulama sırası deterministik", () => {
    // Tarihsel olarak iki migration aynı numarayı taşıyor (0015_performans_*
    // ve 0015_tkgm_*). İkisi de üretimde uygulanmış durumda, yeniden
    // numaralandırmak kazanandan çok risk getirir. Önemli olan sıranın
    // BELİRSİZ olmaması: sayısal numara eşitse dosya adına göre çözülüyor,
    // yani her ortamda aynı sıra elde ediliyor.
    const bir = migrationDosyalari();
    const iki = migrationDosyalari();
    expect(bir).toEqual(iki);

    // Sayısal sıra gerçekten artan mı (alfabetik kaymalar yakalanır)
    const numaralar = bir.map((f) => parseInt(/^(\d+)/.exec(f)?.[1] ?? "0", 10));
    const sirali = [...numaralar].sort((a, b) => a - b);
    expect(numaralar, "Migration'lar sayısal sırada uygulanmıyor").toEqual(sirali);
  });

  it("kodun beklediği tablolar migration'lar sonrası mevcut", () => {
    // Bu oturumda `mahalle_merkez` tablosu HİÇ VAR DEĞİLDİ ama kod ona sorgu
    // atıyordu (try/catch içinde, sessizce null dönüyordu). Aşağıdaki liste,
    // kodun varlığına güvendiği tabloların sözleşmesi.
    const db = new DatabaseSync(":memory:");
    for (const ifade of ifadeleriAyir(fs.readFileSync(path.join(DB_DIR, "schema.sql"), "utf-8"))) {
      db.exec(ifade);
    }
    for (const dosya of migrationDosyalari()) {
      for (const ifade of ifadeleriAyir(fs.readFileSync(path.join(DB_DIR, dosya), "utf-8"))) {
        try { db.exec(ifade); } catch { /* beklenen yokluk: already-exists, üstteki test denetliyor */ }
      }
    }

    const mevcut = new Set(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => String((r as { name: string }).name)),
    );

    const BEKLENEN = [
      "ilanlar",
      "mahalle_merkez",      // koordinat çözümlemesi — yokluğu sessiz null üretiyordu
      "poi_noktalari",       // /v1/harita/poi
      "mahalle_baseline_ai", // fiyat.ts fallback yolları
      "mahalle_istatistik",
      "mahalle_zaman_serisi",
      "tarama_durum",        // tarama rotasyonu
      "hata_log",
      "milli_emlak_ihale",
      "fiyat_endeksi",
    ];
    const eksik = BEKLENEN.filter((t) => !mevcut.has(t));
    expect(
      eksik,
      `Kodun sorguladığı tablolar migration'larda tanımlı değil: ${eksik.join(", ")}`,
    ).toEqual([]);
  });

  it("ilanlar tablosu, ingest ve motorun okuduğu kolonları taşıyor", () => {
    const db = new DatabaseSync(":memory:");
    for (const ifade of ifadeleriAyir(fs.readFileSync(path.join(DB_DIR, "schema.sql"), "utf-8"))) {
      db.exec(ifade);
    }
    for (const dosya of migrationDosyalari()) {
      for (const ifade of ifadeleriAyir(fs.readFileSync(path.join(DB_DIR, dosya), "utf-8"))) {
        try { db.exec(ifade); } catch { /* beklenen yokluk: already-exists */ }
      }
    }
    const kolonlar = new Set(
      db.prepare("PRAGMA table_info(ilanlar)").all().map((r) => String((r as { name: string }).name)),
    );
    const BEKLENEN = [
      "kaynak", "ilan_no", "il_norm", "ilce_norm", "mahalle_norm",
      "fiyat_per_m2", "m2", "kategori", "imar_durumu",
      "baslik", "tapu_durumu", "zenginlestirildi",
      "lat", "lng", "koord_kaynagi", "aktif",
    ];
    const eksik = BEKLENEN.filter((k) => !kolonlar.has(k));
    expect(eksik, `ilanlar tablosunda eksik kolon: ${eksik.join(", ")}`).toEqual([]);
  });
});
