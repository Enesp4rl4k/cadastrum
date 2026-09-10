import { describe, it, expect } from "vitest";
import { hataPayloadu, piiFiltrele, metaSanitize } from "../src/lib/telemetri";

describe("hataPayloadu & PII sanitization", () => {
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

  it("piiFiltrele: JWT, email, telefon, secret ve parsel koordinatlarını temizler", () => {
    const ham = "Kullanıcı test.user@example.com (0532 111 22 33), token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c ve URL: /v1/parsel?lat=41.012345&lng=29.987654&secret=mySuperSecretKey123";
    const filtrelenmis = piiFiltrele(ham);

    expect(filtrelenmis).not.toContain("test.user@example.com");
    expect(filtrelenmis).toContain("[REDACTED_EMAIL]");
    expect(filtrelenmis).not.toContain("0532 111 22 33");
    expect(filtrelenmis).toContain("[REDACTED_PHONE]");
    expect(filtrelenmis).not.toContain("eyJhbGci");
    expect(filtrelenmis).toContain("[REDACTED_JWT]");
    expect(filtrelenmis).not.toContain("41.012345");
    expect(filtrelenmis).toContain("lat=[REDACTED_COORD]");
    expect(filtrelenmis).not.toContain("mySuperSecretKey123");
    expect(filtrelenmis).toContain("secret=[REDACTED_SECRET]");
  });

  it("hataPayloadu: stack ve meta içindeki hassas verileri otomatik maskeler", () => {
    const err = new Error("İstek başarısız: https://api.cadastrum.com/auth?apiKey=abcdef12345678");
    err.stack = "Error at https://api.cadastrum.com/auth?token=abcdef12345678&lat=40.99&lng=28.99\n    at fetch (app.js:10)";
    
    const payload = hataPayloadu("service-worker", err, {
      kullaniciEmail: "admin@cadastrum.com",
      apiSecret: "super_secret_xyz123",
      detay: { telefon: "05554443322" },
    });

    expect(payload.mesaj).toContain("apiKey=[REDACTED_SECRET]");
    expect(payload.stack).toContain("token=[REDACTED_SECRET]");
    expect(payload.stack).toContain("lat=[REDACTED_COORD]");
    expect(payload.meta).toEqual({
      kullaniciEmail: "[REDACTED_EMAIL]",
      apiSecret: "[REDACTED_KEY]",
      detay: { telefon: "[REDACTED_PHONE]" },
    });
  });
});

