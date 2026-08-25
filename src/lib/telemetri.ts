/**
 * Hata telemetrisi (istemci) — extension runtime hatalarını backend'e batch'ler.
 *
 * Kullanım:
 *   telemetriKur("service-worker");   // global onerror/onunhandledrejection kur
 *   hataBildir("sidepanel", err, { parselId });  // manuel bildirim
 *
 * Tasarım: sessiz + best-effort (telemetri kritik değil, kaybı kabul et), throttle'lı,
 * opt-out (chrome.storage.local `telemetriKapali`), PII yok.
 *
 * Sentry entegrasyonu:
 *   VITE_SENTRY_DSN env var varsa Sentry SDK dinamik olarak yüklenir.
 *   Yoksa kendi Cadastrum telemetri endpoint'i kullanılır (mevcut davranış).
 *   Her iki durumda da hatalar aynı `hataBildir()` API'sinden geçer.
 *
 * Sentry kurulumu:
 *   1. sentry.io'da proje oluştur → DSN kopyala
 *   2. .env.local'e ekle: VITE_SENTRY_DSN=https://...@o0.ingest.sentry.io/...
 *   3. npm install @sentry/browser
 *   4. npm run build → Sentry otomatik etkinleşir
 */

import { BACKEND_API as API_BASE } from "./api-constants";
const FLUSH_MS = 5000;
const MAX_KUYRUK = 20;
const MAX_MESAJ = 2000;
const MAX_STACK = 8000;

// Sentry SDK referansı (lazy init)
interface SentrySDK {
  captureException: (err: unknown, ctx?: { extra?: Record<string, unknown> }) => void;
  captureMessage: (msg: string, level?: "error" | "warning" | "info") => void;
  setTag: (key: string, value: string) => void;
}

let sentryRef: SentrySDK | null = null;
let sentryInitDenendi = false;

/** Vite env değişkenine güvenli erişim (import.meta.env Vite'ta var, test ortamında yok) */
function viteEnv(key: string): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (import.meta as any).env?.[key] as string | undefined;
  } catch {
    return undefined;
  }
}

/**
 * Sentry SDK'yı lazy başlat — VITE_SENTRY_DSN varsa.
 * Yoksa sessizce atla, kendi backend'imiz devreye girer.
 *
 * Kurulum:
 *   1. npm install @sentry/browser
 *   2. .env.local: VITE_SENTRY_DSN=https://...@o0.ingest.sentry.io/...
 */
async function sentryBaslat(kaynak: string): Promise<void> {
  if (sentryInitDenendi) return;
  sentryInitDenendi = true;

  const dsn = viteEnv("VITE_SENTRY_DSN");
  if (!dsn) return;

  try {
    // @sentry/browser opsiyonel bağımlılık — kurulmamışsa sessiz hata
    // Dynamic import string'i runtime'da oluşturulur (build-time analizi bypass)
    const sentryPkg = "@sentry/browser";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Sentry = await import(/* @vite-ignore */ sentryPkg as any) as SentrySDK & {
      init: (opts: Record<string, unknown>) => void;
    };
    Sentry.init({
      dsn,
      release: extSurum() ?? "dev",
      environment: viteEnv("MODE") ?? "production",
      // Kişisel veri sil — sadece hata stacktrace'i gönder
      beforeSend: (event: Record<string, unknown>) => {
        delete (event as Record<string, unknown>)["user"];
        const req = event["request"] as Record<string, unknown> | undefined;
        if (req) { delete req["headers"]; delete req["cookies"]; }
        return event;
      },
      allowUrls: [/chrome-extension:/],
      tracesSampleRate: 0, // performans izleme kapalı
    });
    Sentry.setTag("kaynak", kaynak);
    sentryRef = Sentry;
  } catch {
    // Sentry paketi kurulmamış veya DSN geçersiz — sessizce devam et
  }
}

export interface HataPayload {
  kaynak: string;
  mesaj: string;
  stack: string | null;
  surum: string | null;
  meta: Record<string, unknown> | null;
  ts: number;
}

/** Saf: bir hatayı gönderilebilir payload'a çevir (test edilebilir). */
export function hataPayloadu(
  kaynak: string,
  err: unknown,
  meta?: Record<string, unknown> | null,
  surum?: string | null,
): HataPayload {
  const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(err));
  return {
    kaynak,
    mesaj: (e.message || "bilinmeyen hata").slice(0, MAX_MESAJ),
    stack: e.stack ? e.stack.slice(0, MAX_STACK) : null,
    surum: surum ?? null,
    meta: meta ?? null,
    ts: Date.now(),
  };
}

let kuyruk: HataPayload[] = [];
let zamanlayici: ReturnType<typeof setTimeout> | null = null;

function extSurum(): string | undefined {
  try {
    return typeof chrome !== "undefined" && chrome.runtime?.getManifest
      ? chrome.runtime.getManifest().version
      : undefined;
  } catch {
    return undefined;
  }
}

async function kapaliMi(): Promise<boolean> {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return false;
    const d = await chrome.storage.local.get("telemetriKapali");
    return !!d.telemetriKapali;
  } catch {
    return false;
  }
}

function zamanla(): void {
  if (zamanlayici) return;
  zamanlayici = setTimeout(() => {
    zamanlayici = null;
    void gonder();
  }, FLUSH_MS);
}

async function gonder(): Promise<void> {
  if (kuyruk.length === 0) return;
  if (await kapaliMi()) { kuyruk = []; return; }
  const hatalar = kuyruk.splice(0, kuyruk.length);
  try {
    await fetch(`${API_BASE}/telemetri/hata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hatalar }),
      keepalive: true,
    });
  } catch {
    /* telemetri kritik değil — sessizce kaybet */
  }
}

/**
 * Bir hatayı kuyruğa al (throttle'lı gönderilir).
 * Sentry entegre ise paralel olarak oraya da iletilir.
 */
export function hataBildir(kaynak: string, err: unknown, meta?: Record<string, unknown> | null): void {
  try {
    // Cadastrum backend kuyruğuna ekle
    kuyruk.push(hataPayloadu(kaynak, err, meta, extSurum()));
    if (kuyruk.length > MAX_KUYRUK) kuyruk = kuyruk.slice(-MAX_KUYRUK);
    zamanla();

    // Sentry varsa paralel bildir
    if (sentryRef) {
      sentryRef.captureException(err, { extra: { kaynak, ...(meta ?? {}) } });
    }
  } catch {
    /* bildirimin kendisi patlamasın */
  }
}

/**
 * Global hata yakalayıcıları kur (bir kez, giriş noktalarında çağır).
 * Sentry DSN varsa SDK'yı da başlatır.
 */
export function telemetriKur(kaynak: string): void {
  // Sentry başlatmayı arka planda dene (DSN yoksa no-op)
  void sentryBaslat(kaynak);

  const hedef: EventTarget | undefined =
    typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : undefined;
  if (!hedef?.addEventListener) return;
  hedef.addEventListener("error", (ev) => {
    const e = ev as ErrorEvent;
    hataBildir(kaynak, e.error ?? e.message, { tur: "error" });
  });
  hedef.addEventListener("unhandledrejection", (ev) => {
    const e = ev as PromiseRejectionEvent;
    hataBildir(kaynak, e.reason, { tur: "unhandledrejection" });
  });
}
