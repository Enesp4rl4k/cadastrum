/**
 * Tool Chainer & Macro Engine
 * Combines multi-step sequential API calls into a single MCP tool execution,
 * saving multiple LLM round-trips and thousands of tokens.
 */

import type { ToolRegistry } from '../../registry/tool-registry.js';
import type { ToolInputSchema } from '../healing/self-healer.js';
import { Logger } from '../../telemetry/logger.js';

export interface MacroStep {
  tool: string;
  outputKey?: string;
  paramsTemplate: Record<string, any>;
  continueOnError?: boolean;
}

export interface MacroDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  steps: MacroStep[];
}

export class ToolChainer {
  /**
   * Evaluates a template value, replacing placeholders like "$input.userId" or "$user.profile.email".
   */
  static evaluateValue(templateVal: any, context: Record<string, any>): any {
    if (typeof templateVal === 'string') {
      if (templateVal.startsWith('$')) {
        const path = templateVal.slice(1);
        return this.getNestedProperty(context, path);
      }

      // String interpolation: "Hello $input.name!"
      return templateVal.replace(/\$([a-zA-Z0-9_.]+)/g, (_, path) => {
        const val = this.getNestedProperty(context, path);
        return val !== undefined ? String(val) : '';
      });
    }

    if (Array.isArray(templateVal)) {
      return templateVal.map(item => this.evaluateValue(item, context));
    }

    if (templateVal && typeof templateVal === 'object') {
      const obj: Record<string, any> = {};
      for (const [k, v] of Object.entries(templateVal)) {
        obj[k] = this.evaluateValue(v, context);
      }
      return obj;
    }

    return templateVal;
  }

  private static getNestedProperty(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }
    return current;
  }

  /**
   * Executes a Macro definition against a ToolRegistry.
   */
  static async executeMacro(
    macro: MacroDefinition,
    inputParams: Record<string, any>,
    registry: ToolRegistry
  ): Promise<{
    success: boolean;
    data: Record<string, any>;
    stepOutputs: Record<string, any>;
    executedStepsCount: number;
    error?: string;
  }> {
    const context: Record<string, any> = {
      input: inputParams,
      prev: undefined,
    };
    const stepOutputs: Record<string, any> = {};
    let stepCount = 0;

    Logger.info(`[Macro Engine] Starting execution of macro '${macro.name}' with ${macro.steps.length} steps`);

    for (let i = 0; i < macro.steps.length; i++) {
      const step = macro.steps[i];
      stepCount++;

      // 1. Build resolved parameters
      const resolvedParams = this.evaluateValue(step.paramsTemplate, context);

      // 2. Invoke tool via registry pipeline
      const result = await registry.invoke(step.tool, resolvedParams);

      if (result.isError) {
        const errorText = result.content.map(c => c.text).join('\n');
        if (!step.continueOnError) {
          Logger.error(`[Macro Engine] Step ${i + 1} (${step.tool}) failed: ${errorText}`);
          return {
            success: false,
            data: { error: `Macro '${macro.name}' aborted at step ${i + 1} (${step.tool}): ${errorText}` },
            stepOutputs,
            executedStepsCount: stepCount,
            error: errorText,
          };
        }
      }

      // Parse step output JSON if possible
      let parsedOutput: any;
      try {
        parsedOutput = JSON.parse(result.content[0]?.text || '{}');
      } catch {
        parsedOutput = result.content[0]?.text;
      }

      const key = step.outputKey || `step_${i + 1}`;
      context[key] = parsedOutput;
      context.prev = parsedOutput;
      stepOutputs[key] = parsedOutput;
    }

    return {
      success: true,
      data: context.prev ?? stepOutputs,
      stepOutputs,
      executedStepsCount: stepCount,
    };
  }
}
