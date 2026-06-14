import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Hata durumunda gösterilecek alternatif. Verilmezse varsayılan kart. */
  fallback?: ReactNode;
  /** Hata kartı başlığı (varsayılan kullanılırken). */
  etiket?: string;
}

interface State {
  hata: Error | null;
}

/**
 * React render hatalarını yakalar — bir component çökerse tüm panelin
 * kararması (blank screen) yerine kullanıcıya net mesaj + "Yeniden dene"
 * gösterilir. MapLibre gibi 3rd-party render hataları bu sayede izole edilir.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hata: null };

  static getDerivedStateFromError(hata: Error): State {
    return { hata };
  }

  override componentDidCatch(hata: Error, info: ErrorInfo): void {
    console.error(`[ErrorBoundary${this.props.etiket ? " " + this.props.etiket : ""}]`, hata, info.componentStack);
  }

  sifirla = (): void => {
    this.setState({ hata: null });
  };

  override render(): ReactNode {
    if (this.state.hata) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="text-3xl">⚠️</div>
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {this.props.etiket ?? "Bu bölüm"} yüklenirken hata oluştu
          </div>
          <div className="max-w-xs text-xs text-slate-500 dark:text-slate-400 break-words">
            {this.state.hata.message}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.sifirla}
              className="rounded-md bg-tkgm-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              Yeniden dene
            </button>
            <button
              type="button"
              onClick={() => location.reload()}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
            >
              Paneli yenile
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
