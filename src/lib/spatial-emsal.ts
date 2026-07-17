/**
 * Spatial Emsal Motoru — Faz 2 (FUTURE_ARCHITECTURE.md "GIS Tabanlı Emsal").
 *
 * Mahalle-string match yerine **koordinat bazlı radius decay** ile emsal seçer.
 * Hiyerarşinin tepesinde çalışır: yeterli koordlu ilan varsa baseline-engine
 * `spatial-radius` kaynağını kullanır; aksi halde mevcut mahalle-norm fallback'e
 * düşer.
 *
 * Akış:
 *   1. Dexie `ilanGozlem` tablosundan bbox prefilter (`[lat+lng]` composite index)
 *      → Türkiye için bbox boyutu radius/111 derece (1° lat ≈ 111 km).
 *   2. Her aday için `haversineM` ile gerçek mesafe → radius dışındakileri at.
 *   3. Distance decay weight: `w = exp(-d / D)` (D kategori bazlı).
 *   4. Semantik filtre: hisseli/paylı ilanı %30 indirim veya elem.
 *   5. Tukey IQR ile outlier temizliği (reuse `fiyat-correction.outlierTemizle`).
 *   6. Weighted median baseline + halka dağılımı.
 *
 * Çıktı baseline-engine'in `MahalleBaselineSonuc` formatına uyumludur (kaynak
 * = "spatial-radius"). Çağıran taraf hibrit blend için kullanır.
 */

import { db, type IlanGozlem } from "./db";
import { haversineM } from "./analiz";
import { outlierTemizle, outlierTemizleBaglamsalAsimli } from "./fiyat-correction";
import { fiyatPerM2TLOlarak, dovizliMi } from "./kur";

export type SpatialKategori = "arsa" | "tarla" | "konut";

/**
 * Kategori bazlı distance decay sabiti (m).
 *   - konut: yoğun şehir dokusunda 2km dışı emsal yerine geçmez
 *   - arsa: orta yoğunluk, 5km'ye kadar anlamlı
 *   - tarla: kırsalda dağılım yüksek, 8km'ye kadar yayılır
 */
export const D_BY_KATEGORI: Record<SpatialKategori, number> = {
  konut: 2000,
  arsa: 5000,
  tarla: 8000,
};

/** Spatial emsal bandlarına dağılım (UI rozeti için). */
export interface HalkaDagilimi {
  r0_1km: number;
  r1_3km: number;
  r3_5km: number;
  r5_10km: number;
}

export interface SpatialEmsalKayit {
  kayit: IlanGozlem;
  fiyatPerM2TL: number;
  mesafeM: number;
  weight: number;
  semantikIskonto: number;
}

export interface SpatialEmsalSonuc {
  /** Filtrelenmiş emsaller, mesafe artan sıralı */
  emsaller: SpatialEmsalKayit[];
  /** Halka dağılımı (1/3/5/10 km bantları) */
  halkaDagilimi: HalkaDagilimi;
  /** Weighted median baseline (TL/m²) — outlier temizliği sonrası */
  baseline: number | null;
  /** İçeri alınan ham aday sayısı (debug) */
  hamAdayAdet: number;
  /** Outlier temizliğinde atılan kayıt sayısı */
  outlierAdet: number;
  /** Kullanılan distance decay sabiti */
  D: number;
  /** Sorgu yarıçapı (m) */
  radiusM: number;
}

export interface SpatialEmsalOpts {
  /** Yaş filtresi (gün) — varsayılan 180 */
  maksYasGun?: number;
  /** Semantik filtre uygula (hisseli/paylı) — varsayılan true */
  semantikFiltreAcik?: boolean;
  /** Hisseli emsalleri ele (true) ya da düşük ağırlıkla tut (false, weight × 0.7) */
  hisseliEle?: boolean;
  /** İl normalize adı — bağlamsal outlier filtresi için (opsiyonel) */
  ilNorm?: string;
}

const GUN_MS = 86_400_000;
const VARSAYILAN_YAS_GUN = 180;

/**
 * Semantik filtre — başlık ve imar metninde hisseli/paylı/sorunlu ilanları tespit.
 * Dönen değer:
 *   1.0 = sorun yok
 *   0.7 = bilinen kalite sorunu (hisseli/paylı), weight'i düşür
 *   0   = total elem
 */
export function semantikFiltre(kayit: IlanGozlem): number {
  // tr-locale lowercase + ascii fold (ı→i, ş→s, ü→u, ö→o, ç→c, ğ→g) — Türkçe
  // \b word boundary edge case'lerinden kaçınmak için substring search.
  const ham = `${kayit.baslik ?? ""} ${kayit.imarDurumu ?? ""}`.toLocaleLowerCase("tr");
  const metin = ham.replace(/[çğıöşüâîû]/g, (c) =>
    ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" })[c] ?? c,
  );

  const elemKalipari = [
    "tapusuz",
    "zilliyet",
    "tapu yok",
    "imar yok",
    "kadastro harici",
  ];
  for (const p of elemKalipari) if (metin.includes(p)) return 0;

  const indirimKaliplari = [
    "hisseli",
    "payli", // "paylı" → ascii fold "payli"
    "hisse devri",
    "intikal",
  ];
  for (const p of indirimKaliplari) if (metin.includes(p)) return 0.7;

  return 1.0;
}

/**
 * IlanGozlem kayıtlarını TL/m²'ye normalize et (kur dönüşümü dahil).
 * Tanınmayan para birimi veya geçersiz veri → null.
 */
function tlPerM2(kayit: IlanGozlem): number | null {
  if (kayit.paraBirimi === "TL" || kayit.paraBirimi == null) {
    return typeof kayit.fiyatPerM2 === "number" && kayit.fiyatPerM2 > 0 ? kayit.fiyatPerM2 : null;
  }
  if (dovizliMi(kayit.paraBirimi)) {
    return fiyatPerM2TLOlarak(kayit.fiyat, kayit.m2, kayit.paraBirimi);
  }
  return null;
}

/**
 * Weighted median — `fiyat-tahmin.ts`'deki ile aynı algoritma, burada inline
 * (cross-module circular import'tan kaçınmak için).
 */
function weightedMedian(values: Array<{ value: number; weight: number }>): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a.value - b.value);
  const totalWeight = sorted.reduce((s, v) => s + v.weight, 0);
  if (totalWeight <= 0) return sorted[Math.floor(sorted.length / 2)]?.value ?? 0;
  let acc = 0;
  for (const item of sorted) {
    acc += item.weight;
    if (acc >= totalWeight / 2) return item.value;
  }
  return sorted[sorted.length - 1]?.value ?? 0;
}

/**
 * Bounding box prefilter — Dexie composite index `[lat+lng]`'i kullanarak
 * radius'a yakın kayıtları getirir. Tam küre haversine sonrası uygulanır.
 *
 * Türkiye için 1° lat ≈ 111 km, 1° lng ≈ cos(lat) × 111 km.
 * Pratikte küçük lat aralıklarında yaklaşım geçerli.
 */
async function bboxPrefilter(
  lat: number,
  lng: number,
  radiusM: number,
): Promise<IlanGozlem[]> {
  const latDelta = radiusM / 111_000;
  const lngDelta = radiusM / (111_000 * Math.cos((lat * Math.PI) / 180));
  const minLat = lat - latDelta;
  const maxLat = lat + latDelta;
  const minLng = lng - lngDelta;
  const maxLng = lng + lngDelta;

  // Dexie composite index — `where('[lat+lng]')` array-key range. Lat dış bantta
  // olan kayıtlar elenir; lng ikinci kısım'da yine taranır (Dexie multi-range
  // tek call'da olur ama biz daha güvenli olan tek-dim filtreyi tercih ediyoruz).
  try {
    const aday = await db.ilanGozlem
      .where("[lat+lng]")
      .between([minLat, minLng], [maxLat, maxLng])
      .toArray();
    // Dexie compound between'i her iki boyutu da uygular; lng kısmı için
    // ekstra filtre defansif:
    return aday.filter(
      (k) =>
        typeof k.lat === "number" &&
        typeof k.lng === "number" &&
        k.lng >= minLng &&
        k.lng <= maxLng,
    );
  } catch (e) {
    // Eski Dexie versiyonu veya index yoksa full-scan fallback — hatayı logla
    console.debug("[arsa-spatial] bboxPrefilter compound index hatası, full-scan fallback:", e);
    const tum = await db.ilanGozlem.toArray();
    return tum.filter(
      (k) =>
        typeof k.lat === "number" &&
        typeof k.lng === "number" &&
        k.lat >= minLat &&
        k.lat <= maxLat &&
        k.lng >= minLng &&
        k.lng <= maxLng,
    );
  }
}

function bandaYerlestir(d: number, halka: HalkaDagilimi): void {
  if (d <= 1000) halka.r0_1km++;
  else if (d <= 3000) halka.r1_3km++;
  else if (d <= 5000) halka.r3_5km++;
  else if (d <= 10_000) halka.r5_10km++;
}

/**
 * Spatial emsal motorunun ana giriş noktası.
 *
 * Kullanım:
 *   const sonuc = await radiusEmsalGetir(41.08, 29.05, 5000, "arsa");
 *   if (sonuc.baseline != null && sonuc.emsaller.length >= 5) {
 *     // hiyerarşide spatial-radius kaynağını kullan
 *   }
 */
export async function radiusEmsalGetir(
  lat: number,
  lng: number,
  radiusM: number,
  kategori: SpatialKategori,
  opts: SpatialEmsalOpts = {},
): Promise<SpatialEmsalSonuc> {
  const maksYasGun = opts.maksYasGun ?? VARSAYILAN_YAS_GUN;
  const semantikAcik = opts.semantikFiltreAcik ?? true;
  const hisseliEle = opts.hisseliEle ?? false;
  const D = D_BY_KATEGORI[kategori];

  const halkaDagilimi: HalkaDagilimi = {
    r0_1km: 0,
    r1_3km: 0,
    r3_5km: 0,
    r5_10km: 0,
  };

  const aday = await bboxPrefilter(lat, lng, radiusM);
  const emsaller: SpatialEmsalKayit[] = [];
  const simdi = Date.now();

  for (const kayit of aday) {
    if (typeof kayit.lat !== "number" || typeof kayit.lng !== "number") continue;

    // Yaş filtresi
    const yasGun = (simdi - (kayit.zaman ?? simdi)) / GUN_MS;
    if (yasGun > maksYasGun) continue;

    // Mesafe
    const d = haversineM(lat, lng, kayit.lat, kayit.lng);
    if (d > radiusM) continue;

    // Fiyat normalize
    const fiyatPerM2TL = tlPerM2(kayit);
    if (fiyatPerM2TL == null || fiyatPerM2TL <= 0) continue;

    // Semantik filtre
    let semantikIskonto = 1.0;
    if (semantikAcik) {
      semantikIskonto = semantikFiltre(kayit);
      if (semantikIskonto === 0) continue;
      if (semantikIskonto < 1 && hisseliEle) continue;
    }

    // Distance decay weight
    const baseWeight = Math.exp(-d / D);

    // Koord kalitesi ağırlık çarpanı:
    //   yuksek (DOM scrape) = 1.0
    //   orta (mahalle merkez) = 0.7
    //   dusuk (ilçe centroid fallback) = 0.4
    let koordW = 1.0;
    if (kayit.koordDogruluk === "orta") koordW = 0.7;
    else if (kayit.koordDogruluk === "dusuk") koordW = 0.4;

    const weight = baseWeight * semantikIskonto * koordW;

    emsaller.push({
      kayit,
      fiyatPerM2TL,
      mesafeM: d,
      weight,
      semantikIskonto,
    });
    bandaYerlestir(d, halkaDagilimi);
  }

  // Mesafe artan sırala
  emsaller.sort((a, b) => a.mesafeM - b.mesafeM);

  // Outlier temizliği — bağlamsal (il+kategori mutlak sınır + IQR)
  const hamAdayAdet = emsaller.length;
  let baseline: number | null = null;
  let outlierAdet = 0;
  if (emsaller.length >= 4) {
    const fiyatlar = emsaller.map((e) => e.fiyatPerM2TL);
    let out: { temiz: number[]; cikarilan: number[] };
    if (opts.ilNorm) {
      const baglamsal = outlierTemizleBaglamsalAsimli(fiyatlar, opts.ilNorm, kategori);
      out = { temiz: baglamsal.temiz, cikarilan: [...baglamsal.mutlakAtilanlar, ...baglamsal.iqrAtilanlar] };
    } else {
      out = outlierTemizle(fiyatlar);
    }
    outlierAdet = out.cikarilan.length;
    const temizSet = new Set(out.temiz);
    const temiz =
      out.temiz.length >= Math.max(3, Math.ceil(emsaller.length / 2))
        ? emsaller.filter((e) => temizSet.has(e.fiyatPerM2TL))
        : emsaller;
    baseline = Math.round(
      weightedMedian(temiz.map((e) => ({ value: e.fiyatPerM2TL, weight: e.weight }))),
    );
  } else if (emsaller.length > 0) {
    baseline = Math.round(
      weightedMedian(emsaller.map((e) => ({ value: e.fiyatPerM2TL, weight: e.weight }))),
    );
  }

  return {
    emsaller,
    halkaDagilimi,
    baseline,
    hamAdayAdet,
    outlierAdet,
    D,
    radiusM,
  };
}

/**
 * Spatial baseline'ın baseline-engine'de "spatial-radius" katmanı olarak
 * kullanılması için minimum eşik kontrolü.
 *
 *   - En az 5 emsal
 *   - 0-3km bandında en az 2 emsal (yakın emsal şart)
 *   - Baseline > 0
 *
 * Kriterleri sağlamayan sonuç spatial-radius olarak kullanılmamalı.
 */
/**
 * Spatial baseline yeterlilik kontrolü.
 *
 * Threshold kararları (D4 revizyon):
 *   - emsaller.length < 2: tek bir ilan olsa bile spatial kullan — daha iyi
 *     koordinat bilgisi + backend blend ile güvenilirliği artırılabilir.
 *     Önceki eşik (5) kırsal tek-ilanlı mahalleleri tamamen kapsamdışı bırakıyordu.
 *   - yakin >= 1: 3km içinde en az 1 ilan yeterli (önceki: 2).
 *     Kırsalda komşu mahalleden 1 emsal dahi ortalamadan iyidir.
 */
export function spatialBaselineYeterliMi(sonuc: SpatialEmsalSonuc): boolean {
  if (sonuc.baseline == null || sonuc.baseline <= 0) return false;
  if (sonuc.emsaller.length < 2) return false;
  const yakin = sonuc.halkaDagilimi.r0_1km + sonuc.halkaDagilimi.r1_3km;
  return yakin >= 1;
}

// ── IDW AVM — Extension tarafı ──────────────────────────────────────────────

/**
 * Yerel Dexie havuzunda IDW (Inverse Distance Weighting, p=2) hesapla.
 *
 * Backend /spatial?mode=idw ile aynı formül; extension çevrimdışı çalışırken
 * veya ek doğrulama için kullanılır.
 *
 *   w_i = 1 / d_i^p,   fiyat = Σ(w_i × fiyat_i) / Σ(w_i)
 */
export function idwHesapla(
  items: Array<{ fiyatPerM2TL: number; mesafeM: number }>,
  p = 2,
): number | null {
  if (items.length === 0) return null;
  const eps = 1; // metre — sıfır mesafe koruması
  let sumW = 0, sumWF = 0;
  for (const it of items) {
    const d = Math.max(it.mesafeM, eps);
    const w = 1 / Math.pow(d, p);
    sumW += w;
    sumWF += w * it.fiyatPerM2TL;
  }
  return sumW > 0 ? Math.round(sumWF / sumW) : null;
}

export interface IdwAvmSonuc {
  /** Saf IDW (p=2), enflasyon düzeltmeli */
  idwFiyat: number | null;
  /** Çarpan zinciri uygulanmış kalibre fiyat */
  kalibreFiyat: number | null;
  /** Her çarpanın açıklaması */
  carpanZinciri: Array<{ ad: string; carpan: number; not: string }>;
  /** IQR tabanlı güven aralığı */
  guvenAraligi: { alt: number; ust: number } | null;
  /** Kullanılan emsal adedi */
  emsalAdet: number;
}

/**
 * Backend /v1/emsal/spatial?mode=idw çağrısı — IDW AVM sonucunu getirir.
 * Opsiyonel parametreler: egim_yuzde, pga, otoyol_km (varsa çarpan zinciri aktif).
 */
export async function apiSpatialIdwGetir(
  lat: number,
  lng: number,
  radiusKm: number,
  kategori: SpatialKategori,
  opts?: {
    egimYuzde?: number | null;
    pga?: number | null;
    otoyolKm?: number | null;
  },
): Promise<IdwAvmSonuc | null> {
  try {
    const API_BASE =
      typeof chrome !== "undefined"
        ? "https://cadastrum-api.cadastrum-tr.workers.dev/v1"
        : "/v1";

    const params = new URLSearchParams({
      lat: lat.toString(),
      lng: lng.toString(),
      radius_km: radiusKm.toString(),
      kategori,
      mode: "idw",
    });
    if (opts?.egimYuzde != null) params.set("egim_yuzde", opts.egimYuzde.toString());
    if (opts?.pga != null)        params.set("pga", opts.pga.toString());
    if (opts?.otoyolKm != null)   params.set("otoyol_km", opts.otoyolKm.toString());

    const res = await fetch(`${API_BASE}/emsal/spatial?${params}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;

    const data = await res.json() as {
      idw?: {
        idwFiyat: number | null;
        kalibreFiyat: number | null;
        carpanZinciri: Array<{ ad: string; carpan: number; not: string }>;
        guvenAraligi: { alt: number; ust: number } | null;
      };
      adet: number;
    };

    if (!data.idw) return null;

    return {
      idwFiyat: data.idw.idwFiyat,
      kalibreFiyat: data.idw.kalibreFiyat,
      carpanZinciri: data.idw.carpanZinciri,
      guvenAraligi: data.idw.guvenAraligi,
      emsalAdet: data.adet,
    };
  } catch {
    return null;
  }
}
