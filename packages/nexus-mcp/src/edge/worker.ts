/**
 * Cloudflare Workers / Edge Runtime Entrypoint for NexusMCP
 * Provides sub-5ms global latency on Cloudflare Edge network without Node.js dependencies.
 */

import { SelfHealer } from '../core/healing/self-healer.js';
import { JsonDistiller } from '../core/compression/json-distiller.js';
import { ErrorTranslator } from '../core/healing/error-translator.js';
import { PiiSanitizer } from '../core/security/pii-sanitizer.js';
import { InjectionShield } from '../core/security/injection-shield.js';
import { renderDashboardHtml } from '../dashboard/dashboard-html.js';

export interface Env {
  AUTH_TOKEN?: string;
  CADASTRUM_API_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 1. Dashboard UI
    if (url.pathname === '/' || url.pathname === '/dashboard') {
      return new Response(renderDashboardHtml(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders },
      });
    }

    // 2. Health Check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'healthy', runtime: 'cloudflare-edge' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 3. Fast Edge Self-Healing & Distillation Proxy
    if (url.pathname === '/edge/heal' && request.method === 'POST') {
      try {
        const payload: any = await request.json();
        const rawParams = payload.params || {};
        const schema = payload.schema;

        // Security Sanitization
        const pii = PiiSanitizer.sanitize(rawParams);

        // Self-Healing
        const healed = SelfHealer.heal(pii.sanitizedData, schema);

        return new Response(JSON.stringify(healed), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  },
};
