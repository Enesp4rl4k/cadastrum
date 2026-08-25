/**
 * BottomSheet — harita üstüne slide-up panel
 *
 * 3 state:
 *   "closed"   → ekranda yok (parsel seçilmemiş)
 *   "peek"     → sadece özet görünür (~120px), harita %70 görünür
 *   "half"     → yarı açık (~45% yükseklik), harita %55 görünür
 *   "full"     → tam açık (~85% yükseklik), haritanın üstü hafif görünür
 *
 * Drag gesture:
 *   - Handle'a mouse/touch down → drag başlar
 *   - Yukarı sürükle → state yükselir
 *   - Aşağı sürükle → state düşer veya kapatır
 *   - Hızlı flick → velocity bazlı snap
 */

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { X as CloseIcon, ChevronDown as ChevronDownIcon } from "lucide-react";

export type SheetState = "closed" | "peek" | "half" | "full";

interface BottomSheetProps {
  state: SheetState;
  onStateChange: (s: SheetState) => void;
  /** Peek yüksekliği — özet kart içeriği (px) */
  peekHeight?: number;
  children: ReactNode;
  /** Sheet kapatılabilir mi (X butonu + aşağı drag) */
  closeable?: boolean;
}

/** Container yüksekliğinin yüzdesi olarak her state'in hedef pozisyonu */
const STATE_HEIGHTS: Record<SheetState, string> = {
  closed: "0px",
  peek:   "136px",
  half:   "46%",
  full:   "86%",
};

/** Drag bitişinde hangi state'e snap yapılacağını belirle */
function snapState(
  currentPx: number,
  containerH: number,
  velocityPxPerMs: number,
  closeable: boolean,
): SheetState {
  const halfPx = containerH * 0.46;
  const fullPx = containerH * 0.86;
  const peekPx = 136;

  // Hızlı aşağı flick → kapat veya peek'e düş
  if (velocityPxPerMs > 0.8) {
    if (closeable && currentPx < peekPx * 1.5) return "closed";
    return "peek";
  }
  // Hızlı yukarı flick → tam aç
  if (velocityPxPerMs < -0.8) return "full";

  // Pozisyon bazlı snap
  if (currentPx < peekPx * 0.6 && closeable) return "closed";
  if (currentPx < (peekPx + halfPx) / 2)     return "peek";
  if (currentPx < (halfPx + fullPx) / 2)     return "half";
  return "full";
}

export function BottomSheet({
  state,
  onStateChange,
  children,
  closeable = true,
}: BottomSheetProps) {
  const sheetRef    = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Drag state
  const dragRef = useRef({
    active: false,
    startY: 0,
    startH: 0,
    lastY: 0,
    lastT: 0,
    velocity: 0, // px/ms — pozitif = aşağı
  });
  const [dragging, setDragging] = useState(false);
  const [dragH, setDragH] = useState<number | null>(null);

  // State → yükseklik hesabı
  const getTargetH = useCallback((s: SheetState): number => {
    const containerH = containerRef.current?.clientHeight ?? 600;
    if (s === "closed") return 0;
    if (s === "peek")   return 136;
    if (s === "half")   return containerH * 0.46;
    return containerH * 0.86;
  }, []);

  const currentTargetH = dragging && dragH !== null ? dragH : getTargetH(state);

  // Pointer down — drag başlar
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    const currentH = sheet.offsetHeight;
    dragRef.current = {
      active: true,
      startY: e.clientY,
      startH: currentH,
      lastY: e.clientY,
      lastT: e.timeStamp,
      velocity: 0,
    };
    setDragging(true);
    setDragH(currentH);
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const { startY, startH, lastY, lastT } = dragRef.current;
    const dy = e.clientY - startY; // pozitif = aşağı = küçülme
    const newH = Math.max(0, startH - dy);

    const dt = e.timeStamp - lastT;
    if (dt > 0) {
      const rawVel = (e.clientY - lastY) / dt;
      // Exponential moving average — ani değişimleri yumuşat
      dragRef.current.velocity = dragRef.current.velocity * 0.7 + rawVel * 0.3;
    }
    dragRef.current.lastY = e.clientY;
    dragRef.current.lastT = e.timeStamp;

    setDragH(newH);
  }, []);

  const onPointerUp = useCallback(() => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;

    const containerH = containerRef.current?.clientHeight ?? 600;
    const currentH = dragH ?? getTargetH(state);
    const snapped = snapState(currentH, containerH, dragRef.current.velocity, closeable);

    setDragging(false);
    setDragH(null);
    onStateChange(snapped);
  }, [dragH, state, getTargetH, closeable, onStateChange]);

  // Klavye: Escape → peek, ArrowUp → yükselt, ArrowDown → düşür
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (state === "closed") return;
      if (e.key === "Escape")    { if (closeable) onStateChange("closed"); }
      if (e.key === "ArrowUp")   {
        if (state === "peek") onStateChange("half");
        if (state === "half") onStateChange("full");
      }
      if (e.key === "ArrowDown") {
        if (state === "full") onStateChange("half");
        if (state === "half") onStateChange("peek");
        if (state === "peek" && closeable) onStateChange("closed");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state, closeable, onStateChange]);

  const heightVal = dragging && dragH !== null
    ? `${Math.max(0, dragH)}px`
    : STATE_HEIGHTS[state];

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-20"
      aria-hidden={state === "closed"}
    >
      {/* Backdrop — half/full'da hafif karartma */}
      {(state === "half" || state === "full") && !dragging && (
        <div
          className="pointer-events-auto absolute inset-0 bg-black/10 dark:bg-black/25"
          style={{ transition: "opacity 280ms ease" }}
          onClick={() => onStateChange("peek")}
          aria-hidden="true"
        />
      )}

      {/* Sheet panel */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="false"
        aria-label="Parsel detay paneli"
        className={[
          "pointer-events-auto absolute bottom-0 left-0 right-0",
          "overflow-hidden",
          "rounded-t-2xl",
          "border-t border-slate-200 dark:border-slate-700",
          "bg-white dark:bg-slate-900",
          "shadow-xl",
          dragging ? "" : "transition-[height] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        ].join(" ")}
        style={{ height: heightVal, willChange: "height" }}
      >
        {/* ── Drag handle ── */}
        <div
          className="flex touch-none select-none flex-col items-center pb-1 pt-2 cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label="Paneli sürükle"
          role="separator"
        >
          <div
            className={[
              "h-1 w-10 rounded-full transition-colors duration-150",
              dragging
                ? "bg-blue-400"
                : "bg-slate-300 dark:bg-slate-600",
            ].join(" ")}
          />
        </div>

        {/* ── Header bar (peek state'de de görünür) ── */}
        <div className="flex items-center justify-between px-3 pb-1.5">
          {/* Peek → half tıklama alanı */}
          <button
            type="button"
            className="flex flex-1 items-center gap-1.5 text-left"
            onClick={() => {
              if (state === "peek") onStateChange("half");
              if (state === "half") onStateChange("full");
            }}
            aria-label={state === "full" ? "" : "Paneli genişlet"}
          >
            {state !== "full" && (
              <span className="text-3xs font-medium text-slate-400 dark:text-slate-500 select-none">
                {state === "peek" ? "Detayları gör ↑" : "Tam ekran ↑"}
              </span>
            )}
          </button>

          <div className="flex items-center gap-1">
            {state === "full" && (
              <button
                type="button"
                onClick={() => onStateChange("half")}
                className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Küçült"
              >
                <ChevronDownIcon className="h-3.5 w-3.5" />
              </button>
            )}
            {closeable && (
              <button
                type="button"
                onClick={() => onStateChange("closed")}
                className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
                aria-label="Kapat"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ── İçerik — scroll edilebilir ── */}
        <div
          className="overflow-y-auto overscroll-contain px-3 pb-4"
          style={{
            // Handle + header bar yüksekliği düşülür
            height: "calc(100% - 52px)",
            // peek state'de içerik scroll engeli — sadece peek görünümü
            overflowY: state === "peek" ? "hidden" : "auto",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
