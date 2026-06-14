/**
 * Content script ortak yardımcısı: Chrome extension reload edildiğinde
 * eski content script'in runtime context'i invalid olur. setInterval polling
 * devam ederek her tetiklemede "Extension context invalidated" hatası atar.
 *
 * Bu modül ile context geçersiz olunca tüm polling temiz şekilde durdurulur.
 */

export interface ContextGuard {
  /** Chrome runtime context hâlâ geçerli mi? */
  gecerli: () => boolean;
  /** Bir setInterval handle'ı kaydet — context geçersiz olunca otomatik durdur */
  kaydet: (handle: ReturnType<typeof setInterval>) => void;
  /** chrome.runtime.sendMessage'i güvenli wrap'le — context invalidated'da silently durur */
  mesajGonder: (msg: unknown) => void;
  /** Hata context-invalidated türünden mi? */
  contextGecersiz: (e: unknown) => boolean;
}

export function createContextGuard(loglarPrefix: string): ContextGuard {
  let gecerli = true;
  const intervalHandles: ReturnType<typeof setInterval>[] = [];

  function contextGecersiz(e: unknown): boolean {
    const msg = e instanceof Error ? e.message : String(e);
    return /Extension context invalidated|message port closed/i.test(msg);
  }

  function tumPollingDurdur() {
    gecerli = false;
    for (const h of intervalHandles) clearInterval(h);
    intervalHandles.length = 0;
    console.log(`${loglarPrefix} extension reload edildi, polling durduruldu`);
  }

  return {
    gecerli: () => gecerli,
    kaydet: (handle) => {
      intervalHandles.push(handle);
    },
    mesajGonder: (msg) => {
      if (!gecerli) return;
      try {
        const sonuc = chrome.runtime.sendMessage(msg);
        if (sonuc && typeof (sonuc as Promise<unknown>).catch === "function") {
          (sonuc as Promise<unknown>).catch((e: unknown) => {
            if (contextGecersiz(e)) tumPollingDurdur();
            else console.warn(`${loglarPrefix} mesaj hatası:`, e);
          });
        }
      } catch (e) {
        if (contextGecersiz(e)) tumPollingDurdur();
        else console.warn(`${loglarPrefix} mesaj hatası:`, e);
      }
    },
    contextGecersiz,
  };
}
