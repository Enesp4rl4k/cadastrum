/**
 * AI Arazi Uygunluk Scorecard — Extension tarafı API client.
 *
 * Backend /v1/ai-scorecard/analiz endpoint'ini çağırır.
 */

// ── Tipler (backend ile aynı yapı, cross-import yok) ─────────────────────────
export interface ScorecardParselVeri {
  il: string;
  ilce: string;
  mahalle?: string;
  kategori: string;
  m2?: number;
  imarDurumu?: string;
  depremPga?: number;
  depremZonu?: string;
  taskinRisk?: string;
  toprakTipi?: string;
  organikMadde?: number;
  yillikYagis?: number;
  ortSicaklik?: number;
  pvgisKwhKwp?: number;
  bakiYonu?: string;
  egimYuzde?: number;
  otoyolKm?: number;
  osbKm?: number;
  havalimanKm?: number;
  limanKm?: number;
  serbestBolgeKm?: number;
  lisansliDepoKm?: number;
  elektrikHattiM?: number;
  baselineTlm2?: number;
}

export interface BoyutSkor {
  puan: number;
  gerekce: string;
}

export interface ScorecardSonuc {
  skorlar: {
    tarimsal:  BoyutSkor;
    yapilasmа: BoyutSkor;
    lojistik:  BoyutSkor;
    enerji:    BoyutSkor;
    risk:      BoyutSkor;
  };
  genelSkor: number;
  ozet: string;
}

const API_BASE =
  typeof chrome !== "undefined"
    ? "https://cadastrum-api.cadastrum-tr.workers.dev/v1"
    : "/v1";

export interface ScorecardTalepSonuc extends ScorecardSonuc {
  modelAd: string;
  sureMs: number;
  cached: boolean;
  kalanKota?: number;
  hata?: string;
  kota?: number;
  tier?: string;
}

/**
 * Backend'den AI Arazi Uygunluk Scorecard talep et.
 * Bearer token chrome.storage'dan alınır.
 */
export async function scorecardTalep(
  parselAnahtar: string,
  parselVeri: ScorecardParselVeri,
  modelHint: "gemini" | "groq" | "auto" = "auto",
): Promise<ScorecardTalepSonuc | null> {
  let token: string | undefined;
  try {
    if (typeof chrome !== "undefined" && chrome?.storage?.local) {
      const d = await chrome.storage.local.get("cadastrum_token");
      token = typeof d.cadastrum_token === "string" ? d.cadastrum_token : undefined;
    }
  } catch { /* token yok */ }

  try {
    const res = await fetch(`${API_BASE}/ai-scorecard/analiz`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ parselAnahtar, parselVeri, modelHint }),
      signal: AbortSignal.timeout(30_000),
    });

    const data = await res.json() as ScorecardTalepSonuc;

    if (!res.ok) {
      return { ...data, hata: data.hata ?? `HTTP ${res.status}` } as ScorecardTalepSonuc;
    }

    return data;
  } catch (e) {
    return null;
  }
}

/** 5 boyutun Türkçe etiket ve ikonları */
export const SCORECARD_BOYUTLAR = [
  { id: "tarimsal",  etiket: "Tarımsal Verimlilik",     ikon: "🌾" },
  { id: "yapilasmа", etiket: "Yapılaşma Uygunluğu",     ikon: "🏗️" },
  { id: "lojistik",  etiket: "Sanayi / Lojistik",        ikon: "🏭" },
  { id: "enerji",    etiket: "Yenilenebilir Enerji (GES)", ikon: "☀️" },
  { id: "risk",      etiket: "Risk Skoru",                ikon: "⚠️" },
] as const;

/** Puan → renk (Tailwind uyumlu CSS renk kodu) */
export function puanRenk(puan: number): string {
  if (puan >= 70) return "#16a34a"; // yeşil
  if (puan >= 40) return "#ca8a04"; // sarı
  return "#dc2626"; // kırmızı
}

/** Puan → etiket */
export function puanEtiket(puan: number): string {
  if (puan >= 80) return "Çok İyi";
  if (puan >= 60) return "İyi";
  if (puan >= 40) return "Orta";
  if (puan >= 20) return "Zayıf";
  return "Çok Zayıf";
}
