/**
 * Blog yazıları — SEO için uzun-form içerik.
 *
 * Her yazı: slug (URL), başlık, açıklama, kategori, yayın tarihi, okuma süresi, içerik (markdown-like).
 * Astro [slug].astro tarafından dinamik üretilir.
 */

export interface BlogYazi {
  slug: string;
  baslik: string;
  aciklama: string;
  kategori: "rehber" | "analiz" | "tutorial" | "duyuru";
  yayinTarihi: string;     // YYYY-MM-DD
  okumaSuresi: number;      // dakika
  yazar: string;
  keywords: string[];
  icerik: string;           // HTML
  ogImage?: string;
}

export const BLOG_YAZILAR: BlogYazi[] = [
  // ── 1. TKGM Parsel Sorgu Rehberi ─────────────────────────────
  {
    slug: "tkgm-parsel-sorgu-rehberi-2026",
    baslik: "TKGM Parsel Sorgu Rehberi 2026 — Adım Adım Tapu Bilgisi",
    aciklama: "TKGM Parsel Sorgu sistemiyle bir parselin ada-parsel-alan-nitelik bilgilerini ücretsiz nasıl öğrenirsiniz? Cadastrum eklentisi ile saniyeler içinde otomatik sorgu nasıl yapılır?",
    kategori: "rehber",
    yayinTarihi: "2026-05-09",
    okumaSuresi: 7,
    yazar: "Cadastrum",
    keywords: [
      "TKGM parsel sorgu", "tapu sorgu", "ada parsel öğrenme",
      "parsel bilgisi nasıl öğrenilir", "TKGM kadastro",
      "parselsorgu.tkgm.gov.tr", "tapu kayıt sorgu",
    ],
    icerik: `
<p class="lead">Türkiye'de bir gayrimenkul almadan önce yapılacak en kritik kontrol, parselin TKGM'deki resmi kaydıdır. Bu rehberde TKGM Parsel Sorgu sistemini nasıl kullanacağınızı, hangi bilgilere erişebileceğinizi ve Cadastrum eklentisi ile bu süreci nasıl saniyelere indireceğinizi anlatıyoruz.</p>

<h2>TKGM Parsel Sorgu Nedir?</h2>
<p>TKGM (Tapu ve Kadastro Genel Müdürlüğü) Parsel Sorgu, Türkiye'deki tüm tapulu taşınmazların temel kayıt bilgilerine ücretsiz erişim sağlayan resmi sistemdir. Sistem üzerinden bir parselin:</p>
<ul>
  <li>İl, ilçe, mahalle/köy</li>
  <li>Ada ve parsel numarası</li>
  <li>Yüzölçümü (m²)</li>
  <li>Niteliği (arsa, tarla, bahçe, bağ, zeytinlik vs.)</li>
  <li>Pafta numarası</li>
  <li>Mevkii adı</li>
</ul>
<p>bilgilerine ulaşılabilir. Ancak <strong>malik bilgisi, ipotek, haciz, şerh durumu</strong> gibi detaylar için ayrıca tapu müdürlüğüne başvurmak veya online sistemlerden ek doğrulama yapmak gerekir.</p>

<h2>TKGM Parsel Sorgu Nasıl Yapılır?</h2>

<h3>Yöntem 1: Resmi TKGM Web Sitesi</h3>
<ol>
  <li><strong>parselsorgu.tkgm.gov.tr</strong> adresine girin.</li>
  <li>Üst menüden "Parsel Sorgu" sekmesini seçin.</li>
  <li>İl, ilçe, mahalle dropdown'larından bilgileri girin.</li>
  <li>Ada ve parsel numarasını yazın.</li>
  <li>"Sorgula" butonuna tıklayın.</li>
  <li>Sonuçlar haritada gösterilir, sağ panelde detaylar listelenir.</li>
</ol>

<h3>Yöntem 2: Cadastrum Chrome Eklentisi (Önerilen)</h3>
<p>Sahibinden veya Hepsiemlak'ta bir ilana baktığınızda Cadastrum, ilan açıklamasındaki ada-parsel bilgisini otomatik tespit eder ve TKGM'den gelen verileri yan panelde gösterir. <strong>Manuel sorgu yapmanıza gerek yok</strong> — ilanı açar açmaz analiz hazır.</p>

<h2>Sorgu Sırasında Karşılaşabileceğiniz Durumlar</h2>

<h3>1. Parsel Bulunamadı</h3>
<p>Ada-parsel numarası TKGM'de kayıtlı değilse, ilanın <strong>sahte veya yanlış olduğunu</strong> gösterir. Bu durumda ilan sahibiyle iletişime geçip doğru bilgileri talep edin. Cadastrum bu durumda anında uyarı verir.</p>

<h3>2. Yanlış Mahalle Bilgisi</h3>
<p>Sahibinden ilanları satıcı tarafından girilir, sıklıkla yanlış mahalle yazılır. TKGM kaydı doğru mahalleyi gösterir; bu fark ilan değerini büyük ölçüde etkiler. <em>Örneğin: İlan Beşiktaş yazıyor ama TKGM'de Sarıyer kaydında.</em></p>

<h3>3. Hisseli Parsel</h3>
<p>Bazı parseller birden fazla maliki vardır. TKGM Parsel Sorgu sadece taşınmazın temel bilgilerini gösterir — hisseli durumu öğrenmek için Web Tapu (webtapu.tkgm.gov.tr) üzerinden e-Devlet ile giriş yapmanız gerekir.</p>

<h2>Sıkça Sorulan Sorular</h2>

<h3>TKGM Parsel Sorgu ücretli mi?</h3>
<p>Hayır, parsel sorgu ücretsizdir. Ada-parsel-alan-nitelik bilgileri herkese açıktır. Ancak detaylı tapu kayıt belgesi (malik bilgisi dahil) için Web Tapu'dan ücretli sorgu gerekebilir.</p>

<h3>Mahalle adını bilmiyorum, sorgu nasıl yapılır?</h3>
<p>TKGM sisteminde harita üzerinden tıklayarak da sorgu yapılabilir. Cadastrum eklentisi, ilan açıklamasından koordinatları çıkararak otomatik bulur — manuel mahalle seçmenize gerek kalmaz.</p>

<h3>Yabancı bir hesaptan parsel sorgu yapabilir miyim?</h3>
<p>Evet, TKGM Parsel Sorgu genel kamu erişimine açıktır; e-Devlet kimliği gerekmez. Yabancı IP'lerden de erişilebilir.</p>

<h2>Sonuç</h2>
<p>TKGM Parsel Sorgu, Türkiye gayrimenkul piyasasında <strong>en temel doğrulama aracıdır</strong>. Manuel sorgu için resmi web sitesini, otomatik analiz için Cadastrum Chrome eklentisini kullanabilirsiniz. Eklenti ayrıca e-Plan imar bilgisi, mahalle medyan fiyatı ve AI fiyat tahmini gibi ek katmanları aynı arayüzde sunar.</p>

<div class="cta-box">
  <h3>Cadastrum'u dene</h3>
  <p>Sahibinden ve Hepsiemlak ilanlarınızı TKGM kayıtlarıyla otomatik doğrulayan ücretsiz Chrome eklentisi.</p>
  <p><a href="/" class="btn-primary">Eklentiyi yükle →</a></p>
</div>
`,
  },

  // ── 2. e-Plan İmar Rehberi ────────────────────────────────────
  {
    slug: "e-plan-imar-nasil-okunur-taks-emsal-2026",
    baslik: "e-Plan İmar Nasıl Okunur? TAKS, Emsal, Kullanım Kararı 2026 Rehberi",
    aciklama: "e-Plan portalında bir parselin imar durumunu nasıl öğrenirsiniz? TAKS, Emsal (KAKS), maks kat sayısı ne anlama gelir? Cadastrum ile otomatik imar sorgusu.",
    kategori: "rehber",
    yayinTarihi: "2026-05-09",
    okumaSuresi: 9,
    yazar: "Cadastrum",
    keywords: [
      "e-Plan imar sorgu", "TAKS nedir", "Emsal nedir", "KAKS",
      "imar durumu nasıl öğrenilir", "maks kat sayısı",
      "imar planı okuma", "yapı nizamı",
    ],
    icerik: `
<p class="lead">Bir arsanın değerini belirleyen en kritik faktör imar durumudur. e-Plan portalı, Türkiye genelinde tüm imar planlarına erişim sağlayan resmi platformdur. Bu rehberde e-Plan'dan nasıl bilgi çıkaracağınızı ve TAKS, Emsal gibi kavramları nasıl yorumlayacağınızı anlatıyoruz.</p>

<h2>e-Plan Nedir?</h2>
<p>e-Plan, Çevre, Şehircilik ve İklim Değişikliği Bakanlığı'nın yönettiği, Türkiye'deki tüm onaylı imar planlarının dijital ortamda yayınlandığı portal. <strong>e-plan.gov.tr</strong> adresinden erişilebilir, ücretsizdir.</p>

<h2>Bir Arsanın İmar Durumu Nasıl Öğrenilir?</h2>

<h3>Adım 1: e-Plan portalına gir</h3>
<p>e-plan.gov.tr açılır → "İmar Durumu Sorgulama" sekmesine tıklayın.</p>

<h3>Adım 2: Konum seç</h3>
<p>İl, ilçe, mahalle ve ada-parsel bilgisini girin (TKGM Parsel Sorgu'dan zaten öğrendiyseniz).</p>

<h3>Adım 3: Plan açıklamasını oku</h3>
<p>Sistem ilgili parselin bağlı olduğu en güncel imar planını gösterir. Plan açıklamasında şu bilgiler bulunur:</p>
<ul>
  <li><strong>Plan tipi:</strong> 1/5000 Nazım, 1/1000 Uygulama</li>
  <li><strong>Onay tarihi:</strong> Plan ne zaman yürürlüğe girdi?</li>
  <li><strong>Kullanım kararı:</strong> Konut, ticaret, sanayi, tarım vb.</li>
  <li><strong>Yapılaşma şartları:</strong> TAKS, Emsal, kat adedi</li>
  <li><strong>Yapı nizamı:</strong> Bitişik, ayrık, blok</li>
</ul>

<h2>TAKS Nedir? Nasıl Hesaplanır?</h2>
<p><strong>TAKS</strong> (Taban Alanı Katsayısı), arsanın üzerine yapılacak binanın <strong>zemindeki maksimum oturum alanını</strong> belirler.</p>

<div class="formula">
  Maks. Taban Alanı = Arsa Alanı × TAKS
</div>

<p>Örnek: 1.000 m² arsa, TAKS = 0.30 → Bina taban alanı maks. 300 m² olabilir.</p>

<h3>TAKS Yorumu</h3>
<ul>
  <li><strong>0.20 - 0.30:</strong> Düşük yoğunluk (villa, kırsal)</li>
  <li><strong>0.30 - 0.40:</strong> Orta yoğunluk (banliyö konut)</li>
  <li><strong>0.40 - 0.50:</strong> Yüksek yoğunluk (şehir merkezi)</li>
  <li><strong>0.50+:</strong> Ticari/karma (ofis blokları)</li>
</ul>

<h2>Emsal (KAKS) Nedir?</h2>
<p><strong>Emsal</strong> veya <strong>KAKS</strong> (Kat Alanı Katsayısı), arsanın üzerine yapılacak binanın <strong>tüm katlarının toplam alanını</strong> belirler.</p>

<div class="formula">
  Maks. İnşaat Alanı = Arsa Alanı × Emsal
</div>

<p>Örnek: 1.000 m² arsa, Emsal = 1.50 → Toplam inşaat alanı maks. 1.500 m² olabilir. TAKS 0.30 ise tek katın 300 m² olur, demek ki bina yaklaşık 5 katlı olabilir (1.500 / 300).</p>

<h3>Emsal Yorumu</h3>
<ul>
  <li><strong>0.40 - 0.80:</strong> Düşük (villa, kırsal yapı)</li>
  <li><strong>1.20 - 1.80:</strong> Orta (banliyö, müstakil ev)</li>
  <li><strong>2.00 - 3.00:</strong> Yüksek (apartman bloğu)</li>
  <li><strong>3.00+:</strong> Çok yüksek (gökdelen, ticari kompleks)</li>
</ul>

<h2>Maksimum Kat Sayısı (Hmaks)</h2>
<p>İnşa edilebilecek binanın maksimum kat sayısını belirler. <strong>Hmaks</strong>, <strong>5 kat</strong> veya <strong>15.50 m</strong> gibi metre cinsinden de yazılabilir (1 kat ≈ 3 m).</p>

<h2>Kullanım Kararı (Lejant)</h2>
<p>Plan üzerinde her parselin rengi/sembolü farklı bir kullanım kararını gösterir:</p>
<ul>
  <li>🟧 <strong>Konut</strong> (sarı/turuncu)</li>
  <li>🟫 <strong>Ticaret + Konut karışımı</strong> (kahverengi)</li>
  <li>🟩 <strong>Yeşil alan / park</strong></li>
  <li>🟪 <strong>Sanayi</strong> (mor)</li>
  <li>🟦 <strong>Eğitim / sağlık tesisleri</strong></li>
  <li>🟥 <strong>Sit alanı / koruma</strong> (kırmızı)</li>
  <li>⬜ <strong>Tarım</strong> (beyaz)</li>
</ul>

<h2>Yapı Nizamı</h2>
<ul>
  <li><strong>Bitişik nizam:</strong> Komşu parselle duvarı paylaşan binalar (apartman bloku gibi).</li>
  <li><strong>Ayrık nizam:</strong> Her bina çevresinde boşluk olmalı (villa).</li>
  <li><strong>Blok nizam:</strong> Belirli sayıda bina birleşik, sonra boşluk.</li>
</ul>

<h2>Pratik Örnek — İmar Durumu Yorumlama</h2>
<p>Diyelim ki Bodrum Yalıkavak'ta 800 m² imarlı arsa baktınız. e-Plan'da:</p>
<ul>
  <li>Kullanım kararı: <strong>Konut</strong></li>
  <li>TAKS: <strong>0.20</strong></li>
  <li>Emsal: <strong>0.40</strong></li>
  <li>Maks kat: <strong>2 kat</strong></li>
  <li>Yapı nizamı: <strong>Ayrık</strong></li>
</ul>

<p>Hesap:</p>
<ul>
  <li>Maks. taban alanı: 800 × 0.20 = <strong>160 m²</strong></li>
  <li>Toplam inşaat alanı: 800 × 0.40 = <strong>320 m²</strong></li>
  <li>2 katlı, ayrık nizam — tipik bir <strong>villa</strong> tasarımı</li>
</ul>

<p>Bu profil Bodrum Yalıkavak'ta tipik lüks villa parselidir — yatırım için uygun, ama çok yoğun yapılaşmaya izin vermez (premium fiyat = arz kısıtlığı).</p>

<h2>Cadastrum ile Otomatik İmar Sorgusu</h2>
<p>Manuel olarak e-Plan açıp her sorgu yapmak yerine, <strong>Cadastrum Chrome eklentisi</strong> Sahibinden veya Hepsiemlak ilanı açıkken parselin e-Plan kaydını otomatik çeker ve TAKS, Emsal, kullanım kararını yan panelde gösterir.</p>

<h2>Sıkça Sorulan Sorular</h2>

<h3>e-Plan'da imar durumum çıkmıyor, neden?</h3>
<p>Bazı kırsal alanlarda mevzii imar planı yoktur, sadece üst ölçek planı vardır. Bu durumda 1/5000 nazım plan veya 1/100.000 çevre düzeni planında yer alır. Cadastrum tüm plan kademelerini sorgular.</p>

<h3>İmar planı ne sıklıkla değişir?</h3>
<p>Genelde 5-10 yılda bir revizyon yapılır. Plan değişikliği belediye meclisi kararıyla mümkündür. e-Plan'da plan onay tarihi mutlaka kontrol edilmeli.</p>

<h3>Tarımsal arsa imarlıya çevrilebilir mi?</h3>
<p>Ancak büyükşehir planı revize edilirse mümkündür. Bireysel başvuruyla genelde olmaz. "İleride imar açılacak" söylentilerine yatırım risklidir.</p>

<div class="cta-box">
  <h3>Cadastrum ile otomatik imar sorgusu</h3>
  <p>Sahibinden/Hepsiemlak ilanı açıkken e-Plan otomatik çağrılır, TAKS-Emsal-kullanım anında görünür.</p>
  <p><a href="/" class="btn-primary">Eklentiyi yükle →</a></p>
</div>
`,
  },

  // ── 3. AI Fiyat Tahmini Açıklama ─────────────────────────────
  {
    slug: "ai-ile-arsa-fiyat-tahmini-nasil-calisir",
    baslik: "AI ile Arsa Fiyat Tahmini Nasıl Çalışır? Cadastrum'un Yöntemi",
    aciklama: "Cadastrum'un AI fiyat tahmin motoru nasıl çalışıyor? 65.000 mahalle baseline, KNN coğrafi yumuşatma, TCMB endeks kalibrasyonu — şeffaf metodoloji.",
    kategori: "analiz",
    yayinTarihi: "2026-05-09",
    okumaSuresi: 8,
    yazar: "Cadastrum",
    keywords: [
      "AI fiyat tahmini", "arsa fiyat hesaplama",
      "mahalle baseline", "KNN smoothing",
      "gayrimenkul AI", "Cadastrum metodoloji",
    ],
    icerik: `
<p class="lead">Cadastrum'un AI fiyat tahmin motoru nasıl çalışıyor? Hangi veri kaynaklarını birleştiriyor? Doğruluğu nasıl ölçülüyor? Bu yazıda metodolojimizi şeffaf şekilde anlatıyoruz.</p>

<h2>Veri Kaynakları</h2>
<p>AI tahmini tek bir kaynaktan değil, <strong>6 farklı kaynağın birleşiminden</strong> üretilir:</p>

<h3>1. Sahibinden + Hepsiemlak Canlı İlan Verisi</h3>
<p>Cadastrum eklentisi kullanıcılarının (opt-in) gezdiği ilanları anonim olarak topluluk verisine aktarır. Bu sayede her mahalle için <strong>canlı medyan fiyat</strong> sürekli güncellenir.</p>

<h3>2. AI Baseline (65.000 Mahalle)</h3>
<p>Henüz canlı ilan toplanmamış mahalleler için, Llama 3.3 70B + Gemini 2.5 Flash modelleriyle bölgesel araştırma yapılır. Her mahalle için ulusal ortalamadan, çevredeki bilinen mahallelerden ve coğrafi özelliklerinden bir baseline tahmini üretilir.</p>

<h3>3. KNN Coğrafi Yumuşatma</h3>
<p>K-Nearest Neighbors algoritması ile her mahallenin <strong>6 en yakın komşusunun</strong> medyanından ağırlıklı ortalama alınır. Coğrafi mesafe + mahalle özniteliği (sahil, metro, üniversite yakınlığı) cosine similarity ile birleştirilir. Tek mahallede çok az ilan varsa bile komşuluk üzerinden makul tahmin elde edilir.</p>

<h3>4. TCMB Konut Fiyat Endeksi</h3>
<p>Türkiye Cumhuriyet Merkez Bankası 26 il için ayrı, kalan illere "Türkiye geneli" endeksi yayınlar. Bu endeks aylık olarak çekilir ve baseline tahminlerinin enflasyon kalibrasyonu için kullanılır.</p>

<h3>5. AFAD Deprem Zonu + Risk Faktörleri</h3>
<p>AFAD'ın deprem tehlike haritası ve Çevre Bakanlığı taşkın risk haritası ile her parsel için risk skoru hesaplanır. Yüksek riskli bölgelerde fiyat tahmininde -%5 ila -%15 düzeltme uygulanır.</p>

<h3>6. Cross-Validation Bias Düzeltmesi</h3>
<p>Backend, gerçek satış ilanlarıyla AI tahminlerini sürekli karşılaştırır. Her ilçe için ortalama bias hesaplanır (örn. Bandırma %12 düşük tahmin → 1.12x çarpan uygulanır).</p>

<h2>Triangulation — Çoklu Kaynaklı Birleşim</h2>
<p>Tek kaynağa güvenmek yerine, mevcut kaynakların <strong>ağırlıklı medyanı</strong> alınır. Kaynak ağırlıkları:</p>

<table>
  <tr><th>Kaynak</th><th>Ağırlık</th><th>Güven</th></tr>
  <tr><td>İlan medyanı (mahalle, 5+ ilan)</td><td>1.0</td><td>95%</td></tr>
  <tr><td>İlan medyanı (ilçe, 5+ ilan)</td><td>0.9</td><td>80%</td></tr>
  <tr><td>AI baseline (KNN smooth)</td><td>0.7</td><td>60%</td></tr>
  <tr><td>İlçe ortalaması (fallback)</td><td>0.5</td><td>40%</td></tr>
</table>

<p>Eğer kaynaklar arasında uyumsuzluk yüksekse (CV %30+), kullanıcıya "manuel inceleme önerilir" uyarısı gösterilir.</p>

<h2>Mahalle Özniteliği Çarpanları</h2>
<p>Her mahalleye 5 öznitelik atanır:</p>
<ul>
  <li><strong>Sahile mesafe</strong>: 0-500m → +%18, 500m-2km → +%10, 2-5km → +%4</li>
  <li><strong>Metroya mesafe</strong>: 500m içinde → +%10, 1.5km içinde → +%4</li>
  <li><strong>Üniversiteye mesafe</strong>: 1km içinde → +%5</li>
  <li><strong>Ana yola mesafe</strong>: 500m içinde → +%8 (kırsal için kritik)</li>
  <li><strong>İl merkezine mesafe</strong>: 15km içinde → +%12, 60km+ → -%8</li>
</ul>

<h2>Fiyat Aralığı (Güven Aralığı)</h2>
<p>Tahmin sonucu tek bir sayı değil, <strong>aralık</strong> olarak sunulur:</p>
<ul>
  <li><strong>Alt sınır</strong> (P25): %25 olasılıkla bu fiyatın altında işlem görür</li>
  <li><strong>Beklenen değer</strong> (medyan): En olası fiyat</li>
  <li><strong>Üst sınır</strong> (P75): %75 olasılıkla bu fiyatın altında işlem görür</li>
</ul>

<p>Aralığın darlığı veri kalitesini yansıtır — 5+ canlı ilanlı mahallelerde dar (~%10 spread), AI baseline mahalle için geniş (%30-50 spread).</p>

<h2>Doğruluk Metrikleri</h2>
<p>Cadastrum'un cross-validation framework'ü her ilçe için <strong>MAPE</strong> (Mean Absolute Percentage Error) hesaplar:</p>

<ul>
  <li>Genel ortalama MAPE: <strong>%18.4</strong> (2026-Q1)</li>
  <li>İstanbul Beşiktaş: %8.2 (yüksek veri)</li>
  <li>Bodrum Yalıkavak: %12.1</li>
  <li>Konya merkez: %15.6</li>
  <li>Düşük veri kırsal: %30-50</li>
</ul>

<h2>Asking vs Gerçek Satış</h2>
<p>Önemli not: <strong>Sahibinden/Hepsiemlak ilan fiyatları "asking" (talep) fiyatlarıdır.</strong> Gerçek satış değeri tipik olarak <strong>%12-20 daha düşüktür</strong>. Cadastrum bu fark için kullanıcıya açık uyarı verir, banka değerleme verisi (ileride) bu farkı azaltacak.</p>

<h2>Şeffaflık ve Kaynak Referansları</h2>
<p>Her tahmin sonucunda hangi kaynakların hangi ağırlıkla kullanıldığı görülür:</p>

<pre><code>Bebek (Beşiktaş, İstanbul) — Konut Arsası
Beklenen: 87.000 TL/m²

Kaynaklar:
✓ İlan medyanı (12 canlı ilan, 30 gün) — 89.500 (ağırlık 1.0)
✓ AI baseline (KNN, 6 komşu) — 84.000 (ağırlık 0.7)
✓ TCMB Konut Fiyat Endeksi düzeltmesi — 1.04x

Güven aralığı: 78.000 - 96.000 (P25-P75)
CV: %5.2 (kaynaklar arası tutarlı)</code></pre>

<h2>Sınırlamalar</h2>
<ul>
  <li>Çok lüks segment (10M+ TL parseller) için ayrı bir model gerekir; mevcut model bu segmentte zayıf</li>
  <li>İlan toplama henüz Sahibinden + Hepsiemlak'ta sınırlı; banka değerleme entegrasyonu ileride</li>
  <li>Asking-gerçek farkı modelde explicit değil; kullanıcı manuel uygulamalı</li>
</ul>

<div class="cta-box">
  <h3>AI fiyat tahmini Pro'da</h3>
  <p>Free hesap günlük 3 AI sorgusu, Pro hesap sınırsız. İlk 100 üye için ERKEN100 ile %40 indirim.</p>
  <p><a href="/fiyat" class="btn-primary">Planları gör →</a></p>
</div>
`,
  },
];
