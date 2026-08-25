/**
 * Türk Gayrimenkul & İmar Hukuku Mevzuat Bilgi Tabanı (Knowledge Base).
 *
 * İçerik:
 *   - 3194 Sayılı İmar Kanunu
 *   - 5403 Sayılı Toprak Koruma ve Arazi Kullanımı Kanunu
 *   - 3573 Sayılı Zeytincilik Kanunu
 *   - 2863 Sayılı Kültür ve Tabiat Varlıklarını Koruma Kanunu
 *   - 3621 Sayılı Kıyı Kanunu
 *   - SPK / UDES Değerleme Standartları
 */

import type { MevzuatMaddesi, VektorDokumani } from "./types";
import { SpatialRagStore } from "./spatial-rag";

export const MEVZUAT_MADDELERI: MevzuatMaddesi[] = [
  {
    kanunAdi: "İmar Kanunu",
    kanunNo: "3194",
    maddeNo: "18",
    maddeBasligi: "Arazi ve Arsa Düzenlemesi (DOP Kesintisi)",
    metin: "Belediyeler ve valilikler; düzenleme sahasına giren arsa ve arazilerin sahiplerinin muvafakatı aranmaksızın 'arsa ve arazi düzenlemesi' yapabilir. Düzenleme ortaklık payı (DOP), düzenlemeye tabi tutulan yerlerin ihtiyacı olan yol, meydan, park, otopark, çocuk bahçesi, yeşil saha, cami gibi umumi hizmetler için %45'e kadar bedelsiz kesilebilir.",
    ozet: "Parselden belediye tarafından %45'e kadar bedelsiz Düzenleme Ortaklık Payı (DOP) kesintisi yapılabilir.",
    etiketler: ["imar", "dop", "kesinti", "arsa-duzenleme", "belediye", "yol-terki"],
    riskKategorisi: "yuksek",
  },
  {
    kanunAdi: "İmar Kanunu",
    kanunNo: "3194",
    maddeNo: "Geçici 16",
    maddeBasligi: "Yapı Kayıt Belgesi (İmar Barışı)",
    metin: "31/12/2017 tarihinden önce yapılmış yapılar için Yapı Kayıt Belgesi verilebilir. Yapı Kayıt Belgesi yapının yeniden yapılmasına veya kentsel dönüşüm uygulamasına kadar geçerlidir. Belge, yapının mevzuata uygunluğunu sağlamaz, yıkım ve para cezalarını durdurur.",
    ozet: "Yapı kayıt belgesi mülkiyet veya kalıcı imar hakkı doğurmaz, sadece mevcut kaçak yapıyı geçici olarak korur.",
    etiketler: ["yapi-kayit", "imar-barisi", "kacak-yapi", "ruhsat"],
    riskKategorisi: "orta",
  },
  {
    kanunAdi: "Toprak Koruma ve Arazi Kullanımı Kanunu",
    kanunNo: "5403",
    maddeNo: "8",
    maddeBasligi: "Bölünemez Asgari Tarımsal Parsel Büyüklükleri",
    metin: "Tarımsal araziler; mutlak tarım arazileri ve özel ürün arazilerinde 2 hektar (20.000 m²), dikili tarım arazilerinde 0,5 hektar (5.000 m²), örtü altı tarımı yapılan arazilerde 0,3 hektar (3.000 m²) ve marjinal tarım arazilerinde 2 hektar (20.000 m²) büyüklüğün altında ifraz edilemez, paylara bölünemez, hisselendirilemez.",
    ozet: "Tarlalar 20 dönüm (20.000 m²), zeytinlik/bağlar 5 dönüm (5.000 m²), seralar 3 dönüm altına hisseli olarak bölünemez.",
    etiketler: ["tarla", "hisse", "ifraz", "bolunemezlik", "hisseli-tarla", "tarim-arazisi"],
    riskKategorisi: "yuksek",
  },
  {
    kanunAdi: "Zeytinciliğin Islahı ve Yabanilerinin Aşılattırılması Kanunu",
    kanunNo: "3573",
    maddeNo: "20",
    maddeBasligi: "Zeytinlik Koruma Kuşağı ve Tesis Kısıtlamaları",
    metin: "Zeytinlik sahaları daraltılamaz. Zeytinlik sahaları içinde ve bu sahalara en az 3 kilometre mesafede zeytinyağı fabrikası hariç zeytinliklerin gelişmesine mani olacak kimyevi atık bırakan, toz ve duman çıkaran tesis yapılamaz ve işletilemez. Bu alanlarda konut ve turizm tesisi inşaatı izni bakanlık iznine ve katı şartlara tabidir.",
    ozet: "Zeytinlik arazilere ve 3 km çevresine kirletici tesis, sanayi ve plansız konut yapılamaz.",
    etiketler: ["zeytinlik", "zeytin", "3km-siniri", "sanayi-yasagi", "sit-koruma"],
    riskKategorisi: "yuksek",
  },
  {
    kanunAdi: "Kültür ve Tabiat Varlıklarını Koruma Kanunu",
    kanunNo: "2863",
    maddeNo: "17",
    maddeBasligi: "SİT Alanlarında Yapılaşma Koşulları",
    metin: "1. Derece Doğal ve Arkeolojik SİT alanlarında kesin yapılaşma yasağı vardır; tarımsal faaliyetler dahi kurul kararına tabidir. 2. ve 3. Derece SİT alanlarında ise koruma amaçlı imar planı onaylanmadan hiçbir inşaat ruhsatı verilemez.",
    ozet: "1. Derece SİT alanlarında sıfır yapılaşma hakkı; 2. ve 3. derece SİT alanlarında Koruma Bölge Kurulu onayı zorunludur.",
    etiketler: ["sit-alani", "arkeolojik", "dogal-sit", "koruma-kurulu", "insa-yasagi"],
    riskKategorisi: "yuksek",
  },
  {
    kanunAdi: "Kıyı Kanunu",
    kanunNo: "3621",
    maddeNo: "5",
    maddeBasligi: "Kıyı ve Sahil Şeridinde Yapılaşma Sınırları",
    metin: "Kıyılar herkesin eşit ve serbest olarak yararlanmasına açıktır. Kıyı kenar çizgisinden itibaren kara yönünde yatay olarak en az 100 metre genişliğindeki sahil şeridinin ilk 50 metresinde sadece kamuya açık gezi, dinlenme ve rekreatif alanlar yapılabilir; konut veya kapalı tesis yapılamaz.",
    ozet: "Kıyı kenar çizgisine 50 metre mesafede konut/özel yapı yapılamaz, sadece açık kamusal kullanım izni vardır.",
    etiketler: ["kiyi-kenar", "deniz", "sahil-seridi", "100m-siniri", "kamu-yarari"],
    riskKategorisi: "yuksek",
  },
  {
    kanunAdi: "Planlı Alanlar İmar Yönetmeliği",
    kanunNo: "Yonetmelik",
    maddeNo: "5",
    maddeBasligi: "İmar Parseli ve Yapılaşma Şartları (TAKS / KAKS)",
    metin: "İmar planında belirtilmeyen hallerde TAKS (Taban Alanı Kat Sayısı) en fazla 0.40 olarak uygulanır. Bir parselde inşaata başlanabilmesi için parselin yola cephesinin bulunması, imar yolunun fiilen açılmış olması ve altyapı hizmetlerinin getirilmiş olması şarttır.",
    ozet: "Yola cephesi olmayan parsele inşaat ruhsatı verilemez. TAKS genelde max 0.40 uygulanır.",
    etiketler: ["taks", "kaks", "emsal", "yola-cephe", "ruhsat", "insaat-hakki"],
    riskKategorisi: "orta",
  },
];

/**
 * Mevzuat bilgi tabanını bir SpatialRagStore'a yükler.
 */
export function mevzuatStoreOlustur(): SpatialRagStore {
  const store = new SpatialRagStore();

  for (const m of MEVZUAT_MADDELERI) {
    const doc: VektorDokumani = {
      id: `mevzuat-${m.kanunNo}-${m.maddeNo}`,
      metin: `${m.kanunAdi} Kanun No: ${m.kanunNo} Madde ${m.maddeNo}: ${m.maddeBasligi}. ${m.metin} ${m.etiketler.join(" ")}`,
      metadata: {
        tip: "mevzuat",
        baslik: `${m.kanunAdi} - Madde ${m.maddeNo}: ${m.maddeBasligi}`,
        kanunNo: m.kanunNo,
        maddeNo: m.maddeNo,
        ekBilgiler: {
          riskKategorisi: m.riskKategorisi,
          ozet: m.ozet,
          etiketler: m.etiketler,
        },
      },
    };
    store.ekle(doc);
  }

  return store;
}