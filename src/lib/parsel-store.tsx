/**
 * Global Parsel Analiz Store
 *
 * Harita'da açılan parselin tüm analiz katmanlarını tek noktada tutar.
 * Zustand bağımlılığı yok — React Context + useReducer.
 *
 * Amaç:
 *   MapView → parsel seç → tüm katmanlar burada birikir →
 *   AiHubView, FiyatTahminKarti, vs. buradan okur.
 *
 * Katmanlar:
 *   parsel   — TKGM ham verisi
 *   ePlan    — e-Plan imar verisi
 *   cevre    — OSM/Overpass çevre analizi
 *   egim     — Open-Meteo elevation/eğim
 *   fiyat    — Heuristic fiyat tahmini
 *   aiFiyat  — AI fiyat tahmini sonucu
 *   tucbs    — CDP (imar planı) katmanı
 *
 * Her katmanın kendi KatmanDurum'u var — UI progress takibi için.
 */

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
} from "react";
import type { Parsel } from "../types/tkgm";
import type { EPlanImarVerisi } from "./eplan";
import type { CevreAnalizi } from "./osm";
import type { EgimAnalizi } from "./elevation";
import type { FiyatTahmini } from "./fiyat-tahmin";
import type { AiFiyatSonucu } from "./ai-fiyat";
import type { TucbsCdpSonuc } from "./tucbs";

// ── Katman durumu ─────────────────────────────────────────────────────────────

export type KatmanDurum = "bos" | "yukleniyor" | "tamam" | "hata" | "atlandi";

export interface KatmanMeta {
  durum: KatmanDurum;
  hataMetni?: string;
  /** Veri hangi parsel için yüklendi (parsel değişince invalidate) */
  parselKey?: string;
  /** Kaç ms sürdü */
  sureMs?: number;
}

// ── Ana store tipi ────────────────────────────────────────────────────────────

export interface ParselStore {
  /** Aktif parsel — null = hiç seçilmedi */
  parsel: Parsel | null;
  /** Her katmanın verisi + meta durumu */
  katmanlar: {
    ePlan:   { veri: EPlanImarVerisi | null;  meta: KatmanMeta };
    cevre:   { veri: CevreAnalizi | null;      meta: KatmanMeta };
    egim:    { veri: EgimAnalizi | null;        meta: KatmanMeta };
    fiyat:   { veri: FiyatTahmini | null;       meta: KatmanMeta };
    aiFiyat: { veri: AiFiyatSonucu | null;      meta: KatmanMeta };
    tucbs:   { veri: TucbsCdpSonuc | null;      meta: KatmanMeta };
  };
}

const BOS_META: KatmanMeta = { durum: "bos" };

const BASLANGIC: ParselStore = {
  parsel: null,
  katmanlar: {
    ePlan:   { veri: null, meta: BOS_META },
    cevre:   { veri: null, meta: BOS_META },
    egim:    { veri: null, meta: BOS_META },
    fiyat:   { veri: null, meta: BOS_META },
    aiFiyat: { veri: null, meta: BOS_META },
    tucbs:   { veri: null, meta: BOS_META },
  },
};

// ── Aksiyon tipleri ───────────────────────────────────────────────────────────

export type KatmanAdi = keyof ParselStore["katmanlar"];

type KatmanVeri<K extends KatmanAdi> = ParselStore["katmanlar"][K]["veri"];

type Aksiyon =
  | { tip: "PARSEL_SET"; parsel: Parsel | null }
  | { tip: "PARSEL_TEMIZLE" }
  | { tip: "KATMAN_YUKLENIYOR"; katman: KatmanAdi; pKey: string }
  | { tip: "KATMAN_TAMAM";      katman: KatmanAdi; veri: KatmanVeri<KatmanAdi>; sureMs?: number; pKey: string }
  | { tip: "KATMAN_HATA";       katman: KatmanAdi; hata: string; pKey: string }
  | { tip: "KATMAN_ATLANDI";    katman: KatmanAdi; pKey: string };

// ── Parsel benzersiz key ──────────────────────────────────────────────────────

export function parselKey(p: Parsel): string {
  return `${p.mahalleKodu ?? "x"}-${p.adaNo}-${p.parselNo}`;
}

// ── Reducer ───────────────────────────────────────────────────────────────────

function reducer(state: ParselStore, aksiyon: Aksiyon): ParselStore {
  switch (aksiyon.tip) {
    case "PARSEL_SET": {
      if (!aksiyon.parsel) return BASLANGIC;
      const yeniKey = parselKey(aksiyon.parsel);
      const eskiKey = state.parsel ? parselKey(state.parsel) : null;
      // Aynı parsel tekrar seçildiyse katmanları koru
      if (yeniKey === eskiKey) return { ...state, parsel: aksiyon.parsel };
      // Farklı parsel → katmanları sıfırla
      return { ...BASLANGIC, parsel: aksiyon.parsel };
    }
    case "PARSEL_TEMIZLE":
      return BASLANGIC;

    case "KATMAN_YUKLENIYOR":
      return {
        ...state,
        katmanlar: {
          ...state.katmanlar,
          [aksiyon.katman]: {
            ...state.katmanlar[aksiyon.katman],
            meta: { durum: "yukleniyor", parselKey: aksiyon.pKey },
          },
        },
      };

    case "KATMAN_TAMAM": {
      // Stale-data koruması: sadece mevcut parsel için gelen yanıtları kabul et
      const aktifKey = state.parsel ? parselKey(state.parsel) : null;
      if (aksiyon.pKey !== aktifKey) return state;
      return {
        ...state,
        katmanlar: {
          ...state.katmanlar,
          [aksiyon.katman]: {
            veri: aksiyon.veri,
            meta: { durum: "tamam", parselKey: aksiyon.pKey, sureMs: aksiyon.sureMs },
          },
        },
      };
    }

    case "KATMAN_HATA": {
      const aktifKey = state.parsel ? parselKey(state.parsel) : null;
      if (aksiyon.pKey !== aktifKey) return state;
      return {
        ...state,
        katmanlar: {
          ...state.katmanlar,
          [aksiyon.katman]: {
            veri: null,
            meta: { durum: "hata", hataMetni: aksiyon.hata, parselKey: aksiyon.pKey },
          },
        },
      };
    }

    case "KATMAN_ATLANDI": {
      const aktifKey = state.parsel ? parselKey(state.parsel) : null;
      if (aksiyon.pKey !== aktifKey) return state;
      return {
        ...state,
        katmanlar: {
          ...state.katmanlar,
          [aksiyon.katman]: {
            veri: null,
            meta: { durum: "atlandi", parselKey: aksiyon.pKey },
          },
        },
      };
    }

    default:
      return state;
  }
}

// ── Context tipi ──────────────────────────────────────────────────────────────

interface ParselStoreContextTip {
  store: ParselStore;
  /** Yeni parsel seç — farklı parselse tüm katmanları sıfırlar */
  parselSec: (p: Parsel | null) => void;
  /** Katmanı "yükleniyor" durumuna geçir */
  katmanBaslat: (katman: KatmanAdi) => void;
  /** Katmanı "tamam" durumuna geçir + veriyi yaz */
  katmanTamamla: <K extends KatmanAdi>(katman: K, veri: KatmanVeri<K>, sureMs?: number) => void;
  /** Katmanı "hata" durumuna geçir */
  katmanHata: (katman: KatmanAdi, hata: string) => void;
  /** Katmanı "atlandi" (skip) durumuna geçir */
  katmanAtla: (katman: KatmanAdi) => void;
  /** Tamamlanan (tamam + atlandi + hata) katman sayısı */
  tamamlananSayi: number;
  /** Tüm katmanlar bitiş durumuna geldi mi? */
  analizBitti: boolean;
}

const ParselStoreCtx = createContext<ParselStoreContextTip | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function ParselStoreProvider({ children }: { children: ReactNode }) {
  const [store, dispatch] = useReducer(reducer, BASLANGIC);

  const aktifKey = store.parsel ? parselKey(store.parsel) : "";

  const parselSec = useCallback((p: Parsel | null) => {
    dispatch({ tip: "PARSEL_SET", parsel: p });
  }, []);

  const katmanBaslat = useCallback(
    (katman: KatmanAdi) => {
      dispatch({ tip: "KATMAN_YUKLENIYOR", katman, pKey: aktifKey });
    },
    [aktifKey],
  );

  const katmanTamamla = useCallback(
    <K extends KatmanAdi>(katman: K, veri: KatmanVeri<K>, sureMs?: number) => {
      dispatch({
        tip: "KATMAN_TAMAM",
        katman,
        veri: veri as KatmanVeri<KatmanAdi>,
        sureMs,
        pKey: aktifKey,
      });
    },
    [aktifKey],
  );

  const katmanHata = useCallback(
    (katman: KatmanAdi, hata: string) => {
      dispatch({ tip: "KATMAN_HATA", katman, hata, pKey: aktifKey });
    },
    [aktifKey],
  );

  const katmanAtla = useCallback(
    (katman: KatmanAdi) => {
      dispatch({ tip: "KATMAN_ATLANDI", katman, pKey: aktifKey });
    },
    [aktifKey],
  );

  const katmanListesi = Object.values(store.katmanlar);
  const tamamlananSayi = katmanListesi.filter(
    (k) => k.meta.durum === "tamam" || k.meta.durum === "atlandi" || k.meta.durum === "hata",
  ).length;
  const analizBitti = tamamlananSayi === katmanListesi.length;

  const ctx: ParselStoreContextTip = {
    store,
    parselSec,
    katmanBaslat,
    katmanTamamla,
    katmanHata,
    katmanAtla,
    tamamlananSayi,
    analizBitti,
  };

  return (
    <ParselStoreCtx.Provider value={ctx}>
      {children}
    </ParselStoreCtx.Provider>
  );
}

// ── Hook'lar ──────────────────────────────────────────────────────────────────

/** Tam store context'i */
export function useParselStore(): ParselStoreContextTip {
  const ctx = useContext(ParselStoreCtx);
  if (!ctx) throw new Error("useParselStore: ParselStoreProvider eksik");
  return ctx;
}

/** Sadece aktif parseli oku */
export function useAktifParsel(): Parsel | null {
  return useParselStore().store.parsel;
}

/** Belirli bir katmanın verisi + meta'sını oku */
export function useKatman<K extends KatmanAdi>(
  katman: K,
): ParselStore["katmanlar"][K] {
  return useParselStore().store.katmanlar[katman] as ParselStore["katmanlar"][K];
}

// ── AI danışman için birleşik bağlam ──────────────────────────────────────────

/**
 * AI danışmana gönderilecek parsel bağlamı.
 * Store'daki tüm hazır katmanları tek objeye derler.
 * AIDanismanKarti.tsx'deki ParselBaglam interface'iyle birebir uyumlu.
 */
export interface AiParselBaglam {
  il: string;
  ilce: string;
  mahalle?: string;
  kategori?: string;
  m2?: number;
  medyan_tlm2?: number;
  alt_tlm2?: number;
  ust_tlm2?: number;
  guven_skoru?: number;
  imar_tipi?: string;
  emsal?: number;
  taks?: number;
  maks_kat?: number;
  gelecek_skor?: number;
  gelecek_etiket?: string;
  yatirim_skoru?: number;
  yatirim_etiket?: string;
}

export function useAiParselBaglam(): AiParselBaglam | null {
  const { store } = useParselStore();
  const { parsel, katmanlar } = store;
  if (!parsel) return null;

  const fiyat   = katmanlar.fiyat.veri;
  const ePlan   = katmanlar.ePlan.veri;
  const aiFiyat = katmanlar.aiFiyat.veri;

  const baglam: AiParselBaglam = {
    il:       parsel.ilAd ?? "",
    ilce:     parsel.ilceAd ?? "",
    mahalle:  parsel.mahalleAd ?? undefined,
    kategori: parsel.nitelik ?? undefined,
    m2:       parsel.alan ?? undefined,
  };

  // Heuristic fiyat katmanından
  if (fiyat) {
    baglam.medyan_tlm2 = fiyat.beklenenPerM2;
    baglam.alt_tlm2    = fiyat.altPerM2;
    baglam.ust_tlm2    = fiyat.ustPerM2;
    baglam.guven_skoru = fiyat.guvenSkoru;
  }

  // AI fiyat katmanından — varsa heuristic'i override et (daha güvenilir)
  if (aiFiyat) {
    baglam.medyan_tlm2 = aiFiyat.beklenenPerM2;
    baglam.alt_tlm2    = aiFiyat.altPerM2;
    baglam.ust_tlm2    = aiFiyat.ustPerM2;
  }

  // e-Plan imar katmanından (EPlanImarVerisi: maksKat, kullanimKarari)
  if (ePlan) {
    baglam.imar_tipi = ePlan.kullanimKarari ?? undefined;
    baglam.emsal     = ePlan.emsal ?? undefined;
    baglam.taks      = ePlan.taks ?? undefined;
    baglam.maks_kat  = ePlan.maksKat ?? undefined;
  }

  return baglam;
}
