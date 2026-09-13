/**
 * IP tabanlı istek sınırı — Cloudflare Workers Rate Limiting binding'i.
 *
 * ── NEDEN DEĞİŞTİ (2026-09-13) ──────────────────────────────────────────────
 *
 * Eski sınırlayıcı her istekte KV `get` + `put` yapıyordu. Ücretsiz katmanda
 * KV günde 1.000 YAZMA. Yazma sayısı IP başına sınırla değil TOPLAM istekle
 * büyüyor: 1.000 farklı ziyaretçi birer sorgu atsa kota biter. Bitince
 * `put` hatası yutulduğu için sınırlayıcı sessizce devre dışı kalıyor, aynı
 * KV'yi kullanan önbellekler (doğrulama raporu, statik paket) de yazamıyordu.
 * Yüksek trafik tam da sınırlayıcının gerektiği an onu kapatıyordu.
 *
 * Cloudflare'in yerleşik sınırlayıcısı KV/D1 kullanmıyor ve ücretsiz. İki
 * kısıtı var:
 *   - pencere yalnızca 10 ya da 60 saniye (saatlik yok)
 *   - sınır binding başına sabit, anahtar başına değil
 *
 * Bu yüzden 35 ayrı saatlik kural 4 dakikalık SINIFA eşleniyor
 * (`sinifSec`). Çağrı yerleri değişmedi; saatlik sayı sınıf seçimine girdi
 * olarak kalıyor ve kuralın niyetini belgeliyor.
 *
 * ── BİLİNÇLİ TAKAS ──────────────────────────────────────────────────────────
 *
 * Saatlik garanti dakikalığa dönünce pahalı uçlarda IP başına saatlik tavan
 * yükseliyor (ör. 5/saat → 2/dk = 120/saat). Karşılığında sınırlayıcı trafik
 * ne olursa olsun ÇALIŞIYOR. Eski saatlik garanti zaten kota dolunca yok
 * oluyordu. Pahalı AI uçları (ai-ajan, takip, v2) ayrıca kimlik doğrulaması
 * istiyor. Kötüye kullanım görülürse sonraki adım Turnstile.
 *
 * Cloudflare sınırlayıcısı konum (colo) başına ve nihai tutarlı; sayım kesin
 * değil. Kalan hak bilgisi dönmüyor, bu yüzden X-RateLimit-Remaining artık
 * YOK. Site (sorgu.astro) başlık yoksa satırı gizliyor.
 */
import type { MiddlewareHandler } from "hono";
import type { Env } from "../index.js";

/** CF-Connecting-IP en güvenilir; yoksa X-Forwarded-For'un ilki. */
function istemciIp(req: Request): string {
  return (
    req.headers.get("CF-Connecting-IP") ??
    req.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export type SinirSinifi = "SINIR_YOGUN" | "SINIR_GENEL" | "SINIR_DAR" | "SINIR_PAHALI";

/**
 * Dakikalık sınıf limitleri — wrangler.toml [[ratelimits]] ile AYNI olmalı.
 * Binding limiti koddan okunamıyor; başlıkta göstermek için burada tekrar
 * ediliyor. Ayrışırsa test/rate-limit.spec.ts wrangler.toml'u okuyup kırılır.
 */
export const SINIF_DAKIKA_LIMIT: Record<SinirSinifi, number> = {
  SINIR_YOGUN: 120,
  SINIR_GENEL: 30,
  SINIR_DAR: 10,
  SINIR_PAHALI: 2,
};

/**
 * Saatlik niyet → dakikalık sınıf.
 *
 * Eşikler mevcut kuralların doğal kümeleri (ölçüm: 35 kuralın dağılımı):
 *   ≥300  harita, TUCBS döşeme, TKGM idari — tek sayfa açılışı onlarca istek
 *   60-299  fiyat, sorgu, emsal, proxy'ler, telemetri, ilan, portföy
 *   20-59   endeks, rapor, takip, uydu görsel, web sorgu, bölge analizi
 *   <20     newsletter, AI fırsat/portföy, uydu analizi, rapor üretimi, v2 batch
 * Dakikalık limit ≈ saatlik/6–10 → kısa patlamaya izin, sürekli yüke değil.
 */
export function sinifSec(saatlikNiyet: number): SinirSinifi {
  if (saatlikNiyet >= 300) return "SINIR_YOGUN";
  if (saatlikNiyet >= 60) return "SINIR_GENEL";
  if (saatlikNiyet >= 20) return "SINIR_DAR";
  return "SINIR_PAHALI";
}

/**
 * Aynı istekte aynı önek İKİ KEZ sayılmasın. Eskiden bazı uçlarda hem index'te
 * hem route'ta aynı önekli sınırlayıcı vardı (takip, api-v2-degerle,
 * uydu-analiz) ve her istek iki kez sayılıyordu → gerçek sınır yazılanın yarısı.
 * Farklı önekler (ör. "rapor" + "rapor-post") bilinçli katmanlama, ikisi de sayılır.
 */
const sayilanOnekler = new WeakMap<Request, Set<string>>();

/** Binding eksik/bozuk uyarısı isolate başına saatte bir — istek başına değil. */
const sonUyari = new Map<string, number>();
function uyariBas(tur: string, mesaj: string, hata?: unknown) {
  const simdi = Date.now();
  if (simdi - (sonUyari.get(tur) ?? 0) < 60 * 60 * 1000) return;
  sonUyari.set(tur, simdi);
  console.warn(`[rate-limit] ${mesaj}`, hata ?? "");
}

/**
 * @param saatlikNiyet kuralın saatlik niyeti — sınıfı seçer (bkz. sinifSec)
 * @param onek aynı IP'yi farklı uç grupları için ayrı saymak için
 */
export function rateLimitMiddleware(
  saatlikNiyet: number,
  onek = "global",
): MiddlewareHandler<{ Bindings: Env }> {
  const sinif = sinifSec(saatlikNiyet);
  const dakikaLimit = SINIF_DAKIKA_LIMIT[sinif];

  return async (c, next) => {
    const istek = c.req.raw;
    let sayilan = sayilanOnekler.get(istek);
    if (!sayilan) {
      sayilan = new Set();
      sayilanOnekler.set(istek, sayilan);
    }
    if (sayilan.has(onek)) {
      await next();
      return;
    }
    sayilan.add(onek);

    const binding = c.env[sinif];
    if (!binding) {
      // Yerel geliştirme ve testler binding'siz koşuyor. Üretimde binding
      // eksikse bu uyarı görünür; istek engellenmez (erişilebilirlik > sınır).
      uyariBas(`yok:${sinif}`, `${sinif} binding'i yok — sınır uygulanmıyor (${onek})`);
      await next();
      return;
    }

    let basarili: boolean;
    try {
      ({ success: basarili } = await binding.limit({ key: `${onek}:${istemciIp(istek)}` }));
    } catch (e) {
      // Sınırlayıcı arızası isteği düşürmez — ama görünür.
      uyariBas(`hata:${sinif}`, `${sinif} limit() hatası — istek sınırsız geçti (${onek})`, e);
      await next();
      return;
    }

    c.header("X-RateLimit-Limit", String(dakikaLimit));
    c.header("X-RateLimit-Policy", `${dakikaLimit};w=60`);

    if (!basarili) {
      c.header("Retry-After", "60");
      return c.json(
        {
          error: "İstek sınırı aşıldı. Bir dakika sonra tekrar deneyin.",
          limit: dakikaLimit,
          pencere_saniye: 60,
          retry_after_saniye: 60,
        },
        429,
      );
    }

    await next();
  };
}

/**
 * Eski D1 `rate_limit` tablosunu temizler. Yeni sınırlayıcı bu tabloya
 * yazmıyor; tablo boşalana kadar günlük cron'da kalıyor.
 */
export async function rateLimitTemizle(db: D1Database): Promise<{ silinen: number }> {
  const eskiSaatSiniri = Math.floor(Date.now() / 3_600_000) - 48;
  const sonuc = await db
    .prepare("DELETE FROM rate_limit WHERE saat < ?")
    .bind(eskiSaatSiniri)
    .run();
  return { silinen: sonuc.meta.changes ?? 0 };
}
