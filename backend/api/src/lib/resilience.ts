/**
 * Resilience & Fault Tolerance Utilities
 *
 * Provides:
 * - Exponential backoff retry with full jitter
 * - Circuit Breaker pattern for external integrations (TKGM, Gemini, Groq, AFAD, etc.)
 * - RFC 7807 Problem Details formatters
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  jitter?: boolean;
  shouldRetry?: (error: any) => boolean;
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;     // Number of failures before opening (default: 5)
  successThreshold?: number;     // Consecutive successes to close when HALF_OPEN (default: 2)
  resetTimeoutMs?: number;       // Time in ms before attempting HALF_OPEN (default: 30000)
  name?: string;
}

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

/**
 * Standard RFC 7807 Problem Details object
 */
export interface ProblemDetails {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
  invalidParams?: Array<{ name: string; reason: string }>;
  timestamp: string;
}

export function createProblemDetails(
  status: number,
  title: string,
  options?: {
    detail?: string;
    type?: string;
    instance?: string;
    code?: string;
    invalidParams?: Array<{ name: string; reason: string }>;
  }
): ProblemDetails {
  return {
    type: options?.type ?? "about:blank",
    title,
    status,
    detail: options?.detail,
    instance: options?.instance,
    code: options?.code,
    invalidParams: options?.invalidParams,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Exponential backoff with jitter for resilient network requests.
 */
export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 200;
  const maxDelayMs = options.maxDelayMs ?? 5000;
  const backoffFactor = options.backoffFactor ?? 2;
  const jitter = options.jitter ?? true;

  const isRetryable =
    options.shouldRetry ??
    ((err: any) => {
      if (!err) return false;
      const status = err.status ?? err.statusCode;
      if (typeof status === "number") {
        // 429 Too Many Requests, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout
        return status === 429 || (status >= 500 && status <= 504);
      }
      const msg = String(err.message || err);
      return (
        msg.includes("fetch failed") ||
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("network")
      );
    });

  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries || !isRetryable(error)) {
        throw error;
      }

      let delay = Math.min(
        maxDelayMs,
        initialDelayMs * Math.pow(backoffFactor, attempt - 1)
      );

      if (jitter) {
        // Full jitter: uniformly random between 0 and delay
        delay = Math.floor(Math.random() * delay);
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Circuit Breaker state machine to protect downstream external systems.
 */
export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private successCount = 0;
  private nextAttempt = Date.now();
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly resetTimeoutMs: number;
  public readonly name: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.successThreshold = options.successThreshold ?? 2;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
    this.name = options.name ?? "circuit-breaker";
  }

  public getState(): CircuitState {
    if (this.state === "OPEN" && Date.now() >= this.nextAttempt) {
      this.state = "HALF_OPEN";
      this.successCount = 0;
    }
    return this.state;
  }

  public async execute<T>(
    action: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    const currentState = this.getState();

    if (currentState === "OPEN") {
      if (fallback) {
        return fallback();
      }
      throw new Error(
        `[CircuitBreaker:${this.name}] Devre AÇIK (OPEN). Harici servis korumada, istek reddedildi.`
      );
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (fallback) {
        return fallback();
      }
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === "HALF_OPEN") {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = "CLOSED";
        this.failureCount = 0;
      }
    } else if (this.state === "CLOSED") {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold || this.state === "HALF_OPEN") {
      this.state = "OPEN";
      this.nextAttempt = Date.now() + this.resetTimeoutMs;
    }
  }

  public reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
  }
}
