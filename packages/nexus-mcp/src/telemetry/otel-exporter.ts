/**
 * OpenTelemetry Distributed Trace & Span Exporter
 * Formats gateway execution spans following W3C Trace Context and OTel semantic conventions.
 */

import { randomBytes } from 'node:crypto';

export interface OtelSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: 'SERVER' | 'INTERNAL' | 'CLIENT';
  startTimeUnixNano: number;
  endTimeUnixNano: number;
  attributes: Record<string, string | number | boolean>;
  status: { code: 'OK' | 'ERROR'; message?: string };
}

export class OtelExporter {
  static generateTraceId(): string {
    return randomBytes(16).toString('hex');
  }

  static generateSpanId(): string {
    return randomBytes(8).toString('hex');
  }

  /**
   * Creates a structured OpenTelemetry span for a tool invocation.
   */
  static createSpan(data: {
    toolName: string;
    durationMs: number;
    wasHealed: boolean;
    isError: boolean;
    rawTokens: number;
    distilledTokens: number;
    tokensSaved: number;
    isCached: boolean;
    isLoop: boolean;
    traceId?: string;
    parentSpanId?: string;
    errorMessage?: string;
  }): OtelSpan {
    const traceId = data.traceId || this.generateTraceId();
    const spanId = this.generateSpanId();
    const nowNano = Date.now() * 1000000;
    const durationNano = Math.round(data.durationMs * 1000000);

    return {
      traceId,
      spanId,
      parentSpanId: data.parentSpanId,
      name: `nexus.tool.${data.toolName}`,
      kind: 'INTERNAL',
      startTimeUnixNano: nowNano - durationNano,
      endTimeUnixNano: nowNano,
      attributes: {
        'service.name': 'nexus-mcp-gateway',
        'mcp.tool.name': data.toolName,
        'mcp.self_healed': data.wasHealed,
        'mcp.cache_hit': data.isCached,
        'mcp.loop_intercepted': data.isLoop,
        'tokens.raw': data.rawTokens,
        'tokens.distilled': data.distilledTokens,
        'tokens.saved': data.tokensSaved,
        'execution.duration_ms': data.durationMs,
      },
      status: {
        code: data.isError ? 'ERROR' : 'OK',
        message: data.errorMessage,
      },
    };
  }
}
