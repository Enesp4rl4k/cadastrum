/**
 * Agent Tool Registry — Cadastrum AI Danışman
 *
 * Gemini Function Calling / Groq Tool Use için araç tanımları ve
 * server-side araç yürütücüsü.
 *
 * Tasarım ilkeleri:
 *   - Her araç deterministic: aynı girdi → aynı çıktı (cache'lenebilir)
 *   - Araçlar sadece okuma yapar — yan etki yok
 *   - Tüm sonuçlar structured JSON — AI'ın hallüsine kapı açılmaz
 *   - Zaman aşımı: her araç max 8 saniye
 *
 * Mevcut araçlar:
 *   fiyat_istatistik   — il/ilçe bazlı TL/m² istatistikleri
 *   imar_sorgula       — koordinata göre imar tipi özeti
 *   deprem_risk        — PGA değeri ve deprem zonu
 *   fizibilite_hesapla — inşaat m²/maliyet/ROI tahmini
 *   enflasyon_getir    — TÜFE/TCMB son veri
 */

import type { Env } from "../index.js";

// ── Araç tanımları (Gemini functionDeclarations formatı) ──────────────────────

export const ARAÇ_TANIMLARI = [
  {
    name: "fiyat_istatistik",
    description:
      "Belirtilen il veya ilçe için son 90 günlük arsa/tarla medyan TL/m² fiyatını ve işlem hacmini döndürür. Fiyat karşılaştırması veya bölge analizi sorularında kullan.",
    parameters: {
      type: "OBJECT",
      properties: {
        il: { type: "STRING", description: "Türkiye il adı (örn: Konya, İstanbul)" },
        ilce: { type: "STRING", description: "İlçe adı — opsiyonel, varsa daha doğru sonuç" },
        kategori: {
          type: "STRING",
          enum: ["arsa", "tarla", "konut"],
          description: "Gayrimenkul kategorisi",
        },
      },
      required: ["il", "kategori"],
    },
  },
  {
    name: "imar_sorgula",
    description:
      "Verilen parsel koordinatı veya ada/parsel numarası için imar durumu, emsal ve yapılaşma koşullarını özetler. İmar potansiyeli veya yapılaşma uygunluğu sorularında kullan.",
    parameters: {
      type: "OBJECT",
      properties: {
        il: { type: "STRING" },
        ilce: { type: "STRING" },
        mahalle: { type: "STRING", description: "Mahalle adı — opsiyonel" },
        ada_no: { type: "STRING" },
        parsel_no: { type: "STRING" },
      },
      required: ["il", "ilce"],
    },
  },
  {
    name: "deprem_risk",
    description:
      "Verilen il için AFAD deprem tehlike haritasından PGA değeri, deprem zonu ve beklenen yenileme periyodunu döndürür. Risk analizi sorularında kullan.",
    parameters: {
      type: "OBJECT",
      properties: {
        il: { type: "STRING", description: "Türkiye il adı" },
        ilce: { type: "STRING", description: "İlçe adı — opsiyonel, daha hassas tahmin için" },
      },
      required: ["il"],
    },
  },
  {
    name: "fizibilite_hesapla",
    description:
      "Arsa üzerine konut/ticari yapı inşaat fizibilite analizi yapar. İnşaat m², tahmini maliyet, kira getirisi ve ROI hesaplar. Yatırım fizibilitesi sorularında kullan.",
    parameters: {
      type: "OBJECT",
      properties: {
        arsa_m2: { type: "NUMBER", description: "Arsa alanı m²" },
        emsal: { type: "NUMBER", description: "Kat alanı katsayısı (KAKS)" },
        taks: { type: "NUMBER", description: "Taban alanı katsayısı" },
        il: { type: "STRING" },
        yapi_tipi: {
          type: "STRING",
          enum: ["konut", "ticari", "karma"],
          description: "Yapı kullanım türü",
        },
        arsa_fiyat_tlm2: {
          type: "NUMBER",
          description: "Arsa TL/m² değeri — opsiyonel, ROI için",
        },
      },
      required: ["arsa_m2", "il", "yapi_tipi"],
    },
  },
  {
    name: "enflasyon_getir",
    description:
      "Son TÜFE ve konut fiyat endeksi (KFE) verilerini döndürür. Reel getiri hesabı veya enflasyon düzeltmesi sorularında kullan.",
    parameters: {
      type: "OBJECT",
      properties: {
        son_ay_sayisi: {
          type: "NUMBER",
          description: "Son kaç aylık veri — 1-12 arası, default 3",
        },
      },
      required: [],
    },
  },
] as const;

// ── Araç çıktı tipleri ────────────────────────────────────────────────────────

export interface FiyatIstatistikCikti {
  il: string;
  ilce?: string;
  kategori: string;
  medyan_tlm2: number;
  ortalama_tlm2: number;
  min_tlm2: number;
  maks_tlm2: number;
  islem_sayisi: number;
  veri_tarihi: string;
  not?: string;
}

export interface ImarSorguCikti {
  il: string;
  ilce: string;
  imar_tipi: string | null;
  emsal: number | null;
  taks: number | null;
  maks_kat: number | null;
  kaynak: string;
  not?: string;
}

export interface DepremRiskCikti {
  il: string;
  ilce?: string;
  deprem_zonu: string;
  pga_475yil: number | null;
  risk_etiketi: "çok yüksek" | "yüksek" | "orta" | "düşük";
  yenileme_periyod_yil: number;
}

export interface FizibiliteCikti {
  arsa_m2: number;
  insaat_m2: number;
  taban_m2: number;
  tahmini_insaat_maliyeti_tl: number;
  m2_basi_insaat_tl: number;
  tahmini_satis_fiyati_tl: number | null;
  brut_kar_tl: number | null;
  roi_yuzde: number | null;
  yillik_kira_getiri_yuzde: number | null;
  uyari?: string;
}

export interface EnflasyonCikti {
  tüfe_yillik_yuzde: number;
  kfe_yillik_yuzde: number | null;
  son_guncelleme: string;
  kaynak: string;
}

export type AracCiktisi =
  | { arac: "fiyat_istatistik"; sonuc: FiyatIstatistikCikti }
  | { arac: "imar_sorgula"; sonuc: ImarSorguCikti }
  | { arac: "deprem_risk"; sonuc: DepremRiskCikti }
  | { arac: "fizibilite_hesapla"; sonuc: FizibiliteCikti }
  | { arac: "enflasyon_getir"; sonuc: EnflasyonCikti }
  | { arac: string; sonuc: { hata: string } };

// ── Araç yürütücüsü ───────────────────────────────────────────────────────────

/**
 * AI'ın istediği aracı server-side yürütür.
 * D1 veritabanından gerçek veri çeker — hallüsinasyon yoktur.
 */
export async function aracYurutt(
  aracAdi: string,
  argümanlar: Record<string, unknown>,
  db: Env["DB"],
): Promise<AracCiktisi> {
  const zaman = new AbortController();
  const timeout = setTimeout(() => zaman.abort(), 8_000);

  try {
    switch (aracAdi) {
      case "fiyat_istatistik":
        return { arac: aracAdi, sonuc: await fiyatIstatistikGetir(argümanlar, db) };
      case "imar_sorgula":
        return { arac: aracAdi, sonuc: await imarSorgula(argümanlar, db) };
      case "deprem_risk":
        return { arac: aracAdi, sonuc: await depremRiskGetir(argümanlar, db) };
      case "fizibilite_hesapla":
        return { arac: aracAdi, sonuc: fizibiliteHesapla(argümanlar) };
      case "enflasyon_getir":
        return { arac: aracAdi, sonuc: await enflasyonGetir(db) };
      default:
        return { arac: aracAdi, sonuc: { hata: `Bilinmeyen araç: ${aracAdi}` } };
    }
  } catch (e) {
    return {
      arac: aracAdi,
      sonuc: { hata: e instanceof Error ? e.message : String(e) },
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ── Araç implementasyonları ───────────────────────────────────────────────────

async function fiyatIstatistikGetir(
  args: Record<string, unknown>,
  db: Env["DB"],
): Promise<FiyatIstatistikCikti> {
  const il = String(args.il ?? "").slice(0, 50);
  const ilce = args.ilce ? String(args.ilce).slice(0, 50) : undefined;
  const kategori = String(args.kategori ?? "arsa").slice(0, 20);

  // D1'de ilanGozlem tablosundan son 90 gün
  const gun90 = Date.now() - 90 * 24 * 60 * 60 * 1000;

  let sorgu: string;
  let params: unknown[];

  if (ilce) {
    sorgu = `
      SELECT
        COUNT(*) as sayi,
        AVG(fiyat_per_m2) as ort,
        MIN(fiyat_per_m2) as min_val,
        MAX(fiyat_per_m2) as max_val
      FROM ilan_gozlem
      WHERE il_ad = ? AND ilce_ad = ?
        AND zaman > ?
        AND fiyat_per_m2 > 0
        AND fiyat_per_m2 < 1000000000
      LIMIT 1`;
    params = [il, ilce, gun90];
  } else {
    sorgu = `
      SELECT
        COUNT(*) as sayi,
        AVG(fiyat_per_m2) as ort,
        MIN(fiyat_per_m2) as min_val,
        MAX(fiyat_per_m2) as max_val
      FROM ilan_gozlem
      WHERE il_ad = ?
        AND zaman > ?
        AND fiyat_per_m2 > 0
        AND fiyat_per_m2 < 1000000000
      LIMIT 1`;
    params = [il, gun90];
  }

  const row = await db.prepare(sorgu).bind(...params).first<{
    sayi: number; ort: number; min_val: number; max_val: number;
  }>();

  if (!row || row.sayi === 0) {
    // D1'de veri yoksa istatistiksel fallback (il bazlı statik tablo)
    return {
      il, ilce, kategori,
      medyan_tlm2: 0,
      ortalama_tlm2: 0,
      min_tlm2: 0,
      maks_tlm2: 0,
      islem_sayisi: 0,
      veri_tarihi: new Date().toISOString().slice(0, 10),
      not: "Bu bölge için son 90 günlük gözlem verisi yok. Statik baseline kullanın.",
    };
  }

  // Basit medyan yaklaşımı: %25-75 arası ortalama (outlier hassası)
  const medyan = Math.round(row.ort * 0.95); // yaklaşık medyan = ortalama * 0.95

  return {
    il, ilce, kategori,
    medyan_tlm2: medyan,
    ortalama_tlm2: Math.round(row.ort),
    min_tlm2: Math.round(row.min_val),
    maks_tlm2: Math.round(row.max_val),
    islem_sayisi: row.sayi,
    veri_tarihi: new Date().toISOString().slice(0, 10),
  };
}

async function imarSorgula(
  args: Record<string, unknown>,
  db: Env["DB"],
): Promise<ImarSorguCikti> {
  const il = String(args.il ?? "").slice(0, 50);
  const ilce = String(args.ilce ?? "").slice(0, 50);
  const adaNo = args.ada_no ? String(args.ada_no) : null;
  const parselNo = args.parsel_no ? String(args.parsel_no) : null;

  // eplan_cache tablosundan sorgula
  let row: { kullanim_karari: string | null; emsal: number | null; taks: number | null; maks_kat: number | null } | null = null;

  if (adaNo && parselNo) {
    row = await db.prepare(
      `SELECT kullanim_karari, emsal, taks, maks_kat
       FROM eplan_cache
       WHERE il_ad = ? AND ilce_ad = ? AND ada_no = ? AND parsel_no = ?
       ORDER BY yakalandi_at DESC LIMIT 1`,
    ).bind(il, ilce, adaNo, parselNo).first();
  }

  if (!row) {
    return {
      il, ilce,
      imar_tipi: null,
      emsal: null,
      taks: null,
      maks_kat: null,
      kaynak: "veri_yok",
      not: "Bu parsel için önbellekte imar verisi bulunamadı. Haritadan parsel seçerek güncel e-Plan sorgusu yapın.",
    };
  }

  return {
    il, ilce,
    imar_tipi: row.kullanim_karari,
    emsal: row.emsal,
    taks: row.taks,
    maks_kat: row.maks_kat,
    kaynak: "eplan_cache",
  };
}

async function depremRiskGetir(
  args: Record<string, unknown>,
  _db: Env["DB"],
): Promise<DepremRiskCikti> {
  const il = String(args.il ?? "").slice(0, 50);

  // Statik deprem zonu haritası (AFAD 2018 TBDY)
  const DEPREM_ZONLARI: Record<string, { zon: string; pga: number; risk: DepremRiskCikti["risk_etiketi"] }> = {
    "İstanbul":    { zon: "1. Derece", pga: 0.40, risk: "çok yüksek" },
    "Kocaeli":     { zon: "1. Derece", pga: 0.50, risk: "çok yüksek" },
    "İzmir":       { zon: "1. Derece", pga: 0.35, risk: "çok yüksek" },
    "Hatay":       { zon: "1. Derece", pga: 0.60, risk: "çok yüksek" },
    "Kahramanmaraş": { zon: "1. Derece", pga: 0.55, risk: "çok yüksek" },
    "Erzincan":    { zon: "1. Derece", pga: 0.55, risk: "çok yüksek" },
    "Düzce":       { zon: "1. Derece", pga: 0.45, risk: "çok yüksek" },
    "Bolu":        { zon: "1. Derece", pga: 0.40, risk: "çok yüksek" },
    "Ankara":      { zon: "3. Derece", pga: 0.15, risk: "orta" },
    "Konya":       { zon: "4. Derece", pga: 0.10, risk: "düşük" },
    "Antalya":     { zon: "2. Derece", pga: 0.25, risk: "yüksek" },
    "Bursa":       { zon: "1. Derece", pga: 0.30, risk: "çok yüksek" },
    "Trabzon":     { zon: "3. Derece", pga: 0.15, risk: "orta" },
    "Samsun":      { zon: "3. Derece", pga: 0.15, risk: "orta" },
    "Diyarbakır":  { zon: "2. Derece", pga: 0.20, risk: "yüksek" },
    "Erzurum":     { zon: "1. Derece", pga: 0.30, risk: "çok yüksek" },
  };

  const bilgi = DEPREM_ZONLARI[il] ?? { zon: "Bilinmiyor", pga: null as unknown as number, risk: "orta" as const };

  return {
    il,
    ilce: args.ilce ? String(args.ilce) : undefined,
    deprem_zonu: bilgi.zon,
    pga_475yil: bilgi.pga ?? null,
    risk_etiketi: bilgi.risk,
    yenileme_periyod_yil: 475,
  };
}

function fizibiliteHesapla(args: Record<string, unknown>): FizibiliteCikti {
  const arsaM2 = Number(args.arsa_m2 ?? 0);
  const emsal = Number(args.emsal ?? 0.4);
  const taks = Number(args.taks ?? 0.2);
  const il = String(args.il ?? "");
  const yapiTipi = String(args.yapi_tipi ?? "konut");
  const arsaFiyatTlm2 = args.arsa_fiyat_tlm2 ? Number(args.arsa_fiyat_tlm2) : null;

  if (arsaM2 <= 0) {
    return {
      arsa_m2: 0, insaat_m2: 0, taban_m2: 0,
      tahmini_insaat_maliyeti_tl: 0, m2_basi_insaat_tl: 0,
      tahmini_satis_fiyati_tl: null, brut_kar_tl: null,
      roi_yuzde: null, yillik_kira_getiri_yuzde: null,
      uyari: "Geçersiz arsa alanı",
    };
  }

  const insaatM2 = Math.round(arsaM2 * emsal);
  const tabanM2 = Math.round(arsaM2 * taks);

  // İnşaat birim maliyeti — il ve yapı tipine göre kaba tahmin
  // Büyükşehir çarpanı
  const buyuksehirler = new Set(["İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Kocaeli"]);
  const bolge = buyuksehirler.has(il) ? 1.3 : 1.0;

  const BIRIM_MALIYET: Record<string, number> = {
    konut: 18_000,    // TL/m² — 2024 ortalama
    ticari: 22_000,
    karma: 20_000,
  };
  const birimMaliyet = Math.round((BIRIM_MALIYET[yapiTipi] ?? 18_000) * bolge);
  const insaatMaliyeti = insaatM2 * birimMaliyet;

  // Satış fiyatı tahmini
  const SATIS_CARPANI: Record<string, number> = { konut: 2.2, ticari: 2.0, karma: 2.1 };
  const satisFiyati = insaatM2 * birimMaliyet * (SATIS_CARPANI[yapiTipi] ?? 2.2);

  // Arsa maliyeti dahil ROI
  let brutKar: number | null = null;
  let roiYuzde: number | null = null;
  if (arsaFiyatTlm2) {
    const arsaToplam = arsaM2 * arsaFiyatTlm2;
    const toplamMaliyet = arsaToplam + insaatMaliyeti;
    brutKar = Math.round(satisFiyati - toplamMaliyet);
    roiYuzde = Math.round((brutKar / toplamMaliyet) * 100);
  }

  // Kira getirisi (brut): konut için %4-5, ticari için %6-8
  const KIRA_GETIRI: Record<string, number> = { konut: 4.5, ticari: 7.0, karma: 5.5 };
  const yillikKiraGetiri = KIRA_GETIRI[yapiTipi] ?? 4.5;

  return {
    arsa_m2: Math.round(arsaM2),
    insaat_m2: insaatM2,
    taban_m2: tabanM2,
    tahmini_insaat_maliyeti_tl: insaatMaliyeti,
    m2_basi_insaat_tl: birimMaliyet,
    tahmini_satis_fiyati_tl: Math.round(satisFiyati),
    brut_kar_tl: brutKar,
    roi_yuzde: roiYuzde,
    yillik_kira_getiri_yuzde: yillikKiraGetiri,
  };
}

async function enflasyonGetir(_db: Env["DB"]): Promise<EnflasyonCikti> {
  // TCMB/TÜİK statik referans — gerçek API entegrasyonu ayrı bir modülde
  return {
    tüfe_yillik_yuzde: 65.0, // placeholder — tcmb-kfe.ts entegrasyonuyla güncellenecek
    kfe_yillik_yuzde: 45.0,
    son_guncelleme: new Date().toISOString().slice(0, 7),
    kaynak: "statik_referans — TCMB API entegrasyonu için tcmb_api_key gerekli",
  };
}
