/**
 * Newsletter aboneliği — Erken Erişim listesi
 *
 * POST /v1/newsletter/abone-ol  { email, kaynak? }  → { basarili, sira }
 * GET  /v1/newsletter/sayim                          → { toplam }  (public, social proof)
 *
 * Resend Audiences ile entegre olabilir ama D1 kendi tablosunu da tutar
 * (lansmanı gerçekleştirirken tüm liste elimizde kalır).
 */
import { Hono } from "hono";
import type { Env } from "../index.js";

const newsletter = new Hono<{ Bindings: Env }>();

// Abone ol
newsletter.post("/abone-ol", async (c) => {
  const body = await c.req.json<{ email?: string; kaynak?: string }>().catch(() => ({} as any));
  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    return c.json({ hata: "Geçerli email girin" }, 400);
  }
  const kaynak = (body.kaynak ?? "site").slice(0, 32);
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";

  try {
    // Idempotent — duplicate email sessizce başarılı
    await c.env.DB.prepare(
      `INSERT INTO newsletter_aboneler (email, kaynak, ip, ts) VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO NOTHING`
    ).bind(email, kaynak, ip, Date.now()).run();

    // Toplam sayım
    const total = await c.env.DB.prepare(
      "SELECT COUNT(*) as n FROM newsletter_aboneler"
    ).first<{ n: number }>();

    // Resend Audiences'a paralel ekle (best-effort, hata vermesin)
    const resendKey = (c.env as any).RESEND_API_KEY as string | undefined;
    const audienceId = (c.env as any).RESEND_AUDIENCE_ID as string | undefined;
    if (resendKey && audienceId) {
      fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email, unsubscribed: false }),
      }).catch(e => console.warn("[newsletter] Resend audiences hata:", e));
    }

    return c.json({
      basarili: true,
      sira: total?.n ?? 0,
      mesaj: "Lansmanda haberdar olacaksın. ERKEN100 kodu ilk 100 kişi için.",
    });
  } catch (e) {
    console.error("[newsletter] DB hatası:", e);
    return c.json({ hata: "Geçici sorun, biraz sonra tekrar dene" }, 500);
  }
});

// Public sayım (social proof için)
newsletter.get("/sayim", async (c) => {
  const r = await c.env.DB.prepare(
    "SELECT COUNT(*) as n FROM newsletter_aboneler"
  ).first<{ n: number }>().catch(() => ({ n: 0 }));
  c.header("Cache-Control", "public, s-maxage=300"); // 5 dk edge cache
  return c.json({ toplam: r?.n ?? 0 });
});

export { newsletter as newsletterRoutes };
