/**
 * TUCBS açık Çevre Düzeni Planı (ÇDP) WMS servisleri — il → endpoint eşlemesi.
 * Kaynak: CSB tucbs-public-api + bölgesel planlama grupları.
 * Tüm iller kapsanmıyor; eksik iller için null döner.
 */

import { normalizeYerAdi } from "../tkgm-api";

export const TUCBS_WMS_BASE = "https://tucbs-public-api.csb.gov.tr";

export interface TucbsWmsBolge {
  /** URL path segmenti, örn. csb_cdp_im_wms */
  slug: string;
  /** Kullanıcıya gösterilecek bölge adı */
  bolgeAd: string;
  /** Bu serviste kapsanan iller (normalize edilmiş) */
  iller: string[];
}

/** Bölgesel ÇDP WMS servisleri */
export const TUCBS_CDP_BOLGELER: TucbsWmsBolge[] = [
  {
    slug: "csb_cdp_im_wms",
    bolgeAd: "İzmir – Manisa",
    iller: ["izmir", "manisa"],
  },
  {
    slug: "csb_cdp_ma_wms",
    bolgeAd: "Mersin – Adana",
    iller: ["mersin", "adana"],
  },
  {
    slug: "csb_cdp_abi_wms",
    bolgeAd: "Antalya – Burdur – Isparta",
    iller: ["antalya", "burdur", "isparta"],
  },
  {
    slug: "csb_cdp_kk_wms",
    bolgeAd: "Konya – Karaman",
    iller: ["konya", "karaman"],
  },
  {
    slug: "csb_cdp_ergene_wms",
    bolgeAd: "Tekirdağ – Kırklareli – Edirne",
    iller: ["tekirdag", "kirklareli", "edirne"],
  },
  {
    slug: "csb_cdp_knna_wms",
    bolgeAd: "Kırşehir – Nevşehir – Niğde – Aksaray",
    iller: ["kirsehir", "nevsehir", "nigde", "aksaray"],
  },
  {
    slug: "csb_cdp_ysk_wms",
    bolgeAd: "Yozgat – Sivas – Kayseri",
    iller: ["yozgat", "sivas", "kayseri"],
  },
  {
    slug: "csb_cdp_zbk_wms",
    bolgeAd: "Zonguldak – Bartın – Karabük",
    iller: ["zonguldak", "bartin", "karabuk"],
  },
  {
    slug: "csb_cdp_skc_wms",
    bolgeAd: "Sinop – Kastamonu – Çankırı",
    iller: ["sinop", "kastamonu", "cankiri"],
  },
  {
    slug: "csb_cdp_asd_wms",
    bolgeAd: "Adıyaman – Şanlıurfa – Diyarbakır",
    iller: ["adiyaman", "sanliurfa", "diyarbakir"],
  },
  {
    slug: "csb_cdp_mbv_wms",
    bolgeAd: "Muş – Bitlis – Van",
    iller: ["mus", "bitlis", "van"],
  },
  {
    slug: "csb_cdp_akia_wms",
    bolgeAd: "Ardahan – Kars – Iğdır – Ağrı",
    iller: ["ardahan", "kars", "igdir", "agri"],
  },
  {
    slug: "csb_cdp_yalova_wms",
    bolgeAd: "Yalova",
    iller: ["yalova"],
  },
  {
    slug: "csb_cdp_kirikkale_wms",
    bolgeAd: "Kırıkkale",
    iller: ["kirikkale"],
  },
  {
    slug: "csb_cdp_bolu_wms",
    bolgeAd: "Bolu",
    iller: ["bolu"],
  },
  {
    slug: "csb_cdp_amasya_wms",
    bolgeAd: "Amasya",
    iller: ["amasya"],
  },
  {
    slug: "csb_cdp_osmaniye_wms",
    bolgeAd: "Osmaniye",
    iller: ["osmaniye"],
  },
  {
    slug: "csb_cdp_kilis_wms",
    bolgeAd: "Kilis",
    iller: ["kilis"],
  },
];

const IL_TO_BOLGE = new Map<string, TucbsWmsBolge>();
for (const bolge of TUCBS_CDP_BOLGELER) {
  for (const il of bolge.iller) {
    IL_TO_BOLGE.set(il, bolge);
  }
}

/** İzin verilen WMS slug'ları — proxy güvenliği için whitelist */
export const TUCBS_WMS_SLUG_WHITELIST = new Set(TUCBS_CDP_BOLGELER.map((b) => b.slug));

export function tucbsWmsEndpointGetir(ilAd: string | null | undefined): TucbsWmsBolge | null {
  if (!ilAd) return null;
  return IL_TO_BOLGE.get(normalizeYerAdi(ilAd)) ?? null;
}

export function tucbsWmsUrl(slug: string): string {
  return `${TUCBS_WMS_BASE}/${slug}`;
}
