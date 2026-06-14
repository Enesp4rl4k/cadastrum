/**
 * SaaS lisans + tier sistemi.
 *
 * Şu an: lokal mock (kullanıcı Settings'ten tier seçer)
 * Sonraki sprint: Supabase JWT validation
 */

export type Tier = "free" | "bireysel-pro" | "kurumsal-standart" | "kurumsal-pro";

export const TIER_BILGI: Record<
  Tier,
  {
    ad: string;
    fiyat: string;
    rozet: string;
    aciklama: string;
  }
> = {
  free: {
    ad: "Free",
    fiyat: "Ücretsiz",
    rozet: "🆓",
    aciklama: "Kişisel araştırma, sınırlı özellik",
  },
  "bireysel-pro": {
    ad: "Bireysel Pro",
    fiyat: "89 TL/ay · 890 TL/yıl",
    rozet: "💎",
    aciklama: "Tüm modüller + AI + sınırsız",
  },
  "kurumsal-standart": {
    ad: "Kurumsal Standart",
    fiyat: "490 TL/ay/kullanıcı · min 3",
    rozet: "🏢",
    aciklama: "Ekip + risk skor + profesyonel PDF",
  },
  "kurumsal-pro": {
    ad: "Kurumsal Pro",
    fiyat: "Talep üzerine",
    rozet: "🏛",
    aciklama: "Tapu sicil + API + 3D + on-prem",
  },
};

/** Hangi feature'a hangi tier'da erişim var */
export type Yetenek =
  | "ai-fiyat"
  | "gunes-modulu"
  | "tarim-modulu"
  | "tkgm-heatmap"
  | "sahibinden-join"
  | "sınırsız-favori"
  | "sınırsız-scan"
  | "watchlist-uyari"
  | "pdf-rapor"
  | "cloud-sync"
  | "multi-user"
  | "musteri-organizasyon"
  | "profesyonel-pdf"
  | "coklu-parsel-karsilastirma"
  | "risk-skor"
  | "manuel-imar"
  | "tapu-sicil"
  | "comp-set-advanced"
  | "api-access"
  | "uc-d-gorselleştirme";

const YETENEK_TIER_GEREKLI: Record<Yetenek, Tier> = {
  // Bireysel Pro
  "ai-fiyat": "bireysel-pro",
  "gunes-modulu": "bireysel-pro",
  "tarim-modulu": "bireysel-pro",
  "tkgm-heatmap": "bireysel-pro",
  "sahibinden-join": "bireysel-pro",
  "sınırsız-favori": "bireysel-pro",
  "sınırsız-scan": "bireysel-pro",
  "watchlist-uyari": "bireysel-pro",
  "pdf-rapor": "bireysel-pro",
  "cloud-sync": "bireysel-pro",

  // Kurumsal Standart
  "multi-user": "kurumsal-standart",
  "musteri-organizasyon": "kurumsal-standart",
  "profesyonel-pdf": "kurumsal-standart",
  "coklu-parsel-karsilastirma": "kurumsal-standart",
  "risk-skor": "kurumsal-standart",
  "manuel-imar": "kurumsal-standart",

  // Kurumsal Pro
  "tapu-sicil": "kurumsal-pro",
  "comp-set-advanced": "kurumsal-pro",
  "api-access": "kurumsal-pro",
  "uc-d-gorselleştirme": "kurumsal-pro",
};

const TIER_SIRA: Record<Tier, number> = {
  free: 0,
  "bireysel-pro": 1,
  "kurumsal-standart": 2,
  "kurumsal-pro": 3,
};

/** Free tier limit'leri — Pro'da hepsi Infinity */
export interface Limitler {
  favori: number;
  scanAyda: number;
  savedScan: number;
  bolgeMaxKm2: number;
  aiSorguAyda: number;
}

const TIER_LIMITLERI: Record<Tier, Limitler> = {
  free: {
    favori: 5,
    scanAyda: 5,
    savedScan: 1,
    bolgeMaxKm2: 0.5,
    aiSorguAyda: 0,
  },
  "bireysel-pro": {
    favori: Infinity,
    scanAyda: Infinity,
    savedScan: Infinity,
    bolgeMaxKm2: 25,
    aiSorguAyda: 100,
  },
  "kurumsal-standart": {
    favori: Infinity,
    scanAyda: Infinity,
    savedScan: Infinity,
    bolgeMaxKm2: 100,
    aiSorguAyda: 1000,
  },
  "kurumsal-pro": {
    favori: Infinity,
    scanAyda: Infinity,
    savedScan: Infinity,
    bolgeMaxKm2: Infinity,
    aiSorguAyda: Infinity,
  },
};

export function yetenekVarMi(currentTier: Tier, yetenek: Yetenek): boolean {
  const gerekli = YETENEK_TIER_GEREKLI[yetenek];
  return TIER_SIRA[currentTier] >= TIER_SIRA[gerekli];
}

export function gerekliTier(yetenek: Yetenek): Tier {
  return YETENEK_TIER_GEREKLI[yetenek];
}

export function limitleriGetir(tier: Tier): Limitler {
  return TIER_LIMITLERI[tier];
}

// ----- Lisans state — chrome.storage'da -----

const STORAGE_KEY = "lisans";

export interface LisansBilgisi {
  tier: Tier;
  email: string | null;
  baslangic: number | null;
  bitis: number | null;
  /** Trial mi (geçici Pro deneyimi) */
  trial: boolean;
}

const DEFAULT_LISANS: LisansBilgisi = {
  tier: "free",
  email: null,
  baslangic: null,
  bitis: null,
  trial: false,
};

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && !!chrome?.storage?.local;
}

export async function lisansGetir(): Promise<LisansBilgisi> {
  if (!hasChromeStorage()) return { ...DEFAULT_LISANS };
  const d = await chrome.storage.local.get(STORAGE_KEY);
  const kayit = d[STORAGE_KEY] as LisansBilgisi | undefined;
  if (!kayit) return { ...DEFAULT_LISANS };
  // Bitiş geçmişse free'ye düş
  if (kayit.bitis && Date.now() > kayit.bitis) {
    return { ...DEFAULT_LISANS };
  }
  return kayit;
}

export async function lisansYaz(lisans: Partial<LisansBilgisi>): Promise<void> {
  if (!hasChromeStorage()) return;
  const mevcut = await lisansGetir();
  const yeni = { ...mevcut, ...lisans };
  await chrome.storage.local.set({ [STORAGE_KEY]: yeni });
}

import { useEffect, useState } from "react";

// JWT decode artık React'tan bağımsız ayrı dosyada — service worker gibi
// React-less scope'larda da güvenle import edilebilir (React her zaman
// browser document/window referansı içerir, SW'de hata atar).
export { decodeJwt, type JwtPayload } from "./jwt-decode";
import { decodeJwt } from "./jwt-decode";

/** chrome.storage.local'da Cadastrum site token'ını oku ve admin claim'ini döner. */
const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 dk
let _adminCache: { value: boolean; ts: number } | null = null;

export async function isAdminGetir(): Promise<boolean> {
  if (_adminCache && Date.now() - _adminCache.ts < ADMIN_CACHE_TTL_MS) {
    return _adminCache.value;
  }
  if (!hasChromeStorage()) {
    _adminCache = { value: false, ts: Date.now() };
    return false;
  }
  const d = await chrome.storage.local.get("cadastrum_token");
  const token = typeof d["cadastrum_token"] === "string" ? d["cadastrum_token"] : null;
  const payload = decodeJwt(token);
  const isAdmin = payload?.admin === 1 || payload?.adm === 1;
  _adminCache = { value: isAdmin, ts: Date.now() };
  return isAdmin;
}

export function adminCacheTemizle(): void {
  _adminCache = null;
}

export interface UseLisansSonuc {
  lisans: LisansBilgisi;
  tier: Tier;
  can: (yetenek: Yetenek) => boolean;
  limitler: Limitler;
  yukseltGerekli: (yetenek: Yetenek) => Tier | null;
  /** Mock — gerçek backend'de değiştirilecek */
  tieriDegistir: (tier: Tier) => Promise<void>;
  /** 7 gün Pro deneme başlat */
  trialBaslat: (tier: Tier) => Promise<void>;
  /** Faz 5 ek — admin Chrome profili için bootstrap erişimi */
  isAdmin: boolean;
}

export function useLisans(): UseLisansSonuc {
  const [lisans, setLisans] = useState<LisansBilgisi>(DEFAULT_LISANS);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  useEffect(() => {
    lisansGetir().then(setLisans);
    isAdminGetir().then(setIsAdmin);
    if (!hasChromeStorage()) return;
    const dinleyici = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== "local") return;
      if (changes[STORAGE_KEY]?.newValue) {
        setLisans(changes[STORAGE_KEY].newValue as LisansBilgisi);
      }
      if (changes["cadastrum_token"]) {
        // Token değişti — cache temizle, yeniden oku
        adminCacheTemizle();
        isAdminGetir().then(setIsAdmin);
      }
    };
    chrome.storage.onChanged.addListener(dinleyici);
    return () => chrome.storage.onChanged.removeListener(dinleyici);
  }, []);

  // Admin (JWT adm=1) → tüm yetenekler + en üst tier + sınırsız limit.
  // Tier senkron sorunlarından bağımsız: admin her zaman tam erişimli.
  const etkinTier: Tier = isAdmin ? "kurumsal-pro" : lisans.tier;

  return {
    lisans,
    tier: etkinTier,
    can: (yetenek) => isAdmin || yetenekVarMi(lisans.tier, yetenek),
    limitler: limitleriGetir(etkinTier),
    yukseltGerekli: (yetenek) =>
      isAdmin || yetenekVarMi(lisans.tier, yetenek) ? null : gerekliTier(yetenek),
    tieriDegistir: async (tier) => {
      await lisansYaz({ tier, trial: false });
    },
    trialBaslat: async (tier) => {
      await lisansYaz({
        tier,
        trial: true,
        baslangic: Date.now(),
        bitis: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
    },
    isAdmin,
  };
}
