import { describe, it, expect } from "vitest";
import { wkt4326To3857 } from "../src/lib/eplan-api";

describe("eplan-api", () => {
  it("wkt4326To3857 koordinatları Web Mercator'a çevirir", () => {
    const wkt = "POLYGON((32.8 39.9, 32.81 39.9, 32.81 39.91, 32.8 39.91, 32.8 39.9))";
    const out = wkt4326To3857(wkt);
    expect(out.startsWith("POLYGON((")).toBe(true);
    expect(out).not.toContain("32.8 39.9");
    const first = out.match(/POLYGON\(\(([^,]+)/)?.[1]?.trim().split(/\s+/).map(Number);
    expect(first?.[0]).toBeGreaterThan(1_000_000);
    expect(first?.[1]).toBeGreaterThan(1_000_000);
  });
});
