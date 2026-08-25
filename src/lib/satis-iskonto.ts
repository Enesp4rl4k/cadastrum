/**
 * Satış iskonto motoru — "asking price" (istenen fiyat) → gerçek satış fiyatı düzeltmesi.
 *
 * Problem: Sahibinden, Hepsiemlak, Emlakjet ilanları gerçek satış fiyatını değil,
 * satıcının istediği fiyatı yansıtır. Türkiye gayrimenkul piyasasında bu fark
 * genellikle %10-30 arasındadır.
 *
 * Metodoloji:
 *   - Milli Emlak ihale sonuçları (gerçek satış) vs ilan fiyatları karşılaştırması
 *   - Literatür: REIDIN, Endeksa, Colliers Türkiye raporları 2022-2025
 *   - Kategori ve bölge bazlı farklılaşma (arsa vs tarla, büyükşehir vs kırsal)
 *   - Piyasa ısısı: Soğuk piyasada iskonto artıyor, sıcak piyasada azalıyor
 *
 * Kullanım:
 *   const iskonto = iskontoGetir("İstanbul", "arsa", "sıcak");
 *   const gercekFiyat = Math.round(ilanFiyati * (1 - iskonto.oran));
 *
 * NOT: Bu iskonto fiyat-tahmin.ts'te emsal ortalaması hesaplandıktan SONRA
 * uygulanmalıdır — emsal ortalaması zaten asking price bazlı.
 */

// ─── Tipler ──────────────────────────────────────────────────────────────────

export type PiyasaIsisi = "sicak" | "normal" | "soguk";
export type ParselKategori = "arsa" | "tarla" | "baha" | "genel";

export interface IskontoSonucu {
  /** İskonto oranı (0.0 – 0.40). Örn: 0.15 = %15 */
  oran: number;
  /** Düzeltilmiş çarpan (1 - oran). Örn: 0.85 = %15 iskonto */
  carpan: number;
  /** Bölge bazlı iskonto */
  bolgeIskonto: number;
  /** Piyasa ısısı bazlı düzeltme */
  piyasaDuzeltme: number;
  /** Açıklama */
  aciklama: string;
  /** Kaynaklar */
  metodoloji: string;
}

// ─── Bölgesel iskonto tablosu ─────────────────────────────────────────────────
// Kaynak: Milli Emlak ihale analizi + Colliers TR 2023-2025 + REIDIN
// Format: ilNorm → { arsa: oran, tarla: oran }

interface BolgeIskonto {
  arsa: number;
  tarla: number;
}

const IL_ISKONTO: Readonly<Record<string, BolgeIskonto>> = {
  // ── Büyükşehirler — likit piyasa, düşük iskonto ──────────────────────────
  "istanbul":    { arsa: 0.12, tarla: 0.18 },
  "ankara":      { arsa: 0.14, tarla: 0.20 },
  "izmir":       { arsa: 0.13, tarla: 0.18 },
  "bursa":       { arsa: 0.15, tarla: 0.20 },
  "antalya":     { arsa: 0.13, tarla: 0.18 },
  "kocaeli":     { arsa: 0.14, tarla: 0.20 },
  "gaziantep":   { arsa: 0.16, tarla: 0.22 },
  "konya":       { arsa: 0.17, tarla: 0.23 },
  "mersin":      { arsa: 0.15, tarla: 0.20 },
  "adana":       { arsa: 0.16, tarla: 0.22 },
  "eskisehir":   { arsa: 0.16, tarla: 0.22 },
  "kayseri":     { arsa: 0.18, tarla: 0.24 },
  "sakarya":     { arsa: 0.16, tarla: 0.22 },

  // ── Sahil/turizm — mevsimsel, orta iskonto ────────────────────────────────
  "mugla":       { arsa: 0.14, tarla: 0.22 },
  "aydin":       { arsa: 0.16, tarla: 0.22 },
  "balikesir":   { arsa: 0.17, tarla: 0.23 },
  "canakkale":   { arsa: 0.17, tarla: 0.23 },
  "yalova":      { arsa: 0.15, tarla: 0.20 },
  "tekirdag":    { arsa: 0.16, tarla: 0.22 },

  // ── Orta Anadolu — daha az likit, yüksek iskonto ─────────────────────────
  "trabzon":     { arsa: 0.18, tarla: 0.24 },
  "samsun":      { arsa: 0.18, tarla: 0.24 },
  "hatay":       { arsa: 0.19, tarla: 0.25 },
  "manisa":      { arsa: 0.18, tarla: 0.24 },
  "denizli":     { arsa: 0.18, tarla: 0.24 },

  // ── Doğu/Güneydoğu — likit olmayan piyasa, yüksek iskonto ────────────────
  "diyarbakir":  { arsa: 0.22, tarla: 0.28 },
  "sanliurfa":   { arsa: 0.23, tarla: 0.29 },
  "erzurum":     { arsa: 0.25, tarla: 0.30 },
  "van":         { arsa: 0.26, tarla: 0.32 },
  "mardin":      { arsa: 0.24, tarla: 0.30 },
  "batman":      { arsa: 0.23, tarla: 0.29 },
  "siirt":       { arsa: 0.25, tarla: 0.31 },
  "sirnak":      { arsa: 0.26, tarla: 0.32 },
  "hakkari":     { arsa: 0.28, tarla: 0.34 },
  "agri":        { arsa: 0.27, tarla: 0.33 },
  "kars":        { arsa: 0.27, tarla: 0.33 },
  "ardahan":     { arsa: 0.28, tarla: 0.34 },
  "igdir":       { arsa: 0.25, tarla: 0.31 },
};

/** Varsayılan (tabloda olmayan iller) */
const VARSAYILAN_ISKONTO: BolgeIskonto = { arsa: 0.20, tarla: 0.26 };

// ─── Piyasa ısısı düzeltmeleri ────────────────────────────────────────────────
// Sıcak piyasa: çok alıcı, az satıcı → iskonto azalır (satıcı taviz vermiyor)
// Soğuk piyasa: az alıcı, çok satıcı → iskonto artar

const PIYASA_ISISI_DUZELTME: Readonly<Record<PiyasaIsisi, number>> = {
  "sicak":  -0.05,  // Sıcak piyasada %5 daha az iskonto
  "normal":  0.00,  // Referans
  "soguk":  +0.07,  // Soğuk piyasada %7 daha fazla iskonto
};

// ─── Ana fonksiyonlar ─────────────────────────────────────────────────────────

/**
 * İl + kategori bazlı satış iskonto oranını getir.
 *
 * @param ilNorm    normalizeYerAdi(ilAd) — küçük harf, TR→Latin
 * @param kategori  "arsa" | "tarla" | "genel"
 * @param piyasa    Piyasa ısısı — varsayılan "normal"
 */
export function iskontoGetir(
  ilNorm: string | null | undefined,
  kategori: ParselKategori = "genel",
  piyasa: PiyasaIsisi = "normal",
): IskontoSonucu {
  const tablo = ilNorm ? (IL_ISKONTO[ilNorm] ?? VARSAYILAN_ISKONTO) : VARSAYILAN_ISKONTO;

  // Kategori bazlı temel iskonto
  let bolgeIskonto: number;
  switch (kategori) {
    case "arsa":
      bolgeIskonto = tablo.arsa;
      break;
    case "tarla":
      bolgeIskonto = tablo.tarla;
      break;
    case "baha":
      // Bağ/bahçe — arsa ile tarla arası
      bolgeIskonto = (tablo.arsa + tablo.tarla) / 2;
      break;
    default:
      // Genel: arsa ağırlıklı (emsal havuzu çoğunlukla arsa/tarla karışık)
      bolgeIskonto = tablo.arsa * 0.6 + tablo.tarla * 0.4;
  }

  const piyasaDuzeltme = PIYASA_ISISI_DUZELTME[piyasa];
  const oran = Math.max(0.05, Math.min(0.40, bolgeIskonto + piyasaDuzeltme));
  const carpan = 1 - oran;

  const ilAdi = ilNorm
    ? ilNorm.charAt(0).toUpperCase() + ilNorm.slice(1)
    : "Bilinmeyen il";
  const tablodaMi = ilNorm && IL_ISKONTO[ilNorm] ? "il tablosu" : "varsayılan";

  return {
    oran,
    carpan,
    bolgeIskonto,
    piyasaDuzeltme,
    aciklama: `${ilAdi} ${kategori} satış iskontosu: %${Math.round(oran * 100)} (${tablodaMi}, piyasa: ${piyasa})`,
    metodoloji: "Milli Emlak ihale analizi + Colliers TR 2023-2025 + REIDIN",
  };
}

/**
 * Asking price'ı gerçek satış fiyatı tahminine çevir.
 *
 * @param askingPerM2  İlan fiyatı (TL/m²)
 * @param ilNorm       İl (normalize)
 * @param kategori     Parsel kategorisi
 * @param piyasa       Piyasa ısısı
 */
export function askingtenGercege(
  askingPerM2: number,
  ilNorm: string | null | undefined,
  kategori: ParselKategori = "genel",
  piyasa: PiyasaIsisi = "normal",
): { gercekPerM2: number; iskonto: IskontoSonucu } {
  const iskonto = iskontoGetir(ilNorm, kategori, piyasa);
  return {
    gercekPerM2: Math.round(askingPerM2 * iskonto.carpan),
    iskonto,
  };
}

/**
 * Piyasa ısısını tahmin et — mevcut TÜİK/TCMB verilerinden heuristik.
 *
 * Şu an statik (2026 başı Türkiye genel piyasası normal/soğuma).
 * Gelecekte: TCMB KFE değişim hızı + ilanGozlem stale oranı dinamik hesap.
 *
 * @param ilNorm İl normu
 */
export function piyasaIsisiTahmin(ilNorm: string | null | undefined): PiyasaIsisi {
  // İstanbul, İzmir, Ankara merkez — 2025 sonu itibarıyla görece sıcak
  const sicakIller = new Set(["istanbul", "izmir", "antalya", "mugla"]);
  // Doğu iller — yapısal olarak soğuk
  const sogukIller = new Set([
    "van", "hakkari", "ardahan", "igdir", "kars", "agri", "tunceli", "bayburt",
  ]);

  if (!ilNorm) return "normal";
  if (sicakIller.has(ilNorm)) return "sicak";
  if (sogukIller.has(ilNorm)) return "soguk";
  return "normal";
}

/**
 * Fiyat tahmin motoruna entegrasyon için tek giriş noktası.
 * İlanGozlem tabanlı emsal ortalamasına iskonto uygular.
 *
 * @param emsalOrtalamaPerM2  Ağırlıklı ortalama asking price (TL/m²)
 * @param ilNorm              İl norm
 * @param kategori            Parsel kategorisi
 */
export function emsaleIskontoUygula(
  emsalOrtalamaPerM2: number,
  ilNorm: string | null | undefined,
  kategori: ParselKategori = "genel",
): { duzeltilmisPerM2: number; carpan: number; aciklama: string } {
  const piyasa = piyasaIsisiTahmin(ilNorm);
  const { gercekPerM2, iskonto } = askingtenGercege(emsalOrtalamaPerM2, ilNorm, kategori, piyasa);

  return {
    duzeltilmisPerM2: gercekPerM2,
    carpan: iskonto.carpan,
    aciklama: iskonto.aciklama,
  };
}
