/**
 * Portföy API integration tests using isolated in-memory Hono test harness.
 */
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";

const env = createMockEnv();

function rastgeleEmail() {
  return `portfoy-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@cadastrum-test.com`;
}

async function kayitOlVeTokenAl(): Promise<string> {
  const email = rastgeleEmail();
  const res = await app.request(
    "/v1/auth/kayit",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, sifre: "test1234", ad: "Test Kullanici" }),
    },
    env
  );
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error(`Kayıt başarısız: ${JSON.stringify(body)}`);
  return body.token;
}

describe("portfoy API", () => {
  it("JWT olmadan GET 401 döner", async () => {
    const res = await app.request("/v1/portfoy", { method: "GET" }, env);
    expect(res.status).toBe(401);
  });

  it("JWT olmadan POST 401 döner", async () => {
    const res = await app.request(
      "/v1/portfoy",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsel_key: "123:456:789" }),
      },
      env
    );
    expect(res.status).toBe(401);
  });

  it("GET boş liste döner (yeni kullanıcı)", async () => {
    const token = await kayitOlVeTokenAl();
    const res = await app.request(
      "/v1/portfoy",
      {
        headers: { Authorization: `Bearer ${token}` },
      },
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { portfoy: unknown[]; toplam: number };
    expect(Array.isArray(body.portfoy)).toBe(true);
    expect(body.toplam).toBe(0);
  });

  it("POST parsel ekler ve ID döner", async () => {
    const token = await kayitOlVeTokenAl();
    const res = await app.request(
      "/v1/portfoy",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          parsel_key: "100001:1234:5",
          il_ad: "İstanbul",
          ilce_ad: "Beykoz",
          mahalle_ad: "Kavacık",
          ada_no: "1234",
          parsel_no: "5",
          alan_m2: 500,
          fiyat_tahmini: 5000000,
          not_metni: "Test parseli",
          etiket: "izleme",
        }),
      },
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; id: number };
    expect(body.ok).toBe(true);
    expect(typeof body.id).toBe("number");
  });

  it("POST → GET: eklenen parsel listede görünür", async () => {
    const token = await kayitOlVeTokenAl();

    // Ekle
    await app.request(
      "/v1/portfoy",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          parsel_key: "100002:111:22",
          il_ad: "Ankara",
          ilce_ad: "Çankaya",
        }),
      },
      env
    );

    // Listele
    const res = await app.request(
      "/v1/portfoy",
      {
        headers: { Authorization: `Bearer ${token}` },
      },
      env
    );
    const body = (await res.json()) as { portfoy: Array<{ parsel_key: string }>; toplam: number };
    expect(body.toplam).toBe(1);
    expect(body.portfoy[0]?.parsel_key).toBe("100002:111:22");
  });

  it("POST upsert: aynı parsel_key iki kez eklenmez, güncellenir", async () => {
    const token = await kayitOlVeTokenAl();
    const payload = { parsel_key: "100003:333:44", il_ad: "İzmir", fiyat_tahmini: 1000000 };

    await app.request(
      "/v1/portfoy",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      },
      env
    );
    await app.request(
      "/v1/portfoy",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...payload, fiyat_tahmini: 2000000 }),
      },
      env
    );

    const res = await app.request(
      "/v1/portfoy",
      {
        headers: { Authorization: `Bearer ${token}` },
      },
      env
    );
    const body = (await res.json()) as { toplam: number };
    // Upsert: iki POST sonrası hala 1 kayıt
    expect(body.toplam).toBe(1);
  });

  it("PATCH: not_metni ve etiket güncellenir", async () => {
    const token = await kayitOlVeTokenAl();

    // Ekle
    const postRes = await app.request(
      "/v1/portfoy",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ parsel_key: "100004:555:6" }),
      },
      env
    );
    const postBody = (await postRes.json()) as { id: number };
    const id = postBody.id;

    // Güncelle
    const patchRes = await app.request(
      `/v1/portfoy/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ not_metni: "Güncellenmiş not", etiket: "firsat" }),
      },
      env
    );
    expect(patchRes.status).toBe(200);
    const patchBody = (await patchRes.json()) as { ok: boolean };
    expect(patchBody.ok).toBe(true);
  });

  it("DELETE: kayıt silinir", async () => {
    const token = await kayitOlVeTokenAl();

    const postRes = await app.request(
      "/v1/portfoy",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ parsel_key: "100005:777:8" }),
      },
      env
    );
    const postBody = (await postRes.json()) as { id: number };
    const id = postBody.id;

    const delRes = await app.request(
      `/v1/portfoy/${id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
      env
    );
    expect(delRes.status).toBe(200);

    // Liste boş olmalı
    const listRes = await app.request(
      "/v1/portfoy",
      {
        headers: { Authorization: `Bearer ${token}` },
      },
      env
    );
    const listBody = (await listRes.json()) as { toplam: number };
    expect(listBody.toplam).toBe(0);
  });

  it("DELETE başkasının kaydına 404 döner", async () => {
    const token1 = await kayitOlVeTokenAl();
    const token2 = await kayitOlVeTokenAl();

    // token1 ekle
    const postRes = await app.request(
      "/v1/portfoy",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token1}` },
        body: JSON.stringify({ parsel_key: "100006:999:0" }),
      },
      env
    );
    const { id } = (await postRes.json()) as { id: number };

    // token2 silmeye çalış
    const delRes = await app.request(
      `/v1/portfoy/${id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token2}` },
      },
      env
    );
    expect(delRes.status).toBe(404);
  });

  it("geçersiz parsel_key formatı 400 döner", async () => {
    const token = await kayitOlVeTokenAl();
    const res = await app.request(
      "/v1/portfoy",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ parsel_key: "gecersiz-format" }),
      },
      env
    );
    expect(res.status).toBe(400);
  });
});
