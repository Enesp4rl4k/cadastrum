/**
 * Türkiye sel/taşkın risk skoru — il bazlı + mahalle proxy (dere mesafesi).
 *
 * Kaynak: Çevre, Şehircilik ve İklim Değişikliği Bakanlığı, AFAD Sel Master Planı,
 * Meteoroloji Genel Müdürlüğü tarihsel taşkın olayları.
 * Mahalle proxy: OSM waterway mesafesi (scripts/taskin-proxy-uret.mjs).
 *
 * Skala:
 *   YUKSEK : Sık sel olayı yaşanan + 100 yıllık dönem riski yüksek bölgeler
 *   ORTA   : 50-100 yıllık dönem riski olan, dere yatakları olan iller
 *   DUSUK  : Genel taşkın riski düşük, su havzasından uzak iller
 *
 * NOT: Mahalle bazlı kesinlik için TKGM/Çevre Bakanlığı taşkın haritası gerekir.
 * Proxy: dere yatağı <500m → risk bir kademe yükselir.
 */

import { MAHALLE_TASKIN, type MahalleTaskinTuple } from "./mahalle-taskin";
import { normalizeYerAdi } from "../tkgm-api";

function mahalleKeyOlustur(
  ilAd: string | null | undefined,
  ilceAd: string | null | undefined,
  mahalleAd: string | null | undefined,
): string | null {
  if (!ilAd || !ilceAd || !mahalleAd) return null;
  const il = normalizeYerAdi(ilAd);
  const ilce = normalizeYerAdi(ilceAd);
  const mahalle = normalizeYerAdi(mahalleAd);
  if (!il || !ilce || !mahalle) return null;
  return `${il}__${ilce}__${mahalle}`;
}

export type TaskinRiski = "yuksek" | "orta" | "dusuk";

export interface TaskinBilgi {
  risk: TaskinRiski;
  not: string;
}

export const IL_TASKIN: Record<string, TaskinBilgi> = {
  // ── YÜKSEK RİSK — sık sel/taşkın yaşanan iller ─────────────
  "rize":          { risk: "yuksek", not: "2010, 2014 sel afetleri, dere yatakları yüksek" },
  "artvin":        { risk: "yuksek", not: "Karadeniz şiddetli yağış, vadiler" },
  "trabzon":       { risk: "yuksek", not: "Yamaç tipi sel, 2019 dramatik" },
  "giresun":       { risk: "yuksek", not: "2020 Dereli sel afeti" },
  "ordu":          { risk: "yuksek", not: "Karadeniz dereler" },
  "samsun":        { risk: "yuksek", not: "Yeşilırmak deltası, 2021 sel" },
  "bartin":        { risk: "yuksek", not: "2021 Bartın sel afeti" },
  "kastamonu":     { risk: "yuksek", not: "2021 Bozkurt 90+ ölüm" },
  "sinop":         { risk: "yuksek", not: "2021 Ayancık sel afeti" },
  "duzce":         { risk: "yuksek", not: "Akçakoca sahil, dere yatakları" },
  "antalya":       { risk: "yuksek", not: "Manavgat, Side aşırı yağış olayları" },
  "mersin":        { risk: "yuksek", not: "Tarsus, deniz seviye + dere kesişim" },
  "adana":         { risk: "yuksek", not: "Seyhan-Çukurova taşkın havzası" },
  "hatay":         { risk: "yuksek", not: "Asi nehri taşkın bölgesi" },
  "izmir":         { risk: "yuksek", not: "Bornova, Karşıyaka dere yatakları" },
  "bursa":         { risk: "yuksek", not: "Mudanya, Gemlik taşkın bölgeleri" },
  "istanbul":      { risk: "yuksek", not: "Ayamama, Alibeyköy, Kağıthane dereleri (2009 sel)" },

  // ── ORTA RİSK ─────────────────────────────────────────────
  "kocaeli":       { risk: "orta", not: "İzmit körfez yamacı dereleri" },
  "yalova":        { risk: "orta", not: "Çiftlikköy, Subaşı taşkın geçmişi" },
  "sakarya":       { risk: "orta", not: "Sakarya nehri taşkın havzası" },
  "balikesir":     { risk: "orta", not: "Bandırma, Ayvalık kıyı" },
  "canakkale":     { risk: "orta", not: "Edremit, Ayvacık kıyı" },
  "tekirdag":      { risk: "orta", not: "Marmara kıyı" },
  "edirne":        { risk: "orta", not: "Meriç-Tunca-Arda nehirleri" },
  "kirklareli":    { risk: "orta", not: "Trakya dere yatakları" },
  "zonguldak":     { risk: "orta", not: "Filyos taşkını" },
  "karabuk":       { risk: "orta", not: "Filyos havzası" },
  "amasya":        { risk: "orta", not: "Yeşilırmak yamaç" },
  "tokat":         { risk: "orta", not: "Yeşilırmak havzası" },
  "corum":         { risk: "orta", not: "Çorum-Kızılırmak" },
  "sivas":         { risk: "orta", not: "Kızılırmak yukarısı" },
  "kayseri":       { risk: "orta", not: "Erciyes yamaç akıntıları" },
  "manisa":        { risk: "orta", not: "Gediz nehri havzası" },
  "aydin":         { risk: "orta", not: "Büyük Menderes havzası, Söke" },
  "denizli":       { risk: "orta", not: "Menderes ve Çürüksu" },
  "mugla":         { risk: "orta", not: "Dalaman, Köyceğiz" },
  "isparta":       { risk: "orta", not: "Eğirdir-Kovada havzası" },
  "burdur":        { risk: "orta", not: "Burdur gölü çevresi" },
  "afyonkarahisar":{ risk: "orta", not: "Akarçay-Sakarya kaynağı" },
  "kutahya":       { risk: "orta", not: "Porsuk, Felent dereleri" },
  "eskisehir":     { risk: "orta", not: "Porsuk taşkını" },
  "ankara":        { risk: "orta", not: "Ankara Çayı yamaç akıntıları, Mamak vs" },
  "diyarbakir":    { risk: "orta", not: "Dicle taşkın yukarı" },
  "sanliurfa":     { risk: "orta", not: "GAP sulama bölgesi" },
  "gaziantep":     { risk: "orta", not: "Karkamış, Birecik" },
  "kahramanmaras": { risk: "orta", not: "Sürgü, Pazarcık" },
  "mardin":        { risk: "orta", not: "Suriye sınırı dere" },
  "siirt":         { risk: "orta", not: "Botan çayı" },
  "elazig":        { risk: "orta", not: "Munzur, Peri suyu" },
  "malatya":       { risk: "orta", not: "Fırat havzası" },
  "erzincan":      { risk: "orta", not: "Karasu, Munzur" },
  "erzurum":       { risk: "orta", not: "Aras, Çoruh kaynak" },
  "gumushane":     { risk: "orta", not: "Harşit havzası" },
  "bayburt":       { risk: "orta", not: "Çoruh yukarı havzası" },

  // ── DÜŞÜK RİSK — iç Anadolu yüksek + güney kuru ───────────
  "konya":         { risk: "dusuk", not: "Konya kapalı havzası, kuru iklim" },
  "karaman":       { risk: "dusuk", not: "Yarı kurak step" },
  "aksaray":       { risk: "dusuk", not: "Tuz Gölü çevresi kuru" },
  "kirsehir":      { risk: "dusuk", not: "İç Anadolu kuru" },
  "yozgat":        { risk: "dusuk", not: "Yüksek plato" },
  "kirikkale":     { risk: "dusuk", not: "Kızılırmak orta, kuru" },
  "cankiri":       { risk: "dusuk", not: "Yarı kurak" },
  "nevsehir":      { risk: "dusuk", not: "Kapadokya yüksek plato" },
  "nigde":         { risk: "dusuk", not: "İç Anadolu güney" },
  "bilecik":       { risk: "dusuk", not: "Vadi orta" },
  "bolu":          { risk: "dusuk", not: "Yüksek dağlık, sel az" },
  "agri":          { risk: "dusuk", not: "Yüksek dağlık doğu" },
  "kars":          { risk: "dusuk", not: "Doğu yüksek plato" },
  "ardahan":       { risk: "dusuk", not: "Yüksek plato" },
  "igdir":         { risk: "dusuk", not: "Aras vadisi orta" },
  "van":           { risk: "dusuk", not: "Van Gölü çevresi kuru" },
  "bitlis":        { risk: "dusuk", not: "Yüksek dağlık" },
  "mus":           { risk: "dusuk", not: "Yüksek plato" },
  "hakkari":       { risk: "dusuk", not: "Yüksek dağlık" },
  "sirnak":        { risk: "dusuk", not: "Yüksek dağlık" },
  "tunceli":       { risk: "dusuk", not: "Yüksek dağlık" },
  "bingol":        { risk: "dusuk", not: "Yüksek plato" },
  "batman":        { risk: "dusuk", not: "Güneydoğu kuru" },
  "kilis":         { risk: "dusuk", not: "Güneydoğu kuru" },
  "osmaniye":      { risk: "dusuk", not: "Çukurova güney, dere uzak" },
  "adiyaman":      { risk: "dusuk", not: "Güneydoğu" },
  "usak":          { risk: "dusuk", not: "Ege iç" },
};

/** İl bazlı taşkın risk getir */
export function taskinRiskiGetir(ilNorm: string | null | undefined): TaskinBilgi | null {
  if (!ilNorm) return null;
  return IL_TASKIN[ilNorm] ?? { risk: "orta", not: "Veri yok, orta varsayım" };
}

function skorToRisk(skor: number): TaskinRiski {
  if (skor >= 2) return "yuksek";
  if (skor >= 1) return "orta";
  return "dusuk";
}

/**
 * Mahalle proxy taşkın riski — dere mesafesi + il tablosu.
 * il/ilçe/mahalle adı veya önceden hesaplanmış key ile.
 */
export function mahalleTaskinGetir(
  ilAd: string | null | undefined,
  ilceAd: string | null | undefined,
  mahalleAd: string | null | undefined,
): TaskinBilgi | null {
  const ilNorm = ilAd
    ? ilAd.toLocaleLowerCase("tr").replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c] ?? c).replace(/[^a-z0-9]/g, "")
    : null;
  const ilBilgi = taskinRiskiGetir(ilNorm);
  if (!ilBilgi) return null;

  const key = mahalleKeyOlustur(ilAd, ilceAd, mahalleAd);
  if (!key) return ilBilgi;

  const tuple: MahalleTaskinTuple | undefined = MAHALLE_TASKIN[key];
  if (!tuple) return ilBilgi;

  const [dereKm, skor] = tuple;
  const risk = skorToRisk(skor);
  const dereNot =
    dereKm > 0 && dereKm <= 5
      ? `En yakın dere ~${dereKm < 1 ? `${Math.round(dereKm * 1000)}m` : `${dereKm.toFixed(1)}km`}`
      : null;
  return {
    risk,
    not: [ilBilgi.not, dereNot, "OSM dere proxy"].filter(Boolean).join(" · "),
  };
}

/** Parsel için birleşik taşkın riski — mahalle proxy öncelikli */
export function parselTaskinRiskiGetir(
  ilAd: string | null | undefined,
  ilceAd: string | null | undefined,
  mahalleAd: string | null | undefined,
  ilNorm?: string | null,
): TaskinBilgi | null {
  const mahalle = mahalleTaskinGetir(ilAd, ilceAd, mahalleAd);
  if (mahalle) return mahalle;
  return taskinRiskiGetir(ilNorm ?? null);
}

/**
 * Taşkın risk fiyat çarpanı.
 * Yüksek → -%5 (alıcı kaçınır)
 * Orta → -%1
 * Düşük → +%1 (premium)
 */
export function taskinCarpani(risk: TaskinRiski | null): number {
  if (!risk) return 1.0;
  const map: Record<TaskinRiski, number> = {
    "yuksek": 0.95,
    "orta": 0.99,
    "dusuk": 1.01,
  };
  return map[risk];
}
