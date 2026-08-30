/**
 * Türkiye'nin 81 ili — normalize adlarıyla TEK KAYNAK.
 *
 * NEDEN VAR: üretimde `/v1/fiyat/toplu-ozet?kategori=arsa` **83 il** döndürüyordu.
 * Fazladan gelen ikisi:
 *
 *   "el zig"          ← Elâzığ'ın bozuk karakterle normalizasyonu
 *   "emlak endeksi"   ← parser bir sayfa etiketini il alanına yazmış
 *
 * Kök neden ölçüldü: `normalizeYerAdi("Elâzığ")` DOĞRU çalışıyor ("elazig").
 * Ama kaynak sayfa yanlış charset ile çözülüp `â` bozulduğunda:
 *
 *   "El?zığ" → normalizeYerAdi → "el zig"
 *
 * Normalizasyon bilinmeyen karakteri boşluğa çeviriyor; sonuç geçerli bir yer
 * adı gibi görünüyor ve D1'e YENİ BİR İL olarak yazılıyor. Hiçbir aşamada hata
 * yok — yalnızca var olmayan bir ilin istatistikleri birikiyor.
 *
 * Eksik olan şey basitti: ingest'te il alanı bilinen listeye karşı HİÇ
 * doğrulanmıyordu.
 */

/** 81 il, `normalizeYerAdi` çıktısı biçiminde. */
export const ILLER_81: readonly string[] = [
  "adana", "adiyaman", "afyonkarahisar", "agri", "aksaray", "amasya", "ankara",
  "antalya", "ardahan", "artvin", "aydin", "balikesir", "bartin", "batman",
  "bayburt", "bilecik", "bingol", "bitlis", "bolu", "burdur", "bursa",
  "canakkale", "cankiri", "corum", "denizli", "diyarbakir", "duzce", "edirne",
  "elazig", "erzincan", "erzurum", "eskisehir", "gaziantep", "giresun",
  "gumushane", "hakkari", "hatay", "igdir", "isparta", "istanbul", "izmir",
  "kahramanmaras", "karabuk", "karaman", "kars", "kastamonu", "kayseri",
  "kilis", "kirikkale", "kirklareli", "kirsehir", "kocaeli", "konya", "kutahya",
  "malatya", "manisa", "mardin", "mersin", "mugla", "mus", "nevsehir", "nigde",
  "ordu", "osmaniye", "rize", "sakarya", "samsun", "sanliurfa", "siirt",
  "sinop", "sivas", "sirnak", "tekirdag", "tokat", "trabzon", "tunceli",
  "usak", "van", "yalova", "yozgat", "zonguldak",
] as const;

const ILLER_SET = new Set(ILLER_81);

/**
 * Yaygın alternatif adlar → kanonik ad.
 *
 * Bunlar GERÇEK kullanımlar; doğrulama eklerken körlemesine reddedilirlerse
 * geçerli ilanlar kaybolur. (Kaynak sitelerin bir kısmı "Afyon", kullanıcı
 * girdileri "Urfa" yazabiliyor.)
 */
const IL_ALIAS: Record<string, string> = {
  "afyon": "afyonkarahisar",
  "urfa": "sanliurfa",
  "sanli urfa": "sanliurfa",
  "maras": "kahramanmaras",
  "k maras": "kahramanmaras",
  "kahraman maras": "kahramanmaras",
  "icel": "mersin",
  "antep": "gaziantep",
  "gazi antep": "gaziantep",
  "afyon karahisar": "afyonkarahisar",
};

/**
 * "el zig" BİLEREK alias listesinde YOK.
 *
 * Elazığ olduğu belli; eşlemek kolay olurdu. Ama o zaman bozuk charset ile gelen
 * her sayfa sessizce "düzeltilmiş" olur ve asıl sorun — kaynağın yanlış
 * çözümlenmesi — bir daha hiç görünmez. Reddedip SAYMAK sebebi görünür tutuyor.
 * Aynı gerekçe "emlak endeksi" için de geçerli: o bir il değil, parser hatası.
 *
 * Not: alias anahtarları `normalizeYerAdi` ÇIKTISI biçiminde olmalı. "hakkâri"
 * ya da "elâzığ" gibi anahtarlar buraya konsa hiç eşleşmezdi (normalizasyon
 * onları zaten "hakkari"/"elazig" yapıyor) — ölü tablo satırı olurlardı.
 */

/**
 * Bir il adını kanonik biçime çevirir.
 *
 * @param ilNorm `normalizeYerAdi`den GEÇMİŞ ad.
 * @returns Kanonik il adı; tanınmıyorsa `null`.
 *
 * `null` dönmesi "bu kayıt nereye ait bilinmiyor" demek. Fiyatı doğru olsa bile
 * konumu güvenilmez olduğundan istatistiğe girmemeli — ama SESSİZCE atılmamalı,
 * çağıran sayıp loglamalı.
 */
export function ilKanonik(ilNorm: string | null | undefined): string | null {
  if (!ilNorm) return null;
  const t = ilNorm.trim();
  if (ILLER_SET.has(t)) return t;
  const alias = IL_ALIAS[t];
  if (alias) return alias;
  return null;
}

/** Bilinen 81 ilden biri mi (alias dahil). */
export function gecerliIl(ilNorm: string | null | undefined): boolean {
  return ilKanonik(ilNorm) !== null;
}
