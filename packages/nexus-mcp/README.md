# ⚡ NexusMCP: Intelligent, Self-Healing MCP Gateway & Proxy for AI Agents

> **Turn any API into a resilient, token-efficient, self-healing MCP tool with real-time observability, Tool-RAG semantic search, code sandboxes, agent budget guards, and OpenTelemetry tracing.**

NexusMCP is an ultra-fast, edge-ready **Model Context Protocol (MCP)** gateway and proxy. It acts as an intelligent middleware layer between AI agents (Claude Desktop, Cursor, LangChain, OpenAI Swarm, CrewAI, Antigravity) and external tools/APIs.

---

## 🌟 Complete Feature Matrix

1. **Self-Healing Parameters:** AI agents frequently make small hallucinations — sending `"24/08/2026"` instead of `"2026-08-24"`, `"user_id"` instead of `"userId"`, or `"$1,200"` instead of `1200`. NexusMCP fixes these on-the-fly with `<2ms` latency.
2. **Dynamic Tool-RAG (Semantic Tool Search):** For agents connected to 500+ tools, NexusMCP dynamically filters and serves only the top 3-5 most relevant tools for the current prompt, saving **up to 90% prompt context tokens**.
3. **Safe Agent Code Sandbox:** Built-in isolated JavaScript/compute sandbox (`execute_sandbox_code`) for math, data transformations, and analysis without Docker dependencies.
4. **Agent Budget Guard & Quota Caps:** Enforce strict dollar spending limits per agent/session ($1.50/session). Freezes runaway calls automatically.
5. **OpenTelemetry (OTel) Distributed Tracing:** Generates W3C-compliant spans for Datadog, Jaeger, Grafana, and Prometheus.
6. **Token Optimization & Distillation:** API responses with 50KB+ of redundant metadata, nulls, and bloated base64 URIs are distilled down to essential JSON (<1KB), saving **up to 80% token costs**.
7. **Dead-Loop & Runaway Interception:** Detects recursive agent loops (e.g. 3+ successive failing calls with the same arguments) and injects corrective steering instructions.
8. **Interactive Terminal Playground:** Simulate agent calls, test self-healing diffs, and inspect token savings in your terminal with zero LLM costs (`nexus-mcp playground`).
9. **Security Guardrails & PII Masking:** Automatic redaction of credit cards, passwords, and tokens (GDPR/KVKK) + Prompt Injection & Jailbreak Shield.
10. **Executive ROI Analytics & Reports:** Persistent disk storage of all invocation savings with markdown report generator (`nexus-mcp report --days 30`).
11. **Semantic Error-to-Prompt Translator:** Converts raw HTTP 401, 404, 429, 500 errors into actionable, agent-friendly steering feedback instead of noisy stack traces.
12. **Tool Chaining & Macro Workflows:** Chain sequential API calls (e.g. User Lookup $\rightarrow$ Orders Fetch) into a single MCP tool execution, cutting multi-turn LLM latency by 60%+.
13. **Multi-Key Pool & Rate Limit Balancing:** Round-robin key rotation with automatic 429 cooldown.
14. **Live Web Dashboard (`/dashboard`):** Real-time SSE streaming of tool calls, token savings counter, parameter diffs, and ROI metrics.
15. **Cloudflare Workers Edge Entrypoint:** Edge-native proxy running globally with `<5ms` latency.

---

## 🚀 CLI Commands & Quick Start

```bash
# 1. Interactive Terminal Playground & Simulator
npx @cadastrum/nexus-mcp playground

# 2. Run Stdio Server (Claude Desktop / Cursor / Antigravity)
npx @cadastrum/nexus-mcp --stdio

# 3. Run Web Dashboard with Real-Time SSE Stream
npx @cadastrum/nexus-mcp --dashboard --port 8080

# 4. Search Tools via Tool-RAG
npx @cadastrum/nexus-mcp search "weather forecast tomorrow"

# 5. Generate Executive ROI Markdown Report
npx @cadastrum/nexus-mcp report --days 30

# 6. Generate Config from Any OpenAPI Spec
npx @cadastrum/nexus-mcp import https://api.stripe.com/v1/spec --prefix stripe
```

---

## 💻 Python & LangChain Integration

```python
from nexus_mcp import NexusMcpToolkit

# 1. Connect to NexusMCP gateway
toolkit = NexusMcpToolkit(base_url="http://localhost:8080")
tools = toolkit.get_tools()

# 2. Bind auto-healed, budgeted & token-optimized tools to your agent!
```

---

## 🧪 Testing & Verification
```bash
npm run test
```
All 28 unit, integration, macro, Tool-RAG, sandbox, budget, security, and HTTP transport tests pass with 100% reliability.
