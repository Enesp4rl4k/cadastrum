/**
 * Yer adı temizleme — Sahibinden, Hepsiemlak vb. ilan sitelerinden
 * gelen "kirli" il/ilçe/mahalle adlarını standartlaştırır.
 *
 * Sorunlar:
 *   - "Yeniçiftlik(Sahil)" → semt eki, "Yeniçiftlik" olarak temizlenmeli
 *   - "Marmara Ereğlisi (Merkez)" → "Marmara Ereğlisi"
 *   - "Beşiktaş Mh." / "Mahallesi" → mahalle suffix'i isteğe göre tut/sil
 *   - "İSTANBUL" / "istanbul" → "İstanbul" (Title Case)
 *   - "  Konya  " → "Konya" (boşluk)
 *   - "İl/İlçe" → tek değerden iki ayrı alan çıkar
 */

/** Parantez içindeki bölge eki temizle: "Yeniçiftlik(Sahil)" → "Yeniçiftlik"
 *  Tüm parantez bloklarını siler — sondaki anchor olmadığı için "X(Y) Mh." de yakalanır. */
const PARANTEZ_EK_RE = /\s*\([^)]*\)\s*/g;

/** Suffix kategorileri */
const MAHALLE_SUFFIX_RE = /\s*(?:Mah\.?|Mh\.?|Mahalle(?:si)?|K[öo]y[üu]?|Beldesi|Belde)\s*$/i;
const MERKEZ_SUFFIX_RE = /\s*(?:[Mm]erkez|merkez ilçe)\s*$/;

/** Tipik temizleme — il/ilçe için */
export function ilceTemizle(s: string | null | undefined): string | null {
  if (!s) return null;
  let t = s.trim();
  if (!t) return null;
  // Parantez ekini at: "Marmara Ereğlisi (Merkez)" → "Marmara Ereğlisi"
  t = t.replace(PARANTEZ_EK_RE, "").trim();
  // "Merkez" suffix'i (Konya merkez ilçe = Selçuklu/Karatay olduğunda yanıltıcı)
  // — sadece "Merkez" tek başınaysa bırak (Türkiye'de 30+ il merkez ilçesi var)
  return t || null;
}

/** İl temizle — büyük/küçük tutarsızlık + parantez */
export function ilTemizle(s: string | null | undefined): string | null {
  if (!s) return null;
  let t = s.trim();
  if (!t) return null;
  t = t.replace(PARANTEZ_EK_RE, "").trim();
  // "İSTANBUL" / "istanbul" → "İstanbul" (eğer tüm büyük veya tüm küçükse Title Case yap)
  if (t === t.toUpperCase() || t === t.toLowerCase()) {
    t = t
      .toLocaleLowerCase("tr")
      .split(/(\s|-)/)
      .map(p => /^[\sa-zçğıöşüâîû]+$/i.test(p) && p.trim() ? p.charAt(0).toLocaleUpperCase("tr") + p.slice(1) : p)
      .join("");
  }
  return t || null;
}

/**
 * Mahalle temizle — "Yeniçiftlik Mh." → "Yeniçiftlik" (suffix'i kaldır)
 * Çünkü TKGM API "Yeniçiftlik" arar, "Yeniçiftlik Mh." değil.
 */
export function mahalleTemizle(s: string | null | undefined): string | null {
  if (!s) return null;
  let t = s.trim();
  if (!t) return null;
  // Parantez ekini at
  t = t.replace(PARANTEZ_EK_RE, "").trim();
  // "Mh.", "Mahallesi", "Köyü" suffix'lerini at
  t = t.replace(MAHALLE_SUFFIX_RE, "").trim();
  return t || null;
}

/**
 * "İl/İlçe" tek değerinden iki alan çıkar.
 * "Konya/Meram" → { il: "Konya", ilce: "Meram" }
 * "Konya - Meram" → aynı
 * "Konya" → { il: "Konya", ilce: null }
 */
export function ilIlceAyir(s: string | null | undefined): { il: string | null; ilce: string | null } {
  if (!s) return { il: null, ilce: null };
  const ayrac = /\s*[\/\-—–»›]\s*/;
  const parcalar = s.split(ayrac).map(p => p.trim()).filter(Boolean);
  return {
    il: ilTemizle(parcalar[0] ?? null),
    ilce: ilceTemizle(parcalar[1] ?? null),
  };
}

/**
 * Mantık doğrulama — il/ilçe/mahalle değerleri gerçekten yer adı mı,
 * yoksa kategorik bir başlık (Arsa, Tarla, vb.) mı?
 */
const GECERSIZ_DEGERLER = new Set([
  "arsa", "tarla", "konut", "satilik", "kiralik", "satılık", "kiralık",
  "anasayfa", "emlak", "ilan", "tümü", "tumu",
  // "merkez" KASTEN YOK — Türkiye'de 30+ il "Merkez" ilçesine sahip
  // (Yalova/Merkez, Bilecik/Merkez, Tunceli/Merkez vb.). Geçerli bir ilçe adı.
  "mahalleler", "ilçe", "ilce", "il",
  "secim", "seçim", "yok",
]);

export function yerAdıGeçerliMi(s: string | null | undefined): boolean {
  if (!s) return false;
  const t = s.trim().toLocaleLowerCase("tr");
  if (t.length < 2 || t.length > 60) return false;
  if (GECERSIZ_DEGERLER.has(t)) return false;
  // Sayı veya özel karakterle başlamamalı
  if (/^[0-9]/.test(t)) return false;
  // Sadece harf, boşluk, tire, apostrof, şapkalı karakterler
  if (!/^[\p{L}\s\-'.]+$/u.test(t)) return false;
  return true;
}

/**
 * Tüm temizleme + validation tek seferde.
 * Geçersiz veya boşsa null döner.
 */
export function yerTemizleVeDogrula(s: string | null | undefined, tip: "il" | "ilce" | "mahalle"): string | null {
  let temiz: string | null;
  if (tip === "il") temiz = ilTemizle(s);
  else if (tip === "ilce") temiz = ilceTemizle(s);
  else temiz = mahalleTemizle(s);
  if (!yerAdıGeçerliMi(temiz)) return null;
  return temiz;
}
