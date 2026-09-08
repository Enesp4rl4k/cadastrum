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
      "q10": 0.5556,
      "q25": 0.7947,
      "q50": 1.0958,
      "q75": 1.6796,
      "q90": 2.8908,
      "n": 755,
      "within20": 31.3
    },
    "ilanGozlem-ilce": {
      "q10": 0.417,
      "q25": 0.6606,
      "q50": 1.1288,
      "q75": 2.044,
      "q90": 3.8747,
      "n": 410,
      "within20": 22
    }
  },
  "tarla": {
    "ilanGozlem-mahalle": {
      "q10": 0.528,
      "q25": 0.7816,
      "q50": 1.0261,
      "q75": 1.4556,
      "q90": 2.5306,
      "n": 655,
      "within20": 38.8
    },
    "ilanGozlem-ilce": {
      "q10": 0.4499,
      "q25": 0.7551,
      "q50": 0.9945,
      "q75": 1.2371,
      "q90": 2.0526,
      "n": 474,
      "within20": 42.4
    }
  }
} as const;
