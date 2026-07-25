/**
 * Push Notification Yöneticisi — Chrome Extension
 *
 * chrome.notifications API ile masaüstü push bildirimleri gönderir.
 * Service worker (background) bağlamında çalışır.
 *
 * Bildirim tipleri:
 *   - İmar değişikliği algılandı (radar turu sonrası)
 *   - Yeni emsal ilan kriterleri (BildirimKurali eşiği geçildi)
 *   - Fiyat bandı büyük değişim (favori parselde %15+ artış/düşüş)
 *
 * Kural: Günde maksimum 3 bildirim gönder (spam önleme).
 * Ayarlar: chrome.storage.local'da "bildirimAyarlari" key'i.
 */

const BILDIRIM_SON_GONDERI_KEY = "bildirim_son_gonderi";
const BILDIRIM_GUNLUK_MAX = 3;

interface BildirimAyarlari {
  imarDegisimBildirimi: boolean;
  fiyatDegisimBildirimi: boolean;
  yeniEmsalBildirimi: boolean;
}

const VARSAYILAN_AYARLAR: BildirimAyarlari = {
  imarDegisimBildirimi: true,
  fiyatDegisimBildirimi: true,
  yeniEmsalBildirimi: true,
};

async function bildirimAyarlariAl(): Promise<BildirimAyarlari> {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return VARSAYILAN_AYARLAR;
  try {
    const raw = await chrome.storage.local.get("bildirimAyarlari");
    return { ...VARSAYILAN_AYARLAR, ...(raw.bildirimAyarlari ?? {}) };
  } catch {
    return VARSAYILAN_AYARLAR;
  }
}

/**
 * Günlük bildirim sayısını kontrol et.
 * Max BILDIRIM_GUNLUK_MAX aşılırsa false döner.
 */
async function bildirimKotaKontrol(): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return false;

  const bugun = new Date().toDateString();
  try {
    const raw = await chrome.storage.local.get(BILDIRIM_SON_GONDERI_KEY);
    const kayit = raw[BILDIRIM_SON_GONDERI_KEY] as
      | { tarih: string; sayi: number }
      | undefined;

    if (!kayit || kayit.tarih !== bugun) {
      // Yeni gün — sayacı sıfırla
      await chrome.storage.local.set({
        [BILDIRIM_SON_GONDERI_KEY]: { tarih: bugun, sayi: 0 },
      });
      return true;
    }

    return kayit.sayi < BILDIRIM_GUNLUK_MAX;
  } catch {
    return true; // Hata durumunda geçir
  }
}

async function bildirimSayacArttir(): Promise<void> {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return;

  const bugun = new Date().toDateString();
  try {
    const raw = await chrome.storage.local.get(BILDIRIM_SON_GONDERI_KEY);
    const kayit = raw[BILDIRIM_SON_GONDERI_KEY] as
      | { tarih: string; sayi: number }
      | undefined;

    const yeniSayi = kayit?.tarih === bugun ? (kayit.sayi + 1) : 1;
    await chrome.storage.local.set({
      [BILDIRIM_SON_GONDERI_KEY]: { tarih: bugun, sayi: yeniSayi },
    });
  } catch { /* sessizce geç */ }
}

/**
 * Temel bildirim gönder.
 * Kota doluysa veya chrome.notifications yoksa sessizce atlar.
 */
export async function bildirimGonder(opts: {
  id: string;
  baslik: string;
  mesaj: string;
  /** Bildirim tipi — kota ve ayar kontrolü için */
  tip: "imar" | "fiyat" | "emsal";
  /** Tıklandığında açılacak URL (opsiyonel) */
  onTikla?: () => void;
}): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome?.notifications) return false;

  // Ayar kontrolü
  const ayarlar = await bildirimAyarlariAl();
  if (opts.tip === "imar" && !ayarlar.imarDegisimBildirimi) return false;
  if (opts.tip === "fiyat" && !ayarlar.fiyatDegisimBildirimi) return false;
  if (opts.tip === "emsal" && !ayarlar.yeniEmsalBildirimi) return false;

  // Kota kontrolü
  const kotaOk = await bildirimKotaKontrol();
  if (!kotaOk) {
    console.log("[push] günlük bildirim kotası doldu, atlandı");
    return false;
  }

  try {
    const notifId = `cadastrum:${opts.id}:${Date.now()}`;

    await chrome.notifications.create(notifId, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("public/icon-128.png"),
      title: opts.baslik,
      message: opts.mesaj,
      priority: 1,
    });

    await bildirimSayacArttir();

    // Tıklama handler
    if (opts.onTikla) {
      const handler = (clickedId: string) => {
        if (clickedId === notifId) {
          opts.onTikla!();
          chrome.notifications.onClicked.removeListener(handler);
        }
      };
      chrome.notifications.onClicked.addListener(handler);
      // 30 saniye sonra listener'ı temizle
      setTimeout(() => {
        try { chrome.notifications.onClicked.removeListener(handler); } catch { /* */ }
      }, 30_000);
    }

    console.log(`[push] ✓ bildirim gönderildi: ${opts.baslik}`);
    return true;
  } catch (e) {
    console.warn("[push] bildirim hatası:", e);
    return false;
  }
}

/**
 * İmar değişikliği bildirimi — radar turu bulduğunda çağrılır.
 */
export async function imarDegisimBildirGonder(
  adaNo: number,
  parselNo: number,
  onceki: string,
  yeni: string,
): Promise<void> {
  await bildirimGonder({
    id: `imar-${adaNo}-${parselNo}`,
    baslik: "📋 İmar Değişikliği Tespit Edildi",
    mesaj: `Ada ${adaNo} / Parsel ${parselNo}: "${onceki}" → "${yeni}"`,
    tip: "imar",
  });
}

/**
 * Fiyat bandı değişim bildirimi.
 * @param deltaPct — pozitif: artış, negatif: düşüş
 */
export async function fiyatDegisimBildirGonder(
  adaNo: number,
  parselNo: number,
  deltaPct: number,
): Promise<void> {
  const yon = deltaPct > 0 ? "↑ yükseldi" : "↓ düştü";
  const renk = deltaPct > 0 ? "📈" : "📉";
  await bildirimGonder({
    id: `fiyat-${adaNo}-${parselNo}`,
    baslik: `${renk} Favori Parselde Fiyat Değişimi`,
    mesaj: `Ada ${adaNo} / Parsel ${parselNo} tahmini fiyat %${Math.abs(deltaPct).toFixed(1)} ${yon}`,
    tip: "fiyat",
  });
}

/**
 * Yeni emsal ilan bildirimi (BildirimKurali eşiği).
 */
export async function yeniEmsalBildirimGonder(
  mahalleAd: string,
  ilanAdet: number,
  medyanTlm2: number,
): Promise<void> {
  await bildirimGonder({
    id: `emsal-${mahalleAd}-${Date.now()}`,
    baslik: "🏗️ Yeni Emsal İlan Tespit Edildi",
    mesaj: `${mahalleAd}: ${ilanAdet} yeni ilan — medyan ${Math.round(medyanTlm2).toLocaleString("tr-TR")} TL/m²`,
    tip: "emsal",
  });
}

/**
 * Bildirim izni iste — kullanıcı ilk açılışta bir kez gösterilir.
 */
export async function bildirimIzniIste(): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome?.notifications) return false;

  // MV3'te chrome.notifications için özel izin gerekmez (manifest'te "notifications" yeterli).
  // Sadece mevcut durumu kontrol et.
  try {
    await chrome.notifications.getPermissionLevel((level) => {
      console.log("[push] bildirim izin seviyesi:", level);
    });
    return true;
  } catch {
    return false;
  }
}
