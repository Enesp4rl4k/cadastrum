/**
 * Semantic Idempotent Tool Cache
 * Caches read-only tool responses based on normalized parameter hashing,
 * reducing upstream latency from hundreds of ms to <1ms.
 */

import { LoopDetector } from './loop-detector.js';

export interface CacheEntry<T = unknown> {
  data: T;
  cachedAt: number;
  ttlMs: number;
  hits: number;
}

export class SemanticCache {
  private cache = new Map<string, CacheEntry>();
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;

  constructor(options: { defaultTtlMs?: number; maxEntries?: number } = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? 60000; // 1 minute default
    this.maxEntries = options.maxEntries ?? 500;
  }

  /**
   * Determines if a tool is safe to cache (read-only vs state-mutating).
   */
  static isCacheable(toolName: string, method?: string): boolean {
    if (method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase())) {
      return false;
    }

    const lower = toolName.toLowerCase();
    const mutationKeywords = ['create', 'insert', 'update', 'delete', 'remove', 'post', 'pay', 'send', 'write', 'upload'];
    if (mutationKeywords.some(kw => lower.includes(kw))) {
      return false;
    }

    return true;
  }

  private makeKey(toolName: string, params: unknown): string {
    return `${toolName}:${LoopDetector.hashParams(params)}`;
  }

  get<T>(toolName: string, params: unknown): T | null {
    const key = this.makeKey(toolName, params);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() - entry.cachedAt > entry.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    entry.hits++;
    return entry.data as T;
  }

  set<T>(toolName: string, params: unknown, data: T, ttlMs?: number): void {
    if (this.cache.size >= this.maxEntries) {
      // Evict oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    const key = this.makeKey(toolName, params);
    this.cache.set(key, {
      data,
      cachedAt: Date.now(),
      ttlMs: ttlMs ?? this.defaultTtlMs,
      hits: 0,
    });
  }

  clear(): void {
    this.cache.clear();
  }
}
