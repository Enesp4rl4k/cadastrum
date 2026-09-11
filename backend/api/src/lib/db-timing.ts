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
import { maliyetEkle, hataEkle } from "./okuma-butcesi.js";

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

  /**
   * `first()` — ama `all()` üzerinden, maliyeti ÖLÇÜLEBİLSİN diye.
   *
   * D1'in yerel `first()` metodu `meta` DÖNDÜRMÜYOR, yani `rows_read`
   * görünmüyor. İlk sürümde bu çağrılar `metasiz` sayılıp bırakılmıştı ve bu
   * ciddi bir boşluktu: cron yolundaki `COUNT(*)` sorgularının neredeyse
   * tamamı `first()` kullanıyor (pipeline-health'te 13 first / 1 all) ve tam
   * taramaların çoğu tam da onlar. Yani bütçeyi en çok yiyen sorgu sınıfı
   * sayaca GÖRÜNMEZ olacaktı — sayaç 1M gösterirken gerçek tüketim 6,7M olup
   * kontrol "geçti" diyebilirdi. Dipnotlu sahte yeşil.
   *
   * `all()`'a yönlendirmek maliyeti ARTIRMIYOR — Cloudflare belgesi:
   * "first() does not alter the SQL query" (LIMIT 1 eklemiyor, sorgunun
   * tamamını çalıştırıp ilk satırı döndürüyor). `rows_read` ikisinde aynı.
   * Tek fark Worker'a taşınan satır sayısı ve COUNT/agrega sorgularında o
   * zaten 1. Birden fazla satır dönüyorsa aşağıda UYARI loglanıyor: o sorgu
   * `first()` ile çağrılıp çok satır üretiyor demektir ve `LIMIT 1` eksik —
   * israf artık görünür.
   */
  async first<T = unknown>(): Promise<T | null> {
    const t0 = Date.now();
    const result = await this.sayarak(() => this.stmt.all<T>());
    this.kontrol(Date.now() - t0, "first");
    maliyetEkle(this.context, result.meta);
    const satirlar = result.results ?? [];
    if (satirlar.length > 1) {
      log.warn("db.first.cok-satir", {
        context: this.context,
        satir: satirlar.length,
        sql: this.sql.slice(0, 200).replace(/\s+/g, " ").trim(),
      });
    }
    return (satirlar[0] as T | undefined) ?? null;
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    const t0 = Date.now();
    const result = await this.sayarak(() => this.stmt.all<T>());
    this.kontrol(Date.now() - t0, "all");
    maliyetEkle(this.context, result.meta);
    return result;
  }

  async run(): Promise<D1Result> {
    const t0 = Date.now();
    const result = await this.sayarak(() => this.stmt.run());
    this.kontrol(Date.now() - t0, "run");
    maliyetEkle(this.context, result.meta);
    return result;
  }

  /**
   * Başarısız çağrıyı SAYAR ve YENİDEN FIRLATIR — yutmaz.
   *
   * Reddedilen sorgu (ör. D1 günlük okuma limiti) meta döndürmeden fırlıyor;
   * bu sarmalayıcı olmadan sayaç ona hiç dokunmuyordu ve kesinti bütçe
   * tablosunda "neredeyse hiç sorgu yok" diye görünüyordu (2026-09-11).
   */
  private async sayarak<R>(fn: () => Promise<R>): Promise<R> {
    try {
      return await fn();
    } catch (e) {
      hataEkle(this.context);
      throw e;
    }
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
          let result: D1Result[];
          try {
            result = await target.batch(gercek);
          } catch (e) {
            // Tek çağrı, tek hata — batch'teki ifade sayısı kadar değil.
            hataEkle(context);
            throw e;
          }
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
