/**
 * Tip bildirimi — gövde `mahalle-kanonik-kurallar.mjs`'te.
 *
 * Kurallar saf JS olarak yazıldı çünkü hem TS motoru hem `scripts/*.mjs`
 * aynı kaynaktan okumalı; Node'un ESM çözücüsü TS import zincirini
 * yükleyemiyor. Bu dosya TS tarafına tipleri veriyor.
 */

/** Boşluğa duyarsız indeks; çakışan adaylar İKİSİ DE dışarıda bırakılır. */
export function bosluksuzIndeksKur(anahtarlar: Iterable<string>): Map<string, string>;

/** "il__merkez__X" → "il__{il} merkez__X" adayı üretir (kabul kararı çağıranın). */
export function merkezIlcesiniAc(anahtar: string): string | null;

/** Katmanlı çözüm: birebir → boşluksuz → merkez açımı → ikisi birlikte. */
export function kanonikCoz(
  anahtar: string,
  kanonikMi: (k: string) => boolean,
  bosluksuzIndeks: Map<string, string>,
): string | null;
