/**
 * Kalibre belirsizlik aralığı — ölçülmüş hata dağılımından.
 *
 * NEDEN VAR: motorun aralığı elle ayarlı katsayılardan türetiliyordu (güven
 * skoru, likidite çarpanı, baseline band genişletmesi) ve kapsaması HİÇ
 * ölçülmemişti. Ölçüldü (2026-09-07, hold-out n=1200/segment):
 *
 *   arsa  kapsama %17,7 · medyan genişlik %19
 *   tarla kapsama %33,8 · medyan genişlik %20
 *
 * Yani kullanıcıya gösterilen aralık, gerçek fiyatı arsada 6 vakadan 5'inde
 * kaçırıyordu. Bir arayüzde aralık göstermek örtük bir vaattir — "değer büyük
 * ihtimalle burada". Karşılığı yoksa, tek başına bir sayıdan daha zararlıdır,
 * çünkü olmayan bir kesinlik hissi verir.
 *
 * Daha ters bir şey de ölçüldü: aralık genişliği güvenle TERS orantılıydı.
 * En iyi katman (ilanGozlem-mahalle) en dar aralığa sahipti (%19) ve en az
 * kapsıyordu (%15); en zayıf katman (mahalle-baseline) en geniş aralığa
 * sahipti (%56) ve en çok kapsıyordu (%36,8). Genişlik "ne kadar eminiz"e
 * göre ayarlanmıştı, "ne kadar yanılıyoruz"a göre değil.
 *
 * YÖNTEM: her hold-out kaydı için `oran = gerçek / tahmin`. Bu oranın
 * kantilleri tahminin etrafındaki gerçek belirsizliği verir. Tablo
 * `aralik-kalibrasyon-tablosu.ts`'te ve `npm run backtest:real:yaz` ile
 * yeniden üretiliyor — elle yazılmış tek bir sayı yok.
 *
 * SEVİYE SEÇİMİ — ürün varsayılanı %50:
 *   %80 aralık dürüst ama çok geniş (arsa 0,57×–2,89× = %232 genişlik).
 *   %50 aralık daha okunabilir (0,79×–1,70× = %90) ve ifadesi de dürüst:
 *   "yarı yarıya ihtimalle bu aralıkta". Hangi seviye kullanılırsa kullanılsın
 *   ÖLÇÜLEBİLİR — kapsama oranı backtest'te raporlanıyor.
 *
 * KAPSAM SINIRI: tabloda olmayan kaynak (n < 100) için `null` döner ve çağıran
 * eski davranışta kalır. 38 kayıttan kantil çıkarmak, ölçüm görüntüsü altında
 * uydurma yapmak olurdu.
 */
import { ARALIK_KALIBRASYONU, type AralikKantili } from "./aralik-kalibrasyon-tablosu";

export type AralikSeviyesi = "50" | "80";

/** Ürün varsayılanı — gerekçe dosya başında. */
export const VARSAYILAN_ARALIK_SEVIYESI: AralikSeviyesi = "50";

export interface KalibreAralik {
  altPerM2: number;
  ustPerM2: number;
  /** Bu aralığın ölçülen kapsama hedefi — kullanıcıya söylenecek şey. */
  seviye: AralikSeviyesi;
  /** Kalibrasyonun dayandığı hold-out kayıt sayısı. */
  n: number;
  /**
   * Medyan sapma. 1'den uzaklığı, bu katmandaki SİSTEMATİK kaymayı gösterir
   * (ör. 1,11 → motor bu katmanda %11 düşük tahmin ediyor). Aralığa zaten
   * yansıyor; ayrıca döndürülüyor çünkü açıklama katmanının söyleyecek şeyi.
   */
  medyanSapma: number;
}

/**
 * Kaynak katmanı için kalibre aralık üretir.
 *
 * @returns Tabloda kayıt yoksa `null` — çağıran eski davranışını korumalı.
 */
export function kalibreAralik(
  beklenenPerM2: number,
  kategori: string,
  baselineKaynak: string,
  seviye: AralikSeviyesi = VARSAYILAN_ARALIK_SEVIYESI,
): KalibreAralik | null {
  if (!(beklenenPerM2 > 0)) return null;
  const segment = ARALIK_KALIBRASYONU[kategori];
  if (!segment) return null;
  const k: AralikKantili | undefined = segment[baselineKaynak];
  if (!k) return null;

  const [alt, ust] = seviye === "80" ? [k.q10, k.q90] : [k.q25, k.q75];
  return {
    altPerM2: Math.round(beklenenPerM2 * alt),
    ustPerM2: Math.round(beklenenPerM2 * ust),
    seviye,
    n: k.n,
    medyanSapma: k.q50,
  };
}
