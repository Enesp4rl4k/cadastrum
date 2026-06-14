/**
 * Modüler analiz sistemi.
 * Her modül kendi component'inde render olur, AnalizPanel registry'den çeker.
 * Kullanıcı ⚙ Ayarlar'dan açıp/kapayabilir.
 */

export type ModulId =
  | "skorlar"
  | "nitelik-konum"
  | "boyut-sekil"
  | "fiyat-tahmin"
  | "belediye-imar"
  | "tkgm-resmi-analiz"
  | "fizibilite"
  | "gunes-enerjisi"
  | "tarim";

export type ModulKategori =
  | "konum"
  | "finans"
  | "insaat"
  | "enerji"
  | "tarim"
  | "yasal";

export interface ModulTanimi {
  id: ModulId;
  ad: string;
  kategori: ModulKategori;
  defaultAcik: boolean;
  aciklama: string;
}

export const MODULLER: ModulTanimi[] = [
  {
    id: "skorlar",
    ad: "Lojistik / Fiziksel / Erişim / Altyapı skorları",
    kategori: "konum",
    defaultAcik: true,
    aciklama: "OSM verisiyle 4 ana skor (en kritik bilgi).",
  },
  {
    id: "nitelik-konum",
    ad: "Nitelik & Konum yorumu",
    kategori: "konum",
    defaultAcik: true,
    aciklama: "Parselin niteliği + bölge sınıfı (büyükşehir/kıyı vs.)",
  },
  {
    id: "boyut-sekil",
    ad: "Boyut & Şekil analizi",
    kategori: "konum",
    defaultAcik: true,
    aciklama: "Alan, çevre, en/boy oranı, kompaktlık.",
  },
  {
    id: "fiyat-tahmin",
    ad: "Fiyat Tahmini (heuristic + AI)",
    kategori: "finans",
    defaultAcik: true,
    aciklama: "Çoklu sinyalden TL/m² tahmini + opsiyonel AI yorum.",
  },
  {
    id: "belediye-imar",
    ad: "Belediye + İmar deep-link",
    kategori: "yasal",
    defaultAcik: true,
    aciklama: "İlgili belediye İmar Müdürlüğü sayfa linkleri.",
  },
  {
    id: "tkgm-resmi-analiz",
    ad: "TKGM Resmi Analiz",
    kategori: "finans",
    defaultAcik: true,
    aciklama: "İlçe satış yoğunluğu (5 tip × 22 yıl) + sparkline trend.",
  },
  {
    id: "fizibilite",
    ad: "Fizibilite Hesaplayıcı",
    kategori: "finans",
    defaultAcik: false,
    aciklama: "Apartman/depo/villa yapı maliyeti + satış/kira projeksiyonu.",
  },
  {
    id: "gunes-enerjisi",
    ad: "Güneş Enerjisi (PV) potansiyeli",
    kategori: "enerji",
    defaultAcik: false,
    aciklama:
      "PVGIS'ten yıllık üretim + arsanın PV yatırım gelir/geri ödeme tahmini.",
  },
  {
    id: "tarim",
    ad: "Tarımsal Yatırım önerisi",
    kategori: "tarim",
    defaultAcik: false,
    aciklama:
      "5 yıllık iklim normalleri + 12 ürün uygunluk + yıllık brüt gelir TL/dönüm.",
  },
];

export const MODUL_KATEGORI_ETIKET: Record<ModulKategori, string> = {
  konum: "Konum & Fizik",
  finans: "Finans & Değerleme",
  insaat: "İnşaat & İmar",
  yasal: "Yasal & Resmi",
  enerji: "Enerji",
  tarim: "Tarım",
};
