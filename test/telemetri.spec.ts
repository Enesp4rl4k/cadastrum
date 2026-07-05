import { describe, it, expect } from "vitest";
import { hataPayloadu } from "../src/lib/telemetri";

describe("hataPayloadu", () => {
  it("Error'dan mesaj + stack çıkarır", () => {
    const p = hataPayloadu("sidepanel", new Error("patladı"), { parselId: 7 }, "0.3.2");
    expect(p.kaynak).toBe("sidepanel");
    expect(p.mesaj).toBe("patladı");
    expect(p.stack).toContain("patladı");
    expect(p.surum).toBe("0.3.2");
    expect(p.meta).toEqual({ parselId: 7 });
    expect(typeof p.ts).toBe("number");
  });

  it("string hatayı Error'a sarar", () => {
    const p = hataPayloadu("sw", "ağ hatası");
    expect(p.mesaj).toBe("ağ hatası");
    expect(p.surum).toBeNull();
    expect(p.meta).toBeNull();
  });

  it("uzun mesaj/stack'i kırpar", () => {
    const uzun = "x".repeat(5000);
    const err = new Error(uzun);
    err.stack = "y".repeat(20000);
    const p = hataPayloadu("sw", err);
    expect(p.mesaj.length).toBeLessThanOrEqual(2000);
    expect(p.stack!.length).toBeLessThanOrEqual(8000);
  });

  it("non-Error nesneyi JSON'a çevirir", () => {
    const p = hataPayloadu("sw", { kod: 500 });
    expect(p.mesaj).toContain("500");
  });
});
