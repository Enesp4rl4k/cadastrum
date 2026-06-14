/**
 * İlçe bazlı statik arsa/tarla baseline TL/m² — cold start kalitesi için.
 *
 * Hiyerarşi (fiyat-tahmin.ts'de):
 *   ilanGozlem-mahalle → ilanGozlem-ilce → ILCE_BASELINE → IL_BASELINE → FALLBACK
 *
 * Değerler: Sahibinden/Hepsiemlak 2025 Ocak ortalama asking, %12 kapanış
 * indirimi uygulanmadan önce (correction zaten motorda yapılıyor).
 * Enflasyon düzeltmesi → enflasyon-duzeltme.ts otomatik uygular.
 *
 * Anahtar formatı: `${normalizeYerAdi(ilAd)}__${normalizeYerAdi(ilceAd)}`
 * normalizeYerAdi → küçük harf, TR→latin, boşluk→tire
 * Örnek: "istanbul__sisli", "ankara__cankaya"
 *
 * Semt çarpanları (ILCE_SEMT_CARPANI): ilçe baseline × carpan
 * Anahtar: `${ilceKey}__${normalizeYerAdi(semtAd)}`
 */

import { enflasyonDuzelt, BASELINE_TARIH } from "../enflasyon-duzeltme";
import { ILCE_BASELINE_AI_ARSA, ILCE_BASELINE_AI_TARLA } from "./ilce-baseline-ai";

export { BASELINE_TARIH };

/** İlçe bazlı ARSA TL/m² baseline (asking fiyat ortalaması, 2025) */
export const ILCE_BASELINE_ARSA: Record<string, number> = {
  // ── İSTANBUL ──────────────────────────────────────────────────
  // Avrupa yakası — merkez/prestij
  "istanbul__besiktas": 65_000,
  "istanbul__sisli": 52_000,
  "istanbul__beyoglu": 45_000,
  "istanbul__sariyer": 55_000,
  "istanbul__bakirkoy": 48_000,
  "istanbul__zeytinburnu": 28_000,
  "istanbul__fatih": 38_000,
  "istanbul__eyupsultan": 22_000,
  "istanbul__kagithane": 26_000,
  // Avrupa yakası — gelişen
  "istanbul__bahcelievler": 30_000,
  "istanbul__bayrampasa": 25_000,
  "istanbul__gunesli": 22_000,
  "istanbul__bagcilar": 18_000,
  "istanbul__kucukcekmece": 20_000,
  "istanbul__esenyurt": 14_000,
  "istanbul__buyukcekmece": 16_000,
  "istanbul__avcilar": 18_000,
  "istanbul__beylikduzu": 20_000,
  "istanbul__basaksehir": 22_000,
  "istanbul__arnavutkoy": 12_000,
  "istanbul__catalca": 8_000,
  "istanbul__silivri": 9_000,
  // Avrupa yakası — kuzey
  "istanbul__gaziosmanpasa": 20_000,
  "istanbul__sultangazi": 16_000,
  "istanbul__esenler": 17_000,
  // Asya yakası — prestij
  "istanbul__uskudar": 40_000,
  "istanbul__kadikoy": 50_000,
  "istanbul__maltepe": 30_000,
  "istanbul__atasehir": 38_000,
  "istanbul__umraniye": 28_000,
  // Asya yakası — gelişen
  "istanbul__kartal": 25_000,
  "istanbul__pendik": 20_000,
  "istanbul__tuzla": 18_000,
  "istanbul__cekmekoy": 22_000,
  "istanbul__sancaktepe": 18_000,
  "istanbul__sultanbeyli": 14_000,
  "istanbul__sile": 10_000,
  "istanbul__beykoz": 30_000,
  "istanbul__adalar": 45_000,

  // ── ANKARA ────────────────────────────────────────────────────
  "ankara__cankaya": 12_000,
  "ankara__yenimahalle": 7_000,
  "ankara__kecioren": 6_500,
  "ankara__mamak": 5_500,
  "ankara__etimesgut": 7_500,
  "ankara__sincan": 5_000,
  "ankara__golbasi": 8_000,
  "ankara__pursaklar": 5_500,
  "ankara__altindag": 5_000,
  "ankara__cubuk": 3_500,
  "ankara__akyurt": 4_000,
  "ankara__kahramankazan": 4_500,
  "ankara__polatli": 2_500,
  "ankara__beypazari": 2_000,

  // ── İZMİR ─────────────────────────────────────────────────────
  "izmir__konak": 18_000,
  "izmir__karsiyaka": 20_000,
  "izmir__bornova": 14_000,
  "izmir__buca": 11_000,
  "izmir__cigli": 10_000,
  "izmir__bayrakli": 13_000,
  "izmir__gaziemir": 9_000,
  "izmir__balcova": 15_000,
  "izmir__narlidere": 18_000,
  "izmir__guzelbahce": 20_000,
  "izmir__cesme": 35_000,
  "izmir__urla": 22_000,
  "izmir__seferihisar": 15_000,
  "izmir__menderes": 9_000,
  "izmir__torbalidere": 8_000,
  "izmir__kemalpasa": 7_000,
  "izmir__bergama": 4_000,
  "izmir__foca": 18_000,
  "izmir__aliaga": 8_000,
  "izmir__dikili": 10_000,
  "izmir__karaburun": 12_000,

  // ── ANTALYA ───────────────────────────────────────────────────
  "antalya__muratpasa": 20_000,
  "antalya__kepez": 10_000,
  "antalya__konyaalti": 18_000,
  "antalya__dosemealti": 12_000,
  "antalya__alanya": 15_000,
  "antalya__manavgat": 10_000,
  "antalya__serik": 8_000,
  "antalya__side": 20_000,
  "antalya__belek": 22_000,
  "antalya__kas": 25_000,
  "antalya__finike": 10_000,
  "antalya__kemer": 20_000,
  "antalya__kumluca": 7_000,

  // ── MUĞLA ─────────────────────────────────────────────────────
  "mugla__bodrum": 45_000,
  "mugla__marmaris": 30_000,
  "mugla__fethiye": 25_000,
  "mugla__ortaca": 15_000,
  "mugla__dalaman": 12_000,
  "mugla__ula": 10_000,
  "mugla__milas": 10_000,
  "mugla__koycegiz": 12_000,
  "mugla__datca": 20_000,
  "mugla__yatagan": 5_000,
  "mugla__merkez": 8_000,

  // ── BURSA ─────────────────────────────────────────────────────
  "bursa__nilufer": 9_000,
  "bursa__osmangazi": 7_000,
  "bursa__yildirim": 5_500,
  "bursa__gemlik": 6_000,
  "bursa__mudanya": 8_000,
  "bursa__gursu": 5_000,
  "bursa__kestel": 5_000,
  "bursa__inegol": 4_500,
  "bursa__iznik": 5_000,
  "bursa__mustafakemalpasa": 3_500,
  "bursa__karacabey": 4_000,

  // ── KOCAELİ ───────────────────────────────────────────────────
  "kocaeli__izmit": 7_000,
  "kocaeli__gebze": 8_000,
  "kocaeli__golcuk": 5_500,
  "kocaeli__darica": 7_000,
  "kocaeli__derince": 6_000,
  "kocaeli__dilova": 6_500,
  "kocaeli__kartepe": 6_000,
  "kocaeli__basiskele": 6_500,
  "kocaeli__cayirova": 8_500,
  "kocaeli__korfez": 6_000,

  // ── SAKARYA ───────────────────────────────────────────────────
  "sakarya__adapazari": 4_500,
  "sakarya__serdivan": 5_500,
  "sakarya__arifiye": 5_000,
  "sakarya__hendek": 3_000,
  "sakarya__sapanca": 5_000,
  "sakarya__kaynarca": 3_000,

  // ── TEKİRDAĞ ──────────────────────────────────────────────────
  "tekirdag__corlu": 5_000,
  "tekirdag__cerkezkoy": 4_500,
  "tekirdag__suleymanpasa": 4_000,
  "tekirdag__kapakli": 4_000,
  "tekirdag__malkara": 2_500,
  "tekirdag__marmara-ereglisi": 5_000,

  // ── YALOVA ────────────────────────────────────────────────────
  "yalova__merkez": 6_000,
  "yalova__cinarcik": 7_000,
  "yalova__armutlu": 5_000,
  "yalova__altinova": 5_500,
  "yalova__termal": 5_500,

  // ── ESKİŞEHİR ─────────────────────────────────────────────────
  "eskisehir__tepebaси": 5_000,
  "eskisehir__odunpazari": 4_500,
  "eskisehir__sivrihisar": 2_000,
  "eskisehir__mihalıccık": 1_800,

  // ── TRABZON ───────────────────────────────────────────────────
  "trabzon__ortahisar": 5_000,
  "trabzon__akcaabat": 4_500,
  "trabzon__arakli": 3_500,
  "trabzon__of": 3_500,
  "trabzon__vakfikebir": 3_000,
  "trabzon__tonya": 3_000,

  // ── ADANA ─────────────────────────────────────────────────────
  "adana__seyhan": 5_500,
  "adana__yuregir": 4_000,
  "adana__cukurova": 5_000,
  "adana__sarimsakli": 3_000,
  "adana__ceyhan": 2_500,
  "adana__kozan": 2_000,

  // ── MERSİN ────────────────────────────────────────────────────
  "mersin__yenisehir": 5_500,
  "mersin__mezitli": 5_000,
  "mersin__toroslar": 4_000,
  "mersin__akdeniz": 4_500,
  "mersin__tarsus": 3_500,
  "mersin__erdemli": 5_000,
  "mersin__silifke": 4_000,
  "mersin__anamur": 3_500,

  // ── GAZİANTEP ─────────────────────────────────────────────────
  "gaziantep__sahinbey": 4_500,
  "gaziantep__sehitkamil": 4_000,
  "gaziantep__nizip": 2_500,
  "gaziantep__islahiye": 2_000,

  // ── KONYA ─────────────────────────────────────────────────────
  "konya__selcuklu": 4_000,
  "konya__karatay": 3_500,
  "konya__meram": 3_500,
  "konya__eregli": 2_000,
  "konya__beysehir": 2_500,

  // ── KAYSERİ ───────────────────────────────────────────────────
  "kayseri__kocasinan": 3_500,
  "kayseri__melikgazi": 3_500,
  "kayseri__talas": 4_000,
  "kayseri__develi": 2_000,

  // ── SAMSUN ────────────────────────────────────────────────────
  "samsun__ilkadim": 3_500,
  "samsun__canik": 3_000,
  "samsun__atakum": 4_000,
  "samsun__tekkeköy": 3_000,
  "samsun__bafra": 2_500,
  "samsun__terme": 2_000,

  // ── BALIKESİR ─────────────────────────────────────────────────
  "balikesir__altieylul": 3_500,
  "balikesir__karesi": 3_000,
  "balikesir__bandirma": 3_500,
  "balikesir__edremit": 5_000,
  "balikesir__gomec": 6_000,
  "balikesir__ayvalik": 8_000,
  "balikesir__burhaniye": 5_500,
  "balikesir__erdek": 5_000,
  "balikesir__gonen": 2_500,

  // ── DENİZLİ ───────────────────────────────────────────────────
  "denizli__pamukkale": 4_000,
  "denizli__merkezefendi": 3_500,
  "denizli__honaz": 3_000,
  "denizli__buldan": 2_500,

  // ── AYDIN ─────────────────────────────────────────────────────
  "aydin__efeler": 5_000,
  "aydin__kuşadasi": 18_000,
  "aydin__didim": 12_000,
  "aydin__nazilli": 3_500,
  "aydin__söke": 4_000,

  // ── HATAY ─────────────────────────────────────────────────────
  "hatay__antakya": 3_000,
  "hatay__iskenderun": 3_500,
  "hatay__dortyol": 2_500,
  "hatay__samandagi": 2_000,
};

/** İlçe bazlı TARLA TL/m² baseline */
export const ILCE_BASELINE_TARLA: Record<string, number> = {
  // İstanbul
  "istanbul__silivri": 1_800,
  "istanbul__catalca": 1_200,
  "istanbul__arnavutkoy": 1_500,
  "istanbul__buyukcekmece": 1_200,
  "istanbul__sile": 800,
  "istanbul__beykoz": 1_500,
  // Ankara
  "ankara__polatli": 400,
  "ankara__cubuk": 500,
  "ankara__kahramankazan": 600,
  "ankara__golbasi": 900,
  "ankara__etimesgut": 1_200,
  // İzmir
  "izmir__cesme": 5_000,
  "izmir__urla": 3_000,
  "izmir__seferihisar": 2_000,
  "izmir__bergama": 600,
  "izmir__torbali": 1_000,
  "izmir__kemalpasa": 800,
  // Antalya
  "antalya__alanya": 2_500,
  "antalya__manavgat": 1_500,
  "antalya__serik": 1_200,
  "antalya__kas": 4_000,
  "antalya__kemer": 3_000,
  // Muğla
  "mugla__bodrum": 8_000,
  "mugla__marmaris": 4_000,
  "mugla__fethiye": 3_500,
  "mugla__dalaman": 1_500,
  "mugla__milas": 1_200,
  // Bursa
  "bursa__gemlik": 800,
  "bursa__mudanya": 1_000,
  "bursa__iznik": 700,
  "bursa__karacabey": 500,
  "bursa__mustafakemalpasa": 400,
  // Balıkesir
  "balikesir__ayvalik": 1_500,
  "balikesir__edremit": 800,
  "balikesir__gomec": 1_000,
  "balikesir__bandirma": 600,
  // Konya
  "konya__meram": 300,
  "konya__selcuklu": 400,
  "konya__beysehir": 400,
  // Trabzon
  "trabzon__ortahisar": 800,
  "trabzon__akcaabat": 700,
};

/**
 * İlçe içi semt/bölge çarpanı — ilçe baseline × carpan.
 * Anahtar: `${ilceKey}__${normalizeYerAdi(semtAd)}`
 *
 * Örnek: İstanbul Sarıyer'de Tarabya diğer semtlere göre +%40 premium
 * → "istanbul__sariyer__tarabya": 1.4
 */
export const ILCE_SEMT_CARPANI: Record<string, number> = {
  // İstanbul — Sarıyer
  "istanbul__sariyer__tarabya": 1.45,
  "istanbul__sariyer__yenikoy": 1.40,
  "istanbul__sariyer__istinye": 1.35,
  "istanbul__sariyer__buyukdere": 1.20,
  "istanbul__sariyer__zekeriyakoy": 1.15,
  "istanbul__sariyer__kilyos": 0.85,
  "istanbul__sariyer__derbent": 0.90,
  // İstanbul — Beşiktaş
  "istanbul__besiktas__bebek": 1.50,
  "istanbul__besiktas__arnavutkoy": 1.40,
  "istanbul__besiktas__etiler": 1.35,
  "istanbul__besiktas__levent": 1.30,
  "istanbul__besiktas__balmumcu": 1.10,
  // İstanbul — Şişli
  "istanbul__sisli__nisantasi": 1.45,
  "istanbul__sisli__tesvikiye": 1.40,
  "istanbul__sisli__mecidiyekoy": 1.15,
  "istanbul__sisli__okmeydani": 0.75,
  // İstanbul — Kadıköy
  "istanbul__kadikoy__moda": 1.35,
  "istanbul__kadikoy__caddebostan": 1.30,
  "istanbul__kadikoy__fenerbahce": 1.25,
  "istanbul__kadikoy__goztepe": 1.15,
  "istanbul__kadikoy__suadiye": 1.30,
  // İstanbul — Ataşehir
  "istanbul__atasehir__acıbadem": 1.20,
  "istanbul__atasehir__icerenkoy": 1.10,
  "istanbul__atasehir__atasehir-merkez": 1.00,
  // İstanbul — Beykoz
  "istanbul__beykoz__anadoluhisari": 1.40,
  "istanbul__beykoz__kandilli": 1.35,
  "istanbul__beykoz__cubuklu": 1.30,
  "istanbul__beykoz__kanlica": 1.35,
  "istanbul__beykoz__pasabahce": 0.90,
  // Ankara — Çankaya
  "ankara__cankaya__cukurambar": 1.30,
  "ankara__cankaya__gaziosmanpasa": 1.35,
  "ankara__cankaya__kavaklidere": 1.40,
  "ankara__cankaya__bahcelievler": 1.20,
  "ankara__cankaya__dikmen": 0.90,
  "ankara__cankaya__ayranci": 1.35,
  // Ankara — Yenimahalle
  "ankara__yenimahalle__batikent": 1.10,
  "ankara__yenimahalle__demetevler": 1.00,
  "ankara__yenimahalle__ostim": 0.85,
  // İzmir — Konak
  "izmir__konak__alsancak": 1.35,
  "izmir__konak__kemeralti": 1.10,
  // İzmir — Karşıyaka
  "izmir__karsiyaka__bostanli": 1.20,
  "izmir__karsiyaka__atakent": 1.10,
  // İzmir — Çeşme
  "izmir__cesme__alacati": 1.60,
  "izmir__cesme__ilica": 1.30,
  "izmir__cesme__merkez": 1.00,
  // Antalya — Alanya
  "antalya__alanya__mahmutlar": 0.90,
  "antalya__alanya__oba": 1.10,
  "antalya__alanya__tosmur": 1.00,
  // Muğla — Bodrum
  "mugla__bodrum__yalikavak": 1.60,
  "mugla__bodrum__turgutreis": 1.20,
  "mugla__bodrum__gumbet": 1.10,
  "mugla__bodrum__bitez": 1.25,
  "mugla__bodrum__gumusluk": 1.50,
  "mugla__bodrum__turkbuku": 1.55,
  "mugla__bodrum__merkez": 1.00,
  // Muğla — Fethiye
  "mugla__fethiye__calis": 1.20,
  "mugla__fethiye__oludeniz": 1.30,
  "mugla__fethiye__hisaronu": 1.15,
};

/** İlçe anahtarı oluştur — normalizeYerAdi'yle uyumlu */
export function ilceKey(ilAd: string, ilceAd: string): string {
  return `${norm(ilAd)}__${norm(ilceAd)}`;
}

/** Semt anahtarı oluştur */
export function semtKey(ilAd: string, ilceAd: string, semtAd: string): string {
  return `${norm(ilAd)}__${norm(ilceAd)}__${norm(semtAd)}`;
}

function norm(s: string): string {
  return s
    .trim()
    .toLocaleLowerCase("tr")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * İlçe baseline araması — arsa veya tarla.
 * Semt çarpanı varsa ilçe baseline × carpan döner.
 * TÜİK TÜFE bazı enflasyon düzeltmesi otomatik uygulanır.
 *
 * @returns { baseline, kaynak } veya null (ilçe bulunamazsa)
 */
export function ilceBaselineGetir(
  ilAd: string,
  ilceAd: string,
  mahalleAd: string | null | undefined,
  kategori: "arsa" | "tarla",
): { baseline: number; kaynak: "ilce-baseline" | "ilce-semt-baseline"; not: string } | null {
  const ik = ilceKey(ilAd, ilceAd);
  const tablo = kategori === "tarla" ? ILCE_BASELINE_TARLA : ILCE_BASELINE_ARSA;
  const aiTablo = kategori === "tarla" ? ILCE_BASELINE_AI_TARLA : ILCE_BASELINE_AI_ARSA;
  // Önce manuel (insan girdisi), sonra AI fallback
  const ilceVal = tablo[ik] ?? aiTablo[ik];
  if (!ilceVal) return null;
  const aiKaynakli = tablo[ik] == null && aiTablo[ik] != null;

  // Semt çarpanı dene
  let hammFiyat = ilceVal;
  let kaynak: "ilce-baseline" | "ilce-semt-baseline" = "ilce-baseline";
  let baseNot = aiKaynakli
    ? `${ilceAd} ilçe baseline (AI fallback) — ${kategori}`
    : `${ilceAd} ilçe baseline (statik 2025-01) — ${kategori}`;

  if (mahalleAd) {
    const sk = semtKey(ilAd, ilceAd, mahalleAd);
    const carpan = ILCE_SEMT_CARPANI[sk];
    if (carpan) {
      hammFiyat = ilceVal * carpan;
      kaynak = "ilce-semt-baseline";
      baseNot = `${ilceAd} / ${mahalleAd} semt çarpanı (${carpan}×${ilceVal.toLocaleString("tr-TR")} TL/m²) — statik 2025-01`;
    }
  }

  // ENFLASYON DÜzELTMESİ — BASELINE_TARIH'ten bugüne TUFE bazı güncelleme
  const { guncelFiyat, carpan: enf } = enflasyonDuzelt(Math.round(hammFiyat));

  const duzeltmeNotu = enf.gecenAy > 0
    ? ` → enflasyon düzeltme +%${Math.round((enf.gayrimenkulCarpan - 1) * 100)} (${enf.gecenAy} ay, ${enf.yontem})`
    : "";

  return {
    baseline: guncelFiyat,
    kaynak,
    not: baseNot + duzeltmeNotu,
  };
}
