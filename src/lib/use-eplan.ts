import { useEffect, useState } from "react";
import type { Parsel } from "../types/tkgm";
import {
  EPLAN_STORAGE_KEY,
  aktifEPlanVerisiGetir,
  ePlanParselKeyFromParsel,
  type EPlanImarVerisi,
} from "./eplan";

import { otomatikEPlanSorgula } from "./eplan-api";

export function useEPlanVerisi(parsel: Parsel) {
  const [veri, setVeri] = useState<EPlanImarVerisi | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let iptal = false;
    setLoading(true);

    // Önce Cache'den veya Content-Script'ten gelen manuel veriyi al
    aktifEPlanVerisiGetir(parsel).then((sonuc) => {
      if (!iptal) {
        if (sonuc) {
          setVeri(sonuc);
          setLoading(false);
        } else {
          // Eğer cache'de yoksa otomatik gizli API sorgusunu başlat
          otomatikEPlanSorgula(parsel).then(otoSonuc => {
            if (!iptal) {
              if (otoSonuc) setVeri(otoSonuc);
              setLoading(false);
            }
          }).catch(() => {
            if (!iptal) setLoading(false);
          });
        }
      }
    });

    const dinleyici = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area !== "local" || !changes[EPLAN_STORAGE_KEY]) return;
      const yeni = (changes[EPLAN_STORAGE_KEY].newValue as EPlanImarVerisi | undefined) ?? null;
      const parselKey = ePlanParselKeyFromParsel(parsel);
      setVeri(yeni?.parselKey === parselKey ? yeni : null);
    };

    chrome.storage.onChanged.addListener(dinleyici);
    return () => {
      iptal = true;
      chrome.storage.onChanged.removeListener(dinleyici);
    };
  }, [parsel]);

  return { veri, loading };
}
