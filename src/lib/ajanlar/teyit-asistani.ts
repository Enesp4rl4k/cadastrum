/**
 * Satıcı & Emlakçı Bilgi Teyit Asistanı (Listing Verification Assistant).
 *
 * İlan metnini inceleyerek eksik olan kritik parametreleri (ada/parsel numarası,
 * hisse/müstakil tapu durumu, fiili yol varlığı, nakit pazarlık marjı) tespit eder
 * ve satıcıya/emlakçıya WhatsApp/SMS üzerinden tek tıkla gönderilebilecek
 * profesyonel mesaj şablonları üretir.
 */

export interface EksikParametreAnalizi {
  adaParselEksikMi: boolean;
  hisseDurumuBelirsizMi: boolean;
  yolDurumuBelirsizMi: boolean;
  imarDurumuBelirsizMi: boolean;
  sorulacakSorular: string[];
  hazirWhatsAppMesaji: string;
}

export class TeyitAsistani {
  /**
   * İlan başlığı ve açıklamasını analiz ederek satıcıya sorulacak kritik soruları belirler.
   */
  public eksikleriAnalizEt(ilan: {
    baslik: string;
    aciklama?: string;
    kategori: "arsa" | "tarla" | "konut";
    fiyatTL: number;
    m2: number;
  }): EksikParametreAnalizi {
    const text = `${ilan.baslik} ${ilan.aciklama ?? ""}`.toLowerCase();

    // 1. Ada / Parsel Kontrolü
    const adaParselEksik = !/ada\s*[:\/-]?\s*\d+/i.test(text) && !/\d+\s*\/\s*\d+/.test(text);

    // 2. Hisse Durumu Kontrolü
    const hisseDurumuBelirsiz = !text.includes("müstakil") && !text.includes("tek tapu") && !text.includes("hisseli");

    // 3. Yol Durumu Kontrolü (Arsa/Tarla için)
    const yolDurumuBelirsiz = ilan.kategori !== "konut" && !text.includes("yol") && !text.includes("cephe");

    // 4. İmar Durumu Kontrolü
    const imarDurumuBelirsiz = ilan.kategori !== "konut" && !text.includes("imar") && !text.includes("plan");

    const sorular: string[] = [];
    if (adaParselEksik) sorular.push("Ada ve parsel numarasını TKGM Parsel Sorgu üzerinden teyit etmek için rica edebilir miyim?");
    if (hisseDurumuBelirsiz) sorular.push("Tapu müstakil (tek tapu) mü, yoksa hisseli paylı tapu mudur?");
    if (yolDurumuBelirsiz) sorular.push("Arazinin kadastro yolu fiilen araçla girilebilir durumda mı?");
    if (imarDurumuBelirsiz) sorular.push("İmar durumu (TAKS / KAKS emsal veya köy yerleşim alanı) nedir?");

    sorular.push("Nakit alımda son oluru ve pazarlık marjı nedir?");

    const mesaj = `
Merhaba, "${ilan.baslik}" başlıklı ilanınız için yazıyorum.

Mülk ile ilgili alım öncesi ekspertiz çalışması yapmaktayım. Birkaç kritik bilgiyi teyit edebilir misiniz?

${sorular.map((s, i) => `${i + 1}. ${s}`).join("\n")}

İyi çalışmalar dilerim.
`.trim();

    return {
      adaParselEksikMi: adaParselEksik,
      hisseDurumuBelirsizMi: hisseDurumuBelirsiz,
      yolDurumuBelirsizMi: yolDurumuBelirsiz,
      imarDurumuBelirsizMi: imarDurumuBelirsiz,
      sorulacakSorular: sorular,
      hazirWhatsAppMesaji: mesaj,
    };
  }
}