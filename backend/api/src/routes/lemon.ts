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
 * Variant ID → Tier mapping:
 *   Kod değişikliği gerekmez — her variant ID'yi ayrı secret olarak set et:
 *
 *   wrangler secret put LEMON_VARIANT_PRO_AYLIK      ← Pro Aylık variant ID
 *   wrangler secret put LEMON_VARIANT_PRO_YILLIK     ← Pro Yıllık variant ID
 *   wrangler secret put LEMON_VARIANT_PRO_PLUS_AYLIK ← Pro+ Aylık variant ID
 *   wrangler secret put LEMON_VARIANT_PRO_PLUS_YILLIK← Pro+ Yıllık variant ID
 *   wrangler secret put LEMON_VARIANT_KURUMSAL       ← Kurumsal variant ID
 *
 *   ID'leri bulmak için:
 *     app.lemonsqueezy.com → Products → [Ürün] → Variants → her varyantın URL'sindeki sayı
 *
 *   Birden fazla Pro varyantı (aylık + yıllık) aynı tier'a eşlenir — doğru davranış.
 */
import { Hono } from "hono";
import type { Env } from "../index.js";
import { proAktivasyonTemplate, aboneliyIptalTemplate, odemeBasarisizTemplate } from "../lib/email-templates.js";
// DRY: Merkezi emailGonder — auth.ts'teki duplicate kaldırıldı.
import { emailGonder } from "./auth.js";
import { log } from "../lib/logger.js";

/**
 * LemonSqueezy variant ID'leri için ek Env alanları.
 * index.ts Env interface'ine eklenmek yerine burada intersection olarak kullanılır
 * — bağımlılık yönünü tersine çevirmemek için.
 */
interface LemonEnv {
  /** Pro Aylık plan variant ID (wrangler secret put LEMON_VARIANT_PRO_AYLIK) */
  LEMON_VARIANT_PRO_AYLIK?: string;
  /** Pro Yıllık plan variant ID (wrangler secret put LEMON_VARIANT_PRO_YILLIK) */
  LEMON_VARIANT_PRO_YILLIK?: string;
  /** Pro+ Aylık plan variant ID (wrangler secret put LEMON_VARIANT_PRO_PLUS_AYLIK) */
  LEMON_VARIANT_PRO_PLUS_AYLIK?: string;
  /** Pro+ Yıllık plan variant ID (wrangler secret put LEMON_VARIANT_PRO_PLUS_YILLIK) */
  LEMON_VARIANT_PRO_PLUS_YILLIK?: string;
  /** Kurumsal plan variant ID (wrangler secret put LEMON_VARIANT_KURUMSAL) */
  LEMON_VARIANT_KURUMSAL?: string;
}

// Thin wrapper — lemon context'inde hata görmezden gel (webhook iş akışını kesmemeli)
async function emailGonderLemon(env: Env, alici: string, konu: string, html: string, metin: string): Promise<void> {
  await emailGonder(env, alici, konu, html, metin).catch((e) =>
    log.error("lemon.email.hata", { hata: e instanceof Error ? e.message : String(e), alici }),
  );
}

type LemonBindings = Env & LemonEnv;
type LemonCtx = { Bindings: LemonBindings };
const lemon = new Hono<LemonCtx>();

/**
 * Env'den variant ID → tier map'ini runtime'da oluştur.
 *
 * Her secret boş string veya undefined olabilir — bu durumda o varyant
 * map'e eklenmez (undefined tier → "unknown variant" log'u). Yeni varyant
 * eklemek için sadece `wrangler secret put` yeterli, deploy gerekmez.
 *
 * ⚠️ ID'ler sayısal olsa da string olarak karşılaştırılır.
 */
function variantTierMap(env: LemonBindings): Record<string, "pro" | "pro_plus" | "kurumsal"> {
  const map: Record<string, "pro" | "pro_plus" | "kurumsal"> = {};
  const ekle = (id: string | undefined, tier: "pro" | "pro_plus" | "kurumsal") => {
    if (id && id.trim()) map[id.trim()] = tier;
  };
  ekle(env.LEMON_VARIANT_PRO_AYLIK,        "pro");
  ekle(env.LEMON_VARIANT_PRO_YILLIK,       "pro");
  ekle(env.LEMON_VARIANT_PRO_PLUS_AYLIK,   "pro_plus");
  ekle(env.LEMON_VARIANT_PRO_PLUS_YILLIK,  "pro_plus");
  ekle(env.LEMON_VARIANT_KURUMSAL,         "kurumsal");
  return map;
}

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
  const secret = c.env.LEMON_WEBHOOK_SECRET as string | undefined;
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

  // ── Idempotency kontrolü ─────────────────────────────────────────────────
  // LemonSqueezy aynı event'i birden fazla gönderebildiği için (retry, network
  // hatası vb.) her delivery'yi benzersiz bir key ile işaretliyoruz.
  // Key: data.id (subscription resource ID) + event_name + ends_at (state hash).
  // INSERT OR IGNORE: key zaten varsa 0 changes döner → aynı event'i atla.
  const idempotencyKey = `${json.data?.id ?? "no-id"}:${event}:${attr.ends_at ?? "null"}`;
  try {
    const ins = await c.env.DB.prepare(
      `INSERT OR IGNORE INTO webhook_log (idempotency_key, event_name, sonuc, islendi)
       VALUES (?, ?, 'ok', ?)`,
    ).bind(idempotencyKey, event, Date.now()).run();

    if ((ins.meta.changes ?? 0) === 0) {
      // Zaten işlendi — idempotent 200 dön
      log.info("lemon.webhook.duplicate-skip", { idempotencyKey });
      return c.json({ ok: true, not: "duplicate-skip" });
    }
  } catch (e) {
    // webhook_log tablosu henüz migration ile oluşturulmamışsa devam et (graceful degradation)
    log.warn("lemon.webhook.log-yazma-hatasi", { hata: e instanceof Error ? e.message : String(e) });
  }

  const email = attr.user_email?.toLowerCase();
  if (!email) return c.json({ hata: "Email yok" }, 400);

  const variantId = attr.variant_id?.toString();
  const VARIANT_TIER = variantTierMap(c.env);
  const tier = variantId ? VARIANT_TIER[variantId] : undefined;
  if (variantId && !tier) {
    log.warn("lemon.webhook.bilinmeyen-variant", { variantId, email, event });
  }

  // Kullanıcıyı bul
  const kullanici = await c.env.DB.prepare(
    "SELECT id, ad FROM kullanicilar WHERE email = ?"
  ).bind(email).first<{ id: number; ad: string | null }>();
  if (!kullanici) {
    log.warn("lemon.webhook.kullanici-yok", { email, event });
    // webhook_log'u 'skip' olarak güncelle
    await c.env.DB.prepare(
      `UPDATE webhook_log SET sonuc = 'skip', not = 'kullanici-yok' WHERE idempotency_key = ?`,
    ).bind(idempotencyKey).run().catch(() => {});
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
        log.info("lemon.webhook.tier-guncellendi", { email, tier, ends_at: attr.ends_at });

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
      log.info("lemon.webhook.iptal-bitis", { email, event, ends_at: attr.ends_at });

      // İptal email — sadece cancelled için (expired sonrası ayrı bildirilmez)
      if (event === "subscription_cancelled") {
        const t = aboneliyIptalTemplate(kullanici.ad, donemSonu);
        await emailGonderLemon(c.env, email, "Aboneliğiniz iptal edildi", t.html, t.metin);
      }
      break;
    }
    case "subscription_payment_failed": {
      log.warn("lemon.webhook.odeme-basarisiz", { email });
      const t = odemeBasarisizTemplate(kullanici.ad);
      await emailGonderLemon(c.env, email, "Cadastrum: Ödeme alınamadı", t.html, t.metin);
      break;
    }
    default:
      log.info("lemon.webhook.bilinmeyen-event", { event, email });
      // Bilinmeyen event — webhook_log'da 'skip' olarak işaretle
      await c.env.DB.prepare(
        `UPDATE webhook_log SET sonuc = 'skip', not = ? WHERE idempotency_key = ?`,
      ).bind(`bilinmeyen-event:${event}`, idempotencyKey).run().catch(() => {});
  }

  return c.json({ ok: true });
});

export { lemon as lemonRoutes };
