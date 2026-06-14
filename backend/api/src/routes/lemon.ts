/**
 * LemonSqueezy webhook endpoint
 *
 * Bu endpoint LemonSqueezy'nin abonelik olaylarını (subscription_created,
 * subscription_updated, subscription_cancelled, subscription_payment_*) alır
 * ve kullanicilar.tier + tier_bitis alanlarını günceller.
 *
 * Setup:
 *   1. lemonsqueezy.com → Settings → Webhooks → Create
 *   2. URL: https://api.cadastrum.com.tr/v1/lemon/webhook
 *   3. Signing secret üret → wrangler secret put LEMON_WEBHOOK_SECRET
 *   4. Events: subscription_created, subscription_updated,
 *              subscription_cancelled, subscription_resumed,
 *              subscription_expired
 *
 * Variant ID → Tier mapping LS dashboard'unda ayarlandıktan sonra
 * VARIANT_TIER objesine eklenir.
 */
import { Hono } from "hono";
import type { Env } from "../index.js";
import { proAktivasyonTemplate, aboneliyIptalTemplate, odemeBasarisizTemplate } from "../lib/email-templates.js";

// Email gönderim helper (auth.ts'tekiyle aynı yapı)
async function emailGonderLemon(env: Env, alici: string, konu: string, html: string, metin: string): Promise<void> {
  const apiKey = (env as any).RESEND_API_KEY as string | undefined;
  if (!apiKey) {
    console.log(`[lemon-email] (DEV) ${alici} - ${konu}`);
    return;
  }
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Cadastrum <noreply@cadastrum.com.tr>",
        to: [alici], subject: konu, html, text: metin,
      }),
    });
  } catch (e) { console.error("[lemon-email]", e); }
}

const lemon = new Hono<{ Bindings: Env }>();

// Variant ID → tier mapping (LS dashboard'da ürün oluşturulunca doldurulur)
const VARIANT_TIER: Record<string, "pro" | "pro_plus" | "kurumsal"> = {
  // "123456": "pro",       // Pro Aylık
  // "123457": "pro",       // Pro Yıllık
  // "123458": "pro_plus",  // Pro+ Aylık
  // "123459": "pro_plus",  // Pro+ Yıllık
  // "123460": "kurumsal",  // Kurumsal
};

// HMAC-SHA256 imza doğrulama (LS standartı)
async function imzaDogrula(secret: string, govde: string, imza: string): Promise<boolean> {
  if (!imza) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(govde));
  const beklenen = Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  // Constant-time karşılaştırma
  if (beklenen.length !== imza.length) return false;
  let xor = 0;
  for (let i = 0; i < beklenen.length; i++) xor |= beklenen.charCodeAt(i) ^ imza.charCodeAt(i);
  return xor === 0;
}

interface LemonWebhookGovde {
  meta?: {
    event_name?: string;
    custom_data?: Record<string, any>;
  };
  data?: {
    id?: string;
    type?: string;
    attributes?: {
      user_email?: string;
      status?: string;
      variant_id?: number;
      ends_at?: string | null;
      renews_at?: string | null;
      cancelled?: boolean;
      [key: string]: any;
    };
  };
}

lemon.post("/webhook", async (c) => {
  const secret = (c.env as any).LEMON_WEBHOOK_SECRET as string | undefined;
  if (!secret) return c.json({ hata: "Webhook secret kurulmamış" }, 500);

  const imza = c.req.header("X-Signature") ?? "";
  const govde = await c.req.text();
  const gecerli = await imzaDogrula(secret, govde, imza);
  if (!gecerli) return c.json({ hata: "Geçersiz imza" }, 401);

  let json: LemonWebhookGovde;
  try {
    json = JSON.parse(govde);
  } catch {
    return c.json({ hata: "Geçersiz JSON" }, 400);
  }

  const event = json.meta?.event_name;
  const attr = json.data?.attributes;
  if (!event || !attr) return c.json({ hata: "Eksik veri" }, 400);

  const email = attr.user_email?.toLowerCase();
  if (!email) return c.json({ hata: "Email yok" }, 400);

  const variantId = attr.variant_id?.toString();
  const tier = variantId ? VARIANT_TIER[variantId] : undefined;

  // Kullanıcıyı bul
  const kullanici = await c.env.DB.prepare(
    "SELECT id, ad FROM kullanicilar WHERE email = ?"
  ).bind(email).first<{ id: number; ad: string | null }>();
  if (!kullanici) {
    console.warn(`[lemon webhook] kullanıcı bulunamadı: ${email}, event: ${event}`);
    return c.json({ ok: true, not: "Kullanıcı yok, atlandı" });
  }

  switch (event) {
    case "subscription_created":
    case "subscription_updated":
    case "subscription_resumed": {
      if (tier) {
        const bitis = attr.ends_at ? new Date(attr.ends_at).getTime() : null;
        await c.env.DB.prepare(
          "UPDATE kullanicilar SET tier = ?, tier_bitis = ? WHERE id = ?"
        ).bind(tier, bitis, kullanici.id).run();
        console.log(`[lemon] ${email} → ${tier} (ends ${attr.ends_at})`);

        // Pro aktivasyon email — sadece subscription_created için
        if (event === "subscription_created" || event === "subscription_resumed") {
          const t = proAktivasyonTemplate(kullanici.ad, tier, bitis);
          await emailGonderLemon(c.env, email, `${tier === "pro" ? "Pro" : tier === "pro_plus" ? "Pro+" : "Kurumsal"} planınız aktif`, t.html, t.metin);
        }
      }
      break;
    }
    case "subscription_cancelled":
    case "subscription_expired": {
      // Cancelled → dönem sonunda Free'ye düşecek; tier_bitis'i koru
      // Expired → hemen Free
      const donemSonu = attr.ends_at ? new Date(attr.ends_at).getTime() : null;
      if (event === "subscription_expired") {
        await c.env.DB.prepare(
          "UPDATE kullanicilar SET tier = 'free', tier_bitis = NULL WHERE id = ?"
        ).bind(kullanici.id).run();
      }
      console.log(`[lemon] ${email} ${event}`);

      // İptal email — sadece cancelled için (expired sonrası ayrı bildirilmez)
      if (event === "subscription_cancelled") {
        const t = aboneliyIptalTemplate(kullanici.ad, donemSonu);
        await emailGonderLemon(c.env, email, "Aboneliğiniz iptal edildi", t.html, t.metin);
      }
      break;
    }
    case "subscription_payment_failed": {
      console.warn(`[lemon] ödeme başarısız: ${email}`);
      const t = odemeBasarisizTemplate(kullanici.ad);
      await emailGonderLemon(c.env, email, "Cadastrum: Ödeme alınamadı", t.html, t.metin);
      break;
    }
    default:
      console.log(`[lemon] bilinmeyen event: ${event}`);
  }

  return c.json({ ok: true });
});

export { lemon as lemonRoutes };
