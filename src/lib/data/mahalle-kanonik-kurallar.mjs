/**
 * Kanonik mahalle çözüm KURALLARI — saf JS, veri bağımlılığı yok.
 *
 * NEDEN AYRI VE NEDEN .mjs:
 * Bu kurallara iki taraf da ihtiyaç duyuyor —
 *   - uzantı motoru (`mahalle-kanonik.ts`, emsal eşleşmesi ve tablo araması)
 *   - `scripts/*.mjs` (tarama sırasında koordinat çözümü, kapsam raporu)
 *
 * Kuralların ikinci bir kopyasını çıkarmak en kolay yoldu ve reddedildi: iki
 * kopya sessizce ayrışır, sonra tarayıcı bir anahtarı çözemezken motor çözer
 * (ya da tersi) ve kimse fark etmez. Bu projede tam olarak bu sınıf hatayı
 * ayıklıyoruz.
 *
 * TS tarafından import edilebilmesi için bağımlılıksız olması şart: anahtar
 * kümesi DIŞARIDAN parametre olarak geliyor, burada hiçbir veri dosyası
 * import edilmiyor. `mahalle-merkezleri.ts` (3,3 MB) import zinciri yüzünden
 * Node'un ESM çözücüsü bu modülü doğrudan yükleyemiyordu; bağımlılığı
 * kesmek o sorunu da çözüyor.
 */

/**
 * Boşluğa duyarsız indeks kurar.
 *
 * Aynı ilçede boşlukları silindiğinde çakışan iki mahalle varsa İKİSİ DE
 * indeksten çıkarılır. Çakışmada rastgele birini seçmek, emsali yanlış
 * mahalleye yazmak demektir; eşleştirmemek daha az zararlı.
 *
 * @param {Iterable<string>} anahtarlar kanonik "il__ilce__mahalle" anahtarları
 * @returns {Map<string,string>} boşluksuz hâli → kanonik hâli
 */
export function bosluksuzIndeksKur(anahtarlar) {
  const sayim = new Map();
  for (const anahtar of anahtarlar) {
    const bosluksuz = anahtar.replace(/ /g, "");
    if (bosluksuz === anahtar) continue; // boşluksuz adlar zaten birebir eşleşir
    const liste = sayim.get(bosluksuz) ?? [];
    liste.push(anahtar);
    sayim.set(bosluksuz, liste);
  }
  const indeks = new Map();
  for (const [bosluksuz, adaylar] of sayim) {
    if (adaylar.length === 1) indeks.set(bosluksuz, adaylar[0]);
  }
  return indeks;
}

/**
 * "merkez" ilçesini kanonik yazımına çevirir.
 *
 * Kaynak site il merkezini kısaca `merkez` diye yazıyor; kanonik liste
 * `{il} merkez` kullanıyor:
 *
 *   toplanan  elazig__merkez__X   ↔   kanonik  elazig__elazig merkez__X
 *
 * 708 mahalle / 1.386 ilan bu tek kuralla kurtarılıyor (48 il).
 *
 * Yalnızca ADAY üretir; kabul kararı çağırana ait — aday kanonik kümede
 * yoksa kullanılmaz.
 *
 * @param {string} anahtar
 * @returns {string|null}
 */
export function merkezIlcesiniAc(anahtar) {
  const parcalar = anahtar.split("__");
  if (parcalar.length < 3) return null;
  const [il, ilce, ...kalan] = parcalar;
  if (ilce !== "merkez" || !il) return null;
  return `${il}__${il} merkez__${kalan.join("__")}`;
}

/**
 * Bir anahtarı kanonik hâline çevirir. Katmanlar sırayla denenir:
 *   1. birebir
 *   2. boşluğa duyarsız       ("yenikonacik" → "yeni konacik")
 *   3. merkez ilçesi açımı    ("elazig__merkez" → "elazig__elazig merkez")
 *   4. 3 + 2 birlikte — iki kusur aynı kayıtta olabiliyor
 *
 * @param {string} anahtar
 * @param {(k: string) => boolean} kanonikMi kümede var mı?
 * @param {Map<string,string>} bosluksuzIndeks
 * @returns {string|null} kanonik anahtar, ya da eşleşme yoksa null
 */
export function kanonikCoz(anahtar, kanonikMi, bosluksuzIndeks) {
  if (kanonikMi(anahtar)) return anahtar;

  const bosluksuz = bosluksuzIndeks.get(anahtar.replace(/ /g, ""));
  if (bosluksuz) return bosluksuz;

  const merkezli = merkezIlcesiniAc(anahtar);
  if (merkezli) {
    if (kanonikMi(merkezli)) return merkezli;
    const ikisi = bosluksuzIndeks.get(merkezli.replace(/ /g, ""));
    if (ikisi) return ikisi;
  }
  return null;
}
