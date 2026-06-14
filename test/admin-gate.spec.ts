/**
 * Admin JWT decode + isAdmin gate testleri.
 */
import { describe, it, expect } from "vitest";
import { decodeJwt } from "../src/lib/lisans";

// Hazır JWT'ler — header.payload.signature (signature dummy)
// Payload generator: btoa(JSON.stringify({...}))
function jwtBuild(payload: Record<string, unknown>): string {
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.dummysignature`;
}

describe("decodeJwt", () => {
  it("admin=1 payload doğru parse eder", () => {
    const token = jwtBuild({ sub: 42, admin: 1, tier: "kurumsal" });
    const p = decodeJwt(token);
    expect(p?.sub).toBe(42);
    expect(p?.admin).toBe(1);
    expect(p?.tier).toBe("kurumsal");
  });

  it("admin=0 payload — admin değil", () => {
    const token = jwtBuild({ sub: 7, admin: 0 });
    const p = decodeJwt(token);
    expect(p?.admin).toBe(0);
  });

  it("admin claim'i yoksa undefined", () => {
    const token = jwtBuild({ sub: 1 });
    const p = decodeJwt(token);
    expect(p?.admin).toBeUndefined();
  });

  it("null / undefined / boş string → null", () => {
    expect(decodeJwt(null)).toBeNull();
    expect(decodeJwt(undefined)).toBeNull();
    expect(decodeJwt("")).toBeNull();
  });

  it("geçersiz format (2 parça) → null", () => {
    expect(decodeJwt("header.payload")).toBeNull();
  });

  it("geçersiz base64 → null", () => {
    expect(decodeJwt("aaa.!!!.ccc")).toBeNull();
  });

  it("exp süresi geçmişse null döner", () => {
    const gecmis = Math.floor(Date.now() / 1000) - 3600; // 1 saat önce
    const token = jwtBuild({ sub: 1, admin: 1, exp: gecmis });
    expect(decodeJwt(token)).toBeNull();
  });

  it("exp süresi gelecekse parse eder", () => {
    const gelecek = Math.floor(Date.now() / 1000) + 3600;
    const token = jwtBuild({ sub: 1, admin: 1, exp: gelecek });
    const p = decodeJwt(token);
    expect(p?.admin).toBe(1);
  });
});
