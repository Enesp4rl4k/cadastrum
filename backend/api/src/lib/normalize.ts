/**
 * Türkçe yer adı normalizasyonu — extension'ın src/lib/tkgm-api.ts
 * `normalizeYerAdi` fonksiyonu ile birebir aynı çıktı verir.
 */
export function normalizeYerAdi(s: string): string {
  return s
    .trim()
    .toLocaleLowerCase("tr")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/\b(mahallesi|mahalle|koyu|koy|beldesi|belde|mah|mh)\b/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function mahalleKey(il: string, ilce: string, mahalle: string): string {
  return `${normalizeYerAdi(il)}__${normalizeYerAdi(ilce)}__${normalizeYerAdi(mahalle)}`;
}

export function ilceKey(il: string, ilce: string): string {
  return `${normalizeYerAdi(il)}__${normalizeYerAdi(ilce)}`;
}
