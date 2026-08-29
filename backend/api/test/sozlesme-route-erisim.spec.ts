/**
 * SÖZLEŞME TESTİ — route erişilebilirliği.
 *
 * NEDEN: `app.route("/v1/admin", adminRoutes)` içindeki
 * `admin.use("*", jwtMiddleware)` TÜM /v1/admin/* yollarına JWT zorunluluğu
 * koyuyor. Bearer-secret ile korunan üç endpoint bu mount'tan SONRA
 * tanımlanmıştı, dolayısıyla istek onların handler'ına HİÇ ULAŞMIYORDU —
 * JWT middleware 401 döndürüyordu.
 *
 * Bu hatanın sinsiliği: dışarıdan bakınca "yetkisiz" gibi görünüyor, yani
 * doğru davranıştan ayırt edilemiyor. Aylarca /v1/admin/pipeline-health
 * erişilemez kaldı ve kimse fark etmedi.
 *
 * AYIRT EDİCİ SİNYAL: iki durum FARKLI gövde döndürüyor.
 *   - handler'a ulaştı, secret yanlış  → {"error":"Unauthorized"}   (bizim kod)
 *   - mount gölgeledi, handler'a hiç ulaşmadı → {"hata":"Geçersiz token"} (JWT)
 * Test bu ayrımı sabitliyor: gövde "error" anahtarını taşımalı.
 */
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";
import { createMockEnv } from "./test-helper.js";

/** Bearer-secret ile korunan, /v1/admin altındaki endpoint'ler. */
const KORUMALI_ADMIN_YOLLARI = [
  { yol: "/v1/admin/pipeline-health", method: "GET", secret: "STATS_SECRET" },
  { yol: "/v1/admin/kaynak-testi", method: "GET", secret: "STATS_SECRET" },
  { yol: "/v1/admin/zenginlestir", method: "POST", secret: "SCRAPER_API_SECRET" },
  { yol: "/v1/admin/milli-emlak-tara", method: "POST", secret: "SCRAPER_API_SECRET" },
  { yol: "/v1/admin/hepsiemlak-tara", method: "POST", secret: "SCRAPER_API_SECRET" },
] as const;

describe("sözleşme: /v1/admin bearer route'ları JWT mount'u tarafından gölgelenmiyor", () => {
  it.each(KORUMALI_ADMIN_YOLLARI)(
    "$method $yol → kendi handler'ına ulaşıyor",
    async ({ yol, method }) => {
      const env = createMockEnv();
      const res = await app.request(yol, { method }, env);

      // Yetkisiz olmalı (secret yok) AMA bizim handler'ımızdan gelmeli.
      expect(res.status).toBe(401);
      const govde = (await res.json()) as Record<string, unknown>;

      // Bizim handler: { error: "Unauthorized" }
      // JWT middleware (gölgeleme): { hata: "Geçersiz token" }
      expect(
        govde.error,
        `${yol} JWT middleware tarafından gölgeleniyor — handler'a ulaşılamıyor. ` +
          `Bu endpoint app.route("/v1/admin", adminRoutes) mount'undan ÖNCE tanımlanmalı.`,
      ).toBe("Unauthorized");
      expect(govde.hata).toBeUndefined();
    },
  );

  it("doğru secret ile handler gerçekten çalışıyor", async () => {
    // Erişilebilirlik yetmez — handler'ın iş yaptığını da görmeliyiz.
    const env = createMockEnv();
    const res = await app.request(
      "/v1/admin/pipeline-health",
      { method: "GET", headers: { Authorization: `Bearer ${env.STATS_SECRET}` } },
      env,
    );
    // Boş test DB'sinde kontroller başarısız olur (503) ama gövde gerçek
    // health raporu olmalı — yani handler koştu.
    const govde = (await res.json()) as Record<string, unknown>;
    expect(Array.isArray(govde.kontroller)).toBe(true);
    expect(typeof govde.saglikli).toBe("boolean");
  });

  it("JWT korumalı admin route'ları JWT davranışını KORUYOR", async () => {
    // Karşı taraf: gerçekten JWT isteyen admin route'ları bearer secret'a
    // açılmamalı. Düzeltmenin kapsamı taşmadığını sabitliyor.
    const env = createMockEnv();
    const res = await app.request("/v1/admin/ozet", { method: "GET" }, env);
    expect(res.status).toBe(401);
    const govde = (await res.json()) as Record<string, unknown>;
    expect(govde.hata).toBeDefined(); // JWT middleware gövdesi
  });
});
