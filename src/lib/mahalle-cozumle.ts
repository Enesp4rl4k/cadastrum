/**
 * Mahalle kodu çözümleme — tek giriş noktası (sıfır-hata hedefi).
 */
import type { Mahalle } from "../types/tkgm";
import { ilanUrldenLokasyon } from "./lokasyon-slug";
import { mahalleAliasKaydet, mahalleAliasOku } from "./mahalle-alias";
import {
  findMahalleByAd,
  getMahalleListesi,
  ilceKodunuBul,
  mahalleAdaylariFromListe,
  mahalleBulKoordinatla,
  mahalleEsleFromListe,
  type MahalleAdayi,
} from "./tkgm-api";

export type MahalleCozumYontem =
  | "alias"
  | "isim"
  | "url-slug"
  | "api"
  | "koordinat"
  | "manuel-kod";

export interface MahalleCozumleGirdi {
  ilAd: string;
  ilceAd: string;
  mahalleAd: string | null;
  kaynak?: "sahibinden" | "hepsiemlak";
  url?: string;
  lat?: number | null;
  lng?: number | null;
  ilceKodu?: number | null;
  mahalleler?: Mahalle[] | null;
  /** Dropdown'dan doğrudan seçilen kod */
  secilenMahalleKodu?: number | null;
}

export interface MahalleCozumleSonuc {
  mahalleKodu: number;
  mahalleAd: string;
  yontem: MahalleCozumYontem;
  skor?: number;
}

export interface MahalleCozumleBasarisiz {
  adaylar: MahalleAdayi[];
  mesaj: string;
}

export type MahalleCozumleCikti =
  | { ok: true; sonuc: MahalleCozumleSonuc }
  | { ok: false; hata: MahalleCozumleBasarisiz };

async function ilceVeListe(
  girdi: MahalleCozumleGirdi,
): Promise<{ ilceKodu: number; mahalleler: Mahalle[] } | null> {
  let ilceKodu = girdi.ilceKodu ?? null;
  if (ilceKodu == null) {
    ilceKodu = await ilceKodunuBul(girdi.ilAd, girdi.ilceAd);
  }
  if (ilceKodu == null) return null;
  const mahalleler = girdi.mahalleler ?? (await getMahalleListesi(ilceKodu));
  return { ilceKodu, mahalleler };
}

function basarili(
  m: Mahalle,
  yontem: MahalleCozumYontem,
  skor?: number,
): MahalleCozumleSonuc {
  return {
    mahalleKodu: m.mahalleKodu,
    mahalleAd: m.mahalleAdi,
    yontem,
    skor,
  };
}

/**
 * Mahalle kodunu çözer; başarılıysa isteğe bağlı alias kaydı yapar.
 */
export async function mahalleKoduCoz(
  girdi: MahalleCozumleGirdi,
  opts: { aliasKaydet?: boolean } = { aliasKaydet: true },
): Promise<MahalleCozumleCikti> {
  if (girdi.secilenMahalleKodu != null) {
    const ctx = await ilceVeListe(girdi);
    const m = ctx?.mahalleler.find((x) => x.mahalleKodu === girdi.secilenMahalleKodu);
    if (m) {
      const sonuc = basarili(m, "manuel-kod", 100);
      if (opts.aliasKaydet && girdi.mahalleAd) {
        await mahalleAliasKaydet({
          ilAd: girdi.ilAd,
          ilceAd: girdi.ilceAd,
          mahalleAd: girdi.mahalleAd,
          mahalleKodu: m.mahalleKodu,
          tkgmMahalleAd: m.mahalleAdi,
          kaynak: "manuel",
        }).catch(() => {});
      }
      return { ok: true, sonuc };
    }
  }

  const ctx = await ilceVeListe(girdi);
  if (!ctx) {
    return {
      ok: false,
      hata: {
        adaylar: [],
        mesaj: "İl veya ilçe TKGM'de bulunamadı. Yer bilgisini düzelt.",
      },
    };
  }

  const { ilceKodu, mahalleler } = ctx;
  const mahalleAd = girdi.mahalleAd?.trim() ?? "";

  if (mahalleAd) {
    const alias = await mahalleAliasOku(girdi.ilAd, girdi.ilceAd, mahalleAd);
    if (alias) {
      const m = mahalleler.find((x) => x.mahalleKodu === alias.mahalleKodu);
      if (m) return { ok: true, sonuc: basarili(m, "alias", 100) };
    }

    const eslesen = mahalleEsleFromListe(mahalleler, mahalleAd);
    if (eslesen) {
      const sonuc = basarili(eslesen, "isim", 90);
      if (opts.aliasKaydet) {
        await mahalleAliasKaydet({
          ilAd: girdi.ilAd,
          ilceAd: girdi.ilceAd,
          mahalleAd,
          mahalleKodu: eslesen.mahalleKodu,
          tkgmMahalleAd: eslesen.mahalleAdi,
          kaynak: "otomatik",
        }).catch(() => {});
      }
      return { ok: true, sonuc };
    }

    if (girdi.url && girdi.kaynak) {
      const urlLok = ilanUrldenLokasyon(girdi.url, girdi.kaynak);
      if (urlLok.mahalle) {
        const urlM = mahalleEsleFromListe(mahalleler, urlLok.mahalle);
        if (urlM) {
          const sonuc = basarili(urlM, "url-slug", 85);
          if (opts.aliasKaydet) {
            await mahalleAliasKaydet({
              ilAd: girdi.ilAd,
              ilceAd: girdi.ilceAd,
              mahalleAd,
              mahalleKodu: urlM.mahalleKodu,
              tkgmMahalleAd: urlM.mahalleAdi,
              kaynak: "otomatik",
            }).catch(() => {});
          }
          return { ok: true, sonuc };
        }
      }
    }

    const api = await findMahalleByAd(girdi.ilAd, girdi.ilceAd, mahalleAd, {
      ilceKodu,
      mahalleler,
    });
    if (api) {
      const sonuc: MahalleCozumleSonuc = {
        mahalleKodu: api.mahalleKodu,
        mahalleAd: api.mahalleAd,
        yontem: "api",
        skor: 88,
      };
      if (opts.aliasKaydet) {
        await mahalleAliasKaydet({
          ilAd: girdi.ilAd,
          ilceAd: girdi.ilceAd,
          mahalleAd,
          mahalleKodu: api.mahalleKodu,
          tkgmMahalleAd: api.mahalleAd,
          kaynak: "otomatik",
        }).catch(() => {});
      }
      return { ok: true, sonuc };
    }
  }

  if (
    girdi.lat != null &&
    girdi.lng != null &&
    Number.isFinite(girdi.lat) &&
    Number.isFinite(girdi.lng)
  ) {
    const koordM = await mahalleBulKoordinatla(ilceKodu, girdi.lat, girdi.lng);
    if (koordM) {
      const sonuc = basarili(koordM, "koordinat", 95);
      if (opts.aliasKaydet && mahalleAd) {
        await mahalleAliasKaydet({
          ilAd: girdi.ilAd,
          ilceAd: girdi.ilceAd,
          mahalleAd,
          mahalleKodu: koordM.mahalleKodu,
          tkgmMahalleAd: koordM.mahalleAdi,
          kaynak: "otomatik",
        }).catch(() => {});
      }
      return { ok: true, sonuc };
    }
  }

  const adaylar = mahalleAd
    ? mahalleAdaylariFromListe(mahalleler, mahalleAd, 8)
    : [];
  const oneriMetin = adaylar
    .slice(0, 3)
    .map((o) => `${o.mahalle.mahalleAdi} (%${o.skor})`)
    .join(", ");

  return {
    ok: false,
    hata: {
      adaylar,
      mesaj:
        adaylar.length > 0
          ? `“${mahalleAd}” TKGM’de birebir yok. Öneri: ${oneriMetin}. Aşağıdan seç.`
          : mahalleAd
            ? `“${mahalleAd}” bu ilçede TKGM listesinde yok (semt veya farklı isim olabilir). Aşağıdan seç.`
            : "Mahalle seç — listeden TKGM mahallesini işaretle.",
    },
  };
}
