/**
 * Katman telemetrisi — "üretimde hangi katman ne sıklıkta çalışıyor?"
 *
 * NEDEN VAR: backtest'teki katman dağılımı (mahalle %62 / ilçe %35 /
 * baseline %3) üretimi temsil ettiği VARSAYILIYORDU ve bu hiç sınanmadı.
 * İki küme yapısal olarak farklı olabilir — backtest korpusu ilan OLAN
 * mahallelerden örnekleniyor, üretimde kullanıcı herhangi bir konuma bakıyor
 * ve havuzlu mahalle oranı yalnızca %4,5.
 *
 * Eğer üretimde ağırlık zayıf katmanlardaysa, M1'in kalibre aralığının
 * faydası da sanaldır: o tablo yalnızca n ≥ 100 olan katmanları kapsıyor.
 *
 * ── GİZLİLİK ────────────────────────────────────────────────────────────────
 *
 * Parsel kimliği, koordinat, fiyat, kullanıcı kimliği TOPLANMIYOR. Cevaplanan
 * soru için hiçbiri gerekmiyor ve toplanmayan veri sızdırılamaz. Kaydedilen:
 * gün + kategori + katman + güven BANDI + emsal BANDI + sayaç.
 *
 * Satırlar günlük toplam (`ON CONFLICT DO UPDATE SET adet = adet + 1`), yani
 * tek bir sorgunun izi tutulmuyor — yalnızca kaç kez olduğu.
 *
 * ── HATA POLİTİKASI ─────────────────────────────────────────────────────────
 *
 * Telemetri yazımı KULLANICI İSTEĞİNİ BLOKLAMAZ ve hata fırlatmaz: ölçüm için
 * fiyat cevabını geciktirmek ya da düşürmek yanlış takas olur. Ama hata
 * SESSİZCE de yutulmuyor — `console.error` ile görünür kalıyor, çünkü sessizce
 * boş kalan bir telemetri tablosu "dağılım şu" diye yanlış okunur.
 */

/** Güven skorunu banda çevirir. Ham skor tutulmuyor — bkz. gizlilik notu. */
export function guvenBandi(skor: number): string {
  if (skor >= 80) return "80+";
  if (skor >= 60) return "60-79";
  if (skor >= 40) return "40-59";
  return "0-39";
}

/** Emsal adedini banda çevirir — backtest'teki kovalarla AYNI sınırlar. */
export function emsalBandi(adet: number): string {
  if (adet === 0) return "0";
  if (adet < 5) return "1-4";
  if (adet < 20) return "5-19";
  return "20+";
}

export interface KatmanKaydi {
  kategori: string;
  katman: string;
  guvenSkoru: number;
  emsalAdet: number;
}

/**
 * Bir tahminin katmanını günlük sayaca ekler.
 *
 * @returns Yazma başarılı mı — çağıran genelde umursamaz, test umursar.
 */
export async function katmaniKaydet(
  db: D1Database,
  kayit: KatmanKaydi,
  simdi?: number,
): Promise<boolean> {
  const ts = simdi ?? Date.now();
  const gun = new Date(ts).toISOString().slice(0, 10);
  try {
    await db
      .prepare(
        `INSERT INTO fiyat_katman_gunluk (gun, kategori, katman, guven_bandi, emsal_bandi, adet)
         VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(gun, kategori, katman, guven_bandi, emsal_bandi)
         DO UPDATE SET adet = adet + 1`,
      )
      .bind(
        gun,
        kayit.kategori,
        kayit.katman,
        guvenBandi(kayit.guvenSkoru),
        emsalBandi(kayit.emsalAdet),
      )
      .run();
    return true;
  } catch (e) {
    // Yutulmuyor, görünür kalıyor: sessizce boş kalan bir telemetri tablosu
    // "dağılım şu" diye yanlış okunur ve bu, tam da ayıkladığımız hata sınıfı.
    console.error("[katman-telemetrisi] yazılamadı:", e);
    return false;
  }
}

export interface KatmanDagilimi {
  katman: string;
  adet: number;
  oran: number;
}

/** Son `gunSayisi` günün katman dağılımı — pipeline-health ve teşhis için. */
export async function katmanDagilimi(
  db: D1Database,
  kategori: string,
  gunSayisi = 7,
  simdi?: number,
): Promise<KatmanDagilimi[]> {
  const ts = simdi ?? Date.now();
  const esik = new Date(ts - gunSayisi * 86_400_000).toISOString().slice(0, 10);
  const r = await db
    .prepare(
      `SELECT katman, SUM(adet) AS toplam
       FROM fiyat_katman_gunluk
       WHERE gun >= ? AND kategori = ?
       GROUP BY katman
       ORDER BY toplam DESC`,
    )
    .bind(esik, kategori)
    .all<{ katman: string; toplam: number }>();

  const satirlar = r.results ?? [];
  const genelToplam = satirlar.reduce((t, s) => t + (s.toplam ?? 0), 0);
  return satirlar.map((s) => ({
    katman: s.katman,
    adet: s.toplam ?? 0,
    oran: genelToplam > 0 ? Math.round(((s.toplam ?? 0) / genelToplam) * 1000) / 10 : 0,
  }));
}
