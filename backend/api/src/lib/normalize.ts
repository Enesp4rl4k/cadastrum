/**
 * Türkçe yer adı normalizasyonu — extension'ın src/lib/tkgm-api.ts
 * `normalizeYerAdi` fonksiyonu ile birebir aynı çıktı verir.
 */
export function normalizeTr(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" })[c] ?? c)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeYerAdi(s: string): string {
  return normalizeTr(s)
    .replace(/\b(mahallesi|mahalle|koyu|koy|beldesi|belde|mah|mh)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function mahalleKey(il: string, ilce: string, mahalle: string): string {
  return `${normalizeYerAdi(il)}__${normalizeYerAdi(ilce)}__${normalizeYerAdi(mahalle)}`;
}

export function ilceKey(il: string, ilce: string): string {
  return `${normalizeYerAdi(il)}__${normalizeYerAdi(ilce)}`;
}
