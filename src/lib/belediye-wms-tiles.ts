/**
 * Belediye imar haritası — MapLibre raster tile URL şablonları.
 * Pilot: İstanbul İBB ArcGIS MapServer (PLAN 1000 / 5000).
 * OGC SPA endpoint (sehirharitasi … GoruntulemeOGCService) GetCapabilities vermiyor.
 */

export type BelediyeHaritaMod = "arcgis-export" | "wms" | "deep-link";

export interface BelediyeWmsKaynak {
  ilNorm: string;
  ad: string;
  mod: BelediyeHaritaMod;
  /** ArcGIS MapServer root veya WMS GetMap base */
  getMapBase: string;
  /** ArcGIS: "show:13,14" | WMS: layer name */
  layers: string;
  attribution: string;
  /** Deep-link yedek (tile yoksa / hata durumunda) */
  portalUrl?: string;
  version?: "1.1.1" | "1.3.0";
}

/**
 * Belediye WMS/ArcGIS kaynakları — MapLibre raster tile üretimi için.
 * Şu an tile endpoint'i doğrulanan iller: İstanbul.
 * Diğerleri deep-link + e-Plan yönlendirmesi.
 */
export const BELEDIYE_WMS_KAYNAKLARI: BelediyeWmsKaynak[] = [
  {
    ilNorm: "istanbul",
    ad: "İBB Plan (1/1000–1/5000)",
    mod: "arcgis-export",
    getMapBase:
      "https://cbsmapws.ibb.gov.tr/arcgis/rest/services/KAZI_RUHSAT/QueryMap/MapServer/export",
    layers: "show:12,13,14",
    attribution: "© İBB CBS",
    portalUrl: "https://sehirharitasi.ibb.gov.tr",
  },
  // Aşağıdaki kaynaklar endpoint doğrulaması bekliyor;
  // şimdilik deep-link modunda — tile alınamayınca portal açılır.
  {
    ilNorm: "ankara",
    ad: "ABB Harita",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© ABB",
    portalUrl: "https://eimar.ankara.bel.tr",
  },
  {
    ilNorm: "izmir",
    ad: "İzmir CBS",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© İzmir BŞB",
    portalUrl: "https://cbs.izmir.bel.tr",
  },
  {
    ilNorm: "bursa",
    ad: "Bursa e-İmar",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Bursa BŞB",
    portalUrl: "https://eimar.bursa.bel.tr",
  },
  {
    ilNorm: "antalya",
    ad: "Antalya İmar Sorgu",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Antalya BŞB",
    portalUrl: "https://imarsorgu.antalya.bel.tr",
  },
  {
    ilNorm: "adana",
    ad: "Adana BŞB e-İmar",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Adana BŞB",
    portalUrl: "https://eimar.adana.bel.tr",
  },
  {
    ilNorm: "gaziantep",
    ad: "Gaziantep BŞB",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Gaziantep BŞB",
    portalUrl: "https://eimar.gaziantep.bel.tr",
  },
  {
    ilNorm: "konya",
    ad: "Konya BŞB İmar",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Konya BŞB",
    portalUrl: "https://eimar.konya.bel.tr",
  },
  {
    ilNorm: "kocaeli",
    ad: "Kocaeli BŞB CBS",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Kocaeli BŞB",
    portalUrl: "https://cbs.kocaeli.bel.tr",
  },
  {
    ilNorm: "mersin",
    ad: "Mersin BŞB",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Mersin BŞB",
    portalUrl: "https://eimar.mersin.bel.tr",
  },
  {
    ilNorm: "diyarbakir",
    ad: "Diyarbakır BŞB",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Diyarbakır BŞB",
    portalUrl: "https://eimar.diyarbakir.bel.tr",
  },
  {
    ilNorm: "hatay",
    ad: "Hatay BŞB",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Hatay BŞB",
    portalUrl: "https://eimar.hatay.bel.tr",
  },
  {
    ilNorm: "manisa",
    ad: "Manisa BŞB",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Manisa BŞB",
    portalUrl: "https://eimar.manisa.bel.tr",
  },
  {
    ilNorm: "sakarya",
    ad: "Sakarya BŞB",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Sakarya BŞB",
    portalUrl: "https://eimar.sakarya.bel.tr",
  },
  {
    ilNorm: "tekirdag",
    ad: "Tekirdağ BŞB",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Tekirdağ BŞB",
    portalUrl: "https://eimar.tekirdag.bel.tr",
  },
  {
    ilNorm: "denizli",
    ad: "Denizli BŞB",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Denizli BŞB",
    portalUrl: "https://eimar.denizli.bel.tr",
  },
  {
    ilNorm: "balikesir",
    ad: "Balıkesir BŞB",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Balıkesir BŞB",
    portalUrl: "https://eimar.balikesir.bel.tr",
  },
  {
    ilNorm: "malatya",
    ad: "Malatya BŞB",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Malatya BŞB",
    portalUrl: "https://eimar.malatya.bel.tr",
  },
  {
    ilNorm: "erzurum",
    ad: "Erzurum BŞB",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Erzurum BŞB",
    portalUrl: "https://eimar.erzurum.bel.tr",
  },
  {
    ilNorm: "van",
    ad: "Van BŞB",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Van BŞB",
    portalUrl: "https://eimar.van.bel.tr",
  },
  {
    ilNorm: "eskisehir",
    ad: "Eskişehir BŞB CBS",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Eskişehir BŞB",
    portalUrl: "https://cbs.eskisehir.bel.tr",
  },
  {
    ilNorm: "samsun",
    ad: "Samsun BŞB",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Samsun BŞB",
    portalUrl: "https://eimar.samsun.bel.tr",
  },
  {
    ilNorm: "kahramanmaras",
    ad: "Kahramanmaraş BŞB",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Kahramanmaraş BŞB",
    portalUrl: "https://eimar.kahramanmaras.bel.tr",
  },
  {
    ilNorm: "kayseri",
    ad: "Kayseri BŞB",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Kayseri BŞB",
    portalUrl: "https://eimar.kayseri.bel.tr",
  },
  {
    ilNorm: "trabzon",
    ad: "Trabzon BŞB",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Trabzon BŞB",
    portalUrl: "https://eimar.trabzon.bel.tr",
  },
  {
    ilNorm: "aydin",
    ad: "Aydın BŞB",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Aydın BŞB",
    portalUrl: "https://eimar.aydin.bel.tr",
  },
  {
    ilNorm: "mugla",
    ad: "Muğla BŞB",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Muğla BŞB",
    portalUrl: "https://eimar.mugla.bel.tr",
  },
  {
    ilNorm: "mardin",
    ad: "Mardin BŞB",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Mardin BŞB",
    portalUrl: "https://eimar.mardin.bel.tr",
  },
  {
    ilNorm: "sanliurfa",
    ad: "Şanlıurfa BŞB",
    mod: "deep-link",
    getMapBase: "",
    layers: "",
    attribution: "© Şanlıurfa BŞB",
    portalUrl: "https://eimar.sanliurfa.bel.tr",
  },
];

/** WMS yok ama portal deep-link var — MapView'da "yeni sekme" */
export interface BelediyeDeepLink {
  ilNorm: string;
  ad: string;
  url: string;
}

/**
 * Özel deep-link tanımları — WMS_KAYNAKLARI içinde olmayan iller için.
 * WMS_KAYNAKLARI'ndaki deep-link modlu iller oradan alınır.
 */
export const BELEDIYE_DEEP_LINKS: BelediyeDeepLink[] = [
  // Büyükşehir olmayan iller için e-Plan CSB yönlendirmesi yapılır (belediye-imar.ts)
];

export function normalizeIlAd(ilAd: string | null | undefined): string | null {
  if (!ilAd) return null;
  return ilAd
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/\s+/g, "");
}

export function belediyeWmsKaynakBul(ilAd: string | null | undefined): BelediyeWmsKaynak | null {
  const norm = normalizeIlAd(ilAd);
  if (!norm) return null;
  return BELEDIYE_WMS_KAYNAKLARI.find((k) => k.ilNorm === norm) ?? null;
}

export function belediyeDeepLinkBul(ilAd: string | null | undefined): BelediyeDeepLink | null {
  const norm = normalizeIlAd(ilAd);
  if (!norm) return null;
  // WMS varsa deep-link yedek olarak portalUrl kullanılır
  const wms = BELEDIYE_WMS_KAYNAKLARI.find((k) => k.ilNorm === norm);
  if (wms?.portalUrl) return { ilNorm: norm, ad: wms.ad, url: wms.portalUrl };
  return BELEDIYE_DEEP_LINKS.find((k) => k.ilNorm === norm) ?? null;
}

function wmsGetMapQuery(kaynak: BelediyeWmsKaynak): string {
  const version = kaynak.version ?? "1.3.0";
  const crsKey = version === "1.3.0" ? "CRS" : "SRS";
  return new URLSearchParams({
    SERVICE: "WMS",
    VERSION: version,
    REQUEST: "GetMap",
    FORMAT: "image/png",
    TRANSPARENT: "true",
    LAYERS: kaynak.layers,
    [crsKey]: "EPSG:3857",
    STYLES: "",
    WIDTH: "256",
    HEIGHT: "256",
  }).toString();
}

/** MapLibre raster tiles — BBOX template */
export function belediyeWmsTileUrls(kaynak: BelediyeWmsKaynak): string[] {
  if (kaynak.mod === "deep-link") return [];

  if (kaynak.mod === "arcgis-export") {
    const q = new URLSearchParams({
      bboxSR: "3857",
      imageSR: "3857",
      size: "256,256",
      dpi: "96",
      format: "png32",
      transparent: "true",
      layers: kaynak.layers,
      f: "image",
    }).toString();
    const sep = kaynak.getMapBase.includes("?") ? "&" : "?";
    return [`${kaynak.getMapBase}${sep}${q}&bbox={bbox-epsg-3857}`];
  }

  const q = wmsGetMapQuery(kaynak);
  const sep = kaynak.getMapBase.includes("?") ? "&" : "?";
  return [`${kaynak.getMapBase}${sep}${q}&BBOX={bbox-epsg-3857}`];
}
