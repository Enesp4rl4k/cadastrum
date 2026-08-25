import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Env } from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MockD1PreparedStatement {
  private boundValues: any[] = [];

  constructor(
    private db: DatabaseSync,
    private sql: string
  ) {}

  bind(...values: any[]) {
    const clone = new MockD1PreparedStatement(this.db, this.sql);
    clone.boundValues = values.map((v) => (v === undefined ? null : v));
    return clone;
  }

  async first<T = unknown>(colName?: string): Promise<T | null> {
    try {
      const stmt = this.db.prepare(this.sql);
      const row = stmt.get(...this.boundValues) as any;
      if (!row) return null;
      if (colName) return (row[colName] ?? null) as T;
      return row as T;
    } catch (e: any) {
      console.error("[MockD1 first error]", this.sql, this.boundValues, e.message);
      throw e;
    }
  }

  async all<T = unknown>(): Promise<{ results: T[]; success: boolean; meta: any }> {
    try {
      const stmt = this.db.prepare(this.sql);
      const rows = stmt.all(...this.boundValues) as T[];
      return {
        results: rows,
        success: true,
        meta: { changes: 0, last_row_id: 0, served_by: "mock-d1" },
      };
    } catch (e: any) {
      console.error("[MockD1 all error]", this.sql, this.boundValues, e.message);
      throw e;
    }
  }

  async run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }> {
    try {
      const stmt = this.db.prepare(this.sql);
      const info = stmt.run(...this.boundValues);
      return {
        success: true,
        meta: {
          changes: Number(info.changes),
          last_row_id: Number(info.lastInsertRowid),
        },
      };
    } catch (e: any) {
      console.error("[MockD1 run error]", this.sql, this.boundValues, e.message);
      throw e;
    }
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    const res = await this.all<any>();
    return res.results.map((r) => Object.values(r)) as unknown as T[];
  }
}

export class MockD1Database {
  public db: DatabaseSync;

  constructor() {
    this.db = new DatabaseSync(":memory:");
    this.initSchema();
  }

  private initSchema() {
    const dbDir = path.resolve(__dirname, "../src/db");
    if (!fs.existsSync(dbDir)) return;

    // First load schema.sql
    const schemaFile = path.join(dbDir, "schema.sql");
    if (fs.existsSync(schemaFile)) {
      const sql = fs.readFileSync(schemaFile, "utf-8");
      this.executeSqlScript(sql);
    }

    // Then load migrations in sorted order
    const files = fs
      .readdirSync(dbDir)
      .filter((f) => f.endsWith(".sql") && f !== "schema.sql" && !f.includes("template") && !f.startsWith("migrate-"))
      .sort();

    for (const file of files) {
      try {
        const sql = fs.readFileSync(path.join(dbDir, file), "utf-8");
        this.executeSqlScript(sql);
      } catch {
        // Non-fatal migration error
      }
    }
  }

  private executeSqlScript(script: string) {
    const cleanSql = script
      .replace(/--.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

    const statements = cleanSql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      try {
        this.db.exec(stmt);
      } catch (e: any) {
        // Only log if not already exists error
        if (!e.message?.includes("already exists") && !e.message?.includes("duplicate column")) {
          console.warn("[MockD1 schema warning]", stmt.slice(0, 60), e.message);
        }
      }
    }
  }

  prepare(sql: string): MockD1PreparedStatement {
    return new MockD1PreparedStatement(this.db, sql);
  }

  async batch(stmts: MockD1PreparedStatement[]) {
    const results = [];
    for (const stmt of stmts) {
      results.push(await stmt.run());
    }
    return results;
  }

  async exec(sql: string) {
    this.executeSqlScript(sql);
    return { count: 1, duration: 0 };
  }
}

export function createMockEnv(overrides: Partial<Env> = {}): Env {
  const mockDb = new MockD1Database();

  const mockKv: any = {
    get: async () => null,
    put: async () => {},
    delete: async () => {},
  };

  const mockR2: any = {
    get: async () => null,
    put: async () => {},
    delete: async () => {},
  };

  return {
    DB: mockDb as unknown as D1Database,
    TUCBS_TILES: mockR2,
    RATE_LIMIT_KV: mockKv,
    SCRAPER_API_SECRET: "test-scraper-secret",
    SEED_SECRET: "test-seed-secret",
    STATS_SECRET: "test-stats-secret",
    JWT_SECRET: "test-jwt-secret-key-32-chars-long!",
    ENVIRONMENT: "development",
    RATE_LIMIT_PER_HOUR: "1000",
    ...overrides,
  };
}
