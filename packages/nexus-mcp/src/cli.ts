#!/usr/bin/env node
/**
 * NexusMCP CLI
 * Usage:
 *   npx @cadastrum/nexus-mcp --stdio
 *   npx @cadastrum/nexus-mcp --http --port 8080 --dashboard
 *   npx @cadastrum/nexus-mcp playground
 *   npx @cadastrum/nexus-mcp report --days 30
 *   npx @cadastrum/nexus-mcp search "weather forecast"
 *   npx @cadastrum/nexus-mcp import https://api.example.com/openapi.json --prefix example
 *   npx @cadastrum/nexus-mcp --preset cadastrum
 */

import { writeFileSync, existsSync } from 'node:fs';
import { ToolRegistry } from './registry/tool-registry.js';
import { ConfigLoader } from './registry/config-loader.js';
import { StdioAdapter } from './transports/stdio-adapter.js';
import { SseAdapter } from './transports/sse-adapter.js';
import { PresetManager } from './presets/built-in-presets.js';
import { PlaygroundSimulator } from './cli/playground.js';
import { Logger, LogLevel } from './telemetry/logger.js';
import { globalRoiTracker } from './telemetry/roi-tracker.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const registry = new ToolRegistry();
  registerDemoTools(registry);

  // Command: playground
  if (command === 'playground' || command === 'simulate') {
    await PlaygroundSimulator.start(registry);
    return;
  }

  // Command: report
  if (command === 'report') {
    const daysIdx = args.indexOf('--days');
    const days = daysIdx !== -1 ? parseInt(args[daysIdx + 1], 10) : 30;
    const formatIdx = args.indexOf('--format');
    const format = formatIdx !== -1 ? args[formatIdx + 1] : 'md';

    if (format === 'json') {
      console.log(JSON.stringify(registry.persistentStore.getEvents(days), null, 2));
    } else {
      console.log(registry.persistentStore.generateMarkdownReport(days));
    }
    process.exit(0);
  }

  // Command: search <query> (Tool-RAG test)
  if (command === 'search') {
    const query = args.slice(1).join(' ');
    if (!query) {
      console.error('Usage: nexus-mcp search "<intent query>"');
      process.exit(1);
    }
    const results = registry.searchTools(query, 5);
    console.log(`\n🔍 Found ${results.length} relevant tools for: "${query}"\n`);
    results.forEach((r, i) => {
      console.log(`  [${i + 1}] ${r.tool.name} (Score: ${r.score})`);
      console.log(`      ${r.tool.description}\n`);
    });
    process.exit(0);
  }

  // Command: import <url-or-file>
  if (command === 'import') {
    const target = args[1];
    if (!target) {
      console.error('Usage: nexus-mcp import <openapi-spec-url-or-path> [--prefix name] [--output ./nexus-mcp.config.json]');
      process.exit(1);
    }
    const prefixIdx = args.indexOf('--prefix');
    const prefix = prefixIdx !== -1 ? args[prefixIdx + 1] : 'api';
    const outIdx = args.indexOf('--output');
    const outPath = outIdx !== -1 ? args[outIdx + 1] : './nexus-mcp.config.json';

    const newConfig = {
      name: `NexusMCP-${prefix}`,
      version: '0.3.0',
      sources: [
        {
          name: prefix,
          prefix,
          specPathOrUrl: target,
          baseUrl: 'https://api.example.com',
          auth: { type: 'bearer', token: 'YOUR_API_TOKEN_HERE' },
          timeoutMs: 15000,
        },
      ],
    };

    writeFileSync(outPath, JSON.stringify(newConfig, null, 2), 'utf-8');
    console.log(`✅ Successfully generated NexusMCP configuration at ${outPath}`);
    process.exit(0);
  }

  const isHttp = args.includes('--http') || args.includes('--dashboard');
  const portIndex = args.indexOf('--port');
  const port = portIndex !== -1 ? parseInt(args[portIndex + 1], 10) : 8080;
  const configIndex = args.indexOf('--config');
  const configPath = configIndex !== -1 ? args[configIndex + 1] : './nexus-mcp.config.json';
  const presetIndex = args.indexOf('--preset');
  const presetName = presetIndex !== -1 ? args[presetIndex + 1] : null;
  const isDebug = args.includes('--debug');

  if (isDebug) {
    Logger.setLevel(LogLevel.DEBUG);
  }

  // If a built-in preset is requested (e.g. --preset cadastrum)
  if (presetName) {
    const preset = PresetManager.getPreset(presetName);
    if (preset) {
      Logger.info(`Loading built-in preset: ${preset.name}`);
      if (existsSync(preset.config.specPathOrUrl)) {
        await ConfigLoader.registerOpenApiSource(preset.config, registry);
      }
    } else {
      Logger.warn(`Preset '${presetName}' not found. Available: ${PresetManager.listPresets().map(p => p.id).join(', ')}`);
    }
  }

  // Load external OpenAPI specs if config exists
  if (existsSync(configPath)) {
    await ConfigLoader.loadAndRegister(configPath, registry);
  }

  if (isHttp) {
    const sse = new SseAdapter(registry, { port });
    await sse.start();
    console.log(`\n⚡ NexusMCP Web Dashboard running at: http://localhost:${port}/dashboard\n`);
  } else {
    // Default: Stdio mode for Claude Desktop / Cursor / Antigravity
    const stdio = new StdioAdapter(registry);
    await stdio.start();
  }

  // Graceful shutdown with summary
  const printReport = () => {
    console.error(globalRoiTracker.formatSummary());
    process.exit(0);
  };
  process.on('SIGINT', printReport);
  process.on('SIGTERM', printReport);
}

function registerDemoTools(registry: ToolRegistry): void {
  // Weather Tool
  registry.register({
    name: 'get_weather_forecast',
    description: 'Fetches weather forecast for a given city and date range.',
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name (e.g. Istanbul, London)' },
        start_date: { type: 'string', format: 'date', description: 'Start date in ISO format YYYY-MM-DD' },
        days: { type: 'number', description: 'Number of forecast days' },
        units: { type: 'string', default: 'metric', description: 'Temperature units (metric/imperial)' },
      },
      required: ['city'],
    },
    handler: async (params) => {
      return {
        location: params.city,
        startDate: params.start_date || '2026-08-24',
        days: params.days || 3,
        forecast: [
          { day: 1, temp: 26, condition: 'Sunny', humidity: 45 },
          { day: 2, temp: 24, condition: 'Partly Cloudy', humidity: 55 },
          { day: 3, temp: 28, condition: 'Clear', humidity: 40 },
        ],
        rawTelemetry: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        redundantAuditLogs: null,
      };
    }
  });

  // User Profile Tool
  registry.register({
    name: 'get_user_profile',
    description: 'Retrieves user details by user ID or email',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'User ID' },
      },
      required: ['user_id'],
    },
    handler: async (params) => {
      if (params.user_id === '999') {
        throw new Error('HTTP 404 User not found in database');
      }
      return {
        id: params.user_id,
        name: 'Demo Agent User',
        email: 'agent@cadastrum.co',
        tier: 'enterprise',
      };
    }
  });

  // User Orders Tool
  registry.register({
    name: 'get_user_orders',
    description: 'Retrieves active orders for a given user email',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'User email address' },
      },
      required: ['email'],
    },
    handler: async (params) => {
      return {
        email: params.email,
        orders: [
          { orderId: 'ORD-1001', amount: 450, status: 'completed' },
          { orderId: 'ORD-1002', amount: 890, status: 'processing' },
        ],
      };
    }
  });

  // Macro Chaining Demo: get_user_with_orders
  registry.registerMacro({
    name: 'get_user_with_orders',
    description: 'Fetches user profile and their active orders in a single consolidated turn',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'User ID to look up' },
      },
      required: ['user_id'],
    },
    steps: [
      {
        tool: 'get_user_profile',
        outputKey: 'user',
        paramsTemplate: { user_id: '$input.user_id' },
      },
      {
        tool: 'get_user_orders',
        outputKey: 'orders',
        paramsTemplate: { email: '$user.email' },
      },
    ],
  });
}

main().catch(err => {
  Logger.error(`NexusMCP fatal error: ${err.message}`);
  process.exit(1);
});
