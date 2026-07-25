/**
 * Graceful Degradation — Cascade Hata Yönetimi
 *
 * Hangi analiz katmanı düştüğünde sistemin ne kadar bilgiyle
 * devam edebileceğini belirler.
 *
 * Bağımlılık grafiği (yeniden):
 *   ePlan, cevre, egim, tucbs → bağımsız (Lv0)
 *   fiyat → cevre+egim+ePlan+tucbs'a bağlı (Lv1) AMA null ile de çalışır
 *   aiFiyat → fiyat'a bağlı (Lv2) AMA fiyat null ise atlanır
 *
 * Degradasyon seviyeleri:
 *   FULL      — tüm katmanlar tamam
 *   PARTIAL   — bazı katmanlar hata aldı, fiyat tahmini hâlâ çalışıyor
 *   MINIMAL   — fiyat tahmini de hata aldı, sadece TKGM verisi var
 *   FAILED    — kritik hata, hiçbir analiz yapılamadı
 *
 * Kullanım:
 *   const ozet = degradasyonOzetiHesapla(store.katmanlar);
 *   // UI'da uyarı göster veya "sınırlı analiz" etiketi ekle
 */

import type { ParselStore } from "./parsel-store";

// ── Tipler ────────────────────────────────────────────────────────────────────

export type DegradasyonSeviye = "FULL" | "PARTIAL" | "MINIMAL" | "FAILED";

export interface DegradasyonOzeti {
  seviye: DegradasyonSeviye;
  /** Yüzde olarak tamamlanan analiz (0-100) */
  tamamlanmaYuzde: number;
  /** Kullanıcıya gösterilecek kısa açıklama */
  mesaj: string;
  /** Hangi katmanlar hata aldı */
  hataKatmanlar: string[];
  /** Hangi katmanlar başarılı */
  basariliKatmanlar: string[];
  /** Kritik uyarılar — fiyat tahmini etkilendi mi */
  fiyatEtkilendi: boolean;
  /** Kullanıcıya önerilen aksiyon */
  onerilenAksiyon: string | null;
}

// ── Katman kritiklik seviyesi ──────────────────────────────────────────────────

const KATMAN_AGIRLIK: Record<string, number> = {
  ePlan:   25,  // İmar verisi — kritik
  cevre:   20,  // POI analizi — önemli
  egim:    15,  // Eğim/yükseklik — orta
  tucbs:   10,  // CDP imar planı — yardımcı
  fiyat:   25,  // Heuristic fiyat — kritik
  aiFiyat: 5,   // AI fiyat — iyileştirici
};

// ── Ana hesaplama fonksiyonu ───────────────────────────────────────────────────

export function degradasyonOzetiHesapla(
  katmanlar: ParselStore["katmanlar"],
): DegradasyonOzeti {
  const hataKatmanlar: string[] = [];
  const basariliKatmanlar: string[] = [];
  let toplamAgirlik = 0;
  let tamamlananAgirlik = 0;

  for (const [ad, katman] of Object.entries(katmanlar)) {
    const agirlik = KATMAN_AGIRLIK[ad] ?? 5;
    toplamAgirlik += agirlik;

    switch (katman.meta.durum) {
      case "tamam":
        basariliKatmanlar.push(ad);
        tamamlananAgirlik += agirlik;
        break;
      case "atlandi":
        // Atlananlar önemli değil — bazı katmanlar coverage dışı olabilir
        tamamlananAgirlik += agirlik * 0.5;
        break;
      case "hata":
        hataKatmanlar.push(ad);
        break;
      case "yukleniyor":
      case "bos":
        // Henüz tamamlanmamış — 0 ağırlık
        break;
    }
  }

  const tamamlanmaYuzde = toplamAgirlik > 0
    ? Math.round((tamamlananAgirlik / toplamAgirlik) * 100)
    : 0;

  const fiyatTamam = katmanlar.fiyat.meta.durum === "tamam";
  const fiyatHata  = katmanlar.fiyat.meta.durum === "hata";
  const fiyatEtkilendi = fiyatHata || hataKatmanlar.some((k) =>
    ["cevre", "egim"].includes(k), // Bu katmanlar fiyat kalitesini etkiler
  );

  // Seviye belirleme
  let seviye: DegradasyonSeviye;
  let mesaj: string;
  let onerilenAksiyon: string | null = null;

  if (hataKatmanlar.length === 0 && tamamlanmaYuzde >= 90) {
    seviye = "FULL";
    mesaj = "Tüm analiz katmanları başarıyla yüklendi.";
  } else if (fiyatTamam && tamamlanmaYuzde >= 60) {
    seviye = "PARTIAL";
    const eksikler = hataKatmanlar.map(katmanEtiket).join(", ");
    mesaj = `Kısmi analiz — ${eksikler} verisi alınamadı. Fiyat tahmini çalışıyor.`;
    onerilenAksiyon = "Hata alan katmanlar için yeniden dene";
  } else if (!fiyatTamam && basariliKatmanlar.length > 0) {
    seviye = "MINIMAL";
    mesaj = "Fiyat tahmini hesaplanamadı. Sadece TKGM parsel verisi mevcut.";
    onerilenAksiyon = "Sayfayı yenile veya farklı bir parsel seç";
  } else {
    seviye = "FAILED";
    mesaj = "Analiz başlatılamadı. Bağlantı sorunu olabilir.";
    onerilenAksiyon = "İnternet bağlantını kontrol et ve yeniden dene";
  }

  return {
    seviye,
    tamamlanmaYuzde,
    mesaj,
    hataKatmanlar,
    basariliKatmanlar,
    fiyatEtkilendi,
    onerilenAksiyon,
  };
}

function katmanEtiket(ad: string): string {
  const etiketler: Record<string, string> = {
    ePlan:   "İmar durumu",
    cevre:   "Çevre analizi",
    egim:    "Eğim/yükseklik",
    tucbs:   "CDP imar planı",
    fiyat:   "Fiyat tahmini",
    aiFiyat: "AI fiyat tahmini",
  };
  return etiketler[ad] ?? ad;
}

// ── Retry yöneticisi ──────────────────────────────────────────────────────────

/**
 * Exponential backoff ile retry.
 * Agentic loop'ta geçici hataları (network timeout, 429) atlatmak için.
 *
 * @param fn       Çalıştırılacak async fonksiyon
 * @param maxDeneme Max deneme sayısı (default 3)
 * @param baseMs   İlk bekleme süresi ms (default 500)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxDeneme = 3,
  baseMs = 500,
): Promise<T> {
  let sonHata: unknown;
  for (let deneme = 1; deneme <= maxDeneme; deneme++) {
    try {
      return await fn();
    } catch (e) {
      sonHata = e;
      // Retry edilmeyecek hatalar
      if (e instanceof Error) {
        const msg = e.message.toLowerCase();
        if (
          msg.includes("401") ||     // Auth hatası — retry anlamsız
          msg.includes("403") ||     // Yetki hatası — retry anlamsız
          msg.includes("not found")  // Kaynak yok — retry anlamsız
        ) {
          throw e;
        }
      }
      if (deneme < maxDeneme) {
        const beklemeMs = baseMs * 2 ** (deneme - 1) + Math.random() * 100;
        await new Promise((r) => setTimeout(r, beklemeMs));
      }
    }
  }
  throw sonHata;
}

// ── Partial result collector ───────────────────────────────────────────────────

/**
 * Promise.allSettled wrapper — tüm sonuçları toplar, başarısızları loglar.
 * Analiz loop'ta paralel katmanlar için kullanılır.
 */
export async function parallelWithDegradation<T>(
  gorevler: Array<{ ad: string; fn: () => Promise<T> }>,
): Promise<Array<{ ad: string; sonuc: T | null; hata: string | null }>> {
  const settled = await Promise.allSettled(gorevler.map((g) => g.fn()));
  return gorevler.map((g, i) => {
    const result = settled[i]!;
    if (result.status === "fulfilled") {
      return { ad: g.ad, sonuc: result.value, hata: null };
    } else {
      const hata = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
      return { ad: g.ad, sonuc: null, hata };
    }
  });
}
