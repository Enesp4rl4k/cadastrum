/**
 * Çoklu Ajan Orkestratörü (Multi-Agent RAG Orchestrator).
 *
 * Değerleme Uzmanı + Hukuk Denetmeni + Fırsat Avcısı ajanlarını senkronize eder
 * ve yatırımcı için çapraz doğrulanmış nihai sentez raporunu üretir.
 */

import type {
  ParselSorguGirdisi,
  CokluAjanSentezRaporu,
  AjanMesaji,
} from "./ajan-tipleri";
import { HukukImarAjani } from "./hukuk-imar-ajani";
import { FirsatAvcisiAjani } from "./firsat-avcisi-ajani";
import { fiyatTahminEt } from "../fiyat-tahmin";

export class MultiAgentOrkestrator {
  private hukukAjani = new HukukImarAjani();
  private firsatAjani = new FirsatAvcisiAjani();

  /**
   * Bir parsel için tüm uzman ajanları koşturur ve nihai yatırım kararını sentezler.
   */
  public async analizEt(parsel: ParselSorguGirdisi): Promise<CokluAjanSentezRaporu> {
    const loglar: AjanMesaji[] = [];
    const simdi = Date.now();

    loglar.push({
      gonderen: "degerleme-uzmani",
      alici: "orkestrator",
      konu: "Analiz Başladı",
      icerik: `${parsel.il}/${parsel.ilce} ${parsel.alanM2} m² ${parsel.kategori} için değerleme ve mevzuat taraması başlatıldı.`,
      zaman: simdi,
    });

    // 1. Değerleme Ajanı — Fiyat Tahmini
    const parselObj: import("../../types/tkgm").Parsel = {
      ilAd: parsel.il,
      ilceAd: parsel.ilce,
      mahalleAd: parsel.mahalle ?? "",
      alan: parsel.alanM2,
      nitelik: parsel.kategori === "tarla" ? "Tarla" : parsel.kategori === "arsa" ? "Arsa" : "Konut",
      adaNo: 101,
      parselNo: 1,
      ilKodu: null,
      ilceKodu: null,
      mahalleKodu: null,
      pafta: "",
      durum: "",
      gittigiParseller: [],
      geometri: { type: "Polygon", coordinates: [] },
      merkezNokta: { lat: parsel.lat ?? 39.0, lng: parsel.lng ?? 35.0 },
      koordinatlar: [{ lat: parsel.lat ?? 39.0, lng: parsel.lng ?? 35.0 }],
      malikSayisi: parsel.hisseliMi ? 3 : 1,
      payBilgisi: parsel.hisseliMi ? "1/2" : null,
    };

    const fiyatSonuc = await fiyatTahminEt(parselObj);

    const beklenenToplamTL = fiyatSonuc.toplamBeklenen;

    loglar.push({
      gonderen: "degerleme-uzmani",
      alici: "orkestrator",
      konu: "Değerleme Tamamlandı",
      icerik: `Piyasa değeri tahmini: ${beklenenToplamTL.toLocaleString("tr-TR")} ₺ (${fiyatSonuc.beklenenPerM2.toLocaleString("tr-TR")} ₺/m²). Güven skoru: ${fiyatSonuc.guvenSkoru}/100.`,
      veri: { toplamBeklenen: beklenenToplamTL, guvenSkoru: fiyatSonuc.guvenSkoru },
      zaman: Date.now(),
    });

    // 2. Hukuk ve İmar Denetim Ajanı
    const hukukRaporu = this.hukukAjani.denetle(parsel);

    loglar.push({
      gonderen: "hukuk-imar-denetmeni",
      alici: "orkestrator",
      konu: "Hukuk Denetimi Tamamlandı",
      icerik: `Risk Seviyesi: ${hukukRaporu.riskSeviyesi.toUpperCase()} (Risk Skoru: ${hukukRaporu.riskSkoru}/100). ${hukukRaporu.tespitEdilenRiskler.length} risk tespit edildi.`,
      veri: { riskSkoru: hukukRaporu.riskSkoru, riskSayisi: hukukRaporu.tespitEdilenRiskler.length },
      zaman: Date.now(),
    });

    // 3. Fırsat Avcısı Ajanı
    const firsatRaporu = this.firsatAjani.analizEt(parsel, beklenenToplamTL);

    loglar.push({
      gonderen: "firsat-avcisi-scout",
      alici: "orkestrator",
      konu: "Fırsat Analizi Tamamlandı",
      icerik: `Fırsat Puanı: ${firsatRaporu.firsatPuani}/100. İskonto: %${firsatRaporu.iskontoOraniYuzde}. Kelepir: ${firsatRaporu.kelepirMi ? "EVET" : "HAYIR"}.`,
      veri: { firsatPuani: firsatRaporu.firsatPuani, iskonto: firsatRaporu.iskontoOraniYuzde },
      zaman: Date.now(),
    });

    // 4. Nihai Karar Sentezi
    let genelKarar: CokluAjanSentezRaporu["genelKarar"] = "tut-incele";
    let nihaiTavsiye = "";

    if (hukukRaporu.riskSeviyesi === "yuksek") {
      genelKarar = "uzak-dur";
      nihaiTavsiye = "Yüksek hukuki/imar riski nedeniyle satın alma önerilmez. Hukuki ihtilaflar çözülmeden işlem yapılmamalıdır.";
    } else if (firsatRaporu.kelepirMi && hukukRaporu.riskSeviyesi === "temiz" && firsatRaporu.firsatPuani >= 75) {
      genelKarar = "guclu-al";
      nihaiTavsiye = `GÜÇLÜ AL: Parsel piyasa değerinin %${firsatRaporu.iskontoOraniYuzde} altında ve hukuki engeli bulunmuyor. Yüksek kâr potansiyeli!`;
    } else if (firsatRaporu.iskontoOraniYuzde >= 10 && hukukRaporu.riskSkoru <= 35) {
      genelKarar = "al";
      nihaiTavsiye = "AL: Makul fiyatlı ve düşük riskli yatırım fırsatı. Pazarlık payı değerlendirilebilir.";
    } else if (firsatRaporu.iskontoOraniYuzde < -15) {
      genelKarar = "uzak-dur";
      nihaiTavsiye = `Fiyat piyasa değerinin %${Math.abs(firsatRaporu.iskontoOraniYuzde)} üzerinde talep edilmiş. Ciddi fiyat indirimi olmadan alım önerilmez.`;
    } else {
      genelKarar = "tut-incele";
      nihaiTavsiye = "İNCELE: Standart piyasa koşullarında. Bölgedeki alternatif emsaller ve imar durumu detaylandırılmalıdır.";
    }

    return {
      parselBilgisi: parsel,
      degerleme: fiyatSonuc,
      hukuk: hukukRaporu,
      firsat: firsatRaporu,
      genelKarar,
      nihaiTavsiye,
      ajanLoglari: loglar,
    };
  }
}