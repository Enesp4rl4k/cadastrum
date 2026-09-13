/**
 * D1 günlük kota hatası — tanıma ve yanıt.
 *
 * ── NEDEN (2026-09-13) ──────────────────────────────────────────────────────
 *
 * Ücretsiz katman günlük okuma (5M) ya da yazma (100k) limiti dolunca D1 her
 * sorguda "exceeded D1's free tier daily row read limit" fırlatıyor. Global
 * `onError` bunu diğer her hata gibi işliyordu:
 *
 *  1. Opak 500 — istemci "sunucu bozuk" ile "bugünlük kota bitti, gece açılır"
 *     ayrımını yapamıyordu; neden yanıtta hiç görünmüyordu.
 *  2. HER başarısız istek için `sunucuHatasiKaydet` → önce D1'e (zaten
 *     kilitli), o da düşünce KV'ye yazma. KV ücretsiz katmanda günde 1.000
 *     yazma: yoğun trafikte kota olayı dakikalar içinde KV'yi de tüketip hata
 *     kaydını, istek sınırlayıcıyı ve KV önbelleklerini birlikte düşürürdü.
 *
 * Kota dolu bir gün "sunucu hatası" değil, BEKLENEN ve süresi belli bir
 * durum: 503 + gece yarısına (UTC) kadar Retry-After.
 */

const KOTA_MESAJI = /exceeded D1's free tier daily row (read|write) limit/i;

export function d1KotaHatasiMi(err: unknown): boolean {
  const mesaj = err instanceof Error ? err.message : String(err ?? "");
  return KOTA_MESAJI.test(mesaj);
}

/** D1 kotası 00:00 UTC'de sıfırlanır. En az 60 sn döner (sınırda sıfır yazmasın). */
export function kotaSifirlanmasinaSaniye(zaman?: number): number {
  // Date.now() gövdede: Workers'ta varsayılan parametre/modül düzeyi saat tuzağına düşmesin.
  const simdi = zaman ?? Date.now();
  const g = new Date(simdi);
  const yarin = Date.UTC(g.getUTCFullYear(), g.getUTCMonth(), g.getUTCDate() + 1);
  return Math.max(60, Math.ceil((yarin - simdi) / 1000));
}

/**
 * Kota olayını görünür tut ama HER İSTEKTE değil: isolate başına saatte bir.
 * Modül düzeyi durum isolate ömrü boyunca yaşıyor; birden fazla isolate
 * birkaç satır fazla log demek — istek başına değil.
 */
let sonGunlukKayit = 0;
export function kotaGunlugeYazilsinMi(zaman?: number): boolean {
  const simdi = zaman ?? Date.now();
  if (simdi - sonGunlukKayit < 60 * 60 * 1000) return false;
  sonGunlukKayit = simdi;
  return true;
}
