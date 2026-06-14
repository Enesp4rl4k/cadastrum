import { useEffect, useState, useCallback } from "react";
import type { Parsel } from "../types/tkgm";
import { manuelVeriOku, type ManuelVeri } from "./manuel-veri";

/**
 * Parsele bağlı manuel imar + emsal verisini chrome.storage.local'dan okur.
 * Çocuk komponentlerden değişiklik olduğunda yeniden yüklenmesi için
 * `tetikle()` döndürür.
 */
export function useManuelVeri(parsel: Parsel | null | undefined) {
  const [veri, setVeri] = useState<ManuelVeri>({ emsaller: [] });
  const [loading, setLoading] = useState(true);
  const [versiyon, setVersiyon] = useState(0);

  const tetikle = useCallback(() => setVersiyon(v => v + 1), []);

  useEffect(() => {
    if (!parsel) {
      setVeri({ emsaller: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    let iptal = false;
    manuelVeriOku(parsel).then(v => {
      if (!iptal) {
        setVeri(v);
        setLoading(false);
      }
    });
    return () => { iptal = true; };
  }, [parsel?.adaNo, parsel?.parselNo, parsel?.mahalleKodu, versiyon]);

  return { veri, loading, tetikle };
}
