/**
 * GET /v1/statik/harita
 *
 * Harita sayfasının HER ziyarette zorunlu olan ilk yüklemesini (özet ısı
 * verisi + ilçe merkezleri) ve iki opsiyonel katmanı (gelişen bölgeler, fiyat
 * trendi) TEK pakette toplar. Site build'i bunu bir kez indirip statik dosya
 * olarak Pages'e koyuyor; ziyaretçi trafiği Worker'a hiç gitmiyor.
 *
 * ── NEDEN (2026-09-14) ──────────────────────────────────────────────────────
 *
 * Ücretsiz Workers planı günde 100.000 İSTEK ile sınırlı — bu, D1 bütçesinden
 * TAMAMEN AYRI bir tavan; istek 429/kısıtlı bile dönse yine bu sayaca girer.
 * Hiçbir kod optimizasyonu bu tavanı kaldırmaz, yalnızca isteğin Worker'a HİÇ
 * gitmemesi kaldırır. /harita/ozet + /harita/ilceler ikisi birden her tek
 * ziyarette (yakınlaştırma, katman değişimi olmadan bile) tetikleniyordu.
 *
 * ── TASARIM ─────────────────────────────────────────────────────────────────
 *
 * Canlı rotaları YENİDEN YAZMIYOR — aynı Hono alt-uygulamasını (haritaRoutes)
 * dahili olarak çağırıyor (`haritaRoutes.request(...)`), gerçek bir ağ
 * atlaması yok, D1 sorgusu sayısı sabit: 5 (analizTip) + 1 (ilçeler) + 1
 * (gelişen bölgeler) + 2 (trend kategorisi) = 9 — D1'in çağrı başına 50 sorgu
 * sınırının çok altında. Mantık TEK yerde olduğu için statik paket canlı
 * yanıttan yapısal olarak ayrışamaz.
 *
 * Faz 1'deki (routes/statik.ts) günlük KV önbelleği deseni aynen tekrar
 * ediliyor: paketGunu() aynı fonksiyon, aynı 03:30 UTC sınırı.
 */
import { Hono } from "hono";
import type { Env } from "../index.js";
import { haritaRoutes } from "./harita.js";
import { paketGunu } from "./statik.js";

export const statikHaritaRoutes = new Hono<{ Bindings: Env }>();

export const HARITA_PAKET_SURUMU = 1;
const HARITA_TTL_SN = 36 * 60 * 60;
const ANALIZ_TIPLERI = [1, 2, 3, 4, 5] as const;
const TREND_KATEGORILERI = ["arsa", "tarla"] as const;

async function ic(env: Env, ctx: ExecutionContext, yol: string): Promise<unknown> {
  const r = await haritaRoutes.request(yol, {}, env, ctx);
  if (!r.ok) throw new Error(`iç çağrı başarısız: ${yol} → HTTP ${r.status}`);
  return r.json();
}

export async function haritaPaketiKur(env: Env, ctx: ExecutionContext) {
  const [ozetler, ilceler, gelisenBolgeler, trendler] = await Promise.all([
    Promise.all(ANALIZ_TIPLERI.map((tip) => ic(env, ctx, `/ozet?analizTip=${tip}`))),
    ic(env, ctx, "/ilceler?v=2"),
    ic(env, ctx, "/gelisen-bolgeler"),
    Promise.all(TREND_KATEGORILERI.map((kat) => ic(env, ctx, `/trend?kategori=${kat}`))),
  ]);

  return {
    surum: HARITA_PAKET_SURUMU,
    uretildi: Date.now(),
    ozet: Object.fromEntries(ANALIZ_TIPLERI.map((tip, i) => [tip, ozetler[i]])),
    ilceler,
    gelisenBolgeler,
    trend: Object.fromEntries(TREND_KATEGORILERI.map((kat, i) => [kat, trendler[i]])),
  };
}

/**
 * Günde bir hesap — aynı gerekçe: routes/statik.ts başlığı. Anahtar uzayı
 * SABİT (parametresiz), yani günlük en fazla 1 hesap tetiklenebilir; bu uçta
 * da (statik.ts gibi) KV tabanlı istek sınırlayıcı YOK.
 */
statikHaritaRoutes.get("/", async (c) => {
  const anahtar = `statik-harita:v${HARITA_PAKET_SURUMU}:${paketGunu()}`;
  const kv = c.env.RATE_LIMIT_KV;
  if (kv) {
    const kayit = await kv.get(anahtar, "text");
    if (kayit) {
      return new Response(kayit, {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Statik-Onbellek": "HIT" },
      });
    }
  }

  const govde = JSON.stringify(await haritaPaketiKur(c.env, c.executionCtx));
  if (kv) await kv.put(anahtar, govde, { expirationTtl: HARITA_TTL_SN });
  return new Response(govde, {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Statik-Onbellek": "MISS" },
  });
});
