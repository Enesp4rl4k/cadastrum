/**
 * Cadastrum HTTP client — X-API-Key (/v1/api/*) + public (/v1/*) endpoints.
 */

export type Kategori = "arsa" | "tarla" | "konut";

export interface CadastrumClientOptions {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

export class CadastrumApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "CadastrumApiError";
  }
}

export class CadastrumClient {
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly timeoutMs: number;

  constructor(opts: CadastrumClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey?.trim() || undefined;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  private async request(
    method: string,
    path: string,
    init?: { query?: Record<string, string | number | undefined>; body?: unknown; apiKey?: boolean },
  ): Promise<unknown> {
    const url = new URL(path.startsWith("http") ? path : `${this.baseUrl}${path}`);
    if (init?.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "cadastrum-arsa-mcp/1.0",
    };
    if (init?.apiKey !== false && this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }
    if (init?.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: ctrl.signal,
      });
      const text = await res.text();
      let data: unknown = text;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        /* keep text */
      }
      if (!res.ok) {
        const msg =
          typeof data === "object" && data && "error" in data
            ? String((data as { error: unknown }).error)
            : `HTTP ${res.status}`;
        throw new CadastrumApiError(msg, res.status, data);
      }
      return data;
    } finally {
      clearTimeout(t);
    }
  }

  /** Kurumsal API — anahtar gerekir */
  requireKey(): void {
    if (!this.apiKey) {
      throw new Error(
        "CADASTRUM_API_KEY gerekli (cdrm_…). Hesap → API Tokens veya Kurumsal Pro ile üretin.",
      );
    }
  }

  health() {
    this.requireKey();
    return this.request("GET", "/v1/api/health");
  }

  mahalleFiyat(il: string, ilce: string, mahalle: string, kategori: Kategori = "arsa") {
    this.requireKey();
    const enc = (s: string) => encodeURIComponent(s.trim().toLocaleLowerCase("tr-TR"));
    return this.request(
      "GET",
      `/v1/api/fiyat/mahalle/${enc(il)}/${enc(ilce)}/${enc(mahalle)}`,
      { query: { kategori } },
    );
  }

  emsalSpatial(lat: number, lng: number, radiusKm = 5, kategori: Kategori = "arsa") {
    this.requireKey();
    return this.request("GET", "/v1/api/emsal/spatial", {
      query: { lat, lng, radius_km: radiusKm, kategori },
    });
  }

  riskDeprem(il: string) {
    this.requireKey();
    return this.request("GET", "/v1/api/risk/deprem", { query: { il } });
  }

  riskTaskin(il: string) {
    this.requireKey();
    return this.request("GET", "/v1/api/risk/taskin", { query: { il } });
  }

  /** Public web sorgu — API key opsiyonel (IP rate limit) */
  sorgu(body: {
    lat?: number;
    lng?: number;
    il?: string;
    ilce?: string;
    mahalle?: string;
    kategori?: Kategori;
    m2?: number;
    imar_tipi?: string;
    emsal?: number;
    taks?: number;
  }) {
    return this.request("POST", "/v1/sorgu", { body, apiKey: false });
  }

  ilceFiyat(il: string, ilce: string, kategori: Kategori = "arsa") {
    const enc = (s: string) => encodeURIComponent(s.trim().toLocaleLowerCase("tr-TR"));
    return this.request("GET", `/v1/fiyat/ilce/${enc(il)}/${enc(ilce)}`, {
      query: { kategori },
      apiKey: false,
    });
  }

  ilFiyat(il: string, kategori: Kategori = "arsa") {
    const enc = (s: string) => encodeURIComponent(s.trim().toLocaleLowerCase("tr-TR"));
    return this.request("GET", `/v1/fiyat/il/${enc(il)}`, {
      query: { kategori },
      apiKey: false,
    });
  }
}

export function createClientFromEnv(): CadastrumClient {
  const baseUrl =
    process.env.CADASTRUM_API_BASE?.trim() ||
    "https://cadastrum-api.cadastrum-tr.workers.dev";
  const apiKey = process.env.CADASTRUM_API_KEY?.trim();
  return new CadastrumClient({ baseUrl, apiKey });
}
