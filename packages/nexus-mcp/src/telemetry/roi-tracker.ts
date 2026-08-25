/**
 * Telemetry & ROI Tracker
 * Measures aggregate token savings, cost reductions, healed invocations, and uptime.
 */

import { TokenEstimator } from '../core/compression/token-estimator.js';

export interface TelemetryStats {
  totalInvocations: number;
  healedInvocations: number;
  failedInvocations: number;
  interceptedLoops: number;
  cachedHits: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalTokensSaved: number;
  estimatedCostSavedUsd: number;
  averageLatencyMs: number;
}

export class RoiTracker {
  private stats: TelemetryStats = {
    totalInvocations: 0,
    healedInvocations: 0,
    failedInvocations: 0,
    interceptedLoops: 0,
    cachedHits: 0,
    totalTokensIn: 0,
    totalTokensOut: 0,
    totalTokensSaved: 0,
    estimatedCostSavedUsd: 0,
    averageLatencyMs: 0,
  };

  private totalLatencySum = 0;

  recordInvocation(data: {
    wasHealed: boolean;
    isLoop: boolean;
    isCacheHit: boolean;
    isSuccess: boolean;
    rawTokens: number;
    distilledTokens: number;
    durationMs: number;
  }): void {
    this.stats.totalInvocations++;
    if (data.wasHealed) this.stats.healedInvocations++;
    if (data.isLoop) this.stats.interceptedLoops++;
    if (data.isCacheHit) this.stats.cachedHits++;
    if (!data.isSuccess) this.stats.failedInvocations++;

    const saved = Math.max(0, data.rawTokens - data.distilledTokens);
    this.stats.totalTokensIn += data.rawTokens;
    this.stats.totalTokensOut += data.distilledTokens;
    this.stats.totalTokensSaved += saved;
    this.stats.estimatedCostSavedUsd = TokenEstimator.calculateSavedCostUsd(this.stats.totalTokensSaved);

    this.totalLatencySum += data.durationMs;
    this.stats.averageLatencyMs = Number((this.totalLatencySum / this.stats.totalInvocations).toFixed(2));
  }

  getSnapshot(): TelemetryStats {
    return { ...this.stats };
  }

  formatSummary(): string {
    const s = this.stats;
    const healPercent = s.totalInvocations > 0 ? ((s.healedInvocations / s.totalInvocations) * 100).toFixed(1) : '0';
    return `
================ ⚡ NEXUS-MCP GATEWAY ROI REPORT ⚡ ================
  Total Tool Invocations  : ${s.totalInvocations}
  Auto-Healed Requests    : ${s.healedInvocations} (${healPercent}% self-healing rate)
  Loops Intercepted       : ${s.interceptedLoops} (Dead-loops blocked)
  Cache Hits              : ${s.cachedHits}
  Total Tokens Saved      : ${s.totalTokensSaved.toLocaleString()} tokens
  Total Money Saved       : $${s.estimatedCostSavedUsd.toFixed(4)} USD
  Average Latency         : ${s.averageLatencyMs} ms
=====================================================================`;
  }
}

export const globalRoiTracker = new RoiTracker();
