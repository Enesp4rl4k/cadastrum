/**
 * usePortfoySync — Favoriler ↔ Backend Sunucu Senkronizasyonu
 *
 * Pro kullanıcılar için favorileri D1 sunucusunda da saklar.
 * Bu sayede cihaz değişimi veya extension yeniden kurulumda veri korunur.
 *
 * Kullanım:
 *   const { senkronize, yukluyor, sonSenkron } = usePortfoySync();
 *
 * Akış:
 *   1. Kullanıcı favori eklediğinde/sildiğinde otomatik POST/DELETE
 *   2. İlk açılışta GET /v1/portfoy → sunucudaki kayıtları Dexie'ye merge et
 *   3. JWT yoksa (giriş yapılmamış) → sadece yerel çalışır, sessiz atla
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { db, type FavoriParsel } from "./db";
import { useLisans } from "./lisans";

import { BACKEND_API } from "./api-constants";
const API_BASE = BACKEND_API;

interface PortfoyKayit {
  id: number;
  parsel_key: string;
  il_ad: string | null;
  ilce_ad: string | null;
  mahalle_ad: string | null;
  ada_no: string | null;
  parsel_no: string | null;
  nitelik: string | null;
  alan_m2: number | null;
  lat: number | null;
  lng: number | null;
  fiyat_tahmini: number | null;
  not_metni: string | null;
  etiket: string | null;
  eklendi: number;
}

async function jwtAl(): Promise<string | null> {
  try {
    const raw = await chrome.storage.local.get("cadastrum_token");
    const token = raw["cadastrum_token"];
    return typeof token === "string" && token.length > 10 ? token : null;
  } catch {
    return null;
  }
}

/** Dexie favori → backend portföy body dönüştür */
function favoriToBody(fav: FavoriParsel): Record<string, unknown> {
  return {
    parsel_key: `${fav.mahalleKodu}:${fav.adaNo}:${fav.parselNo}`,
    il_ad: fav.ilAd ?? null,
    ilce_ad: fav.ilceAd ?? null,
    mahalle_ad: fav.mahalleAd ?? null,
    ada_no: String(fav.adaNo),
    parsel_no: String(fav.parselNo),
    nitelik: fav.parsel?.nitelik ?? null,
    alan_m2: fav.parsel?.alan ?? null,
    lat: fav.parsel?.merkezNokta?.lat ?? null,
    lng: fav.parsel?.merkezNokta?.lng ?? null,
    fiyat_tahmini: null,
    not_metni: fav.not ?? null,
    etiket: fav.etiket ?? null,
  };
}

/**
 * Tek bir favoriyi backend'e gönder (POST/upsert).
 * Sessiz başarısız — yerel veriyi bozmaz.
 */
export async function backendeFavoriGonder(fav: FavoriParsel): Promise<void> {
  const token = await jwtAl();
  if (!token) return;
  try {
    await fetch(`${API_BASE}/portfoy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(favoriToBody(fav)),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // Sessiz başarısız — yerel veri korunur
  }
}

/**
 * Tek bir favoriyi backend'den sil (parsel_key ile eşleşen kaydı bul+sil).
 * Önce GET listesi çekip ID bul, sonra DELETE /v1/portfoy/:id
 */
export async function backendenFavoriSil(
  mahalleKodu: number,
  adaNo: number,
  parselNo: number,
): Promise<void> {
  const token = await jwtAl();
  if (!token) return;
  const parselKey = `${mahalleKodu}:${adaNo}:${parselNo}`;
  try {
    // Listeyi çek ve ID'yi bul
    const listRes = await fetch(`${API_BASE}/portfoy`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!listRes.ok) return;
    const data = await listRes.json() as { portfoy: PortfoyKayit[] };
    const kayit = data.portfoy.find((k) => k.parsel_key === parselKey);
    if (!kayit) return;

    await fetch(`${API_BASE}/portfoy/${kayit.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // Sessiz başarısız
  }
}

/**
 * usePortfoySync hook'u
 *
 * İlk mount'ta sunucudaki kayıtları yerel Dexie'ye merge eder.
 * Sadece JWT varsa ve Pro+ kullanıcıysa çalışır.
 */
export function usePortfoySync() {
  const lisans = useLisans();
  const [yukluyor, setYukluyor] = useState(false);
  const [sonSenkron, setSonSenkron] = useState<Date | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const calisiyor = useRef(false);

  const senkronize = useCallback(async () => {
    if (calisiyor.current) return;
    const token = await jwtAl();
    if (!token) return;

    calisiyor.current = true;
    setYukluyor(true);
    setHata(null);

    try {
      // Sunucudan portföy listesini çek
      const res = await fetch(`${API_BASE}/portfoy`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        if (res.status === 401) return; // Token geçersiz — sessiz atla
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json() as { portfoy: PortfoyKayit[] };
      const sunucuKayitlar = data.portfoy ?? [];

      if (sunucuKayitlar.length === 0) {
        // Sunucuda kayıt yok → yerel favorileri sunucuya gönder (ilk senkron)
        const yerelFavoriler = await db.favoriler.toArray();
        for (const fav of yerelFavoriler) {
          await backendeFavoriGonder(fav);
        }
      } else {
        // Sunucuda kayıt var → Dexie'ye merge et (eksik olanları ekle)
        const yerelFavoriler = await db.favoriler.toArray();
        const yerelKeyler = new Set(
          yerelFavoriler.map((f: FavoriParsel) => `${f.mahalleKodu}:${f.adaNo}:${f.parselNo}`),
        );

        for (const kayit of sunucuKayitlar) {
          if (yerelKeyler.has(kayit.parsel_key)) continue;

          // Sunucudaki kayıt yerel'de yok → Dexie'ye ekle
          const [mahalleKodu, adaNo, parselNo] = kayit.parsel_key
            .split(":")
            .map(Number) as [number, number, number];

          if (!mahalleKodu || !adaNo || !parselNo) continue;

          // FavoriParsel.parsel required — sunucuda parsel objesi yok,
          // minimal placeholder oluştur. Kullanıcı parseli haritada açınca güncel data gelir.
          const minimalParsel = {
            mahalleKodu,
            adaNo,
            parselNo,
            ilAd: kayit.il_ad ?? null,
            ilceAd: kayit.ilce_ad ?? null,
            mahalleAd: kayit.mahalle_ad ?? null,
            nitelik: kayit.nitelik ?? "Bilinmiyor",
            alan: kayit.alan_m2 ?? 0,
            merkezNokta: { lat: kayit.lat ?? 0, lng: kayit.lng ?? 0 },
          } as import("../types/tkgm").Parsel;

          await db.favoriler.add({
            mahalleKodu,
            adaNo,
            parselNo,
            ilAd: kayit.il_ad ?? "",
            ilceAd: kayit.ilce_ad ?? "",
            mahalleAd: kayit.mahalle_ad ?? "",
            eklenmeTarihi: (kayit.eklendi ?? 0) * 1000, // unix → ms
            not: kayit.not_metni ?? "",
            etiket: (kayit.etiket as FavoriParsel["etiket"]) ?? undefined,
            parsel: minimalParsel,
          }).catch(() => {
            // Çakışma — zaten var, atla
          });
        }
      }

      setSonSenkron(new Date());
    } catch (e) {
      const mesaj = e instanceof Error ? e.message : String(e);
      setHata(mesaj);
    } finally {
      setYukluyor(false);
      calisiyor.current = false;
    }
  }, []);

  // İlk mount'ta otomatik senkronize et (Pro+ veya JWT varsa)
  useEffect(() => {
    if (!lisans.can("ai-fiyat")) return; // sadece Pro+
    void senkronize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { senkronize, yukluyor, sonSenkron, hata };
}
