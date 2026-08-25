/**
 * Self-Healing Engine
 * Orchestrates parameter validation, fuzzy key reconciliation, and type coercion.
 * Supports zero-overhead fast-path for valid inputs.
 */

import { findClosestKey } from './fuzzy-matcher.js';
import { TypeCoercer } from './type-coercer.js';

export interface PropertySchema {
  type?: string | string[];
  format?: string;
  items?: PropertySchema;
  properties?: Record<string, PropertySchema>;
  description?: string;
  default?: unknown;
}

export interface ToolInputSchema {
  type?: string;
  properties?: Record<string, PropertySchema>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface HealingReport {
  wasHealed: boolean;
  durationMs: number;
  healedFieldsCount: number;
  modifications: Array<{
    field: string;
    originalField?: string;
    originalValue: unknown;
    healedValue: unknown;
    action: 'key_remap' | 'type_coerce' | 'default_injected' | 'json_parsed';
    reason: string;
  }>;
}

export interface HealResult {
  params: Record<string, unknown>;
  report: HealingReport;
}

export class SelfHealer {
  /**
   * Main entry point to heal parameters against an expected JSON schema.
   */
  static heal(
    inputParams: Record<string, unknown> | undefined | null,
    schema?: ToolInputSchema
  ): HealResult {
    const startTime = performance.now();
    const raw = inputParams || {};
    const report: HealingReport = {
      wasHealed: false,
      durationMs: 0,
      healedFieldsCount: 0,
      modifications: []
    };

    if (!schema || !schema.properties) {
      report.durationMs = performance.now() - startTime;
      return { params: { ...raw }, report };
    }

    const expectedProperties = schema.properties;
    const validKeys = Object.keys(expectedProperties);
    const requiredKeys = schema.required || [];
    const outputParams: Record<string, unknown> = {};

    // Track which expected keys were satisfied
    const handledKeys = new Set<string>();

    // 1. Process and heal each provided input key
    for (const [key, value] of Object.entries(raw)) {
      let targetKey = key;

      // Check if key is valid or needs fuzzy remapping
      if (!validKeys.includes(key)) {
        const match = findClosestKey(key, validKeys);
        if (match) {
          targetKey = match.bestMatch;
          report.modifications.push({
            field: targetKey,
            originalField: key,
            originalValue: value,
            healedValue: value,
            action: 'key_remap',
            reason: `Remapped key '${key}' -> '${targetKey}' (similarity: ${Math.round(match.similarity * 100)}%)`
          });
          report.wasHealed = true;
          report.healedFieldsCount++;
        }
      }

      const propSchema = expectedProperties[targetKey];
      let healedValue = value;

      // Coerce value types if schema is known
      if (propSchema) {
        const targetType = Array.isArray(propSchema.type) ? propSchema.type[0] : propSchema.type;
        const format = propSchema.format;

        if (targetType === 'boolean') {
          const res = TypeCoercer.toBoolean(healedValue);
          if (res.wasCoerced) {
            recordCoerce(key, targetKey, value, res.value, res.reason || 'Converted to boolean');
            healedValue = res.value;
          }
        } else if (targetType === 'number' || targetType === 'integer') {
          const res = TypeCoercer.toNumber(healedValue);
          if (res.wasCoerced) {
            recordCoerce(key, targetKey, value, res.value, res.reason || 'Converted to number');
            healedValue = res.value;
          }
        } else if (targetType === 'array') {
          const res = TypeCoercer.toArray(healedValue);
          if (res.wasCoerced) {
            recordCoerce(key, targetKey, value, res.value, res.reason || 'Coerced to array');
            healedValue = res.value;
          }
        } else if (targetType === 'object') {
          const res = TypeCoercer.parseStringifiedJson(healedValue);
          if (res.wasCoerced) {
            recordCoerce(key, targetKey, value, res.value, res.reason || 'Decoded stringified JSON object');
            healedValue = res.value;
          }
        } else if (targetType === 'string' && (format === 'date' || format === 'date-time' || targetKey.includes('date'))) {
          const res = TypeCoercer.toIsoDate(healedValue, format === 'date');
          if (res.wasCoerced) {
            recordCoerce(key, targetKey, value, res.value, res.reason || 'Normalized date format');
            healedValue = res.value;
          }
        }
      }

      outputParams[targetKey] = healedValue;
      handledKeys.add(targetKey);
    }

    // 2. Inject default values for missing keys if available
    for (const [validKey, propSchema] of Object.entries(expectedProperties)) {
      if (!handledKeys.has(validKey) && propSchema.default !== undefined) {
        outputParams[validKey] = propSchema.default;
        report.modifications.push({
          field: validKey,
          originalValue: undefined,
          healedValue: propSchema.default,
          action: 'default_injected',
          reason: `Injected default value for missing key '${validKey}'`
        });
        report.wasHealed = true;
        report.healedFieldsCount++;
      }
    }

    report.durationMs = performance.now() - startTime;
    return { params: outputParams, report };

    function recordCoerce(origKey: string, targetKey: string, origVal: unknown, newVal: unknown, reason: string) {
      report.modifications.push({
        field: targetKey,
        originalField: origKey !== targetKey ? origKey : undefined,
        originalValue: origVal,
        healedValue: newVal,
        action: 'type_coerce',
        reason
      });
      report.wasHealed = true;
      report.healedFieldsCount++;
    }
  }
}
