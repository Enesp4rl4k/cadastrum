/**
 * İlan sitelerinden gelen lokasyon metnini il / ilçe / mahalle olarak ayırır.
 * Detay ve liste sayfalarında aynı kurallar — semt'in mahalle sanılmasını engeller.
 */
import { yerTemizleVeDogrula } from "./yer-temizle";

const MAHALLE_SUFFIX_RE =
  /(?:^|[\s\-/.])(?:Mah\.?|Mh\.?|Mahalle(?:si)?|K[öo]y[üu]?|Beldesi|Belde|Mevkii?)\s*$/i;

export function lokasyonMetniniAyir(lokasyon: string | null): {
  il: string | null;
  ilce: string | null;
  mahalle: string | null;
} {
  if (!lokasyon) return { il: null, ilce: null, mahalle: null };

  const parcalar = lokasyon
    .split(/\s*[/,\-]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  const sonEl = parcalar[parcalar.length - 1];
  let mahalleHam: string | null = null;

  if (parcalar.length >= 4 && sonEl && MAHALLE_SUFFIX_RE.test(sonEl)) {
    mahalleHam = sonEl;
  } else if (parcalar.length === 3 && sonEl && MAHALLE_SUFFIX_RE.test(sonEl)) {
    mahalleHam = sonEl;
  }
  // 3 parça ama suffix yok → muhtemelen semt; mahalle atama (eski hatalı davranış kaldırıldı)

  return {
    il: yerTemizleVeDogrula(parcalar[0] ?? null, "il"),
    ilce: yerTemizleVeDogrula(parcalar[1] ?? null, "ilce"),
    mahalle: yerTemizleVeDogrula(mahalleHam, "mahalle"),
  };
}
