/**
 * Site-side TUCBS ÇDP slug eşlemesi (extension tucbs-wms-endpoints ile aynı iller).
 * İstanbul / Ankara vb. kapsam dışı → null.
 */

const IL_TO_SLUG: Record<string, { slug: string; bolgeAd: string }> = {
  izmir: { slug: "csb_cdp_im_wms", bolgeAd: "İzmir – Manisa" },
  manisa: { slug: "csb_cdp_im_wms", bolgeAd: "İzmir – Manisa" },
  mersin: { slug: "csb_cdp_ma_wms", bolgeAd: "Mersin – Adana" },
  adana: { slug: "csb_cdp_ma_wms", bolgeAd: "Mersin – Adana" },
  antalya: { slug: "csb_cdp_abi_wms", bolgeAd: "Antalya – Burdur – Isparta" },
  burdur: { slug: "csb_cdp_abi_wms", bolgeAd: "Antalya – Burdur – Isparta" },
  isparta: { slug: "csb_cdp_abi_wms", bolgeAd: "Antalya – Burdur – Isparta" },
  konya: { slug: "csb_cdp_kk_wms", bolgeAd: "Konya – Karaman" },
  karaman: { slug: "csb_cdp_kk_wms", bolgeAd: "Konya – Karaman" },
  tekirdag: { slug: "csb_cdp_ergene_wms", bolgeAd: "Tekirdağ – Kırklareli – Edirne" },
  kirklareli: { slug: "csb_cdp_ergene_wms", bolgeAd: "Tekirdağ – Kırklareli – Edirne" },
  edirne: { slug: "csb_cdp_ergene_wms", bolgeAd: "Tekirdağ – Kırklareli – Edirne" },
  kirsehir: { slug: "csb_cdp_knna_wms", bolgeAd: "Kırşehir – Nevşehir – Niğde – Aksaray" },
  nevsehir: { slug: "csb_cdp_knna_wms", bolgeAd: "Kırşehir – Nevşehir – Niğde – Aksaray" },
  nigde: { slug: "csb_cdp_knna_wms", bolgeAd: "Kırşehir – Nevşehir – Niğde – Aksaray" },
  aksaray: { slug: "csb_cdp_knna_wms", bolgeAd: "Kırşehir – Nevşehir – Niğde – Aksaray" },
  yozgat: { slug: "csb_cdp_ysk_wms", bolgeAd: "Yozgat – Sivas – Kayseri" },
  sivas: { slug: "csb_cdp_ysk_wms", bolgeAd: "Yozgat – Sivas – Kayseri" },
  kayseri: { slug: "csb_cdp_ysk_wms", bolgeAd: "Yozgat – Sivas – Kayseri" },
  zonguldak: { slug: "csb_cdp_zbk_wms", bolgeAd: "Zonguldak – Bartın – Karabük" },
  bartin: { slug: "csb_cdp_zbk_wms", bolgeAd: "Zonguldak – Bartın – Karabük" },
  karabuk: { slug: "csb_cdp_zbk_wms", bolgeAd: "Zonguldak – Bartın – Karabük" },
  sinop: { slug: "csb_cdp_skc_wms", bolgeAd: "Sinop – Kastamonu – Çankırı" },
  kastamonu: { slug: "csb_cdp_skc_wms", bolgeAd: "Sinop – Kastamonu – Çankırı" },
  cankiri: { slug: "csb_cdp_skc_wms", bolgeAd: "Sinop – Kastamonu – Çankırı" },
  adiyaman: { slug: "csb_cdp_asd_wms", bolgeAd: "Adıyaman – Şanlıurfa – Diyarbakır" },
  sanliurfa: { slug: "csb_cdp_asd_wms", bolgeAd: "Adıyaman – Şanlıurfa – Diyarbakır" },
  diyarbakir: { slug: "csb_cdp_asd_wms", bolgeAd: "Adıyaman – Şanlıurfa – Diyarbakır" },
  mus: { slug: "csb_cdp_mbv_wms", bolgeAd: "Muş – Bitlis – Van" },
  bitlis: { slug: "csb_cdp_mbv_wms", bolgeAd: "Muş – Bitlis – Van" },
  van: { slug: "csb_cdp_mbv_wms", bolgeAd: "Muş – Bitlis – Van" },
  ardahan: { slug: "csb_cdp_akia_wms", bolgeAd: "Ardahan – Kars – Iğdır – Ağrı" },
  kars: { slug: "csb_cdp_akia_wms", bolgeAd: "Ardahan – Kars – Iğdır – Ağrı" },
  igdir: { slug: "csb_cdp_akia_wms", bolgeAd: "Ardahan – Kars – Iğdır – Ağrı" },
  agri: { slug: "csb_cdp_akia_wms", bolgeAd: "Ardahan – Kars – Iğdır – Ağrı" },
  yalova: { slug: "csb_cdp_yalova_wms", bolgeAd: "Yalova" },
  kirikkale: { slug: "csb_cdp_kirikkale_wms", bolgeAd: "Kırıkkale" },
  bolu: { slug: "csb_cdp_bolu_wms", bolgeAd: "Bolu" },
  amasya: { slug: "csb_cdp_amasya_wms", bolgeAd: "Amasya" },
  osmaniye: { slug: "csb_cdp_osmaniye_wms", bolgeAd: "Osmaniye" },
  kilis: { slug: "csb_cdp_kilis_wms", bolgeAd: "Kilis" },
};

export function tucbsSlugIlIcin(ilNorm: string | null | undefined): { slug: string; bolgeAd: string } | null {
  if (!ilNorm) return null;
  const key = ilNorm
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/\s+/g, "");
  return IL_TO_SLUG[key] ?? null;
}

/** GeoJSON FeatureInfo'dan kısa özet metin */
export function tucbsFeatureOzet(geojson: unknown): string | null {
  if (!geojson || typeof geojson !== "object") return null;
  const gj = geojson as { features?: Array<{ properties?: Record<string, unknown> }> };
  const feats = gj.features;
  if (!feats?.length) return null;
  const p = feats[0].properties ?? {};
  const keys = ["KULLANIM", "kullanim", "SINIF", "sinif", "ADI", "adi", "LAYER", "layer", "PLAN_ADI", "plan_adi"];
  for (const k of keys) {
    const v = p[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  const first = Object.entries(p).find(([, v]) => v != null && String(v).trim() && String(v).length < 80);
  return first ? `${first[0]}: ${first[1]}` : "ÇDP katmanı bulundu";
}
