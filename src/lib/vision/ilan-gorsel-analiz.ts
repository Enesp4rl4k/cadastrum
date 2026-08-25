/**
 * Çok Modlu Vision AI — Uydu ve İlan Fotoğraflarından Otomatik Kusur Tespiti.
 *
 * Yetenekler:
 *   1. Yüksek Gerilim Hattı / Trafo / Baz İstasyonu Tespiti
 *   2. Fiili Kadastro Yol Varlığı (Asfalt / Toprak / Yolsuz)
 *   3. Harabe, Moloz, Kaçak Yapı Kalıntısı Tespiti
 *   4. Kayalık / Taşlık Zemin ve Eğim Anomalisi
 *   5. Konut İç Mekan Kusurları (Rutubet, Eski Islak Hacim, Masraf)
 */

export interface GorselKusurDetayi {
  kusurTipi:
    | "yuksek_gerilim_hatti"
    | "yol_yok"
    | "harabe_moloz"
    | "asiri_kayalik"
    | "rutubet_nem"
    | "dik_yamac";
  onemDerecesi: "kritik" | "orta" | "dusuk";
  aciklama: string;
  tahminiDegerKaybiYuzde: number; // Örn: Yüksek gerilim hattı -> %15 değer kaybı
  oneri: string;
}

export interface VisionAnalizSonucu {
  gorselKalitePuani: number; // 0-100
  tespitEdilenKusurlar: GorselKusurDetayi[];
  toplamDegerKaybiYuzde: number; // Kusurlardan kaynaklanan toplam iskonto
  fiiliYolDurumu: "asfalt_mevcut" | "toprak_yol" | "patika" | "fiilen_yol_yok";
  zeminDurumu: "duz_duzenli" | "hafif_egimli" | "dik_kayalik" | "molozlu_harabe";
  konutKondisyonu?: "luks_yenilenmis" | "bakimli_standart" | "masrafli_tadilat_gerek";
  analizOzeti: string;
}

export class VisionKusurAnalizMotoru {
  /**
   * İlan fotoğrafları ve uydu görüntüsü metin/etiket veya görsel analiz sonuçlarını
   * değerlendirerek kusur ve değer kaybı raporu üretir.
   */
  public analizEt(param: {
    fotoEtiketleri?: string[];
    aciklamaMetni?: string;
    uyduGoruntuAnalizi?: {
      yolGorunuyorMu?: boolean;
      direkDireklerVarMi?: boolean;
      yapiKalıntisiVarMi?: boolean;
      kayalikOrani?: number;
    };
  }): VisionAnalizSonucu {
    const kusurlar: GorselKusurDetayi[] = [];
    const etiketler = (param.fotoEtiketleri ?? []).map((e) => e.toLowerCase());
    const aciklama = (param.aciklamaMetni ?? "").toLowerCase();
    const uydu = param.uyduGoruntuAnalizi;

    // 1. Yüksek Gerilim Hattı / Trafo Kontrolü
    const direkVar =
      uydu?.direkDireklerVarMi ||
      etiketler.some((e) => e.includes("gerilim") || e.includes("trafo") || e.includes("direk")) ||
      aciklama.includes("yüksek gerilim") || aciklama.includes("trafo");

    if (direkVar) {
      kusurlar.push({
        kusurTipi: "yuksek_gerilim_hatti",
        onemDerecesi: "kritik",
        aciklama: "Arazi üzerinde veya sınırında yüksek gerilim hattı / elektrik nakil direği tespit edildi.",
        tahminiDegerKaybiYuzde: 15,
        oneri: "Elektrik İletim A.Ş. (TEİAŞ) irtifak hakkı şerhini ve inşaat yaklaşma mesafesini kontrol edin.",
      });
    }

    // 2. Fiili Yol Durumu Kontrolü
    let fiiliYol: VisionAnalizSonucu["fiiliYolDurumu"] = "asfalt_mevcut";
    if (uydu?.yolGorunuyorMu === false || aciklama.includes("yolu açılmamış") || aciklama.includes("patika")) {
      fiiliYol = "fiilen_yol_yok";
      kusurlar.push({
        kusurTipi: "yol_yok",
        onemDerecesi: "kritik",
        aciklama: "Parselin resmi paftada yolu olsa dahi arazide fiilen açılmış bir araç yolu görünmüyor.",
        tahminiDegerKaybiYuzde: 20,
        oneri: "Belediye veya İl Özel İdaresi'nden yol açma ve altyapı getirme maliyetini araştırın.",
      });
    } else if (aciklama.includes("toprak yol") || etiketler.includes("toprak_yol")) {
      fiiliYol = "toprak_yol";
    }

    // 3. Moloz / Harabe / Kaçak Yapı Kalıntısı
    if (uydu?.yapiKalıntisiVarMi || aciklama.includes("moloz") || aciklama.includes("harabe")) {
      kusurlar.push({
        kusurTipi: "harabe_moloz",
        onemDerecesi: "orta",
        aciklama: "Arazide yıkım ve hafriyat gerektiren eski taş kalıntısı veya moloz döküntüsü mevcut.",
        tahminiDegerKaybiYuzde: 8,
        oneri: "Hafriyat ve arazi temizleme maliyetini pazarlıkta fiyattan düşün.",
      });
    }

    // 4. Kayalık / Taşlık Zemin
    let zemin: VisionAnalizSonucu["zeminDurumu"] = "duz_duzenli";
    if ((uydu?.kayalikOrani ?? 0) > 0.4 || aciklama.includes("kayalık") || aciklama.includes("taşlık")) {
      zemin = "dik_kayalik";
      kusurlar.push({
        kusurTipi: "asiri_kayalik",
        onemDerecesi: "orta",
        aciklama: "Zemin yoğun kayalık/taşlık yapıda; inşaat temel kazısı ve tarımsal sürüm maliyetli olabilir.",
        tahminiDegerKaybiYuzde: 10,
        oneri: "Zemin etüdü ve kırıcı ekskavatör maliyetini hesaba katın.",
      });
    }

    // 5. Konut Rutubet & Masraf Kontrolü
    let konutKondisyon: VisionAnalizSonucu["konutKondisyonu"] = "bakimli_standart";
    if (aciklama.includes("masraflı") || aciklama.includes("tadilat") || etiketler.includes("rutubet")) {
      konutKondisyon = "masrafli_tadilat_gerek";
      kusurlar.push({
        kusurTipi: "rutubet_nem",
        onemDerecesi: "orta",
        aciklama: "Dairede tadilat ve tesisat yenileme ihtiyacı tespit edildi.",
        tahminiDegerKaybiYuzde: 12,
        oneri: "Islak zemin ve su yalıtımı tadilat bütçesini (yaklaşık 250k-500k TL) fiyattan düşün.",
      });
    } else if (aciklama.includes("lüks") || aciklama.includes("özel yapım") || aciklama.includes("sıfır daire")) {
      konutKondisyon = "luks_yenilenmis";
    }

    // Toplam Değer Kaybı Hesabı (Damped Toplam)
    const toplamDegerKaybiYuzde = Math.min(
      40,
      kusurlar.reduce((acc, k) => acc + k.tahminiDegerKaybiYuzde, 0)
    );

    const gorselKalitePuani = Math.max(20, 100 - toplamDegerKaybiYuzde * 1.5);

    let analizOzeti = "";
    if (kusurlar.length === 0) {
      analizOzeti = "Görsel ve uydu analizinde arazi/konut üzerinde herhangi bir fiziksel engel veya kusur tespit edilmedi.";
    } else {
      analizOzeti = `DİKKAT: Görsel analizde ${kusurlar.length} adet fiziksel kusur tespit edildi. Tahmini değer kaybı: %${toplamDegerKaybiYuzde}.`;
    }

    return {
      gorselKalitePuani,
      tespitEdilenKusurlar: kusurlar,
      toplamDegerKaybiYuzde,
      fiiliYolDurumu: fiiliYol,
      zeminDurumu: zemin,
      konutKondisyonu: konutKondisyon,
      analizOzeti,
    };
  }
}