/**
 * Parsel Karşılaştırma Store
 *
 * React Context + useReducer ile global state — Zustand bağımlılığı yok.
 * Max 3 parsel karşılaştırılabilir.
 *
 * Kullanım:
 *   const { liste, ekle, cikar, temizle } = useKarsilastirma();
 */

import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { Parsel } from "../types/tkgm";
import type { EPlanImarVerisi } from "./eplan";
import type { FiyatTahmini } from "./fiyat-tahmin";

export const MAX_KARSILASTIRMA = 3;

export interface KarsilastirmaKayit {
  /** Benzersiz key — mahalle:ada:parsel */
  key: string;
  parsel: Parsel;
  /** Fiyat tahmini — lazy yüklenir */
  fiyat?: FiyatTahmini | null;
  /** e-Plan imar verisi — lazy yüklenir */
  ePlan?: EPlanImarVerisi | null;
  /** Yüklenme zamanı */
  eklenmeTarihi: number;
}

type Aksiyon =
  | { tip: "EKLE"; kayit: KarsilastirmaKayit }
  | { tip: "CIKAR"; key: string }
  | { tip: "TEMIZLE" }
  | { tip: "GUNCELLE_FIYAT"; key: string; fiyat: FiyatTahmini | null }
  | { tip: "GUNCELLE_EPLAN"; key: string; ePlan: EPlanImarVerisi | null };

interface KarsilastirmaState {
  liste: KarsilastirmaKayit[];
}

const baslangic: KarsilastirmaState = { liste: [] };

function reducer(state: KarsilastirmaState, aksiyon: Aksiyon): KarsilastirmaState {
  switch (aksiyon.tip) {
    case "EKLE": {
      if (state.liste.some((k) => k.key === aksiyon.kayit.key)) return state;
      if (state.liste.length >= MAX_KARSILASTIRMA) {
        // En eski olanı çıkar, yenisini ekle
        return { liste: [...state.liste.slice(1), aksiyon.kayit] };
      }
      return { liste: [...state.liste, aksiyon.kayit] };
    }
    case "CIKAR":
      return { liste: state.liste.filter((k) => k.key !== aksiyon.key) };
    case "TEMIZLE":
      return baslangic;
    case "GUNCELLE_FIYAT":
      return {
        liste: state.liste.map((k) =>
          k.key === aksiyon.key ? { ...k, fiyat: aksiyon.fiyat } : k
        ),
      };
    case "GUNCELLE_EPLAN":
      return {
        liste: state.liste.map((k) =>
          k.key === aksiyon.key ? { ...k, ePlan: aksiyon.ePlan } : k
        ),
      };
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface KarsilastirmaContextTip {
  liste: KarsilastirmaKayit[];
  ekle: (parsel: Parsel) => void;
  cikar: (key: string) => void;
  temizle: () => void;
  guncelleiFiyat: (key: string, fiyat: FiyatTahmini | null) => void;
  guncellePlan: (key: string, ePlan: EPlanImarVerisi | null) => void;
  varMi: (parsel: Parsel) => boolean;
  dolu: boolean;
}

const KarsilastirmaCtx = createContext<KarsilastirmaContextTip | null>(null);

/** Parsel için benzersiz anahtar üretir */
export function parselKarsilastirmaKey(parsel: Parsel): string {
  return `${parsel.mahalleKodu ?? 0}:${parsel.adaNo}:${parsel.parselNo}`;
}

/** Provider — App.tsx'e sarılır */
export function KarsilastirmaProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, baslangic);

  const ctx: KarsilastirmaContextTip = {
    liste: state.liste,
    ekle: (parsel) => {
      const key = parselKarsilastirmaKey(parsel);
      dispatch({ tip: "EKLE", kayit: { key, parsel, eklenmeTarihi: Date.now() } });
    },
    cikar: (key) => dispatch({ tip: "CIKAR", key }),
    temizle: () => dispatch({ tip: "TEMIZLE" }),
    guncelleiFiyat: (key, fiyat) => dispatch({ tip: "GUNCELLE_FIYAT", key, fiyat }),
    guncellePlan: (key, ePlan) => dispatch({ tip: "GUNCELLE_EPLAN", key, ePlan }),
    varMi: (parsel) => state.liste.some((k) => k.key === parselKarsilastirmaKey(parsel)),
    dolu: state.liste.length >= MAX_KARSILASTIRMA,
  };

  return (
    <KarsilastirmaCtx.Provider value={ctx}>
      {children}
    </KarsilastirmaCtx.Provider>
  );
}

/** Hook — context'e erişim */
export function useKarsilastirma(): KarsilastirmaContextTip {
  const ctx = useContext(KarsilastirmaCtx);
  if (!ctx) throw new Error("useKarsilastirma: KarsilastirmaProvider eksik");
  return ctx;
}
