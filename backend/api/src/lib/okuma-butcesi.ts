/**
 * D1 okuma/yazma bütçesi sayacı — "bugün limiti kim yedi?"
 *
 * ── NEDEN VAR ───────────────────────────────────────────────────────────────
 *
 * Cloudflare D1 ücretsiz katmanı günde 5M satır okuma veriyor. Bu limit iki
 * kez doldu (2026-09-04, 2026-09-09) ve ikisinde de sistem 500 vermeye
 * başlayana kadar hiçbir uyarı olmadı. 0032 migration'ı bunun için
 * `okuma_butcesi_gunluk` tablosunu kurdu — ama o tabloya yazan kod hiç
 * yazılmadı. `pipeline-health` boş tabloyu okuyup `0 <= 3.500.000` ile yeşil
 * dönüyordu.
 *
 * Bu modül eksik yarıyı tamamlıyor: D1'in her sorgu sonucunda döndürdüğü
 * `meta.rows_read` / `meta.rows_written` toplanıyor ve gün + kaynak bazında
 * tabloya yazılıyor.
 *
 * ── KAPSAM SINIRI — DÜRÜSTÇE ────────────────────────────────────────────────
 *
 * Bu sayaç TAM DEĞİL ve olduğundan iyi görünmemesi için sınırları burada
 * yazılı:
 *
 * 1. ~~`first()` ölçülemiyor~~ — DÜZELTİLDİ (2026-09-11). İlk sürüm `first()`
 *    çağrılarını `metasiz` sayıp bırakıyordu; gerekçe "`all()`'a çevirmek
 *    ölçtüğünü bozar" idi ve YANLIŞTI. Cloudflare belgesi: "first() does not
 *    alter the SQL query" — sorgunun tamamı çalışıyor, `rows_read` aynı.
 *    Bu boşluk küçük değildi: cron yolundaki COUNT(*) tam taramalarının
 *    neredeyse tamamı `first()` kullanıyor. `wrapD1` artık `first()`'ü
 *    `all()` üzerinden çalıştırıp meta'yı sayıyor (bkz. db-timing.ts).
 *    `metasiz_adet` kolonu kalıyor: meta taşımayan bir yol çıkarsa (sürücü
 *    değişikliği vb.) sıfır saymak yerine görünür olsun.
 *
 * 2. **Yalnızca `wrapD1` ile sarılmış yollar sayılıyor.** Sarılmamış bir
 *    `env.DB.prepare(...)` çağrısı görünmez.
 *
 * 3. **Isolate belleğinde birikiyor.** Isolate boşaltma sırasında flush
 *    edilmemiş sayaç kaybolur.
 *
 * Üçü de "gerçek tüketim BUNDAN BÜYÜK olabilir" yönünde. Yani sayaç eşiği
 * aşıyorsa kesin sorun var; aşmıyorsa "sorun yok" DEĞİL, "ölçtüğüm kadarıyla
 * yok" demektir. `pipeline-health` bunu böyle raporluyor.
 */

/** Tek bir kaynağın biriken sayacı. */
export interface KaynakSayaci {
  okuma: number;
  yazma: number;
  sorgu: number;
  metasiz: number;
}

/**
 * Isolate ömrü boyunca biriken sayaçlar — kaynak adı → sayaç.
 *
 * Modül seviyesinde tutuluyor çünkü `wrapD1` çağrısı ile flush noktası
 * (cron sonu / istek sonu) arasında paylaşılan bir taşıyıcı gerekiyor ve
 * D1 binding'i o zinciri taşımıyor.
 */
const sayaclar = new Map<string, KaynakSayaci>();

/** D1 `meta` alanının okuduğumuz kısmı — tam tipi runtime'a göre değişebiliyor. */
interface D1Meta {
  rows_read?: number;
  rows_written?: number;
}

/**
 * Bir D1 çağrısının maliyetini kaynağın sayacına ekler.
 *
 * @param meta `result.meta` — `first()` çağrılarında `undefined` gelir ve
 *   bu durum `metasiz` olarak sayılır (bkz. kapsam sınırı 1).
 */
export function maliyetEkle(kaynak: string, meta: D1Meta | undefined): void {
  let s = sayaclar.get(kaynak);
  if (!s) {
    s = { okuma: 0, yazma: 0, sorgu: 0, metasiz: 0 };
    sayaclar.set(kaynak, s);
  }
  s.sorgu++;
  if (!meta) {
    s.metasiz++;
    return;
  }
  s.okuma += meta.rows_read ?? 0;
  s.yazma += meta.rows_written ?? 0;
}

/** Test ve teşhis için — biriken sayaçların anlık kopyası. */
export function sayaclariOku(): Record<string, KaynakSayaci> {
  return Object.fromEntries([...sayaclar].map(([k, v]) => [k, { ...v }]));
}

/** Test yalıtımı — koşumlar arası sızıntı olmasın. */
export function sayaclariSifirla(): void {
  sayaclar.clear();
}

/**
 * Biriken sayaçları `okuma_butcesi_gunluk`'a yazar ve belleği temizler.
 *
 * @param db SARILMAMIŞ D1 binding. Sarılmış olan verilirse bu yazma da
 *   sayaca eklenir ve sayaç asla boşalmaz — kendi kendini besleyen döngü.
 * @returns yazılan kaynak sayısı
 */
export async function butceyiBosalt(db: D1Database, simdi?: number): Promise<number> {
  if (sayaclar.size === 0) return 0;

  const gun = new Date(simdi ?? Date.now()).toISOString().slice(0, 10);
  // Önce kopyala ve temizle: yazma sırasında yeni çağrılar gelirse onların
  // sayısı kaybolmasın (bir sonraki flush'a kalır), iki kez de yazılmasın.
  const kopya = [...sayaclar];
  sayaclar.clear();

  let yazilan = 0;
  for (const [kaynak, s] of kopya) {
    try {
      await db
        .prepare(
          `INSERT INTO okuma_butcesi_gunluk
             (gun, kaynak, satir_okuma, satir_yazma, sorgu_adet, metasiz_adet, guncellendi)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(gun, kaynak) DO UPDATE SET
             satir_okuma  = satir_okuma  + excluded.satir_okuma,
             satir_yazma  = satir_yazma  + excluded.satir_yazma,
             sorgu_adet   = sorgu_adet   + excluded.sorgu_adet,
             metasiz_adet = metasiz_adet + excluded.metasiz_adet,
             guncellendi  = excluded.guncellendi`,
        )
        .bind(gun, kaynak, s.okuma, s.yazma, s.sorgu, s.metasiz, simdi ?? Date.now())
        .run();
      yazilan++;
    } catch (e) {
      // Yutulmuyor, görünür kalıyor: sessizce boş kalan bir bütçe tablosu
      // "tüketim yok" diye okunur — bu modülün var olma sebebi tam da o.
      console.error("[okuma-butcesi] yazılamadı:", kaynak, e);
    }
  }
  return yazilan;
}

export interface GunlukButce {
  gun: string;
  toplamOkuma: number;
  toplamYazma: number;
  metasizAdet: number;
  kaynaklar: Array<{ kaynak: string; okuma: number; yazma: number; sorgu: number }>;
}

/**
 * Bir günün bütçe tablosunu okur.
 *
 * `null` dönerse "o gün için kayıt yok" demektir — bu, "tüketim sıfır" ile
 * AYNI ŞEY DEĞİL ve çağıran ikisini ayırmak zorunda (P2). `pipeline-health`
 * bunu `bilinmiyor` durumuna çeviriyor.
 */
export async function gunlukButceOku(
  db: D1Database,
  gun?: string,
  simdi?: number,
): Promise<GunlukButce | null> {
  const hedefGun = gun ?? new Date(simdi ?? Date.now()).toISOString().slice(0, 10);
  const r = await db
    .prepare(
      `SELECT kaynak, satir_okuma, satir_yazma, sorgu_adet, metasiz_adet
       FROM okuma_butcesi_gunluk WHERE gun = ? ORDER BY satir_okuma DESC`,
    )
    .bind(hedefGun)
    .all<{
      kaynak: string;
      satir_okuma: number;
      satir_yazma: number;
      sorgu_adet: number;
      metasiz_adet: number;
    }>();

  const satirlar = r.results ?? [];
  if (satirlar.length === 0) return null;

  return {
    gun: hedefGun,
    toplamOkuma: satirlar.reduce((t, s) => t + (s.satir_okuma ?? 0), 0),
    toplamYazma: satirlar.reduce((t, s) => t + (s.satir_yazma ?? 0), 0),
    metasizAdet: satirlar.reduce((t, s) => t + (s.metasiz_adet ?? 0), 0),
    kaynaklar: satirlar.map((s) => ({
      kaynak: s.kaynak,
      okuma: s.satir_okuma ?? 0,
      yazma: s.satir_yazma ?? 0,
      sorgu: s.sorgu_adet ?? 0,
    })),
  };
}
