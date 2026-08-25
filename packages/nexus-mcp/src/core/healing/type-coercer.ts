/**
 * Type Coercer & Value Normalizer
 * Automatically heals invalid value types sent by AI agents into expected schema formats.
 */

export interface CoerceResult<T = unknown> {
  value: T;
  wasCoerced: boolean;
  originalType: string;
  targetType: string;
  reason?: string;
}

export class TypeCoercer {
  /**
   * Coerces any value into a Boolean if expected.
   */
  static toBoolean(val: unknown): CoerceResult<boolean> {
    const origType = typeof val;
    if (typeof val === 'boolean') {
      return { value: val, wasCoerced: false, originalType: origType, targetType: 'boolean' };
    }

    if (typeof val === 'string') {
      const lower = val.trim().toLowerCase();
      if (['true', '1', 'yes', 'y', 't', 'on', 'enabled'].includes(lower)) {
        return { value: true, wasCoerced: true, originalType: origType, targetType: 'boolean', reason: 'Parsed truthy string' };
      }
      if (['false', '0', 'no', 'n', 'f', 'off', 'disabled'].includes(lower)) {
        return { value: false, wasCoerced: true, originalType: origType, targetType: 'boolean', reason: 'Parsed falsy string' };
      }
    }

    if (typeof val === 'number') {
      return { value: val !== 0, wasCoerced: true, originalType: origType, targetType: 'boolean', reason: 'Converted number to boolean' };
    }

    return { value: Boolean(val), wasCoerced: true, originalType: origType, targetType: 'boolean' };
  }

  /**
   * Coerces strings or other types into Numbers.
   */
  static toNumber(val: unknown): CoerceResult<number> {
    const origType = typeof val;
    if (typeof val === 'number' && !Number.isNaN(val)) {
      return { value: val, wasCoerced: false, originalType: origType, targetType: 'number' };
    }

    if (typeof val === 'string') {
      // Remove currency symbols, commas, and whitespace
      const cleaned = val.replace(/[$€£₺,]/g, '').trim();
      const num = Number(cleaned);
      if (!Number.isNaN(num)) {
        return { value: num, wasCoerced: true, originalType: origType, targetType: 'number', reason: 'Parsed string representation to number' };
      }
    }

    return { value: Number(val), wasCoerced: true, originalType: origType, targetType: 'number' };
  }

  /**
   * Parses stringified JSON if the schema expects an Object or Array.
   */
  static parseStringifiedJson<T = unknown>(val: unknown): CoerceResult<T> {
    const origType = typeof val;
    if (typeof val !== 'string') {
      return { value: val as T, wasCoerced: false, originalType: origType, targetType: 'json' };
    }

    const trimmed = val.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        return {
          value: parsed,
          wasCoerced: true,
          originalType: 'string',
          targetType: Array.isArray(parsed) ? 'array' : 'object',
          reason: 'Decoded JSON encoded string'
        };
      } catch {
        // Not valid JSON, return original
      }
    }

    return { value: val as T, wasCoerced: false, originalType: origType, targetType: 'json' };
  }

  /**
   * Coerces a value into an Array format.
   */
  static toArray<T = unknown>(val: unknown): CoerceResult<T[]> {
    const origType = typeof val;
    if (Array.isArray(val)) {
      return { value: val, wasCoerced: false, originalType: origType, targetType: 'array' };
    }

    // If it's stringified JSON array
    if (typeof val === 'string') {
      const jsonAttempt = this.parseStringifiedJson(val);
      if (jsonAttempt.wasCoerced && Array.isArray(jsonAttempt.value)) {
        return { value: jsonAttempt.value as T[], wasCoerced: true, originalType: 'string', targetType: 'array', reason: 'Parsed JSON array string' };
      }

      // Check if comma-separated list: "apple, banana, orange"
      if (val.includes(',')) {
        const items = val.split(',').map(s => s.trim()) as unknown as T[];
        return { value: items, wasCoerced: true, originalType: 'string', targetType: 'array', reason: 'Split comma-separated string into array' };
      }
    }

    // Wrap single element in array
    return {
      value: val === null || val === undefined ? [] : [val as T],
      wasCoerced: true,
      originalType: origType,
      targetType: 'array',
      reason: 'Wrapped scalar into array'
    };
  }

  /**
   * Normalizes dates into standard ISO-8601 (YYYY-MM-DD or full ISO 8601).
   */
  static toIsoDate(val: unknown, dateOnly = false): CoerceResult<string> {
    const origType = typeof val;
    if (typeof val === 'string') {
      // Direct ISO match check YYYY-MM-DD
      const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
      if (dateOnly && isoPattern.test(val)) {
        return { value: val, wasCoerced: false, originalType: origType, targetType: 'date-string' };
      }

      // Common alternate formats: DD/MM/YYYY or DD.MM.YYYY
      const ddmmyyyy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/;
      const match = val.match(ddmmyyyy);
      if (match) {
        const day = match[1].padStart(2, '0');
        const month = match[2].padStart(2, '0');
        const year = match[3];
        const formatted = `${year}-${month}-${day}`;
        return { value: formatted, wasCoerced: true, originalType: origType, targetType: 'date-string', reason: 'Converted DD/MM/YYYY to ISO YYYY-MM-DD' };
      }

      // Try native Date parsing
      const parsedDate = new Date(val);
      if (!Number.isNaN(parsedDate.getTime())) {
        const iso = dateOnly ? parsedDate.toISOString().split('T')[0] : parsedDate.toISOString();
        return { value: iso, wasCoerced: true, originalType: origType, targetType: 'date-string', reason: 'Parsed date string to ISO-8601' };
      }
    }

    if (typeof val === 'number') {
      // Unix timestamp (seconds or ms)
      const ms = val < 10000000000 ? val * 1000 : val;
      const parsedDate = new Date(ms);
      if (!Number.isNaN(parsedDate.getTime())) {
        const iso = dateOnly ? parsedDate.toISOString().split('T')[0] : parsedDate.toISOString();
        return { value: iso, wasCoerced: true, originalType: origType, targetType: 'date-string', reason: 'Converted unix timestamp to ISO-8601' };
      }
    }

    return { value: String(val), wasCoerced: false, originalType: origType, targetType: 'date-string' };
  }
}
