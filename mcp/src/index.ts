#!/usr/bin/env node
/**
 * Cadastrum Arsa MCP — stdio server for Cursor / Claude Desktop.
 *
 * Env:
 *   CADASTRUM_API_KEY   — cdrm_… (Kurumsal Pro token; /v1/api/* için)
 *   CADASTRUM_API_BASE  — default https://cadastrum-api.cadastrum-tr.workers.dev
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CadastrumApiError, createClientFromEnv } from "./client.js";

const kategoriSchema = z.enum(["arsa", "tarla", "konut"]).default("arsa");

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errResult(e: unknown) {
  if (e instanceof CadastrumApiError) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: e.message, status: e.status, body: e.body }, null, 2),
        },
      ],
      isError: true,
    };
  }
  const msg = e instanceof Error ? e.message : String(e);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: msg }, null, 2) }],
    isError: true,
  };
}

async function main() {
  const client = createClientFromEnv();
  const server = new McpServer({
    name: "cadastrum-arsa",
    version: "1.0.0",
  });

  server.tool(
    "health",
    "Cadastrum Public API sağlık kontrolü (X-API-Key gerekir).",
    {},
    async () => {
      try {
        return jsonResult(await client.health());
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.tool(
    "get_mahalle_fiyat",
    "Mahalle bazlı arsa/tarla/konut TL/m² istatistiği (medyan, Q1, Q3, ilan adedi). Kurumsal API key gerekir.",
    {
      il: z.string().describe("İl adı veya norm (örn: istanbul, Van)"),
      ilce: z.string().describe("İlçe (örn: besiktas, İpekyolu)"),
      mahalle: z.string().describe("Mahalle (örn: bebek)"),
      kategori: kategoriSchema.describe("arsa | tarla | konut"),
    },
    async ({ il, ilce, mahalle, kategori }) => {
      try {
        return jsonResult(await client.mahalleFiyat(il, ilce, mahalle, kategori));
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.tool(
    "search_emsal_spatial",
    "Koordinata göre yakındaki ilan emsalleri (spatial). lat/lng WGS84. API key gerekir.",
    {
      lat: z.number().describe("Enlem"),
      lng: z.number().describe("Boylam"),
      radius_km: z.number().min(0.5).max(50).default(5).describe("Yarıçap km"),
      kategori: kategoriSchema,
    },
    async ({ lat, lng, radius_km, kategori }) => {
      try {
        return jsonResult(await client.emsalSpatial(lat, lng, radius_km, kategori));
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.tool(
    "get_deprem_risk",
    "İl bazlı deprem risk özeti (API key).",
    { il: z.string().describe("İl adı") },
    async ({ il }) => {
      try {
        return jsonResult(await client.riskDeprem(il));
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.tool(
    "get_taskin_risk",
    "İl bazlı taşkın risk özeti (API key).",
    { il: z.string().describe("İl adı") },
    async ({ il }) => {
      try {
        return jsonResult(await client.riskTaskin(il));
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.tool(
    "sorgu_fiyat",
    "Arsa/tarla değer sorgusu: lokasyon (lat/lng veya il/ilçe/mahalle) + opsiyonel imar (emsal/TAKS) → TL/m² bandı ve yatırım skoru. API key gerekmez (IP limiti var).",
    {
      lat: z.number().optional().describe("Enlem"),
      lng: z.number().optional().describe("Boylam"),
      il: z.string().optional(),
      ilce: z.string().optional(),
      mahalle: z.string().optional(),
      kategori: kategoriSchema,
      m2: z.number().positive().optional().describe("Parsel alanı m²"),
      imar_tipi: z
        .enum(["konut", "ticari", "sanayi", "tarim", "karma", "belirsiz"])
        .optional(),
      emsal: z.number().positive().optional().describe("Emsal / KAKS"),
      taks: z.number().positive().max(1).optional().describe("TAKS 0–1"),
    },
    async (args) => {
      try {
        if (args.lat == null && !args.il) {
          return errResult(new Error("lat/lng veya il (ve tercihen ilce) gerekli"));
        }
        return jsonResult(await client.sorgu(args));
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.tool(
    "get_ilce_fiyat",
    "İlçe özet TL/m² (public /v1/fiyat/ilce). API key gerekmez.",
    {
      il: z.string(),
      ilce: z.string(),
      kategori: kategoriSchema,
    },
    async ({ il, ilce, kategori }) => {
      try {
        return jsonResult(await client.ilceFiyat(il, ilce, kategori));
      } catch (e) {
        return errResult(e);
      }
    },
  );

  server.tool(
    "get_il_fiyat",
    "İl özet TL/m² (public /v1/fiyat/il). API key gerekmez.",
    {
      il: z.string(),
      kategori: kategoriSchema,
    },
    async ({ il, kategori }) => {
      try {
        return jsonResult(await client.ilFiyat(il, kategori));
      } catch (e) {
        return errResult(e);
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[cadastrum-arsa-mcp] ready base=${client.baseUrl} key=${client.apiKey ? "yes" : "no (public tools only)"}`,
  );
}

main().catch((e) => {
  console.error("[cadastrum-arsa-mcp] fatal", e);
  process.exit(1);
});
