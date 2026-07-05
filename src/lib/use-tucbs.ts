import { useEffect, useState } from "react";
import type { Parsel } from "../types/tkgm";
import { tucbsCdpGetir, type TucbsCdpSonuc } from "./tucbs";

export function useTucbsCdp(parsel: Parsel) {
  const [veri, setVeri] = useState<TucbsCdpSonuc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let iptal = false;
    const ctrl = new AbortController();
    setLoading(true);

    tucbsCdpGetir(parsel, ctrl.signal)
      .then((sonuc) => {
        if (!iptal) {
          setVeri(sonuc);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!iptal) setLoading(false);
      });

    return () => {
      iptal = true;
      ctrl.abort();
    };
  }, [
    parsel.adaNo,
    parsel.parselNo,
    parsel.mahalleKodu,
    parsel.merkezNokta?.lat,
    parsel.merkezNokta?.lng,
    parsel.ilAd,
  ]);

  return { veri, loading };
}
