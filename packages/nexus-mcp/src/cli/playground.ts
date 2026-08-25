/**
 * Interactive Terminal Playground & Tool Simulator
 * Allows developers to test tool schemas, simulate messy agent inputs,
 * view colorful parameter healing diffs, and measure token savings without calling an LLM.
 */

import readline from 'node:readline';
import type { ToolRegistry } from '../registry/tool-registry.js';
import { SelfHealer } from '../core/healing/self-healer.js';
import { PiiSanitizer } from '../core/security/pii-sanitizer.js';
import { JsonDistiller } from '../core/compression/json-distiller.js';

export class PlaygroundSimulator {
  static async start(registry: ToolRegistry): Promise<void> {
    const tools = registry.listTools();
    console.log('\n================================================================');
    console.log('🎮 ⚡ WELCOME TO NEXUS-MCP INTERACTIVE PLAYGROUND ⚡ 🎮');
    console.log('Test tool execution, self-healing diffs, and token compression.');
    console.log('================================================================\n');

    console.log('Available Registered Tools:');
    tools.forEach((t, i) => {
      console.log(`  [${i + 1}] ${t.name} — ${t.description.slice(0, 60)}...`);
    });

    console.log('\nType the tool name or index to test (or "exit" to quit):\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const ask = (promptText: string): Promise<string> => {
      return new Promise(resolve => rl.question(promptText, resolve));
    };

    while (true) {
      const choice = (await ask('\n👉 Select Tool > ')).trim();
      if (choice.toLowerCase() === 'exit' || choice.toLowerCase() === 'quit') {
        console.log('\n👋 Exiting NexusMCP Playground. Happy hacking!\n');
        rl.close();
        process.exit(0);
      }

      let selectedTool = tools.find(t => t.name === choice);
      if (!selectedTool && !isNaN(Number(choice))) {
        const idx = Number(choice) - 1;
        if (idx >= 0 && idx < tools.length) {
          selectedTool = tools[idx];
        }
      }

      if (!selectedTool) {
        console.log(`❌ Tool '${choice}' not found. Please pick from the list.`);
        continue;
      }

      console.log(`\nSelected Tool: \x1b[36m${selectedTool.name}\x1b[0m`);
      console.log('Expected Schema Properties:', JSON.stringify(selectedTool.inputSchema.properties || {}, null, 2));

      console.log('\nEnter test parameters as JSON (e.g. {"city": "Istanbul", "startDate": "24/08/2026", "days": "5"}):');
      const inputJson = (await ask('JSON Input > ')).trim();

      let parsedInput: Record<string, any> = {};
      try {
        parsedInput = inputJson ? JSON.parse(inputJson) : {};
      } catch (err: any) {
        console.log(`❌ Invalid JSON: ${err.message}`);
        continue;
      }

      console.log('\n⚡ Simulating through NexusMCP Pipeline...\n');

      // 1. Security Check
      const pii = PiiSanitizer.sanitize(parsedInput);
      if (pii.hasPii) {
        console.log(`🛡️  \x1b[33m[Security Guardrail]\x1b[0m Redacted ${pii.redactedCount} PII fields (${pii.detectedTypes.join(', ')})`);
      }

      // 2. Self-Healing
      const heal = SelfHealer.heal(parsedInput, selectedTool.inputSchema);
      if (heal.report.wasHealed) {
        console.log(`🔧 \x1b[32m[Self-Healing Active]\x1b[0m Healed ${heal.report.healedFieldsCount} fields:`);
        heal.report.modifications.forEach(m => {
          console.log(`    • ${m.action}: \x1b[31m${JSON.stringify(m.originalValue)}\x1b[0m ➔ \x1b[32m${JSON.stringify(m.healedValue)}\x1b[0m (${m.reason})`);
        });
      } else {
        console.log('✨ [Self-Healing] Input parameters strictly valid (0 modifications).');
      }

      // 3. Execution & Distillation
      const start = performance.now();
      const result = await registry.invoke(selectedTool.name, parsedInput);
      const elapsed = (performance.now() - start).toFixed(2);

      console.log(`\n📦 \x1b[1m[Execution Result (${elapsed}ms)]\x1b[0m`);
      console.log(result.content[0]?.text || '(empty)');

      console.log(`\n📊 \x1b[35m[Token Analytics]\x1b[0m Raw: ${result.rawTokens} tokens ➔ Distilled: ${result.distilledTokens} tokens (\x1b[32m-${result.tokensSaved} tokens saved\x1b[0m)`);
      console.log('----------------------------------------------------------------');
    }
  }
}
