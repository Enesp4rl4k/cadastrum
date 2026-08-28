/**
 * D1 çağrısı için timeout pattern.
 *
 * Workers, devam eden bir D1 çağrısını native olarak iptal edemez — bu yüzden
 * bu yardımcı alttaki sorguyu İPTAL ETMEZ (sunucu tarafında çalışmaya devam
 * eder), sadece Worker'ın yanıt yolunu tıkanmaktan kurtarır: `Promise.race`
 * ile bir zamanlayıcıya karşı yarışır. `retryWithBackoff`/`CircuitBreaker`'ın
 * fetch için kabul ettiği aynı kısıt, iptal olmadan.
 *
 * Sadece OKUMA sorgularına uygula (cache-lookup, hot-path GET). Yazma
 * işlemlerini (rate-limit UPSERT, telemetri insert, job status update)
 * sarmalama — bunlar zaten fire-and-forget/fail-open, timeout eklemek
 * sessiz veri kaybı riski taşır.
 */
const TIMEOUT = Symbol("d1-timeout");

export async function d1WithTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<typeof TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export function isD1Timeout(v: unknown): v is typeof TIMEOUT {
  return v === TIMEOUT;
}
