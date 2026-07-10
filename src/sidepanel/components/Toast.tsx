/**
 * Toast notification sistemi
 *
 * Kullanım:
 *   const { toast } = useToast();
 *   toast.success("Favorilere eklendi");
 *   toast.error("TKGM 403: limit doldu");
 *   toast.info("Arka planda güncelleniyor…");
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2 as SuccessIcon,
  XCircle as ErrorIcon,
  Info as InfoIcon,
  X as CloseIcon,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  /** ms — varsayılan: success=3000, error=5000, info=3500 */
  duration?: number;
  /** Çıkış animasyonu başlıyor mu */
  exiting?: boolean;
}

interface ToastAPI {
  success: (message: string, duration?: number) => void;
  error:   (message: string, duration?: number) => void;
  info:    (message: string, duration?: number) => void;
  dismiss: (id: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastAPI | null>(null);

export function useToast(): { toast: ToastAPI } {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return { toast: ctx };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    // Önce exiting flag'ini set et (exit animasyonu çalışsın)
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    // Animasyon bittikten sonra listeden çıkar
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 320);
  }, []);

  const add = useCallback(
    (type: ToastType, message: string, duration?: number) => {
      const id = `toast-${++counterRef.current}`;
      const defaultDuration =
        type === "error" ? 5000 : type === "info" ? 3500 : 3000;
      const ms = duration ?? defaultDuration;

      setToasts((prev) => [...prev.slice(-4), { id, type, message }]); // max 5 toast

      if (ms > 0) {
        setTimeout(() => dismiss(id), ms);
      }

      return id;
    },
    [dismiss]
  );

  const api: ToastAPI = {
    success: (msg, dur) => add("success", msg, dur) as unknown as void,
    error:   (msg, dur) => add("error",   msg, dur) as unknown as void,
    info:    (msg, dur) => add("info",    msg, dur) as unknown as void,
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ─── Container (portal) ───────────────────────────────────────────────────────

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  // Side panel root'una portal — haritanın üstüne çıkmaması için z-index dikkatli
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || toasts.length === 0) return null;

  return createPortal(
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-0 left-0 right-0 z-[9999] flex flex-col-reverse gap-2 p-3"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} item={t} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body
  );
}

// ─── Single toast ─────────────────────────────────────────────────────────────

const TOAST_STYLES: Record<ToastType, {
  bg: string;
  border: string;
  icon: typeof SuccessIcon;
  iconColor: string;
  textColor: string;
  progressColor: string;
}> = {
  success: {
    bg: "bg-white dark:bg-slate-800",
    border: "border-emerald-200 dark:border-emerald-700/60",
    icon: SuccessIcon,
    iconColor: "text-emerald-500",
    textColor: "text-slate-800 dark:text-slate-100",
    progressColor: "bg-emerald-400",
  },
  error: {
    bg: "bg-white dark:bg-slate-800",
    border: "border-red-200 dark:border-red-700/60",
    icon: ErrorIcon,
    iconColor: "text-red-500",
    textColor: "text-slate-800 dark:text-slate-100",
    progressColor: "bg-red-400",
  },
  info: {
    bg: "bg-white dark:bg-slate-800",
    border: "border-sky-200 dark:border-sky-700/60",
    icon: InfoIcon,
    iconColor: "text-sky-500",
    textColor: "text-slate-800 dark:text-slate-100",
    progressColor: "bg-sky-400",
  },
};

function ToastItem({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const s = TOAST_STYLES[item.type];
  const Icon = s.icon;

  return (
    <div
      role="status"
      aria-label={item.message}
      className={`
        pointer-events-auto
        relative overflow-hidden
        flex items-start gap-2.5
        rounded-xl border shadow-lg
        px-3 py-2.5
        max-w-full
        ${s.bg} ${s.border}
        ${item.exiting ? "toast-exit" : "toast-enter"}
      `.replace(/\s+/g, " ").trim()}
      style={{ boxShadow: "var(--shadow-lg)" }}
    >
      {/* Icon */}
      <Icon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${s.iconColor}`} aria-hidden="true" />

      {/* Message */}
      <p className={`flex-1 text-xs leading-snug font-medium ${s.textColor}`}>
        {item.message}
      </p>

      {/* Close button */}
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        aria-label="Bildirimi kapat"
      >
        <CloseIcon className="h-3.5 w-3.5" />
      </button>

      {/* Progress bar — bottom */}
      {!item.exiting && (
        <span
          className={`absolute bottom-0 left-0 h-0.5 ${s.progressColor} opacity-60`}
          style={{
            width: "100%",
            animation: `toast-progress ${item.duration ?? 3000}ms linear forwards`,
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
