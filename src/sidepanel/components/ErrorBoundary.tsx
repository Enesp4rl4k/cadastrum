import { Component, type ErrorInfo, type ReactNode } from "react";
import { hataBildir } from "../../lib/telemetri";

interface Props {
  children: ReactNode;
  /** Hata durumunda gösterilecek alternatif. Verilmezse varsayılan kart. */
  fallback?: ReactNode;
  /** Hata kartı başlığı (varsayılan kullanılırken). */
  etiket?: string;
  /**
   * Hata mesajını kullanıcıya göster (varsayılan: false — teknik mesaj gizlenir).
   * Geliştirici modunda `true` yapılabilir.
   */
  mesajGoster?: boolean;
}

interface State {
  hata: Error | null;
  /** Detay akordeonu açık mı */
  detayAcik: boolean;
}

/**
 * React render hatalarını yakalar — bir component çökerse tüm panelin
 * kararması (blank screen) yerine kullanıcıya net mesaj + "Yeniden dene"
 * gösterilir. MapLibre gibi 3rd-party render hataları bu sayede izole edilir.
 *
 * İyileştirmeler (F2):
 *  - Kullanıcıya teknik jargon yerine anlaşılır mesaj
 *  - Detay akordeonu (gizli, isteğe bağlı açılır)
 *  - hataBildir() telemetri entegrasyonu
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hata: null, detayAcik: false };

  static getDerivedStateFromError(hata: Error): Partial<State> {
    return { hata, detayAcik: false };
  }

  override componentDidCatch(hata: Error, info: ErrorInfo): void {
    const etiket = this.props.etiket ?? "sidepanel";
    // Telemetri — sessizce gönder, boundary'nin kendisi çökmesin
    hataBildir(`error-boundary.${etiket}`, hata, {
      componentStack: info.componentStack?.slice(0, 500),
    });
  }

  sifirla = (): void => {
    this.setState({ hata: null, detayAcik: false });
  };

  override render(): ReactNode {
    if (this.state.hata) {
      if (this.props.fallback) return this.props.fallback;

      const etiketMesaj = this.props.etiket
        ? `"${this.props.etiket}" bölümü`
        : "Bu bölüm";

      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="text-3xl" role="img" aria-label="Hata simgesi">⚠️</div>

          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {etiketMesaj} şu an görüntülenemiyor
          </div>

          <div className="max-w-xs text-xs text-slate-500 dark:text-slate-400">
            Geçici bir sorun oluştu. "Yeniden dene" ile çözülebilir.
            Sorun devam ederse paneli yenileyin.
          </div>

          {/* Teknik detay — gizli, isteğe bağlı akordeonu */}
          {(this.props.mesajGoster || this.state.detayAcik) && (
            <details
              open={this.state.detayAcik}
              onToggle={(e) =>
                this.setState({ detayAcik: (e.currentTarget as HTMLDetailsElement).open })
              }
              className="w-full max-w-xs text-left"
            >
              <summary className="cursor-pointer text-[10px] text-slate-400 hover:text-slate-500 select-none">
                Teknik detay
              </summary>
              <div className="mt-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2">
                <p className="text-[10px] font-mono text-red-600 dark:text-red-400 break-all whitespace-pre-wrap">
                  {this.state.hata.message}
                </p>
              </div>
            </details>
          )}

          {/* Detay akordeonu kapalıysa küçük "detayları gör" link */}
          {!this.props.mesajGoster && !this.state.detayAcik && (
            <button
              type="button"
              onClick={() => this.setState({ detayAcik: true })}
              className="text-[10px] text-slate-400 hover:text-slate-500 underline"
            >
              Teknik detayı gör
            </button>
          )}

          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={this.sifirla}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition"
            >
              Yeniden dene
            </button>
            <button
              type="button"
              onClick={() => location.reload()}
              className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1 transition"
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
