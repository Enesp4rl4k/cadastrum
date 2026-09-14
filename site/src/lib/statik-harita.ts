/**
 * Harita sayfasının zorunlu ilk yükünü (özet ısı verisi + ilçe merkezleri) ve
 * iki opsiyonel katmanı (gelişen bölgeler, fiyat trendi) statik dosyadan okur.
 *
 * ── NEDEN (2026-09-14) ──────────────────────────────────────────────────────
 *
 * Workers ücretsiz planı günde 100.000 İSTEK ile sınırlı — D1 bütçesinden
 * TAMAMEN AYRI bir platform tavanı, hiçbir kod optimizasyonuyla kaldırılamaz.
 * /harita/ozet ve /harita/ilceler harita sayfasının HER ziyaretinde (katman
 * değiştirmeden, yakınlaştırmadan bile) tetikleniyordu. build sırasında
 * (scripts/statik-veri-indir.mjs) /v1/statik/harita paketi bir kez indirilip
 * /veri-statik/v1/harita.json olarak yazılıyor; Pages bunu sınırsız sunuyor.
 *
 * KARAR KURALI — src/lib/statik-veri.ts'deki desenle birebir aynı:
 *  1. Dosya yok/bozuk/ağ hatası → null döner, çağıran canlı API'ye düşer
 *     (eski davranış — site asla kırılmaz).
 *  2. Dosya varsa → o alan kullanılır. Sürüm uyuşmazlığı da null sayılır
 *     (eski build'in yarım kalmış dosyası yanlış yorumlanmasın).
 */

const HARITA_YOL = "/veri-statik/v1/harita.json";
const BEKLENEN_SURUM = 1;

export interface HaritaPaketi {
  surum: number;
  uretildi: number;
  ozet: Record<string, unknown>;
  ilceler: unknown;
  gelisenBolgeler: unknown;
  trend: Record<string, unknown>;
}

let getir: (url: string) => Promise<Response> = (url) => fetch(url);
let sozu: Promise<HaritaPaketi | null> | null = null;

export function _testIcinSifirla(yeniGetirici?: typeof getir) {
  getir = yeniGetirici ?? ((url) => fetch(url));
  sozu = null;
}

export function haritaPaketiGetir(): Promise<HaritaPaketi | null> {
  sozu ??= getir(HARITA_YOL)
    .then(async (r) => {
      if (!r.ok) return null;
      const p = (await r.json()) as HaritaPaketi;
      return p.surum === BEKLENEN_SURUM ? p : null;
    })
    .catch((e: unknown) => {
      // Görünür: dosya yoksa/bozuksa site canlı API'ye düşüyor; bu bir hata
      // değil ama neden düşüldüğü konsolda anlaşılabilsin.
      console.info("[statik-harita] paket alınamadı, canlı API kullanılıyor:", e);
      return null;
    });
  return sozu;
}
