/** Türkiye major ticari limanları — statik koordinat dataset'i */
export const LIMANLAR: ReadonlyArray<{
  ad: string;
  il: string;
  lat: number;
  lng: number;
}> = [
  // Marmara & Boğazlar
  { ad: "Ambarlı Limanı", il: "İstanbul", lat: 40.9730, lng: 28.6717 },
  { ad: "Haydarpaşa Limanı", il: "İstanbul", lat: 40.9956, lng: 29.0197 },
  { ad: "Zeytinburnu Ro-Ro", il: "İstanbul", lat: 40.9887, lng: 28.8980 },
  { ad: "Derince Limanı", il: "Kocaeli", lat: 40.7562, lng: 29.8192 },
  { ad: "Körfez Limanı", il: "Kocaeli", lat: 40.8002, lng: 29.9253 },
  { ad: "Gemlik Limanı", il: "Bursa", lat: 40.4333, lng: 29.1500 },
  { ad: "Bandırma Limanı", il: "Balıkesir", lat: 40.3516, lng: 27.9778 },
  { ad: "Tekirdağ Limanı", il: "Tekirdağ", lat: 40.9839, lng: 27.5106 },
  { ad: "Çanakkale Limanı", il: "Çanakkale", lat: 40.1455, lng: 26.4023 },
  // Ege
  { ad: "Aliağa Limanı", il: "İzmir", lat: 38.8046, lng: 26.9729 },
  { ad: "Alsancak Limanı", il: "İzmir", lat: 38.4375, lng: 27.1498 },
  { ad: "Dikili Limanı", il: "İzmir", lat: 39.0697, lng: 26.8870 },
  { ad: "Çeşme Limanı", il: "İzmir", lat: 38.3244, lng: 26.3060 },
  { ad: "Kuşadası Limanı", il: "Aydın", lat: 37.8574, lng: 27.2602 },
  { ad: "Bodrum Limanı", il: "Muğla", lat: 37.0297, lng: 27.4325 },
  { ad: "Marmaris Limanı", il: "Muğla", lat: 36.8597, lng: 28.2742 },
  { ad: "Fethiye Limanı", il: "Muğla", lat: 36.6458, lng: 29.1109 },
  // Akdeniz
  { ad: "Antalya Limanı", il: "Antalya", lat: 36.8846, lng: 30.6750 },
  { ad: "Alanya Limanı", il: "Antalya", lat: 36.5449, lng: 31.9839 },
  { ad: "Taşucu Limanı", il: "Mersin", lat: 36.3024, lng: 33.8852 },
  { ad: "Mersin Limanı", il: "Mersin", lat: 36.7879, lng: 34.6311 },
  { ad: "İskenderun Limanı", il: "Hatay", lat: 36.5831, lng: 36.1642 },
  // Karadeniz
  { ad: "Karadeniz Ereğli Limanı", il: "Zonguldak", lat: 41.2766, lng: 31.4239 },
  { ad: "Zonguldak Limanı", il: "Zonguldak", lat: 41.4564, lng: 31.8000 },
  { ad: "Samsun Limanı", il: "Samsun", lat: 41.3016, lng: 36.3200 },
  { ad: "Ordu Limanı", il: "Ordu", lat: 40.9827, lng: 37.8821 },
  { ad: "Giresun Limanı", il: "Giresun", lat: 40.9128, lng: 38.3827 },
  { ad: "Trabzon Limanı", il: "Trabzon", lat: 41.0021, lng: 39.7432 },
  { ad: "Hopa Limanı", il: "Artvin", lat: 41.4120, lng: 41.3970 },
];
