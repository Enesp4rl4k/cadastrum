/**
 * Config Loader & Dynamic API Ingestor
 * Loads YAML/JSON OpenAPI specs and registers them as resilient MCP tools in ToolRegistry.
 */

import { readFileSync, existsSync } from 'node:fs';
import { OpenApiParser } from '../core/transpiler/openapi-parser.js';
import { ToolSynthesizer, type ApiClientConfig } from '../core/transpiler/tool-synthesizer.js';
import { ToolRegistry } from './tool-registry.js';
import { Logger } from '../telemetry/logger.js';

export interface OpenApiSourceConfig {
  name: string;
  specPathOrUrl: string;
  baseUrl: string;
  auth?: ApiClientConfig['auth'];
  prefix?: string;
  timeoutMs?: number;
}

export interface NexusMcpConfig {
  name?: string;
  version?: string;
  sources?: OpenApiSourceConfig[];
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export class ConfigLoader {
  /**
   * Loads a configuration file and registers all configured OpenAPI endpoints.
   */
  static async loadAndRegister(configPath: string, registry: ToolRegistry): Promise<void> {
    if (!existsSync(configPath)) {
      Logger.warn(`Config file not found at ${configPath}. Starting with empty registry.`);
      return;
    }

    try {
      const raw = readFileSync(configPath, 'utf-8');
      const config: NexusMcpConfig = JSON.parse(raw);

      if (config.sources) {
        for (const source of config.sources) {
          await this.registerOpenApiSource(source, registry);
        }
      }
    } catch (err: any) {
      Logger.error(`Failed to load config from ${configPath}: ${err.message}`);
    }
  }

  /**
   * Registers a single OpenAPI source into the registry.
   */
  static async registerOpenApiSource(source: OpenApiSourceConfig, registry: ToolRegistry): Promise<number> {
    try {
      let specObj: Record<string, any>;

      if (source.specPathOrUrl.startsWith('http://') || source.specPathOrUrl.startsWith('https://')) {
        const resp = await fetch(source.specPathOrUrl);
        specObj = (await resp.json()) as Record<string, any>;
      } else {
        const raw = readFileSync(source.specPathOrUrl, 'utf-8');
        specObj = JSON.parse(raw);
      }

      const tools = OpenApiParser.parseSpec(specObj, { prefix: source.prefix || source.name });
      const clientConfig: ApiClientConfig = {
        baseUrl: source.baseUrl,
        auth: source.auth,
        timeoutMs: source.timeoutMs,
      };

      for (const toolDef of tools) {
        const executor = ToolSynthesizer.createExecutor(toolDef, clientConfig);
        registry.register({
          name: toolDef.name,
          description: toolDef.description,
          inputSchema: toolDef.inputSchema,
          handler: executor,
        });
      }

      Logger.info(`Successfully ingested ${tools.length} MCP tools from source '${source.name}'`);
      return tools.length;
    } catch (err: any) {
      Logger.error(`Error ingesting OpenAPI source '${source.name}': ${err.message}`);
      return 0;
    }
  }
}
