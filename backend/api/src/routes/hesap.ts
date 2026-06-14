/**
 * Cadastrum Hesap Yönetimi
 *
 * Endpoint'ler (Bearer auth zorunlu):
 *   GET    /v1/hesap/dis-aktarim   → KVKK Madde 11 veri taşınabilirlik
 *   DELETE /v1/hesap/sil           → KVKK Madde 7 silme hakkı
 *   POST   /v1/hesap/sifre-degistir { eski, yeni } → giriş yapmış kullanıcı
 *
 * Backend tier middleware:
 *   tierGerekli("pro" | "pro_plus" | "kurumsal") — JWT'deki tier'a göre 403 atar
 */
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { verify } from "hono/jwt";
import type { Env } from "../index.js";

const hesap = new Hono<{ Bindings: Env }>();

// ── JWT Bearer middleware ─────────────────────────────────────
export const jwtMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const authH = c.req.header("Authorization");
  if (!authH?.startsWith("Bearer ")) {
    return c.json({ hata: "Token yok" }, 401);
  }
  const token = authH.slice(7);
  try {
    const payload = await verify(token, c.env.JWT_SECRET.trim(), "HS256");
    c.set("kullaniciId" as any, payload.sub);
    c.set("tier" as any, payload.tier);
    c.set("jwtPayload" as any, payload);
  } catch {
    return c.json({ hata: "Geçersiz token" }, 401);
  }
  await next();
};

// ── Tier gating helper ───────────────────────────────────────
const TIER_SIRA: Record<string, number> = {
  free: 0,
  pro: 1,
  pro_plus: 2,
  kurumsal: 3,
};

export function tierGerekli(min: "pro" | "pro_plus" | "kurumsal"): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const tier = c.get("tier" as any) as string | undefined;
    if (!tier || (TIER_SIRA[tier] ?? 0) < (TIER_SIRA[min] ?? 99)) {
      return c.json({
        hata: `Bu özellik ${min === "pro" ? "Pro" : min === "pro_plus" ? "Pro+" : "Kurumsal"} planında.`,
        gerekliTier: min,
      }, 403);
    }
    await next();
  };
}

// ── Tüm route'lar JWT korumalı ────────────────────────────────
hesap.use("*", jwtMiddleware);

// ── Veri Export (KVKK Madde 11) ───────────────────────────────
hesap.get("/dis-aktarim", async (c) => {
  const kullaniciId = c.get("kullaniciId" as any) as number;
  const kullanici = await c.env.DB.prepare(
    `SELECT id, email, ad, tier, tier_bitis, olusturuldu, son_giris, email_dogrulandi
     FROM kullanicilar WHERE id = ?`
  ).bind(kullaniciId).first();

  if (!kullanici) return c.json({ hata: "Kullanıcı yok" }, 404);

  // İleride: ilan katkıları, bias kalibrasyonu için kullanıldı vs. de eklenebilir
  const rapor = {
    ihrac_tarihi: new Date().toISOString(),
    kvkk_aciklama: "Bu dosya 6698 sayılı KVKK Madde 11 kapsamında veri taşınabilirlik hakkınızla üretilmiştir.",
    kullanici,
    not: "Eklentide tutulan parsel notları, manuel imar/emsal verileri tarayıcınızda yereldir; chrome.storage.local üzerinden Cadastrum uzantısı içinden export edilebilir.",
  };

  c.header("Content-Disposition", `attachment; filename="cadastrum-veri-${kullaniciId}-${Date.now()}.json"`);
  return c.json(rapor);
});

// ── Hesap Silme (KVKK Madde 7) ────────────────────────────────
hesap.delete("/sil", async (c) => {
  const kullaniciId = c.get("kullaniciId" as any) as number;
  const body = await c.req.json<{ onay?: string }>().catch(() => ({} as { onay?: string }));
  if (body.onay !== "HESABIMI SIL") {
    return c.json({ hata: "Onay metni eksik. Body: { onay: 'HESABIMI SIL' }" }, 400);
  }

  // Kayıtları sil
  await c.env.DB.prepare("DELETE FROM kullanicilar WHERE id = ?").bind(kullaniciId).run();
  // İleride: kullanıcının yorumları, paylaştığı ilan vs. anonimleştirme buraya gelir

  return c.json({ silindi: true, mesaj: "Hesap kalıcı olarak silindi." });
});

// ── Şifre Değiştirme (giriş yapmış kullanıcı) ─────────────────
hesap.post("/sifre-degistir", async (c) => {
  const kullaniciId = c.get("kullaniciId" as any) as number;
  const body = await c.req.json<{ eski?: string; yeni?: string }>().catch(() => null);
  if (!body?.eski || !body?.yeni) return c.json({ hata: "Eski ve yeni şifre gerekli" }, 400);
  if (body.yeni.length < 8) return c.json({ hata: "Yeni şifre en az 8 karakter olmalı" }, 400);

  const row = await c.env.DB.prepare(
    "SELECT pw_hash, pw_salt FROM kullanicilar WHERE id = ?"
  ).bind(kullaniciId).first<{ pw_hash: string; pw_salt: string }>();
  if (!row) return c.json({ hata: "Kullanıcı yok" }, 404);

  // Eski şifre kontrol
  const enc = new TextEncoder();
  const salt = new Uint8Array(row.pw_salt.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  const key = await crypto.subtle.importKey("raw", enc.encode(body.eski), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key, 256,
  );
  const eskiHash = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
  if (eskiHash !== row.pw_hash) return c.json({ hata: "Mevcut şifre hatalı" }, 401);

  // Yeni hash
  const yeniSaltArr = new Uint8Array(16);
  crypto.getRandomValues(yeniSaltArr);
  const yeniSalt = Array.from(yeniSaltArr).map(b => b.toString(16).padStart(2, "0")).join("");
  const yeniSaltBuf = new Uint8Array(yeniSalt.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  const yeniKey = await crypto.subtle.importKey("raw", enc.encode(body.yeni), "PBKDF2", false, ["deriveBits"]);
  const yeniBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: yeniSaltBuf, iterations: 100000, hash: "SHA-256" },
    yeniKey, 256,
  );
  const yeniHash = Array.from(new Uint8Array(yeniBits)).map(b => b.toString(16).padStart(2, "0")).join("");

  await c.env.DB.prepare(
    "UPDATE kullanicilar SET pw_hash = ?, pw_salt = ? WHERE id = ?"
  ).bind(yeniHash, yeniSalt, kullaniciId).run();

  return c.json({ basarili: true });
});

export { hesap as hesapRoutes };
