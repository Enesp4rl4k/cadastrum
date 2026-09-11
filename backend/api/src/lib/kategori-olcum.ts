/**
 * Ölçülemeyen kategoriler — sayı yerine gerekçe döner.
 *
 * ── NEDEN (G4a, 2026-09-11) ─────────────────────────────────────────────────
 *
 * Motor konut tahmini ÜRETMİYOR (`bolge-baseline.ts` kategoriyi
 * `isTarimsal ? "tarla" : "arsa"` ile belirliyor). Buna rağmen `/v1/fiyat/*`
 * ve `/v1/sorgu` konut isteğine SAYI dönüyordu:
 *
 *   - `/v1/fiyat/*`: gerçek istatistik yoksa `mahalle_baseline_ai`. O tablonun
 *     konut kolonu arsadan türetilmiş (medyan oran tam 1,000; %26,8'i birebir
 *     kopya) ve satırların %61,1'i kendi ilçesinin medyanına birebir eşit.
 *     Konut backtest'i bu yüzden ±%20 = 66,4 raporluyordu —
 *     data/konut-backtest-sizinti.json.
 *   - `/v1/sorgu`: gerçek ilan yoksa sabit `IL_FALLBACK_TL_M2`; kaynak atfının
 *     ("Endeksa, Hepsiemlak, REIDIN") depoda hiçbir dayanağı yok.
 *
 * Korpusta gerçek konut ilanı 0 — hold-out kurulamıyor. Önceden yazılmış kural
 * (GELISTIRME-PLANI-2 §Ö2, -3 §G4): "ölçülemiyorsa kategori sayı döndürmez,
 * gerekçe döndürür. Etiketle-bırak seçeneği yok." Kullanıcı "Kapat"ı seçti.
 *
 * ── BİLİNÇLİ İSTİSNA: ENDEKS ────────────────────────────────────────────────
 *
 * `/v1/api/endeks` bu kapıdan GEÇMİYOR. O uç bir motor tahmini değil, GERÇEK
 * ilanların aylık medyan endeksi (`mahalle_zaman_serisi`) ve kendi asgari-n
 * kuralı var. Kural motorun ölçülemeyen TAHMİNİ hakkında; gözlem medyanı
 * başka bir soru.
 *
 * ── NEDEN 422 ───────────────────────────────────────────────────────────────
 *
 * 200 + `medyan: null` gönderilseydi mevcut istemciler (site, uzantı) medyanı
 * okuyup "— TL/m²" ya da "0" çizebilirdi — sessiz boşluk. 422 mevcut
 * `!res.ok` dallarına düşüyor; yeni istemciler `kod` ile gerekçeyi gösterebiliyor.
 * Kontrol D1'e dokunmadan önce yapılıyor — okuma bütçesi de harcanmıyor.
 */
import type { Context } from "hono";

export const OLCULMEYEN_KATEGORILER: ReadonlySet<string> = new Set(["konut"]);

export const OLCULMEYEN_KATEGORI_KODU = "kategori-olculmedi";

export const OLCULMEYEN_KATEGORI_GEREKCESI =
  "Konut için ölçülmüş fiyat tahmini yok. Motor bu kategoride tahmin " +
  "üretmiyor ve doğruluğunu ölçecek gerçek konut satış/ilan verisi " +
  "toplanmadı; bu yüzden bir sayı gösterilmiyor.";

/**
 * Kategori ölçülemiyorsa hazır 422 yanıtını döner, yoksa `null`.
 *
 *   const olcumsuz = olculmeyenKategoriYaniti(c, kategori);
 *   if (olcumsuz) return olcumsuz;
 */
export function olculmeyenKategoriYaniti(c: Context, kategori: string): Response | null {
  if (!OLCULMEYEN_KATEGORILER.has(kategori)) return null;
  return c.json(
    {
      error: OLCULMEYEN_KATEGORI_GEREKCESI,
      kod: OLCULMEYEN_KATEGORI_KODU,
      kategori,
      olcum: false,
      gerekce: OLCULMEYEN_KATEGORI_GEREKCESI,
    },
    422,
  );
}
