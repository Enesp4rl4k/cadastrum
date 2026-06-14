/**
 * Cadastrum Lansman Config
 *
 * Tek yerden Chrome Web Store URL ve lansman durumu yönetilir.
 * Eklenti onaylanıp canlıya çıkınca:
 *   1. LAUNCHED = true yap
 *   2. STORE_URL'i doğrula (item ID değişmemeli ama slug değişebilir)
 *   3. npm run build && deploy
 */

/** Chrome Web Store onaylandı mı? */
export const LAUNCHED = true;

/** Chrome Web Store item ID — değişmez, kayıt anında atandı */
export const CHROME_ITEM_ID = "aelbnillaapmecnopkoojcolecbdhiej";

/** Tam Chrome Web Store URL — published olunca canlı */
export const CHROME_STORE_URL = `https://chromewebstore.google.com/detail/cadastrum-arsa-tkgm-parsel-zekasi/${CHROME_ITEM_ID}`;

/** Hero CTA + buton metinleri — duruma göre dinamik */
export const CTA = {
  hero: {
    href: LAUNCHED ? CHROME_STORE_URL : "#hero-waitlist",
    label: LAUNCHED ? "Chrome'a ekle, ücretsiz" : "Erken erişim al →",
    showWaitlistForm: !LAUNCHED,
  },
  fiyat: {
    href: LAUNCHED ? CHROME_STORE_URL : "/kayit",
    label: LAUNCHED ? "Chrome'a ekle" : "Erken erişim al",
  },
  veri: {
    href: LAUNCHED ? CHROME_STORE_URL : "/kayit",
    label: LAUNCHED ? "Eklentiyi yükle →" : "Hesap aç (ücretsiz) →",
  },
} as const;

/** Schema.org JSON-LD için downloadUrl */
export const SCHEMA_DOWNLOAD_URL = LAUNCHED
  ? CHROME_STORE_URL
  : "https://cadastrum.com.tr/";
