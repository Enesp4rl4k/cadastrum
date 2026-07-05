/**
 * Baseline Engine — mahalle bazlı baseline lookup + Bayesian shrinkage + triangulation.
 *
 * Hiyerarşi öncelik sırası (yüksekten alçağa):
 *   1. ilanGozlem-mahalle (extension kullanıcı emsali, fiyat-tahmin.ts ele alır)
 *   2. ilanGozlem-ilce
 *   3. mahalle-baseline (BU MOTORDAN geliyor — AI/KNN/ilce-fallback)
 *   4. ilce-semt-baseline
 *   5. ilce-baseline
 *   6. il-baseline
 *   7. fallback
 *
 * Bu modül 3. seviyeyi sağlar.
 *
 * Bayesian shrinkage:
 *   Az emsalli (düşük güven) bir mahalle değeri, ilçe ortalamasına çekilir.
 *   tahmin = α·mahalle + (1-α)·ilçe,    α = guven / (guven + KAPPA)
 *   guven 0   → 0% mahalle, 100% ilçe
 *   guven 50  → ~50/50
 *   guven 80+ → çoğunlukla mahalle
 */

import { MAHALLE_BASELINE, MAHALLE_BASELINE_TARIH, type MahalleBaselineTuple } from "./data/mahalle-baseline";
import { ILCE_BASELINE_ARSA, ILCE_BASELINE_TARLA, ilceKey, ILCE_FALLBACK_SKEW } from "./data/ilce-baseline";
import { ILCE_BASELINE_AI_ARSA, ILCE_BASELINE_AI_TARLA } from "./data/ilce-baseline-ai";
import { MAHALLE_OZELLIK, OZELLIK_ESIK } from "./data/mahalle-ozellik";
import { enflasyonDuzelt, enflasyonDuzeltAsync } from "./enflasyon-duzeltme";
import { normalizeYerAdi } from "./tkgm-api";

export type Kategori = "arsa" | "konut" | "tarla";

export interface MahalleBaselineSonuc {
  baseline: number;          // TL/m² (enflasyon düzeltilmiş, Bayesian shrunk)
  guven: number;             // 0-100
  hamMahalleFiyat: number | null;  // shrinkage öncesi mahalle fiyatı
  ilceFallback: number | null;     // shrinkage'da kullanılan ilçe değeri
  kaynak: "ai" | "knn" | "koy" | "ilce-only" | "fallback";
  not: string;
}

/**
 * Bayesian shrinkage kuvveti — kategori-bazlı.
 * Tarla'da tek bir aykırı ilan baseline'ı çok bozar → daha yüksek κ ile ilçeye daha çok çek.
 * Konut piyasası daha likit ve verisi sık → düşük κ.
 */
export const KAPPA_BY_KATEGORI: Record<Kategori, number> = {
  arsa: 30,
  konut: 25,
  tarla: 45,
};

// İlçe→mahalle skew düzeltmesi data/ilce-baseline.ts'te tanımlı (tek kaynak); re-export.
// Çıpaya uygulandığı için Bayesian shrinkage'la ölçeklenir: ilçeye çok dayanan düşük
// güvenli köy/knn tam düzeltme alır, güçlü mahalle verisi neredeyse hiç.
export { ILCE_FALLBACK_SKEW };
/** Engine kategorisini (konut dahil) skew tablosunun anahtarına eşle — konut arsa çıpası kullanır. */
function skewKategori(kategori: Kategori): "arsa" | "tarla" {
  return kategori === "tarla" ? "tarla" : "arsa";
}
const SEGMENT_INDEX: Record<Kategori, number> = {
  arsa: 0,
  konut: 2,
  tarla: 4,
};

/** Mahalle key oluştur — script ürettiği format ile uyumlu. */
export function mahalleKeyOlustur(
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

/**
 * Mahalle feature vector ile çarpan — 5 öznitelik (sahil/metro/üniversite/anayol/il merkezi).
 *
 * Şehir mahalleleri: sahil + metro + üniversite + anayol önemli
 * Köy/hamlet: sahil + anayol + il merkezine yakınlık kritik (kırsal heterojenliği yakalar)
 *
 * Returns: { carpan, notlar[] }
 *   - carpan 0.85–1.40 arası (sapa köy iskonto, sahil köy premium)
 */
// Memoization cache — aynı mahalle key birçok parsel için tekrar tekrar çağrılır.
// Tuple+eşik tablo değişmez, sonuç deterministik → güvenli cache.
const _ozellikCache = new Map<string, { carpan: number; notlar: string[] }>();

export function ozellikCarpani(mahalleKey: string): { carpan: number; notlar: string[] } {
  const cached = _ozellikCache.get(mahalleKey);
  if (cached) return cached;
  const tuple = MAHALLE_OZELLIK[mahalleKey];
  if (!tuple) {
    const empty = { carpan: 1.0, notlar: [] };
    _ozellikCache.set(mahalleKey, empty);
    return empty;
  }
  const [sahilKm, metroKm, uniKm, anayolKm, ilMerkezKm] = tuple;
  let carpan = 1.0;
  const notlar: string[] = [];

  // Sahile yakınlık — hem şehir hem köy için en güçlü sinyal
  if (sahilKm > 0 && sahilKm <= 0.5) {
    carpan *= 1.18;
    notlar.push(`sahile çok yakın (${(sahilKm * 1000).toFixed(0)}m, +%18)`);
  } else if (sahilKm > 0 && sahilKm <= OZELLIK_ESIK.sahilYakin) {
    carpan *= 1.10;
    notlar.push(`sahile yakın (${sahilKm.toFixed(1)}km, +%10)`);
  } else if (sahilKm > 0 && sahilKm <= 5) {
    carpan *= 1.04;
    notlar.push(`sahil bölgesi (${sahilKm.toFixed(1)}km)`);
  }

  // Metro yakınlığı — sadece şehir için anlamlı
  if (metroKm > 0 && metroKm <= OZELLIK_ESIK.metroYakin) {
    carpan *= 1.10;
    notlar.push(`metro/raylı taşıma yakın (${(metroKm * 1000).toFixed(0)}m, +%10)`);
  } else if (metroKm > 0 && metroKm <= 1.5) {
    carpan *= 1.04;
    notlar.push(`metro yakın (${metroKm.toFixed(1)}km)`);
  }

  // Üniversite yakınlığı — kira/ticari değer
  if (uniKm > 0 && uniKm <= OZELLIK_ESIK.universiteYakin) {
    carpan *= 1.05;
    notlar.push(`üniversite yakın (${uniKm.toFixed(1)}km, +%5)`);
  }

  // Anayol yakınlığı — köy için kritik (kapı önünden geçen ana yol = ulaşılabilirlik)
  if (anayolKm > 0 && anayolKm <= OZELLIK_ESIK.anayolYakin) {
    carpan *= 1.08;
    notlar.push(`ana yola yakın (${(anayolKm * 1000).toFixed(0)}m, +%8)`);
  } else if (anayolKm > 0 && anayolKm <= 3) {
    carpan *= 1.03;
    notlar.push(`ana yol erişimi var (${anayolKm.toFixed(1)}km)`);
  }

  // İl merkezine yakınlık — köy/hamlet için kritik
  // <15km: aktif yatırım bölgesi (banliyö gelişen)
  // 15-30km: erişilebilir köy (haftalık-günlük gidip-gelme)
  // 30-60km: orta uzaklık
  // >60km: sapa
  if (ilMerkezKm > 0 && ilMerkezKm <= OZELLIK_ESIK.ilMerkezYakin) {
    carpan *= 1.12;
    notlar.push(`il merkezi yakın (${ilMerkezKm.toFixed(0)}km, +%12)`);
  } else if (ilMerkezKm > 0 && ilMerkezKm <= 30) {
    carpan *= 1.04;
    notlar.push(`il merkezi erişilebilir (${ilMerkezKm.toFixed(0)}km)`);
  } else if (ilMerkezKm > 60) {
    // Sapa köy — iskonto
    carpan *= 0.92;
    notlar.push(`il merkezinden uzak (${ilMerkezKm.toFixed(0)}km, -%8)`);
  }

  const sonuc = { carpan: Math.round(carpan * 1000) / 1000, notlar };
  _ozellikCache.set(mahalleKey, sonuc);
  return sonuc;
}

function ilceFiyatGetir(ilNorm: string, ilceNorm: string, kategori: Kategori): number | null {
  const key = `${ilNorm}__${ilceNorm}`;
  if (kategori === "tarla") {
    // Önce manuel tablo (insan girdisi öncelikli), sonra AI fallback
    return ILCE_BASELINE_TARLA[key] ?? ILCE_BASELINE_AI_TARLA[key] ?? null;
  }
  // konut için arsa baseline'ı kullan (çoğu zaman benzer mertebe)
  return ILCE_BASELINE_ARSA[key] ?? ILCE_BASELINE_AI_ARSA[key] ?? null;
}

/**
 * Async versiyon: TCMB KFE bölge bazlı endeks ile düzeltme.
 * Eğer kullanıcı TCMB API key'ini ayarlardan girdiyse il'in NUTS-2 bölgesine göre
 * gerçek konut fiyat endeksi uygulanır. Yoksa TÜFE × 1.15 fallback (sync versiyon).
 */
export async function mahalleBaselineGetirAsync(
  ilAd: string | null | undefined,
  ilceAd: string | null | undefined,
  mahalleAd: string | null | undefined,
  kategori: Kategori,
): Promise<MahalleBaselineSonuc | null> {
  const sync = mahalleBaselineGetir(ilAd, ilceAd, mahalleAd, kategori);
  if (!sync || !ilAd) return sync;

  // Sync sonucu: hamMahalleFiyat ve ilceFallback'ten ham fiyatı yeniden hesapla
  // (sync zaten enflasyon uyguladı, biz TCMB ile yeniden uygulayalım)
  let hamFiyat: number;
  if (sync.hamMahalleFiyat) {
    // Bayesian shrinkage uygulanmış halde
    if (sync.ilceFallback) {
      // sync.baseline = sync.hamMahalleFiyat shrunk + tüfe. Ham hâlini bul:
      // Daha basit yol: aynı Bayesian'ı tekrar uygula, TCMB ile düzelt
      const kappa = KAPPA_BY_KATEGORI[kategori] ?? 30;
      const guvenIcin = Math.max(sync.guven - 5, 0); // ilçe varsa +5 eklenmiştir
      const alpha = guvenIcin / (guvenIcin + kappa);
      hamFiyat = alpha * sync.hamMahalleFiyat + (1 - alpha) * sync.ilceFallback;
    } else {
      hamFiyat = sync.hamMahalleFiyat;
    }
  } else if (sync.ilceFallback) {
    hamFiyat = sync.ilceFallback;
  } else {
    return sync;
  }

  const { guncelFiyat, carpan } = await enflasyonDuzeltAsync(Math.round(hamFiyat), MAHALLE_BASELINE_TARIH, ilAd);
  const enfNot = carpan.yontem === "tcmb-kfe"
    ? ` · TCMB KFE ${carpan.tcmbBolge} +%${Math.round((carpan.gayrimenkulCarpan - 1) * 100)}`
    : ` · enflasyon +%${Math.round((carpan.gayrimenkulCarpan - 1) * 100)} (${carpan.gecenAy} ay)`;

  return {
    ...sync,
    baseline: guncelFiyat,
    not: sync.not.replace(/· enflasyon[^·]*$|· TCMB[^·]*$/, "").trim() + enfNot,
  };
}

/**
 * Mahalle bazlı baseline'ı getir, Bayesian shrinkage uygula, enflasyon düzelt.
 * @returns null — ne mahalle ne ilçe verisi varsa
 */
export function mahalleBaselineGetir(
  ilAd: string | null | undefined,
  ilceAd: string | null | undefined,
  mahalleAd: string | null | undefined,
  kategori: Kategori,
): MahalleBaselineSonuc | null {
  const mKey = mahalleKeyOlustur(ilAd, ilceAd, mahalleAd);
  const tuple = mKey ? (MAHALLE_BASELINE[mKey] as MahalleBaselineTuple | undefined) : undefined;

  // İlçe fallback değerini hazırla (shrinkage ve fallback için)
  const ilNorm = ilAd ? normalizeYerAdi(ilAd) : "";
  const ilceNorm = ilceAd ? normalizeYerAdi(ilceAd) : "";
  // İlçe çıpasını skew ile düzelt — çarpık-dağılım overshoot'unu kaynağında kes.
  // Hem fallback hem Bayesian shrink anchor olarak kullanıldığı için, düzeltme
  // otomatik olarak ilçeye dayanma derecesiyle orantılı uygulanır.
  const ilceFiyatRaw = ilNorm && ilceNorm ? ilceFiyatGetir(ilNorm, ilceNorm, kategori) : null;
  const ilceFiyatHam = ilceFiyatRaw != null
    ? Math.round(ilceFiyatRaw * ILCE_FALLBACK_SKEW[skewKategori(kategori)])
    : null;

  // Mahalle tuple'ı yoksa, ilçe baseline'ı varsa onu dön
  if (!tuple) {
    if (!ilceFiyatHam) return null;
    const { guncelFiyat } = enflasyonDuzelt(ilceFiyatHam);
    return {
      baseline: guncelFiyat,
      guven: 30,
      hamMahalleFiyat: null,
      ilceFallback: ilceFiyatHam,
      kaynak: "ilce-only",
      not: `İlçe baseline (mahalle veri yok) — ${ilceAd}`,
    };
  }

  const idx = SEGMENT_INDEX[kategori];
  const mahalleTlm2 = tuple[idx] ?? 0;
  const mahalleGuven = tuple[idx + 1] ?? 0;

  // Mahalle değeri 0 ise → segment için veri yok, ilçe fallback
  if (!mahalleTlm2 || mahalleTlm2 <= 0) {
    if (!ilceFiyatHam) return null;
    const { guncelFiyat } = enflasyonDuzelt(ilceFiyatHam);
    return {
      baseline: guncelFiyat,
      guven: 30,
      hamMahalleFiyat: null,
      ilceFallback: ilceFiyatHam,
      kaynak: "ilce-only",
      not: `İlçe baseline (${kategori} segment yok) — ${ilceAd}`,
    };
  }

  // Bayesian shrinkage
  let nihai = mahalleTlm2;
  // Yerel tuple: AI baseline kaldırıldı — sadece KNN / kırsal / köy
  let nihaiKaynak: MahalleBaselineSonuc["kaynak"] =
    mahalleGuven >= 35 ? "knn" : "koy";

  if (ilceFiyatHam) {
    const kappa = KAPPA_BY_KATEGORI[kategori] ?? 30;
    const alpha = mahalleGuven / (mahalleGuven + kappa);
    nihai = alpha * mahalleTlm2 + (1 - alpha) * ilceFiyatHam;
  }

  // Mahalle özellik çarpanı (sahil/metro/üniversite yakınlığı)
  // Backtest: ilce-only ve düşük güvenli koy'da çarpan MAPE'yi kötüleştiriyor —
  // gerçek mahalle verisi olmadan coğrafi feature sinyal/gürültü oranı düşük.
  const ozellikUygula = mKey && mahalleTlm2 > 0 && mahalleGuven >= 35;
  const ozellik = ozellikUygula ? ozellikCarpani(mKey!) : { carpan: 1.0, notlar: [] };
  nihai = nihai * ozellik.carpan;

  // Enflasyon düzelt (BASELINE_TARIH'ten bugüne)
  const { guncelFiyat, carpan } = enflasyonDuzelt(Math.round(nihai));

  // Final güven: mahalle güveni + (ilçe varsa +5)
  const nihaiGuven = Math.min(95, mahalleGuven + (ilceFiyatHam ? 5 : 0));

  const enfNot = carpan.gecenAy > 0
    ? ` · enflasyon +%${Math.round((carpan.gayrimenkulCarpan - 1) * 100)} (${carpan.gecenAy} ay)`
    : "";

  return {
    baseline: guncelFiyat,
    guven: nihaiGuven,
    hamMahalleFiyat: mahalleTlm2,
    ilceFallback: ilceFiyatHam,
    kaynak: nihaiKaynak,
    not: `Mahalle baseline (${nihaiKaynak}, ${MAHALLE_BASELINE_TARIH}) — ${kategori} ${mahalleTlm2.toLocaleString("tr-TR")} TL/m²${ilceFiyatHam ? `, ilçe ${ilceFiyatHam.toLocaleString("tr-TR")} ile shrunk` : ""}${ozellik.carpan !== 1.0 ? ` · özellik ×${ozellik.carpan} (${ozellik.notlar.join(", ")})` : ""}${enfNot}`,
  };
}

/**
 * Multi-source triangulation — N kaynak ağırlıklı medyan + uyumsuzluk skoru.
 *
 * Algoritma:
 *   1. Ağırlık = kaynağın güven skoru × kaynak tipi katsayısı
 *      (ilanGozlem-mahalle 1.0, banka 0.9, AI 0.7, KNN 0.5, ilce-baseline 0.4)
 *   2. Tukey IQR outlier — açık aykırı kaynak (örn. AI hallucination) çıkarılır
 *   3. Ağırlıklı medyan (sadece ortalama değil, çünkü outlier'a robust)
 *   4. Uyumsuzluk = std/ortalama (CV%)
 *      - <%10: kaynaklar uyumlu, güvenilir
 *      - %10-30: orta uyum, normal
 *      - >%30: yüksek uyumsuzluk → manuel review flag
 */
export interface TriangulasyonKaynak {
  fiyat: number;
  guven: number;     // 0-100
  ad: string;        // "ilanGozlem", "ai", "banka", "knn", vs
  agirlik?: number;  // override için (yoksa guven/100 × tip katsayısı)
}

export interface TriangulasyonSonuc {
  fiyat: number;
  guven: number;
  uyumsuzluk: number;       // CV (0-1)
  kaynakSayisi: number;
  kullanilanKaynaklar: Array<{ ad: string; fiyat: number; agirlik: number }>;
  outlierSayisi: number;
  manuelReviewGerek: boolean;  // uyumsuzluk > 0.3
}

const KAYNAK_TIPI_AGIRLIK: Record<string, number> = {
  "ilanGozlem-mahalle": 1.0,
  "ilanGozlem-ilce": 0.9,
  "api-mahalle": 1.0,        // backend canlı ilan-istatistik
  "api-ilce": 0.85,
  "banka-degerleme": 0.9,
  // "ai-research" kaldırıldı — scrape öncelikli, AI hallucination riski yüksek
  "emlakjet-scrape": 1.0,
  "emlakjet": 1.0,
  "hepsiemlak": 0.95,
  "sahibinden": 0.95,
  "knn-smoothing": 0.5,
  "ilce-baseline": 0.4,
  "il-baseline": 0.3,
  "kirsal-arsa-baseline": 0.4,
  "kirsal-tarla-baseline": 0.4,
};

export function triangulateBaseline(kaynaklar: TriangulasyonKaynak[]): TriangulasyonSonuc | null {
  if (kaynaklar.length === 0) return null;

  // Tek kaynak — direkt dön
  if (kaynaklar.length === 1) {
    const k = kaynaklar[0]!;
    return {
      fiyat: k.fiyat,
      guven: k.guven,
      uyumsuzluk: 0,
      kaynakSayisi: 1,
      kullanilanKaynaklar: [{ ad: k.ad, fiyat: k.fiyat, agirlik: 1 }],
      outlierSayisi: 0,
      manuelReviewGerek: false,
    };
  }

  // MAD-based outlier (3+ kaynak için).
  // Klasik Tukey IQR küçük örneklemde (n=3-4) outlier'a karşı zayıf çünkü
  // outlier'ın kendisi Q3'ü şişirir → eşik genişler → outlier elenmez.
  // MAD (median absolute deviation) median-based ve outlier-immune.
  //   threshold = 3 × MAD (≈ 4.5σ equivalent) — açık aykırılar yakalanır
  let aktifKaynaklar = [...kaynaklar];
  let outlierSayisi = 0;
  if (kaynaklar.length >= 3) {
    const sorted = [...kaynaklar.map((k) => k.fiyat)].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const sapmalar = sorted.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
    const mad = sapmalar[Math.floor(sapmalar.length / 2)] ?? 0;
    // MAD 0 ise (tüm değerler aynı medianda) outlier eşiği = median × 0.5
    // (extreme guard); aksi halde 3 × MAD
    const threshold = mad > 0 ? mad * 3 : median * 0.5;
    aktifKaynaklar = kaynaklar.filter((k) => Math.abs(k.fiyat - median) <= threshold);
    outlierSayisi = kaynaklar.length - aktifKaynaklar.length;
  }
  if (aktifKaynaklar.length === 0) aktifKaynaklar = kaynaklar; // fallback

  // Ağırlık hesabı
  const agirlikli = aktifKaynaklar.map(k => {
    const tipKatsayi = KAYNAK_TIPI_AGIRLIK[k.ad] ?? 0.5;
    const w = k.agirlik ?? (k.guven / 100) * tipKatsayi;
    return { ad: k.ad, fiyat: k.fiyat, agirlik: w };
  });

  // Ağırlıklı ortalama
  const toplamA = agirlikli.reduce((s, k) => s + k.agirlik, 0);
  const toplamF = agirlikli.reduce((s, k) => s + k.fiyat * k.agirlik, 0);
  const ortalama = toplamA > 0 ? toplamF / toplamA : aktifKaynaklar[0]!.fiyat;

  // Uyumsuzluk (CV)
  const ortSapma = Math.sqrt(
    aktifKaynaklar.reduce((s, k) => s + (k.fiyat - ortalama) ** 2, 0) / aktifKaynaklar.length,
  );
  const uyumsuzluk = ortalama > 0 ? ortSapma / ortalama : 0;

  // Güven: kaynak sayısı + ortalama güven + uyumsuzluk cezası
  let guven = aktifKaynaklar.reduce((s, k) => s + k.guven, 0) / aktifKaynaklar.length;
  guven += Math.min(15, aktifKaynaklar.length * 3); // her ek kaynak +3 güven, max +15
  guven -= Math.min(20, uyumsuzluk * 50); // yüksek uyumsuzluk -20'ye kadar
  guven = Math.max(20, Math.min(95, Math.round(guven)));

  return {
    fiyat: Math.round(ortalama),
    guven,
    uyumsuzluk: Math.round(uyumsuzluk * 1000) / 1000,
    kaynakSayisi: aktifKaynaklar.length,
    kullanilanKaynaklar: agirlikli.map(k => ({
      ad: k.ad,
      fiyat: Math.round(k.fiyat),
      agirlik: Math.round(k.agirlik * 100) / 100,
    })),
    outlierSayisi,
    manuelReviewGerek: uyumsuzluk > 0.3,
  };
}

/**
 * Baseline kaynak/uyumsuzluk → fiyat aralığı için ek genişlik (yarı genişlik).
 *
 * - "ilanGozlem-mahalle" / "api-mahalle": 0 (en dar bant, kaynak çok güvenilir)
 * - "ilce-only", "koy", "ilce-baseline": +0.05
 * - "il-baseline", "fallback": +0.10
 * - Triangulasyon `uyumsuzluk` (CV) > 0.2 ise: +(uyumsuzluk × 0.4) ekstra
 *
 * Çağıran (fiyat-tahmin.ts) bunu altRange'den çıkarır, ustRange'e ekler.
 */
export function baselineBandGenisletme(args: {
  kaynak: MahalleBaselineSonuc["kaynak"] | "spatial-radius" | "ilanGozlem-mahalle" | "ilanGozlem-ilce" | "mahalle-baseline" | "ilce-semt-baseline" | "ilce-baseline" | "il-baseline" | "api-mahalle" | "fallback";
  uyumsuzluk?: number;
}): number {
  let ek = 0;
  switch (args.kaynak) {
    // spatial-radius: en dar bant — ilanGozlem-mahalle ile aynı güven
    case "spatial-radius":
    case "ilanGozlem-mahalle":
    case "api-mahalle":
    case "ai":
      ek = 0;
      break;
    case "knn":
    case "mahalle-baseline":
    case "ilanGozlem-ilce":
    case "ilce-semt-baseline":
      ek = 0.02;
      break;
    case "koy":
    case "ilce-only":
    case "ilce-baseline":
      ek = 0.05;
      break;
    case "il-baseline":
    case "fallback":
      ek = 0.10;
      break;
    default:
      ek = 0.03;
  }
  if (args.uyumsuzluk && args.uyumsuzluk > 0.2) {
    ek += args.uyumsuzluk * 0.4;
  }
  // Üst sınır: tahmini bant ±0.25'i geçmesin
  return Math.min(0.25, ek);
}
