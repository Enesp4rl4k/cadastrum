/**
 * D1 sarmalayıcı — yavaş sorgu tespiti VE okuma/yazma bütçesi sayımı.
 *
 * İkinci iş 2026-09-10'da eklendi: D1 her sorgu sonucunda `meta.rows_read` /
 * `meta.rows_written` döndürüyor ve bu sayı hiçbir yerde toplanmıyordu. Ücretsiz
 * katmanın 5M/gün limiti iki kez doldu (04 ve 09 Eylül), ikisinde de sistem 500
 * vermeye başlayana kadar hiçbir uyarı olmadı. Ayrıntı: `lib/okuma-butcesi.ts`.
 *
 * `context` parametresi artık iki işi birden görüyor: log etiketi VE bütçe
 * tablosundaki `kaynak` kolonu. Yani "bugün limiti kim yedi" sorusu ancak bu
 * ad anlamlıysa cevaplanabiliyor — `wrapD1(db, "cron-daily")` iyi, `wrapD1(db,
 * "db")` işe yaramaz.
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
 * KAPSAM: cron yollarının TAMAMI sarılmalı — bütçeyi yiyen orası (üretimde
 * günde 4 kullanıcı sorgusu var, yük tamamen cron'dan geliyor). Sıcak yolda
 * seçici kullanım sürüyor; sarılmamış çağrılar bütçe raporunda GÖRÜNMEZ ve bu
 * sınır `lib/okuma-butcesi.ts` başında yazılı.
 */

import { log } from "./logger.js";
import { maliyetEkle } from "./okuma-butcesi.js";

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

  /**
   * Sarmalanan gerçek D1 statement'ı açar.
   *
   * NEDEN: `db.batch()` statement'ları D1 runtime'ına serileştiriyor ve
   * TimedStatement'ı tanımıyor — sarmalayıcılar doğrudan geçirilince
   * "D1_ERROR: Malformed input: [{},{},...]" ile patlıyordu. wrapD1'in batch
   * proxy'si bu metotla açıp gerçek statement'ları gönderiyor.
   */
  icStatement(): D1PreparedStatement {
    return this.stmt;
  }

  bind(...values: unknown[]): TimedStatement {
    return new TimedStatement(this.stmt.bind(...values), this.sql, this.context);
  }

  async first<T = unknown>(): Promise<T | null> {
    const t0 = Date.now();
    const result = await this.stmt.first<T>();
    this.kontrol(Date.now() - t0, "first");
    // `first()` D1'de `meta` DÖNDÜRMÜYOR — maliyeti bilinmiyor, ama çağrının
    // olduğu biliniyor. `metasiz` olarak sayılıyor ki bütçe raporu "eksik
    // olabilir" diye okunabilsin. Sayılamayan maliyeti sıfır saymak, bu
    // sayacın önlemek için kurulduğu hatanın ta kendisi.
    maliyetEkle(this.context, undefined);
    return result;
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    const t0 = Date.now();
    const result = await this.stmt.all<T>();
    this.kontrol(Date.now() - t0, "all");
    maliyetEkle(this.context, result.meta);
    return result;
  }

  async run(): Promise<D1Result> {
    const t0 = Date.now();
    const result = await this.stmt.run();
    this.kontrol(Date.now() - t0, "run");
    maliyetEkle(this.context, result.meta);
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
          // TimedStatement sarmalayıcılarını aç — D1 batch yalnızca gerçek
          // prepared statement'ları serileştirebiliyor (bkz. icStatement()).
          const gercek = statements.map((s) =>
            s instanceof TimedStatement ? s.icStatement() : s,
          );
          const result = await target.batch(gercek);
          const ms = Date.now() - t0;
          if (ms >= SLOW_QUERY_MS) {
            log.warn("db.yavassorgus.batch", { ms, context, adet: statements.length });
          }
          // Batch her ifade için ayrı sonuç döndürüyor; maliyet ifade başına
          // sayılıyor, yoksa toplu işlerin gerçek yükü görünmez kalır.
          for (const r of result) maliyetEkle(context, r?.meta);
          return result;
        };
      }
      return (target as unknown as Record<string | symbol, unknown>)[prop];
    },
  });
}
