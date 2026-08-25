/**
 * Built-in Preset Catalog for NexusMCP
 * Provides instant zero-config integrations for popular developer APIs and platforms.
 */

import type { ToolRegistry } from '../registry/tool-registry.js';
import type { OpenApiSourceConfig } from '../registry/config-loader.js';

export interface PresetDefinition {
  id: string;
  name: string;
  description: string;
  category: 'real-estate' | 'developer' | 'payments' | 'weather';
  config: OpenApiSourceConfig;
}

export const BUILT_IN_PRESETS: Record<string, PresetDefinition> = {
  cadastrum: {
    id: 'cadastrum',
    name: 'Cadastrum Real Estate & Cadastre API',
    description: 'Query parcel boundaries, zoning plans, automated valuation model (AVM), and earthquake/flood risk metrics across Turkey.',
    category: 'real-estate',
    config: {
      name: 'cadastrum',
      prefix: 'cadastrum',
      specPathOrUrl: './backend/api/openapi.yaml',
      baseUrl: 'https://api.cadastrum.co',
      auth: {
        type: 'bearer',
        token: process.env.CADASTRUM_API_KEY || 'demo_key',
      },
    },
  },
  github: {
    id: 'github',
    name: 'GitHub REST API',
    description: 'Search repositories, manage pull requests, inspect commits, and query issues.',
    category: 'developer',
    config: {
      name: 'github',
      prefix: 'github',
      specPathOrUrl: 'https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json',
      baseUrl: 'https://api.github.com',
      auth: {
        type: 'bearer',
        token: process.env.GITHUB_TOKEN,
      },
    },
  },
};

export class PresetManager {
  static getPreset(id: string): PresetDefinition | null {
    return BUILT_IN_PRESETS[id.toLowerCase()] || null;
  }

  static listPresets(): PresetDefinition[] {
    return Object.values(BUILT_IN_PRESETS);
  }
}
