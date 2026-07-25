/**
 * Agent Telemetri — Her agent adımını trace eder.
 *
 * Her /v1/ai-danisman/sohbet isteği için:
 *   - Benzersiz trace_id (istek başına)
 *   - Her span: adım adı, model, latency, token tahmin, durum
 *   - D1'e async yazılır — kritik yolda değil
 *
 * Span hiyerarşisi:
 *   trace
 *     ├── guardrail.input
 *     ├── memory.retrieve
 *     ├── tool_call.fiyat_istatistik  (0-N)
 *     ├── tool_call.deprem_risk       (0-N)
 *     ├── llm.gemini / llm.groq
 *     ├── reflection.validate
 *     └── guardrail.output
 */

import type { Env } from "../index.js";

// ── Tipler ────────────────────────────────────────────────────────────────────

export type SpanDurum = "ok" | "hata" | "atland";

export interface Span {
  span_id: string;
  trace_id: string;
  ad: string;           // "guardrail.input", "llm.gemini", "tool_call.fiyat_istatistik" vs.
  baslangic: number;    // ms epoch
  bitis?: number;
  sure_ms?: number;
  durum: SpanDurum;
  model?: string;
  girdi_token?: number;
  cikti_token?: number;
  meta?: Record<string, unknown>;
  hata_metni?: string;
}

export interface AgentTrace {
  trace_id: string;
  kullanici_id: number;
  olusturuldu: number;
  spanlar: Span[];
}

// ── Trace yöneticisi ──────────────────────────────────────────────────────────

export class TraceYoneticisi {
  readonly trace_id: string;
  readonly kullanici_id: number;
  private spanlar: Span[] = [];
  private aktif = new Map<string, Span>();

  constructor(kullanici_id: number) {
    this.trace_id = crypto.randomUUID();
    this.kullanici_id = kullanici_id;
  }

  /** Yeni span başlat */
  spanBaslat(ad: string, meta?: Record<string, unknown>): string {
    const span_id = crypto.randomUUID().slice(0, 8);
    const span: Span = {
      span_id,
      trace_id: this.trace_id,
      ad,
      baslangic: Date.now(),
      durum: "ok",
      meta,
    };
    this.aktif.set(span_id, span);
    return span_id;
  }

  /** Span'ı kapat */
  spanBitir(
    span_id: string,
    opts: {
      durum?: SpanDurum;
      model?: string;
      girdi_token?: number;
      cikti_token?: number;
      meta?: Record<string, unknown>;
      hata?: string;
    } = {},
  ): void {
    const span = this.aktif.get(span_id);
    if (!span) return;

    span.bitis  = Date.now();
    span.sure_ms = span.bitis - span.baslangic;
    span.durum  = opts.durum ?? "ok";
    if (opts.model)         span.model = opts.model;
    if (opts.girdi_token)   span.girdi_token = opts.girdi_token;
    if (opts.cikti_token)   span.cikti_token = opts.cikti_token;
    if (opts.hata)          span.hata_metni = opts.hata;
    if (opts.meta) span.meta = { ...span.meta, ...opts.meta };

    this.aktif.delete(span_id);
    this.spanlar.push(span);
  }

  /** Açık kalan spanları zorla kapat */
  temizle(durum: SpanDurum = "hata"): void {
    for (const [span_id] of this.aktif) {
      this.spanBitir(span_id, { durum });
    }
  }

  /** Trace'i D1'e async kaydet — fire-and-forget */
  async kaydet(db: Env["DB"]): Promise<void> {
    this.temizle("atland");
    try {
      const ozet = JSON.stringify({
        trace_id: this.trace_id,
        span_sayisi: this.spanlar.length,
        toplam_sure_ms: this.spanlar.reduce((s, sp) => s + (sp.sure_ms ?? 0), 0),
        model: this.spanlar.find((s) => s.ad.startsWith("llm."))?.model ?? null,
        arac_sayisi: this.spanlar.filter((s) => s.ad.startsWith("tool_call.")).length,
        hatali_span: this.spanlar.filter((s) => s.durum === "hata").map((s) => s.ad),
        spanlar: this.spanlar.map((s) => ({
          ad: s.ad, sure_ms: s.sure_ms ?? 0, durum: s.durum,
          model: s.model, hata: s.hata_metni,
        })),
      });

      await db.prepare(
        `INSERT OR IGNORE INTO agent_trace
         (trace_id, kullanici_id, ozet, olusturuldu)
         VALUES (?, ?, ?, ?)`,
      ).bind(this.trace_id, this.kullanici_id, ozet, Date.now()).run();
    } catch {
      // Tablo henüz yoksa sessizce geç
    }
  }

  /** Özet metrikleri — response header'a eklenebilir */
  ozet(): {
    trace_id: string;
    span_sayisi: number;
    toplam_sure_ms: number;
    arac_sayisi: number;
  } {
    return {
      trace_id: this.trace_id,
      span_sayisi: this.spanlar.length,
      toplam_sure_ms: this.spanlar.reduce((s, sp) => s + (sp.sure_ms ?? 0), 0),
      arac_sayisi: this.spanlar.filter((s) => s.ad.startsWith("tool_call.")).length,
    };
  }
}

/** Token sayısı tahmini (3 char/token, Türkçe için tutucu) */
export function tokenSay(metin: string): number {
  return Math.ceil(metin.length / 3);
}
