/**
 * Stdio Transport Adapter for NexusMCP
 * Standard JSON-RPC 2.0 implementation of Anthropic Model Context Protocol (MCP).
 * Compatible with Claude Desktop, Cursor, Antigravity, Windsurf, and custom agent runtimes.
 */

import readline from 'node:readline';
import { ToolRegistry } from '../registry/tool-registry.js';
import { Logger } from '../telemetry/logger.js';

export interface McpServerInfo {
  name: string;
  version: string;
}

export class StdioAdapter {
  private serverInfo: McpServerInfo;
  private isRunning = false;

  constructor(
    private registry: ToolRegistry,
    serverInfo: McpServerInfo = { name: 'nexus-mcp', version: '0.1.0' }
  ) {
    this.serverInfo = serverInfo;
  }

  /**
   * Starts reading JSON-RPC 2.0 messages from stdin and writing responses to stdout.
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    Logger.info(`NexusMCP Stdio Adapter started (${this.serverInfo.name} v${this.serverInfo.version})`);

    rl.on('line', async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const message = JSON.parse(trimmed);
        const response = await this.handleMessage(message);
        if (response) {
          process.stdout.write(JSON.stringify(response) + '\n');
        }
      } catch (err: any) {
        Logger.error(`Malformed JSON-RPC message received: ${err.message}`);
        const errorResponse = {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error: invalid JSON',
          },
        };
        process.stdout.write(JSON.stringify(errorResponse) + '\n');
      }
    });

    rl.on('close', () => {
      this.isRunning = false;
      Logger.info('NexusMCP Stdio connection closed');
    });
  }

  /**
   * Handles incoming MCP JSON-RPC protocol requests.
   */
  private async handleMessage(req: Record<string, any>): Promise<Record<string, any> | null> {
    const { id, method, params } = req;

    // Notifications (no id)
    if (id === undefined || id === null) {
      if (method === 'notifications/initialized') {
        Logger.debug('Client sent initialized notification');
      }
      return null;
    }

    try {
      switch (method) {
        // 1. MCP Initialization Handshake
        case 'initialize': {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {
                  listChanged: true,
                },
              },
              serverInfo: this.serverInfo,
            },
          };
        }

        // 2. Ping Health Check
        case 'ping': {
          return {
            jsonrpc: '2.0',
            id,
            result: {},
          };
        }

        // 3. List Registered Tools
        case 'tools/list': {
          const tools = this.registry.listTools();
          return {
            jsonrpc: '2.0',
            id,
            result: {
              tools: tools.map(t => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
              })),
            },
          };
        }

        // 4. Call Tool (Interception Pipeline: Self-Heal -> Loop Detect -> Cache -> Execute -> Distill)
        case 'tools/call': {
          const toolName = params?.name;
          const args = params?.arguments || {};

          if (!toolName) {
            return {
              jsonrpc: '2.0',
              id,
              error: {
                code: -32602,
                message: 'Invalid params: missing tool name',
              },
            };
          }

          const result = await this.registry.invoke(toolName, args);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: result.content,
              isError: result.isError ?? false,
            },
          };
        }

        default: {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method '${method}' not found`,
            },
          };
        }
      }
    } catch (err: any) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: `Internal error: ${err.message}`,
        },
      };
    }
  }
}
