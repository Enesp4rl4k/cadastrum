import { describe, it, expect } from "vitest";
import { TeyitAsistani } from "../src/lib/ajanlar/teyit-asistani";

describe("Satıcı & Emlakçı Bilgi Teyit Asistanı (FAZ 5)", () => {
  const asistan = new TeyitAsistani();

  it("Eksik ada/parsel ve hisse durumunu tespit edip WhatsApp mesajı üretir", () => {
    const analiz = asistan.eksikleriAnalizEt({
      baslik: "Urla Yağcılar Satılık Tarla",
      aciklama: "Köy yakınında harika manzaralı kelepir yer.",
      kategori: "tarla",
      fiyatTL: 3_000_000,
      m2: 2500,
    });

    expect(analiz.adaParselEksikMi).toBe(true);
    expect(analiz.hisseDurumuBelirsizMi).toBe(true);
    expect(analiz.sorulacakSorular.length).toBeGreaterThanOrEqual(3);
    expect(analiz.hazirWhatsAppMesaji).toContain("Urla Yağcılar Satılık Tarla");
    expect(analiz.hazirWhatsAppMesaji).toContain("Ada ve parsel numarasını");
  });
});