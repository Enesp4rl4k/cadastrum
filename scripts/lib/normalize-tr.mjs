/**
 * Türkçe yer adı normalizasyonu — src/lib/tkgm-api.ts ile uyumlu.
 */

export function normalizeTr(s) {
  return String(s ?? "")
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c] ?? c)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeYerAdi(s) {
  return normalizeTr(s)
    .replace(/\b(mahallesi|mahalle|koyu|koy|beldesi|belde|mah|mh)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function mahalleKey(ilNorm, ilceNorm, mahalleNorm) {
  if (!ilNorm || !ilceNorm || !mahalleNorm) return null;
  return `${ilNorm}__${ilceNorm}__${mahalleNorm}`;
}
