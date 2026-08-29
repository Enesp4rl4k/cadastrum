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

import type { D1Database } from "@cloudflare/workers-types";

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
export async function sunucuHatasiKaydet(
  db: D1Database | undefined,
  err: unknown,
  baglam: HataBaglami = {},
): Promise<boolean> {
  if (!db) return false;
  if (!throttleGecer(Date.now())) return false;

  try {
    const hata = err instanceof Error ? err : new Error(String(err));
    const meta = JSON.stringify({
      method: baglam.method ?? null,
      path: baglam.path ?? null,
    });

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
    return true;
  } catch {
    // Yutuluyor — bkz. dosya başındaki "ASLA throw etmez" kuralı. Tabloya
    // yazamıyorsak (migration uygulanmamış, D1 erişilemez vb.) yapılacak
    // anlamlı bir şey yok; console.error zaten çağıran tarafta atılıyor.
    return false;
  }
}
