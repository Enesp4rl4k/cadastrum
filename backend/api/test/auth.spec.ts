/**
 * Auth integration testleri — canlı deployed API'ye karşı.
 */
import { describe, it, expect } from "vitest";

const API = process.env.CADASTRUM_API ?? "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

function rastgeleEmail() {
  return `t${Date.now()}-${Math.random().toString(36).slice(2, 6)}@cadastrum-test.com`;
}

async function kayitOl(email = rastgeleEmail(), sifre = "abcdef12", ad?: string) {
  const res = await fetch(`${API}/auth/kayit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, sifre, ad }),
  });
  return { res, body: await res.json() as any, email, sifre };
}

describe("auth.kayit", () => {
  it("yeni kullanıcı kaydeder + token döner", async () => {
    const { res, body, email } = await kayitOl();
    expect(res.status).toBe(200);
    expect(body.token).toBeTruthy();
    expect(body.kullanici.email).toBe(email);
    expect(body.kullanici.tier).toBe("free");
    expect(body.kullanici.emailDogrulandi).toBe(false);
  });

  it("aynı email tekrar kayıt olmaz (409)", async () => {
    const { email, sifre } = await kayitOl();
    const r2 = await fetch(`${API}/auth/kayit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, sifre }),
    });
    expect(r2.status).toBe(409);
  });

  it("kısa şifre 400 döner", async () => {
    const r = await fetch(`${API}/auth/kayit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: rastgeleEmail(), sifre: "kisa" }),
    });
    expect(r.status).toBe(400);
  });

  it("geçersiz email 400 döner", async () => {
    const r = await fetch(`${API}/auth/kayit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "geçersiz", sifre: "abcdef12" }),
    });
    expect(r.status).toBe(400);
  });
});

describe("auth.giris", () => {
  it("doğru şifre ile başarılı giriş", async () => {
    const { email, sifre } = await kayitOl();
    const r = await fetch(`${API}/auth/giris`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, sifre }),
    });
    expect(r.status).toBe(200);
    const b: any = await r.json();
    expect(b.token).toBeTruthy();
  });

  it("yanlış şifre 401", async () => {
    const { email } = await kayitOl();
    const r = await fetch(`${API}/auth/giris`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, sifre: "yanlissifre" }),
    });
    expect(r.status).toBe(401);
  });
});

describe("auth.ben (JWT verify)", () => {
  it("geçerli token ile kullanıcı bilgisi döner", async () => {
    const { body, email } = await kayitOl();
    const r = await fetch(`${API}/auth/ben`, {
      headers: { Authorization: `Bearer ${body.token}` },
    });
    expect(r.status).toBe(200);
    const b: any = await r.json();
    expect(b.kullanici.email).toBe(email);
  });

  it("token yoksa 401", async () => {
    const r = await fetch(`${API}/auth/ben`);
    expect(r.status).toBe(401);
  });

  it("geçersiz token 401", async () => {
    const r = await fetch(`${API}/auth/ben`, {
      headers: { Authorization: "Bearer fake-token-asdf" },
    });
    expect(r.status).toBe(401);
  });
});

describe("auth.sifre-sifirla (enumeration safe)", () => {
  it("var olmayan email için bile 200 döner", async () => {
    const r = await fetch(`${API}/auth/sifre-sifirla`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "yok@yok.com" }),
    });
    expect(r.status).toBe(200);
    const b: any = await r.json();
    expect(b.gonderildi).toBe(true);
  });
});
