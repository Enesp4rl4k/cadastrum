/**
 * Fuzzy Matcher & Key Alias Mapper
 * Resolves typos, case mismatches (snake_case vs camelCase vs kebab-case),
 * and common semantic aliases in tool parameter names.
 */

export interface MatchResult {
  bestMatch: string;
  similarity: number;
  isExact: boolean;
}

/**
 * Calculates Levenshtein Distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix = Array.from({ length: bn + 1 }, (_, i) => [i]);
  for (let j = 0; j <= an; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[bn][an];
}

/**
 * Normalizes a key by stripping underscores, hyphens and converting to lowercase.
 * Example: 'user_id', 'userId', 'user-id' all normalize to 'userid'.
 */
export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_.\s]/g, '');
}

/**
 * Common semantic alias mappings for frequent AI agent hallucinations.
 */
const COMMON_ALIASES: Record<string, string[]> = {
  id: ['identifier', 'key', 'uuid', 'guid', 'code'],
  query: ['search', 'q', 'search_query', 'prompt', 'keyword', 'term'],
  limit: ['max', 'count', 'size', 'per_page', 'pageSize', 'max_results', 'top'],
  page: ['page_number', 'pageNumber', 'offset', 'cursor', 'p'],
  url: ['uri', 'link', 'href', 'endpoint', 'address'],
  email: ['mail', 'email_address', 'e-mail', 'user_email'],
  start_date: ['startDate', 'from', 'since', 'beginning', 'start'],
  end_date: ['endDate', 'to', 'until', 'finish', 'end'],
  order: ['sort', 'direction', 'sort_order', 'order_by'],
  amount: ['value', 'price', 'cost', 'total', 'quantity'],
};

/**
 * Finds the closest matching schema key for an agent-provided key.
 */
export function findClosestKey(
  inputKey: string,
  validKeys: string[],
  threshold = 0.65
): MatchResult | null {
  if (validKeys.includes(inputKey)) {
    return { bestMatch: inputKey, similarity: 1.0, isExact: true };
  }

  const normInput = normalizeKey(inputKey);

  // 1. Direct normalized match (handles case and delimiter differences)
  for (const valid of validKeys) {
    if (normalizeKey(valid) === normInput) {
      return { bestMatch: valid, similarity: 0.95, isExact: false };
    }
  }

  // 2. Check semantic aliases
  for (const [canonical, aliases] of Object.entries(COMMON_ALIASES)) {
    const isInputAlias = aliases.some(a => normalizeKey(a) === normInput) || normalizeKey(canonical) === normInput;
    if (isInputAlias) {
      for (const valid of validKeys) {
        const isTargetAlias = aliases.some(a => normalizeKey(a) === normalizeKey(valid)) || normalizeKey(canonical) === normalizeKey(valid);
        if (isTargetAlias) {
          return { bestMatch: valid, similarity: 0.9, isExact: false };
        }
      }
    }
  }

  // 3. Levenshtein fuzzy distance matching
  let bestMatch = '';
  let highestSimilarity = 0;

  for (const valid of validKeys) {
    const maxLen = Math.max(inputKey.length, valid.length);
    if (maxLen === 0) continue;
    const distance = levenshteinDistance(inputKey.toLowerCase(), valid.toLowerCase());
    const similarity = 1 - distance / maxLen;

    if (similarity > highestSimilarity) {
      highestSimilarity = similarity;
      bestMatch = valid;
    }
  }

  if (highestSimilarity >= threshold) {
    return { bestMatch, similarity: highestSimilarity, isExact: false };
  }

  return null;
}
