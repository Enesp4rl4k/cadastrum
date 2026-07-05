/**
 * chrome.storage.local üzerinde ayar okuma/yazma + reactive hook.
 */

import type { AiSaglayici } from "./ai-fiyat";
import { MODULLER, type ModulId } from "./modul-tanimi";

export interface Ayarlar {
  /** Sahibinden ilanı TKGM'de doğrulanınca otomatik favorilere eklensin mi */
  otomatikFavori: boolean;
  /** Sahibinden açtığın her ilan ilanGozlem tablosuna eklensin mi (bölge ortalaması için) */
  ilanGozlemiKaydet: boolean;
  /** AI fiyat tahmini sağlayıcısı */
  aiSaglayici: AiSaglayici;
  /** Ollama model adı (llama3.2, mistral, phi3 vs) */
  aiOllamaModel: string;
  /** Ollama base URL (default localhost:11434) */
  aiOllamaUrl: string;
  /** Google AI Studio (Gemini) free tier API key */
  aiGeminiApiKey: string;
  /** Açık analiz modülleri — kullanıcı ⚙'den yönetir */
  acikModuller: ModulId[];
  /** Backend telemetri — gezdiğin ilanlar anonim olarak Cadastrum API'ye gönderilir.
   *  Mahalle medyan fiyatları topluluk verisiyle iyileşir. Kişisel bilgi yok. */
  backendTelemetri: boolean;
  /** TCMB EVDS API key — il bazlı Konut Fiyat Endeksi (KFE) ile enflasyon düzeltmesi.
   *  Boş ise TÜFE fallback aktif. Key alma: https://evds2.tcmb.gov.tr/index.php?/evds/login */
  tcmbApiKey: string;
}

const DEFAULTS: Ayarlar = {
  otomatikFavori: false,
  ilanGozlemiKaydet: true,
  aiSaglayici: "cadastrum-proxy",
  aiOllamaModel: "llama3.2",
  aiOllamaUrl: "http://localhost:11434",
  aiGeminiApiKey: "",
  acikModuller: MODULLER.filter((m) => m.defaultAcik).map((m) => m.id),
  backendTelemetri: false, // KVKK uyumu — default opt-OUT. KVKK consent ile true olur.
  tcmbApiKey: "", // Default boş — kullanıcı isterse girebilir
};

const STORAGE_KEY = "ayarlar";

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && !!chrome?.storage?.local;
}

export async function ayarlariGetir(): Promise<Ayarlar> {
  if (!hasChromeStorage()) return { ...DEFAULTS };
  const d = await chrome.storage.local.get(STORAGE_KEY);
  const stored = (d[STORAGE_KEY] ?? {}) as Partial<Ayarlar>;
  const merged: Ayarlar = { ...DEFAULTS, ...stored };
  // Yeni eklenen default-açık modülleri mevcut kullanıcı listesine bir kez ekle
  if (stored.acikModuller) {
    for (const m of MODULLER) {
      if (m.defaultAcik && !merged.acikModuller.includes(m.id)) {
        merged.acikModuller = [...merged.acikModuller, m.id];
      }
    }
  }
  return merged;
}

export async function ayarlariYaz(ayarlar: Partial<Ayarlar>): Promise<void> {
  if (!hasChromeStorage()) return;
  const current = await ayarlariGetir();
  await chrome.storage.local.set({ [STORAGE_KEY]: { ...current, ...ayarlar } });
}

import { useEffect, useState } from "react";

export function useAyarlar(): [Ayarlar, (a: Partial<Ayarlar>) => void] {
  const [ayarlar, setAyarlar] = useState<Ayarlar>(DEFAULTS);

  useEffect(() => {
    ayarlariGetir().then(setAyarlar);
    if (!hasChromeStorage()) return;
    const dinleyici = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "local" && changes[STORAGE_KEY]?.newValue) {
        setAyarlar({ ...DEFAULTS, ...changes[STORAGE_KEY].newValue });
      }
    };
    chrome.storage.onChanged.addListener(dinleyici);
    return () => chrome.storage.onChanged.removeListener(dinleyici);
  }, []);

  function guncelle(patch: Partial<Ayarlar>) {
    ayarlariYaz(patch);
  }

  return [ayarlar, guncelle];
}
