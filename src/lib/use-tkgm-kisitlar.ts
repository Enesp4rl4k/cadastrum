/**
 * useTkgmKisitlar — chrome.storage.local'dan tapu kısıt verisini okur.
 *
 * Content script (tkgm-parsel.ts) TKGM parsel sayfasını ziyaret edince
 * şerh/ipotek/haciz verilerini chrome.storage.local'a yazar.
 * Bu hook o veriyi okuyup component'e sunar.
 *
 * Önemli: Kısıt verisi parsel key'e göre eşleştirilir.
 * Farklı parsele ait eski veri gösterilmez.
 */

import { useEffect, useState } from "react";
import {
  TKGM_KISIT_STORAGE_KEY,
  type TkgmKisitVerisi,
} from "../content/tkgm-parsel";
import type { Parsel } from "../types/tkgm";

/**
 * Parselin storage key'ini üretir (content script ile aynı format).
 * tkgm-parsel.ts'teki parselKeyFromHash ile aynı mantık.
 */
function parselKeyOlustur(parsel: Parsel): string {
  return `${parsel.mahalleKodu}:${parsel.adaNo}:${parsel.parselNo}`;
}

export function useTkgmKisitlar(parsel: Parsel): TkgmKisitVerisi | null {
  const [kisitlar, setKisitlar] = useState<TkgmKisitVerisi | null>(null);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;

    const hedefKey = parselKeyOlustur(parsel);

    // İlk okuma
    chrome.storage.local.get(TKGM_KISIT_STORAGE_KEY, (data) => {
      const veri = data[TKGM_KISIT_STORAGE_KEY] as TkgmKisitVerisi | undefined;
      if (veri && veri.parselKey === hedefKey) {
        setKisitlar(veri);
      } else {
        setKisitlar(null); // Farklı parsele ait veri — gösterme
      }
    });

    // Storage değişince güncelle (kullanıcı TKGM sayfasını ziyaret ederse)
    const dinleyici = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (!(TKGM_KISIT_STORAGE_KEY in changes)) return;
      const yeniVeri = changes[TKGM_KISIT_STORAGE_KEY]?.newValue as
        | TkgmKisitVerisi
        | undefined;
      if (yeniVeri && yeniVeri.parselKey === hedefKey) {
        setKisitlar(yeniVeri);
      } else {
        setKisitlar(null);
      }
    };

    chrome.storage.onChanged.addListener(dinleyici);
    return () => chrome.storage.onChanged.removeListener(dinleyici);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsel.mahalleKodu, parsel.adaNo, parsel.parselNo]);

  return kisitlar;
}
