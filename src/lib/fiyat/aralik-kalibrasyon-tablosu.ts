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
      "q10": 0.5692,
      "q25": 0.7947,
      "q50": 1.1095,
      "q75": 1.696,
      "q90": 2.8902,
      "n": 747,
      "within20": 29.7
    },
    "ilanGozlem-ilce": {
      "q10": 0.4062,
      "q25": 0.6553,
      "q50": 1.1279,
      "q75": 2.0476,
      "q90": 3.9216,
      "n": 414,
      "within20": 21.5
    }
  },
  "tarla": {
    "ilanGozlem-mahalle": {
      "q10": 0.5369,
      "q25": 0.7862,
      "q50": 1.0262,
      "q75": 1.4604,
      "q90": 2.5125,
      "n": 662,
      "within20": 38.8
    },
    "ilanGozlem-ilce": {
      "q10": 0.621,
      "q25": 0.8312,
      "q50": 1.0133,
      "q75": 1.2571,
      "q90": 2.1297,
      "n": 481,
      "within20": 46.4
    }
  }
} as const;
