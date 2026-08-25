/**
 * Upstream Circuit Breaker & Retry Manager
 * Protects downstream services, fails fast when upstreams are down,
 * and synthesizes actionable fallback messages for AI agents.
 */

export enum CircuitState {
  CLOSED = 'CLOSED',       // Normal operation
  OPEN = 'OPEN',           // Failing fast, blocking calls
  HALF_OPEN = 'HALF_OPEN', // Probing upstream health
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;     // Failures before opening circuit (default: 3)
  resetTimeoutMs?: number;       // Wait time before trying HALF_OPEN (default: 15000ms)
  maxRetries?: number;           // Retries per individual call (default: 2)
  initialBackoffMs?: number;     // Initial retry backoff (default: 500ms)
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly options: Required<CircuitBreakerOptions>;

  constructor(
    public readonly name: string,
    options: CircuitBreakerOptions = {}
  ) {
    this.options = {
      failureThreshold: options.failureThreshold ?? 3,
      resetTimeoutMs: options.resetTimeoutMs ?? 15000,
      maxRetries: options.maxRetries ?? 2,
      initialBackoffMs: options.initialBackoffMs ?? 500,
    };
  }

  getState(): CircuitState {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.options.resetTimeoutMs) {
        this.state = CircuitState.HALF_OPEN;
      }
    }
    return this.state;
  }

  /**
   * Executes an action through the circuit breaker with exponential backoff retries.
   */
  async execute<T>(action: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === CircuitState.OPEN) {
      const waitRemainingSec = Math.ceil(
        (this.options.resetTimeoutMs - (Date.now() - this.lastFailureTime)) / 1000
      );
      throw new Error(
        `[NexusMCP Circuit Breaker] Upstream '${this.name}' is temporarily unavailable due to multiple recent failures. Circuit is OPEN. Please retry in ${waitRemainingSec} seconds.`
      );
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        const result = await action();
        this.onSuccess();
        return result;
      } catch (err) {
        lastError = err;
        if (attempt < this.options.maxRetries) {
          const backoff = this.options.initialBackoffMs * Math.pow(2, attempt) + Math.random() * 100;
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      }
    }

    this.onFailure();
    throw lastError;
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.options.failureThreshold || this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
    }
  }
}
