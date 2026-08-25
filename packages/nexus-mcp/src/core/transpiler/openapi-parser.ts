/**
 * OpenAPI 3.0 / 3.1 to Model Context Protocol (MCP) Transpiler
 * Ingests any REST OpenAPI specification and dynamically synthesizes standard MCP Tool schemas.
 */

import type { ToolInputSchema, PropertySchema } from '../healing/self-healer.js';

export interface OpenApiEndpoint {
  path: string;
  method: string;
  operationId: string;
  summary?: string;
  description?: string;
  parameters?: Array<{
    name: string;
    in: 'query' | 'header' | 'path' | 'cookie';
    description?: string;
    required?: boolean;
    schema?: PropertySchema;
  }>;
  requestBody?: {
    description?: string;
    required?: boolean;
    content?: Record<string, {
      schema?: ToolInputSchema;
    }>;
  };
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  metadata: {
    endpoint: string;
    method: string;
    pathParams: string[];
    queryParams: string[];
    headerParams: string[];
    hasBody: boolean;
  };
}

export class OpenApiParser {
  /**
   * Transpiles an entire OpenAPI document into a collection of MCP Tool definitions.
   */
  static parseSpec(spec: Record<string, any>, options: { prefix?: string } = {}): McpToolDefinition[] {
    const tools: McpToolDefinition[] = [];
    const paths = spec.paths || {};
    const prefix = options.prefix ? `${options.prefix}_` : '';

    for (const [path, pathItem] of Object.entries(paths)) {
      if (!pathItem || typeof pathItem !== 'object') continue;

      const methods = ['get', 'post', 'put', 'delete', 'patch'];
      for (const method of methods) {
        const op = (pathItem as Record<string, any>)[method];
        if (!op) continue;

        const tool = this.convertOperationToMcpTool(path, method, op, prefix);
        tools.push(tool);
      }
    }

    return tools;
  }

  private static convertOperationToMcpTool(
    path: string,
    method: string,
    op: any,
    prefix: string
  ): McpToolDefinition {
    // Generate clean tool name
    let toolName = op.operationId;
    if (!toolName) {
      const cleanPath = path.replace(/[{}]/g, '').replace(/[^a-zA-Z0-9]/g, '_');
      toolName = `${method}_${cleanPath}`.replace(/_+/g, '_').toLowerCase();
    }
    toolName = `${prefix}${toolName}`.replace(/[^a-zA-Z0-9_-]/g, '_');

    const description = op.summary || op.description || `Execute ${method.toUpperCase()} request to ${path}`;

    const properties: Record<string, PropertySchema> = {};
    const required: string[] = [];
    const pathParams: string[] = [];
    const queryParams: string[] = [];
    const headerParams: string[] = [];
    let hasBody = false;

    // Process parameters (path, query, header)
    if (Array.isArray(op.parameters)) {
      for (const param of op.parameters) {
        if (!param || !param.name) continue;

        const paramName = param.name;
        properties[paramName] = {
          type: param.schema?.type || 'string',
          description: param.description || `Parameter ${paramName} (in ${param.in})`,
          format: param.schema?.format,
          default: param.schema?.default,
        };

        if (param.required) {
          required.push(paramName);
        }

        if (param.in === 'path') pathParams.push(paramName);
        else if (param.in === 'query') queryParams.push(paramName);
        else if (param.in === 'header') headerParams.push(paramName);
      }
    }

    // Process request body if present (application/json)
    if (op.requestBody?.content?.['application/json']?.schema) {
      hasBody = true;
      const bodySchema = op.requestBody.content['application/json'].schema;
      if (bodySchema.properties) {
        for (const [bodyPropKey, bodyPropSchema] of Object.entries(bodySchema.properties)) {
          properties[bodyPropKey] = bodyPropSchema as PropertySchema;
        }
      }
      if (Array.isArray(bodySchema.required)) {
        for (const reqKey of bodySchema.required) {
          if (!required.includes(reqKey)) required.push(reqKey);
        }
      }
    }

    return {
      name: toolName,
      description,
      inputSchema: {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      },
      metadata: {
        endpoint: path,
        method: method.toUpperCase(),
        pathParams,
        queryParams,
        headerParams,
        hasBody,
      },
    };
  }
}
