/**
 * HTTP & Server-Sent Events (SSE) Transport Adapter for NexusMCP
 * Provides a standalone web/cloud gateway endpoint, real-time live dashboard, and telemetry.
 */

import http from 'node:http';
import { ToolRegistry } from '../registry/tool-registry.js';
import { globalRoiTracker } from '../telemetry/roi-tracker.js';
import { renderDashboardHtml } from '../dashboard/dashboard-html.js';
import { globalLiveStream, type InvocationEvent } from '../dashboard/live-stream.js';
import { Logger } from '../telemetry/logger.js';

export interface SseAdapterOptions {
  port?: number;
  host?: string;
  corsOrigin?: string;
}

export class SseAdapter {
  private server: http.Server | null = null;
  private readonly port: number;
  private readonly host: string;
  private readonly corsOrigin: string;

  constructor(
    private registry: ToolRegistry,
    options: SseAdapterOptions = {}
  ) {
    this.port = options.port ?? 8080;
    this.host = options.host ?? '0.0.0.0';
    this.corsOrigin = options.corsOrigin ?? '*';
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer(async (req, res) => {
        // Handle CORS
        res.setHeader('Access-Control-Allow-Origin', this.corsOrigin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const url = new URL(req.url || '/', `http://${req.headers.host}`);

        // 1. Web Dashboard View
        if (url.pathname === '/dashboard' || url.pathname === '/') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(renderDashboardHtml());
          return;
        }

        // 2. Real-Time SSE Stream Endpoint for Live Dashboard
        if (url.pathname === '/events/live-stream' || url.pathname === '/events') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          });

          // Send recent history first
          for (const ev of globalLiveStream.getRecentEvents()) {
            res.write(`data: ${JSON.stringify(ev)}\n\n`);
          }

          const onInvocation = (event: InvocationEvent) => {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          };

          globalLiveStream.on('invocation', onInvocation);

          req.on('close', () => {
            globalLiveStream.off('invocation', onInvocation);
          });
          return;
        }

        // 3. Health & ROI Metrics Endpoint
        if (url.pathname === '/health' || url.pathname === '/metrics') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'healthy',
            gateway: 'NexusMCP',
            stats: globalRoiTracker.getSnapshot(),
          }, null, 2));
          return;
        }

        // 4. List Tools Endpoint
        if (url.pathname === '/tools' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ tools: this.registry.listTools() }, null, 2));
          return;
        }

        // 5. Tool Invocation JSON-RPC Endpoint
        if (url.pathname === '/invoke' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body);
              const toolName = payload.name || payload.tool;
              const params = payload.arguments || payload.params || {};

              if (!toolName) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing tool name' }));
                return;
              }

              const result = await this.registry.invoke(toolName, params);
              res.writeHead(result.isError ? 400 : 200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result, null, 2));
            } catch (err: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
      });

      this.server.listen(this.port, this.host, () => {
        Logger.info(`NexusMCP Gateway Dashboard available at http://${this.host}:${this.port}/dashboard`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
