/**
 * Çoklu Ajan Münazara & Konsensüs Protokolü (Multi-Agent Debate Protocol).
 *
 * Prensip:
 *   Adversarial Collaboration (Karşıtlıklı İşbirliği).
 *   Fırsat Avcısı (Tez / Getiri Odaklı) <-> Hukuk Denetmeni (Antitez / Risk Odaklı)
 *   Değerleme Uzmanı (Hakem / Finansal Rasyonalite) -> Ortak Konsensüs Tezi.
 */

import type {
  ParselSorguGirdisi,
  HukukDenetimRaporu,
  FirsatAnalizRaporu,
} from "./ajan-tipleri";

export interface DebateTuru {
  turNo: number;
  konusan: "firsat-avcisi" | "hukuk-denetmeni" | "degerleme-hakemi";
  arguman: string;
  savunulanTez: "al" | "sartli-al" | "reddet";
  guvenDerecesi: number; // 0-100
}

export interface DebateSonucu {
  turlar: DebateTuru[];
  konsensusKarari: "guclu-al" | "sartli-al" | "riskli-bekle" | "kesin-red";
  efektifFirsatPuani: number; // Risk ağırlıklı düzeltilmiş puan (0-100)
  uzlasmaOzeti: string;
  aksiyonMaddeleri: string[];
}

export class MultiAgentDebateProtokolu {
  /**
   * Fırsat ve Hukuk raporlarını karşılaştırarak 2 turlu münazara yürütür ve konsensüs üretir.
   */
  public munazaraYurut(
    _parsel: ParselSorguGirdisi,
    hukuk: HukukDenetimRaporu,
    firsat: FirsatAnalizRaporu,
  ): DebateSonucu {
    const turlar: DebateTuru[] = [];

    // ── 1. Tur: Tez (Fırsat Avcısı) ──────────────────────────────────────────
    const firsatArgumani = firsat.kelepirMi
      ? `Bu parsel piyasa değerinin %${firsat.iskontoOraniYuzde} altında satılıyor. Tahmini kâr potansiyeli ${firsat.potansiyelKarTL.toLocaleString("tr-TR")} ₺. Hızlı hareket edilmeli!`
      : `İlan fiyatı (${firsat.ilanFiyatiTL?.toLocaleString("tr-TR")} ₺) piyasa değerine yakın veya üzerinde. İskonto oranı %${firsat.iskontoOraniYuzde}.`;

    turlar.push({
      turNo: 1,
      konusan: "firsat-avcisi",
      arguman: firsatArgumani,
      savunulanTez: firsat.kelepirMi ? "al" : "sartli-al",
      guvenDerecesi: firsat.firsatPuani,
    });

    // ── 1. Tur: Antitez (Hukuk Denetmeni) ────────────────────────────────────
    let hukukArgumani = "";
    let hukukTezi: DebateTuru["savunulanTez"] = "al";

    if (hukuk.riskSeviyesi === "yuksek") {
      hukukArgumani = `DURUN: Parsel üzerinde ${hukuk.tespitEdilenRiskler.length} kritik yasal risk var (Risk Skoru: ${hukuk.riskSkoru}/100). Fiyatın ucuz olmasının sebebi bu hukuki şerhler olabilir!`;
      hukukTezi = "reddet";
    } else if (hukuk.riskSeviyesi === "orta") {
      hukukArgumani = `DİKKAT: Parselde ${hukuk.tespitEdilenRiskler.length} adet mevzuat kısıtı mevcut (DOP/İfraz). Bu şartlar çözülmeden tam değerleme yapılamaz.`;
      hukukTezi = "sartli-al";
    } else {
      hukukArgumani = "Hukuki temizlik tam: Parsel üzerinde kritik bir şerh, koruma yasağı veya ifraz engeli bulunmuyor.";
      hukukTezi = "al";
    }

    turlar.push({
      turNo: 1,
      konusan: "hukuk-denetmeni",
      arguman: hukukArgumani,
      savunulanTez: hukukTezi,
      guvenDerecesi: 100 - hukuk.riskSkoru,
    });

    // ── 2. Tur: Hakemlik & Konsensüs (Değerleme Uzmanı) ──────────────────────
    // Risk Ağırlıklı Efektif Fırsat Puanı
    const riskCarpani = Math.max(0, 1 - (hukuk.riskSkoru / 100));
    const efektifFirsatPuani = Math.round(firsat.firsatPuani * riskCarpani);

    let konsensusKarari: DebateSonucu["konsensusKarari"] = "riskli-bekle";
    let hakemArgumani = "";
    const aksiyonMaddeleri: string[] = [];

    if (hukuk.riskSeviyesi === "yuksek") {
      konsensusKarari = "kesin-red";
      hakemArgumani = `Hukuk Denetmeni haklı. %${firsat.iskontoOraniYuzde} iskonto cazip görünse de, tespit edilen yasal riskler sermaye kaybına yol açabilir. Satın alma tavsiye edilmez.`;
      aksiyonMaddeleri.push("Tapu müdürlüğünden takyidat belgesi alarak şerhleri doğrulatın.");
      aksiyonMaddeleri.push("Alternatif sorunsuz emsallere yönelin.");
    } else if (firsat.kelepirMi && hukuk.riskSeviyesi === "temiz") {
      konsensusKarari = "guclu-al";
      hakemArgumani = `Fırsat Avcısı ve Hukuk Denetmeni mutabık: Parsel hem piyasanın %${firsat.iskontoOraniYuzde} altında hem de yasal açıdan sorunsuz.`;
      aksiyonMaddeleri.push("Satıcı ile derhal iletişime geçip kapora öncesi ada/parsel teyidi yapın.");
      aksiyonMaddeleri.push("Kadastro sınır tespit krokisi talep edin.");
    } else if (hukuk.riskSeviyesi === "orta" || firsat.iskontoOraniYuzde > 0) {
      konsensusKarari = "sartli-al";
      hakemArgumani = `Koşullu Fırsat: Yasal pürüzler ve pazarlık payı gözetilerek şartlı alım yapılabilir.`;
      aksiyonMaddeleri.push("Belediye imar müdürlüğünden güncel imar durum belgesi alın.");
      aksiyonMaddeleri.push("Hisseli durum varsa hissedarlardan feragatname talep edin.");
    } else {
      konsensusKarari = "riskli-bekle";
      hakemArgumani = `Fiyat piyasa değerinin üzerinde veya risk-getiri dengesi yetersiz.`;
      aksiyonMaddeleri.push("Fiyat indirimi talep edin veya bölgedeki diğer ilanları izlemeye alın.");
    }

    turlar.push({
      turNo: 2,
      konusan: "degerleme-hakemi",
      arguman: hakemArgumani,
      savunulanTez: konsensusKarari === "guclu-al" ? "al" : konsensusKarari === "kesin-red" ? "reddet" : "sartli-al",
      guvenDerecesi: efektifFirsatPuani,
    });

    const uzlasmaOzeti = `Konsey Konsensüsü: [${konsensusKarari.toUpperCase()}] — Efektif Yatırım Skoru: ${efektifFirsatPuani}/100. ${hakemArgumani}`;

    return {
      turlar,
      konsensusKarari,
      efektifFirsatPuani,
      uzlasmaOzeti,
      aksiyonMaddeleri,
    };
  }
}