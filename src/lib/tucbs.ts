/**
 * TUCBS Çevre Düzeni Planı (ÇDP) — koordinat bazlı WMS sorgusu.
 *
 * e-Plan parsel imar planını verir; TUCBS 1/100.000 üst plan kararını verir.
 * İkisi birbirini tamamlar — çelişki durumunda risk uyarısı üretilir.
 */

import type { Parsel } from "../types/tkgm";
import { db } from "./db";
import {
  tucbsWmsEndpointGetir,
  tucbsWmsUrl,
  type TucbsWmsBolge,
} from "./data/tucbs-wms-endpoints";
import { kodIleSiniflandir } from "./data/tucbs-kullanim-kodlari";

const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Sorgulanacak WMS katmanları: renk + sit + endüstri */
export const TUCBS_CDP_QUERY_LAYERS = "2,9,8";

export type TucbsCdpKategori =
  | "konut-gelisme"
  | "koy-yerlesik"
  | "tarim-koruma"
  | "sanayi"
  | "ticari-turizm"
  | "diger";

export type TucbsCdpKapsam = "tam" | "il-eksik" | "veri-yok";

export interface TucbsAraziKullanimi {
  kod: string | null;
  metin: string;
  eskiMetin: string | null;
  kategori: TucbsCdpKategori;
  /** UI legend rengi */
  renkEtiket: string;
}

export interface TucbsCdpSonuc {
  parselKey: string;
  kaynak: "tucbs-wms";
  bolge: string | null;
  wmsSlug: string | null;
  araziKullanimi: TucbsAraziKullanimi | null;
  sitAlani: boolean;
  endustriBolgesi: boolean;
  il: string | null;
  ilce: string | null;
  kapsam: TucbsCdpKapsam;
  guvenSkoru: number;
  fetchedAt: number;
  hata?: string;
}

interface WmsFeatureProperties {
  KullanımTipi?: string;
  KULLANIM_TEXT?: string;
  ESKIKULLANIM?: string;
  IL?: string;
  ILCE?: string;
  layerName?: string;
  [key: string]: unknown;
}

export function tucbsParselKeyFromParsel(parsel: Parsel): string {
  const slug = (value: string | null | undefined) =>
    (value ?? "")
      .toLocaleLowerCase("tr")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  return [
    slug(parsel.ilAd),
    slug(parsel.ilceAd),
    slug(parsel.mahalleAd),
    parsel.adaNo ?? "",
    parsel.parselNo ?? "",
  ].join(":");
}

function cacheKey(lat: number, lng: number, wmsSlug: string): string {
  return `${wmsSlug}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
}

export function kullanimMetniniSiniflandir(
  metin: string,
  kod?: string | null,
): {
  kategori: TucbsCdpKategori;
  renkEtiket: string;
} {
  const kodKaydi = kodIleSiniflandir(kod);
  if (kodKaydi) {
    return {
      kategori: kodKaydi.kategori,
      renkEtiket: kategoriRenkEtiketi(kodKaydi.kategori),
    };
  }

  const t = metin.toLocaleLowerCase("tr");

  if (/sanayi|depo|lojistik|organize sanayi|osb|endüstri|endustri/.test(t)) {
    return { kategori: "sanayi", renkEtiket: "Mor — Sanayi / depolama" };
  }
  if (/ticaret|ticari|turizm|otel|avm|liman/.test(t)) {
    return { kategori: "ticari-turizm", renkEtiket: "Kırmızı — Ticaret / turizm" };
  }
  if (/köy|koy|kırsal yerleş|kirsal yerles/.test(t)) {
    return { kategori: "koy-yerlesik", renkEtiket: "Kahverengi — Köy yerleşik" };
  }
  if (
    /tarım|tarim|tarla|orman|mera|koruma|sulak|yeşil|yesil|bağ|bag|zeytin|tarımsal/.test(t)
  ) {
    return { kategori: "tarim-koruma", renkEtiket: "Yeşil — Tarım / koruma" };
  }
  if (
    /konut|yerleş|yerles|gelişme|gelisme|mesken|villa|kentsel/.test(t)
  ) {
    return { kategori: "konut-gelisme", renkEtiket: "Sarı — Yerleşim / gelişme" };
  }

  return { kategori: "diger", renkEtiket: "Gri — Diğer plan kararı" };
}

function kategoriRenkEtiketi(kategori: TucbsCdpKategori): string {
  switch (kategori) {
    case "konut-gelisme":
      return "Sarı — Yerleşim / gelişme";
    case "koy-yerlesik":
      return "Kahverengi — Köy yerleşik";
    case "tarim-koruma":
      return "Yeşil — Tarım / koruma";
    case "sanayi":
      return "Mor — Sanayi / depolama";
    case "ticari-turizm":
      return "Kırmızı — Ticaret / turizm";
    default:
      return "Gri — Diğer plan kararı";
  }
}

/** MapView lejant — arazi kullanım renkleri (yaklaşık TUCBS paleti) */
export const CDP_LEJANT: { kategori: TucbsCdpKategori; etiket: string; renk: string }[] = [
  { kategori: "konut-gelisme", etiket: "Yerleşim / gelişme", renk: "#facc15" },
  { kategori: "koy-yerlesik", etiket: "Köy yerleşik", renk: "#a16207" },
  { kategori: "tarim-koruma", etiket: "Tarım / koruma", renk: "#22c55e" },
  { kategori: "sanayi", etiket: "Sanayi / depo", renk: "#a855f7" },
  { kategori: "ticari-turizm", etiket: "Ticaret / turizm", renk: "#ef4444" },
  { kategori: "diger", etiket: "Diğer", renk: "#94a3b8" },
];

function buildGetFeatureInfoUrl(
  wmsSlug: string,
  lat: number,
  lng: number,
  delta = 0.001,
): string {
  const bbox = `${lat - delta},${lng - delta},${lat + delta},${lng + delta}`;
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetFeatureInfo",
    LAYERS: "2",
    QUERY_LAYERS: TUCBS_CDP_QUERY_LAYERS,
    CRS: "EPSG:4326",
    BBOX: bbox,
    WIDTH: "101",
    HEIGHT: "101",
    I: "50",
    J: "50",
    INFO_FORMAT: "application/geojson",
  });
  return `${tucbsWmsUrl(wmsSlug)}?${params.toString()}`;
}

async function wmsFeatureInfoGetir(
  wmsSlug: string,
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<WmsFeatureProperties[]> {
  const directUrl = buildGetFeatureInfoUrl(wmsSlug, lat, lng);

  async function parseResponse(res: Response): Promise<WmsFeatureProperties[]> {
    const text = await res.text();
    if (!res.ok) throw new Error(`WMS ${res.status}`);
    if (text.trimStart().startsWith("<?xml") || text.includes("ServiceException")) {
      throw new Error("WMS ServiceException");
    }
    const json = JSON.parse(text) as {
      features?: Array<{ properties?: WmsFeatureProperties }>;
    };
    return (json.features ?? [])
      .map((f) => f.properties ?? {})
      .filter((p) => Object.keys(p).length > 0);
  }

  try {
    const direct = await fetch(directUrl, {
      signal,
      headers: { Accept: "application/geojson, application/json" },
    });
    return await parseResponse(direct);
  } catch {
    const proxyUrl =
      `${API_BASE}/proxy/tucbs?wms=${encodeURIComponent(wmsSlug)}` +
      `&lat=${lat}&lng=${lng}`;
    const proxied = await fetch(proxyUrl, { signal });
    return await parseResponse(proxied);
  }
}

function ozelliklerdenSonucOlustur(
  parselKey: string,
  bolge: TucbsWmsBolge,
  ozellikler: WmsFeatureProperties[],
): TucbsCdpSonuc {
  let arazi: TucbsAraziKullanimi | null = null;
  let sitAlani = false;
  let endustriBolgesi = false;
  let il: string | null = null;
  let ilce: string | null = null;

  for (const p of ozellikler) {
    const layer = String(p.layerName ?? "");
    const kullanimText = String(p.KULLANIM_TEXT ?? "").trim();
    const eski = String(p.ESKIKULLANIM ?? "").trim() || null;

    if (p.IL && p.IL !== "Null") il = String(p.IL);
    if (p.ILCE && p.ILCE !== "Null") ilce = String(p.ILCE);

    if (layer === "9" || /\bsit\b|koruma alan/i.test(kullanimText)) {
      sitAlani = true;
    }
    if (
      layer === "8" ||
      /sanayi|osb|endüstri|endustri|depo/.test(kullanimText.toLocaleLowerCase("tr"))
    ) {
      endustriBolgesi = true;
    }

    if (layer === "2" && kullanimText && !arazi) {
      const kod = p.KullanımTipi ? String(p.KullanımTipi) : null;
      const { kategori, renkEtiket } = kullanimMetniniSiniflandir(kullanimText, kod);
      arazi = {
        kod,
        metin: kullanimText,
        eskiMetin: eski,
        kategori,
        renkEtiket,
      };
    }
  }

  // Katman 2 boşsa diğer katmanlardan metin dene
  if (!arazi) {
    for (const p of ozellikler) {
      const kullanimText = String(p.KULLANIM_TEXT ?? "").trim();
      if (!kullanimText) continue;
      const kod = p.KullanımTipi ? String(p.KullanımTipi) : null;
      const { kategori, renkEtiket } = kullanimMetniniSiniflandir(kullanimText, kod);
      arazi = {
        kod: p.KullanımTipi ? String(p.KullanımTipi) : null,
        metin: kullanimText,
        eskiMetin: String(p.ESKIKULLANIM ?? "").trim() || null,
        kategori,
        renkEtiket,
      };
      break;
    }
  }

  const guvenSkoru = arazi ? (sitAlani || endustriBolgesi ? 95 : 85) : 40;

  return {
    parselKey,
    kaynak: "tucbs-wms",
    bolge: bolge.bolgeAd,
    wmsSlug: bolge.slug,
    araziKullanimi: arazi,
    sitAlani,
    endustriBolgesi,
    il,
    ilce,
    kapsam: arazi ? "tam" : "veri-yok",
    guvenSkoru,
    fetchedAt: Date.now(),
  };
}

function ilEksikSonuc(parselKey: string, ilAd: string | null): TucbsCdpSonuc {
  return {
    parselKey,
    kaynak: "tucbs-wms",
    bolge: null,
    wmsSlug: null,
    araziKullanimi: null,
    sitAlani: false,
    endustriBolgesi: false,
    il: ilAd,
    ilce: null,
    kapsam: "il-eksik",
    guvenSkoru: 0,
    fetchedAt: Date.now(),
    hata: ilAd
      ? `${ilAd} için TUCBS ÇDP verisi henüz yayınlanmıyor.`
      : "İl bilgisi yok.",
  };
}

/**
 * Parsel merkez koordinatından ÇDP arazi kullanım verisini çeker.
 */
export async function tucbsCdpGetir(
  parsel: Parsel,
  signal?: AbortSignal,
): Promise<TucbsCdpSonuc> {
  const parselKey = tucbsParselKeyFromParsel(parsel);
  const bolge = tucbsWmsEndpointGetir(parsel.ilAd);

  if (!bolge) {
    return ilEksikSonuc(parselKey, parsel.ilAd ?? null);
  }

  const lat = parsel.merkezNokta?.lat;
  const lng = parsel.merkezNokta?.lng;
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      ...ilEksikSonuc(parselKey, parsel.ilAd ?? null),
      kapsam: "veri-yok",
      hata: "Parsel koordinatı yok.",
    };
  }

  const key = cacheKey(lat, lng, bolge.slug);
  try {
    const cached = await db.tucbsCdpCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { ...cached.sonuc, parselKey };
    }
  } catch {
    // Dexie yoksa (test) devam
  }

  try {
    const ozellikler = await wmsFeatureInfoGetir(bolge.slug, lat, lng, signal);
    const sonuc = ozelliklerdenSonucOlustur(parselKey, bolge, ozellikler);

    try {
      await db.tucbsCdpCache.put({ key, sonuc, fetchedAt: sonuc.fetchedAt });
    } catch {
      // ignore cache write errors
    }

    return sonuc;
  } catch (e) {
    return {
      parselKey,
      kaynak: "tucbs-wms",
      bolge: bolge.bolgeAd,
      wmsSlug: bolge.slug,
      araziKullanimi: null,
      sitAlani: false,
      endustriBolgesi: false,
      il: parsel.ilAd ?? null,
      ilce: parsel.ilceAd ?? null,
      kapsam: "veri-yok",
      guvenSkoru: 0,
      fetchedAt: Date.now(),
      hata: e instanceof Error ? e.message : "TUCBS sorgusu başarısız",
    };
  }
}

/** fiyat-tahmin.ts için imar sınıfı özeti */
export function tucbsImarMetni(sonuc: TucbsCdpSonuc | null | undefined): string {
  if (!sonuc?.araziKullanimi) return "";
  return [
    sonuc.araziKullanimi.metin,
    sonuc.araziKullanimi.eskiMetin,
    sonuc.sitAlani ? "sit alanı" : "",
    sonuc.endustriBolgesi ? "sanayi bölgesi" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** İlan iddiası ile ÇDP çelişiyor mu? */
export function tucbsCdpCeliskiVar(
  sonuc: TucbsCdpSonuc | null | undefined,
  ilanImarDurumu?: string | null,
): boolean {
  if (!sonuc?.araziKullanimi || !ilanImarDurumu) return false;
  const ilan = ilanImarDurumu.toLocaleLowerCase("tr");
  const kat = sonuc.araziKullanimi.kategori;
  if (/imarlı|imarli|konut|arsa/.test(ilan) && kat === "tarim-koruma") return true;
  if (/konut|villa/.test(ilan) && (kat === "sanayi" || sonuc.endustriBolgesi)) return true;
  return false;
}
