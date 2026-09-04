/**
 * Kanonik mahalle adı çözümleyicisi — toplanmış ama eşleşmeyen emsali kurtarır.
 *
 * SORUN (ölçüldü, 2026-08-31): tracked emlakjet korpusundaki 40.375 ilanın
 * 5.211'i (%12,9) kanonik mahalle listesine oturmayan bir `mahalle_norm`
 * taşıyor. Bu ilanlar toplanmış, diske yazılmış, tekrar tekrar taranmış —
 * ama motor onları hiçbir mahalleyle eşleştiremediği için emsal havuzuna
 * girmiyorlar. Koordinatları da yok (MERKEZ_TUPLES anahtarı tutmuyor).
 *
 * Uyuşmazlığın en büyük tek sınıfı BOŞLUK:
 *
 *   toplanan                 kanonik
 *   yenikonacik   (442 ilan) yeni konacik
 *   buyukoyumca   ( 34 ilan) buyuk oyumca
 *   asagikaraman  ( 18 ilan) asagi karaman
 *
 * Kaynak sitede mahalle adı URL parçasından geliyor ve bileşik adlar bitişik
 * yazılıyor. Boşluğa duyarsız eşleme 293 mahalleyi / 1.429 ilanı hiç tarama
 * yapmadan geri kazanıyor.
 *
 * NEDEN `normalizeYerAdi` içine konmadı: o fonksiyon il/ilçe adları dahil her
 * yerde kullanılıyor ve site rota slug'larını da üretiyor. Boşlukları global
 * olarak silmek "yeni konacik" ile "yenikonacik"i birleştirirken başka
 * yerlerde iki farklı yeri de birleştirebilirdi. Bu çözücü yalnızca AYNI
 * İLÇE içinde arıyor — çakışma alanı o kadar dar ki güvenli.
 *
 * Kurtarılamayanlar (kasten): "merkez kaytazdere" → "kaytazdere" (fazladan
 * önek), "tepe" → "tepekoy" (ek kaybı). Bunlar boşluk sorunu değil; tahminle
 * eşleştirmek yanlış mahalleye emsal yazma riski taşır. Sayıları raporlanıyor
 * (scripts/kapsam-raporu.mjs), sessizce yutulmuyorlar.
 */

import { MERKEZ_TUPLES } from "./mahalle-merkezleri";
import { bosluksuzIndeksKur, kanonikCoz } from "./mahalle-kanonik-kurallar.mjs";

/** "il__ilce__bosluksuzmahalle" → kanonik "il__ilce__mahalle" */
let _bosluksuzIndeks: Map<string, string> | null = null;

/**
 * Bir mahalle anahtarını kanonik hâline çevirir.
 *
 * Kurallar `mahalle-kanonik-kurallar.mjs`'te — orayı `scripts/*.mjs` de
 * import ediyor. Kuralların ikinci bir kopyası ÇIKARILMADI: iki kopya
 * sessizce ayrışır ve tarayıcı bir anahtarı çözemezken motor çözer (ya da
 * tersi), kimse fark etmez.
 *
 * @param anahtar "il__ilce__mahalle" (normalizeYerAdi geçmiş)
 * @returns kanonik anahtar, ya da eşleşme yoksa null
 */
export function mahalleKanonik(anahtar: string): string | null {
  const idx = (_bosluksuzIndeks ??= bosluksuzIndeksKur(Object.keys(MERKEZ_TUPLES)));
  return kanonikCoz(anahtar, (k: string) => k in MERKEZ_TUPLES, idx);
}

/**
 * Uc parcadan kanonik mahalle anahtari kurar.
 *
 * Emsal eslesmesi bunu ZORUNLU kiliyor: `emsal-havuzu.ts` kullanicinin
 * parselini (TKGM'den, kanonik "yeni konacik") toplanmis ilanla (kaynak
 * siteden, "yenikonacik") DUZ STRING olarak karsilastiriyordu. Iki taraf da
 * bu fonksiyondan gecmeden karsilastirilirsa, o mahalledeki 442 ilan
 * kullaniciya hic gorunmez.
 */
export function kanonikAnahtar(
  ilNorm: string | null | undefined,
  ilceNorm: string | null | undefined,
  mahalleNorm: string | null | undefined,
): string | null {
  if (!ilNorm || !ilceNorm || !mahalleNorm) return null;
  const ham = `${ilNorm}__${ilceNorm}__${mahalleNorm}`;
  return mahalleKanonik(ham) ?? ham;
}

/** Test/teşhis için — indeksin kaç mahalleyi kurtarabildiği. */
export function kanonikIndeksBoyutu(): number {
  const idx = (_bosluksuzIndeks ??= bosluksuzIndeksKur(Object.keys(MERKEZ_TUPLES)));
  return idx.size;
}
