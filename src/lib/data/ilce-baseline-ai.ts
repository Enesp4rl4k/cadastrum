/**
 * Otomatik üretilecek: scripts/ilce-baseline-ai-ts-uret.mjs çalıştırınca dolar.
 *
 * !!! BU DOSYAYI ELLE DÜZENLEME !!!
 * Üretmek için:
 *   GROQ_API_KEY=xxx node scripts/ai-ilce-baseline-uret.mjs
 *   node scripts/ilce-baseline-ai-ts-uret.mjs
 *
 * Şu an boş (placeholder). ilceFiyatGetir önce manuel ILCE_BASELINE_ARSA/TARLA'ya
 * bakar, bulamazsa BURAYA düşer.
 */

/** AI baseline'ın üretildiği tarih (enflasyon düzeltmesi referansı) */
export const ILCE_BASELINE_AI_TARIH = "2025-01-01";

/** İlçe bazlı ARSA TL/m² baseline — AI fallback (manuel tablodan sonra) */
export const ILCE_BASELINE_AI_ARSA: Record<string, number> = {
};

/** İlçe bazlı TARLA TL/m² baseline — AI fallback */
export const ILCE_BASELINE_AI_TARLA: Record<string, number> = {
};
