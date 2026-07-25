/**
 * Agent Memory — Episodik + Çalışma Belleği
 *
 * Vektör DB olmadan keyword-similarity ile alakalı geçmiş sohbetleri bulur.
 * Cloudflare D1 (SQLite) üzerinde çalışır.
 *
 * Bellek türleri:
 *   - Episodik: Kullanıcının daha önce incelediği parseller + sorduğu sorular
 *   - Çalışma: Aktif sohbet oturumu bağlamı (araç sonuçları, kararlar)
 *   - Semantik: Bölge/il hakkındaki daha önce öğrenilen gerçekler (statik)
 *
 * Retrieval stratejisi (vektörsüz):
 *   1. IL/İLÇE eşleşmesi (exact match, en ağırlıklı)
 *   2. Anahtar kelime overlap (TF benzeri, token intersection)
 *   3. Zaman azalması (eski kayıtlar daha az ağırlık)
 *
 * Hafıza boyutu:
 *   - Max 5 episodik kayıt retrieve edilir
 *   - Token budget: 800 token (prompt içindeki memory bloğu)
 */

import type { Env } from "../index.js";

// ── Tipler ────────────────────────────────────────────────────────────────────

export interface EpisodikKayit {
  id: number;
  kullanici_id: number;
  il?: string;
  ilce?: string;
  soru_ozeti: string;   // İlk 200 karakter
  yanit_ozeti: string;  // İlk 300 karakter
  anahtar_kelimeler: string; // JSON string array
  tarih: number;        // epoch ms
  onem_skoru: number;   // 0-100, kullanıcı beğenisi/tekrar ziyaret artırır
}

export interface CalismaBelek {
  arac_sonuclari: Array<{
    arac: string;
    sonuc: Record<string, unknown>;
    zaman: number;
  }>;
  aktif_parsel?: {
    il: string;
    ilce: string;
    ada_no?: string;
    parsel_no?: string;
  };
  karar_gecmisi: string[]; // AI'ın bu tur içinde verdiği kararlar
}

// ── Anahtar kelime çıkarıcı ───────────────────────────────────────────────────

/**
 * Metinden Türkçe gayrimenkul domain kelimelerini çıkarır.
 * Stopword'leri atar, kök benzeri normalizasyon yapar.
 */
export function anahtarKelimeCikar(metin: string): string[] {
  const STOPWORDS = new Set([
    "ve", "veya", "ile", "için", "bu", "bir", "de", "da", "mı", "mi",
    "ne", "nasıl", "neden", "hangi", "var", "yok", "olan", "olan",
    "the", "and", "or", "for", "what", "how", "why", "is", "are",
  ]);

  const DOMAIN_KELIMELERI = new Set([
    "arsa", "tarla", "parsel", "ada", "imar", "emsal", "taks", "kat",
    "fiyat", "değer", "m2", "metrekare", "konut", "villa", "daire",
    "deprem", "risk", "taşkın", "sel", "heyelan", "afad",
    "milli", "emlak", "ihale", "kadastro", "tkgm", "tapu",
    "yatırım", "roi", "kira", "getiri", "fizibilite",
    "il", "ilce", "mahalle", "bölge", "sanayi", "osb",
    "ankara", "istanbul", "izmir", "konya", "bursa", "antalya",
  ]);

  return metin
    .toLocaleLowerCase("tr")
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((k) => k.length > 2 && !STOPWORDS.has(k))
    .filter((k) => DOMAIN_KELIMELERI.has(k) || k.length > 4)
    .slice(0, 15); // Max 15 anahtar kelime
}

// ── Benzerlik skoru ───────────────────────────────────────────────────────────

/**
 * İki anahtar kelime seti arasındaki Jaccard benzerligi (0-1)
 */
function jaccardBenzerlik(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let kesisim = 0;
  for (const k of setA) { if (setB.has(k)) kesisim++; }
  const birlesim = setA.size + setB.size - kesisim;
  return birlesim === 0 ? 0 : kesisim / birlesim;
}

/** Zaman azalma faktörü — 30 günden eski kayıtlar %50 ağırlık */
function zamanCarpani(tarih: number): number {
  const gunFarki = (Date.now() - tarih) / (24 * 60 * 60 * 1000);
  return Math.exp(-gunFarki / 30); // e-decay, 30 günlük yarı-ömür
}

// ── Memory retrieval ──────────────────────────────────────────────────────────

/**
 * Güncel sorguyla alakalı geçmiş episodik kayıtları getirir.
 *
 * @param kullanici_id  Kullanıcı ID
 * @param soru          Güncel kullanıcı sorusu
 * @param baglam        Aktif parsel bağlamı (il/ilçe boost için)
 * @param db            D1 bağlantısı
 * @param maxKayit      Kaç kayıt döndür (default 3)
 */
export async function alakaliGecmisiGetir(
  kullanici_id: number,
  soru: string,
  baglam: { il?: string; ilce?: string } | null,
  db: Env["DB"],
  maxKayit = 3,
): Promise<EpisodikKayit[]> {
  try {
    // Son 30 günlük kayıtları çek (D1'den max 50)
    const rows = await db.prepare(
      `SELECT id, kullanici_id, il, ilce, soru_ozeti, yanit_ozeti,
              anahtar_kelimeler, tarih, onem_skoru
       FROM agent_episodik_hafiza
       WHERE kullanici_id = ? AND tarih > ?
       ORDER BY tarih DESC LIMIT 50`,
    ).bind(kullanici_id, Date.now() - 30 * 24 * 60 * 60 * 1000)
     .all<EpisodikKayit>();

    if (!rows.results || rows.results.length === 0) return [];

    const soruKelimeleri = anahtarKelimeCikar(soru);

    // Her kayıt için skor hesapla
    const skorlu = rows.results.map((kayit) => {
      let kayitKelimeleri: string[] = [];
      try {
        kayitKelimeleri = JSON.parse(kayit.anahtar_kelimeler) as string[];
      } catch { /* ignore */ }

      const semantikSkor = jaccardBenzerlik(soruKelimeleri, kayitKelimeleri);

      // Lokasyon boost: aynı il/ilçe → +0.3
      const lokasyonBoost =
        (baglam?.il && kayit.il === baglam.il ? 0.2 : 0) +
        (baglam?.ilce && kayit.ilce === baglam.ilce ? 0.1 : 0);

      const zamanFaktoru = zamanCarpani(kayit.tarih);
      const onemFaktoru = (kayit.onem_skoru ?? 50) / 100;

      const toplamSkor =
        semantikSkor * 0.5 +
        lokasyonBoost +
        zamanFaktoru * 0.2 +
        onemFaktoru * 0.1;

      return { kayit, skor: toplamSkor };
    });

    // Eşik: minimum 0.1 skor
    return skorlu
      .filter((s) => s.skor > 0.1)
      .sort((a, b) => b.skor - a.skor)
      .slice(0, maxKayit)
      .map((s) => s.kayit);
  } catch {
    return [];
  }
}

/**
 * Yeni episodik kayıt ekle / güncelle
 */
export async function episodikKaydet(
  kullanici_id: number,
  soru: string,
  yanit: string,
  baglam: { il?: string; ilce?: string } | null,
  db: Env["DB"],
): Promise<void> {
  const anahtarKelimeler = anahtarKelimeCikar(soru + " " + yanit.slice(0, 200));

  try {
    await db.prepare(
      `INSERT INTO agent_episodik_hafiza
       (kullanici_id, il, ilce, soru_ozeti, yanit_ozeti, anahtar_kelimeler, tarih, onem_skoru)
       VALUES (?, ?, ?, ?, ?, ?, ?, 50)`,
    ).bind(
      kullanici_id,
      baglam?.il ?? null,
      baglam?.ilce ?? null,
      soru.slice(0, 200),
      yanit.slice(0, 300),
      JSON.stringify(anahtarKelimeler),
      Date.now(),
    ).run();
  } catch {
    // Tablo yoksa sessizce geç (migration henüz uygulanmamış)
  }
}

/**
 * Alakalı geçmişi prompt'a eklenecek metin bloğuna çevirir.
 * Token budget: ~600 token
 */
export function hafizaBlokuOlustur(kayitlar: EpisodikKayit[]): string {
  if (kayitlar.length === 0) return "";

  const satirlar = kayitlar.map((k, i) => {
    const tarih = new Date(k.tarih).toISOString().slice(0, 10);
    const lokasyon = [k.il, k.ilce].filter(Boolean).join("/");
    return `[${i + 1}] ${tarih}${lokasyon ? ` (${lokasyon})` : ""}: Soru: "${k.soru_ozeti.slice(0, 80)}" → Özet: "${k.yanit_ozeti.slice(0, 120)}"`;
  });

  return `=== GEÇMİŞ İLGİLİ SOHBETLER ===\n${satirlar.join("\n")}\n(Bu geçmiş referans içindir; güncel sorguyu önceliklendir.)`;
}
