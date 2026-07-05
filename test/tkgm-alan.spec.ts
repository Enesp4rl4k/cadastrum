import { describe, expect, it } from "vitest";
import { parseTkgmAlan } from "../src/lib/tkgm-api";

describe("parseTkgmAlan", () => {
  it("TR format: ondalık virgül", () => {
    expect(parseTkgmAlan("260,08")).toBeCloseTo(260.08, 5);
  });

  it("TR format: binlik nokta + ondalık virgül", () => {
    expect(parseTkgmAlan("4.036,38")).toBeCloseTo(4036.38, 5);
  });

  it("EN format (lat/lng endpoint): ondalık nokta — 100x bug olmamalı", () => {
    expect(parseTkgmAlan("260.08")).toBeCloseTo(260.08, 5);
    expect(parseTkgmAlan("4036.38")).toBeCloseTo(4036.38, 5);
  });

  it("number tipi olduğu gibi kalır", () => {
    expect(parseTkgmAlan(260.08)).toBeCloseTo(260.08, 5);
  });

  it("TR binlik: son grup 3 hane", () => {
    expect(parseTkgmAlan("26.008")).toBe(26008);
    expect(parseTkgmAlan("1.234.567")).toBe(1234567);
  });

  it("boş / geçersiz → 0", () => {
    expect(parseTkgmAlan(null)).toBe(0);
    expect(parseTkgmAlan("")).toBe(0);
    expect(parseTkgmAlan("abc")).toBe(0);
  });
});
