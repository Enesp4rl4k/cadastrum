/**
 * Kira getirisi tahmini.
 *
 * 3 katmanlı veri stratejisi (öncelik sırasıyla):
 *   1. Backend API — D1'deki kira_istatistik tablosu (mahalle bazlı, scrape verisi)
 *   2. Statik il tablosu — 2026 Q1 Endeksa/Hepsiemlak ortalamaları
 *   3. Fallback — Türkiye ortalaması
 *
 * Sadece konut kategori için anlam taşır; arsa/tarla için null.
 *
 * Son güncelleme: 2026-07 — Temmuz 2026 piyasa verileri
 */

import type { Parsel } from "../types/tkgm";
import { normalizeYerAdi } from "./tkgm-api";

/**
 * İl bazlı konut kira ortalaması (TL/m²/ay).
 * Kaynak: Endeksa, Hepsiemlak, REIDIN Temmuz 2026.
 * İstanbul: Şişli/Beyoğlu ~800-1200, ortalama 700-850 TL/m²/ay.
 * Not: Yüksek enflasyon — 6 ayda %30-50 artış olası. Backend scrape öncelikli.
 */
const IL_KIRA_TLM2_AY: Record<string, number> = {
  // ── Büyük şehirler ────────────────────────────────────────────────────────
  "istanbul":   720,   // Şişli/Beyoğlu ortalama ~850, çevre ~500
  "ankara":     380,   // Çankaya ~500, dış mahalle ~280
  "izmir":      520,   // Konak/Karşıyaka ~650, çevre ~380
  "antalya":    480,   // Muratpaşa ~600, dış ~350
  "bursa":      340,   // Nilüfer ~420, merkez ~300
  "kocaeli":    360,   // İzmit/Gebze ~400, dış ~280
  "mugla":      600,   // Bodrum ~900, Fethiye ~700, Marmaris ~650
  "tekirdag":   300,   // Çorlu/Çerkezköy sanayi bölgesi
  "sakarya":    280,
  "yalova":     320,

  // ── Sahil illeri ───────────────────────────────────────────────────────────
  "aydin":      340,   // Kuşadası ~500, merkez ~280
  "balikesir":  280,   // Burhaniye/Altınoluk ~400, merkez ~220
  "canakkale":  300,
  "kibris":     800,   // KKTC ortalama (girdi olursa)

  // ── Anadolu büyükşehir ────────────────────────────────────────────────────
  "eskisehir":  280,
  "konya":      240,
  "kayseri":    230,
  "gaziantep":  260,
  "samsun":     240,
  "trabzon":    300,   // Karadeniz kıyı talebi yüksek
  "denizli":    250,
  "manisa":     220,
  "mersin":     280,
  "adana":      270,
  "hatay":      230,   // Deprem sonrası talep değişimi

  // ── İç Anadolu / Doğu ─────────────────────────────────────────────────────
  "erzurum":    160,
  "malatya":    180,
  "diyarbakir": 190,
  "sanliurfa":  160,
  "van":        150,
  "kahramanmaras": 180,
  "sivas":      160,
};
const IL_KIRA_FALLBACK = 200; // Türkiye 2026 genel ortalama

function konutMu(nitelik: string): boolean {
  const t = nitelik.toLocaleLowerCase("tr");
  return /mesken|bina|işyeri|isyeri|konut|daire|villa/.test(t);
}

function tarımsalMi(nitelik: string): boolean {
  return /tarla|bahçe|bahce|bağ|bag|zeytinlik|mera/iu.test(nitelik);
}

export interface KiraTahmini {
  /** Aylık kira (TL) */
  aylikKira: number;
  /** Yıllık kira (TL) — aylık × 12 */
  yillikKira: number;
  /** Kullanılan birim kira (TL/m²/ay) */
  birimKira: number;
  /**
   * Kaynak:
   *   "backend-mahalle"  — D1 kira_istatistik tablosundan gerçek veri
   *   "backend-ilce"     — İlçe bazlı scrape ortalaması
   *   "statik-il"        — 2026 il ortalaması (fallback)
   *   "tarimsal-tahmini" — Tarımsal arazi tahmini
   */
  kaynak: "backend-mahalle" | "backend-ilce" | "statik-il" | "tarimsal-tahmini";
  /** Güvenilirlik: backend > statik-il > tarimsal */
  guven: "yuksek" | "orta" | "dusuk";
  /** Açıklama */
  not: string;
}

/**
 * Parsel için kira tahmini — senkron sürüm (statik tablo).
 * Konut niteliği için il bazlı 2026 değerleri.
 * Tarımsal arsa için ayrı tahmin.
 */
export function kiraTahminiHesapla(parsel: Parsel): KiraTahmini | null {
  if (!parsel.alan || parsel.alan <= 0) return null;

  const ilNorm = parsel.ilAd ? normalizeYerAdi(parsel.ilAd) : "";

  // Tarımsal arazi — kira tahmini (tarım kirası genellikle çok düşük)
  if (tarımsalMi(parsel.nitelik)) {
    // Tarım kirası ortalama: TL/m²/ay değil, dekar bazlı yıllık
    // 1 dekar = 1000 m², Türkiye ortalama 500-2000 TL/dekar/yıl (bölgeye göre)
    const dekarBaziKira = ilNorm === "konya" || ilNorm === "corum" || ilNorm === "tokat" ? 1200
      : ilNorm === "sanliurfa" || ilNorm === "diyarbakir" ? 800
      : 600; // Türkiye ortalaması
    // DIKKAT: önce alanla çarp, SONRA yuvarla — küçük parselde birimKira sıfıra yuvarlanır
    const aylikKira = Math.max(1, Math.round(parsel.alan * dekarBaziKira / 1000 / 12));
    const birimKira = parseFloat((dekarBaziKira / 1000 / 12).toFixed(4)); // ondalıklı sakla
    return {
      aylikKira,
      yillikKira: aylikKira * 12,
      birimKira,
      kaynak: "tarimsal-tahmini",
      guven: "dusuk",
      not: `Tarımsal arazi kira tahmini — ${dekarBaziKira} ₺/dekar/yıl ortalama`,
    };
  }

  // Konut dışı (arsa niteliği) — kira yok
  if (!konutMu(parsel.nitelik)) return null;

  // Konut — il bazlı 2026 değerleri
  const birimKira = IL_KIRA_TLM2_AY[ilNorm] ?? IL_KIRA_FALLBACK;
  const aylikKira = Math.round(parsel.alan * birimKira);
  const yillikKira = aylikKira * 12;
  const not = `${parsel.ilAd ?? "Bilinmeyen il"} 2026 ortalaması ${birimKira} ₺/m²/ay`;

  return {
    aylikKira,
    yillikKira,
    birimKira,
    kaynak: "statik-il",
    guven: "orta" as const,
    not,
  };
}
