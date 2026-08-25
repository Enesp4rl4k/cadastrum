/**
 * Mahalle alias seed yükleyici — extension ilk açılışında çalışır.
 *
 * MAHALLE_ALIAS_SEED (scripts/mahalle-alias-uret.mjs çıktısı) Dexie
 * mahalleAlias tablosuna yüklenir. Mevcut kullanıcı kayıtları üzerine
 * yazılmaz — seed sadece eksik / hit=0 olanları tamamlar.
 *
 * Çağrı noktası: App.tsx mount sırasında bir kez (useEffect).
 */

import { db } from "./db";
import {
  MAHALLE_ALIAS_SEED,
  ALIAS_SEED_TARIHI,
  ALIAS_SEED_SAYI,
  type MahalleAliasSeedKayit,
} from "./data/mahalle-alias-seed";

/** LocalStorage key — aynı tarihli seed'i tekrar yükleme */
const SEED_YUKLENME_KEY = "mahalle_alias_seed_yuklenme";

/**
 * Seed'i Dexie'ye yükle.
 *
 * Strateji:
 * - Boş seed (henüz script koşulmamış) → hemen dön.
 * - Aynı tarihli seed daha önce yüklendiyse atla.
 * - Her key için: Dexie'de kayıt yoksa veya hit=0 ise güncelle.
 *   Kullanıcı gerçekten kullanmışsa (hit > 0) dokunma.
 *
 * @param zorunlu true ise tarih kontrolü atlanır (yeniden yükleme zorla)
 */
export async function mahalleAliasSeedYukle(zorunlu = false): Promise<{
  yuklendi: number;
  atlandi: number;
  toplam: number;
}> {
  const kayitlar = Object.entries(MAHALLE_ALIAS_SEED);

  if (kayitlar.length === 0) {
    return { yuklendi: 0, atlandi: 0, toplam: 0 };
  }

  // Tarih kontrolü — aynı seed tekrar yüklenmesin
  if (!zorunlu && ALIAS_SEED_TARIHI) {
    try {
      const sonYukleme = localStorage.getItem(SEED_YUKLENME_KEY);
      if (sonYukleme === ALIAS_SEED_TARIHI) {
        return { yuklendi: 0, atlandi: kayitlar.length, toplam: kayitlar.length };
      }
    } catch {
      // localStorage erişim hatası (SW context) — devam et
    }
  }

  let yuklendi = 0;
  let atlandi = 0;
  const simdi = Date.now();

  // 500'lük chunk'larda işle
  const CHUNK = 500;
  const typedKayitlar = kayitlar as [string, MahalleAliasSeedKayit][];
  for (let i = 0; i < typedKayitlar.length; i += CHUNK) {
    const chunk = typedKayitlar.slice(i, i + CHUNK);

    // Mevcut kayıtları toplu çek
    const mevcutlar = await db.mahalleAlias.bulkGet(chunk.map(([key]) => key));

    const yazilacaklar: Parameters<typeof db.mahalleAlias.put>[0][] = [];

    for (let j = 0; j < chunk.length; j++) {
      const entry = chunk[j];
      const mevcut = mevcutlar[j];
      if (!entry) continue;

      const [key, seedKayit] = entry;

      // Kullanıcı gerçekten kullanmışsa dokunma
      if (mevcut && mevcut.hit > 0) {
        atlandi++;
        continue;
      }

      // key formatı: `${ilNorm}|${ilceNorm}|${mahalleNorm}`
      const parts = key.split("|");
      const ilNorm     = parts[0] ?? "";
      const ilceNorm   = parts[1] ?? "";
      const mahalleNorm = parts[2] ?? "";

      if (!ilNorm || !ilceNorm || !mahalleNorm) {
        atlandi++;
        continue;
      }

      yazilacaklar.push({
        key,
        ilNorm,
        ilceNorm,
        mahalleNorm,
        mahalleKodu:    seedKayit.mahalleKodu,
        tkgmMahalleAd:  seedKayit.tkgmMahalleAd,
        kaynak:         "otomatik" as const,
        guncellenme:    simdi,
        hit:            0,
      });
      yuklendi++;
    }

    if (yazilacaklar.length > 0) {
      await db.mahalleAlias.bulkPut(yazilacaklar);
    }
  }

  // Yükleme tarihini kaydet
  if (ALIAS_SEED_TARIHI) {
    try {
      localStorage.setItem(SEED_YUKLENME_KEY, ALIAS_SEED_TARIHI);
    } catch {
      // SW context — atla
    }
  }

  console.info(
    `[alias-seed] Yüklendi: ${yuklendi}, atlandı: ${atlandi}, toplam: ${ALIAS_SEED_SAYI}`,
  );

  return { yuklendi, atlandi, toplam: kayitlar.length };
}

/** Seed yükleme durumunu döner (debug / LabView için) */
export async function aliasSeedBilgi(): Promise<{
  seedDosyasiVar: boolean;
  kayitSayisi: number;
  tarih: string;
  dexieSayisi: number;
}> {
  const dexieSayisi = await db.mahalleAlias.count();
  return {
    seedDosyasiVar: ALIAS_SEED_SAYI > 0,
    kayitSayisi:    ALIAS_SEED_SAYI,
    tarih:          ALIAS_SEED_TARIHI,
    dexieSayisi,
  };
}
