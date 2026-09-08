/**
 * Pipeline Health Check — D1 veri kalitesi + scraper alarm sistemi.
 *
 * Manuel HTTP endpoint: GET /v1/admin/pipeline-health?secret=XXX
 * Bu endpoint index.ts'de tanımlanır, bu dosya sadece logic içerir.
 *
 * Problem: Scraper sessizce çuvalayabilir (PerimeterX, site değişikliği vb.)
 * D1'deki ilan sayısı haftalar içinde düşerse kimse fark etmez.
 * Tahmin motoru stale veriye dayandığı için kullanıcılara yanlış sonuç döner.
 *
 * Çözüm: Günlük cron → D1 tablo sayıları kontrol → eşik altındaysa admin email.
 *
 * Kontrol edilen tablolar + eşikler:
 *   ilanlar          → min 50.000 aktif ilan (Türkiye geneli)
 *   ilanlar (7 gün)  → min 500 son 7 gün eklenen (scraper çalışıyor mu?)
 *   mahalle_istatistik → min 5.000 mahalle kaydı (istatistik refresh çalışıyor mu?)
 *
 * Deployment: istatistikRefresh ile aynı cron'a eklenir (her gün 03:00 UTC).
 *
 * Endpoint: GET /v1/admin/pipeline-health?secret=XXX (manuel tetikleme)
 */

import type { Env } from "../index.js";
import { katmanDagilimi } from "../lib/katman-telemetrisi.js";

// ─── Tipler ──────────────────────────────────────────────────────────────────

export interface PipelineKontrolSonucu {
  /** Kontrol zamanı */
  ts: number;
  /** Tüm kontroller geçti mi? */
  saglikli: boolean;
  /** Detay kontroller */
  kontroller: PipelineKontrol[];
  /** Kaç alarm tetiklendi */
  alarmSayisi: number;
  /** Email gönderildi mi */
  emailGonderildi: boolean;
}

export interface PipelineKontrol {
  ad: string;
  deger: number;
  esik: number;
  gecti: boolean;
  mesaj: string;
}

// ─── Eşik değerleri ───────────────────────────────────────────────────────────

const KONTROL_ESLIKLERI = {
  /**
   * En zayıf katmanın (`il-fallback`) üretimdeki payı, üst sınır %.
   *
   * O katman hiçbir emsale dayanmıyor — sabit bir il tablosu okuyor. Payı bu
   * oranın üstündeyse kullanıcıların çoğunluğu ölçülmemiş bir sayı görüyor
   * demektir. Ayrıca M1'in kalibre aralığı o katmanı KAPSAMIYOR (tabloda
   * yalnızca n ≥ 100 olan katmanlar var), yani aralık vaadi de tutmuyor.
   */
  ZAYIF_KATMAN_PAY_MAX: 40,
  /** Toplam aktif ilan sayısı */
  TOPLAM_ILAN_MIN: 50_000,
  /** Son 7 gün eklenen ilan (scraper canlı mı?) */
  SON_7_GUN_ILAN_MIN: 200,
  /** Son 30 gün eklenen ilan */
  SON_30_GUN_ILAN_MIN: 1_000,
  /** mahalle_istatistik tablo satırı */
  MAHALLE_ISTATISTIK_MIN: 3_000,
  /** mahalle_baseline_ai tablo satırı */
  MAHALLE_BASELINE_MIN: 1_000,
  /**
   * mahalle_merkez tablo satırı. Seed 65.718 satır; yarısının altına düşmesi
   * seed'in bozulduğu/silindiği anlamına gelir. Tablo HİÇ YOKKEN koordinat
   * çözümlemesi sessizce null dönüyordu — bu kontrol o durumu yakalar.
   */
  MAHALLE_MERKEZ_MIN: 30_000,
  /** poi_noktalari tablo satırı. Seed 476; boşsa /v1/harita/poi ölü. */
  POI_MIN: 100,
  /**
   * Koordinatlı ilan oranı (%). mahalle_merkez seed'i sonrası %87.
   * %50 altı, koordinat hattının (seed veya zenginleştirme) durduğunu gösterir.
   */
  KOORD_KAPSAM_MIN_YUZDE: 50,
  /**
   * Son 30 günde damgalanan tarama hedefi. Emlakjet günde 3 ilçe × 2 kategori
   * tarıyor → ayda ~180 damga. 30'un altı rotasyonun durduğu anlamına gelir
   * (aylarca 3 ilçeye kilitli kalma hatası tam olarak buydu).
   */
  ROTASYON_30_GUN_MIN: 30,
  /**
   * 'bot-engel' damgalı hedef sayısı (ÜST sınır). Engellenme artık sessizce
   * "tarandı" sayılmıyor (Sprint B.4); bu sayının şişmesi kaynağın bizi kalıcı
   * olarak kısıtladığı anlamına gelir ve hız ayarı gerektirir. Bu kontrol
   * diğerlerinin AKSİNE üst sınır: değer eşiğin ALTINDA olmalı.
   */
  BOT_ENGEL_MAX: 40,
  /**
   * Bir mahallenin "emsal havuzu var" sayılması için gereken ilan sayısı.
   *
   * 5 seçildi çünkü backtest'te hatanın çöktüğü yer tam orası: arsa MAPE
   * 1-4 emsalde %94, 5-19 emsalde %50. Motorun kendi eşiği
   * (MIN_MAHALLE_BASELINE_SAMPLES = 3) daha düşük ama o eşik güven skoru
   * içindir; buradaki soru "tahmin ne zaman iyileşiyor" sorusu.
   */
  EMSAL_HAVUZ_ESIGI: 5,
  /**
   * Emsal havuzuna sahip mahalle sayısı (arsa). Kapsamın TEK gerçek ölçüsü.
   *
   * Neden toplam ilan sayısı yetmiyor: 40 bin ilan sağlıklı görünür ama hepsi
   * aynı mahallelere yığılmışsa motor kör kalır. 2026-08-31 yerel ölçüm:
   * 65.718 mahallenin yalnızca 1.268'i (%1,9) arsa havuzuna sahip.
   *
   * Eşik bugünkü seviyenin altına konuldu — amaç "iyi mi" demek değil,
   * GERİLEMEYİ yakalamak. Kapsam arttıkça bu sayı da yükseltilmeli.
   */
  HAVUZLU_MAHALLE_MIN: 800,
  /**
   * Günlük D1 satır okuma (ÜST sınır). Ücretsiz katman 5M/gün veriyor;
   * eşik %70'i — alarm servis durmadan önce çalsın.
   *
   * 2026-09-04'te limit doldu ve tek belirti "sunucu hatası" oldu. Sebebi
   * `emlakjet-zenginlestirme.ts`'in saatlik iki tam taraması ve
   * `/toplu-ozet`'in 188.697 satırlık taramasıydı; ikisi de migration 0032 ile
   * önden hesaplanmış tablolara taşındı. Bu kontrol nöbette kalıyor.
   */
  GUNLUK_OKUMA_MAX: 3_500_000,
  /**
   * `il_fiyat_ozet` satır sayısı. 81 il × 3 kategori beklenir ama tüm iller
   * her kategoride veri taşımayabilir; eşik ihtiyatlı.
   *
   * Boş kalması, /toplu-ozet'in sessizce BOŞ liste dönmesi demek — eski hâlde
   * tam tarama en azından bir cevap üretiyordu.
   */
  IL_OZET_MIN: 60,
  /**
   * İmar durumu dolu olan emlakjet ilanı oranı.
   *
   * Üretimde 2026-09 itibarıyla %1,9 — sebebi zenginleştirme hattının geçici
   * hataları (403/429/timeout) KALICI damgalaması. Eşik bugünkü seviyenin
   * biraz üstünde: amaç "iyi mi" demek değil, hattın tamamen durduğunu
   * yakalamak. Kurtarma + yeniden deneme sonrası yükseltilmeli.
   */
  IMAR_DOLULUK_MIN_YUZDE: 3,
  /** Tapu durumu doluluk — aynı hat, aynı gerekçe. */
  TAPU_DOLULUK_MIN_YUZDE: 2,
  /**
   * `koord_kaynagi='parsel'` oranı — GERÇEK parsel koordinatı.
   *
   * "Koordinat kapsamı (%)" kontrolünden farklı: o `lat IS NOT NULL` sayıyor
   * ve tüm koordinatlar mahalle merkezi olsa bile %100 geçer. Spatial emsal
   * motoru gerçek konum istiyor; migration 0028 "parsel koordinatı %0" diye
   * not düşmüş ama sağlık paneline hiç yansımamıştı.
   */
  PARSEL_KOORD_MIN_YUZDE: 1,
  /** Son 24 saatte denenen ilan — saatlik cron × 120 ≈ 2.880 beklenir. */
  ZENGINLESTIRME_24S_MIN: 500,
  /**
   * `ilanlar` tablosundaki FARKLI il_norm sayısı (ÜST sınır). Türkiye'de 81 il
   * var; fazlası bir yerde uydurulmuş demektir.
   *
   * Üretimde 83 vardı: "el zig" (Elâzığ'ın bozuk charset ile normalizasyonu) ve
   * "emlak endeksi" (parser sayfa etiketini il sanmış). Hiçbir katman itiraz
   * etmiyordu çünkü ingest'te il alanı bilinen listeye karşı doğrulanmıyordu.
   * Doğrulama eklendi; bu kontrol de nöbette kalıyor — yeni bir kaçak
   * (ör. doğrudan SQL ile seed) sessizce girerse burada görünür.
   */
  IL_SAYISI_MAX: 81,
} as const;

const GUN_MS = 86_400_000;

// ─── Kontrol fonksiyonu ───────────────────────────────────────────────────────

export async function pipelineHealthKontrol(
  db: D1Database,
): Promise<PipelineKontrolSonucu> {
  const ts = Date.now();
  const kontroller: PipelineKontrol[] = [];

  // 1. Toplam aktif ilan sayısı
  const toplamIlan = await db.prepare(
    `SELECT COUNT(*) as n FROM ilanlar WHERE aktif = 1`,
  ).first<{ n: number }>().catch(() => null);

  kontroller.push({
    ad: "Toplam aktif ilan",
    deger: toplamIlan?.n ?? 0,
    esik: KONTROL_ESLIKLERI.TOPLAM_ILAN_MIN,
    gecti: (toplamIlan?.n ?? 0) >= KONTROL_ESLIKLERI.TOPLAM_ILAN_MIN,
    mesaj: toplamIlan?.n != null
      ? `${toplamIlan.n.toLocaleString("tr-TR")} aktif ilan`
      : "Tablo erişim hatası",
  });

  // 2. Son 7 gün eklenen ilan (scraper canlı mı?)
  const yon7Gun = ts - 7 * GUN_MS;
  const son7GunIlan = await db.prepare(
    `SELECT COUNT(*) as n FROM ilanlar WHERE yakalanma_tarihi >= ?`,
  ).bind(yon7Gun).first<{ n: number }>().catch(() => null);

  kontroller.push({
    ad: "Son 7 gün yeni ilan",
    deger: son7GunIlan?.n ?? 0,
    esik: KONTROL_ESLIKLERI.SON_7_GUN_ILAN_MIN,
    gecti: (son7GunIlan?.n ?? 0) >= KONTROL_ESLIKLERI.SON_7_GUN_ILAN_MIN,
    mesaj: son7GunIlan?.n != null
      ? `${son7GunIlan.n} ilan son 7 günde`
      : "Tablo erişim hatası",
  });

  // 3. Son 30 gün eklenen ilan
  const yon30Gun = ts - 30 * GUN_MS;
  const son30GunIlan = await db.prepare(
    `SELECT COUNT(*) as n FROM ilanlar WHERE yakalanma_tarihi >= ?`,
  ).bind(yon30Gun).first<{ n: number }>().catch(() => null);

  kontroller.push({
    ad: "Son 30 gün yeni ilan",
    deger: son30GunIlan?.n ?? 0,
    esik: KONTROL_ESLIKLERI.SON_30_GUN_ILAN_MIN,
    gecti: (son30GunIlan?.n ?? 0) >= KONTROL_ESLIKLERI.SON_30_GUN_ILAN_MIN,
    mesaj: son30GunIlan?.n != null
      ? `${son30GunIlan.n} ilan son 30 günde`
      : "Tablo erişim hatası",
  });

  // 4. mahalle_istatistik satır sayısı
  const mahalleIstatistik = await db.prepare(
    `SELECT COUNT(*) as n FROM mahalle_istatistik`,
  ).first<{ n: number }>().catch(() => null);

  kontroller.push({
    ad: "Mahalle istatistik kayıtları",
    deger: mahalleIstatistik?.n ?? 0,
    esik: KONTROL_ESLIKLERI.MAHALLE_ISTATISTIK_MIN,
    gecti: (mahalleIstatistik?.n ?? 0) >= KONTROL_ESLIKLERI.MAHALLE_ISTATISTIK_MIN,
    mesaj: mahalleIstatistik?.n != null
      ? `${mahalleIstatistik.n.toLocaleString("tr-TR")} mahalle istatistik kaydı`
      : "Tablo erişim hatası veya tablo boş",
  });

  // 5. mahalle_baseline_ai satır sayısı
  const mahalleBaseline = await db.prepare(
    `SELECT COUNT(*) as n FROM mahalle_baseline_ai`,
  ).first<{ n: number }>().catch(() => null);

  kontroller.push({
    ad: "Mahalle baseline AI kayıtları",
    deger: mahalleBaseline?.n ?? 0,
    esik: KONTROL_ESLIKLERI.MAHALLE_BASELINE_MIN,
    gecti: (mahalleBaseline?.n ?? 0) >= KONTROL_ESLIKLERI.MAHALLE_BASELINE_MIN,
    mesaj: mahalleBaseline?.n != null
      ? `${mahalleBaseline.n.toLocaleString("tr-TR")} mahalle baseline kaydı`
      : "Tablo erişim hatası veya tablo boş",
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SESSİZ BOZULMA KONTROLLERİ
  //
  // Yukarıdaki beş kontrol yalnızca "ilan sayısı düştü mü" sorusunu soruyor.
  // Ama bu sistemde bulunan hataların ÇOĞU sayıyı hiç düşürmedi — hata da
  // vermediler, sadece sessizce yanlış/eksik veri ürettiler:
  //
  //   1. mahalle_merkez tablosu HİÇ YOKTU. Worker koordinat sorgusu try/catch
  //      içindeydi, her zaman null dönüyordu. İlan sayısı normaldi, koordinat
  //      kapsamı %37'ye takılıydı ve kimse fark etmedi.
  //   2. poi_noktalari boştu. /v1/harita/poi boş dizi dönüyordu, hata değil.
  //   3. Scraper 3 ilçeye kilitliydi. Aylardır aynı ilçeleri tarıyordu; toplam
  //      ilan sayısı sabit kaldığı için "sağlıklı" görünüyordu.
  //   4. Kaynak sitesi 403/429 döndüğünde scraper bunu "ilan yok" sayıyordu.
  //
  // Aşağıdaki kontroller bu dört sınıfı hedefliyor. Hepsi "beklenen bir şey
  // olmuyor" biçiminde, "bir şey kötüleşti" biçiminde değil.
  // ══════════════════════════════════════════════════════════════════════════

  await sayimKontrolEkle(db, kontroller, {
    ad: "Mahalle merkez koordinatları",
    sorgu: "SELECT COUNT(*) as n FROM mahalle_merkez",
    esik: KONTROL_ESLIKLERI.MAHALLE_MERKEZ_MIN,
    birim: "merkez",
    // Bu tablo migration 0030'a kadar HİÇ VAR DEĞİLDİ; boşalması Worker
    // koordinat çözümlemesinin tamamen sessizleşmesi demek.
  });

  await sayimKontrolEkle(db, kontroller, {
    ad: "Harita POI noktaları",
    sorgu: "SELECT COUNT(*) as n FROM poi_noktalari",
    esik: KONTROL_ESLIKLERI.POI_MIN,
    birim: "POI",
    // Boşsa /v1/harita/poi sessizce boş dizi döner — hata değil, ölü özellik.
  });

  // Koordinat kapsamı — zenginleştirme/koordinat hattının sessiz durması.
  // Oran kontrolü, çünkü mutlak sayı ilan sayısıyla birlikte büyür.
  const koordKapsam = await db.prepare(
    `SELECT COUNT(*) AS toplam, SUM(lat IS NOT NULL) AS koordlu
     FROM ilanlar WHERE aktif = 1`,
  ).first<{ toplam: number; koordlu: number }>().catch(() => null);
  const koordYuzde = koordKapsam?.toplam
    ? Math.round((100 * (koordKapsam.koordlu ?? 0)) / koordKapsam.toplam)
    : 0;
  kontroller.push({
    ad: "Koordinat kapsamı (%)",
    deger: koordYuzde,
    esik: KONTROL_ESLIKLERI.KOORD_KAPSAM_MIN_YUZDE,
    gecti: koordYuzde >= KONTROL_ESLIKLERI.KOORD_KAPSAM_MIN_YUZDE,
    mesaj: koordKapsam
      ? `%${koordYuzde} (${(koordKapsam.koordlu ?? 0).toLocaleString("tr-TR")}/${koordKapsam.toplam.toLocaleString("tr-TR")})`
      : "Sorgu hatası",
  });

  // Tarama rotasyonu ilerliyor mu — "3 ilçeye kilitlenme" hatasının kontrolü.
  // Son 30 günde kaç FARKLI hedef damgalandı? Rotasyon durursa bu sayı çakılır
  // ama toplam ilan sayısı sabit kaldığı için başka hiçbir kontrol uyarmaz.
  const rotasyon = await db.prepare(
    `SELECT COUNT(*) as n FROM tarama_durum WHERE son_tarama >= ?`,
  ).bind(ts - 30 * GUN_MS).first<{ n: number }>().catch(() => null);
  kontroller.push({
    ad: "Son 30 günde taranan hedef",
    deger: rotasyon?.n ?? 0,
    esik: KONTROL_ESLIKLERI.ROTASYON_30_GUN_MIN,
    gecti: (rotasyon?.n ?? 0) >= KONTROL_ESLIKLERI.ROTASYON_30_GUN_MIN,
    mesaj: rotasyon?.n != null
      ? `${rotasyon.n} hedef damgalandı`
      : "tarama_durum erişim hatası",
  });

  // Bot engeli birikiyor mu — B.4'ün görünür yüzü. Engellenme artık damgalanıyor;
  // damga birikirse hızı düşürmek ya da kaynağı beklemek gerekiyor demektir.
  // Sessiz kalırsa eski davranışa döneriz: engellenen ilçe "ilan yok" sayılır.
  const botEngel = await db.prepare(
    `SELECT COUNT(*) as n FROM tarama_durum WHERE son_durum = 'bot-engel'`,
  ).first<{ n: number }>().catch(() => null);
  kontroller.push({
    ad: "Bot engelli hedef (üst sınır)",
    deger: botEngel?.n ?? 0,
    esik: KONTROL_ESLIKLERI.BOT_ENGEL_MAX,
    gecti: (botEngel?.n ?? 0) <= KONTROL_ESLIKLERI.BOT_ENGEL_MAX,
    mesaj: botEngel?.n != null
      ? `${botEngel.n} hedef 'bot-engel' damgalı`
      : "tarama_durum erişim hatası",
  });

  // ── EMSAL KAPSAMI ─────────────────────────────────────────────────────────
  // Motorun doğruluğunu belirleyen tek şey bu sayı. Backtest (ARSA) ölçtü:
  //   emsal 0    → MAPE %178, bias +%116
  //   emsal 1-4  → MAPE  %94, bias  +%41
  //   emsal 5-19 → MAPE  %50, bias   +%5
  // Yani mahalle başına 5 gözleme ulaşmak, hata yarıya inmek demek.
  //
  // Toplam ilan sayısı bu boşluğu GİZLER: 40 bin ilan "sağlıklı" görünür ama
  // hepsi aynı 8 bin mahalleye yığılmışsa motor hâlâ kör. Bu yüzden ayrı
  // ölçülüyor. Yerel karşılığı: node scripts/kapsam-raporu.mjs
  const havuzluMahalle = await db.prepare(
    `SELECT COUNT(*) AS n FROM (
       SELECT il_norm, ilce_norm, mahalle_norm
       FROM ilanlar
       WHERE aktif = 1 AND kategori = 'arsa' AND mahalle_norm IS NOT NULL
       GROUP BY il_norm, ilce_norm, mahalle_norm
       HAVING COUNT(*) >= ?
     )`,
  ).bind(KONTROL_ESLIKLERI.EMSAL_HAVUZ_ESIGI).first<{ n: number }>().catch(() => null);
  kontroller.push({
    ad: `Havuzlu mahalle (arsa, >=${KONTROL_ESLIKLERI.EMSAL_HAVUZ_ESIGI} emsal)`,
    deger: havuzluMahalle?.n ?? 0,
    esik: KONTROL_ESLIKLERI.HAVUZLU_MAHALLE_MIN,
    gecti: (havuzluMahalle?.n ?? 0) >= KONTROL_ESLIKLERI.HAVUZLU_MAHALLE_MIN,
    mesaj: havuzluMahalle?.n != null
      ? `${havuzluMahalle.n.toLocaleString("tr-TR")} mahalle emsal havuzuna sahip`
      : "ilanlar erişim hatası",
  });

  // ── OKUMA BÜTÇESİ ─────────────────────────────────────────────────────────
  // D1 ücretsiz katmanı günde 5M satır okuma veriyor. 2026-09-04'te bu limit
  // DOLDU ve sistem 500 vermeye başladı — o ana kadar hiçbir kontrol uyarmadı,
  // çünkü kimse `meta.rows_read` toplamıyordu. Limit dolunca yalnızca
  // "sunucu hatası" görünüyor; sebebi görünmüyor.
  //
  // Eşik limitin %70'i: alarm, servis durmadan ÖNCE çalmalı.
  const bugun = new Date().toISOString().slice(0, 10);
  const okuma = await db.prepare(
    `SELECT satir_okuma FROM okuma_butcesi_gunluk WHERE gun = ?`,
  ).bind(bugun).first<{ satir_okuma: number }>().catch(() => null);
  const okunanSatir = okuma?.satir_okuma ?? 0;
  kontroller.push({
    ad: "Günlük D1 satır okuma (üst sınır)",
    deger: okunanSatir,
    esik: KONTROL_ESLIKLERI.GUNLUK_OKUMA_MAX,
    gecti: okunanSatir <= KONTROL_ESLIKLERI.GUNLUK_OKUMA_MAX,
    mesaj: `${okunanSatir.toLocaleString("tr-TR")} satır okundu ` +
      `(ücretsiz katman limiti 5.000.000/gün, eşik %70)`,
  });

  // Özet tabloları doluyor mu — bunlar boşsa sıcak yol eski tam taramalara
  // düşmez, DAHA KÖTÜSÜ olur: /toplu-ozet boş liste döner. Sessiz sıfır.
  await sayimKontrolEkle(db, kontroller, {
    ad: "İl fiyat özeti (önden hesaplanmış)",
    sorgu: "SELECT COUNT(*) as n FROM il_fiyat_ozet",
    esik: KONTROL_ESLIKLERI.IL_OZET_MIN,
    birim: "satır",
  });

  // ── ZENGİNLEŞTİRME HATTI ──────────────────────────────────────────────────
  // Repo kökündeki VERI-HATTI-KONTROL-LISTESI.md şu kuralı koyuyor:
  // "alarm olanlar pipeline-health'e bir kontrol olarak eklenir". Kural
  // poi_noktalari ve mahalle_merkez için uygulanmış, ZENGİNLEŞTİRME HATTI
  // için hiç uygulanmamıştı — oysa aynı belge madde 2'de tam olarak bu hattın
  // sessiz başarısızlığını kendi örneği olarak veriyor.
  //
  // Sonuç: %1,9 imar kapsamı rakamı elle atılmış tek seferlik bir sorgudan
  // geliyordu. Hat bugün tamamen dursa kod tabanında bunu bildirecek tek bir
  // mekanizma yoktu.
  const alanDoluluk = await db.prepare(
    `SELECT COUNT(*) AS toplam,
            SUM(imar_durumu IS NOT NULL) AS imar,
            SUM(tapu_durumu IS NOT NULL) AS tapu,
            SUM(koord_kaynagi = 'parsel') AS parsel_koord
     FROM ilanlar WHERE kaynak = 'emlakjet' AND aktif = 1`,
  ).first<{ toplam: number; imar: number; tapu: number; parsel_koord: number }>()
    .catch(() => null);

  const yuzde = (pay: number | null | undefined, payda: number | undefined) =>
    payda ? Math.round((100 * (pay ?? 0)) / payda) : 0;

  kontroller.push({
    ad: "İmar durumu doluluk (%)",
    deger: yuzde(alanDoluluk?.imar, alanDoluluk?.toplam),
    esik: KONTROL_ESLIKLERI.IMAR_DOLULUK_MIN_YUZDE,
    gecti: yuzde(alanDoluluk?.imar, alanDoluluk?.toplam) >= KONTROL_ESLIKLERI.IMAR_DOLULUK_MIN_YUZDE,
    mesaj: alanDoluluk
      ? `${(alanDoluluk.imar ?? 0).toLocaleString("tr-TR")}/${alanDoluluk.toplam.toLocaleString("tr-TR")} ilanda imar durumu var`
      : "ilanlar erişim hatası",
  });

  kontroller.push({
    ad: "Tapu durumu doluluk (%)",
    deger: yuzde(alanDoluluk?.tapu, alanDoluluk?.toplam),
    esik: KONTROL_ESLIKLERI.TAPU_DOLULUK_MIN_YUZDE,
    gecti: yuzde(alanDoluluk?.tapu, alanDoluluk?.toplam) >= KONTROL_ESLIKLERI.TAPU_DOLULUK_MIN_YUZDE,
    mesaj: alanDoluluk
      ? `${(alanDoluluk.tapu ?? 0).toLocaleString("tr-TR")}/${alanDoluluk.toplam.toLocaleString("tr-TR")} ilanda tapu durumu var`
      : "ilanlar erişim hatası",
  });

  // GERÇEK PARSEL koordinatı — mevcut "Koordinat kapsamı (%)" kontrolünden
  // FARKLI. O kontrol `lat IS NOT NULL` sayıyor ve tüm koordinatlar mahalle
  // merkezi olsa bile %100 geçer. Spatial emsal motoru için gerçek konum
  // gerekiyor; migration 0028 "parsel koordinatı %0" diye not düşmüş ama
  // sağlık paneline hiç yansıtılmamıştı.
  kontroller.push({
    ad: "Gerçek parsel koordinatı (%)",
    deger: yuzde(alanDoluluk?.parsel_koord, alanDoluluk?.toplam),
    esik: KONTROL_ESLIKLERI.PARSEL_KOORD_MIN_YUZDE,
    gecti: yuzde(alanDoluluk?.parsel_koord, alanDoluluk?.toplam) >= KONTROL_ESLIKLERI.PARSEL_KOORD_MIN_YUZDE,
    mesaj: alanDoluluk
      ? `${(alanDoluluk.parsel_koord ?? 0).toLocaleString("tr-TR")} ilanda koord_kaynagi='parsel' ` +
        `(kalanı mahalle merkezi — spatial motor için yetersiz)`
      : "ilanlar erişim hatası",
  });

  // Hat çalışıyor mu — son 24 saatte tur kaydı var mı?
  const sonTur = await db.prepare(
    `SELECT MAX(calisti) AS son, SUM(denenen) AS denenen
     FROM zenginlestirme_log WHERE calisti >= ?`,
  ).bind(ts - GUN_MS).first<{ son: number | null; denenen: number | null }>()
    .catch(() => null);
  kontroller.push({
    ad: "Zenginleştirme turu (son 24s)",
    deger: sonTur?.denenen ?? 0,
    esik: KONTROL_ESLIKLERI.ZENGINLESTIRME_24S_MIN,
    gecti: (sonTur?.denenen ?? 0) >= KONTROL_ESLIKLERI.ZENGINLESTIRME_24S_MIN,
    mesaj: sonTur?.son
      ? `${(sonTur.denenen ?? 0).toLocaleString("tr-TR")} ilan denendi`
      : "son 24 saatte hiç tur kaydı yok — saatlik cron durmuş olabilir",
  });

  // Hayalet il kontrolü — bkz. IL_SAYISI_MAX notu.
  const ilSayisi = await db.prepare(
    `SELECT COUNT(DISTINCT il_norm) AS n FROM ilanlar WHERE aktif = 1`,
  ).first<{ n: number }>().catch(() => null);
  kontroller.push({
    ad: "Farklı il sayısı (üst sınır)",
    deger: ilSayisi?.n ?? 0,
    esik: KONTROL_ESLIKLERI.IL_SAYISI_MAX,
    gecti: (ilSayisi?.n ?? 0) <= KONTROL_ESLIKLERI.IL_SAYISI_MAX,
    mesaj: ilSayisi?.n != null
      ? `${ilSayisi.n} farklı il_norm (Türkiye'de 81 il var)`
      : "ilanlar erişim hatası",
  });

  /**
   * KATMAN DAĞILIMI (Ö3) — üretim backtest'i temsil ediyor mu?
   *
   * Backtest'te kayıtların %62'si `ilanGozlem-mahalle` katmanına düşüyor.
   * Üretimde bunun ne olduğu BİLİNMİYORDU ve bu, M1'in kalibre aralığının
   * değerini doğrudan etkiliyor: o tablo yalnızca ölçülmüş katmanları
   * kapsıyor, ağırlık ölçülmemiş katmandaysa fayda sanal.
   *
   * Kontrol edilen şey "en zayıf katmanın payı". `il-fallback` hiçbir emsale
   * dayanmıyor; payı büyükse motor fiilen sabit bir tablo okuyor demektir.
   * Eşik %40 — keyfi değil: bu oranın üstünde, kullanıcıların çoğunluğu
   * ölçülmemiş bir sayı görüyor olur.
   */
  const dagilim = await katmanDagilimi(db, "arsa", 7).catch(() => []);
  const zayif = dagilim.find((d) => d.katman === "il-fallback");
  const toplamKayit = dagilim.reduce((t, d) => t + d.adet, 0);
  kontroller.push({
    ad: "En zayıf katmanın payı (%, arsa, 7 gün)",
    deger: Math.round(zayif?.oran ?? 0),
    esik: KONTROL_ESLIKLERI.ZAYIF_KATMAN_PAY_MAX,
    // Hiç kayıt yoksa GEÇER: telemetri yeni açıldı ya da trafik yok demektir,
    // bu bir hat arızası değil. Mesaj durumu açıkça söylüyor.
    gecti: toplamKayit === 0 || (zayif?.oran ?? 0) <= KONTROL_ESLIKLERI.ZAYIF_KATMAN_PAY_MAX,
    mesaj: toplamKayit === 0
      ? "son 7 günde katman kaydı yok — telemetri yeni açılmış olabilir"
      : dagilim.map((d) => `${d.katman} %${d.oran}`).join(" · "),
  });

  const alarmSayisi = kontroller.filter((k) => !k.gecti).length;
  const saglikli = alarmSayisi === 0;

  return { ts, saglikli, kontroller, alarmSayisi, emailGonderildi: false };
}

/**
 * Tek satırlık sayım kontrolü ekler.
 *
 * Sorgu patlarsa (tablo yok vb.) deger 0 kabul edilir ve kontrol BAŞARISIZ
 * olur — sessizce "geçti" saymak, bu sistemde tekrar tekrar karşılaştığımız
 * hata sınıfının ta kendisi olurdu.
 */
async function sayimKontrolEkle(
  db: D1Database,
  kontroller: PipelineKontrol[],
  opt: { ad: string; sorgu: string; esik: number; birim: string },
): Promise<void> {
  const r = await db.prepare(opt.sorgu).first<{ n: number }>().catch(() => null);
  const deger = r?.n ?? 0;
  kontroller.push({
    ad: opt.ad,
    deger,
    esik: opt.esik,
    gecti: deger >= opt.esik,
    mesaj: r?.n != null
      ? `${deger.toLocaleString("tr-TR")} ${opt.birim}`
      : "Tablo yok veya erişilemiyor",
  });
}

// ─── Email alarm ──────────────────────────────────────────────────────────────

/**
 * Health check sonucuna göre admin email gönder.
 * Sadece alarm varsa (saglikli === false) gönderilir.
 */
export async function pipelineAlarmEmailGonder(
  env: Env,
  sonuc: PipelineKontrolSonucu,
): Promise<boolean> {
  if (sonuc.saglikli || !env.RESEND_API_KEY) return false;

  // Admin listesini DB'den çek
  const adminler = await env.DB.prepare(
    `SELECT email, ad FROM kullanicilar WHERE admin = 1`,
  ).all<{ email: string; ad: string | null }>().catch(() => ({ results: [] }));

  if (!adminler.results?.length) return false;

  const tarih = new Date(sonuc.ts).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
  const alarmlar = sonuc.kontroller.filter((k) => !k.gecti);

  const alarmHtml = alarmlar.map((k) => `
    <tr style="background:#fef2f2">
      <td style="padding:8px 12px;border-bottom:1px solid #fee2e2;font-weight:500;color:#991b1b">${k.ad}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #fee2e2;color:#dc2626">${k.deger.toLocaleString("tr-TR")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #fee2e2;color:#6b7280">≥ ${k.esik.toLocaleString("tr-TR")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #fee2e2;color:#374151">${k.mesaj}</td>
    </tr>`).join("");

  const tamKontrolHtml = sonuc.kontroller.map((k) => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9">${k.ad}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;color:${k.gecti ? "#16a34a" : "#dc2626"}">${k.deger.toLocaleString("tr-TR")}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;color:#6b7280">≥ ${k.esik.toLocaleString("tr-TR")}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9">${k.gecti ? "✅" : "❌"} ${k.mesaj}</td>
    </tr>`).join("");

  const html = `
    <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:20px">
      <h2 style="color:#991b1b">🚨 Cadastrum Pipeline Alarmı</h2>
      <p style="color:#4b5563">${tarih} — <strong>${sonuc.alarmSayisi} kontrol başarısız</strong></p>

      <h3 style="color:#374151;margin-top:24px">Başarısız Kontroller</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Kontrol</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Mevcut</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Eşik</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Durum</th>
          </tr>
        </thead>
        <tbody>${alarmHtml}</tbody>
      </table>

      <h3 style="color:#374151;margin-top:24px">Tüm Kontroller</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tbody>${tamKontrolHtml}</tbody>
      </table>

      <div style="margin-top:24px;padding:16px;background:#f0f9ff;border-radius:8px;border-left:4px solid #0284c7">
        <strong style="color:#0284c7">Olası Nedenler ve Düzeltme:</strong>
        <ul style="margin:8px 0;padding-left:20px;color:#374151;font-size:14px">
          <li>Scraper durdu → Chrome'da extension Bootstrap başlat</li>
          <li>İstatistik refresh çalışmadı → <code>curl /v1/istatistik/refresh</code></li>
          <li>D1 yazma hatası → Cloudflare dashboard D1 loglarına bak</li>
        </ul>
      </div>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="font-size:12px;color:#64748b">Bu mail her gün 03:00 UTC cron tarafından gönderilir. Devre dışı bırakmak için pipeline_health_check = 0 yap.</p>
    </div>`;

  const metin = `Cadastrum Pipeline Alarmı — ${sonuc.alarmSayisi} kontrol başarısız (${tarih})\n\n${
    alarmlar.map((k) => `❌ ${k.ad}: ${k.deger} (eşik: ${k.esik})\n  ${k.mesaj}`).join("\n")
  }\n\nDüzeltme: Chrome extension Bootstrap başlat veya /v1/istatistik/refresh çağır.`;

  for (const admin of adminler.results ?? []) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Cadastrum <alarm@cadastrum.com.tr>",
        to: [admin.email],
        subject: `🚨 [Cadastrum] Pipeline Alarmı — ${sonuc.alarmSayisi} kontrol başarısız`,
        html,
        text: metin,
      }),
    }).catch(() => {});
  }

  return true;
}

