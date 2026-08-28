/**
 * Paylaşılan AI sağlayıcı altyapısı — Gemini/Groq için circuit breaker + fetch timeout.
 *
 * ai-fiyat.ts ve ai-scorecard.ts aynı iki sağlayıcıyı (Gemini primary, Groq fallback)
 * birbirinden bağımsız çağırıyordu: hiçbir fetch'te timeout yoktu (Gemini/Groq
 * yavaşladığında istek Workers'ın platform limitine kadar askıda kalabiliyordu),
 * ve sürekli bir kesinti sırasında bile her istek yine ikisini de baştan deniyordu
 * (hızlı-fail yok). `lib/resilience.ts`'teki CircuitBreaker/retryWithBackoff hazır
 * ama hiç kullanılmıyordu — bu modül onları tek yerden, iki route'un paylaşacağı
 * tek breaker çifti olarak sağlar.
 */
import { CircuitBreaker, retryWithBackoff } from "./resilience.js";

export const GEMINI_TIMEOUT_MS = 12_000;
export const GROQ_TIMEOUT_MS = 8_000;

/** Modül seviyesinde singleton — isolate ömrü boyunca paylaşılır, recycle'da sıfırlanması sorun değil. */
export const geminiBreaker = new CircuitBreaker({
  name: "gemini",
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
});

/** Groq son çare fallback — Gemini'den daha erken açılır (arkasında başka fallback yok, hızlı fail daha değerli). */
export const groqBreaker = new CircuitBreaker({
  name: "groq",
  failureThreshold: 3,
  resetTimeoutMs: 20_000,
});

/** fetch + AbortSignal.timeout — proxy.ts'deki tile-fetch pattern'iyle aynı, burada AI çağrılarına uygulanıyor. */
export function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

/**
 * Groq için retry — sadece Groq'a uygulanıyor (son çare fallback). Gemini'yi retry
 * etmek zaten sıradaki fallback'i (Groq) geciktirir, faydası maliyetine değmez.
 */
export function groqWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  return retryWithBackoff(fn, { maxRetries: 2, initialDelayMs: 300, maxDelayMs: 2000 });
}
