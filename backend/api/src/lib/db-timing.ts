/**
 * D1 yavaş sorgu tespiti — Cloudflare Workers uyumlu.
 *
 * D1Database'i sararak her `prepare().first/all/run()` çağrısını zamanlar.
 * SLOW_QUERY_MS eşiğini aşan sorgular `lib/logger.ts` üzerinden warn olarak loglanır.
 *
 * Kullanım (index.ts'de, app kurulmadan önce):
 *   const timedDB = wrapD1(c.env.DB, "fiyat.mahalle");
 *   await timedDB.prepare("SELECT ...").first();
 *
 * Middleware olarak kullanım (route handler içinde):
 *   const db = wrapD1(c.env.DB, c.req.path);
 *
 * NOT: Bu wrapper production'da her route'a manuel enjekte edilmek yerine,
 * kritik endpoint'lerde (emsal-spatial, sorgu, fiyat) kullanılır.
 * Tüm D1 wrap edilmesi Worker CPU overhead'i artırır — seçici kullanın.
 */

import { log } from "./logger.js";

/** Yavaş sorgu eşiği (ms) */
const SLOW_QUERY_MS = 500;

/**
 * D1PreparedStatement wrapper — çalışma süresini ölçer, eşik aşılırsa loglar.
 */
class TimedStatement {
  constructor(
    private readonly stmt: D1PreparedStatement,
    private readonly sql: string,
    private readonly context: string,
  ) {}

  bind(...values: unknown[]): TimedStatement {
    return new TimedStatement(this.stmt.bind(...values), this.sql, this.context);
  }

  async first<T = unknown>(): Promise<T | null> {
    const t0 = Date.now();
    const result = await this.stmt.first<T>();
    this.kontrol(Date.now() - t0, "first");
    return result;
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    const t0 = Date.now();
    const result = await this.stmt.all<T>();
    this.kontrol(Date.now() - t0, "all");
    return result;
  }

  async run(): Promise<D1Result> {
    const t0 = Date.now();
    const result = await this.stmt.run();
    this.kontrol(Date.now() - t0, "run");
    return result;
  }

  private kontrol(ms: number, op: string): void {
    if (ms >= SLOW_QUERY_MS) {
      log.warn("db.yavassorgus", {
        ms,
        op,
        context: this.context,
        sql: this.sql.slice(0, 200).replace(/\s+/g, " ").trim(),
      });
    }
  }
}

/**
 * D1Database wrapper — prepare() çağrılarını TimedStatement'a dönüştürür.
 *
 * @param db      - Orijinal D1Database binding
 * @param context - Log context'i (route adı, endpoint vb.)
 */
export function wrapD1(db: D1Database, context: string): D1Database {
  return new Proxy(db, {
    get(target, prop) {
      if (prop === "prepare") {
        return (sql: string) => new TimedStatement(target.prepare(sql), sql, context);
      }
      if (prop === "batch") {
        return async (statements: D1PreparedStatement[]) => {
          const t0 = Date.now();
          const result = await target.batch(statements);
          const ms = Date.now() - t0;
          if (ms >= SLOW_QUERY_MS) {
            log.warn("db.yavassorgus.batch", { ms, context, adet: statements.length });
          }
          return result;
        };
      }
      return (target as unknown as Record<string | symbol, unknown>)[prop];
    },
  });
}
