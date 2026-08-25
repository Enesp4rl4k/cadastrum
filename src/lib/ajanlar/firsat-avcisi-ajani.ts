/**
 * Yatırım Fırsat Avcısı Ajanı (Investment Opportunity Scout Agent).
 *
 * Görevi:
 *   İlan fiyatı ile Cadastrum değerleme motorunun ürettiği gerçeğe uygun piyasa değerini
 *   karşılaştırarak gerçek kelepir fırsatları, iskonto oranını ve kâr potansiyelini hesaplar.
 */

import type { ParselSorguGirdisi, FirsatAnalizRaporu } from "./ajan-tipleri";

export class FirsatAvcisiAjani {
  /**
   * İlanı değerlendirerek fırsat / kelepir analizi üretir.
   */
  public analizEt(
    parsel: ParselSorguGirdisi,
    tahminiPiyasaDegeriTL: number,
  ): FirsatAnalizRaporu {
    const riskFaktorleri: string[] = [];

    if (!parsel.ilanFiyatiTL || parsel.ilanFiyatiTL <= 0) {
      return {
        kelepirMi: false,
        iskontoOraniYuzde: 0,
        tahminiPiyasaDegeriTL,
        ilanFiyatiTL: parsel.ilanFiyatiTL,
        firsatPuani: 50,
        potansiyelKarTL: 0,
        firsatGerekcesi: "İlan fiyatı belirtilmediği için fırsat hesaplanamadı.",
        riskFaktorleri: ["İlan fiyatı girilmemiş"],
      };
    }

    const ilanFiyati = parsel.ilanFiyatiTL;
    const potansiyelKarTL = tahminiPiyasaDegeriTL - ilanFiyati;
    const iskontoOraniYuzde = Number(
      (((tahminiPiyasaDegeriTL - ilanFiyati) / tahminiPiyasaDegeriTL) * 100).toFixed(1)
    );

    // Kelepir kriteri: Piyasa değerine göre en az %20 daha ucuz
    const kelepirMi = iskontoOraniYuzde >= 20;

    // Şüpheli derecede ucuzluk kontrolü (Piyasanın %70 altı -> tapu sorunu, haciz veya sahte ilan şüphesi)
    if (iskontoOraniYuzde >= 70) {
      riskFaktorleri.push("Aşırı düşük fiyat (%70+ iskonto): Sahte ilan, haciz veya hisse ihtilafı riski yüksek.");
    }

    if (parsel.hisseliMi) {
      riskFaktorleri.push("Hisseli tapu: Şufa (önalım) hakkı davası riski mevcuttur.");
    }

    // Fırsat Puanı Hesaplama (0 - 100)
    let firsatPuani = 50;
    if (iskontoOraniYuzde > 0) {
      firsatPuani += Math.min(40, iskontoOraniYuzde * 0.8);
    } else {
      firsatPuani -= Math.min(40, Math.abs(iskontoOraniYuzde) * 0.8);
    }

    // Risk cezaları
    if (riskFaktorleri.length > 0) {
      firsatPuani -= riskFaktorleri.length * 10;
    }

    firsatPuani = Math.max(0, Math.min(100, Math.round(firsatPuani)));

    let firsatGerekcesi = "";
    if (kelepirMi && riskFaktorleri.length === 0) {
      firsatGerekcesi = `YÜKSEK FIRSAT: İlan fiyatı bölge piyasa değerinin %${iskontoOraniYuzde} altında! Tahmini kâr marjı: ${potansiyelKarTL.toLocaleString("tr-TR")} ₺.`;
    } else if (kelepirMi && riskFaktorleri.length > 0) {
      firsatGerekcesi = `KOŞULLU FIRSAT: İlan fiyatı cazip (%${iskontoOraniYuzde} iskonto) ancak ${riskFaktorleri.length} adet risk unsuru araştırılmalıdır.`;
    } else if (iskontoOraniYuzde > 0) {
      firsatGerekcesi = `Makul Fiyat: İlan fiyatı piyasa değerine yakın (%${iskontoOraniYuzde} iskonto).`;
    } else {
      firsatGerekcesi = `Yüksek Fiyat: İlan fiyatı piyasa değerinin %${Math.abs(iskontoOraniYuzde)} üzerinde talep edilmiş.`;
    }

    return {
      kelepirMi,
      iskontoOraniYuzde,
      tahminiPiyasaDegeriTL,
      ilanFiyatiTL: ilanFiyati,
      firsatPuani,
      potansiyelKarTL: Math.max(0, potansiyelKarTL),
      firsatGerekcesi,
      riskFaktorleri,
    };
  }
}