/**
 * Sahibinden Bootstrap — admin-only, sadece geliştirici/admin için.
 *
 * Background service worker'da chrome.tabs API ile Sahibinden ilçe sayfalarını
 * arka plan tab'da açar, mevcut content script `sahibinden-liste.ts` otomatik
 * tarar, sonra tab kapatılır. PerimeterX engeli bunda azdır çünkü:
 *   1. Senin gerçek Chrome profilin
 *   2. Senin gerçek IP'n
 *   3. Sayfa açma rate'i insan-tempo'sunda (5-10 sn)
 *
 * Bu modül ÜRETİM DAĞITIMINA DAHİL DEĞİL:
 *   - Sadece import.meta.env.DEV ise UI'a render edilir
 *   - Production build'inde Vite tree-shake eder
 */

import { BOOTSTRAP_ILCE_LISTESI, type BootstrapIlce } from "./data/ilce-listesi-bootstrap";

export type BootstrapKategori = "arsa" | "tarla";

export interface BootstrapAyar {
  il: string | null; // null → tüm Türkiye
  kategoriler: BootstrapKategori[];
  rateMs: number; // sayfa arası bekleme (default 6000)
  bekleMs: number; // tab açıldıktan sonra content-script taraması için bekleme (default 4000)
}

export interface BootstrapDurum {
  calisiyor: boolean;
  toplamSayfa: number;
  islenenSayfa: number;
  hataAdet: number;
  botEngelAdet: number;
  sonIlce: string | null;
  baslangic: number;
}

export const KATEGORI_URL_PARCASI: Record<BootstrapKategori, string> = {
  arsa: "satilik-arsa",
  tarla: "satilik-tarla",
};

export function bootstrapHedefler(ayar: BootstrapAyar): Array<{
  ilce: BootstrapIlce;
  kategori: BootstrapKategori;
  url: string;
}> {
  const ilceler = ayar.il
    ? BOOTSTRAP_ILCE_LISTESI.filter((i) => i.il === ayar.il)
    : BOOTSTRAP_ILCE_LISTESI;
  const hedefler: Array<{ ilce: BootstrapIlce; kategori: BootstrapKategori; url: string }> = [];
  for (const ilce of ilceler) {
    for (const k of ayar.kategoriler) {
      hedefler.push({
        ilce,
        kategori: k,
        url: `https://www.sahibinden.com/${KATEGORI_URL_PARCASI[k]}/${ilce.ilNorm}-${ilce.ilceNorm}?pagingSize=50`,
      });
    }
  }
  return hedefler;
}
