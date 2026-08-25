/**
 * Portföy API — sunucu taraflı parsel kaydetme (Pro tier)
 *
 * Endpoint'ler (JWT Bearer zorunlu):
 *   GET    /v1/portfoy          → kullanıcının tüm portföy listesi
 *   POST   /v1/portfoy          → parsel ekle (body: PortfoyEkleBody)
 *   PATCH  /v1/portfoy/:id      → not / fiyat / etiket güncelle
 *   DELETE /v1/portfoy/:id      → parsel sil
 *   DELETE /v1/portfoy          → tüm portföyü temizle
 *
 * Pro tier lock: free kullanıcılar max 5 kayıt, Pro sınırsız.
 */
import { Hono } from "hono";
import { jwtMiddleware } from "./hesap.js";
import type { Env, AppVariables } from "../index.js";
import { log } from "../lib/logger.js";

type AppCtx = { Bindings: Env; Variables: AppVariables };

const portfoy = new Hono<AppCtx>();
portfoy.use("*", jwtMiddleware);

const FREE_MAX_KAYIT = 5;

interface PortfoyEkleBody {
  parsel_key: string;
  il_ad?: string | null;
  ilce_ad?: string | null;
  mahalle_ad?: string | null;
  ada_no?: string | null;
  parsel_no?: string | null;
  nitelik?: string | null;
  alan_m2?: number | null;
  lat?: number | null;
  lng?: number | null;
  fiyat_tahmini?: number | null;
  not_metni?: string | null;
  etiket?: "firsat" | "izleme" | "sahip" | null;
}

interface PortfoyGuncelleBody {
  not_metni?: string | null;
  fiyat_tahmini?: number | null;
  etiket?: "firsat" | "izleme" | "sahip" | null;
}

// ── GET /v1/portfoy ──────────────────────────────────────────────────────────
portfoy.get("/", async (c) => {
  const kullaniciId = c.get("kullaniciId");

  const kayitlar = await c.env.DB.prepare(
    `SELECT id, parsel_key, il_ad, ilce_ad, mahalle_ad, ada_no, parsel_no,
            nitelik, alan_m2, lat, lng, fiyat_tahmini, not_metni, etiket,
            eklendi, guncellendi
     FROM portfoy
     WHERE kullanici_id = ?
     ORDER BY eklendi DESC
     LIMIT 200`,
  ).bind(kullaniciId).all<Record<string, unknown>>();

  return c.json({
    portfoy: kayitlar.results ?? [],
    toplam: (kayitlar.results ?? []).length,
  });
});

// ── POST /v1/portfoy ─────────────────────────────────────────────────────────
portfoy.post("/", async (c) => {
  const kullaniciId = c.get("kullaniciId");
  const tier = c.get("tier") as string;

  let body: PortfoyEkleBody;
  try {
    body = await c.req.json<PortfoyEkleBody>();
  } catch {
    return c.json({ hata: "Geçersiz JSON" }, 400);
  }

  if (!body.parsel_key || typeof body.parsel_key !== "string") {
    return c.json({ hata: "parsel_key zorunlu" }, 400);
  }

  // parsel_key format kontrolü: "{mahalleKodu}:{adaNo}:{parselNo}"
  if (!/^\d+:\d+:\d+$/.test(body.parsel_key)) {
    return c.json({ hata: "Geçersiz parsel_key formatı" }, 400);
  }

  // Free tier max limit kontrolü
  if (tier === "free") {
    const sayim = await c.env.DB.prepare(
      "SELECT COUNT(*) as n FROM portfoy WHERE kullanici_id = ?",
    ).bind(kullaniciId).first<{ n: number }>();

    if ((sayim?.n ?? 0) >= FREE_MAX_KAYIT) {
      return c.json(
        { hata: `Free planda en fazla ${FREE_MAX_KAYIT} portföy kaydı olabilir. Pro'ya geç.`, kod: "limit_asild" },
        403,
      );
    }
  }

  try {
    const sonuc = await c.env.DB.prepare(
      `INSERT INTO portfoy
         (kullanici_id, parsel_key, il_ad, ilce_ad, mahalle_ad, ada_no, parsel_no,
          nitelik, alan_m2, lat, lng, fiyat_tahmini, not_metni, etiket)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(kullanici_id, parsel_key) DO UPDATE SET
         fiyat_tahmini = excluded.fiyat_tahmini,
         not_metni     = excluded.not_metni,
         etiket        = excluded.etiket,
         guncellendi   = unixepoch()
       RETURNING id`,
    ).bind(
      kullaniciId,
      body.parsel_key,
      body.il_ad ?? null,
      body.ilce_ad ?? null,
      body.mahalle_ad ?? null,
      body.ada_no ?? null,
      body.parsel_no ?? null,
      body.nitelik ?? null,
      body.alan_m2 ?? null,
      body.lat ?? null,
      body.lng ?? null,
      body.fiyat_tahmini ?? null,
      body.not_metni ?? null,
      body.etiket ?? null,
    ).first<{ id: number }>();

    log.info("portfoy.ekle", { kullaniciId, parsel_key: body.parsel_key });
    return c.json({ ok: true, id: sonuc?.id });
  } catch (e) {
    log.error("portfoy.ekle.hata", { hata: e instanceof Error ? e.message : String(e) });
    return c.json({ hata: "Kayıt başarısız" }, 500);
  }
});

// ── PATCH /v1/portfoy/:id ────────────────────────────────────────────────────
portfoy.patch("/:id", async (c) => {
  const kullaniciId = c.get("kullaniciId");
  const id = Number(c.req.param("id"));

  if (!id || isNaN(id)) return c.json({ hata: "Geçersiz id" }, 400);

  let body: PortfoyGuncelleBody;
  try {
    body = await c.req.json<PortfoyGuncelleBody>();
  } catch {
    return c.json({ hata: "Geçersiz JSON" }, 400);
  }

  // Sahiplik kontrolü — başka kullanıcının kaydını değiştirmeye izin yok
  const mevcut = await c.env.DB.prepare(
    "SELECT id FROM portfoy WHERE id = ? AND kullanici_id = ?",
  ).bind(id, kullaniciId).first<{ id: number }>();

  if (!mevcut) return c.json({ hata: "Kayıt bulunamadı" }, 404);

  const guncellemeler: string[] = ["guncellendi = unixepoch()"];
  const degerler: (string | number | null)[] = [];

  if ("not_metni" in body) {
    guncellemeler.push("not_metni = ?");
    degerler.push(body.not_metni ?? null);
  }
  if ("fiyat_tahmini" in body) {
    guncellemeler.push("fiyat_tahmini = ?");
    degerler.push(body.fiyat_tahmini ?? null);
  }
  if ("etiket" in body) {
    guncellemeler.push("etiket = ?");
    degerler.push(body.etiket ?? null);
  }

  if (guncellemeler.length === 1) {
    return c.json({ hata: "Güncellenecek alan yok" }, 400);
  }

  degerler.push(id, kullaniciId);

  await c.env.DB.prepare(
    `UPDATE portfoy SET ${guncellemeler.join(", ")} WHERE id = ? AND kullanici_id = ?`,
  ).bind(...degerler).run();

  return c.json({ ok: true });
});

// ── DELETE /v1/portfoy/:id ───────────────────────────────────────────────────
portfoy.delete("/:id", async (c) => {
  const kullaniciId = c.get("kullaniciId");
  const id = Number(c.req.param("id"));

  if (!id || isNaN(id)) return c.json({ hata: "Geçersiz id" }, 400);

  const sonuc = await c.env.DB.prepare(
    "DELETE FROM portfoy WHERE id = ? AND kullanici_id = ?",
  ).bind(id, kullaniciId).run();

  if ((sonuc.meta.changes ?? 0) === 0) {
    return c.json({ hata: "Kayıt bulunamadı" }, 404);
  }

  return c.json({ ok: true });
});

// ── DELETE /v1/portfoy (tümünü sil) ─────────────────────────────────────────
portfoy.delete("/", async (c) => {
  const kullaniciId = c.get("kullaniciId");

  const sonuc = await c.env.DB.prepare(
    "DELETE FROM portfoy WHERE kullanici_id = ?",
  ).bind(kullaniciId).run();

  log.info("portfoy.temizle", { kullaniciId, silinen: sonuc.meta.changes });
  return c.json({ ok: true, silinen: sonuc.meta.changes });
});

export { portfoy as portfoyRoutes };
