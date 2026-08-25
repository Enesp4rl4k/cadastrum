/**
 * Tarımsal Değer Motoru — SPL tarımsal arazi değerleme orkestratörü.
 *
 * Tarımsal arsa (tarla, bahçe, bağ, zeytinlik) değerlemesi için
 * özel akış. Üç veri kaynağını birleştirir:
 *
 *   1. Toprak kalitesi  (ISRIC SoilGrids) → kil/kum/organik madde/pH
 *   2. Sulama altyapısı (DSİ + OSM)       → en yakın sulama kanalı
 *   3. İklim            (Open-Meteo)       → yağış/sıcaklık/don
 *
 * Bu bilgilerle:
 *   a) Tarımsal verimlilik skoru (0-100)
 *   b) Tarımsal fiyat çarpanı   (0.5 – 2.5)
 *   c) Önerilen ürünler + tahmini brüt gelir
 *   d) Mera/orman dönüşüm riski tespiti
 *
 * Fiyat motoru entegrasyonu:
 *   Tarımsal çarpan, fiyat-tahmin.ts'e ilave bileşen olarak eklenir.
 *   Mevcut kırsal çarpanından bağımsız (additive değil, overrides).
 */

import type { ToprakVerisi } from "./toprak";
import type { SulamaAltyapisi } from "./sulama";
import type { TarimAnalizi, UrunUygunluk } from "./tarim-analiz";

// ─── Tipler ──────────────────────────────────────────────────────────────────

export interface TarimselDegerGirdisi {
  /** Parsel alanı m² */
  alanM2: number;
  /** Parsel niteliği (Tarla, Bahçe, Bağ, Zeytinlik, Mera) */
  nitelik: string;
  /** Toprak verisi (ISRIC SoilGrids) — null ise atlanır */
  toprak?: ToprakVerisi | null;
  /** Sulama altyapısı (DSİ + OSM) — null ise atlanır */
  sulama?: SulamaAltyapisi | null;
  /** Tarım + iklim analizi — null ise atlanır */
  tarimAnaliz?: TarimAnalizi | null;
  /** Koordinat — mera/orman tespiti için */
  lat?: number;
  lng?: number;
}

export interface TarimselDegerCiktisi {
  /** Tarımsal verimlilik skoru 0-100 */
  verimliliSkoru: number;
  /** Skoru etkileyen faktörler */
  faktörler: Array<{
    ad: string;
    etki: number;   // -50 ile +50 arası
    aciklama: string;
  }>;
  /** Tarımsal fiyat çarpanı — baseline'ı bu kadar ayarla */
  fiyatCarpani: number;
  /** Fiyat çarpanı gerekçesi */
  fiyatGerekce: string;
  /** En uygun ürünler */
  oneriUrunler: UrunUygunluk[];
  /** Tahmini yıllık tarımsal gelir TL/dönüm */
  tahminiYillikGeliTLDonum: number | null;
  /** Toplam parsel için tahmini yıllık gelir TL */
  toplamYillikGeliTL: number | null;
  /** Risk faktörleri */
  riskler: string[];
  /** Özet (UI için) */
  ozet: string;
  /** Güven: veri ne kadar sağlam? */
  guven: "yuksek" | "orta" | "dusuk";
}

// ─── Skor bileşenleri ────────────────────────────────────────────────────────

/** Toprak kalitesinden skor (+/-) */
function toprakSkoru(toprak: ToprakVerisi | null | undefined): {
  etki: number;
  aciklama: string;
} {
  if (!toprak) return { etki: 0, aciklama: "Toprak verisi yok" };

  let etki = 0;
  const notlar: string[] = [];

  // Organik karbon (>20 g/kg = çok iyi)
  if (toprak.organikKarbon >= 20) { etki += 20; notlar.push("Yüksek organik madde"); }
  else if (toprak.organikKarbon >= 10) { etki += 10; notlar.push("Orta organik madde"); }
  else if (toprak.organikKarbon < 5) { etki -= 10; notlar.push("Düşük organik madde"); }

  // pH (6-7 ideal tarım için)
  if (toprak.ph >= 6 && toprak.ph <= 7.5) { etki += 10; notlar.push("İdeal pH"); }
  else if (toprak.ph < 5.5 || toprak.ph > 8.5) { etki -= 15; notlar.push("Sorunlu pH"); }

  // Toprak tipi
  if (toprak.sinif === "tinli") { etki += 15; notlar.push("Tın toprak — verimli"); }
  else if (toprak.sinif === "killi") { etki += 5; notlar.push("Killi toprak — suyu tutar"); }
  else if (toprak.sinif === "kumlu") { etki -= 10; notlar.push("Kumlu toprak — düşük verim"); }

  return { etki, aciklama: notlar.join(", ") || "Orta kalite toprak" };
}

/** Sulama altyapısından skor (+/-) */
function sulamaSkoru(sulama: SulamaAltyapisi | null | undefined): {
  etki: number;
  aciklama: string;
} {
  if (!sulama) return { etki: 0, aciklama: "Sulama verisi yok" };

  switch (sulama.erisim) {
    case "cok-yakin": return { etki: 30, aciklama: "Sulama kanalına <100m — çok avantajlı" };
    case "yakin":     return { etki: 20, aciklama: "Sulama kanalına <500m — iyi erişim" };
    case "orta":      return { etki: 10, aciklama: "Sulama kanalına <2km — borulu sulama mümkün" };
    case "uzak":      return { etki: -10, aciklama: "Sulama kanalı uzak — kuru tarım" };
    case "yok":       return { etki: -20, aciklama: "Sulama altyapısı yok — sadece yağmur" };
    default:          return { etki: 0, aciklama: "Sulama erişim bilinmiyor" };
  }
}

/** İklim + tarım analizinden skor (+/-) */
function iklimSkoru(tarim: TarimAnalizi | null | undefined): {
  etki: number;
  aciklama: string;
} {
  if (!tarim) return { etki: 0, aciklama: "İklim verisi yok" };

  let etki = 0;
  const notlar: string[] = [];

  // Yağış (400-800mm ideal Türkiye tarımı için)
  const yagis = tarim.iklim.yillikYagisMm;
  if (yagis >= 600)      { etki += 10; notlar.push(`${yagis}mm yağış — yeterli`); }
  else if (yagis >= 400) { etki += 5;  notlar.push(`${yagis}mm yağış — sınır`); }
  else                   { etki -= 10; notlar.push(`${yagis}mm yağış — kuru`); }

  // Sulama ihtiyacı
  if (tarim.sulamaIhtiyaci === "az") { etki += 10; notlar.push("Düşük sulama ihtiyacı"); }
  else if (tarim.sulamaIhtiyaci === "yuksek") { etki -= 5; notlar.push("Yüksek sulama ihtiyacı"); }

  // Don riski
  if (tarim.donmaRiski === "düşük") { etki += 5; notlar.push("Don riski düşük"); }
  else if (tarim.donmaRiski === "yüksek") { etki -= 10; notlar.push("Yüksek don riski"); }

  return { etki, aciklama: notlar.join(", ") || "Orta iklim koşulları" };
}

/** Nitelik bazlı temel düzeltme */
function nitelikSkoru(nitelik: string): { etki: number; aciklama: string } {
  const t = nitelik.toLocaleLowerCase("tr");
  if (/zeytinlik|zeytin/.test(t)) return { etki: 15, aciklama: "Zeytinlik — değerli tarım" };
  if (/bahçe|bahce|bağ/.test(t))  return { etki: 10, aciklama: "Bahçe/bağ — yoğun tarım" };
  if (/tarla/.test(t))            return { etki: 0,  aciklama: "Tarla — referans nitelik" };
  if (/mera/.test(t))             return { etki: -15, aciklama: "Mera — kamu arazisi riski" };
  return { etki: 0, aciklama: "Nitelik belirsiz" };
}

// ─── Fiyat çarpanı ────────────────────────────────────────────────────────────

function skordanCarpan(skor: number): number {
  // Skor 0-100 → çarpan 0.5 - 2.5
  // 50 = referans (1.0), her 10 puan ≈ %20 etki
  if (skor >= 90) return 2.50;
  if (skor >= 80) return 2.10;
  if (skor >= 70) return 1.70;
  if (skor >= 60) return 1.40;
  if (skor >= 50) return 1.15;
  if (skor >= 40) return 1.00;
  if (skor >= 30) return 0.85;
  if (skor >= 20) return 0.72;
  return 0.55;
}

// ─── Ana motor ────────────────────────────────────────────────────────────────

/**
 * Tarımsal arazi için değerleme çarpanı ve verimlilik skoru hesapla.
 * Paralel çalışan veri katmanlarından (toprak, sulama, iklim) sentez yapar.
 */
export function tarimselDegerHesapla(girdi: TarimselDegerGirdisi): TarimselDegerCiktisi {
  const { alanM2, nitelik, toprak, sulama, tarimAnaliz } = girdi;
  const riskler: string[] = [];

  // Faktör skorları
  const nitelikF = nitelikSkoru(nitelik);
  const toprakF  = toprakSkoru(toprak);
  const sulamaF  = sulamaSkoru(sulama);
  const iklimF   = iklimSkoru(tarimAnaliz);

  const faktörler = [
    { ad: "Nitelik",         etki: nitelikF.etki, aciklama: nitelikF.aciklama },
    { ad: "Toprak Kalitesi", etki: toprakF.etki,  aciklama: toprakF.aciklama },
    { ad: "Sulama Erişimi",  etki: sulamaF.etki,  aciklama: sulamaF.aciklama },
    { ad: "İklim Koşulları", etki: iklimF.etki,   aciklama: iklimF.aciklama },
  ];

  // Toplam skor: baz 50 + faktörler
  const ham = 50 + faktörler.reduce((s, f) => s + f.etki, 0);
  const verimliliSkoru = Math.max(0, Math.min(100, Math.round(ham)));

  // Fiyat çarpanı
  const fiyatCarpani = skordanCarpan(verimliliSkoru);

  // Risk tespiti
  if (/mera/.test(nitelik.toLocaleLowerCase("tr"))) {
    riskler.push("Mera niteliği — 4342 sayılı kanun kısıtlaması (kamu arazisi dönüşümü riskli)");
  }
  if (toprak?.ph && (toprak.ph < 5 || toprak.ph > 9)) {
    riskler.push(`Toprak pH ${toprak.ph.toFixed(1)} — ıslah gerekebilir`);
  }
  if (sulama?.erisim === "yok" && tarimAnaliz?.sulamaIhtiyaci === "yuksek") {
    riskler.push("Sulama yok + yüksek sulama ihtiyacı — verim çok düşük olabilir");
  }
  if (tarimAnaliz?.donmaRiski === "yüksek") {
    riskler.push("Yüksek don riski — bazı ürünler uygun değil");
  }

  // Önerilen ürünler
  const oneriUrunler = tarimAnaliz?.oneriUrunler?.slice(0, 5) ?? [];

  // Tahmini gelir
  const donum = alanM2 / 1000; // 1 dönüm = 1000 m²
  const enIyiUrun = oneriUrunler.find((u) => u.uygunluk === "yuksek")
    ?? oneriUrunler.find((u) => u.uygunluk === "orta");
  const tahminiYillikGeliTLDonum = enIyiUrun?.brutGelirTlDonum ?? null;
  const toplamYillikGeliTL = tahminiYillikGeliTLDonum != null
    ? Math.round(tahminiYillikGeliTLDonum * donum)
    : null;

  // Güven
  const veriSayisi = [toprak, sulama, tarimAnaliz].filter(Boolean).length;
  const guven = veriSayisi >= 3 ? "yuksek" : veriSayisi >= 1 ? "orta" : "dusuk";

  // Özet
  const seviye = verimliliSkoru >= 70 ? "Yüksek Verimlilik"
    : verimliliSkoru >= 50 ? "Orta Verimlilik"
    : "Düşük Verimlilik";

  const ozet = `${seviye} (${verimliliSkoru}/100) — Fiyat çarpanı ×${fiyatCarpani.toFixed(2)}`
    + (toplamYillikGeliTL ? ` | Tahmini yıllık gelir: ${(toplamYillikGeliTL / 1000).toFixed(0)}K ₺` : "");

  // Gerekçe
  const fiyatGerekce = [
    `Tarımsal verimlilik skoru ${verimliliSkoru}/100 → çarpan ×${fiyatCarpani.toFixed(2)}.`,
    faktörler.filter((f) => f.etki !== 0).map((f) => `${f.ad}: ${f.etki > 0 ? "+" : ""}${f.etki} (${f.aciklama})`).join(", "),
  ].filter(Boolean).join(" ");

  return {
    verimliliSkoru,
    faktörler,
    fiyatCarpani,
    fiyatGerekce,
    oneriUrunler,
    tahminiYillikGeliTLDonum,
    toplamYillikGeliTL,
    riskler,
    ozet,
    guven,
  };
}

/**
 * Parsel niteliği tarımsal mı?
 * fiyat-tahmin.ts'deki tarımsalMi() ile aynı mantık.
 */
export function tarımAraziMi(nitelik: string): boolean {
  return /tarla|bahçe|bahce|bağ\b|bag\b|zeytinlik|mera/iu.test(nitelik);
}
