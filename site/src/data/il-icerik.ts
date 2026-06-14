/**
 * Top illerin SEO için zengin tanıtım metinleri.
 *
 * Free 5 il (istanbul, ankara, izmir, antalya, mugla) için tam içerik.
 * Bu il sayfaları paywall görmez (FREE_ILLER), Google için zengin metin.
 */

export interface IlIcerik {
  /** Hero alt başlık — kısa */
  altBaslik: string;
  /** SEO description override (50-160 char) */
  seoAciklama?: string;
  /** Açılış paragrafı (intro) */
  giris: string;
  /** Önemli bölgeler (bullet list) */
  onemliBolgeler: { ad: string; aciklama: string }[];
  /** Yatırım yorumu */
  yatirimYorumu: string;
  /** SSS — sıkça sorulan sorular */
  sss: { soru: string; cevap: string }[];
}

export const IL_ICERIK: Record<string, IlIcerik> = {
  istanbul: {
    altBaslik: "Türkiye'nin metropolü — 39 ilçe, 970+ mahalle, 16 milyon nüfus",
    seoAciklama: "İstanbul arsa fiyatları 2026 — 39 ilçe, 970+ mahalle için TL/m². Beşiktaş, Kadıköy, Sarıyer ilçeleri başta olmak üzere TKGM kayıtlı parsel sorgu ve AI fiyat tahmini.",
    giris:
      "İstanbul, Türkiye'nin gayrimenkul yatırım merkezi olarak hem Avrupa hem Asya yakasında derinlemesine farklı dinamiklere sahip bir piyasa sunar. " +
      "Boğaz hattı boyunca premium fiyatlar 100.000 TL/m² ve üzerinde seyrederken, 3. köprü çevresi ve Kuzey Marmara aksı yatırım amaçlı arsa için en aktif bölgelerdir. " +
      "Cadastrum, İstanbul'un 970'in üzerindeki mahallesi için Sahibinden ve Hepsiemlak ilan medyanını günlük olarak izler, " +
      "TKGM kayıtlı parsel doğrulama yapar, e-Plan üzerinden imar durumunu çeker ve mahalle bazında AI destekli fiyat tahmini sunar.",
    onemliBolgeler: [
      { ad: "Beşiktaş — Bebek, Etiler, Levent", aciklama: "Avrupa yakasının premium hattı; Bebek arsa medyanı 80-100K TL/m² aralığında. Lüks konut + ofis." },
      { ad: "Sarıyer — Tarabya, Maslak", aciklama: "Boğaz manzarası + finans merkezi karışımı. Maslak'ta ticari arsa, Tarabya'da yat limanı yakını premium." },
      { ad: "Kadıköy — Caddebostan, Suadiye", aciklama: "Anadolu yakası en gelişmiş bölge. Caddebostan arsa stoku az, fiyatlar çok yüksek." },
      { ad: "Beykoz — Anadolu sahili", aciklama: "Sit alanı baskısı altında ama uzun vadeli yatırım için cazip. Yapı izni dikkatli incelenmeli." },
      { ad: "Üsküdar — Çengelköy, Kandilli", aciklama: "Tarihi doku + boğaz manzarası. Sit kısıtlamaları çok, ekspertiz şart." },
      { ad: "Şişli — Mecidiyeköy, Bomonti", aciklama: "Ticari ve karma kullanım. Yüksek emsal, kentsel dönüşüm aktif." },
      { ad: "Beylikdüzü — Esenyurt aksı", aciklama: "Yeni gelişen bölgeler. Konut arsası fiyatları kontrollü artıyor, yatırımcı için makul giriş." },
      { ad: "Tuzla — Pendik aksı", aciklama: "Sanayi + lojistik hattı. Sabiha Gökçen yakını sanayi arsa talebi yüksek." },
    ],
    yatirimYorumu:
      "İstanbul'da arsa yatırımı yapacaksanız 3 kritik şeyi mutlaka kontrol edin: " +
      "(1) e-Plan'da kullanım kararı (sit, koruma, tarımsal) — Boğaz çevresi ve Kuzey Ormanları kısıtlı; " +
      "(2) TKGM'de hisseli/ipotekli durumu — özellikle eski semtlerde sıklıkla görünür; " +
      "(3) İmar planındaki TAKS/Emsal değişimi — son 5 yılda kontrollü artırma var. " +
      "Cadastrum bu üç kontrolü tek panelde yapar.",
    sss: [
      {
        soru: "İstanbul'da en uygun arsa fiyatları hangi ilçede?",
        cevap: "Şu an 2026 verilerine göre Çatalca, Silivri, Şile gibi periferik ilçelerde 1.500-3.000 TL/m² seviyesinde tarımsal/imarsız arsalar bulabilirsiniz. İmarlı konut arsası için en uygun ilçeler: Esenyurt, Beylikdüzü, Sancaktepe (10-25K TL/m²).",
      },
      {
        soru: "İstanbul Boğaz hattında imarlı arsa var mı?",
        cevap: "Boğaz silüetini bozan yapılaşma yasağı var (1983 sayılı kanun + Boğaziçi öngörünüm). Sit alanı dışında imarlı arsa nadirdir; varsa TKGM ve e-Plan'dan plan revizyon tarihi mutlaka kontrol edilmeli.",
      },
      {
        soru: "İstanbul mahalle bazlı fiyat verisi nereden alınır?",
        cevap: "Sahibinden + Hepsiemlak ilan medyanı + TCMB Konut Fiyat Endeksi en güncel veri kaynaklarıdır. Cadastrum bu üç kaynağı triangulation ile birleştirir, IQR ile aykırı değerleri temizler ve mahalle bazında medyan + güven aralığı sunar.",
      },
    ],
  },

  ankara: {
    altBaslik: "Başkent — 25 ilçe, 1.300+ mahalle, planlı kentleşme örneği",
    seoAciklama: "Ankara arsa fiyatları 2026 — Çankaya, Yenimahalle, Etimesgut başta olmak üzere 25 ilçe için TL/m² medyan. TKGM kayıtlı parsel sorgu ve mahalle bazlı AI fiyat tahmini.",
    giris:
      "Ankara, Türkiye'nin idari merkezi olarak konut piyasasında istikrarlı ve görece düşük volatil bir profil sergiler. " +
      "Şehrin gelişim aksı kuzey-batı yönünde (Eryaman, Sincan, Etimesgut) sürerken, Çankaya bölgesi premium statüsünü korur. " +
      "Cadastrum, Ankara'nın 1.300'ün üzerindeki mahallesi için ilan medyanlarını ve AI baseline'ını günlük yeniler. " +
      "İmarsız arsa, hisseli tapu ve ipotek riskleri TKGM kayıtlarından otomatik raporlanır.",
    onemliBolgeler: [
      { ad: "Çankaya — Kavaklıdere, Gaziosmanpaşa", aciklama: "Ankara'nın en pahalı bölgesi. Konut arsası 25-40K TL/m². Kabine binaları çevresi premium." },
      { ad: "Yenimahalle — Batıkent, Demetevler", aciklama: "Orta-üst gelir grubu, yeni yapılaşma. Konut arsası 12-18K TL/m²." },
      { ad: "Etimesgut — Eryaman", aciklama: "Toplu konut + organize sanayi. Yatırımcı için planlı parselleme avantajı." },
      { ad: "Keçiören", aciklama: "Düşük-orta gelir, yoğun nüfus. Kentsel dönüşüm potansiyeli yüksek." },
      { ad: "Mamak", aciklama: "Düşük fiyatlı arsa stoku, dönüşüm beklentisi var ama planlama yavaş." },
      { ad: "Gölbaşı", aciklama: "Göl kıyısı sayfiye, lüks villa segmenti. Sit ve koruma kısıtlamaları sıkı." },
      { ad: "Sincan — Polatlı aksı", aciklama: "Şehrin yeni sanayi-konut karışımı, en hızlı büyüyen bölge. Uzun vadeli yatırım için uygun." },
    ],
    yatirimYorumu:
      "Ankara arsa yatırımında planlı kentleşme avantajı vardır — İstanbul'a göre imar planları daha az değişken. " +
      "Yine de hisseli tapu Ankara'da yaygındır, TKGM kontrolü mutlaka yapılmalı. " +
      "Çankaya dışı için kentsel dönüşüm beklentili bölgeler (Mamak, Altındağ) uzun vadeli iyi getiri sunabilir.",
    sss: [
      {
        soru: "Ankara'da en hızlı değer kazanan bölge?",
        cevap: "Sincan-Etimesgut aksı son 3 yılda %60+ değer kazandı. Yeni Cumhurbaşkanlığı kompleksi, organize sanayi yatırımları ve toplu konut projeleri ile Ankara'nın yeni gelişim hattı.",
      },
      {
        soru: "Ankara'da yatırımlık tarla nereden alınır?",
        cevap: "Polatlı, Bala, Şereflikoçhisar gibi ilçelerde 200-1.500 TL/m² seviyesinde tarla bulunabilir. Tarımsal nitelik ve sulama durumu TKGM'de kontrol edilmeli.",
      },
      {
        soru: "Çankaya'da imarlı arsa stoku?",
        cevap: "Çankaya'da boş imarlı arsa neredeyse kalmadı; mevcut yapı kentsel dönüşüm projeleriyle yenileniyor. Yeni proje için Yenimahalle, Etimesgut tarafına bakmak daha gerçekçi.",
      },
    ],
  },

  izmir: {
    altBaslik: "Ege'nin incisi — 30 ilçe, 1.300+ mahalle, sahil + iç anadolu karışımı",
    seoAciklama: "İzmir arsa fiyatları 2026 — Konak, Karşıyaka, Çeşme, Urla başta olmak üzere 30 ilçe için TL/m² medyan. Sahil bölgesi premium, iç ilçeler yatırım için cazip.",
    giris:
      "İzmir, Ege Bölgesi'nin ekonomik merkezi olarak hem sahil turizm hem de organize sanayi temalarında çift yönlü piyasa sunar. " +
      "Çeşme, Urla, Seferihisar gibi sahil ilçelerinde yazlık ve butik otel arsaları premium fiyatlanırken, " +
      "Kemalpaşa, Torbalı, Aliağa gibi iç ilçeler sanayi ve lojistik yatırımı için elverişlidir. " +
      "Cadastrum İzmir'in 1.300+ mahallesi için günlük güncellenen veri sunar.",
    onemliBolgeler: [
      { ad: "Konak — Alsancak, Kordon", aciklama: "Şehir merkezi, ticari + konut karışımı. Alsancak'ta arsa stoku az, fiyatlar 30-60K TL/m²." },
      { ad: "Karşıyaka — Bostanlı, Mavişehir", aciklama: "Liman manzarası + üst-orta gelir. Mavişehir yeni yapılaşma." },
      { ad: "Bornova", aciklama: "Üniversite (Ege) + sanayi karışımı. Genç nüfus, kira getirisi yüksek." },
      { ad: "Çeşme — Alaçatı", aciklama: "Türkiye'nin en pahalı yazlık bölgesi. Alaçatı arsa medyanı 50-80K TL/m²." },
      { ad: "Urla", aciklama: "Çeşme'ye alternatif, butik otel + bağ bölgesi. Tarımsal arsa zeytinlik niteliğinde." },
      { ad: "Seferihisar", aciklama: "Slow city sertifikası + sahil. Sığacık yat limanı çevresi premium." },
      { ad: "Torbalı, Kemalpaşa", aciklama: "Organize sanayi bölgeleri — sanayi arsa talebi yüksek, ucuz tarım arsası mevcut." },
      { ad: "Aliağa", aciklama: "Petrokimya + liman aksı. Tersane ve sanayi yatırımları aktif." },
    ],
    yatirimYorumu:
      "İzmir'de sahil ve iç ilçeler radikal farklı dinamiklere sahip. " +
      "Sahil için: zeytinlik nitelik kontrolü, yapı izni kısıtları (özel çevre koruma bölgeleri Çeşme/Urla'da yaygın). " +
      "İç ilçeler için: organize sanayi sınırı, su kaynağı durumu kritik. " +
      "Çeşme'de imarlı arsa nadiren satılır — TKGM ve plan değişiklik tarihi mutlaka kontrol edilmeli.",
    sss: [
      {
        soru: "Çeşme'de arsa fiyatları neden bu kadar yüksek?",
        cevap: "Çeşme/Alaçatı arz kısıtlı (özel çevre koruma + sit alanları), talep ise hem yerli hem yabancı yatırımcı kaynaklı yoğun. 2026 itibariyle Alaçatı'da imarlı arsa 50K TL/m² altına neredeyse hiç düşmüyor.",
      },
      {
        soru: "İzmir'de yatırımlık zeytinlik?",
        cevap: "Urla, Karaburun, Foça hattında yatırımlık zeytinlik 200-800 TL/m² seviyesinde bulunabilir. Zeytinlik nitelikten konut arsasına dönüşüm zordur, tarımsal niteliği koruyarak değerlenmeyi tercih edenler için uygundur.",
      },
      {
        soru: "İzmir Bayraklı yeni proje bölgesi mi?",
        cevap: "Evet, Yeni Şehir Merkezi olarak planlanan Bayraklı son 5 yılda en yoğun yapılaşan bölge. Konut + ofis kuleleri yoğun, arsa stoku hızla tükendi.",
      },
    ],
  },

  antalya: {
    altBaslik: "Akdeniz'in başkenti — 19 ilçe, sahil odaklı turizm + tarım",
    seoAciklama: "Antalya arsa fiyatları 2026 — Muratpaşa, Konyaaltı, Lara, Kemer, Alanya için TL/m² medyan. Sahil hattı premium, iç ilçeler tarım/sera arsası.",
    giris:
      "Antalya, Türkiye'nin turizm motoru olarak yıllık 10+ milyon ziyaretçiye ev sahipliği yapar. " +
      "Sahil hattı boyunca konut + butik otel + apart arsaları yoğun talep görürken, " +
      "iç ilçelerde sera tarımı (özellikle Kumluca, Finike) ve narenciye için tarım arsaları aktif piyasa oluşturur. " +
      "Yabancı yatırımcı (Rus, Alman, İskandinav) talebi Antalya konut piyasasını destekleyen kritik faktördür.",
    onemliBolgeler: [
      { ad: "Muratpaşa — Lara, Konyaaltı sahili", aciklama: "Antalya'nın merkezi sahili. Lara konut arsası 25-50K TL/m², Konyaaltı 20-40K." },
      { ad: "Kepez", aciklama: "Şehir merkezi yakını orta gelir. Kentsel dönüşüm aktif, fiyatlar makul." },
      { ad: "Aksu", aciklama: "Havalimanı + golf turizmi. Belek aksı premium turistik konut." },
      { ad: "Kemer — Çıralı, Olimpos", aciklama: "Sahil koruması yüksek, butik otel arsası nadir. Çıralı'da imarlı arsa 30-50K TL/m²." },
      { ad: "Alanya — Mahmutlar, Avsallar", aciklama: "Yabancı (özellikle Rus) yatırımcı odaklı. Yüksek kira getirisi, hızlı sirkülasyon." },
      { ad: "Manavgat — Side", aciklama: "Sahil + arkeolojik alan. Side sit kısıtlamaları sıkı." },
      { ad: "Kaş — Kalkan", aciklama: "Lüks villa segmenti. Kalkan koy bölgeleri 50-100K TL/m²." },
      { ad: "Kumluca, Finike", aciklama: "Sera tarımı bölgesi. Tarım arsası 800-3.000 TL/m². Yatırım amaçlı sera arsası talebi yüksek." },
    ],
    yatirimYorumu:
      "Antalya'da sahil arsa yatırımı için 3 kritik kontrol: " +
      "(1) Özel çevre koruma kısıtlamaları (Kekova, Patara, Olimpos) — yapı izni alınamıyor olabilir; " +
      "(2) Yabancıya satış kısıtlamaları — askeri yasak bölge sınır şehirlerde geçerli; " +
      "(3) Plaj koruması (kıyıdan 50-100m setback) — TKGM'de kıyı kanunu sınır kontrolü şart. " +
      "Tarım arsası için sulama hakkı, sera ruhsatı ayrı incelenmeli.",
    sss: [
      {
        soru: "Antalya'da yabancıya satışta kısıtlama var mı?",
        cevap: "Genelde yok ama askeri yasak bölge sınırları (Demre kıyı bazı parseller, Kemer batısı) ve özel çevre koruma alanlarında ek izinler gerekebilir. TKGM'de 'yabancıya satış kısıtlaması' alanı kontrol edilmeli.",
      },
      {
        soru: "Antalya tarım arsası getirisi nasıl?",
        cevap: "Sera tarımı (domates, biber) bölgelerinde (Kumluca, Demre) tarım arsasından %12-18 yıllık net getiri mümkün. İlk 3-5 yıl sera kurulumu yatırımı gerekir.",
      },
      {
        soru: "Alanya yatırımlık konut arsası?",
        cevap: "Mahmutlar, Avsallar, Kestel hattında imarlı arsa 8-20K TL/m². Yabancı kira talebi yoğun olduğu için kira getirisi %8-12 (TL bazlı) seviyesinde.",
      },
    ],
  },

  mugla: {
    altBaslik: "Lüks sahil — 13 ilçe, Bodrum, Marmaris, Datça, Fethiye",
    seoAciklama: "Muğla arsa fiyatları 2026 — Bodrum, Marmaris, Datça, Fethiye, Yalıkavak için TL/m² medyan. Türkiye'nin en pahalı yazlık bölgesi, lüks villa + butik otel.",
    giris:
      "Muğla, Türkiye'nin lüks sahil bölgesi — Bodrum yarımadası, Datça, Marmaris ve Fethiye'de yazlık konut, butik otel ve lüks villa segmenti dominanttır. " +
      "Yalıkavak, Türkbükü, Göltürkbük gibi Bodrum koyları Türkiye'nin en pahalı m² fiyatlarına sahip bölgelerdendir (50-100K+ TL/m²). " +
      "Datça yarımadası ise 'doğal yaşam' temasıyla son 5 yılda hızla değer kazanıyor. " +
      "Cadastrum Muğla'nın 13 ilçesi ve 800+ mahallesi için ilan medyanı + AI baseline sunar.",
    onemliBolgeler: [
      { ad: "Bodrum — Yalıkavak, Türkbükü", aciklama: "Türkiye'nin en pahalı sahil bölgesi. Yalıkavak Marina çevresi 80-150K TL/m²." },
      { ad: "Bodrum — Gümüşlük, Mumcular", aciklama: "Daha sakin, butik otel ve villa. Sit kısıtlamaları ile yapılaşma kontrollü." },
      { ad: "Bodrum — Bitez, Ortakent", aciklama: "Orta segment yazlık. 30-60K TL/m² konut arsası." },
      { ad: "Datça", aciklama: "Yarımada bütünü doğal sit. İmarlı arsa nadir; var olan parseller hızla değerleniyor (15-40K)." },
      { ad: "Marmaris — İçmeler, Turunç", aciklama: "Yat turizmi + Rus/İngiliz yazlıkçı. İçmeler imarlı arsa 20-40K TL/m²." },
      { ad: "Fethiye — Ölüdeniz, Çalış", aciklama: "Paragliding + İngiliz emekli yatırımcı. Ölüdeniz koruması ile yapılaşma kısıtlı." },
      { ad: "Köyceğiz, Dalaman", aciklama: "Havaalanı + nispeten düşük fiyat. 5-15K TL/m² imarlı arsa." },
      { ad: "Milas", aciklama: "Termik santral + tarım. Yatırımlık tarım arsası 800-2.500 TL/m²." },
    ],
    yatirimYorumu:
      "Muğla'da arsa yatırımının en kritik faktörü ÖZEL ÇEVRE KORUMA. " +
      "Bodrum yarımadası, Datça, Gökova körfezi büyük ölçüde özel çevre koruma alanı (ÖÇK) — yapı izni almak zor, yapılaşma kuralları sıkı. " +
      "İmarlı arsa fiyatları çok yüksek; 'imarsız ama yakında imar planı gelecek' söylentileriyle yatırım yapmak risklidir. " +
      "TKGM ve e-Plan kontrolü mutlaka yapılmalı, plan tarihi 5 yıl içinde değişmiyorsa beklenti gerçekleşmeyebilir.",
    sss: [
      {
        soru: "Bodrum'da en pahalı koy hangisi?",
        cevap: "Yalıkavak ve Türkbükü öncülüğünde, son 3 yılda Göltürkbük da en pahalılar arasına girdi. Yalıkavak Marina çevresi imarlı arsa 80-150K TL/m² aralığında işlem görüyor.",
      },
      {
        soru: "Datça'da imarlı arsa var mı?",
        cevap: "Çok az. Datça yarımadası büyük ölçüde doğal sit + ÖÇK. Mevcut imarlı parseller premium (15-40K TL/m²), yeni imar açma neredeyse imkânsız.",
      },
      {
        soru: "Muğla'da imarsız arsa yatırımı mantıklı mı?",
        cevap: "Genel olarak risk-getiri oranı dezavantajlı. Plan değişikliği beklentisi ile alınan tarımsal arsalar uzun yıllar (10+) imarsız kalabilir. TKGM nitelik kayıt + e-Plan plan revizyon tarihi mutlaka kontrol edilmeli.",
      },
    ],
  },
};
