/**
 * Semantic Error-to-Prompt Translator
 * Converts raw HTTP error codes (401, 404, 422, 429, 500) and obscure error payloads
 * into actionable, agent-friendly steering feedback instead of noisy stack traces.
 */

export interface TranslatedError {
  isActionable: boolean;
  statusCode?: number;
  errorType: 'auth' | 'not_found' | 'rate_limit' | 'validation' | 'server_fault' | 'timeout' | 'unknown';
  agentGuidance: string;
  originalError: string;
}

export class ErrorTranslator {
  /**
   * Analyzes an upstream error and produces structured guidance for the AI agent.
   */
  static translate(toolName: string, err: any, params?: Record<string, any>): TranslatedError {
    const errorStr = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
    const statusMatch = errorStr.match(/HTTP\s+(\d{3})/i) || errorStr.match(/status[:\s]+(\d{3})/i);
    const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : undefined;

    // 1. Authentication / Permissions (401, 403)
    if (statusCode === 401 || errorStr.toLowerCase().includes('unauthorized') || errorStr.toLowerCase().includes('invalid token')) {
      return {
        isActionable: true,
        statusCode: 401,
        errorType: 'auth',
        agentGuidance: `Authentication failed for tool '${toolName}'. The API key or Bearer token is missing, expired, or invalid. Please instruct the user to configure valid credentials for this service.`,
        originalError: errorStr,
      };
    }

    if (statusCode === 403 || errorStr.toLowerCase().includes('forbidden') || errorStr.toLowerCase().includes('insufficient permissions')) {
      return {
        isActionable: true,
        statusCode: 403,
        errorType: 'auth',
        agentGuidance: `Access forbidden for tool '${toolName}'. Your credentials do not have permission for this resource/scope. Suggest checking permissions or requesting elevated access.`,
        originalError: errorStr,
      };
    }

    // 2. Resource Not Found (404)
    if (statusCode === 404 || errorStr.toLowerCase().includes('not found')) {
      const idKeys = params ? Object.keys(params).filter(k => k.toLowerCase().includes('id') || k.toLowerCase().includes('key')) : [];
      const idValues = idKeys.map(k => `${k}='${params![k]}'`).join(', ');
      return {
        isActionable: true,
        statusCode: 404,
        errorType: 'not_found',
        agentGuidance: `Resource not found when calling '${toolName}'${idValues ? ` with (${idValues})` : ''}. The requested item does not exist. Please search or list available records first to retrieve a valid identifier.`,
        originalError: errorStr,
      };
    }

    // 3. Rate Limit Exceeded (429)
    if (statusCode === 429 || errorStr.toLowerCase().includes('rate limit') || errorStr.toLowerCase().includes('too many requests')) {
      return {
        isActionable: true,
        statusCode: 429,
        errorType: 'rate_limit',
        agentGuidance: `Rate limit reached for upstream service '${toolName}'. Please wait a few seconds before retrying or consolidate your requests.`,
        originalError: errorStr,
      };
    }

    // 4. Validation / Unprocessable Entity (422, 400)
    if (statusCode === 422 || statusCode === 400 || errorStr.toLowerCase().includes('validation') || errorStr.toLowerCase().includes('invalid parameter')) {
      return {
        isActionable: true,
        statusCode,
        errorType: 'validation',
        agentGuidance: `Upstream validation error in '${toolName}': ${errorStr.slice(0, 300)}. Please inspect the required fields and adjust your parameter values according to the schema.`,
        originalError: errorStr,
      };
    }

    // 5. Server Fault (500, 502, 503, 504)
    if (statusCode && statusCode >= 500) {
      return {
        isActionable: true,
        statusCode,
        errorType: 'server_fault',
        agentGuidance: `Upstream service failure (HTTP ${statusCode}) on '${toolName}'. The remote server is experiencing temporary downtime or an internal error. You may retry shortly or try a fallback tool.`,
        originalError: errorStr,
      };
    }

    // Default fallback
    return {
      isActionable: false,
      statusCode,
      errorType: 'unknown',
      agentGuidance: `Execution failed for tool '${toolName}': ${errorStr.slice(0, 300)}. Review parameters or try an alternative approach.`,
      originalError: errorStr,
    };
  }
}
