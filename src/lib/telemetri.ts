/**
 * Hata telemetrisi (istemci) — extension runtime hatalarını backend'e batch'ler.
 *
 * Kullanım:
 *   telemetriKur("service-worker");   // global onerror/onunhandledrejection kur
 *   hataBildir("sidepanel", err, { parselId });  // manuel bildirim
 *
 * Tasarım: sessiz + best-effort (telemetri kritik değil, kaybı kabul et), throttle'lı,
 * opt-out (chrome.storage.local `telemetriKapali`), PII yok.
 */

const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";
const FLUSH_MS = 5000;
const MAX_KUYRUK = 20;
const MAX_MESAJ = 2000;
const MAX_STACK = 8000;

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

/** Bir hatayı kuyruğa al (throttle'lı gönderilir). */
export function hataBildir(kaynak: string, err: unknown, meta?: Record<string, unknown> | null): void {
  try {
    kuyruk.push(hataPayloadu(kaynak, err, meta, extSurum()));
    if (kuyruk.length > MAX_KUYRUK) kuyruk = kuyruk.slice(-MAX_KUYRUK);
    zamanla();
  } catch {
    /* bildirimin kendisi patlamasın */
  }
}

/** Global hata yakalayıcıları kur (bir kez, giriş noktalarında çağır). */
export function telemetriKur(kaynak: string): void {
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
