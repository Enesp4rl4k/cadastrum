/**
 * Unified Tool Registry & Execution Pipeline
 * Connects Security Guardrails, Budget Guard, Code Sandbox, Self-Healing,
 * Loop Detection, Caching, Circuit Breaking, Token Compression, Error-to-Prompt Translation,
 * Macros, Tool-RAG Semantic Search, OpenTelemetry Traces, and Persistent Telemetry Store.
 */

import { SelfHealer, type ToolInputSchema, type HealingReport } from '../core/healing/self-healer.js';
import { ErrorTranslator } from '../core/healing/error-translator.js';
import { PiiSanitizer } from '../core/security/pii-sanitizer.js';
import { InjectionShield } from '../core/security/injection-shield.js';
import { CodeSandbox } from '../core/sandbox/code-sandbox.js';
import { BudgetGuard } from '../core/auth/budget-guard.js';
import { JsonDistiller, type DistillOptions } from '../core/compression/json-distiller.js';
import { TokenEstimator } from '../core/compression/token-estimator.js';
import { CircuitBreaker } from '../core/resilience/circuit-breaker.js';
import { LoopDetector } from '../core/resilience/loop-detector.js';
import { SemanticCache } from '../core/resilience/semantic-cache.js';
import { ToolChainer, type MacroDefinition } from '../core/macros/tool-chainer.js';
import { ToolSearchEngine, type SearchResult } from '../core/rag/tool-search.js';
import { OtelExporter, type OtelSpan } from '../telemetry/otel-exporter.js';
import { PersistentStore } from '../telemetry/persistent-store.js';
import { globalRoiTracker } from '../telemetry/roi-tracker.js';
import { globalLiveStream, type InvocationEvent } from '../dashboard/live-stream.js';
import { Logger } from '../telemetry/logger.js';

export interface RegisteredTool {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  handler: (params: Record<string, any>) => Promise<any>;
  distillOptions?: DistillOptions;
  cacheTtlMs?: number;
  circuitBreaker?: CircuitBreaker;
}

export interface PipelineExecutionResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
  healingReport: HealingReport;
  rawTokens: number;
  distilledTokens: number;
  tokensSaved: number;
  isCached: boolean;
  durationMs: number;
  otelSpan?: OtelSpan;
}

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();
  private macros = new Map<string, MacroDefinition>();
  private loopDetector = new LoopDetector();
  private cache = new SemanticCache();
  private searchEngine = new ToolSearchEngine();
  private sandbox = new CodeSandbox();
  public readonly budgetGuard = new BudgetGuard();
  public readonly persistentStore = new PersistentStore();

  constructor() {
    this.registerBuiltInTools();
  }

  /**
   * Registers default internal tools such as the safe code execution sandbox.
   */
  private registerBuiltInTools(): void {
    this.register({
      name: 'execute_sandbox_code',
      description: 'Safely executes JavaScript/data processing code in an isolated sandbox and returns the result and console output.',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'JavaScript code snippet to execute (e.g. data.filter(...))' },
          context_data: { type: 'object', description: 'Optional variables/data object to expose inside the sandbox' },
        },
        required: ['code'],
      },
      handler: async (params) => {
        const result = await this.sandbox.execute(params.code, params.context_data || {});
        if (!result.success) {
          throw new Error(`Sandbox execution failed: ${result.error}`);
        }
        return {
          result: result.result,
          stdout: result.stdout,
          executionTimeMs: result.executionTimeMs,
        };
      },
    });
  }

  /**
   * Registers a tool into the gateway.
   */
  register(tool: RegisteredTool): void {
    if (!tool.circuitBreaker) {
      tool.circuitBreaker = new CircuitBreaker(tool.name);
    }
    this.tools.set(tool.name, tool);
    this.reindexSearch();
    Logger.debug(`Registered tool: ${tool.name}`);
  }

  /**
   * Registers a multi-step macro tool.
   */
  registerMacro(macro: MacroDefinition): void {
    this.macros.set(macro.name, macro);
    this.register({
      name: macro.name,
      description: `[Macro Workflow] ${macro.description}`,
      inputSchema: macro.inputSchema,
      handler: async (params) => {
        const macroResult = await ToolChainer.executeMacro(macro, params, this);
        if (!macroResult.success) {
          throw new Error(macroResult.error || 'Macro execution failed');
        }
        return macroResult.data;
      },
    });
    Logger.info(`Registered macro workflow: ${macro.name}`);
  }

  private reindexSearch(): void {
    this.searchEngine.indexTools(this.listTools());
  }

  /**
   * Semantic Tool-RAG search: returns top-K tools matching an intent query.
   */
  searchTools(query: string, topK = 5): SearchResult[] {
    return this.searchEngine.search(query, topK);
  }

  /**
   * Lists all registered tools and macros with their schemas.
   */
  listTools(): Array<{ name: string; description: string; inputSchema: ToolInputSchema }> {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  /**
   * Dispatches a tool call through the full intelligent, secure, and budgeted pipeline.
   */
  async invoke(
    name: string,
    rawParams?: Record<string, any>,
    options: { agentId?: string } = {}
  ): Promise<PipelineExecutionResult> {
    const startTime = performance.now();
    const tool = this.tools.get(name);
    const safeRawParams = rawParams || {};
    const agentId = options.agentId || 'default_agent';

    if (!tool) {
      const errorMsg = `Tool '${name}' not found in NexusMCP registry. Available tools: ${Array.from(this.tools.keys()).join(', ')}`;
      Logger.warn(errorMsg);
      return {
        content: [{ type: 'text', text: errorMsg }],
        isError: true,
        healingReport: { wasHealed: false, durationMs: 0, healedFieldsCount: 0, modifications: [] },
        rawTokens: TokenEstimator.estimateTokens(errorMsg),
        distilledTokens: TokenEstimator.estimateTokens(errorMsg),
        tokensSaved: 0,
        isCached: false,
        durationMs: performance.now() - startTime,
      };
    }

    // Pipeline Step 0: Budget & Quota Check
    const budgetCheck = this.budgetGuard.checkAllowed(agentId);
    if (!budgetCheck.allowed) {
      Logger.warn(`[Budget Guard] Blocked execution of '${name}' for agent '${agentId}'`);
      return {
        content: [{ type: 'text', text: budgetCheck.reason! }],
        isError: true,
        healingReport: { wasHealed: false, durationMs: 0, healedFieldsCount: 0, modifications: [] },
        rawTokens: 100,
        distilledTokens: 100,
        tokensSaved: 0,
        isCached: false,
        durationMs: performance.now() - startTime,
      };
    }

    // Security Pre-Step: PII Sanitization for Logging
    const piiCheck = PiiSanitizer.sanitize(safeRawParams);
    if (piiCheck.hasPii) {
      Logger.info(`[Security Guardrail] Redacted ${piiCheck.redactedCount} sensitive PII fields (${piiCheck.detectedTypes.join(', ')}) from tool '${name}' parameters`);
    }

    // Pipeline Step 1: Self-Healing
    const { params: healedParams, report: healingReport } = SelfHealer.heal(safeRawParams, tool.inputSchema);
    if (healingReport.wasHealed) {
      Logger.info(`[Self-Healing] Healed ${healingReport.healedFieldsCount} fields for tool '${name}'`, healingReport.modifications);
    }

    // Pipeline Step 2: Loop Detection
    const loopCheck = this.loopDetector.recordAndCheck(name, healedParams);
    if (loopCheck.isLoop && loopCheck.steeringMessage) {
      Logger.warn(`[Loop Intercepted] Blocked runaway loop on tool '${name}'`);
      const durationMs = performance.now() - startTime;
      
      globalRoiTracker.recordInvocation({
        wasHealed: healingReport.wasHealed,
        isLoop: true,
        isCacheHit: false,
        isSuccess: false,
        rawTokens: 500,
        distilledTokens: 50,
        durationMs,
      });

      const event: InvocationEvent = {
        id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        toolName: name,
        rawParams: piiCheck.sanitizedData,
        healedParams,
        wasHealed: healingReport.wasHealed,
        healedModifications: healingReport.modifications,
        isError: true,
        isLoop: true,
        isCacheHit: false,
        rawTokens: 500,
        distilledTokens: 50,
        tokensSaved: 450,
        durationMs,
        guidanceMessage: loopCheck.steeringMessage,
      };

      globalLiveStream.broadcast(event);
      this.persistentStore.recordEvent(event);

      return {
        content: [{ type: 'text', text: loopCheck.steeringMessage }],
        isError: true,
        healingReport,
        rawTokens: 500,
        distilledTokens: 50,
        tokensSaved: 450,
        isCached: false,
        durationMs,
      };
    }

    // Pipeline Step 3: Semantic Cache Check
    const cachedData = this.cache.get(name, healedParams);
    if (cachedData !== null) {
      Logger.debug(`[Cache Hit] Serving '${name}' from semantic cache`);
      const text = typeof cachedData === 'string' ? cachedData : JSON.stringify(cachedData, null, 2);
      const tokens = TokenEstimator.estimateTokens(text);
      const durationMs = performance.now() - startTime;

      globalRoiTracker.recordInvocation({
        wasHealed: healingReport.wasHealed,
        isLoop: false,
        isCacheHit: true,
        isSuccess: true,
        rawTokens: tokens,
        distilledTokens: tokens,
        durationMs,
      });

      const event: InvocationEvent = {
        id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        toolName: name,
        rawParams: piiCheck.sanitizedData,
        healedParams,
        wasHealed: healingReport.wasHealed,
        healedModifications: healingReport.modifications,
        isError: false,
        isLoop: false,
        isCacheHit: true,
        rawTokens: tokens,
        distilledTokens: tokens,
        tokensSaved: 0,
        durationMs,
      };

      globalLiveStream.broadcast(event);
      this.persistentStore.recordEvent(event);

      return {
        content: [{ type: 'text', text }],
        isError: false,
        healingReport,
        rawTokens: tokens,
        distilledTokens: tokens,
        tokensSaved: 0,
        isCached: true,
        durationMs,
      };
    }

    // Pipeline Step 4: Upstream Execution via Circuit Breaker
    let rawOutput: any;
    let isError = false;

    try {
      rawOutput = await tool.circuitBreaker!.execute(() => tool.handler(healedParams));
    } catch (err: any) {
      isError = true;
      const translated = ErrorTranslator.translate(name, err, healedParams);
      rawOutput = {
        error: true,
        errorType: translated.errorType,
        message: translated.agentGuidance,
        upstreamDetails: translated.originalError.slice(0, 300),
      };
      Logger.error(`Upstream failure in tool '${name}': ${err.message}`);
    }

    // Security Post-Step: Prompt Injection Shield on Output
    const injectionCheck = InjectionShield.inspectAndNeutralize(rawOutput);
    if (injectionCheck.isCompromised) {
      Logger.warn(`[Security Alert] Prompt injection vector detected in output of '${name}' (${injectionCheck.matchedPatterns.join(', ')}). Neutralized.`);
      try {
        rawOutput = JSON.parse(injectionCheck.neutralizedText);
      } catch {
        rawOutput = injectionCheck.neutralizedText;
      }
    }

    // Pipeline Step 5: Token Distillation & Compression
    const distillResult = JsonDistiller.distill(rawOutput, tool.distillOptions);
    const resultText = typeof distillResult.data === 'string'
      ? distillResult.data
      : JSON.stringify(distillResult.data, null, 2);

    // Pipeline Step 6: Store in Cache if not error and cacheable
    if (!isError && SemanticCache.isCacheable(name)) {
      this.cache.set(name, healedParams, distillResult.data, tool.cacheTtlMs);
    }

    const durationMs = performance.now() - startTime;

    // Record budget spend
    this.budgetGuard.recordSpend(agentId, distillResult.distilledTokens);

    // Create OpenTelemetry Trace Span
    const otelSpan = OtelExporter.createSpan({
      toolName: name,
      durationMs,
      wasHealed: healingReport.wasHealed,
      isError,
      rawTokens: distillResult.rawTokens,
      distilledTokens: distillResult.distilledTokens,
      tokensSaved: distillResult.tokensSaved,
      isCached: false,
      isLoop: false,
      errorMessage: isError ? resultText : undefined,
    });

    // Telemetry & Live Stream Broadcaster Update
    globalRoiTracker.recordInvocation({
      wasHealed: healingReport.wasHealed,
      isLoop: false,
      isCacheHit: false,
      isSuccess: !isError,
      rawTokens: distillResult.rawTokens,
      distilledTokens: distillResult.distilledTokens,
      durationMs,
    });

    const event: InvocationEvent = {
      id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      toolName: name,
      rawParams: piiCheck.sanitizedData,
      healedParams,
      wasHealed: healingReport.wasHealed,
      healedModifications: healingReport.modifications,
      isError,
      isLoop: false,
      isCacheHit: false,
      rawTokens: distillResult.rawTokens,
      distilledTokens: distillResult.distilledTokens,
      tokensSaved: distillResult.tokensSaved,
      durationMs,
    };

    globalLiveStream.broadcast(event);
    this.persistentStore.recordEvent(event);

    return {
      content: [{ type: 'text', text: resultText }],
      isError,
      healingReport,
      rawTokens: distillResult.rawTokens,
      distilledTokens: distillResult.distilledTokens,
      tokensSaved: distillResult.tokensSaved,
      isCached: false,
      durationMs,
      otelSpan,
    };
  }
}
