/**
 * Canlı Fırsat Radarı & Anlık Bildirim Motoru (Real-Time Deal Push Engine).
 *
 * Kullanıcının tanımladığı radar kurallarına (bölge, bütçe, minimum iskonto)
 * uyan yeni bir kelepir ilan yakalandığında anında Telegram / Webhook bildirim
 * mesajı üretir ve tetikler.
 */

import type { BulunanFirsatKart } from "../ajanlar/kullanici-firsat-tarayici";

export interface RadarKurali {
  kuralId: string;
  kullaniciId: string;
  ad: string;
  il: string;
  ilce?: string;
  kategori: "arsa" | "tarla" | "konut";
  maxFiyatTL: number;
  minIskontoYuzde: number;
  sadeceMüstakilTapu: boolean;
  telegramChatId?: string;
  webhookUrl?: string;
  aktif: boolean;
}

export interface TelegramBildirimPaketi {
  chatId: string;
  mesajHtml: string;
  butonlar: Array<{ text: string; url: string }>;
}

export class FirsatAlarmMotoru {
  /**
   * Yakalanan fırsat kartını kullanıcının radar kurallarıyla eşleştirir.
   */
  public kuralEslesiyorMu(firsat: BulunanFirsatKart, kural: RadarKurali): boolean {
    if (!kural.aktif) return false;

    // İl / İlçe kontrolü
    if (firsat.ilan.il.toLowerCase() !== kural.il.toLowerCase()) return false;
    if (kural.ilce && firsat.ilan.ilce.toLowerCase() !== kural.ilce.toLowerCase()) return false;

    // Kategori kontrolü
    if (firsat.ilan.kategori !== kural.kategori) return false;

    // Bütçe ve İskonto kontrolü
    if (firsat.ilan.fiyatTL > kural.maxFiyatTL) return false;
    if (firsat.iskontoYuzde < kural.minIskontoYuzde) return false;

    // Risk kontrolü (Kesin red olmamalı)
    if (firsat.debate.konsensusKarari === "kesin-red") return false;

    return true;
  }

  /**
   * Telegram için formatlanmış zengin HTML bildirim mesajı üretir.
   */
  public telegramMesajiUret(firsat: BulunanFirsatKart, chatId: string): TelegramBildirimPaketi {
    const ilan = firsat.ilan;
    const sentez = firsat.sentez;
    const debate = firsat.debate;

    const baslikEmoji = debate.konsensusKarari === "guclu-al" ? "🟢" : "🟡";
    const mesajHtml = `
<b>${baslikEmoji} YENİ FIRSAT YAKALANDI! [${ilan.il.toUpperCase()} / ${ilan.ilce.toUpperCase()}]</b>

📌 <b>İlan:</b> ${ilan.baslik}
📐 <b>Alan:</b> ${ilan.m2.toLocaleString("tr-TR")} m² (${ilan.kategori.toUpperCase()})

💰 <b>İlan Fiyatı:</b> <code>${ilan.fiyatTL.toLocaleString("tr-TR")} ₺</code>
📊 <b>Piyasa Değeri:</b> <code>${sentez.firsat.tahminiPiyasaDegeriTL.toLocaleString("tr-TR")} ₺</code>
🔥 <b>İskonto / Kâr:</b> <b>%${firsat.iskontoYuzde} İskonto</b> (+${firsat.potansiyelKarTL.toLocaleString("tr-TR")} ₺)

⚖️ <b>Hukuk & İmar:</b> Risk Skoru ${sentez.hukuk.riskSkoru}/100 (${sentez.hukuk.tespitEdilenRiskler.length === 0 ? "Temiz Tapu" : `${sentez.hukuk.tespitEdilenRiskler.length} Şerh`})
🤖 <b>Ajan Kararı:</b> <b>${debate.konsensusKarari.toUpperCase()}</b> (Skor: ${firsat.efektifSkor}/100)

<i>"${debate.uzlasmaOzeti}"</i>
`.trim();

    const butonlar: Array<{ text: string; url: string }> = [];
    if (ilan.ilanUrl) {
      butonlar.push({ text: "🔗 İlana Git", url: ilan.ilanUrl });
    }

    return {
      chatId,
      mesajHtml,
      butonlar,
    };
  }
}