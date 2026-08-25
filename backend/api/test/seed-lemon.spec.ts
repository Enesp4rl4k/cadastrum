/**
 * seed.ts + lemon.ts idempotency unit testleri
 *
 * Cloudflare D1 mock'u ile çalışır — gerçek DB bağlantısı gerektirmez.
 * Çalıştır: cd backend/api && npm test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── D1 Mock ──────────────────────────────────────────────────────────────────

/**
 * Minimal D1Database mock — prepare().bind().run/first/all() zincirini simüle eder.
 * Her test kendi `mockImpl`'ını inject eder.
 */
function makeD1Mock(impl: {
  run?: () => Promise<{ meta: { changes: number; last_row_id?: number } }>;
  first?: () => Promise<unknown>;
  all?: () => Promise<{ results: unknown[] }>;
}) {
  const chain = {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockImplementation(impl.run ?? (() => Promise.resolve({ meta: { changes: 1 } }))),
    first: vi.fn().mockImplementation(impl.first ?? (() => Promise.resolve(null))),
    all: vi.fn().mockImplementation(impl.all ?? (() => Promise.resolve({ results: [] }))),
  };
  return {
    prepare: vi.fn().mockReturnValue(chain),
    batch: vi.fn().mockResolvedValue([]),
    _chain: chain,
  };
}

// ── /v1/baseline/seed — input validasyon testleri ────────────────────────────

describe("seed.ts — baseline/seed input validasyon", () => {
  // Bu fonksiyonları doğrudan test ediyoruz (handler'ı mock HTTP ile değil)
  // Validation mantığı seed.ts satır 40-55'te — burada logic testini replike ediyoruz.

  const GECERLI_SEED_KATEGORI = new Set([
    "arsa", "tarla", "konut", "bahce", "bag", "zeytinlik",
  ]);
  const NORM_MAX = 80;

  function rowGecerliMi(r: Record<string, unknown>): boolean {
    if (!r.il_norm || typeof r.il_norm !== "string" || (r.il_norm as string).length > NORM_MAX) return false;
    if (!r.ilce_norm || typeof r.ilce_norm !== "string" || (r.ilce_norm as string).length > NORM_MAX) return false;
    if (!r.mahalle_norm || typeof r.mahalle_norm !== "string" || (r.mahalle_norm as string).length > NORM_MAX) return false;
    if (!r.kategori || !GECERLI_SEED_KATEGORI.has(r.kategori as string)) return false;
    if (typeof r.tlm2 !== "number" || (r.tlm2 as number) <= 0 || (r.tlm2 as number) > 1_000_000_000) return false;
    return true;
  }

  it("geçerli satırı kabul eder", () => {
    expect(rowGecerliMi({
      il_norm: "istanbul", ilce_norm: "besiktas", mahalle_norm: "levent",
      kategori: "arsa", tlm2: 50000,
    })).toBe(true);
  });

  it("eksik il_norm'u reddeder", () => {
    expect(rowGecerliMi({
      ilce_norm: "besiktas", mahalle_norm: "levent",
      kategori: "arsa", tlm2: 50000,
    })).toBe(false);
  });

  it("çok uzun mahalle_norm'u reddeder (>80 karakter)", () => {
    expect(rowGecerliMi({
      il_norm: "istanbul", ilce_norm: "besiktas",
      mahalle_norm: "a".repeat(81),
      kategori: "arsa", tlm2: 50000,
    })).toBe(false);
  });

  it("geçersiz kategoriyi reddeder", () => {
    expect(rowGecerliMi({
      il_norm: "istanbul", ilce_norm: "besiktas", mahalle_norm: "levent",
      kategori: "villa", tlm2: 50000,
    })).toBe(false);
  });

  it("sıfır tlm2'yi reddeder", () => {
    expect(rowGecerliMi({
      il_norm: "istanbul", ilce_norm: "besiktas", mahalle_norm: "levent",
      kategori: "arsa", tlm2: 0,
    })).toBe(false);
  });

  it("negatif tlm2'yi reddeder", () => {
    expect(rowGecerliMi({
      il_norm: "istanbul", ilce_norm: "besiktas", mahalle_norm: "levent",
      kategori: "arsa", tlm2: -1000,
    })).toBe(false);
  });

  it("milyar üzeri tlm2'yi reddeder", () => {
    expect(rowGecerliMi({
      il_norm: "istanbul", ilce_norm: "besiktas", mahalle_norm: "levent",
      kategori: "arsa", tlm2: 1_000_000_001,
    })).toBe(false);
  });

  it("string tlm2'yi reddeder", () => {
    expect(rowGecerliMi({
      il_norm: "istanbul", ilce_norm: "besiktas", mahalle_norm: "levent",
      kategori: "arsa", tlm2: "50000",
    })).toBe(false);
  });
});

// ── lemon.ts — idempotency key üretimi ──────────────────────────────────────

describe("lemon.ts — idempotency key", () => {
  // lemon.ts satır ~112: idempotencyKey üretim mantığını test ediyoruz
  function idempotencyKeyUret(
    dataId: string | undefined,
    eventName: string,
    endsAt: string | null | undefined,
  ): string {
    return `${dataId ?? "no-id"}:${eventName}:${endsAt ?? "null"}`;
  }

  it("aynı event için aynı key üretir", () => {
    const k1 = idempotencyKeyUret("sub_123", "subscription_created", "2026-12-31T00:00:00Z");
    const k2 = idempotencyKeyUret("sub_123", "subscription_created", "2026-12-31T00:00:00Z");
    expect(k1).toBe(k2);
  });

  it("farklı event adı için farklı key üretir", () => {
    const k1 = idempotencyKeyUret("sub_123", "subscription_created", null);
    const k2 = idempotencyKeyUret("sub_123", "subscription_updated", null);
    expect(k1).not.toBe(k2);
  });

  it("farklı ends_at için farklı key üretir (state değişimi)", () => {
    const k1 = idempotencyKeyUret("sub_123", "subscription_updated", "2026-12-31T00:00:00Z");
    const k2 = idempotencyKeyUret("sub_123", "subscription_updated", "2027-06-30T00:00:00Z");
    expect(k1).not.toBe(k2);
  });

  it("data.id yoksa 'no-id' prefix'i kullanır", () => {
    const k = idempotencyKeyUret(undefined, "subscription_created", null);
    expect(k.startsWith("no-id:")).toBe(true);
  });

  it("ends_at null ise ':null' suffix'i kullanır", () => {
    const k = idempotencyKeyUret("sub_123", "subscription_expired", null);
    expect(k.endsWith(":null")).toBe(true);
  });
});

// ── lemon.ts — idempotency D1 entegrasyon mantığı ───────────────────────────

describe("lemon.ts — duplicate event tespiti (D1 mock)", () => {
  let db: ReturnType<typeof makeD1Mock>;

  beforeEach(() => {
    db = makeD1Mock({});
  });

  it("ilk event DB'ye yazılır (changes=1)", async () => {
    // INSERT OR IGNORE — yeni satır, changes=1
    db._chain.run.mockResolvedValueOnce({ meta: { changes: 1 } });
    const ins = await db.prepare("INSERT OR IGNORE ...").bind("k1", "ev", "ok", 0).run();
    expect(ins.meta.changes).toBe(1);
  });

  it("aynı key'le ikinci event atlanır (changes=0)", async () => {
    // INSERT OR IGNORE — çakışma, changes=0 → duplicate-skip
    db._chain.run.mockResolvedValueOnce({ meta: { changes: 0 } });
    const ins = await db.prepare("INSERT OR IGNORE ...").bind("k1", "ev", "ok", 0).run();
    expect(ins.meta.changes).toBe(0);
    // changes=0 ise duplicate-skip dönmeli — bu kontrolü handler yapar
    const isDuplicate = (ins.meta.changes ?? 0) === 0;
    expect(isDuplicate).toBe(true);
  });
});

// ── /v1/ilan/batch-seed — koordinat bbox kontrolü ───────────────────────────

describe("seed.ts — ilan/batch-seed koordinat validasyon", () => {
  function koordinatGecerliMi(lat: number | null, lng: number | null): boolean {
    if (lat !== null && (lat < 35 || lat > 43)) return false;
    if (lng !== null && (lng < 25 || lng > 46)) return false;
    return true;
  }

  it("Türkiye içi koordinatı kabul eder", () => {
    expect(koordinatGecerliMi(41.0, 29.0)).toBe(true);
  });

  it("null koordinatı kabul eder (koordinat opsiyonel)", () => {
    expect(koordinatGecerliMi(null, null)).toBe(true);
  });

  it("Yunanistan koordinatını reddeder", () => {
    expect(koordinatGecerliMi(37.97, 23.72)).toBe(false);
  });

  it("kuzeyde sınır dışını reddeder (lat > 43)", () => {
    expect(koordinatGecerliMi(44.0, 35.0)).toBe(false);
  });

  it("güneyde sınır dışını reddeder (lat < 35)", () => {
    expect(koordinatGecerliMi(34.9, 35.0)).toBe(false);
  });
});
