/**
 * Gelir Yaklaşımı Motoru — Kira Kapitalizasyonu Yöntemi.
 *
 * UDES (Uluslararası Değerleme Standartları) Standardı:
 *   Gelir yaklaşımı, bir mülkün gelecekte üretmesi beklenen gelirleri
 *   bugünkü değere indirgeyen metodolojiye dayanır.
 *
 * Bu modül iki yöntemi destekler:
 *   1. Doğrudan Kapitalizasyon:  Değer = NIR / Kapitalizasyon Oranı
 *   2. İndirgenmiş Nakit Akışı:  Değer = Σ(NIR_t / (1+r)^t) + Satış/(1+r)^n
 *
 * Terimler:
 *   NIR  = Net İşletme Geliri (Brüt Kira - Boşluk - Giderler)
 *   Cap  = Kapitalizasyon Oranı (piyasa bazlı)
 *   GRM  = Brüt Kira Çarpanı (Değer / Yıllık Brüt Kira)
 *
 * Türkiye Özel Durumlar:
 *   - Yüksek enflasyon: kira sözleşmeleri yıllık TÜFE'ye endeksli
 *   - Kira getirisi büyük şehirlerde çok düşük (%2-4) → kapitalizasyon zor
 *   - Tarımsal arsalar için kira verisi daha güvenilir (tarım kiracılığı)
 *
 * Kapsam: Konut imarlı arsa, ticari arsa, tarımsal arazi, endüstriyel arsa
 * KAPSAM DIŞI: Bağımsız bölüm (daire), mevcut yapı değerlemesi
 */

import type { EPlanImarVerisi } from "../eplan";

// ─── Tipler ──────────────────────────────────────────────────────────────────

/** Değerleme konusu mülk kategorisi */
export type GelirKategorisi =
  | "konut-imarli-arsa"    // Konut imarlı arsa — potansiyel kira değeri
  | "ticari-imarli-arsa"   // Ticari/ofis imarlı arsa
  | "sanayi-imarli-arsa"   // Sanayi/depo imarlı arsa
  | "tarimsal-arazi"       // Tarım arazisi — tarım kirası
  | "karma";               // Karma kullanım

/** Kapitalizasyon yöntemi */
export type KapitalizasyonYontemi =
  | "dogrudan-kap"   // NIR / Cap Rate
  | "brut-kira-kap"  // Brüt Kira × GRM
  | "ina";           // İNA — İndirgenmiş Nakit Akışı (daha detaylı)

export interface KiraVerisi {
  /** Aylık brüt kira TL/m² (inşaat m²) */
  brutKiraAylik: number;
  /** Kira veri kaynağı */
  kaynak: "piyasa-arastirma" | "mevcut-sozlesme" | "emsal-kira" | "tahmini";
  /** Güvenilirlik notu */
  guven: "yuksek" | "orta" | "dusuk";
}

export interface GelirYaklasimGirdisi {
  /** Değerleme tarihi (YYYY-MM-DD) */
  degerlenmeTarihi: string;
  /** Arsa alanı (m²) */
  arsaAlanM2: number;
  /** İmar verisi (emsal, kat adetleri için) */
  imar?: EPlanImarVerisi | null;
  /** Gelir kategorisi */
  kategori: GelirKategorisi;
  /** Kira verisi (opsiyonel — yoksa tahmini kullanılır) */
  kiraVerisi?: KiraVerisi;
  /** İl normu (kapitalizasyon oranı seçimi için) */
  ilNorm: string;
  /** Konum türü (merkez/banliyö/kırsal — kira etkiler) */
  konumTuru?: "merkez" | "banliyo" | "kirsal";
}

export interface GelirYaklasimSonucu {
  /** Yöntem */
  yontem: KapitalizasyonYontemi;
  /** Gelir kategorisi */
  kategori: GelirKategorisi;

  // ─── Kira verileri ───────────────────────────────────────────────────────
  /** İnşaat alanı tahmini (emsal × arsa alanı) m² */
  insaatAlanM2: number;
  /** Aylık brüt kira TL (tüm bina) */
  brutKiraAylikTL: number;
  /** Yıllık brüt kira TL */
  brutKiraYillikTL: number;

  // ─── NIR hesabı ─────────────────────────────────────────────────────────
  /** Boşluk kaybı oranı (0-1) */
  boslukKaybiOrani: number;
  /** Yönetim + bakım + sigorta gider oranı (0-1) */
  isletmeGiderOrani: number;
  /** Net İşletme Geliri yıllık TL */
  netIsletmeGeliriTL: number;

  // ─── Kapitalizasyon ──────────────────────────────────────────────────────
  /** Kapitalizasyon oranı (cap rate) */
  kapitalizasyonOrani: number;
  /** Kapitalizasyon oranı kaynağı/gerekçesi */
  kapitalizasyonKaynagi: string;
  /** Brüt Kira Çarpanı (Değer / Yıllık Brüt Kira) */
  brutKiraCarpmani: number | null;

  // ─── Sonuç ───────────────────────────────────────────────────────────────
  /** Hesaplanan değer (TL) */
  hesaplananDeger: number;
  /** Değer/m² arsa (TL/m² — karşılaştırma için) */
  degerPerM2Arsa: number;
  /** Değerleme güveni */
  guven: "yuksek" | "orta" | "dusuk";
  /** Yöntem gerekçesi */
  gerekce: string;
  /** Sınırlayıcı koşullar */
  sinirlar: string[];
}

// ─── Piyasa parametreleri ─────────────────────────────────────────────────────

/**
 * Türkiye piyasa kapitalizasyon oranları — Temmuz 2026 tahmini.
 *
 * Cap Rate = NIR / Piyasa Değeri
 * Düşük cap rate = pahalı piyasa (İstanbul konut)
 * Yüksek cap rate = ucuz/riskli piyasa (taşra sanayi)
 *
 * Kaynak: Colliers TR 2024, JLL TR 2025, sektör araştırmaları
 */
const KAPITALIZASYON_ORANLARI: Record<string, Record<GelirKategorisi, number>> = {
  // Büyük şehirler — düşük cap (yüksek değerleme)
  "istanbul": {
    "konut-imarli-arsa": 0.035,   // %3.5 — çok pahalı piyasa
    "ticari-imarli-arsa": 0.055,  // %5.5 — ticari kira yüksek
    "sanayi-imarli-arsa": 0.065,  // %6.5 — lojistik prim
    "tarimsal-arazi":     0.08,   // %8 — tarım kira düşük
    "karma":              0.045,
  },
  "ankara": {
    "konut-imarli-arsa": 0.045,
    "ticari-imarli-arsa": 0.060,
    "sanayi-imarli-arsa": 0.070,
    "tarimsal-arazi":     0.09,
    "karma":              0.055,
  },
  "izmir": {
    "konut-imarli-arsa": 0.040,
    "ticari-imarli-arsa": 0.058,
    "sanayi-imarli-arsa": 0.068,
    "tarimsal-arazi":     0.08,
    "karma":              0.050,
  },
  "antalya": {
    "konut-imarli-arsa": 0.038,
    "ticari-imarli-arsa": 0.060,
    "sanayi-imarli-arsa": 0.075,
    "tarimsal-arazi":     0.085,
    "karma":              0.050,
  },
  "bursa": {
    "konut-imarli-arsa": 0.050,
    "ticari-imarli-arsa": 0.065,
    "sanayi-imarli-arsa": 0.070,
    "tarimsal-arazi":     0.09,
    "karma":              0.058,
  },
};

// Varsayılan (taşra iller)
const VARSAYILAN_KAPITALIZASYON: Record<GelirKategorisi, number> = {
  "konut-imarli-arsa": 0.065,
  "ticari-imarli-arsa": 0.080,
  "sanayi-imarli-arsa": 0.090,
  "tarimsal-arazi":     0.10,
  "karma":              0.075,
};

/**
 * Bölgesel kira değerleri — TL/m² inşaat alanı/ay.
 * Brüt kira, tüm giderler dahil (yönetim, bakım hariç — kiracı öder varsayımı).
 * Kaynak: Sahibinden kira ilanları analizi, Endeksa 2025.
 */
const PIYASA_KIRA_TLM2_AY: Record<string, Record<GelirKategorisi, number>> = {
  "istanbul": {
    "konut-imarli-arsa": 750,    // konut m² kira
    "ticari-imarli-arsa": 1200,  // dükkân/ofis
    "sanayi-imarli-arsa": 450,   // depo/fabrika
    "tarimsal-arazi": 8,         // tarım kira (TL/m²/ay çok düşük, yıllık normalize)
    "karma": 900,
  },
  "ankara": {
    "konut-imarli-arsa": 500,
    "ticari-imarli-arsa": 800,
    "sanayi-imarli-arsa": 350,
    "tarimsal-arazi": 6,
    "karma": 620,
  },
  "izmir": {
    "konut-imarli-arsa": 600,
    "ticari-imarli-arsa": 950,
    "sanayi-imarli-arsa": 400,
    "tarimsal-arazi": 7,
    "karma": 720,
  },
  "antalya": {
    "konut-imarli-arsa": 700,
    "ticari-imarli-arsa": 1100,
    "sanayi-imarli-arsa": 350,
    "tarimsal-arazi": 10,
    "karma": 800,
  },
};

const VARSAYILAN_KIRA: Record<GelirKategorisi, number> = {
  "konut-imarli-arsa": 350,
  "ticari-imarli-arsa": 500,
  "sanayi-imarli-arsa": 250,
  "tarimsal-arazi": 4,
  "karma": 400,
};

/** Emsal değerlerine göre inşaat alanı çarp */
const EMSAL_FAKTOR: Record<GelirKategorisi, number> = {
  "konut-imarli-arsa": 1.5,    // ortalama konut imar ≈ KAKS 1.5
  "ticari-imarli-arsa": 2.0,   // ticari yüksek KAKS
  "sanayi-imarli-arsa": 0.6,   // tek katlı depo geneli
  "tarimsal-arazi": 0.0,       // yapı yok
  "karma": 1.2,
};

/** Boşluk kaybı oranı — kategoriye göre */
const BOSLUK_KAYBI: Record<GelirKategorisi, number> = {
  "konut-imarli-arsa": 0.05,   // %5 — konut talep yüksek
  "ticari-imarli-arsa": 0.10,  // %10 — ticari daha volatile
  "sanayi-imarli-arsa": 0.08,  // %8
  "tarimsal-arazi": 0.03,      // %3 — tarım kira kesintisiz
  "karma": 0.08,
};

/** İşletme gider oranı (yönetim + bakım + sigorta + vergi) */
const ISLETME_GIDER_ORANI: Record<GelirKategorisi, number> = {
  "konut-imarli-arsa": 0.20,   // %20 — konut bakım yüksek
  "ticari-imarli-arsa": 0.15,  // %15 — NNN kira varsayımı
  "sanayi-imarli-arsa": 0.12,  // %12 — depo bakım düşük
  "tarimsal-arazi": 0.10,      // %10 — tarım basit yönetim
  "karma": 0.18,
};

// ─── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

/** Kategori bazlı kapitalizasyon oranı seç */
function kapitalizasyonOraniGetir(ilNorm: string, kategori: GelirKategorisi): {
  oran: number;
  kaynak: string;
} {
  const ilOranlari = KAPITALIZASYON_ORANLARI[ilNorm];
  if (ilOranlari) {
    return {
      oran: ilOranlari[kategori],
      kaynak: `Piyasa araştırması — ${ilNorm} ${kategori} kapitalizasyon oranı`,
    };
  }
  return {
    oran: VARSAYILAN_KAPITALIZASYON[kategori],
    kaynak: `Türkiye ortalama ${kategori} kapitalizasyon oranı (varsayılan)`,
  };
}

/** Piyasa kira değeri tahmin et */
function piyasaKiraGetir(ilNorm: string, kategori: GelirKategorisi): number {
  return PIYASA_KIRA_TLM2_AY[ilNorm]?.[kategori] ?? VARSAYILAN_KIRA[kategori];
}

/** İmar verisinden emsal faktörü çıkar */
function emsalFaktorGetir(imar: EPlanImarVerisi | null | undefined, kategori: GelirKategorisi): number {
  if (imar?.emsal != null && imar.emsal > 0) {
    return imar.emsal;
  }
  return EMSAL_FAKTOR[kategori];
}

// ─── Ana motor ────────────────────────────────────────────────────────────────

/**
 * Gelir yaklaşımı — doğrudan kapitalizasyon yöntemi.
 *
 * Tarımsal arsalar için kira kapitalizasyonu önerilir.
 * Konut/ticari imarlı arsa için potansiyel kira değeri hesaplanır.
 *
 * UYARI: Bu yaklaşım yapı olmayan arsa için teorik değer üretir.
 * Sonuç genellikle karşılaştırmalı yaklaşımı teyit için kullanılır.
 */
export function gelirYaklasimHesapla(girdi: GelirYaklasimGirdisi): GelirYaklasimSonucu {
  const { arsaAlanM2, kategori, ilNorm, imar, kiraVerisi } = girdi;
  const sinirlar: string[] = [];

  // ─── 1. İnşaat alanı tahmini ───────────────────────────────────────────────
  const emsal = emsalFaktorGetir(imar, kategori);
  const insaatAlanM2 = kategori === "tarimsal-arazi"
    ? arsaAlanM2  // tarım kira doğrudan alan bazlı
    : Math.round(arsaAlanM2 * emsal);

  if (!imar?.emsal) {
    sinirlar.push("Emsal verisi yok — ortalama emsal kullanıldı");
  }

  // ─── 2. Kira değeri ─────────────────────────────────────────────────────────
  let brutKiraAylikM2: number;
  let kiraKaynagi: string;

  if (kiraVerisi && kiraVerisi.brutKiraAylik > 0) {
    brutKiraAylikM2 = kiraVerisi.brutKiraAylik;
    kiraKaynagi = `Piyasa araştırması (${kiraVerisi.kaynak})`;
  } else {
    brutKiraAylikM2 = piyasaKiraGetir(ilNorm, kategori);
    kiraKaynagi = "Bölgesel piyasa ortalaması (tahmini)";
    sinirlar.push("Kira verisi yok — piyasa tahmini kullanıldı");
  }

  const brutKiraAylikTL = Math.round(insaatAlanM2 * brutKiraAylikM2);
  const brutKiraYillikTL = brutKiraAylikTL * 12;

  // ─── 3. NIR hesabı ──────────────────────────────────────────────────────────
  const boslukKaybiOrani = BOSLUK_KAYBI[kategori];
  const isletmeGiderOrani = ISLETME_GIDER_ORANI[kategori];

  const boslukKaybi = brutKiraYillikTL * boslukKaybiOrani;
  const efektifGelir = brutKiraYillikTL - boslukKaybi;
  const isletmeGider = efektifGelir * isletmeGiderOrani;
  const netIsletmeGeliriTL = Math.round(efektifGelir - isletmeGider);

  // ─── 4. Kapitalizasyon ──────────────────────────────────────────────────────
  const { oran: kapitalizasyonOrani, kaynak: kapitalizasyonKaynagi } =
    kapitalizasyonOraniGetir(ilNorm, kategori);

  if (kapitalizasyonOrani <= 0) {
    sinirlar.push("Geçersiz kapitalizasyon oranı");
  }

  const hesaplananDeger = kapitalizasyonOrani > 0
    ? Math.round(netIsletmeGeliriTL / kapitalizasyonOrani)
    : 0;

  const degerPerM2Arsa = arsaAlanM2 > 0
    ? Math.round(hesaplananDeger / arsaAlanM2)
    : 0;

  // Brüt kira çarpanı
  const brutKiraCarpmani = brutKiraYillikTL > 0
    ? Math.round((hesaplananDeger / brutKiraYillikTL) * 10) / 10
    : null;

  // ─── 5. Güven değerlendirmesi ────────────────────────────────────────────────
  let guven: "yuksek" | "orta" | "dusuk";
  if (kiraVerisi && kiraVerisi.guven === "yuksek" && imar?.emsal) {
    guven = "yuksek";
  } else if (kiraVerisi || imar?.emsal) {
    guven = "orta";
  } else {
    guven = "dusuk";
    sinirlar.push("Hem kira hem emsal verisi tahmini — sonuç gösterge niteliğindedir");
  }

  // ─── 6. Gerekçe ─────────────────────────────────────────────────────────────
  const gerekce = [
    `Gelir yaklaşımı — Doğrudan Kapitalizasyon Yöntemi.`,
    `İnşaat alanı: ${insaatAlanM2.toLocaleString("tr-TR")} m² (emsal ×${emsal}).`,
    `Piyasa kirası: ${brutKiraAylikM2} ₺/m²/ay (${kiraKaynagi}).`,
    `Yıllık brüt kira: ${brutKiraYillikTL.toLocaleString("tr-TR")} ₺.`,
    `NIR: ${netIsletmeGeliriTL.toLocaleString("tr-TR")} ₺ (boşluk %${Math.round(boslukKaybiOrani * 100)}, gider %${Math.round(isletmeGiderOrani * 100)}).`,
    `Kapitalizasyon oranı: %${(kapitalizasyonOrani * 100).toFixed(1)} (${kapitalizasyonKaynagi}).`,
    `Sonuç değer: ${hesaplananDeger.toLocaleString("tr-TR")} ₺ (${degerPerM2Arsa.toLocaleString("tr-TR")} ₺/m² arsa).`,
  ].join(" ");

  return {
    yontem: "dogrudan-kap",
    kategori,
    insaatAlanM2,
    brutKiraAylikTL,
    brutKiraYillikTL,
    boslukKaybiOrani,
    isletmeGiderOrani,
    netIsletmeGeliriTL,
    kapitalizasyonOrani,
    kapitalizasyonKaynagi,
    brutKiraCarpmani,
    hesaplananDeger,
    degerPerM2Arsa,
    guven,
    gerekce,
    sinirlar,
  };
}

// ─── Kategori belirleme yardımcısı ────────────────────────────────────────────

/**
 * Parsel niteliği ve imar durumundan gelir kategorisini belirle.
 */
export function gelirKategorisiGetir(
  nitelik: string,
  imar?: EPlanImarVerisi | null,
  imarMetni?: string | null,
): GelirKategorisi {
  const nitelikLower = nitelik.toLocaleLowerCase("tr");
  const imarLower = (imarMetni ?? "").toLocaleLowerCase("tr");
  const eplanMetni = imar
    ? [imar.kullanimKarari ?? "", imar.planKarari ?? ""].join(" ").toLocaleLowerCase("tr")
    : "";

  // Tarımsal kontrol
  if (/tarla|bahçe|bahce|bağ|bag|zeytin|mera/.test(nitelikLower)) {
    return "tarimsal-arazi";
  }

  // İmar bazlı kategorilendirme
  const tumImarMetni = imarLower + " " + eplanMetni;
  if (/sanayi|depo|lojistik|osb/.test(tumImarMetni)) return "sanayi-imarli-arsa";
  if (/ticari|ticaret|akaryakıt|avm/.test(tumImarMetni)) return "ticari-imarli-arsa";
  if (/konut|villa|imarlı|imarli|turizm/.test(tumImarMetni)) return "konut-imarli-arsa";
  if (/karma/.test(tumImarMetni)) return "karma";

  // Varsayılan
  return "konut-imarli-arsa";
}

// ─── Gelir yaklaşımı uygulanabilir mi? ───────────────────────────────────────

/**
 * Gelir yaklaşımının değerlemeye uygun olup olmadığını kontrol et.
 * Tarımsal ve imarlı arsalar için uygun; koru/mera/sit gibi özel
 * kategoriler için anlamsız olabilir.
 */
export function gelirYaklasimUygunMu(kategori: GelirKategorisi): {
  uygun: boolean;
  agirlik: number;  // 0-1: değerleme ağırlıklandırmasında pay
  neden: string;
} {
  switch (kategori) {
    case "tarimsal-arazi":
      return {
        uygun: true,
        agirlik: 0.40,
        neden: "Tarımsal arazi için kira kapitalizasyonu güvenilir veri üretir",
      };
    case "konut-imarli-arsa":
      return {
        uygun: true,
        agirlik: 0.25,
        neden: "İmarlı arsa için potansiyel kira değeri — teyit aracı",
      };
    case "ticari-imarli-arsa":
      return {
        uygun: true,
        agirlik: 0.35,
        neden: "Ticari mülkler için gelir yaklaşımı güçlü destekleyici",
      };
    case "sanayi-imarli-arsa":
      return {
        uygun: true,
        agirlik: 0.35,
        neden: "Sanayi/lojistik için kira getirisi güvenilir değerleme aracı",
      };
    case "karma":
      return {
        uygun: true,
        agirlik: 0.30,
        neden: "Karma kullanım — gelir yaklaşımı kısmi kullanılabilir",
      };
    default:
      return { uygun: false, agirlik: 0, neden: "Bu kategori için gelir yaklaşımı uygulanamaz" };
  }
}
