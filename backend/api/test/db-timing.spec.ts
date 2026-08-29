/**
 * wrapD1 testleri — özellikle batch() sarmalayıcı açma davranışı.
 *
 * Regresyon bağlamı: wrapD1().prepare() bir TimedStatement döndürüyor ama
 * batch() bunları doğrudan D1'e geçiriyordu. D1 sarmalayıcıyı serileştiremeyip
 * "D1_ERROR: Malformed input: [{},{},...]" hatası veriyordu ve üretimde
 * /v1/istatistik/refresh tamamen çalışmıyordu (hata_log ile yakalandı).
 */
import { describe, it, expect, vi } from "vitest";
import { wrapD1 } from "../src/lib/db-timing.js";

/** prepare() ile üretilen nesneyi işaretleyen sahte D1. */
function sahteDb() {
  const batchArgs: unknown[][] = [];
  const db = {
    prepare: function mkStmt(sql: string, bound?: unknown[]): unknown {
      return {
        _gercek: true,
        sql,
        _bound: bound,
        bind: (...v: unknown[]) => mkStmt(sql, v),
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({ success: true }),
      };
    },
    batch: async (stmts: unknown[]) => {
      batchArgs.push(stmts);
      return stmts.map(() => ({ success: true }));
    },
  };
  return { db: db as never, batchArgs };
}

describe("wrapD1", () => {
  it("batch() sarmalayıcıları açıp GERÇEK statement'ları D1'e geçirir", async () => {
    const { db, batchArgs } = sahteDb();
    const w = wrapD1(db, "test");
    const stmts = [
      w.prepare("INSERT INTO a VALUES (?)").bind(1),
      w.prepare("INSERT INTO a VALUES (?)").bind(2),
    ];
    await w.batch(stmts as never);

    expect(batchArgs).toHaveLength(1);
    // Kritik: D1'e ulaşan her nesne sahte D1'in ürettiği gerçek statement olmalı,
    // TimedStatement sarmalayıcısı DEĞİL.
    for (const s of batchArgs[0]!) {
      expect((s as { _gercek?: boolean })._gercek).toBe(true);
    }
  });

  it("bind() zincirinden sonra da gerçek statement açılır", async () => {
    const { db, batchArgs } = sahteDb();
    const w = wrapD1(db, "test");
    await w.batch([w.prepare("X").bind(1)] as never);
    expect((batchArgs[0]![0] as { _bound?: unknown[] })._bound).toEqual([1]);
  });

  it("zaten gerçek olan statement'ları bozmadan geçirir", async () => {
    const { db, batchArgs } = sahteDb();
    const w = wrapD1(db, "test");
    const ham = { _gercek: true, sql: "Y" };
    await w.batch([ham] as never);
    expect(batchArgs[0]![0]).toBe(ham);
  });

  it("prepare().run() normal çalışmaya devam eder", async () => {
    const { db } = sahteDb();
    const w = wrapD1(db, "test");
    await expect(w.prepare("Z").bind(1).run()).resolves.toEqual({ success: true });
  });

  it("batch sonucu çağırana aynen döner", async () => {
    const { db } = sahteDb();
    const w = wrapD1(db, "test");
    const r = await w.batch([w.prepare("A"), w.prepare("B")] as never);
    expect(r).toHaveLength(2);
  });
});
