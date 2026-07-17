/**
 * Cadastrum Auth — email/şifre + JWT + email doğrulama + şifre sıfırlama
 *
 * Endpoint'ler:
 *   POST /v1/auth/kayit               { email, sifre, ad? } → { token, kullanici }
 *   POST /v1/auth/giris               { email, sifre }      → { token, kullanici }
 *   GET  /v1/auth/ben                 Bearer token          → { kullanici }
 *   POST /v1/auth/dogrulama-gonder    Bearer token          → { gonderildi }
 *   POST /v1/auth/dogrula             { kod } + Bearer       → { dogrulandi }
 *   POST /v1/auth/sifre-sifirla       { email }              → { gonderildi }
 *   POST /v1/auth/sifre-yenile        { token, yeniSifre }  → { basarili }
 *
 * Şifre: PBKDF2-SHA256 (100k iter), Web Crypto edge-compatible.
 * Token: HS256 JWT, 30 gün.
 * Email: Resend (RESEND_API_KEY env). Yoksa konsola log atılır (dev).
 * Rate-limit: IP başına dakika başı 10 giriş denemesi.
 */
import { Hono } from "hono";
import { sign, verify } from "hono/jwt";
import type { Env } from "../index.js";
import {
  dogrulamaKoduTemplate,
  welcomeTemplate,
  sifreSifirlamaTemplate,
} from "../lib/email-templates.js";

const auth = new Hono<{ Bindings: Env }>();

// ── Helpers ─────────────────────────────────────────────────────
function rastgeleHex(byte = 16): string {
  const arr = new Uint8Array(byte);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

function rastgeleKod6(): string {
  // 6 haneli sayısal kod — email doğrulama için
  const arr = new Uint8Array(4);
  crypto.getRandomValues(arr);
  const num = ((arr[0] << 24) | (arr[1] << 16) | (arr[2] << 8) | arr[3]) >>> 0;
  return (num % 1_000_000).toString().padStart(6, "0");
}

async function sifreHash(sifre: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  const key = await crypto.subtle.importKey("raw", enc.encode(sifre), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key, 256,
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function emailGecerli(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 128;
}

interface KullaniciRow {
  id: number;
  email: string;
  ad: string | null;
  pw_hash: string;
  pw_salt: string;
  tier: string;
  tier_bitis: number | null;
  olusturuldu: number;
  email_dogrulandi?: number;
  dogrulama_kod?: string | null;
  dogrulama_son?: number | null;
  sifre_sifirla_token?: string | null;
  sifre_sifirla_son?: number | null;
}

function kullaniciDispatch(row: KullaniciRow) {
  return {
    id: row.id,
    email: row.email,
    ad: row.ad,
    tier: row.tier,
    tierBitis: row.tier_bitis,
    emailDogrulandi: !!row.email_dogrulandi,
  };
}

async function tokenUret(secret: string, kullaniciId: number, email: string, tier: string, admin?: number) {
  const payload: any = {
    sub: kullaniciId,
    email,
    tier,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  };
  if (admin === 1) payload.adm = 1;
  return await sign(payload, secret.trim(), "HS256");
}

async function bearerKullaniciAl(c: any): Promise<{ kullanici: KullaniciRow; payload: any } | null> {
  const authH = c.req.header("Authorization");
  if (!authH?.startsWith("Bearer ")) return null;
  const token = authH.slice(7);
  let payload: { sub?: string | number; [k: string]: unknown };
  try {
    payload = (await verify(token, c.env.JWT_SECRET.trim(), "HS256")) as typeof payload;
  } catch (e) {
    console.error("[bearer] verify error:", e instanceof Error ? e.message : String(e),
      "secretLen:", c.env.JWT_SECRET?.length, "tokenLen:", token.length);
    return null;
  }
  const sub = payload.sub;
  if (sub == null) return null;
  const kullanici = (await c.env.DB.prepare(
    "SELECT * FROM kullanicilar WHERE id = ?"
  ).bind(sub).first()) as KullaniciRow | null;
  if (!kullanici) return null;
  return { kullanici, payload };
}

// ── Email gönderim — Resend opsiyonel ──────────────────────────
/**
 * Resend API ile email gönder — RESEND_API_KEY set edilmemişse konsola log.
 *
 * NOT: Export edildi ki diğer route'lar (scraper hatırlatma vb.) de kullanabilsin.
 */
export async function emailGonder(env: Env, alici: string, konu: string, html: string, metin: string): Promise<boolean> {
  const apiKey = (env as any).RESEND_API_KEY as string | undefined;
  if (!apiKey) {
    // Dev modu — konsola log at
    console.log(`[EMAIL DEV] To: ${alici}\nSubject: ${konu}\n${metin}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Cadastrum <noreply@cadastrum.com.tr>",
        to: [alici],
        subject: konu,
        html,
        text: metin,
      }),
    });
    if (!res.ok) {
      console.error("[Resend] hata:", await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[Resend] istisna:", e);
    return false;
  }
}

// ── Rate limit (IP başına dakika başına 10 giriş denemesi) ──────
// Cleanup artık module-level değişken kullanmıyor — tamamen DB tabanlı.
// Eski satırların silinmesi index.ts'deki günlük cron ("0 3 * * *") tarafından yapılır.
async function rateLimitKontrol(env: Env, ip: string): Promise<boolean> {
  const dakika = Math.floor(Date.now() / 60000);
  // Atomik increment — SELECT + ayrı INSERT/UPDATE yerine tek UPSERT RETURNING
  const row = await env.DB.prepare(
    `INSERT INTO giris_denemesi (ip, dakika, sayi) VALUES (?, ?, 1)
     ON CONFLICT(ip, dakika) DO UPDATE SET sayi = sayi + 1
     RETURNING sayi`
  ).bind(ip, dakika).first<{ sayi: number }>();
  const yeniSayi = row?.sayi ?? 1;
  return yeniSayi <= 10;
}

function clientIp(c: any): string {
  return c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ?? "unknown";
}

// ── Kayıt ──────────────────────────────────────────────────────
auth.post("/kayit", async (c) => {
  const body = await c.req.json<{ email?: string; sifre?: string; ad?: string }>().catch(() => null);
  if (!body?.email || !body?.sifre) return c.json({ hata: "Email ve şifre gerekli" }, 400);

  const email = body.email.trim().toLowerCase();
  if (!emailGecerli(email)) return c.json({ hata: "Geçersiz email" }, 400);
  if (body.sifre.length < 8) return c.json({ hata: "Şifre en az 8 karakter olmalı" }, 400);
  if (body.sifre.length > 128) return c.json({ hata: "Şifre çok uzun" }, 400);

  const mevcut = await c.env.DB.prepare("SELECT id FROM kullanicilar WHERE email = ?").bind(email).first();
  if (mevcut) return c.json({ hata: "Bu email zaten kayıtlı" }, 409);

  const salt = rastgeleHex(16);
  const hash = await sifreHash(body.sifre, salt);
  const simdi = Date.now();
  const dogrulamaKod = rastgeleKod6();
  const dogrulamaSon = simdi + 10 * 60 * 1000; // 10 dk geçerli

  const sonuc = await c.env.DB.prepare(
    `INSERT INTO kullanicilar (email, ad, pw_hash, pw_salt, tier, olusturuldu, son_giris,
                                email_dogrulandi, dogrulama_kod, dogrulama_son)
     VALUES (?, ?, ?, ?, 'free', ?, ?, 0, ?, ?)`
  ).bind(email, body.ad?.trim() ?? null, hash, salt, simdi, simdi, dogrulamaKod, dogrulamaSon).run();

  const id = sonuc.meta.last_row_id as number;

  // Doğrulama email gönder
  const tmpl = dogrulamaKoduTemplate(body.ad?.trim() ?? null, dogrulamaKod);
  await emailGonder(c.env, email, "Cadastrum email doğrulama kodu", tmpl.html, tmpl.metin);

  const token = await tokenUret(c.env.JWT_SECRET, id, email, "free");
  return c.json({
    token,
    kullanici: { id, email, ad: body.ad?.trim() ?? null, tier: "free", tierBitis: null, emailDogrulandi: false },
  });
});

// ── Giriş (rate-limited) ───────────────────────────────────────
auth.post("/giris", async (c) => {
  const ip = clientIp(c);
  const izinli = await rateLimitKontrol(c.env, ip);
  if (!izinli) return c.json({ hata: "Çok fazla deneme. Bir dakika bekleyin." }, 429);

  const body = await c.req.json<{ email?: string; sifre?: string }>().catch(() => null);
  if (!body?.email || !body?.sifre) return c.json({ hata: "Email ve şifre gerekli" }, 400);

  const email = body.email.trim().toLowerCase();
  const row = await c.env.DB.prepare(
    "SELECT * FROM kullanicilar WHERE email = ?"
  ).bind(email).first<KullaniciRow>();

  // Timing-safe — yanıt süresi varlık/yokluk arasında ayırt edilemesin
  // Eğer kullanıcı yoksa dummy hash hesapla (yine de ~50ms)
  const dummySalt = "00".repeat(16);
  const salt = row?.pw_salt ?? dummySalt;
  const hash = await sifreHash(body.sifre, salt);

  if (!row) return c.json({ hata: "Email veya şifre hatalı" }, 401);

  // Constant-time compare
  const a = new TextEncoder().encode(hash);
  const b = new TextEncoder().encode(row.pw_hash);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) diff |= a[i] ^ b[i];
  if (diff !== 0) return c.json({ hata: "Email veya şifre hatalı" }, 401);

  // Banlanan hesap girişini engelle
  if ((row as any).durum === "banli") {
    return c.json({ hata: "Hesabınız askıya alınmış. Destek: iletisim@cadastrum.com.tr" }, 403);
  }

  let tier = row.tier;
  if (row.tier_bitis && row.tier_bitis < Date.now()) tier = "free";

  await c.env.DB.prepare("UPDATE kullanicilar SET son_giris = ? WHERE id = ?")
    .bind(Date.now(), row.id).run();

  const token = await tokenUret(c.env.JWT_SECRET, row.id, row.email, tier, (row as any).admin);
  return c.json({ token, kullanici: { ...kullaniciDispatch(row), tier } });
});

// ── Mevcut kullanıcı ───────────────────────────────────────────
auth.get("/ben", async (c) => {
  const veri = await bearerKullaniciAl(c);
  if (!veri) return c.json({ hata: "Token yok veya geçersiz" }, 401);
  let tier = veri.kullanici.tier;
  if (veri.kullanici.tier_bitis && veri.kullanici.tier_bitis < Date.now()) tier = "free";
  return c.json({ kullanici: { ...kullaniciDispatch(veri.kullanici), tier } });
});

// ── Email doğrulama: yeniden kod gönder ─────────────────────────
auth.post("/dogrulama-gonder", async (c) => {
  const veri = await bearerKullaniciAl(c);
  if (!veri) return c.json({ hata: "Giriş yapın" }, 401);
  if (veri.kullanici.email_dogrulandi) return c.json({ hata: "Email zaten doğrulanmış" }, 400);

  const kod = rastgeleKod6();
  const son = Date.now() + 10 * 60 * 1000;
  await c.env.DB.prepare(
    "UPDATE kullanicilar SET dogrulama_kod = ?, dogrulama_son = ? WHERE id = ?"
  ).bind(kod, son, veri.kullanici.id).run();

  const tmpl2 = dogrulamaKoduTemplate(veri.kullanici.ad, kod);
  await emailGonder(c.env, veri.kullanici.email, "Cadastrum email doğrulama kodu", tmpl2.html, tmpl2.metin);

  return c.json({ gonderildi: true });
});

// ── Email doğrulama: kod kontrol ────────────────────────────────
auth.post("/dogrula", async (c) => {
  const veri = await bearerKullaniciAl(c);
  if (!veri) return c.json({ hata: "Giriş yapın" }, 401);
  const body = await c.req.json<{ kod?: string }>().catch(() => null);
  if (!body?.kod) return c.json({ hata: "Kod gerekli" }, 400);

  if (veri.kullanici.email_dogrulandi) return c.json({ dogrulandi: true });
  if (!veri.kullanici.dogrulama_kod || !veri.kullanici.dogrulama_son) {
    return c.json({ hata: "Önce kod isteyin" }, 400);
  }
  if (veri.kullanici.dogrulama_son < Date.now()) {
    return c.json({ hata: "Kod süresi geçmiş, yeni kod isteyin" }, 400);
  }
  if (veri.kullanici.dogrulama_kod !== body.kod.trim()) {
    return c.json({ hata: "Kod hatalı" }, 400);
  }

  await c.env.DB.prepare(
    "UPDATE kullanicilar SET email_dogrulandi = 1, dogrulama_kod = NULL, dogrulama_son = NULL WHERE id = ?"
  ).bind(veri.kullanici.id).run();

  // Welcome email — doğrulama başarılıysa hoş geldin mesajı
  const wTmpl = welcomeTemplate(veri.kullanici.ad);
  await emailGonder(c.env, veri.kullanici.email, "Cadastrum'a hoş geldiniz", wTmpl.html, wTmpl.metin);

  return c.json({ dogrulandi: true });
});

// ── Şifre sıfırlama: link gönder ────────────────────────────────
// Ayrı rate-limit bucket — giriş denemeleriyle karışmasın.
// IP başına dakikada 3 sıfırlama isteği yeterli.
async function sifreSifirlaRateLimit(env: Env, ip: string): Promise<boolean> {
  const dakika = Math.floor(Date.now() / 60000);
  // Atomik increment — module-level state yok, her Worker instance'ı DB'ye bakar
  const row = await env.DB.prepare(
    `INSERT INTO giris_denemesi (ip, dakika, sayi) VALUES (?, ?, 1)
     ON CONFLICT(ip, dakika) DO UPDATE SET sayi = sayi + 1
     RETURNING sayi`
  ).bind(`reset:${ip}`, dakika).first<{ sayi: number }>();
  const yeniSayi = row?.sayi ?? 1;
  return yeniSayi <= 3;
}

auth.post("/sifre-sifirla", async (c) => {
  const ip = clientIp(c);
  const izinli = await sifreSifirlaRateLimit(c.env, ip);
  if (!izinli) return c.json({ hata: "Çok fazla deneme. Bir dakika bekleyin." }, 429);

  const body = await c.req.json<{ email?: string }>().catch(() => null);
  if (!body?.email) return c.json({ hata: "Email gerekli" }, 400);

  const email = body.email.trim().toLowerCase();
  if (!emailGecerli(email)) return c.json({ hata: "Geçersiz email" }, 400);

  const row = await c.env.DB.prepare(
    "SELECT id, email, ad FROM kullanicilar WHERE email = ?"
  ).bind(email).first<{ id: number; email: string; ad: string | null }>();

  // Güvenlik: kullanıcı yoksa bile aynı cevabı dön (enumeration önleme)
  if (!row) return c.json({ gonderildi: true });

  const sifirlamaToken = rastgeleHex(32);
  const son = Date.now() + 60 * 60 * 1000; // 1 saat
  await c.env.DB.prepare(
    "UPDATE kullanicilar SET sifre_sifirla_token = ?, sifre_sifirla_son = ? WHERE id = ?"
  ).bind(sifirlamaToken, son, row.id).run();

  const sifirlamaUrl = `https://cadastrum.com.tr/sifre-yenile?token=${sifirlamaToken}`;
  const tmpl3 = sifreSifirlamaTemplate(row.ad, sifirlamaUrl);
  const emailGitti = await emailGonder(c.env, row.email, "Cadastrum şifre sıfırlama", tmpl3.html, tmpl3.metin);

  if (!emailGitti) {
    // Token'ı temizle — yarım kalan token DB'de kalmasın
    await c.env.DB.prepare(
      "UPDATE kullanicilar SET sifre_sifirla_token = NULL, sifre_sifirla_son = NULL WHERE id = ?"
    ).bind(row.id).run();
    console.error("[sifre-sifirla] email gönderilemedi, alici:", row.email);
    return c.json({ hata: "Email gönderilemedi. Lütfen birkaç dakika sonra tekrar deneyin." }, 500);
  }

  return c.json({ gonderildi: true });
});

// ── Şifre yenile (token ile) ───────────────────────────────────
auth.post("/sifre-yenile", async (c) => {
  const body = await c.req.json<{ token?: string; yeniSifre?: string }>().catch(() => null);
  if (!body?.token || !body?.yeniSifre) return c.json({ hata: "Token ve yeni şifre gerekli" }, 400);
  if (body.yeniSifre.length < 8) return c.json({ hata: "Şifre en az 8 karakter olmalı" }, 400);
  if (body.yeniSifre.length > 128) return c.json({ hata: "Şifre çok uzun" }, 400);

  const row = await c.env.DB.prepare(
    "SELECT id, sifre_sifirla_son FROM kullanicilar WHERE sifre_sifirla_token = ?"
  ).bind(body.token).first<{ id: number; sifre_sifirla_son: number | null }>();

  if (!row) return c.json({ hata: "Geçersiz veya süresi dolmuş bağlantı" }, 400);
  if (!row.sifre_sifirla_son || row.sifre_sifirla_son < Date.now()) {
    return c.json({ hata: "Bağlantı süresi dolmuş" }, 400);
  }

  const yeniSalt = rastgeleHex(16);
  const yeniHash = await sifreHash(body.yeniSifre, yeniSalt);
  await c.env.DB.prepare(
    `UPDATE kullanicilar SET pw_hash = ?, pw_salt = ?,
       sifre_sifirla_token = NULL, sifre_sifirla_son = NULL
     WHERE id = ?`
  ).bind(yeniHash, yeniSalt, row.id).run();

  return c.json({ basarili: true });
});

export { auth as authRoutes };
