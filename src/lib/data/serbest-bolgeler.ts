/** Türkiye Serbest Ticaret Bölgeleri — statik koordinat dataset'i.
 *  Kaynak: Ticaret Bakanlığı, UTIKAD kamuya açık liste.
 *  Kapsam: Aktif 21 serbest bölge + büyük lojistik parklar.
 *  Koordinatlar yaklaşık ±2 km hassasiyetle. */
export const SERBEST_BOLGELER: ReadonlyArray<{
  ad: string;
  il: string;
  lat: number;
  lng: number;
  tip: "serbest-bolge" | "lojistik-park";
}> = [
  // ── Serbest Ticaret Bölgeleri ──────────────────────────────────────────
  { ad: "İstanbul Atatürk Havalimanı STB", il: "İstanbul", lat: 40.9820, lng: 28.8260, tip: "serbest-bolge" },
  { ad: "İstanbul Trakya STB", il: "İstanbul", lat: 41.0640, lng: 28.6430, tip: "serbest-bolge" },
  { ad: "İstanbul Deri-Kimya STB", il: "İstanbul", lat: 40.8480, lng: 29.3620, tip: "serbest-bolge" },
  { ad: "İstanbul Endüstri ve Ticaret STB", il: "İstanbul", lat: 40.9100, lng: 29.3450, tip: "serbest-bolge" },
  { ad: "Ege STB (İzmir)", il: "İzmir", lat: 38.4310, lng: 27.1510, tip: "serbest-bolge" },
  { ad: "İzmir Menemen Deri STB", il: "İzmir", lat: 38.6050, lng: 26.9760, tip: "serbest-bolge" },
  { ad: "Mersin STB", il: "Mersin", lat: 36.8120, lng: 34.5900, tip: "serbest-bolge" },
  { ad: "Antalya STB", il: "Antalya", lat: 36.9170, lng: 30.7380, tip: "serbest-bolge" },
  { ad: "Adana-Yumurtalık STB", il: "Adana", lat: 36.7550, lng: 35.7840, tip: "serbest-bolge" },
  { ad: "Bursa STB", il: "Bursa", lat: 40.4400, lng: 29.1490, tip: "serbest-bolge" },
  { ad: "Trabzon STB", il: "Trabzon", lat: 41.0070, lng: 39.7260, tip: "serbest-bolge" },
  { ad: "Rize Artvin STB", il: "Artvin", lat: 41.4100, lng: 41.3900, tip: "serbest-bolge" },
  { ad: "Samsun STB", il: "Samsun", lat: 41.3100, lng: 36.3250, tip: "serbest-bolge" },
  { ad: "Gaziantep STB", il: "Gaziantep", lat: 37.0640, lng: 37.3810, tip: "serbest-bolge" },
  { ad: "Denizli STB", il: "Denizli", lat: 37.7920, lng: 29.0760, tip: "serbest-bolge" },
  { ad: "Kayseri STB", il: "Kayseri", lat: 38.7080, lng: 35.5210, tip: "serbest-bolge" },
  { ad: "Mardin STB", il: "Mardin", lat: 37.2730, lng: 40.9070, tip: "serbest-bolge" },
  { ad: "Avrupa STB (Tekirdağ-Çorlu)", il: "Tekirdağ", lat: 41.1790, lng: 27.8340, tip: "serbest-bolge" },
  { ad: "Doğu Anadolu STB (Erzurum)", il: "Erzurum", lat: 39.9230, lng: 41.2570, tip: "serbest-bolge" },
  { ad: "İstanbul Altın STB", il: "İstanbul", lat: 41.0250, lng: 29.0170, tip: "serbest-bolge" },
  { ad: "Şanlıurfa STB", il: "Şanlıurfa", lat: 37.1810, lng: 38.9270, tip: "serbest-bolge" },
  // ── Büyük Lojistik Parklar / Merkezler ───────────────────────────────
  { ad: "İstanbul Lojistik Merkezi (İLM)", il: "İstanbul", lat: 41.2580, lng: 28.7390, tip: "lojistik-park" },
  { ad: "İstanbul Güneyi Lojistik Üssü (Tuzla)", il: "İstanbul", lat: 40.8290, lng: 29.3810, tip: "lojistik-park" },
  { ad: "Gebze Lojistik Merkezi", il: "Kocaeli", lat: 40.7950, lng: 29.4520, tip: "lojistik-park" },
  { ad: "Dilovası Lojistik Park", il: "Kocaeli", lat: 40.7740, lng: 29.5510, tip: "lojistik-park" },
  { ad: "İzmir Lojistik Merkezi (Torbalı)", il: "İzmir", lat: 38.1680, lng: 27.3760, tip: "lojistik-park" },
  { ad: "Ankara Lojistik Üssü (Sincan)", il: "Ankara", lat: 39.9710, lng: 32.5950, tip: "lojistik-park" },
  { ad: "Bursa Lojistik Merkezi (Gemlik)", il: "Bursa", lat: 40.4290, lng: 29.1460, tip: "lojistik-park" },
  { ad: "Mersin Liman Lojistik Bölgesi", il: "Mersin", lat: 36.7920, lng: 34.6150, tip: "lojistik-park" },
  { ad: "Gaziantep Lojistik Merkezi", il: "Gaziantep", lat: 37.0450, lng: 37.4120, tip: "lojistik-park" },
  { ad: "Samsun Lojistik Merkezi", il: "Samsun", lat: 41.2870, lng: 36.3350, tip: "lojistik-park" },
  { ad: "Konya Lojistik Merkezi", il: "Konya", lat: 37.8520, lng: 32.4370, tip: "lojistik-park" },
  { ad: "Kayseri Lojistik Merkezi", il: "Kayseri", lat: 38.6950, lng: 35.5380, tip: "lojistik-park" },
  { ad: "Adapazarı Lojistik Parkı", il: "Sakarya", lat: 40.7830, lng: 30.4160, tip: "lojistik-park" },
  { ad: "Çorlu Lojistik Merkezi", il: "Tekirdağ", lat: 41.1750, lng: 27.7980, tip: "lojistik-park" },
];
