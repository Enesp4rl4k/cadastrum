/**
 * Structured JSON logging — Cloudflare Workers uyumlu.
 *
 * Neden:
 *   Serbest metin console.log, Workers loglarında (wrangler tail / Logpush)
 *   filtrelemeyi imkânsız kılar. JSON formatı hem insan okunabilir hem de
 *   log aggregation araçlarıyla (Grafana, Datadog) parse edilebilir.
 *
 * Kullanım:
 *   import { log } from "../lib/logger.js";
 *   log("info",  "auth.giris",   { email, ip });
 *   log("warn",  "rate-limit",   { ip, kalan: 0 });
 *   log("error", "db.yazma",     { hata: e.message });
 *
 * Çıktı formatı (JSON, tek satır):
 *   {"level":"info","event":"auth.giris","ts":1722384000000,"email":"...","ip":"..."}
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Yapılandırılmış JSON log kaydı yaz.
 *
 * @param level  - "debug" | "info" | "warn" | "error"
 * @param event  - Nokta-notasyonlu olay adı: "auth.giris", "lemon.webhook", vb.
 * @param data   - Ek alanlar — hiçbiri zorunlu değil, hepsi JSON serializable olmalı.
 */
export function log(
  level: LogLevel,
  event: string,
  data?: Record<string, unknown>,
): void {
  const entry: Record<string, unknown> = {
    level,
    event,
    ts: Date.now(),
    ...data,
  };
  const line = JSON.stringify(entry);
  switch (level) {
    case "debug":
    case "info":
      console.log(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "error":
      console.error(line);
      break;
  }
}

/** Kısayol helpers — log("info", ...) yerine log.info(...) kullanılabilir. */
log.debug = (event: string, data?: Record<string, unknown>) => log("debug", event, data);
log.info  = (event: string, data?: Record<string, unknown>) => log("info",  event, data);
log.warn  = (event: string, data?: Record<string, unknown>) => log("warn",  event, data);
log.error = (event: string, data?: Record<string, unknown>) => log("error", event, data);
