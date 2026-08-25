/**
 * Dead-Loop & Runaway Tool Call Detector
 * Detects recursive loops where an agent repeatedly calls the same tool with identical
 * or slightly perturbed failing parameters, saving hundreds of dollars in wasted tokens.
 */

import { createHash } from 'node:crypto';

export interface CallFingerprint {
  toolName: string;
  paramsHash: string;
  timestamp: number;
}

export interface LoopDetectionResult {
  isLoop: boolean;
  repeatCount: number;
  steeringMessage?: string;
}

export class LoopDetector {
  private callHistory: CallFingerprint[] = [];
  private readonly maxWindowSize: number;
  private readonly threshold: number;

  constructor(options: { maxWindowSize?: number; threshold?: number } = {}) {
    this.maxWindowSize = options.maxWindowSize ?? 10;
    this.threshold = options.threshold ?? 3;
  }

  /**
   * Generates a deterministic normalized hash of the tool invocation arguments.
   */
  static hashParams(params: unknown): string {
    const canonical = JSON.stringify(params, Object.keys(params || {}).sort());
    return createHash('sha256').update(canonical).digest('hex').slice(0, 12);
  }

  /**
   * Checks if the incoming tool call is part of an infinite loop.
   */
  recordAndCheck(toolName: string, params: unknown): LoopDetectionResult {
    const paramsHash = LoopDetector.hashParams(params);
    const now = Date.now();

    this.callHistory.push({ toolName, paramsHash, timestamp: now });

    if (this.callHistory.length > this.maxWindowSize) {
      this.callHistory.shift();
    }

    // Count identical calls in the current sliding window
    const matches = this.callHistory.filter(
      call => call.toolName === toolName && call.paramsHash === paramsHash
    );

    if (matches.length >= this.threshold) {
      return {
        isLoop: true,
        repeatCount: matches.length,
        steeringMessage: `[NexusMCP Loop Interceptor] Warning: You have called tool '${toolName}' with identical or equivalent arguments ${matches.length} times in a row without progress. Please stop repeating this call and formulate an alternative strategy or report the blocker to the user.`
      };
    }

    return {
      isLoop: false,
      repeatCount: matches.length,
    };
  }

  reset(): void {
    this.callHistory = [];
  }
}
