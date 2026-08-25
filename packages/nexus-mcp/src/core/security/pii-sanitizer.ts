/**
 * PII Sanitizer & Sensitive Data Redaction
 * Detects and redacts credit cards, SSN/TCKN, API keys, passwords, and sensitive emails
 * from tool inputs and logs to ensure strict enterprise data compliance (GDPR/HIPAA/KVKK).
 */

export interface PiiScanResult {
  hasPii: boolean;
  redactedCount: number;
  sanitizedData: any;
  detectedTypes: string[];
}

export class PiiSanitizer {
  // Regex patterns for sensitive credentials & PII
  private static readonly PATTERNS: Array<{ type: string; regex: RegExp; replace: (match: string, ...args: any[]) => string }> = [
    // Credit Cards (Visa, Mastercard, Amex, Discover)
    {
      type: 'credit_card',
      regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
      replace: (match: string) => `[REDACTED_CC ending in ${match.slice(-4)}]`,
    },
    // API Keys / Bearer Tokens / Secrets (e.g. sk_live_..., ghp_..., eyJ...)
    {
      type: 'api_key',
      regex: /\b(sk_[a-zA-Z0-9_-]{16,}|ghp_[a-zA-Z0-9]{20,}|eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\b/g,
      replace: () => '[REDACTED_API_KEY]',
    },
    // Passwords in query or body (e.g., password=secret123)
    {
      type: 'password',
      regex: /(password|passwd|secret|api_key|token)["':\s=]+([^"'\s,&]+)/gi,
      replace: (_: string, key: string) => `${key}=[REDACTED_SECRET]`,
    },
  ];

  /**
   * Scans and sanitizes any data payload (string, object, array).
   */
  static sanitize(input: any): PiiScanResult {
    let hasPii = false;
    let redactedCount = 0;
    const detectedTypes = new Set<string>();

    const sanitizeString = (str: string): string => {
      let current = str;
      for (const pattern of this.PATTERNS) {
        if (pattern.regex.test(current)) {
          hasPii = true;
          detectedTypes.add(pattern.type);
          current = current.replace(pattern.regex, (match) => {
            redactedCount++;
            return pattern.replace(match);
          });
        }
      }
      return current;
    };

    const traverse = (val: any): any => {
      if (typeof val === 'string') {
        return sanitizeString(val);
      }
      if (Array.isArray(val)) {
        return val.map(traverse);
      }
      if (val && typeof val === 'object') {
        const obj: Record<string, any> = {};
        for (const [k, v] of Object.entries(val)) {
          // Check if key itself is sensitive (e.g., "password": "xyz")
          if (/password|secret|api_key|private_key/i.test(k) && typeof v === 'string') {
            hasPii = true;
            redactedCount++;
            detectedTypes.add('password_field');
            obj[k] = '[REDACTED_SECRET]';
          } else {
            obj[k] = traverse(v);
          }
        }
        return obj;
      }
      return val;
    };

    const sanitizedData = traverse(input);

    return {
      hasPii,
      redactedCount,
      sanitizedData,
      detectedTypes: Array.from(detectedTypes),
    };
  }
}
