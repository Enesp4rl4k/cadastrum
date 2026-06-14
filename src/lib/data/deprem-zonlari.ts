/**
 * Türkiye Deprem Tehlike Haritası — il bazlı PGA (Peak Ground Acceleration) zonu.
 *
 * Kaynak: AFAD Türkiye Deprem Tehlike Haritası 2018 (resmi).
 *   https://tdth.afad.gov.tr/
 *
 * PGA değeri: 475 yıllık deprem dönüş periyodunda zemin ivmesi (g cinsinden).
 * Yüksek PGA = yüksek deprem riski.
 *
 * Zon kategorileri (AFAD eski klasifikasyonu + yeni haritayla uyumlu):
 *   Z1: PGA > 0.40g  → çok yüksek risk (Marmara fay hattı, Ege fay sistemi)
 *   Z2: PGA 0.30-0.40 → yüksek
 *   Z3: PGA 0.20-0.30 → orta
 *   Z4: PGA 0.10-0.20 → düşük
 *   Z5: PGA < 0.10   → çok düşük (iç Anadolu yüksekliği)
 *
 * NOT: İl bazlı agregasyon — il içi varyasyon mahalle bazında ileride eklenebilir.
 * Yıllık güncelleme gereksizdir, deprem haritası ~10 yılda bir revize edilir.
 */

export type DepremZonu = "Z1" | "Z2" | "Z3" | "Z4" | "Z5";

export interface DepremRiski {
  zon: DepremZonu;
  pga: number; // 475 yıllık PGA (g)
  fay: string | null; // ana fay hattı (varsa)
  not: string;
}

/** İl bazlı deprem zonu — il_norm → DepremRiski */
export const IL_DEPREM: Record<string, DepremRiski> = {
  // ── Z1 (>0.40g) — ÇOK YÜKSEK RİSK ──────────────────────────
  // Kuzey Anadolu Fay Hattı (KAF) yakını
  "istanbul":      { zon: "Z1", pga: 0.45, fay: "Kuzey Anadolu Fayı (Marmara)", not: "Marmara fay hattı, 7+ büyüklüğünde tarihsel depremler" },
  "kocaeli":       { zon: "Z1", pga: 0.55, fay: "Kuzey Anadolu Fayı", not: "1999 depremi merkez üssü bölgesi" },
  "sakarya":       { zon: "Z1", pga: 0.50, fay: "Kuzey Anadolu Fayı", not: "1999 Marmara depremi etkilendi" },
  "bolu":          { zon: "Z1", pga: 0.50, fay: "Kuzey Anadolu Fayı", not: "1999 Düzce, 1944 Gerede depremleri" },
  "duzce":         { zon: "Z1", pga: 0.50, fay: "Kuzey Anadolu Fayı", not: "1999 Düzce depremi 7.2" },
  "yalova":        { zon: "Z1", pga: 0.45, fay: "Kuzey Anadolu Fayı", not: "1999 Marmara etkilendi" },
  "bursa":         { zon: "Z1", pga: 0.42, fay: "Kuzey Anadolu Fayı (güney kol)", not: "Güney Marmara fayı aktif" },
  "balikesir":     { zon: "Z1", pga: 0.45, fay: "KAF güney + Edremit", not: "2017 Ayvacık 5.3, fay hattı yoğun" },
  "canakkale":     { zon: "Z1", pga: 0.40, fay: "Edremit fayı", not: "2017 Ayvacık deprem zinciri" },
  // Doğu Anadolu Fayı (DAF)
  "hatay":         { zon: "Z1", pga: 0.50, fay: "Doğu Anadolu Fayı", not: "2023 Kahramanmaraş 7.7 depremi" },
  "kahramanmaras": { zon: "Z1", pga: 0.55, fay: "Doğu Anadolu Fayı", not: "2023 Kahramanmaraş 7.7 merkez üssü" },
  "adana":         { zon: "Z1", pga: 0.40, fay: "Doğu Anadolu Fayı", not: "2023 depreminden etkilendi" },
  "osmaniye":      { zon: "Z1", pga: 0.45, fay: "Doğu Anadolu Fayı", not: "2023 depreminden ağır etkilendi" },
  "malatya":       { zon: "Z1", pga: 0.45, fay: "Doğu Anadolu Fayı", not: "2020 Sivrice 6.8, 2023 Kahramanmaraş etki" },
  "elazig":        { zon: "Z1", pga: 0.42, fay: "Doğu Anadolu Fayı", not: "2020 Sivrice 6.8 depremi" },
  "diyarbakir":    { zon: "Z1", pga: 0.40, fay: "Doğu Anadolu Fayı", not: "2023 etkili" },
  "adiyaman":      { zon: "Z1", pga: 0.45, fay: "Doğu Anadolu Fayı", not: "2023 Kahramanmaraş ağır" },
  "gaziantep":     { zon: "Z1", pga: 0.42, fay: "Doğu Anadolu Fayı", not: "2023 ağır etki" },
  // Ege fay sistemi
  "izmir":         { zon: "Z1", pga: 0.42, fay: "Tuzla-Karaburun fay sistemi", not: "2020 Seferihisar 6.9 İzmir depremi" },
  "aydin":         { zon: "Z1", pga: 0.42, fay: "Büyük Menderes graben", not: "Aktif normal fay sistemi" },
  "denizli":       { zon: "Z1", pga: 0.40, fay: "Pamukkale fayı, Babadağ", not: "Aktif fay sistemi, sık küçük depremler" },
  "mugla":         { zon: "Z1", pga: 0.42, fay: "Gökova körfezi fayı", not: "2017 Bodrum-Kos 6.6 depremi" },
  "manisa":        { zon: "Z1", pga: 0.40, fay: "Gediz graben, Akhisar fayı", not: "2020 Akhisar 5.4" },
  "van":           { zon: "Z1", pga: 0.45, fay: "Van Gölü fayı", not: "2011 Van 7.2 depremi" },
  "erzincan":      { zon: "Z1", pga: 0.55, fay: "Kuzey Anadolu Fayı", not: "1939 Erzincan 7.9, 1992 Erzincan 6.8" },
  "bingol":        { zon: "Z1", pga: 0.45, fay: "Doğu Anadolu Fayı", not: "1971, 2003 depremleri" },
  "tunceli":       { zon: "Z1", pga: 0.42, fay: "DAF / KAF kavşağı", not: "Aktif fay zonu" },
  "erzurum":       { zon: "Z1", pga: 0.40, fay: "Kuzey Anadolu Fayı", not: "1983 Horasan, 2020 Tortum" },
  "bitlis":        { zon: "Z1", pga: 0.40, fay: "Bitlis kenedi", not: "2011 Van etkili" },
  "mus":           { zon: "Z1", pga: 0.42, fay: "Bitlis kenedi", not: "Aktif sismik zon" },

  // ── Z2 (0.30-0.40g) — YÜKSEK ──────────────────────────────
  "tekirdag":      { zon: "Z2", pga: 0.38, fay: "Kuzey Anadolu Fayı (Marmara)", not: "Marmara fayı yakını" },
  "kirklareli":    { zon: "Z2", pga: 0.32, fay: null, not: "Marmara etkisi" },
  "edirne":        { zon: "Z2", pga: 0.30, fay: null, not: "Düşük orta risk" },
  "afyonkarahisar":{ zon: "Z2", pga: 0.35, fay: "Sultandağı fayı", not: "2002 Sultandağı 6.5" },
  "kutahya":       { zon: "Z2", pga: 0.35, fay: "Simav fayı", not: "2011 Simav 5.9" },
  "usak":          { zon: "Z2", pga: 0.35, fay: "Banaz fayı", not: "Orta-yüksek risk" },
  "isparta":       { zon: "Z2", pga: 0.35, fay: "Burdur fayı", not: "1971, 1995 depremleri" },
  "burdur":        { zon: "Z2", pga: 0.40, fay: "Burdur fayı", not: "1971 Burdur 6.2" },
  "antalya":       { zon: "Z2", pga: 0.32, fay: "Aksu fayı (doğu)", not: "Doğu Antalya yüksek, batı düşük" },
  "mersin":        { zon: "Z2", pga: 0.30, fay: "DAF güney uzantısı", not: "2023 etkilendi" },
  "kilis":         { zon: "Z2", pga: 0.35, fay: "DAF", not: "2023 etkili" },
  "sirnak":        { zon: "Z2", pga: 0.32, fay: "DAF doğu", not: "Hassas" },
  "siirt":         { zon: "Z2", pga: 0.32, fay: "Bitlis kenedi", not: "2017 Adıyaman/Siirt etkili" },
  "batman":        { zon: "Z2", pga: 0.32, fay: "Bitlis kenedi", not: "Orta-yüksek" },
  "mardin":        { zon: "Z2", pga: 0.30, fay: null, not: "2023 etkilendi" },
  "agri":          { zon: "Z2", pga: 0.35, fay: "Çaldıran fayı", not: "1976 Çaldıran 7.2" },
  "kars":          { zon: "Z2", pga: 0.35, fay: "Kuzey Anadolu Fayı doğu", not: "Aktif fay" },
  "ardahan":       { zon: "Z2", pga: 0.32, fay: null, not: "Kafkas tektonik" },
  "igdir":         { zon: "Z2", pga: 0.35, fay: "Çaldıran fayı", not: "1976 Çaldıran etki" },
  "hakkari":       { zon: "Z2", pga: 0.35, fay: "Bitlis kenedi", not: "Aktif zon" },

  // ── Z3 (0.20-0.30g) — ORTA ────────────────────────────────
  "ankara":        { zon: "Z3", pga: 0.25, fay: "Kuzey Anadolu Fayı (uzak)", not: "Orta Anadolu, KAF güney etkisi" },
  "eskisehir":     { zon: "Z3", pga: 0.28, fay: "Eskişehir fayı", not: "Aktif normal fay" },
  "bilecik":       { zon: "Z3", pga: 0.28, fay: "Eskişehir fayı uzantısı", not: "Orta risk" },
  "konya":         { zon: "Z3", pga: 0.20, fay: null, not: "Konya kapalı havzası, görece güvenli" },
  "karaman":       { zon: "Z3", pga: 0.22, fay: null, not: "Orta Anadolu güney" },
  "kayseri":       { zon: "Z3", pga: 0.25, fay: "Erciyes volkanik zon", not: "Volkanik orta" },
  "nevsehir":      { zon: "Z3", pga: 0.22, fay: "Tuz Gölü fayı", not: "Orta Anadolu" },
  "nigde":         { zon: "Z3", pga: 0.25, fay: "Tuz Gölü fayı, Ecemiş", not: "Orta risk" },
  "aksaray":       { zon: "Z3", pga: 0.22, fay: "Tuz Gölü fayı", not: "Orta Anadolu" },
  "kirsehir":      { zon: "Z3", pga: 0.22, fay: null, not: "Orta Anadolu" },
  "kirikkale":     { zon: "Z3", pga: 0.22, fay: null, not: "Orta-düşük" },
  "sivas":         { zon: "Z3", pga: 0.28, fay: "Sivas-Ezinepazarı fayı", not: "Orta-yüksek" },
  "yozgat":        { zon: "Z3", pga: 0.22, fay: null, not: "Orta Anadolu" },
  "tokat":         { zon: "Z3", pga: 0.30, fay: "Kuzey Anadolu Fayı", not: "1939, 1942 etkili" },
  "amasya":        { zon: "Z3", pga: 0.28, fay: "Kuzey Anadolu Fayı", not: "1942, 1943 etkili" },
  "corum":         { zon: "Z3", pga: 0.28, fay: "Kuzey Anadolu Fayı", not: "1943 Tosya etkili" },
  "samsun":        { zon: "Z3", pga: 0.22, fay: null, not: "Karadeniz kıyı, orta-düşük" },
  "ordu":          { zon: "Z3", pga: 0.20, fay: null, not: "Karadeniz orta-düşük" },
  "giresun":       { zon: "Z3", pga: 0.20, fay: null, not: "Karadeniz orta-düşük" },
  "trabzon":       { zon: "Z3", pga: 0.20, fay: null, not: "Karadeniz orta-düşük" },
  "rize":          { zon: "Z3", pga: 0.20, fay: null, not: "Karadeniz orta-düşük" },
  "artvin":        { zon: "Z3", pga: 0.25, fay: null, not: "Kafkas yakını" },
  "gumushane":     { zon: "Z3", pga: 0.25, fay: "Kuzey Anadolu Fayı", not: "Orta-yüksek" },
  "bayburt":       { zon: "Z3", pga: 0.25, fay: "Kuzey Anadolu Fayı", not: "Orta" },
  "sanliurfa":     { zon: "Z3", pga: 0.25, fay: null, not: "Güneydoğu, 2023 etkilendi" },

  // ── Z4 (0.10-0.20g) — DÜŞÜK ───────────────────────────────
  "kastamonu":     { zon: "Z4", pga: 0.18, fay: null, not: "Düşük risk" },
  "sinop":         { zon: "Z4", pga: 0.15, fay: null, not: "Karadeniz kıyı, en düşük" },
  "cankiri":       { zon: "Z4", pga: 0.18, fay: "Kuzey Anadolu (uzak)", not: "Düşük orta" },
  "zonguldak":     { zon: "Z4", pga: 0.18, fay: null, not: "Karadeniz kıyı" },
  "bartin":        { zon: "Z4", pga: 0.15, fay: null, not: "Düşük" },
  "karabuk":       { zon: "Z4", pga: 0.18, fay: null, not: "Düşük" },
};

/**
 * Mahalle key (il_norm__ilce_norm__mahalle_norm) için deprem zonu.
 * Şu an il bazlı, mahalle granuluna ileride genişletilecek.
 */
export function depremRiskiGetir(ilNorm: string | null | undefined): DepremRiski | null {
  if (!ilNorm) return null;
  return IL_DEPREM[ilNorm] ?? null;
}

/**
 * Deprem zonu fiyat çarpanı.
 * Z1 (yüksek risk) → -%5 iskonto (alıcı dikkatli)
 * Z2 → -%2
 * Z3 → 0 (nötr, baseline)
 * Z4-Z5 → +%2 (premium, güvenli)
 */
export function depremCarpani(zon: DepremZonu | null): number {
  if (!zon) return 1.0;
  const carpan: Record<DepremZonu, number> = {
    "Z1": 0.95,
    "Z2": 0.98,
    "Z3": 1.00,
    "Z4": 1.02,
    "Z5": 1.03,
  };
  return carpan[zon];
}
