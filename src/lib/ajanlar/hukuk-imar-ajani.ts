/**
 * İmar & Gayrimenkul Hukuku Denetim Ajanı (Legal & Zoning Due Diligence Agent).
 *
 * Görevi:
 *   Parsel üzerindeki tüm kısıtlamaları, mevzuat maddelerini ve yasal riskleri
 *   Spatial RAG Knowledge Base üzerinden çapraz sorgulayarak hukuki görüş üretir.
 */

import type { ParselSorguGirdisi, HukukDenetimRaporu } from "./ajan-tipleri";
import { mevzuatStoreOlustur, MEVZUAT_MADDELERI } from "../rag/mevzuat-knowledge-base";
import type { MevzuatMaddesi } from "../rag/types";

export class HukukImarAjani {
  private mevzuatStore = mevzuatStoreOlustur();

  /**
   * Parsel için hukuki ve imar denetimi gerçekleştirir.
   */
  public denetle(parsel: ParselSorguGirdisi): HukukDenetimRaporu {
    const riskler: HukukDenetimRaporu["tespitEdilenRiskler"] = [];
    const ilgiliMaddeler: MevzuatMaddesi[] = [];
    let toplamRiskPuani = 0;

    // 1. 5403 Sayılı Kanun — Hisseli Tarla Bölünemezlik Kontrolü
    if (parsel.kategori === "tarla" && parsel.hisseliMi) {
      const minAlanM2 = 20_000; // 20 dönüm
      if (parsel.alanM2 < minAlanM2) {
        toplamRiskPuani += 35;
        riskler.push({
          baslik: "5403 Sayılı Kanun: Hisseli Tarla İfraz / Satış Riski",
          aciklama: `Tarla vasıflı arazi ${parsel.alanM2.toLocaleString("tr-TR")} m² olup 20.000 m² (20 dönüm) asgari büyüklüğün altındadır. Hisseli devirlerde Tarım İl/İlçe Müdürlüğü onayı gereklidir veya ifraz yapılamaz.`,
          ilgiliKanun: "5403 Sayılı Toprak Koruma Kanunu Madde 8",
          oneri: "Müstakil tapu şartı arayın veya diğer hissedarlarla noter onaylı rıza-i taksim sözleşmesi talep edin.",
        });

        const madde5403 = MEVZUAT_MADDELERI.find((m) => m.kanunNo === "5403");
        if (madde5403) ilgiliMaddeler.push(madde5403);
      }
    }

    // 2. 3573 Sayılı Zeytincilik Kanunu Kontrolü
    if (parsel.zeytinlikMi || (parsel.imarDurumu && parsel.imarDurumu.toLowerCase().includes("zeytin"))) {
      toplamRiskPuani += 30;
      riskler.push({
        baslik: "3573 Sayılı Zeytincilik Kanunu Kısıtlaması",
        aciklama: "Arazi zeytinlik vasfında olup 3573 sayılı kanuna tabidir. Zeytinlik alanlarda ve 3 km çevresinde sanayi tesisi kurulamaz, konut/villa yapılaşması için zeytin ağacı kesilemez.",
        ilgiliKanun: "3573 Sayılı Zeytincilik Kanunu Madde 20",
        oneri: "Tarım İl Müdürlüğü'nden zeytinlik nitelik tespiti ve ağaç yoğunluğu raporu almadan inşaat amaçlı alım yapmayın.",
      });

      const madde3573 = MEVZUAT_MADDELERI.find((m) => m.kanunNo === "3573");
      if (madde3573) ilgiliMaddeler.push(madde3573);
    }

    // 3. 2863 Sayılı SİT Alanı Kontrolü
    if (parsel.sitAlaniMi) {
      toplamRiskPuani += 40;
      riskler.push({
        baslik: "2863 Sayılı Kanun: SİT Alanı Yapılaşma Yasağı / İzni",
        aciklama: "Arazi Doğal/Arkeolojik/Kentsel SİT alanı sınırları içerisindedir. İnşaat, kazı ve tarımsal faaliyetler Kültür ve Tabiat Varlıklarını Koruma Bölge Kurulu onayına tabidir.",
        ilgiliKanun: "2863 Sayılı Kültür ve Tabiat Varlıklarını Koruma Kanunu Madde 17",
        oneri: "İlgili Koruma Kurulu'ndan görüş yazısı alınmadan arazi üzerine proje geliştirmeyin.",
      });

      const madde2863 = MEVZUAT_MADDELERI.find((m) => m.kanunNo === "2863");
      if (madde2863) ilgiliMaddeler.push(madde2863);
    }

    // 4. 3621 Sayılı Kıyı Kanunu Kontrolü
    if (parsel.kiyiKenarM !== undefined && parsel.kiyiKenarM < 100) {
      toplamRiskPuani += 35;
      riskler.push({
        baslik: "3621 Sayılı Kıyı Kanunu: Sahil Şeridi Kısıtlaması",
        aciklama: `Parsel kıyı kenar çizgisine ${parsel.kiyiKenarM} metre mesafededir. İlk 50 metrede yapılaşma tamamen yasaktır; 50-100 metre bandında ise sadece kamusal ve turizm günübirlik kullanımlara izin verilebilir.`,
        ilgiliKanun: "3621 Sayılı Kıyı Kanunu Madde 5",
        oneri: "Kadastro ve Çevre Şehircilik İl Müdürlüğü'nden onaylı Kıyı Kenar Çizgisi paftasını talep edin.",
      });

      const madde3621 = MEVZUAT_MADDELERI.find((m) => m.kanunNo === "3621");
      if (madde3621) ilgiliMaddeler.push(madde3621);
    }

    // 5. 3194 Sayılı İmar Kanunu Madde 18 (DOP Kesintisi Potansiyeli)
    if (parsel.kategori === "arsa" || (parsel.imarDurumu && !parsel.imarDurumu.toLowerCase().includes("18"))) {
      riskler.push({
        baslik: "3194 Sayılı İmar Kanunu Madde 18: DOP Kesintisi Olasılığı",
        aciklama: "İmar uygulaması (18. Madde) henüz tamamlanmamışsa veya parsel kadastro parseli ise, belediye tarafından %45'e kadar Düzenleme Ortaklık Payı (DOP) kesintisi uygulanabilir.",
        ilgiliKanun: "3194 Sayılı İmar Kanunu Madde 18",
        oneri: "Belediye İmar Müdürlüğü'nden parselin 'İmar Parseli' mi yoksa 'Kadastro Parseli' mi olduğunu teyit edin.",
      });

      const madde3194 = MEVZUAT_MADDELERI.find((m) => m.kanunNo === "3194" && m.maddeNo === "18");
      if (madde3194) ilgiliMaddeler.push(madde3194);
    }

    const riskSkoru = Math.min(100, toplamRiskPuani);
    let riskSeviyesi: HukukDenetimRaporu["riskSeviyesi"] = "temiz";
    if (riskSkoru >= 60) riskSeviyesi = "yuksek";
    else if (riskSkoru >= 30) riskSeviyesi = "orta";
    else if (riskSkoru > 0) riskSeviyesi = "dusuk";

    let ozetHukukiGorus = "";
    if (riskSeviyesi === "yuksek") {
      ozetHukukiGorus = `DİKKAT: Parsel üzerinde ${riskler.length} adet kritik hukuki şerh/kısıtlama tespit edildi (Risk Skoru: ${riskSkoru}/100). Hukuki inceleme tamamlanmadan alım önerilmez.`;
    } else if (riskSeviyesi === "orta") {
      ozetHukukiGorus = `Parsel üzerinde dikkat edilmesi gereken ${riskler.length} adet imar/mevzuat detayı bulunmaktadır (Risk Skoru: ${riskSkoru}/100).`;
    } else {
      ozetHukukiGorus = "Parsel üzerinde standart imar şartları geçerli olup, kritik bir yasal engel tespit edilmemiştir.";
    }

    return {
      riskSeviyesi,
      riskSkoru,
      tespitEdilenRiskler: riskler,
      ilgiliMevzuat: ilgiliMaddeler,
      ozetHukukiGorus,
    };
  }
}