/**
 * Token & Cost Estimator
 * Measures token usage before and after compression/distillation, and computes ROI.
 */

export class TokenEstimator {
  // Approximate standard: ~4 characters per token for English/code/JSON text
  private static readonly CHARS_PER_TOKEN = 3.8;

  // Blended average cost per 1K input tokens for modern models (Claude 3.5 Sonnet / GPT-4o)
  private static readonly COST_PER_1K_TOKENS_USD = 0.003;

  /**
   * Estimates token count of any object or string payload.
   */
  static estimateTokens(payload: unknown): number {
    if (payload === null || payload === undefined) return 0;
    const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return Math.ceil(str.length / this.CHARS_PER_TOKEN);
  }

  /**
   * Estimates byte size of payload.
   */
  static estimateBytes(payload: unknown): number {
    if (payload === null || payload === undefined) return 0;
    const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return new TextEncoder().encode(str).length;
  }

  /**
   * Calculates saved cost in USD for a given number of tokens.
   */
  static calculateSavedCostUsd(tokensSaved: number): number {
    return (tokensSaved / 1000) * this.COST_PER_1K_TOKENS_USD;
  }
}
