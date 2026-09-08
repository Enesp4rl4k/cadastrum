/**
 * ÜRETİLEN DOSYA — elle düzenlemeyin.
 * Üret: npm run backtest:real:yaz
 *
 * Hold-out hata dağılımından türetilmiş aralık kantilleri.
 * `oran = gerçek / tahmin` — aralık = [tahmin × q10, tahmin × q90].
 *
 * Bu tablo motorun aralığını ELLE AYARLI katsayılardan ölçülmüş dağılıma
 * taşıyor. Eski aralığın kapsaması ölçülmüştü: arsa %17,7 (hedef %80).
 *
 * Bir kaynak burada YOKSA örneklemi yetersizdi (n < 100) ve motor o kaynakta
 * eski davranışa düşer — az kayıttan kantil çıkarmak uydurmadır.
 *
 * Üretildi: 2026-09-08
 */
export interface AralikKantili {
  /** %80 aralık sınırları */
  q10: number;
  q90: number;
  /** %50 aralık sınırları — ürün varsayılanı */
  q25: number;
  q75: number;
  /** Medyan sapma — 1'den uzaklığı sistematik bias'ı gösterir */
  q50: number;
  n: number;
  /** Bu katmanın ölçülen ±%20 isabeti — kullanıcıya söylenecek sayı */
  within20: number;
}

export const ARALIK_KALIBRASYONU: Readonly<
  Record<string, Readonly<Record<string, AralikKantili>>>
> = {
  "arsa": {
    "ilanGozlem-mahalle": {
      "q10": 0.575,
      "q25": 0.7977,
      "q50": 1.1002,
      "q75": 1.6393,
      "q90": 2.5912,
      "n": 719,
      "within20": 30.6
    },
    "ilanGozlem-ilce": {
      "q10": 0.4062,
      "q25": 0.6479,
      "q50": 1.1405,
      "q75": 2.0907,
      "q90": 4.058,
      "n": 439,
      "within20": 20.3
    }
  },
  "tarla": {
    "ilanGozlem-mahalle": {
      "q10": 0.5475,
      "q25": 0.7943,
      "q50": 1.0169,
      "q75": 1.4397,
      "q90": 2.509,
      "n": 627,
      "within20": 40.5
    },
    "ilanGozlem-ilce": {
      "q10": 0.6189,
      "q25": 0.8228,
      "q50": 1.0076,
      "q75": 1.2571,
      "q90": 2.2162,
      "n": 512,
      "within20": 46.1
    }
  }
} as const;
