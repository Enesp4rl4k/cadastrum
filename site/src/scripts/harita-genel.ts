/**
 * Harita genel görünüm — uzak zoom'da ilçe başına TEK nokta.
 *
 * ── NEDEN (2026-09-12) ─────────────────────────────────────────────────────
 *
 * Sayfa görünen HER ilçe için ayrı bir /harita/analiz/birlesik isteği atıyordu
 * (ilçe başına 5.000'e kadar nokta). Türkiye görünümünde yüzlerce ilçe
 * görünür; backend'in 30/saat sınırı ilk açılışta doluyor, geri kalan her
 * istek 429 alıyor ve sayfa bunu "seed edilmemiş ilçe" diye yutuyordu —
 * kullanıcı BOŞ HARİTA görüyordu. Olmasa bile ziyaretçi başına yüzlerce D1
 * sorgusu demekti.
 *
 * Artık uzak görünümde TEK /harita/ozet isteği atılıyor ve her ilçe merkezine
 * toplam işlem sayısıyla ağırlıklı bir nokta konuyor; ülke ölçeğinde ısı
 * haritası aynı bilgiyi veriyor. Ayrıntılı parsel noktaları yalnızca
 * `DETAY_ILCE_MAX` ilçe ya da daha azı görünürken yükleniyor.
 *
 * Saf fonksiyonlar — tarayıcıya ve haritaya bağımlı değil, test edilebilir.
 */

export interface IlceMerkezi {
  ilceKodu: number;
  lat: number;
  lng: number;
}

export interface IlceOzeti {
  ilce_kodu: number;
  nokta_sayisi: number;
  toplam_islem: number;
}

export interface GenelNokta {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { sayi: number };
}

/**
 * Bu sayıdan fazla ilçe görünürken ayrıntı YÜKLENMEZ.
 *
 * 40 × ilçe başına ≤5.000 nokta hâlâ büyük ama bir yakınlaştırma adımı;
 * backend'in 300/saat sınırı içinde birkaç görünümü rahatça karşılıyor.
 */
export const DETAY_ILCE_MAX = 40;

export type GorunumModu = "genel" | "detay";

export function gorunumModu(gorunenIlceSayisi: number): GorunumModu {
  return gorunenIlceSayisi > DETAY_ILCE_MAX ? "genel" : "detay";
}

/**
 * Özet satırlarını ilçe merkezlerine yerleştirir.
 *
 * Merkezi bilinmeyen ya da işlemi olmayan ilçe NOKTA ÜRETMEZ — sıfır ağırlıklı
 * bir nokta "burada hiçbir şey yok" diye okunurdu; bilinmeyen ile yok aynı şey
 * değil. Kaç ilçenin atlandığı ayrıca döner ki görünür kalsın.
 */
export function genelNoktalariKur(
  ozet: IlceOzeti[],
  merkezler: IlceMerkezi[],
): { noktalar: GenelNokta[]; merkeziBilinmeyen: number } {
  const merkez = new Map(merkezler.map((m) => [m.ilceKodu, m]));
  const noktalar: GenelNokta[] = [];
  let merkeziBilinmeyen = 0;
  for (const o of ozet) {
    if (!(o.toplam_islem > 0)) continue;
    const m = merkez.get(o.ilce_kodu);
    if (!m) { merkeziBilinmeyen++; continue; }
    noktalar.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [m.lng, m.lat] },
      properties: { sayi: o.toplam_islem },
    });
  }
  return { noktalar, merkeziBilinmeyen };
}

/**
 * Durum kodunu ve Retry-After'ı TAŞIYAN istek hatası.
 *
 * Eskiden ayrıntı isteği düz `Error("HTTP 429")` fırlatıyordu; çağıran bunu
 * "seed edilmemiş ilçe" diye yutuyordu. Kod ve bekleme süresi ayrı alanlarda
 * olunca 429, "veri yok"tan ayrılabiliyor.
 */
export class HaritaIstekHatasi extends Error {
  constructor(
    readonly durum: number,
    readonly retryAfter: number | null,
  ) {
    super(`HTTP ${durum}`);
    this.name = "HaritaIstekHatasi";
  }
}

/**
 * Bir HTTP hatasını kullanıcıya gösterilecek metne çevirir.
 *
 * 429'u "veri yok" ile karıştırmamak kritik: eskiden sayfa her hatayı "seed
 * edilmemiş ilçe" sayıyordu ve sınıra takılan kullanıcı boş haritayı gerçek
 * boşluk sanıyordu.
 */
export function istekHatasiMetni(durum: number, retryAfterSaniye: number | null): string {
  if (durum === 429) {
    const dk = retryAfterSaniye && retryAfterSaniye > 0 ? Math.ceil(retryAfterSaniye / 60) : null;
    return dk
      ? `İstek sınırına ulaşıldı — yaklaşık ${dk} dk sonra tekrar deneyin`
      : "İstek sınırına ulaşıldı — biraz sonra tekrar deneyin";
  }
  return `Harita verisi alınamadı (HTTP ${durum})`;
}
