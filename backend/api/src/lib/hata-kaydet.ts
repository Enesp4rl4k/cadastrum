/**
 * Sunucu tarafı hata kaydı — `hata_log` tablosuna yazar.
 *
 * NEDEN: `hata_log` şu ana kadar YALNIZCA `telemetri.ts` üzerinden, yani
 * extension'ın bildirdiği İSTEMCİ hatalarından besleniyordu. Worker'da atılan
 * hiçbir hata hiçbir yere kalıcı olarak yazılmıyordu; `SENTRY_DSN` de üretimde
 * boş olduğu için Sentry no-op durumunda. Sonuç: üretimde sunucu hatalarının
 * görünürlüğü sıfırdı — bir şey bozulduğunda ancak D1'i elle sorgulayarak
 * ya da `wrangler tail` açıkken şans eseri fark edilebiliyordu.
 *
 * Tasarım kuralları:
 *   - ASLA throw etmez. onError içinden çağrılıyor; buradan atılacak bir hata
 *     asıl hatayı maskeler ve 500 yanıtını bozar.
 *   - Yanıtı bloklamaz — çağıran taraf waitUntil ile arka plana atar.
 *   - Hata fırtınasına karşı izolat başına throttle'lı: sonsuz döngüye giren
 *     bir endpoint D1 yazma kotasını tüketmesin.
 */

import type { D1Database, KVNamespace } from "@cloudflare/workers-types";

/** Alan uzunluk sınırları — tek bir hata satırı D1'i şişirmesin. */
const MAX_MESAJ = 500;
const MAX_STACK = 2000;
const MAX_META = 1000;

/**
 * İzolat başına yazma throttle'ı. Workers izolatları kısa ömürlü olduğundan
 * bu global bir kota değil, yalnızca tek bir izolatın kaçak döngüye girip
 * saniyede yüzlerce satır yazmasını engelleyen bir emniyet supabı.
 */
const PENCERE_MS = 60_000;
const PENCERE_BASINA_MAX = 20;
let pencereBasi = 0;
let pencereSayac = 0;

function throttleGecer(simdi: number): boolean {
  if (simdi - pencereBasi > PENCERE_MS) {
    pencereBasi = simdi;
    pencereSayac = 0;
  }
  if (pencereSayac >= PENCERE_BASINA_MAX) return false;
  pencereSayac++;
  return true;
}

/** Testler arası durumu sıfırlamak için — üretim kodu çağırmaz. */
export function _throttleSifirla(): void {
  pencereBasi = 0;
  pencereSayac = 0;
}

function kirp(s: string | undefined | null, max: number): string | null {
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

export interface HataBaglami {
  method?: string;
  path?: string;
  requestId?: string;
}

/**
 * Bir sunucu hatasını `hata_log`'a yazar.
 *
 * @returns yazıldıysa true, throttle/hata nedeniyle atlandıysa false.
 *   Dönüş değeri esasen test içindir; çağıranın buna göre dallanması gerekmez.
 */
/** KV yedek kaydının ömrü — D1 düzelince okunup temizlenmeye yetecek kadar. */
const KV_YEDEK_TTL_SN = 7 * 24 * 60 * 60;

/**
 * Nereye yazıldığı: "d1" normal yol, "kv" D1 başarısızken yedek, false hiçbiri.
 *
 * ── NEDEN KV YEDEĞİ (2026-09-11) ────────────────────────────────────────────
 *
 * D1 okuma limiti dolduğunda /v1/fiyat/* canlı 500 döndü ama `hata_log`'da
 * son 7 günde SIFIR backend satırı vardı. Hata kaydı, çöken şeyin ta kendisine
 * (D1) yazılıyordu ve catch bunu tasarım gereği yutuyordu: kesinti kendi
 * kanıtını siliyordu. Artık D1 yazamazsa kayıt KV'ye düşüyor ve bu durum
 * sabit adlı yapılandırılmış bir log olayıyla (`hata-log.d1-yazilamadi`)
 * görünür kalıyor. "ASLA throw etmez" kuralı korunuyor.
 */
export async function sunucuHatasiKaydet(
  db: D1Database | undefined,
  err: unknown,
  baglam: HataBaglami = {},
  kv?: KVNamespace,
): Promise<"d1" | "kv" | false> {
  if (!db && !kv) return false;
  if (!throttleGecer(Date.now())) return false;

  const hata = err instanceof Error ? err : new Error(String(err));
  const meta = JSON.stringify({
    method: baglam.method ?? null,
    path: baglam.path ?? null,
  });

  try {
    if (!db) throw new Error("D1 binding yok");

    await db
      .prepare(
        `INSERT INTO hata_log (kaynak, mesaj, stack, surum, meta, ts, request_id)
         VALUES ('backend', ?, ?, NULL, ?, ?, ?)`,
      )
      .bind(
        kirp(hata.message || String(err), MAX_MESAJ) ?? "(bos mesaj)",
        kirp(hata.stack, MAX_STACK),
        kirp(meta, MAX_META),
        Date.now(),
        kirp(baglam.requestId, 100),
      )
      .run();
    return "d1";
  } catch (d1Hatasi) {
    // D1 yazamadı — SESSİZCE yutulmuyor. Sabit adlı olay: wrangler tail /
    // Logpush ile süzülebilir; "hata kaydı da başarısız" durumu artık görünür.
    console.error(JSON.stringify({
      event: "hata-log.d1-yazilamadi",
      d1: d1Hatasi instanceof Error ? d1Hatasi.message.slice(0, 200) : String(d1Hatasi).slice(0, 200),
      asil: kirp(hata.message, 200),
      path: baglam.path ?? null,
      requestId: baglam.requestId ?? null,
    }));
    if (!kv) return false;
    try {
      const ts = Date.now();
      await kv.put(
        `hata:${ts}:${Math.random().toString(36).slice(2, 8)}`,
        JSON.stringify({
          ts,
          mesaj: kirp(hata.message || String(err), MAX_MESAJ),
          stack: kirp(hata.stack, MAX_STACK),
          meta: kirp(meta, MAX_META),
          requestId: kirp(baglam.requestId, 100),
          d1Hatasi: d1Hatasi instanceof Error ? d1Hatasi.message.slice(0, 200) : null,
        }),
        { expirationTtl: KV_YEDEK_TTL_SN },
      );
      return "kv";
    } catch {
      // beklenen yokluk değil, gerçek çift arıza: D1 ve KV ikisi de yazamıyor.
      // Yukarıdaki console.error olayı zaten atıldı; burada yapılacak başka
      // bir şey yok ve onError'dan fırlatmak asıl 500'ü maskelerdi.
      return false;
    }
  }
}
