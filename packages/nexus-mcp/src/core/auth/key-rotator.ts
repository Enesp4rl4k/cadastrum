/**
 * Multi-Key Pool & Round-Robin Rate Limit Protector
 * Rotates API keys across upstream calls and places rate-limited (HTTP 429) keys
 * into temporary cooldown to ensure uninterrupted agent execution.
 */

import { Logger } from '../../telemetry/logger.js';

export interface KeyEntry {
  id: string;
  key: string;
  inCooldownUntil: number;
  callCount: number;
  failureCount: number;
}

export class KeyRotator {
  private keys: KeyEntry[] = [];
  private lastUsedIndex = -1;
  private readonly defaultCooldownMs: number;

  constructor(
    public readonly serviceName: string,
    initialKeys: string[] = [],
    options: { defaultCooldownMs?: number } = {}
  ) {
    this.defaultCooldownMs = options.defaultCooldownMs ?? 30000; // 30s cooldown
    this.keys = initialKeys.map((k, idx) => ({
      id: `key_${idx + 1}`,
      key: k,
      inCooldownUntil: 0,
      callCount: 0,
      failureCount: 0,
    }));
  }

  addKey(key: string): void {
    this.keys.push({
      id: `key_${this.keys.length + 1}`,
      key,
      inCooldownUntil: 0,
      callCount: 0,
      failureCount: 0,
    });
  }

  /**
   * Acquires the next available healthy key in round-robin sequence.
   */
  getNextKey(): string | null {
    if (this.keys.length === 0) return null;

    const now = Date.now();
    const total = this.keys.length;

    // Search starting from the next position after lastUsedIndex
    for (let offset = 1; offset <= total; offset++) {
      const idx = (this.lastUsedIndex + offset) % total;
      const candidate = this.keys[idx];
      if (candidate.inCooldownUntil <= now) {
        this.lastUsedIndex = idx;
        candidate.callCount++;
        return candidate.key;
      }
    }

    // If all keys are in cooldown, pick the one expiring soonest
    Logger.warn(`[Key Rotator] All ${this.keys.length} API keys for '${this.serviceName}' are currently in cooldown!`);
    const sorted = [...this.keys].sort((a, b) => a.inCooldownUntil - b.inCooldownUntil);
    const chosen = sorted[0];
    this.lastUsedIndex = this.keys.indexOf(chosen);
    chosen.callCount++;
    return chosen.key;
  }

  /**
   * Marks a key as rate-limited and enters cooldown.
   */
  reportRateLimited(key: string, cooldownMs?: number): void {
    const entry = this.keys.find(k => k.key === key);
    if (entry) {
      const waitTime = cooldownMs ?? this.defaultCooldownMs;
      entry.inCooldownUntil = Date.now() + waitTime;
      entry.failureCount++;
      Logger.warn(`[Key Rotator] API Key ${entry.id} for '${this.serviceName}' entered cooldown for ${waitTime / 1000}s due to rate-limiting`);
    }
  }

  getPoolStatus(): Array<{ id: string; inCooldown: boolean; callCount: number; failureCount: number }> {
    const now = Date.now();
    return this.keys.map(k => ({
      id: k.id,
      inCooldown: k.inCooldownUntil > now,
      callCount: k.callCount,
      failureCount: k.failureCount,
    }));
  }
}
