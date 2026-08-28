/**
 * Enflasyon düzeltme motoru — statik baseline'ları güncel TL değerine çeker.
 *
 * Problem: `ilce-baseline.ts` ve `fiyat-tahmin.ts` içindeki TL/m² değerleri
 * belirli bir tarihte sabitlendi (BASELINE_TARIH). Türkiye'de yıllık %30-75
 * TÜFE varken bu değerler kısa sürede anlamını yitirir.
 *
 * Çözüm: 2 katmanlı strateji
 *  1. TUFE_AYLIK tablosu — bilinen geçmiş aylık TÜFE oranları (bileşik hesap)
 *  2. TCMB API fallback — güncel tabloyu çekmeye çalışır, başarısız olursa
 *     yıllık tahmini kullanır
 *
 * Kullanım:
 *   const c = await enflasyonCarpaniniGetir("2025-01");
 *   const guncelFiyat = Math.round(staticFiyat * c.carpan);
 *
 * Gayrimenkul notu: Konut/arsa fiyatları TÜFE'den genellikle %10-20 daha
 * hızlı artıyor. TUFE_GAYRIMENKUL_PREMIUM bunu kompanse eder.
 */

/** Baseline değerlerin baz alındığı ay (YYYY-MM) */
export const BASELINE_TARIH = "2025-01";

/**
 * Gayrimenkul fiyat artışı TÜFE'nin kaç katı?
 * 2020-2025 ortalama: ~1.15x (arsa için bazen 1.3x ama muhafazakâr tut)
 */
const GAYRIMENKUL_TUFE_MULTIPLIER = 1.15;

/**
 * Bilinen aylık TÜFE oranları (TÜİK resmi, % değişim).
 * Kaynak: TCMB + TÜİK açıklama tarihleri.
 * Son güncelleme: 2026-07 (05-07 tahmini). Bugün 2026-08 veya sonrasıysa
 * tabloda son ay 2026-07'de kalır; eksik aylar AYLIK_ENFLASYON_TAHMINI ile
 * otomatik doldurulur (bkz. tufeTablosuGuncellikKontrol).
 *
 * Format: { "YYYY-MM": aylikOran (0.0532 = %5.32) }
 *
 * ⚠️  YENİ AY GELİNCE: sadece buraya 1 satır ekle, geri kalan otomatik hesaplanır.
 */
const TUFE_AYLIK: Record<string, number> = {
  // 2025
  "2025-01": 0.0503,  // %5.03
  "2025-02": 0.0227,  // %2.27
  "2025-03": 0.0246,  // %2.46
  "2025-04": 0.0300,  // %3.00
  "2025-05": 0.0153,  // %1.53
  "2025-06": 0.0137,  // %1.37
  "2025-07": 0.0206,  // %2.06
  "2025-08": 0.0204,  // %2.04
  "2025-09": 0.0323,  // %3.23
  "2025-10": 0.0255,  // %2.55
  "2025-11": 0.0087,  // %0.87
  "2025-12": 0.0089,  // %0.89
  // 2026
  "2026-01": 0.0484,  // %4.84
  "2026-02": 0.0296,  // %2.96
  "2026-03": 0.0194,  // %1.94
  "2026-04": 0.0418,  // %4.18
  "2026-05": 0.0235,  // %2.35 (tahmini — TÜİK açıklanınca güncelle)
  "2026-06": 0.0218,  // %2.18 (tahmini)
  "2026-07": 0.0195,  // %1.95 (tahmini)
  // 2026-08: TÜİK henüz açıklamadı — buraya eklenmedi, aşağıdaki
  // AYLIK_ENFLASYON_TAHMINI fallback'i otomatik devreye girer.
  // Gerçek oran açıklanınca BU YORUMU SİL, satırı ekle: "2026-08": 0.0XXX,
};

/** Bilinmeyen aylar için aylık enflasyon tahmini (yıllık %35 ≈ aylık ~%2.5) */
const AYLIK_ENFLASYON_TAHMINI = 0.025;

/**
 * İki ay arasındaki bileşik enflasyon çarpanını hesapla.
 * başlangıc dahil, bitiş dahil DEĞİL (mevcut ayın yarısı sayılmaz).
 *
 * Örnek: baslangic="2025-01", bitis="2026-05"
 *  → 2025-01'den 2026-04'e kadar bileşik çarp
 */
function bilesikCarpan(baslangicAy: string, bitisAy: string): number {
  const aylar = ayAraligi(baslangicAy, bitisAy);
  return aylar.reduce((acc, ay) => {
    const oran = TUFE_AYLIK[ay] ?? AYLIK_ENFLASYON_TAHMINI;
    return acc * (1 + oran);
  }, 1);
}

/** "YYYY-MM" → "YYYY-MM" aralığında aylık dizi üret (baslangic dahil, bitis hariç) */
function ayAraligi(baslangic: string, bitis: string): string[] {
  const [by, bm] = baslangic.split("-").map(Number) as [number, number];
  const [ey, em] = bitis.split("-").map(Number) as [number, number];
  const sonuc: string[] = [];
  let y = by, m = bm;
  while (y < ey || (y === ey && m < em)) {
    sonuc.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return sonuc;
}

/** Bugünün ayı "YYYY-MM" formatında */
function bugunAy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export interface EnflasyonCarpani {
  /** Baseline TL fiyatına uygulanacak çarpan (örn. 1.42 = %42 artış) */
  carpan: number;
  /** 
   * Gayrimenkul premium dahil gerçek çarpan.
   * Hesap: enflasyon oranı * premium (baz 1 korunur).
   * (örn. enflasyonOrani > 0 ise 1 + enflasyonOrani * premium)
   */
  gayrimenkulCarpan: number;
  /** Baseline tarihinden bu yana geçen ay sayısı */
  gecenAy: number;
  /** Hesap yöntemi */
  yontem: "tcmb-kfe" | "tufe-bilinen" | "tufe-tahmini" | "karisik";
  /** Kaç ay TÜFE tablosundan, kaç ay tahminle dolduruldu */
  bilinenAySayisi: number;
  tahminliAySayisi: number;
  /** TCMB KFE bölge bilgisi (varsa) */
  tcmbBolge?: string;
  /** Kısa açıklama */
  aciklama: string;
}

/**
 * Verilen baseline tarihinden bugüne enflasyon çarpanını hesapla.
 * Senkron — TUFE_AYLIK tablosundan çalışır, API çağrısı yapmaz.
 *
 * @param baselineTarih "YYYY-MM" formatında (default: BASELINE_TARIH)
 */
export function enflasyonCarpaniniHesapla(
  baselineTarih: string = BASELINE_TARIH,
): EnflasyonCarpani {
  const bugun = bugunAy();
  const aylar = ayAraligi(baselineTarih, bugun);

  if (aylar.length === 0) {
    return {
      carpan: 1,
      gayrimenkulCarpan: 1,
      gecenAy: 0,
      yontem: "tufe-bilinen",
      bilinenAySayisi: 0,
      tahminliAySayisi: 0,
      aciklama: "Baseline bu ay — düzeltme uygulanmadı.",
    };
  }

  let carpan = 1;
  let bilinenAy = 0;
  let tahminliAy = 0;

  for (const ay of aylar) {
    if (TUFE_AYLIK[ay] !== undefined) {
      carpan *= (1 + TUFE_AYLIK[ay]!);
      bilinenAy++;
    } else {
      carpan *= (1 + AYLIK_ENFLASYON_TAHMINI);
      tahminliAy++;
    }
  }

  const yontem: EnflasyonCarpani["yontem"] =
    tahminliAy === 0 ? "tufe-bilinen" :
    bilinenAy === 0 ? "tufe-tahmini" :
    "karisik";

  // Gayrimenkul fiyat artışı TÜFE'nin üzerinde hareket eder.
  // Doğru hesap: enflasyon oranı * premium, baz 1 korunur.
  // Örnek: TÜFE %40 ise (carpan=1.40), gayrimenkul = 1 + 0.40*1.15 = 1.46
  const enflasyonOrani = carpan - 1;
  const gayrimenkulCarpan = enflasyonOrani > 0
    ? 1 + enflasyonOrani * GAYRIMENKUL_TUFE_MULTIPLIER
    : carpan; // 0 veya negatif enflasyonda premium uygulanmaz

  return {
    carpan: Math.round(carpan * 10000) / 10000,
    gayrimenkulCarpan: Math.round(gayrimenkulCarpan * 10000) / 10000,
    gecenAy: aylar.length,
    yontem,
    bilinenAySayisi: bilinenAy,
    tahminliAySayisi: tahminliAy,
    aciklama: tahminliAy === 0
      ? `${aylar.length} ay TÜİK TÜFE verisi — bileşik %${Math.round((carpan - 1) * 100)} artış.`
      : `${bilinenAy} ay TÜİK + ${tahminliAy} ay tahmini — bileşik %${Math.round((carpan - 1) * 100)} artış.`,
  };
}

/**
 * Statik TL/m² değerini bugünün TL'sine çevir.
 * Gayrimenkul premium dahil çarpan uygulanır (TÜFE × 1.15).
 *
 * @param staticFiyat Baseline tarihindeki TL/m² değeri
 * @param baselineTarih "YYYY-MM" (default: BASELINE_TARIH)
 */
export function enflasyonDuzelt(
  staticFiyat: number,
  baselineTarih: string = BASELINE_TARIH,
): { guncelFiyat: number; carpan: EnflasyonCarpani } {
  const carpan = enflasyonCarpaniniHesapla(baselineTarih);
  return {
    guncelFiyat: Math.round(staticFiyat * carpan.gayrimenkulCarpan),
    carpan,
  };
}

/**
 * Async versiyon: TCMB KFE bölgesel endeks varsa onu kullanır,
 * yoksa TÜFE × gayrimenkul premium fallback.
 *
 * @param staticFiyat baseline TL/m²
 * @param baselineTarih "YYYY-MM"
 * @param il parselin ili (NUTS-2 bölgesine map'lenir, "Konya" gibi)
 */
export async function enflasyonDuzeltAsync(
  staticFiyat: number,
  baselineTarih: string = BASELINE_TARIH,
  il?: string | null,
): Promise<{ guncelFiyat: number; carpan: EnflasyonCarpani }> {
  // TCMB KFE primary — bölge bazlı, gerçek konut fiyat endeksi
  if (il) {
    try {
      const { tcmbKfeCarpaniGetir } = await import("./tcmb-kfe");
      const kfe = await tcmbKfeCarpaniGetir(il, baselineTarih);
      if (kfe && kfe.carpan > 0.5 && kfe.carpan < 5) {
        // Mantıklı aralık (0.5x - 5x). KFE çarpan ≈ gayrimenkul çarpan'ı (premium hâli zaten)
        const carpan: EnflasyonCarpani = {
          carpan: kfe.carpan,
          gayrimenkulCarpan: kfe.carpan,
          gecenAy: ayAraligi(baselineTarih, bugunAy()).length,
          yontem: "tcmb-kfe",
          bilinenAySayisi: 0,
          tahminliAySayisi: 0,
          tcmbBolge: kfe.bolge,
          aciklama: `TCMB Konut Fiyat Endeksi (${kfe.bolge}) — bileşik %${Math.round((kfe.carpan - 1) * 100)} artış (${kfe.baslangicTarih} → ${kfe.bitisTarih}).`,
        };
        return {
          guncelFiyat: Math.round(staticFiyat * kfe.carpan),
          carpan,
        };
      }
    } catch (e) {
      // Sessizce yut, TÜFE fallback'e düş
    }
  }

  // Fallback: TÜFE × 1.15 mantığı
  return enflasyonDuzelt(staticFiyat, baselineTarih);
}

/**
 * TÜFE tablosunun güncelliğini kontrol et.
 * Son bilinen aydan bu yana kaç ay geçti?
 * Çok eskimişse uyarı ver (UI'da gösterilebilir).
 */
export function tufeTablosuGuncellikKontrol(): {
  sonBilinenAy: string;
  gecenAySayisi: number;
  uyari: boolean;
  mesaj: string;
} {
  const bugun = bugunAy();
  const bilinen = Object.keys(TUFE_AYLIK).sort();
  const sonBilinenAy = bilinen[bilinen.length - 1] ?? BASELINE_TARIH;
  const gecen = ayAraligi(sonBilinenAy, bugun).length;

  return {
    sonBilinenAy,
    gecenAySayisi: gecen,
    uyari: gecen > 2,
    mesaj: gecen <= 2
      ? `TÜFE tablosu güncel (son: ${sonBilinenAy}).`
      : `TÜFE tablosu ${gecen} ay geride — tahmini oran kullanılıyor. Geliştirici: enflasyon-duzeltme.ts güncelle.`,
  };
}

/**
 * Belirtilen başlangıç ayından bugüne enflasyon çarpanını getirir.
 *
 * Semantik not: dönen `carpan`/`gayrimenkulCarpan` her iki alan da premium DAHİL
 * gayrimenkul çarpanına eşittir (bkz. `enflasyonDuzeltAsync` — KFE dalı zaten
 * premium dahil hesaplıyor, TÜFE fallback dalında `carpan` alanı burada bilinçli
 * olarak `gayrimenkulCarpan` ile eşitlenir). Böylece çağıran taraf hangi dala
 * düştüğünden bağımsız aynı semantiği görür.
 *
 * (ay, il) çiftleri için modül içi cache tutulur — aynı emsal havuzunda yüzlerce
 * ilan aynı ay/il kombinasyonuna düşebildiği için tekrar tekrar KFE fetch / TÜFE
 * hesabı yapılmasını önler.
 */
const enflasyonCarpaniCache = new Map<string, Promise<EnflasyonCarpani>>();

export async function enflasyonCarpaniniGetir(
  baslangicAy: string = BASELINE_TARIH,
  il?: string | null,
): Promise<EnflasyonCarpani> {
  const cacheKey = `${baslangicAy}::${il ?? ""}`;
  const cached = enflasyonCarpaniCache.get(cacheKey);
  if (cached) return cached;

  const promise = enflasyonDuzeltAsync(1, baslangicAy, il).then(({ carpan }) => ({
    ...carpan,
    // TÜFE fallback dalında carpan !== gayrimenkulCarpan; çağıran taraf için
    // tekilleştir (bkz. yukarıdaki semantik not).
    carpan: carpan.gayrimenkulCarpan,
  }));
  enflasyonCarpaniCache.set(cacheKey, promise);
  return promise;
}

/** Test/geliştirme amaçlı — cache'i temizler. */
export function enflasyonCarpaniCacheTemizle(): void {
  enflasyonCarpaniCache.clear();
}

