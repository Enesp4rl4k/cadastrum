import { useEffect, useState } from "react";
import type { Parsel } from "../types/tkgm";
import {
  EPLAN_STORAGE_KEY,
  aktifEPlanVerisiGetir,
  ePlanParselKeyFromParsel,
  type EPlanImarVerisi,
} from "./eplan";

import {
  otomatikEPlanSorgula,
  type EPlanSorguDurum,
} from "./eplan-api";

export function useEPlanVerisi(parsel: Parsel) {
  const [veri, setVeri] = useState<EPlanImarVerisi | null>(null);
  const [loading, setLoading] = useState(true);
  const [durum, setDurum] = useState<EPlanSorguDurum | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);

  useEffect(() => {
    let iptal = false;
    setLoading(true);
    setDurum(null);
    setMesaj(null);

    aktifEPlanVerisiGetir(parsel).then((sonuc) => {
      if (iptal) return;
      if (sonuc) {
        setVeri(sonuc);
        setDurum("ok");
        setMesaj("Önbellekten / manuel kayıt yüklendi.");
        setLoading(false);
        return;
      }

      otomatikEPlanSorgula(parsel)
        .then((oto) => {
          if (iptal) return;
          setVeri(oto.veri);
          setDurum(oto.durum);
          setMesaj(oto.mesaj);
          setLoading(false);
        })
        .catch(() => {
          if (iptal) return;
          setDurum("ag-hatasi");
          setMesaj("e-Plan sorgusu başarısız. Manuel giriş veya ÇDP katmanı ile devam edin.");
          setLoading(false);
        });
    });

    const dinleyici = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area !== "local" || !changes[EPLAN_STORAGE_KEY]) return;
      const yeni = (changes[EPLAN_STORAGE_KEY].newValue as EPlanImarVerisi | undefined) ?? null;
      const parselKey = ePlanParselKeyFromParsel(parsel);
      if (yeni?.parselKey === parselKey) {
        setVeri(yeni);
        setDurum("ok");
        setMesaj("e-Plan kaydı güncellendi.");
      }
    };

    chrome.storage.onChanged.addListener(dinleyici);
    return () => {
      iptal = true;
      chrome.storage.onChanged.removeListener(dinleyici);
    };
  }, [parsel]);

  return { veri, loading, durum, mesaj };
}
