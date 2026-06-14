/**
 * Cadastrum Admin Dashboard API
 *
 * Tüm endpoint'ler JWT + admin=1 zorunlu.
 *
 *   GET  /v1/admin/ozet                      → dashboard istatistikleri (kullanıcı/ilan/kullanım)
 *   GET  /v1/admin/kullanicilar?q=&limit=50  → kullanıcı listesi (arama)
 *   POST /v1/admin/kullanici/:id/tier        { tier, gun? } → tier değiştir
 *   POST /v1/admin/kullanici/:id/durum       { durum: 'aktif'|'banli'|'dondurulmus' }
 *   GET  /v1/admin/ai-kullanim?gun=7         → günlük AI sorgu+maliyet
 *   GET  /v1/admin/ilan-stats                → telemetri akışı
 *   GET  /v1/admin/operasyon-kpi?gun=7       → operasyon doğruluk KPI'ları
 *   GET  /v1/admin/guvenlik?saat=24          → başarısız giriş + rate limit
 *   GET  /v1/admin/log?limit=50              → admin denetim logu
 *   GET  /v1/admin/saglik                    → backend / D1 sağlık
 */
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { Env } from "../index.js";
import { jwtMiddleware } from "./hesap.js";

const admin = new Hono<{ Bindings: Env }>();

// ── Admin role middleware ────────────────────────────────────────
// JWT payload'a `adm: 1` claim'i konursa DB hit'siz kontrol.
// Yoksa fallback: DB'den oku (legacy token desteği).
const adminMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const kullaniciId = c.get("kullaniciId" as any) as number | undefined;
  const payload = c.get("jwtPayload" as any) as any;
  if (!kullaniciId) return c.json({ hata: "Yetkisiz" }, 401);

  // Hızlı yol: token'da admin claim varsa DB hit'siz geç
  if (payload?.adm === 1) {
    c.set("adminId" as any, kullaniciId);
    await next();
    return;
  }

  // Geriye dönük uyumluluk: eski token'lar için DB kontrolü
  const row = await c.env.DB.prepare(
    "SELECT admin FROM kullanicilar WHERE id = ?"
  ).bind(kullaniciId).first<{ admin: number }>();
  if (!row || row.admin !== 1) {
    return c.json({ hata: "Admin yetkisi gerekli" }, 403);
  }
  c.set("adminId" as any, kullaniciId);
  await next();
};

admin.use("*", jwtMiddleware);
admin.use("*", adminMiddleware);

// ── Helpers ──────────────────────────────────────────────────────
async function logla(env: Env, adminId: number, olay: string, hedefId: number | null, payload: any, ip: string | null) {
  try {
    await env.DB.prepare(
      `INSERT INTO admin_log (admin_id, olay, hedef_id, payload, ip, ts) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(adminId, olay, hedefId, payload ? JSON.stringify(payload) : null, ip, Date.now()).run();
  } catch (e) {
    console.error("[admin_log] yazılamadı", e);
  }
}

function getIP(c: any): string | null {
  return c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || null;
}

// ── Dashboard özet ───────────────────────────────────────────────
admin.get("/ozet", async (c) => {
  const simdi = Date.now();
  const son24 = simdi - 86_400_000;
  const son7 = simdi - 7 * 86_400_000;
  const son30 = simdi - 30 * 86_400_000;

  const [kullaniciSayim, ilanSayim, ilanSon24, aiSon7, tierDagilim, yeniKayit24] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) as n FROM kullanicilar").first<{ n: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) as n FROM ilanlar").first<{ n: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) as n FROM ilanlar WHERE yakalanma_tarihi >= ?").bind(son24).first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM ai_kullanim WHERE ts >= ?`
    ).bind(son7).first<{ n: number }>().catch(() => ({ n: 0 })),
    c.env.DB.prepare(
      "SELECT tier, COUNT(*) as n FROM kullanicilar GROUP BY tier"
    ).all<{ tier: string; n: number }>(),
    c.env.DB.prepare(
      "SELECT COUNT(*) as n FROM kullanicilar WHERE olusturuldu >= ?"
    ).bind(son24).first<{ n: number }>(),
  ]);

  return c.json({
    kullanici: {
      toplam: kullaniciSayim?.n ?? 0,
      yeni24s: yeniKayit24?.n ?? 0,
      tier: tierDagilim?.results ?? [],
    },
    ilan: {
      toplam: ilanSayim?.n ?? 0,
      son24s: ilanSon24?.n ?? 0,
    },
    ai: {
      son7gun: aiSon7?.n ?? 0,
    },
    zaman: simdi,
  });
});

// ── Kullanıcı listesi ────────────────────────────────────────────
admin.get("/kullanicilar", async (c) => {
  const q = c.req.query("q")?.trim() ?? "";
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50"), 200);
  const offset = parseInt(c.req.query("offset") ?? "0");

  let rows;
  if (q) {
    rows = await c.env.DB.prepare(
      `SELECT id, email, ad, tier, tier_bitis, durum, admin, email_dogrulandi, olusturuldu, son_giris
       FROM kullanicilar
       WHERE email LIKE ? OR ad LIKE ?
       ORDER BY id DESC LIMIT ? OFFSET ?`
    ).bind(`%${q}%`, `%${q}%`, limit, offset).all();
  } else {
    rows = await c.env.DB.prepare(
      `SELECT id, email, ad, tier, tier_bitis, durum, admin, email_dogrulandi, olusturuldu, son_giris
       FROM kullanicilar
       ORDER BY id DESC LIMIT ? OFFSET ?`
    ).bind(limit, offset).all();
  }

  return c.json({ kullanicilar: rows.results, limit, offset });
});

// ── Tier değiştir ────────────────────────────────────────────────
admin.post("/kullanici/:id/tier", async (c) => {
  const adminId = c.get("adminId" as any) as number;
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json<{ tier?: string; gun?: number }>().catch(() => ({} as { tier?: string; gun?: number }));
  const tier = body.tier;
  if (!tier || !["free", "pro", "pro_plus", "kurumsal"].includes(tier)) {
    return c.json({ hata: "Geçersiz tier" }, 400);
  }
  const tier_bitis = body.gun ? Date.now() + body.gun * 86_400_000 : null;
  const onceki = await c.env.DB.prepare(
    "SELECT tier, tier_bitis FROM kullanicilar WHERE id = ?"
  ).bind(id).first();
  if (!onceki) return c.json({ hata: "Kullanıcı yok" }, 404);

  await c.env.DB.prepare(
    "UPDATE kullanicilar SET tier = ?, tier_bitis = ? WHERE id = ?"
  ).bind(tier, tier_bitis, id).run();

  await logla(c.env, adminId, "tier-degistir", id, { onceki, yeni: { tier, tier_bitis } }, getIP(c));
  return c.json({ basarili: true, id, tier, tier_bitis });
});

// ── Durum değiştir (aktif / ban / dondur) ────────────────────────
admin.post("/kullanici/:id/durum", async (c) => {
  const adminId = c.get("adminId" as any) as number;
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json<{ durum?: string }>().catch(() => ({} as { durum?: string }));
  if (!body.durum || !["aktif", "banli", "dondurulmus"].includes(body.durum)) {
    return c.json({ hata: "Geçersiz durum" }, 400);
  }
  if (id === adminId) return c.json({ hata: "Kendi hesabınızı değiştiremezsiniz" }, 400);

  await c.env.DB.prepare(
    "UPDATE kullanicilar SET durum = ? WHERE id = ?"
  ).bind(body.durum, id).run();

  await logla(c.env, adminId, "durum-degistir", id, { durum: body.durum }, getIP(c));
  return c.json({ basarili: true, id, durum: body.durum });
});

// ── AI kullanım istatistikleri ───────────────────────────────────
admin.get("/ai-kullanim", async (c) => {
  const gun = Math.min(parseInt(c.req.query("gun") ?? "7"), 90);
  const sinir = Date.now() - gun * 86_400_000;

  const [toplam, modelBazli, topKullanici] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM ai_kullanim WHERE ts >= ?`
    ).bind(sinir).first<{ n: number }>().catch(() => ({ n: 0 })),
    c.env.DB.prepare(
      `SELECT model, COUNT(*) as n FROM ai_kullanim WHERE ts >= ? GROUP BY model`
    ).bind(sinir).all().catch(() => ({ results: [] as any[] })),
    c.env.DB.prepare(
      `SELECT k.email, k.tier, COUNT(*) as sorgu
       FROM ai_kullanim a JOIN kullanicilar k ON a.kullanici_id = k.id
       WHERE a.ts >= ?
       GROUP BY a.kullanici_id ORDER BY sorgu DESC LIMIT 20`
    ).bind(sinir).all().catch(() => ({ results: [] as any[] })),
  ]);

  // Yaklaşık maliyet (Gemini 2.5 Flash: input $0.075/M, output $0.30/M; varsay 800 in + 200 out)
  const tahminMaliyet = (toplam?.n ?? 0) * (800 * 0.075 + 200 * 0.30) / 1_000_000;

  return c.json({
    gun,
    toplam_sorgu: toplam?.n ?? 0,
    tahmini_maliyet_usd: Math.round(tahminMaliyet * 1000) / 1000,
    model_bazli: modelBazli?.results ?? [],
    top_kullanici: topKullanici?.results ?? [],
  });
});

// ── İlan telemetri istatistikleri ────────────────────────────────
admin.get("/ilan-stats", async (c) => {
  const son24 = Date.now() - 86_400_000;
  const son7 = Date.now() - 7 * 86_400_000;

  const [son24Sayi, son7Sayi, kaynakBazli, ilTopu, kategoriDagilim] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) as n FROM ilanlar WHERE yakalanma_tarihi >= ?").bind(son24).first<{ n: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) as n FROM ilanlar WHERE yakalanma_tarihi >= ?").bind(son7).first<{ n: number }>(),
    c.env.DB.prepare(
      "SELECT kaynak, COUNT(*) as n FROM ilanlar WHERE yakalanma_tarihi >= ? GROUP BY kaynak"
    ).bind(son7).all(),
    c.env.DB.prepare(
      "SELECT il_norm, COUNT(*) as n FROM ilanlar WHERE yakalanma_tarihi >= ? GROUP BY il_norm ORDER BY n DESC LIMIT 15"
    ).bind(son7).all(),
    c.env.DB.prepare(
      "SELECT kategori, COUNT(*) as n FROM ilanlar GROUP BY kategori"
    ).all(),
  ]);

  return c.json({
    son24s: son24Sayi?.n ?? 0,
    son7gun: son7Sayi?.n ?? 0,
    kaynak_bazli: kaynakBazli.results ?? [],
    top_il: ilTopu.results ?? [],
    kategori: kategoriDagilim.results ?? [],
  });
});

// ── Operasyon KPI (doğruluk ve veri kalitesi) ──────────────────────
admin.get("/operasyon-kpi", async (c) => {
  const gun = Math.min(Math.max(parseInt(c.req.query("gun") ?? "7"), 1), 30);
  const sinir = Date.now() - gun * 86_400_000;

  const [hacim, eksikMahalle, eksikM2, satirlar] = await Promise.all([
    c.env.DB.prepare(
      "SELECT COUNT(*) as n FROM ilanlar WHERE yakalanma_tarihi >= ? AND aktif = 1",
    ).bind(sinir).first<{ n: number }>(),
    c.env.DB.prepare(
      "SELECT COUNT(*) as n FROM ilanlar WHERE yakalanma_tarihi >= ? AND aktif = 1 AND mahalle_norm IS NULL",
    ).bind(sinir).first<{ n: number }>(),
    c.env.DB.prepare(
      "SELECT COUNT(*) as n FROM ilanlar WHERE yakalanma_tarihi >= ? AND aktif = 1 AND (m2 IS NULL OR m2 <= 0)",
    ).bind(sinir).first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT i.fiyat_per_m2 as fiyat_per_m2, m.medyan as medyan
       FROM ilanlar i
       JOIN mahalle_istatistik m
         ON i.il_norm = m.il_norm
        AND i.ilce_norm = m.ilce_norm
        AND i.mahalle_norm = m.mahalle_norm
        AND i.kategori = m.kategori
       WHERE i.yakalanma_tarihi >= ?
         AND i.aktif = 1
         AND i.kategori = 'arsa'
         AND i.mahalle_norm IS NOT NULL
         AND i.fiyat_per_m2 > 0
         AND m.medyan > 0
       LIMIT 5000`,
    ).bind(sinir).all<{ fiyat_per_m2: number; medyan: number }>(),
  ]);

  const toplam = hacim?.n ?? 0;
  const eksikMahalleN = eksikMahalle?.n ?? 0;
  const eksikM2N = eksikM2?.n ?? 0;

  const mahalleEslesmeOrani = toplam > 0
    ? ((toplam - eksikMahalleN) / toplam) * 100
    : 0;
  const veriEksikOrani = toplam > 0
    ? ((eksikMahalleN + eksikM2N) / (toplam * 2)) * 100
    : 0;

  const sapmalar = (satirlar.results ?? [])
    .map((r) => Math.abs((r.fiyat_per_m2 - r.medyan) / r.medyan))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  const medyanSapma = sapmalar.length > 0
    ? sapmalar[Math.floor(sapmalar.length / 2)]! * 100
    : null;

  const durum =
    mahalleEslesmeOrani >= 90 && (medyanSapma == null || medyanSapma <= 35) && veriEksikOrani <= 15
      ? "iyi"
      : mahalleEslesmeOrani >= 80 && (medyanSapma == null || medyanSapma <= 50) && veriEksikOrani <= 25
        ? "izle"
        : "risk";

  return c.json({
    gun,
    hacim: toplam,
    kpi: {
      mahalle_eslesme_orani: Math.round(mahalleEslesmeOrani * 10) / 10,
      fiyat_medyan_sapma_orani: medyanSapma == null ? null : Math.round(medyanSapma * 10) / 10,
      veri_eksik_orani: Math.round(veriEksikOrani * 10) / 10,
      referans_satir: sapmalar.length,
    },
    ham: {
      eksik_mahalle: eksikMahalleN,
      eksik_m2: eksikM2N,
    },
    durum,
    esikler: {
      mahalle_eslesme_orani_min: 90,
      fiyat_medyan_sapma_orani_max: 35,
      veri_eksik_orani_max: 15,
    },
  });
});

// ── Güvenlik panosu (başarısız giriş + rate limit) ──────────────
admin.get("/guvenlik", async (c) => {
  const saat = Math.min(parseInt(c.req.query("saat") ?? "24"), 168);
  const dakikaSinir = Math.floor((Date.now() - saat * 3_600_000) / 60_000);

  const [topIp, denemeToplam, rateAsim] = await Promise.all([
    c.env.DB.prepare(
      `SELECT ip, SUM(sayi) as toplam FROM giris_denemesi WHERE dakika >= ?
       GROUP BY ip ORDER BY toplam DESC LIMIT 20`
    ).bind(dakikaSinir).all().catch(() => ({ results: [] as any[] })),
    c.env.DB.prepare(
      `SELECT SUM(sayi) as n FROM giris_denemesi WHERE dakika >= ?`
    ).bind(dakikaSinir).first<{ n: number }>().catch(() => ({ n: 0 })),
    c.env.DB.prepare(
      `SELECT ip, istek_sayisi, saat as saat_idx FROM rate_limit
       WHERE saat >= ? AND istek_sayisi >= 100
       ORDER BY istek_sayisi DESC LIMIT 20`
    ).bind(Math.floor((Date.now() - saat * 3_600_000) / 3_600_000)).all().catch(() => ({ results: [] as any[] })),
  ]);

  return c.json({
    saat,
    basarisiz_giris_toplam: denemeToplam?.n ?? 0,
    suspect_ip: topIp.results ?? [],
    rate_limit_asim: rateAsim.results ?? [],
  });
});

// ── Admin denetim logu ───────────────────────────────────────────
admin.get("/log", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50"), 500);
  const rows = await c.env.DB.prepare(
    `SELECT l.id, l.admin_id, k.email as admin_email, l.olay, l.hedef_id, l.payload, l.ip, l.ts
     FROM admin_log l LEFT JOIN kullanicilar k ON k.id = l.admin_id
     ORDER BY l.ts DESC LIMIT ?`
  ).bind(limit).all();
  return c.json({ log: rows.results });
});

// ── Trend zaman serisi (son N gün) ──────────────────────────────
admin.get("/trend", async (c) => {
  const gun = Math.min(parseInt(c.req.query("gun") ?? "30"), 90);
  const now = Date.now();
  const baslangic = now - gun * 86_400_000;

  // Günlük bucket — SQLite tarih fonksiyonları yerine integer math
  const [kayitlar, ilanlar, aiKayit] = await Promise.all([
    c.env.DB.prepare(
      `SELECT (olusturuldu / 86400000) as gunIdx, COUNT(*) as n
       FROM kullanicilar WHERE olusturuldu >= ? GROUP BY gunIdx ORDER BY gunIdx`
    ).bind(baslangic).all<{ gunIdx: number; n: number }>(),
    c.env.DB.prepare(
      `SELECT (yakalanma_tarihi / 86400000) as gunIdx, COUNT(*) as n
       FROM ilanlar WHERE yakalanma_tarihi >= ? GROUP BY gunIdx ORDER BY gunIdx`
    ).bind(baslangic).all<{ gunIdx: number; n: number }>(),
    c.env.DB.prepare(
      `SELECT (ts / 86400000) as gunIdx, COUNT(*) as n
       FROM ai_kullanim WHERE ts >= ? GROUP BY gunIdx ORDER BY gunIdx`
    ).bind(baslangic).all<{ gunIdx: number; n: number }>().catch(() => ({ results: [] as any[] })),
  ]);

  // Her gün için bucket array oluştur
  const today = Math.floor(now / 86_400_000);
  const start = today - gun + 1;
  const seri: { tarih: string; kullanici: number; ilan: number; ai: number }[] = [];
  const kayitMap = new Map((kayitlar.results ?? []).map(r => [r.gunIdx, r.n]));
  const ilanMap = new Map((ilanlar.results ?? []).map(r => [r.gunIdx, r.n]));
  const aiMap = new Map((aiKayit.results ?? []).map((r: any) => [r.gunIdx, r.n]));
  for (let i = 0; i < gun; i++) {
    const idx = start + i;
    const tarih = new Date(idx * 86_400_000).toISOString().slice(0, 10);
    seri.push({
      tarih,
      kullanici: kayitMap.get(idx) ?? 0,
      ilan: ilanMap.get(idx) ?? 0,
      ai: aiMap.get(idx) ?? 0,
    });
  }
  return c.json({ gun, seri });
});

// ── Kullanıcı detay (drawer için) ───────────────────────────────
admin.get("/kullanici/:id/detay", async (c) => {
  const id = parseInt(c.req.param("id"));
  const k = await c.env.DB.prepare(
    `SELECT id, email, ad, tier, tier_bitis, durum, admin, email_dogrulandi, olusturuldu, son_giris
     FROM kullanicilar WHERE id = ?`
  ).bind(id).first();
  if (!k) return c.json({ hata: "Kullanıcı yok" }, 404);

  const [aiSayim, aiSon, son30AiTrend, adminAksiyon] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) as toplam FROM ai_kullanim WHERE kullanici_id = ?`
    ).bind(id).first<{ toplam: number }>().catch(() => ({ toplam: 0 })),
    c.env.DB.prepare(
      `SELECT model, ts FROM ai_kullanim WHERE kullanici_id = ? ORDER BY ts DESC LIMIT 10`
    ).bind(id).all().catch(() => ({ results: [] as any[] })),
    c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM ai_kullanim WHERE kullanici_id = ? AND ts >= ?`
    ).bind(id, Date.now() - 30 * 86_400_000).first<{ n: number }>().catch(() => ({ n: 0 })),
    c.env.DB.prepare(
      `SELECT olay, payload, ts FROM admin_log WHERE hedef_id = ? ORDER BY ts DESC LIMIT 20`
    ).bind(id).all().catch(() => ({ results: [] as any[] })),
  ]);

  return c.json({
    kullanici: k,
    ai: {
      toplam: aiSayim?.toplam ?? 0,
      son30gun: son30AiTrend?.n ?? 0,
      son_sorgular: aiSon.results ?? [],
    },
    admin_aksiyon: adminAksiyon.results ?? [],
  });
});

// ── Outlier / şüpheli ilanlar (veri kalitesi) ────────────────────
admin.get("/outlier", async (c) => {
  // Kategori bazında ulusal medyan + IQR — ekstrem fiyatları yakala
  const sinir = Date.now() - 30 * 86_400_000;
  const cokYuksek = await c.env.DB.prepare(
    `SELECT id, kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, kategori, fiyat_per_m2, m2, yakalanma_tarihi
     FROM ilanlar
     WHERE yakalanma_tarihi >= ? AND aktif = 1 AND fiyat_per_m2 > 500000
     ORDER BY fiyat_per_m2 DESC LIMIT 30`
  ).bind(sinir).all();
  const cokDusuk = await c.env.DB.prepare(
    `SELECT id, kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, kategori, fiyat_per_m2, m2, yakalanma_tarihi
     FROM ilanlar
     WHERE yakalanma_tarihi >= ? AND aktif = 1 AND fiyat_per_m2 < 50
     ORDER BY fiyat_per_m2 ASC LIMIT 30`
  ).bind(sinir).all();
  const eksikMahalle = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM ilanlar WHERE yakalanma_tarihi >= ? AND mahalle_norm IS NULL`
  ).bind(sinir).first<{ n: number }>();
  const eksikM2 = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM ilanlar WHERE yakalanma_tarihi >= ? AND (m2 IS NULL OR m2 <= 0)`
  ).bind(sinir).first<{ n: number }>();

  return c.json({
    cok_yuksek: cokYuksek.results ?? [],
    cok_dusuk: cokDusuk.results ?? [],
    eksik_mahalle: eksikMahalle?.n ?? 0,
    eksik_m2: eksikM2?.n ?? 0,
  });
});

// ── Şüpheli ilanı pasifleştir ────────────────────────────────────
admin.post("/ilan/:id/pasif", async (c) => {
  const adminId = c.get("adminId" as any) as number;
  const id = parseInt(c.req.param("id"));
  await c.env.DB.prepare("UPDATE ilanlar SET aktif = 0 WHERE id = ?").bind(id).run();
  await logla(c.env, adminId, "ilan-pasif", id, null, getIP(c));
  return c.json({ basarili: true });
});

// ── Tier bitiş yaklaşan aboneler ─────────────────────────────────
admin.get("/yaklasan-bitis", async (c) => {
  const gun = Math.min(parseInt(c.req.query("gun") ?? "7"), 30);
  const sinir = Date.now() + gun * 86_400_000;
  const rows = await c.env.DB.prepare(
    `SELECT id, email, ad, tier, tier_bitis FROM kullanicilar
     WHERE tier_bitis IS NOT NULL AND tier != 'free' AND tier_bitis <= ? AND tier_bitis > ?
     ORDER BY tier_bitis ASC LIMIT 100`
  ).bind(sinir, Date.now()).all();
  const sonaErenler = await c.env.DB.prepare(
    `SELECT id, email, tier, tier_bitis FROM kullanicilar
     WHERE tier_bitis IS NOT NULL AND tier_bitis < ? AND tier != 'free'
     ORDER BY tier_bitis DESC LIMIT 50`
  ).bind(Date.now()).all();
  return c.json({
    gun,
    yaklasan: rows.results ?? [],
    suresi_dolmus: sonaErenler.results ?? [],
  });
});

// ── Manuel cron tetikleme ────────────────────────────────────────
admin.post("/cron-tetikle", async (c) => {
  const adminId = c.get("adminId" as any) as number;
  const { istatistikRefresh } = await import("./istatistik.js");
  const sonuc = await istatistikRefresh(c.env.DB);
  await logla(c.env, adminId, "cron-tetikle", null, sonuc, getIP(c));
  return c.json({ basarili: true, sonuc });
});

// ── Newsletter Blast (Resend bulk) ───────────────────────────────
// Tüm waitlist'e tek tıkla duyuru maili. Lansman, yeni feature vs için.
admin.post("/newsletter-blast", async (c) => {
  const adminId = c.get("adminId" as any) as number;
  const body = await c.req.json<{ konu?: string; html?: string; metin?: string; test?: boolean }>().catch(() => ({} as any));
  if (!body.konu || !body.html || !body.metin) {
    return c.json({ hata: "konu, html, metin zorunlu" }, 400);
  }
  const apiKey = (c.env as any).RESEND_API_KEY as string | undefined;
  if (!apiKey) return c.json({ hata: "RESEND_API_KEY tanımlı değil" }, 500);

  // Test moduysa sadece adminin emailine gönder
  let aliciler: { email: string }[];
  if (body.test) {
    const adm = await c.env.DB.prepare("SELECT email FROM kullanicilar WHERE id = ?").bind(adminId).first<{ email: string }>();
    if (!adm) return c.json({ hata: "Admin email yok" }, 500);
    aliciler = [{ email: adm.email }];
  } else {
    const r = await c.env.DB.prepare("SELECT email FROM newsletter_aboneler").all<{ email: string }>();
    aliciler = r.results ?? [];
  }

  if (aliciler.length === 0) return c.json({ hata: "Gönderilecek email yok" }, 400);

  // Resend batch API — max 100 per request, chunk it
  let gonderildi = 0, hata = 0;
  for (let i = 0; i < aliciler.length; i += 100) {
    const chunk = aliciler.slice(i, i + 100);
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(chunk.map(a => ({
          from: "Cadastrum <noreply@cadastrum.com.tr>",
          to: [a.email],
          subject: body.konu,
          html: body.html,
          text: body.metin,
        }))),
      });
      if (res.ok) gonderildi += chunk.length;
      else { hata += chunk.length; console.error("[blast]", res.status, await res.text()); }
    } catch (e) {
      hata += chunk.length;
      console.error("[blast] istisna:", e);
    }
    // Resend rate limit nezaketi (2 req/sec)
    await new Promise(r => setTimeout(r, 600));
  }

  await logla(c.env, adminId, "newsletter-blast", null, {
    konu: body.konu, alici: aliciler.length, gonderildi, hata, test: !!body.test,
  }, getIP(c));

  return c.json({ basarili: true, alici: aliciler.length, gonderildi, hata });
});

// ── CSV export ───────────────────────────────────────────────────
admin.get("/export/kullanicilar", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, email, ad, tier, tier_bitis, durum, email_dogrulandi, olusturuldu, son_giris
     FROM kullanicilar ORDER BY id`
  ).all<any>();
  const head = "id,email,ad,tier,tier_bitis,durum,email_dogrulandi,olusturuldu,son_giris\n";
  const csvKacis = (v: any) => v == null ? "" : `"${String(v).replace(/"/g, '""')}"`;
  const body = (rows.results ?? []).map((r: any) =>
    [r.id, r.email, r.ad, r.tier, r.tier_bitis, r.durum, r.email_dogrulandi, r.olusturuldu, r.son_giris]
      .map(csvKacis).join(",")
  ).join("\n");
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="kullanicilar-${Date.now()}.csv"`);
  return c.body(head + body);
});

// ── Backend sağlık ───────────────────────────────────────────────
admin.get("/saglik", async (c) => {
  const sirlar = {
    JWT_SECRET: !!c.env.JWT_SECRET,
    SCRAPER_API_SECRET: !!c.env.SCRAPER_API_SECRET,
    RESEND_API_KEY: !!c.env.RESEND_API_KEY,
    LEMON_WEBHOOK_SECRET: !!c.env.LEMON_WEBHOOK_SECRET,
    GEMINI_API_KEY: !!c.env.GEMINI_API_KEY,
    GROQ_API_KEY: !!c.env.GROQ_API_KEY,
  };

  // D1 boyut tahmini (tablo bazlı row sayısı)
  const tablolar = ["kullanicilar", "ilanlar", "mahalle_baseline_ai", "mahalle_istatistik"];
  const sayilar: Record<string, number> = {};
  for (const t of tablolar) {
    try {
      const r = await c.env.DB.prepare(`SELECT COUNT(*) as n FROM ${t}`).first<{ n: number }>();
      sayilar[t] = r?.n ?? 0;
    } catch { sayilar[t] = -1; }
  }

  return c.json({
    env: c.env.ENVIRONMENT,
    sirlar,
    tablo_satir_sayisi: sayilar,
    ts: Date.now(),
  });
});

export { admin as adminRoutes };
