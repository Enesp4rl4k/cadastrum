/**
 * TUCBS Planlı Arazi Kullanımı — KullanımTipi kod → kategori eşlemesi.
 */

export type TucbsKullanimKategori =
  | "konut-gelisme"
  | "koy-yerlesik"
  | "tarim-koruma"
  | "sanayi"
  | "ticari-turizm"
  | "diger";

export interface TucbsKullanimKodKaydi {
  metin: string;
  kategori: TucbsKullanimKategori;
}

/** Öne çıkan / sık görülen kodlar (ÇDP WMS katman 2) */
export const TUCBS_KULLANIM_KODLARI: Record<string, TucbsKullanimKodKaydi> = {
  // Konut / yerleşim (1xxxx / 2xxxx benzeri)
  "10101": { metin: "Merkez yerleşik alan", kategori: "konut-gelisme" },
  "10102": { metin: "Gelişme konut alanı", kategori: "konut-gelisme" },
  "10103": { metin: "Düşük yoğunluklu konut", kategori: "konut-gelisme" },
  "10201": { metin: "Kentsel çalışma alanı", kategori: "konut-gelisme" },
  "20101": { metin: "Köy yerleşik alanı", kategori: "koy-yerlesik" },
  "20102": { metin: "Köy gelişme alanı", kategori: "koy-yerlesik" },
  // Tarım / koruma
  "30101": { metin: "Tarım alanı", kategori: "tarim-koruma" },
  "30102": { metin: "Sulu tarım alanı", kategori: "tarim-koruma" },
  "30201": { metin: "Orman alanı", kategori: "tarim-koruma" },
  "30202": { metin: "Mera alanı", kategori: "tarim-koruma" },
  "30301": { metin: "Sulak alan", kategori: "tarim-koruma" },
  "30302": { metin: "Doğal sit / koruma", kategori: "tarim-koruma" },
  // Sanayi
  "40101": { metin: "Sanayi alanı", kategori: "sanayi" },
  "40102": { metin: "Depolama / lojistik", kategori: "sanayi" },
  "40103": { metin: "Organize sanayi bölgesi", kategori: "sanayi" },
  // Ticaret / turizm / altyapı
  "40201": { metin: "Ticaret alanı", kategori: "ticari-turizm" },
  "40202": { metin: "Turizm alanı", kategori: "ticari-turizm" },
  "40301": { metin: "Liman / liman geri alanı", kategori: "ticari-turizm" },
  "40302": { metin: "Havalimanı / havaalanı", kategori: "ticari-turizm" },
  "40401": { metin: "Park / rekreasyon", kategori: "diger" },
  "40501": { metin: "Askeri güvenlik alanı", kategori: "tarim-koruma" },
};

export function kodIleSiniflandir(
  kod: string | null | undefined,
): TucbsKullanimKodKaydi | null {
  if (!kod || kod === "Null") return null;
  const normalized = kod.trim();
  return TUCBS_KULLANIM_KODLARI[normalized] ?? null;
}
