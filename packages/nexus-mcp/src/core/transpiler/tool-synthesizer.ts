/**
 * Tool Synthesizer & HTTP Executor
 * Dispatches synthesized MCP tools to live HTTP/REST endpoints with parameter interpolation.
 */

import type { McpToolDefinition } from './openapi-parser.js';

export interface HttpAuthConfig {
  type: 'bearer' | 'apiKey' | 'basic' | 'none';
  token?: string;
  headerName?: string;
  apiKey?: string;
  username?: string;
  password?: string;
}

export interface ApiClientConfig {
  baseUrl: string;
  auth?: HttpAuthConfig;
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
}

export class ToolSynthesizer {
  /**
   * Builds an executable caller function for an MCP tool definition.
   */
  static createExecutor(
    tool: McpToolDefinition,
    config: ApiClientConfig
  ): (params: Record<string, any>) => Promise<any> {
    return async (params: Record<string, any>) => {
      let url = `${config.baseUrl.replace(/\/$/, '')}${tool.metadata.endpoint}`;
      const queryParams = new URLSearchParams();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(config.defaultHeaders || {}),
      };

      // 1. Inject Auth
      if (config.auth) {
        if (config.auth.type === 'bearer' && config.auth.token) {
          headers['Authorization'] = `Bearer ${config.auth.token}`;
        } else if (config.auth.type === 'apiKey' && config.auth.apiKey) {
          const headerName = config.auth.headerName || 'X-API-Key';
          headers[headerName] = config.auth.apiKey;
        } else if (config.auth.type === 'basic' && config.auth.username) {
          const creds = Buffer.from(`${config.auth.username}:${config.auth.password || ''}`).toString('base64');
          headers['Authorization'] = `Basic ${creds}`;
        }
      }

      // 2. Interpolate Path Parameters
      for (const pathParam of tool.metadata.pathParams) {
        if (params[pathParam] !== undefined) {
          url = url.replace(`{${pathParam}}`, encodeURIComponent(String(params[pathParam])));
        }
      }

      // 3. Populate Query Parameters
      for (const qParam of tool.metadata.queryParams) {
        if (params[qParam] !== undefined && params[qParam] !== null) {
          queryParams.append(qParam, String(params[qParam]));
        }
      }

      const queryString = queryParams.toString();
      if (queryString) {
        url += (url.includes('?') ? '&' : '?') + queryString;
      }

      // 4. Populate Headers
      for (const hParam of tool.metadata.headerParams) {
        if (params[hParam] !== undefined) {
          headers[hParam] = String(params[hParam]);
        }
      }

      // 5. Construct Body
      let body: string | undefined;
      if (tool.metadata.hasBody || ['POST', 'PUT', 'PATCH'].includes(tool.metadata.method)) {
        const bodyObj: Record<string, any> = {};
        for (const [k, v] of Object.entries(params)) {
          if (!tool.metadata.pathParams.includes(k) && !tool.metadata.queryParams.includes(k) && !tool.metadata.headerParams.includes(k)) {
            bodyObj[k] = v;
          }
        }
        if (Object.keys(bodyObj).length > 0) {
          body = JSON.stringify(bodyObj);
        }
      }

      // 6. Execute HTTP request
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 15000);

      try {
        const response = await fetch(url, {
          method: tool.metadata.method,
          headers,
          body,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        const contentType = response.headers.get('content-type') || '';
        let responseData: any;

        if (contentType.includes('application/json')) {
          responseData = await response.json();
        } else {
          responseData = await response.text();
        }

        if (!response.ok) {
          const errorMsg = typeof responseData === 'object' ? JSON.stringify(responseData) : String(responseData);
          throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorMsg.slice(0, 500)}`);
        }

        return responseData;
      } catch (err: any) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
          throw new Error(`Request to ${url} timed out after ${config.timeoutMs || 15000}ms`);
        }
        throw err;
      }
    };
  }
}
