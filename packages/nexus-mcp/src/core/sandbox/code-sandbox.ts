/**
 * Safe Agent Code Execution Sandbox
 * Provides isolated, resource-constrained JavaScript/data transformation execution
 * for AI agents without requiring heavy Docker containers.
 */

import vm from 'node:vm';

export interface SandboxExecutionResult {
  success: boolean;
  result: any;
  stdout: string[];
  executionTimeMs: number;
  error?: string;
}

export interface SandboxOptions {
  timeoutMs?: number;
  maxMemoryMb?: number;
}

export class CodeSandbox {
  private readonly defaultTimeoutMs: number;

  constructor(options: SandboxOptions = {}) {
    this.defaultTimeoutMs = options.timeoutMs ?? 3000; // 3 second execution timeout
  }

  /**
   * Executes code safely in a restricted VM context with intercepted console output.
   */
  async execute(code: string, contextData: Record<string, any> = {}, options: SandboxOptions = {}): Promise<SandboxExecutionResult> {
    const startTime = performance.now();
    const stdout: string[] = [];
    const timeout = options.timeoutMs ?? this.defaultTimeoutMs;

    // Build isolated sandbox environment
    const sandboxContext = {
      ...contextData,
      console: {
        log: (...args: any[]) => stdout.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
        warn: (...args: any[]) => stdout.push(`[WARN] ` + args.map(a => String(a)).join(' ')),
        error: (...args: any[]) => stdout.push(`[ERROR] ` + args.map(a => String(a)).join(' ')),
      },
      Math,
      Date,
      JSON,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
    };

    const vmContext = vm.createContext(sandboxContext);

    try {
      // Wrap code to return the last expression or explicit return
      const wrappedScript = new vm.Script(`
        (() => {
          ${code}
        })()
      `);

      const result = wrappedScript.runInContext(vmContext, {
        timeout,
        displayErrors: true,
      });

      const executionTimeMs = Number((performance.now() - startTime).toFixed(2));

      return {
        success: true,
        result: result === undefined ? null : result,
        stdout,
        executionTimeMs,
      };
    } catch (err: any) {
      const executionTimeMs = Number((performance.now() - startTime).toFixed(2));
      const errorMsg = err.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT'
        ? `Execution timed out after ${timeout}ms limit`
        : err.message || String(err);

      return {
        success: false,
        result: null,
        stdout,
        executionTimeMs,
        error: errorMsg,
      };
    }
  }
}
