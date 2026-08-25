/**
 * Persistent Analytics Store & Markdown ROI Report Generator
 * Stores invocation records to disk and synthesizes executive ROI reports.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { InvocationEvent } from '../dashboard/live-stream.js';
import { TokenEstimator } from '../core/compression/token-estimator.js';

export interface DailySummary {
  date: string;
  totalCalls: number;
  healedCalls: number;
  tokensSaved: number;
  costSavedUsd: number;
  loopsIntercepted: number;
}

export class PersistentStore {
  private filePath: string;
  private events: InvocationEvent[] = [];

  constructor(customPath?: string) {
    this.filePath = customPath || join(process.cwd(), '.nexus-mcp-analytics.json');
    this.load();
  }

  private load(): void {
    if (existsSync(this.filePath)) {
      try {
        const raw = readFileSync(this.filePath, 'utf-8');
        this.events = JSON.parse(raw);
      } catch {
        this.events = [];
      }
    }
  }

  save(): void {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      // Keep up to 5000 recent events
      const slice = this.events.slice(-5000);
      writeFileSync(this.filePath, JSON.stringify(slice, null, 2), 'utf-8');
    } catch {
      // Ignore disk write errors in restricted environments
    }
  }

  recordEvent(event: InvocationEvent): void {
    this.events.push(event);
    this.save();
  }

  getEvents(days = 30): InvocationEvent[] {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return this.events.filter(e => new Date(e.timestamp).getTime() >= cutoff);
  }

  /**
   * Generates a comprehensive Markdown ROI report suitable for executive presentations.
   */
  generateMarkdownReport(days = 30): string {
    const events = this.getEvents(days);
    const totalCalls = events.length;
    const healedCalls = events.filter(e => e.wasHealed).length;
    const loopsBlocked = events.filter(e => e.isLoop).length;
    const cacheHits = events.filter(e => e.isCacheHit).length;
    const totalTokensSaved = events.reduce((sum, e) => sum + (e.tokensSaved || 0), 0);
    const totalCostSaved = TokenEstimator.calculateSavedCostUsd(totalTokensSaved);
    const avgLatency = totalCalls > 0
      ? (events.reduce((sum, e) => sum + e.durationMs, 0) / totalCalls).toFixed(1)
      : '0';

    // Tool breakdown
    const toolCounts = new Map<string, { calls: number; healed: number; tokensSaved: number }>();
    for (const e of events) {
      const entry = toolCounts.get(e.toolName) || { calls: 0, healed: 0, tokensSaved: 0 };
      entry.calls++;
      if (e.wasHealed) entry.healed++;
      entry.tokensSaved += e.tokensSaved || 0;
      toolCounts.set(e.toolName, entry);
    }

    const toolTableRows = Array.from(toolCounts.entries())
      .map(([name, stat]) => `| \`${name}\` | ${stat.calls} | ${stat.healed} | ${stat.tokensSaved.toLocaleString()} |`)
      .join('\n');

    return `# 📊 NexusMCP Executive ROI & Resilience Report

**Period:** Past ${days} Days | **Generated:** ${new Date().toISOString().split('T')[0]}

---

## 💎 Key Performance Metrics

| Metric | Value | Impact |
| :--- | :--- | :--- |
| **Total Tool Invocations** | **${totalCalls.toLocaleString()}** | Total proxy volume processed |
| **Auto-Healed Requests** | **${healedCalls.toLocaleString()}** | Prevented agent runtime failures with $0 cost |
| **Dead-Loops Intercepted** | **${loopsBlocked.toLocaleString()}** | Prevented runaway recursive token drain |
| **Semantic Cache Hits** | **${cacheHits.toLocaleString()}** | Instant <1ms zero-cost responses |
| **Total Tokens Saved** | **${totalTokensSaved.toLocaleString()} tokens** | Via JSON distillation & parameter pruning |
| **Net Cost Savings (USD)** | **$${totalCostSaved.toFixed(4)}** | Based on Claude 3.5 / GPT-4o pricing |
| **Average Latency** | **${avgLatency} ms** | Fast-path execution overhead |

---

## 🛠️ Tool Activity Breakdown

| Tool Name | Invocations | Auto-Healed | Tokens Saved |
| :--- | :--- | :--- | :--- |
${toolTableRows || '| *No tools recorded* | 0 | 0 | 0 |'}

---
*Report generated automatically by [NexusMCP](https://github.com/cadastrum/nexus-mcp).*
`;
  }
}
