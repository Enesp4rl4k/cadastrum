/**
 * Agent Budget Guard & Spending Quota Manager
 * Enforces strict financial limits on agent tool consumption to prevent runaway costs.
 */

import { TokenEstimator } from '../compression/token-estimator.js';
import { Logger } from '../../telemetry/logger.js';

export interface BudgetConfig {
  maxBudgetUsd?: number;
  maxTokens?: number;
  warningThresholdPercent?: number; // default: 80%
}

export interface AgentBudgetStatus {
  agentId: string;
  maxBudgetUsd: number;
  spentBudgetUsd: number;
  remainingBudgetUsd: number;
  totalTokensUsed: number;
  isExceeded: boolean;
  isWarning: boolean;
  percentageUsed: number;
}

export class BudgetGuard {
  private budgets = new Map<string, {
    maxBudgetUsd: number;
    maxTokens: number;
    spentBudgetUsd: number;
    totalTokensUsed: number;
    warningThresholdPercent: number;
  }>();

  /**
   * Sets or updates budget for an agent/session ID.
   */
  setBudget(agentId: string, config: BudgetConfig): void {
    const existing = this.budgets.get(agentId);
    this.budgets.set(agentId, {
      maxBudgetUsd: config.maxBudgetUsd ?? (existing?.maxBudgetUsd ?? 5.0), // Default $5.00 limit
      maxTokens: config.maxTokens ?? (existing?.maxTokens ?? 1000000),
      spentBudgetUsd: existing?.spentBudgetUsd ?? 0,
      totalTokensUsed: existing?.totalTokensUsed ?? 0,
      warningThresholdPercent: config.warningThresholdPercent ?? 80,
    });
    Logger.info(`[Budget Guard] Configured budget for '${agentId}': $${config.maxBudgetUsd ?? 5.0} limit`);
  }

  /**
   * Checks if the agent has sufficient budget before executing a tool.
   */
  checkAllowed(agentId: string): { allowed: boolean; reason?: string; status: AgentBudgetStatus } {
    const status = this.getStatus(agentId);

    if (status.isExceeded) {
      return {
        allowed: false,
        reason: `[Budget Guard Alert] Agent '${agentId}' has exceeded its spending budget ($${status.spentBudgetUsd.toFixed(4)} / $${status.maxBudgetUsd.toFixed(2)} USD). Tool execution halted to prevent additional charges.`,
        status,
      };
    }

    return { allowed: true, status };
  }

  /**
   * Records token consumption after a tool invocation.
   */
  recordSpend(agentId: string, tokensUsed: number): AgentBudgetStatus {
    let entry = this.budgets.get(agentId);
    if (!entry) {
      this.setBudget(agentId, {});
      entry = this.budgets.get(agentId)!;
    }

    const cost = TokenEstimator.calculateSavedCostUsd(tokensUsed);
    entry.spentBudgetUsd += cost;
    entry.totalTokensUsed += tokensUsed;

    const status = this.getStatus(agentId);

    if (status.isExceeded) {
      Logger.error(`[Budget Guard] Agent '${agentId}' EXCEEDED budget limit: $${status.spentBudgetUsd.toFixed(4)} spent`);
    } else if (status.isWarning) {
      Logger.warn(`[Budget Guard] Agent '${agentId}' reached ${status.percentageUsed.toFixed(1)}% of budget limit ($${status.spentBudgetUsd.toFixed(4)} / $${status.maxBudgetUsd.toFixed(2)})`);
    }

    return status;
  }

  getStatus(agentId: string): AgentBudgetStatus {
    const entry = this.budgets.get(agentId) || {
      maxBudgetUsd: 5.0,
      maxTokens: 1000000,
      spentBudgetUsd: 0,
      totalTokensUsed: 0,
      warningThresholdPercent: 80,
    };

    const percentageUsed = entry.maxBudgetUsd > 0
      ? (entry.spentBudgetUsd / entry.maxBudgetUsd) * 100
      : 0;

    const isExceeded = entry.spentBudgetUsd >= entry.maxBudgetUsd || entry.totalTokensUsed >= entry.maxTokens;
    const isWarning = percentageUsed >= entry.warningThresholdPercent && !isExceeded;

    return {
      agentId,
      maxBudgetUsd: entry.maxBudgetUsd,
      spentBudgetUsd: Number(entry.spentBudgetUsd.toFixed(4)),
      remainingBudgetUsd: Number(Math.max(0, entry.maxBudgetUsd - entry.spentBudgetUsd).toFixed(4)),
      totalTokensUsed: entry.totalTokensUsed,
      isExceeded,
      isWarning,
      percentageUsed: Number(percentageUsed.toFixed(1)),
    };
  }
}
