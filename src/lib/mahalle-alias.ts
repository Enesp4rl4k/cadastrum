/**
 * Öğrenen mahalle alias — kullanıcı / başarılı otomatik eşleşme kayıtları.
 */
import { db, type MahalleAliasKayit } from "./db";
import { normalizeMahalleAra, normalizeTr, normalizeYerAdi } from "./tkgm-api";

export function mahalleAliasAnahtar(
  ilAd: string,
  ilceAd: string,
  mahalleAd: string,
): string {
  return `${normalizeTr(ilAd)}|${normalizeYerAdi(ilceAd)}|${normalizeMahalleAra(mahalleAd)}`;
}

export async function mahalleAliasOku(
  ilAd: string,
  ilceAd: string,
  mahalleAd: string,
): Promise<MahalleAliasKayit | null> {
  const key = mahalleAliasAnahtar(ilAd, ilceAd, mahalleAd);
  const kayit = await db.mahalleAlias.get(key);
  if (!kayit) return null;
  void db.mahalleAlias.update(key, { hit: kayit.hit + 1 }).catch(() => {});
  return kayit;
}

export async function mahalleAliasKaydet(p: {
  ilAd: string;
  ilceAd: string;
  mahalleAd: string;
  mahalleKodu: number;
  tkgmMahalleAd: string;
  kaynak: MahalleAliasKayit["kaynak"];
}): Promise<void> {
  const key = mahalleAliasAnahtar(p.ilAd, p.ilceAd, p.mahalleAd);
  const mevcut = await db.mahalleAlias.get(key);
  await db.mahalleAlias.put({
    key,
    ilNorm: normalizeTr(p.ilAd),
    ilceNorm: normalizeYerAdi(p.ilceAd),
    mahalleNorm: normalizeMahalleAra(p.mahalleAd),
    mahalleKodu: p.mahalleKodu,
    tkgmMahalleAd: p.tkgmMahalleAd,
    kaynak: p.kaynak,
    guncellenme: Date.now(),
    hit: (mevcut?.hit ?? 0) + 1,
  });
}
