/**
 * Emsal Kalifikasyon Sistemi — SPL değerleme standardına uygun emsal eleme.
 *
 * Problem: Sahibinden/Hepsiemlak havuzunda gerçek piyasa değerini yansıtmayan
 * ilanlar var (hisseli, icra, anakronik, sahte fiyat vb.). Bu ilanlar emsal
 * havuzunu kirletiyor ve tahmin motorunu yanıltıyor.
 *
 * Bu modül her ilanı 6 kalifikasyon testinden geçirir:
 *   1. Hukuki durum (hisseli, intikal, icra)
 *   2. Satış koşulları (açık artırma, ihale, takasla)
 *   3. Fiyat akronolojisi (çok eski, enflasyon düzeltme gerekli)
 *   4. Alan uyumu (parselden 10x farklı alan)
 *   5. Semantik güvenilirlik (fiyat manipülasyon sinyalleri)
 *   6. Konum güvenilirliği ("mevki", "köy", belirsiz konum)
 *
 * Her test başarısız olursa ilan ya DİSKALİFİYE edilir (havuzdan çıkar)
 * ya da İSKONTO uygulanarak kabul edilir.
 *
 * UDES Standardı (Uluslararası Değerleme Standartları Türkiye):
 *   - Karşılaştırmalı yaklaşımda emsal "piyasa değeri" yansıtmalı
 *   - Zorla satışlar (icra) piyasa değerinin altında olabilir
 *   - Anlaşmalı fiyatlar (devir, hibe) piyasa verisi değildir
 *   - Hisseli parseller azınlık iskontosu içerebilir
 */

import type { IlanGozlem } from "./db";

// ─── Tipler ──────────────────────────────────────────────────────────────────

/** Kalifikasyon başarısızlık nedeni */
export type DiskalifikasyonNedeni =
  | "hisseli-pay"        // Hisseli/paylı tapu → azınlık iskontosu riski
  | "intikal"            // Veraset/intikal → anlaşmalı fiyat riski
  | "icra-ihale"         // İcra/ihale → zorla satış, piyasa altı
  | "acik-arttirma"      // Açık artırma → spekülatif fiyat
  | "takas-trampa"       // Takas/trampa → gerçek nakit değer belirsiz
  | "cok-eski"           // 180+ gün → TR enflasyonunda stale
  | "alan-asiri-fark"    // Parsel alanının 10x fazla/az
  | "fiyat-asiri-dusuk"  // Fiyat mutlak alt sınırın altında (giriş hatası)
  | "fiyat-asiri-yuksek" // Fiyat mutlak üst sınırın üstünde (spekülatif)
  | "belirsiz-konum"     // "mevki", "köy" — kesin mahalle bağlanamıyor
  | "eksik-veri";        // Zorunlu alan boş (alan, fiyat)

/** İskonto uygulanır ama havuzdan çıkarılmaz */
export type IskontoNedeni =
  | "hisseli-parcali"    // Hisseli ama kısmi — %25 iskonto
  | "intikal-unvan"      // İntikal geçmişi var, fiilen satışta — %10 iskonto
  | "piyasa-disi-ihale"  // Milli Emlak ihalesi (gerçek satış ama zorla) — %10 iskonto
  | "eski-60-180-gun"    // 60-180 gün — TCMB KFE düzeltme ile kabul
  | "alan-orta-fark"     // Parsel alanının 3-10x fark — %15 güven iskontosu
  | "deger-kiyasi-yok";  // Karşılaştırmaya az emsal kalıyor — güven notası

export interface KalifikasyonSonucu {
  /** Havuza kabul edilebilir mi? */
  kabul: boolean;
  /** Uygulanacak fiyat iskontosu oranı (0.0 = iskonto yok, 0.30 = %30 düşür) */
  iskontoOrani: number;
  /** Kalifikasyonu geçemeyen nedenler */
  diskalifikasyonlar: DiskalifikasyonNedeni[];
  /** İskonto uygulanan ama kabul edilen nedenler */
  iskontolar: IskontoNedeni[];
  /** Güven puanı 0-100 */
  guvenPuani: number;
  /** Kısa özet metin — raporlama için */
  ozet: string;
  /** Düzeltilmiş TL/m² (iskonto uygulanmış) */
  duzeltilmisFiyatPerM2: number | null;
}

// ─── Anahtar kelime listeleri ─────────────────────────────────────────────────

const HISSELI_KELIMELER = [
  "hisseli", "hisse", "paylı", "pay", "hissedar", "ortak",
  "2/3 hisse", "1/2 hisse", "1/3 hisse", "1/4 hisse",
];

const INTIKAL_KELIMELER = [
  "intikal", "veraset", "miras", "tereke", "devir",
  "hibe", "bağış", "anlaşmalı", "trampa", "takas",
];

const ICRA_KELIMELER = [
  "icra", "ihale", "haciz", "bankamatik", "satışa çıkarıldı zorunlu",
  "banka satışı", "portföy bank", "zorla satış",
];

const ACIK_ARTTIRMA_KELIMELER = [
  "açık artırma", "açık artırma ile", "ekspertiz", "arttırma",
  "teklif ile", "en yüksek teklif",
];

const TAKAS_KELIMELER = [
  "takas", "trampa", "araba ile", "araç ile", "takaslık", "takaşlık",
];

const BELIRSIZ_KONUM_KELIMELER = [
  "mevkii", "mevki", "köy merkezi", "mezra", "çiftlik",
  "yaylak", "kışlak", "ormanlık mevki",
];

// ─── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

/** Metin içinde herhangi bir anahtar kelime geçiyor mu? */
function iceriyorMu(metin: string, kelimeler: string[]): boolean {
  const lower = metin.toLocaleLowerCase("tr");
  return kelimeler.some((k) => lower.includes(k.toLocaleLowerCase("tr")));
}

/** Birleşik metin — başlık + imar durumu + açıklama */
function birlesikMetin(ilan: IlanGozlem): string {
  return [
    ilan.baslik ?? "",
    ilan.imarDurumu ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

// ─── Ana kalifikasyon fonksiyonu ─────────────────────────────────────────────

/**
 * Tek bir ilan kaydını kalifikasyon testlerinden geçir.
 *
 * @param ilan         Test edilecek ilan kaydı
 * @param parselAlan   Değerleme parseli alan m² (alan uyumu için)
 * @param ilNorm       İl normu (mutlak fiyat sınırı için)
 * @param kategori     "arsa" | "tarla" (fiyat sınırı için)
 */
export function emsalKalifiye(
  ilan: IlanGozlem,
  parselAlan: number,
  ilNorm: string,
  kategori: "arsa" | "tarla" | "genel" = "genel",
): KalifikasyonSonucu {
  const diskalifikasyonlar: DiskalifikasyonNedeni[] = [];
  const iskontolar: IskontoNedeni[] = [];
  let iskontoOrani = 0;
  const metin = birlesikMetin(ilan);

  // ─── Test 1: Zorunlu alan kontrolü ─────────────────────────────────────────
  if (!ilan.fiyatPerM2 || ilan.fiyatPerM2 <= 0 || !ilan.m2 || ilan.m2 <= 0) {
    diskalifikasyonlar.push("eksik-veri");
  }

  // ─── Test 2: Hukuki durum ───────────────────────────────────────────────────
  if (iceriyorMu(metin, HISSELI_KELIMELER)) {
    // Hisseli — kısmen satışta mı tam satışta mı?
    const tamHisseli = /\b(hisseli)\b/i.test(metin) &&
      !/1\/1|tam hisse|tamamı/.test(metin);
    if (tamHisseli) {
      diskalifikasyonlar.push("hisseli-pay");
    } else {
      // Belirtilmiş kısmi hisse — iskonto uygula
      iskontolar.push("hisseli-parcali");
      iskontoOrani = Math.max(iskontoOrani, 0.25);
    }
  }

  if (iceriyorMu(metin, INTIKAL_KELIMELER)) {
    // Trampa/takas → diskalifiye
    if (iceriyorMu(metin, TAKAS_KELIMELER)) {
      diskalifikasyonlar.push("takas-trampa");
    } else {
      // İntikal geçmişi var ama satışta — iskonto
      iskontolar.push("intikal-unvan");
      iskontoOrani = Math.max(iskontoOrani, 0.10);
    }
  }

  // ─── Test 3: Satış koşulları ────────────────────────────────────────────────
  if (iceriyorMu(metin, ICRA_KELIMELER)) {
    diskalifikasyonlar.push("icra-ihale");
  }

  if (iceriyorMu(metin, ACIK_ARTTIRMA_KELIMELER)) {
    diskalifikasyonlar.push("acik-arttirma");
  }

  // Milli Emlak ihaleleri — zorla değil ama piyasa dışı olabilir
  const milliEmlakMi = ilan.kaynak === undefined &&
    (ilan.url?.includes("milliemlak.gov") || iceriyorMu(metin, ["milli emlak", "hazine"]));
  if (milliEmlakMi) {
    iskontolar.push("piyasa-disi-ihale");
    iskontoOrani = Math.max(iskontoOrani, 0.10);
  }

  // ─── Test 4: Yaş kontrolü ───────────────────────────────────────────────────
  if (ilan.zaman) {
    const yasGun = (Date.now() - ilan.zaman) / 86_400_000;
    if (yasGun > 180) {
      diskalifikasyonlar.push("cok-eski");
    } else if (yasGun > 60) {
      // 60-180 gün — TCMB KFE ile düzeltilerek kabul
      iskontolar.push("eski-60-180-gun");
      // İskonto yerine enflasyon düzeltmesi önerilir; burada sadece not
    }
  }

  // ─── Test 5: Alan uyumu ─────────────────────────────────────────────────────
  if (parselAlan > 0 && ilan.m2 && ilan.m2 > 0) {
    const alanOrani = Math.max(parselAlan, ilan.m2) / Math.min(parselAlan, ilan.m2);
    if (alanOrani > 10) {
      diskalifikasyonlar.push("alan-asiri-fark");
    } else if (alanOrani > 3) {
      iskontolar.push("alan-orta-fark");
      iskontoOrani = Math.max(iskontoOrani, 0.15);
    }
  }

  // ─── Test 6: Konum güvenilirliği ────────────────────────────────────────────
  if (iceriyorMu(metin, BELIRSIZ_KONUM_KELIMELER)) {
    iskontolar.push("deger-kiyasi-yok");
    iskontoOrani = Math.max(iskontoOrani, 0.05);
  }

  // ─── Test 7: Fiyat sınırı kontrolü ─────────────────────────────────────────
  if (ilan.fiyatPerM2 && ilan.fiyatPerM2 > 0) {
    const sinirlar = FIYAT_SINIRI[`${ilNorm}:${kategori}`] ??
      FIYAT_SINIRI[`_default:${kategori}`] ??
      FIYAT_SINIRI["_default:arsa"]!;

    if (ilan.fiyatPerM2 < sinirlar.alt) {
      diskalifikasyonlar.push("fiyat-asiri-dusuk");
    } else if (ilan.fiyatPerM2 > sinirlar.ust) {
      diskalifikasyonlar.push("fiyat-asiri-yuksek");
    }
  }

  // ─── Sonuç hesapla ──────────────────────────────────────────────────────────
  const kabul = diskalifikasyonlar.length === 0;

  // Güven puanı: başlangıç 100, her diskalifikasyon -30, her iskonto -10
  const guvenPuani = Math.max(
    0,
    100 - diskalifikasyonlar.length * 30 - iskontolar.length * 10,
  );

  // Düzeltilmiş fiyat
  let duzeltilmisFiyatPerM2: number | null = null;
  if (kabul && ilan.fiyatPerM2 && ilan.fiyatPerM2 > 0) {
    duzeltilmisFiyatPerM2 = Math.round(ilan.fiyatPerM2 * (1 - iskontoOrani));
  }

  // Özet metin
  const ozet = kabul
    ? iskontolar.length > 0
      ? `Kabul (${iskontolar.join(", ")}) → %${Math.round(iskontoOrani * 100)} iskonto`
      : "Kalifikasyon geçti — piyasa emsali"
    : `Diskalifiye: ${diskalifikasyonlar.join(", ")}`;

  return {
    kabul,
    iskontoOrani,
    diskalifikasyonlar,
    iskontolar,
    guvenPuani,
    ozet,
    duzeltilmisFiyatPerM2,
  };
}

// ─── Toplu kalifikasyon ───────────────────────────────────────────────────────

export interface KalifikasyonOzeti {
  toplam: number;
  kabul: number;
  diskalifiye: number;
  iskontoUygulanan: number;
  /** Diskalifiye edilen nedenler frekansı */
  diskalifikasyonDagilimi: Record<string, number>;
  /** Kabul edilen ilanların ortalama güven puanı */
  ortalamaGuven: number;
  /** Düzeltilmiş fiyatlardan hesaplanan ağırlıklı medyan TL/m² */
  duzeltilmisMedian: number | null;
}

/**
 * Emsal havuzunu toplu olarak kalifikasyondan geçir.
 * Diskalifiye edilenleri çıkar, iskonto uygulanmışları düzelt.
 *
 * @param ilanlar      Havuzdaki tüm ilan kayıtları
 * @param parselAlan   Değerleme parseli alanı (m²)
 * @param ilNorm       İl normu
 * @param kategori     Parsel kategorisi
 */
export function havuzuKalifiyeEt(
  ilanlar: IlanGozlem[],
  parselAlan: number,
  ilNorm: string,
  kategori: "arsa" | "tarla" | "genel" = "genel",
): {
  kabuleEdilen: Array<IlanGozlem & { _kalifikasyon: KalifikasyonSonucu }>;
  ozet: KalifikasyonOzeti;
} {
  const sonuclar = ilanlar.map((ilan) => ({
    ilan,
    kalifikasyon: emsalKalifiye(ilan, parselAlan, ilNorm, kategori),
  }));

  const kabuleEdilen = sonuclar
    .filter((r) => r.kalifikasyon.kabul)
    .map((r) => ({ ...r.ilan, _kalifikasyon: r.kalifikasyon }));

  // İstatistikler
  const diskalifikasyonDagilimi: Record<string, number> = {};
  let toplamGuven = 0;
  const duzeltilmisFiyatlar: number[] = [];

  for (const r of sonuclar) {
    for (const d of r.kalifikasyon.diskalifikasyonlar) {
      diskalifikasyonDagilimi[d] = (diskalifikasyonDagilimi[d] ?? 0) + 1;
    }
    if (r.kalifikasyon.kabul) {
      toplamGuven += r.kalifikasyon.guvenPuani;
      if (r.kalifikasyon.duzeltilmisFiyatPerM2) {
        duzeltilmisFiyatlar.push(r.kalifikasyon.duzeltilmisFiyatPerM2);
      }
    }
  }

  const kabulSayisi = kabuleEdilen.length;
  const ortalamaGuven = kabulSayisi > 0 ? Math.round(toplamGuven / kabulSayisi) : 0;

  // Medyan hesapla
  let duzeltilmisMedian: number | null = null;
  if (duzeltilmisFiyatlar.length > 0) {
    const sorted = [...duzeltilmisFiyatlar].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    duzeltilmisMedian = sorted.length % 2 !== 0
      ? sorted[mid]!
      : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }

  return {
    kabuleEdilen,
    ozet: {
      toplam: ilanlar.length,
      kabul: kabulSayisi,
      diskalifiye: ilanlar.length - kabulSayisi,
      iskontoUygulanan: kabuleEdilen.filter((i) => i._kalifikasyon.iskontoOrani > 0).length,
      diskalifikasyonDagilimi,
      ortalamaGuven,
      duzeltilmisMedian,
    },
  };
}

// ─── Fiyat sınırları (mutlak) ─────────────────────────────────────────────────
// fiyat-correction.ts'deki IL_KATEGORI_SINIR ile senkron tutulur

const FIYAT_SINIRI: Record<string, { alt: number; ust: number }> = {
  "istanbul:arsa":   { alt: 500,  ust: 100_000_000 },
  "istanbul:tarla":  { alt: 200,  ust: 10_000_000 },
  "izmir:arsa":      { alt: 300,  ust: 50_000_000 },
  "ankara:arsa":     { alt: 300,  ust: 50_000_000 },
  "antalya:arsa":    { alt: 300,  ust: 30_000_000 },
  "mugla:arsa":      { alt: 300,  ust: 30_000_000 },
  "_default:arsa":   { alt: 50,   ust: 20_000_000 },
  "_default:tarla":  { alt: 30,   ust: 3_000_000 },
  "_default:genel":  { alt: 30,   ust: 20_000_000 },
};

// ─── Karşılaştırmalı yaklaşım için düzeltme tablosu ──────────────────────────

export interface DuzeltmeKalemi {
  tur: "hukuki" | "zaman" | "fiziksel" | "ekonomik" | "konum";
  aciklama: string;
  oran: number;   // negatif = düşürücü, pozitif = artırıcı
  kaynak: string;
}

/**
 * UDES uyumlu emsal düzeltme tablosu oluştur.
 * Her emsal için hangi düzeltmelerin uygulandığını raporlar.
 */
export function duzeltmeTablosuOlustur(
  kalifikasyon: KalifikasyonSonucu,
  zamanDuzeltmeOrani?: number,
): DuzeltmeKalemi[] {
  const kalemler: DuzeltmeKalemi[] = [];

  // Hisseli iskonto
  if (kalifikasyon.iskontolar.includes("hisseli-parcali")) {
    kalemler.push({
      tur: "hukuki",
      aciklama: "Hisseli/paylı tapu — azınlık iskontosu",
      oran: -0.25,
      kaynak: "Değerleme uygulaması: hisseli tapu prim/iskonto analizi",
    });
  }

  // Milli Emlak iskontosu
  if (kalifikasyon.iskontolar.includes("piyasa-disi-ihale")) {
    kalemler.push({
      tur: "ekonomik",
      aciklama: "Milli Emlak ihalesi — piyasa dışı koşullar",
      oran: -0.10,
      kaynak: "UDES: piyasa dışı satışlar düzeltme gerektirir",
    });
  }

  // Zaman düzeltmesi
  if (zamanDuzeltmeOrani && Math.abs(zamanDuzeltmeOrani) > 0.01) {
    kalemler.push({
      tur: "zaman",
      aciklama: `Zaman düzeltmesi — TCMB KFE endeksi`,
      oran: zamanDuzeltmeOrani,
      kaynak: "TCMB Konut Fiyat Endeksi",
    });
  }

  // Alan uyumsuzluk
  if (kalifikasyon.iskontolar.includes("alan-orta-fark")) {
    kalemler.push({
      tur: "fiziksel",
      aciklama: "Parsel alanı uyumsuzluğu — kalibre güveni azaldı",
      oran: -0.15,
      kaynak: "Alan büyüklüğü etkisi — değerleme uygulaması",
    });
  }

  return kalemler;
}
