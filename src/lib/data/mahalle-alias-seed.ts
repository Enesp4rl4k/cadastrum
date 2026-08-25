/**
 * Mahalle alias seed — gömülü ön eşleşme tablosu.
 *
 * Bu dosya `scripts/mahalle-alias-uret.mjs` tarafından üretilir.
 * Manuel düzenleme YAPMAYIN — script tekrar çalıştırıldığında üzerine yazılır.
 *
 * Henüz script koşulmadıysa bu stub dosyası kullanılır (boş seed).
 * `node scripts/mahalle-alias-uret.mjs` koştuktan sonra bu dosya dolacaktır.
 *
 * Toplam 0 alias. Üretim: (henüz üretilmedi).
 */

export interface MahalleAliasSeedKayit {
  mahalleKodu: number;
  tkgmMahalleAd: string;
  skor: number;
}

/** key = `${ilNorm}|${ilceNorm}|${mahalleNorm}` */
export const MAHALLE_ALIAS_SEED: Readonly<Record<string, MahalleAliasSeedKayit>> = {};

export const ALIAS_SEED_TARIHI = "";
export const ALIAS_SEED_SAYI = 0;
