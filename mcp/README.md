# Cadastrum Arsa MCP

Cadastrum API’yi Cursor / Claude Desktop’a bağlayan stdio MCP sunucusu.

## Araçlar

| Tool | Auth | Ne yapar |
|------|------|----------|
| `health` | API key | `/v1/api/health` |
| `get_mahalle_fiyat` | API key | Mahalle medyan / Q1 / Q3 |
| `search_emsal_spatial` | API key | Koord → yakındaki emsaller |
| `get_deprem_risk` | API key | İl deprem risk |
| `get_taskin_risk` | API key | İl taşkın risk |
| `sorgu_fiyat` | — | Web sorgu (imar + TL/m² bandı) |
| `get_ilce_fiyat` | — | İlçe özet |
| `get_il_fiyat` | — | İl özet |

## Kurulum

```bash
cd mcp
npm install
npm run build
```

API key: [cadastrum.com.tr/hesap/api-tokens](https://cadastrum.com.tr/hesap/api-tokens) (Kurumsal Pro).

## Cursor

`%USERPROFILE%\.cursor\mcp.json` (veya proje `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "cadastrum-arsa": {
      "command": "node",
      "args": ["C:/Users/parlak/Downloads/arsa-tkgm-extension/mcp/dist/index.js"],
      "env": {
        "CADASTRUM_API_KEY": "cdrm_YOUR_TOKEN",
        "CADASTRUM_API_BASE": "https://cadastrum-api.cadastrum-tr.workers.dev"
      }
    }
  }
}
```

Key olmadan da `sorgu_fiyat` / `get_il*_fiyat` çalışır (IP rate limit).

## Geliştirme

```bash
npm run dev
```

Loglar stderr’e gider (`console.error`); stdout MCP protokolüdür.
