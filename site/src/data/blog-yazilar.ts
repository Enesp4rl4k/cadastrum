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

  // ── 4. Arsa yatırımı nasıl yapılır ───────────────────────────
  {
    slug: "arsa-yatirimi-nasil-yapilir-2026",
    baslik: "Arsa Yatırımı Nasıl Yapılır? 2026 Kontrol Listesi",
    aciklama: "Arsa yatırımı adım adım: TKGM parsel doğrulama, e-Plan imar (emsal/TAKS), mahalle TL/m² ve likidite. Bireysel ve kurumsal yatırımcı checklist'i.",
    kategori: "rehber",
    yayinTarihi: "2026-07-18",
    okumaSuresi: 9,
    yazar: "Cadastrum",
    keywords: [
      "arsa yatırımı",
      "arsa yatırım nasıl yapılır",
      "yatırımlık arsa",
      "arsa almadan önce",
      "imarlı arsa",
      "arsa TL/m²",
    ],
    icerik: `
<p class="lead">Arsa yatırımı, konut alımından daha fazla <strong>resmi veri</strong> ister. Bu rehber; bireysel ve kurumsal yatırımcıların ilan açmadan önce uygulayabileceği net bir kontrol listesi sunar. Araç olarak <a href="/arsa-yatirimi">Cadastrum arsa yatırımı</a> sayfası ve Chrome eklentisi kullanılır.</p>

<h2>1. Hedefi netleştirin</h2>
<p>Kısa vadeli geliştirme (kat karşılığı / inşaat) ile uzun vadeli arazi tutma aynı ürün değildir. Hedef, hangi illerde ve hangi imar tipinde arayacağınızı belirler.</p>
<ul>
  <li><strong>Geliştirme:</strong> imar (emsal/TAKS) ve yol erişimi şart</li>
  <li><strong>Portföy / tutma:</strong> likidite ve vergi/masraf senaryosu önemli</li>
  <li><strong>Kurumsal:</strong> ölçeklenebilir tarama + raporlama gerekir</li>
</ul>

<h2>2. TKGM parsel doğrulama</h2>
<p>İlandaki ada-parsel, alan ve nitelik TKGM ile uyuşmalı. Uyuşmazlık varsa fiyat tartışmasına girmeden önce satıcıdan düzeltme isteyin. Detay: <a href="/tkgm-parsel-sorgu">TKGM parsel sorgu</a>.</p>

<h2>3. e-Plan imar özeti</h2>
<p>Emsal, TAKS, Hmax ve kullanım türü yapı hakkını belirler. İmar belirsizse m² fiyatı spekülasyondur. Rehber: <a href="/imar-sorgu">imar sorgu</a> ve <a href="/blog/e-plan-imar-nasil-okunur-taks-emsal-2026">e-Plan okuma</a>.</p>

<h2>4. Mahalle TL/m² bandı</h2>
<p>Asking (ilan) fiyatı ile gerçek işlem arasında %12–20 fark sık görülür. Cadastrum mahalle medyanı ve güven aralığı verir — tek sayıya kilitlemeyin. Veri: <a href="/veri">/veri</a>.</p>

<h2>5. Likidite ve risk</h2>
<p>Bölgede alım-satım yoğunluğu düşükse çıkış süresi uzar. Deprem / taşkın katmanları portföy riskini değiştirir. Harita: <a href="/harita">TKGM yoğunluk haritası</a>.</p>

<h2>6. Kat karşılığı düşünüyorsanız</h2>
<p>Önce emsal ve alan netleşmeden oran konuşulmaz. Hesaplayıcı: <a href="/kat-karsiligi">kat karşılığı</a> ve <a href="/sorgu#hesaplayicilar">/sorgu</a>.</p>

<h2>Sıkça Sorulanlar</h2>
<h3>Arsa yatırımı için en kritik tek kontrol nedir?</h3>
<p>TKGM + imar birlikte. Biri olmadan diğeri yanıltıcıdır.</p>
<h3>Kurumsal yatırımcı ne ekler?</h3>
<p>Toplu tarama, PDF rapor ve API. Cadastrum Pro+/Kurumsal bu ölçeğe bakar.</p>

<div class="cta-box">
  <h3>Arsa yatırımını hızlandırın</h3>
  <p>İlan üzerinde TKGM, imar ve TL/m² — Cadastrum Chrome eklentisi.</p>
  <p><a href="/arsa-yatirimi" class="btn-primary">Arsa yatırımı sayfası →</a></p>
</div>
`,
  },

  // ── 5. Tarla yatırımı rehberi ────────────────────────────────
  {
    slug: "tarla-yatirimi-rehberi-2026",
    baslik: "Tarla Yatırımı Rehberi 2026 — Nitellik, İmar, Fiyat",
    aciklama: "Yatırımlık tarla alırken TKGM niteliği, imar/tarım kısıtı ve m² fiyatı nasıl okunur? Tarla vs arsa farkı ve Cadastrum ile kontrol listesi.",
    kategori: "rehber",
    yayinTarihi: "2026-07-18",
    okumaSuresi: 8,
    yazar: "Cadastrum",
    keywords: [
      "tarla yatırımı",
      "yatırımlık tarla",
      "tarım arazisi alımı",
      "tarla fiyat",
      "tarla imar",
      "tarla arsa farkı",
    ],
    icerik: `
<p class="lead">Tarla yatırımı; düşük m² fiyatı yüzünden cazip görünür ama <strong>nitellik ve kısıt</strong> yanlış okunursa pahalı bir hataya dönüşür. Bu rehber, yatırımlık tarla arayan bireysel ve kurumsal alıcılar içindir. Özet sayfa: <a href="/tarla-yatirimi">tarla yatırımı</a>.</p>

<h2>Tarla ile arsa arasındaki fark</h2>
<p>TKGM niteliği “tarla / bağ / zeytinlik” iken ilan “arsa” diyebilir. Yapı hakkı e-Plan ve belediye planına bağlıdır; tarım arazisinde yapı hayaliyle alım en yaygın hatadır. Karşılaştırma: <a href="/arsa-yatirimi">arsa yatırımı</a>.</p>

<h2>Kontrol listesi</h2>
<ol>
  <li><strong>TKGM niteliği ve alan</strong> — <a href="/tkgm-parsel-sorgu">parsel sorgu</a></li>
  <li><strong>İmar / plan durumu</strong> — <a href="/imar-sorgu">imar sorgu</a></li>
  <li><strong>Bölge TL/m²</strong> — <a href="/veri">mahalle verisi</a></li>
  <li><strong>Likidite</strong> — <a href="/harita">yoğunluk haritası</a></li>
  <li><strong>Hisseli mülkiyet</strong> — Web Tapu / hukuki teyit</li>
</ol>

<h2>Fiyatı nasıl okumalı?</h2>
<p>Tarla m² fiyatları ilçeden mahalleye sert değişir. Asking fiyatı medyanın çok üzerindeyse ya imar beklentisi fiyatlanmıştır ya da piyasa dışıdır. Cadastrum bandı + güven aralığı sunar.</p>

<h2>Ne zaman tarla alınır?</h2>
<ul>
  <li>Uzun vadeli arazi / dönüşüm senaryosu ve risk iştahı varsa</li>
  <li>Yol, sulama, eğim gibi fiziki faktörler netse</li>
  <li>Çıkış (satış) süresini bilançoya yazabiliyorsanız</li>
</ul>

<h2>Sıkça Sorulanlar</h2>
<h3>Tarlaya ev yapılır mı?</h3>
<p>Genelde hayır veya çok kısıtlı. İmar ve ruhsat olmadan yapı risklidir; e-Plan + belediye teyidi şart.</p>
<h3>Tarla yatırımı kısa vadede kârlı mı?</h3>
<p>Nadiren. Likidite düşük bölgelerde süre uzar; spekülatif imar hikâyelerine karşı resmi veri kullanın.</p>

<div class="cta-box">
  <h3>Tarla ilanını doğrula</h3>
  <p>Nitelik, imar ve m² bandı — Cadastrum ile ilan üzerinde.</p>
  <p><a href="/tarla-yatirimi" class="btn-primary">Tarla yatırımı →</a></p>
</div>
`,
  },

  // ── 6. AI ile arsa/tarla nasıl seçilir ───────────────────────
  {
    slug: "ai-ile-arsa-tarla-nasil-secilir-2026",
    baslik: "AI ile Arsa ve Tarla Nasıl Seçilir? 2026 Pratik Rehber",
    aciklama: "Yapay zeka / analiz aracı arayan yatırımcılar için: TKGM + imar + AI fiyat bandıyla arsa ve tarla seçim akışı. Cadastrum checklist.",
    kategori: "rehber",
    yayinTarihi: "2026-07-20",
    okumaSuresi: 8,
    yazar: "Cadastrum",
    keywords: [
      "AI ile arsa seçimi",
      "yapay zeka arsa",
      "arsa analiz aracı",
      "tarla seçim tool",
      "AI gayrimenkul yatırım",
      "arsa yatırım asistanı",
    ],
    icerik: `
<p class="lead">“Yapay zeka ile arsa bul” araması yapan çoğu kişi aslında <strong>hızlı ve dürüst bir karar aracı</strong> arıyor. Bu rehber; AI’yı TKGM ve imar olmadan kullanmanın riskini anlatır, Cadastrum akışını adım adım verir. Ürün sayfası: <a href="/ai-arsa-analiz">AI arsa analiz aracı</a>.</p>

<h2>AI tek başına yetmez</h2>
<p>Sadece ChatGPT’ye “Bodrum’da tarla alayım mı?” yazmak spekülasyondur. Doğru araç sırası:</p>
<ol>
  <li><strong>Resmi parsel</strong> — <a href="/tkgm-parsel-sorgu">TKGM</a></li>
  <li><strong>Yapı hakkı</strong> — <a href="/imar-sorgu">e-Plan imar</a></li>
  <li><strong>Piyasa bandı</strong> — mahalle emsal + <a href="/blog/ai-ile-arsa-fiyat-tahmini-nasil-calisir">AI tahmin</a></li>
  <li><strong>Likidite / risk</strong> — <a href="/harita">yoğunluk haritası</a></li>
</ol>

<h2>60 saniyelik seçim akışı</h2>
<p>Chrome’a Cadastrum’u ekleyin. Sahibinden veya Hepsiemlak’ta ilanı açın. Yan panelde dört satırı okuyun: parsel, imar, TL/m², risk. Uyuşmazlık varsa ilanı eleyin — AI yorumundan önce.</p>

<h2>Arsa mı tarla mı?</h2>
<p>Hedef kısa vadeli geliştirme ise imarlı <a href="/arsa-yatirimi">arsa</a>; uzun vadeli arazi ise <a href="/tarla-yatirimi">tarla</a> — ama nitellik ve plan kısıtı net olmalı. AI fiyat bandı her iki nitelikte de çalışır; girdiler farklıdır.</p>

<h2>Kurumsal kullanım</h2>
<p>Ofisler Pro+/API ile aynı motoru toplu tarar. “Tool arıyorum” diyen kurumsal alıcı için kritik: raporlanabilir çıktı ve kaynak şeffaflığı.</p>

<h2>Sıkça Sorulanlar</h2>
<h3>En iyi AI arsa aracı hangisi?</h3>
<p>Resmi veriye bağlı, güven aralığı veren ve Chrome/web’de kullanılabilen araçları tercih edin. Cadastrum bu üçünü birleştirir.</p>
<h3>Ücretsiz deneyebilir miyim?</h3>
<p>Evet — Free plan ve <a href="/sorgu">web sorgu</a> ile başlayın.</p>

<div class="cta-box">
  <h3>AI analiz aracını dene</h3>
  <p>Parsel + imar + AI TL/m² — tek bakışta.</p>
  <p><a href="/ai-arsa-analiz" class="btn-primary">AI arsa analiz →</a></p>
</div>
`,
  },

  // ── 7. İstanbul Arsa Fiyatları 2026 ──────────────────────────
  {
    slug: "istanbul-arsa-fiyatlari-2026",
    baslik: "İstanbul Arsa Fiyatları 2026 — İlçe Bazlı Analiz",
    aciklama: "İstanbul'da arsa fiyatları 2026 yılında ilçe bazında nasıl? Beykoz, Silivri, Çatalca, Şile, Tuzla karşılaştırması. Cadastrum mahalle verisi.",
    kategori: "analiz",
    yayinTarihi: "2026-07-21",
    okumaSuresi: 9,
    yazar: "Cadastrum",
    keywords: [
      "İstanbul arsa fiyatları 2026", "İstanbul arsa m2 fiyatı",
      "Beykoz arsa fiyatı", "Silivri arsa", "Şile arsa fiyatı",
      "Çatalca arsa", "Tuzla arsa", "İstanbul yatırım ilçeleri",
    ],
    icerik: `
<p class="lead">İstanbul'da arsa fiyatları ilçeden ilçeye 3–10 kat arasında değişiyor. Bu analizde Avrupa ve Anadolu yakasındaki ilçeleri karşılaştırıyor, hangi bölgenin neden yükseldiğini veri odaklı açıklıyoruz.</p>

<h2>İstanbul'da Arsa Fiyatını Belirleyen 4 Faktör</h2>
<ul>
  <li><strong>İmar durumu:</strong> Konut imarı olan arsa, aynı mahallede sıfır imarlıya göre 3–5× daha değerli.</li>
  <li><strong>Altyapı mesafesi:</strong> Metro/metrobüs hattına 2 km içinde olması fiyatı %30–60 artırıyor.</li>
  <li><strong>OSB ve sanayi yakınlığı:</strong> Tuzla, Gebze koridorunda sanayi/lojistik talebi yüksek.</li>
  <li><strong>İstanbul sınırına yakınlık:</strong> Belediye sınırı içinde olmak tek başına %20–40 prim sağlıyor.</li>
</ul>

<h2>Anadolu Yakası — İlçe Karşılaştırması</h2>

<h3>Beykoz</h3>
<p>Orman ve doğal sit alanı yoğunluğu nedeniyle yapılaşma kısıtlı. Korunan bölge dışındaki imarlı arsalar 25.000–60.000 TL/m² bandında. Uzun vadeli baskı yüksek ama imar riski taşıyor.</p>

<h3>Şile</h3>
<p>E-80 bağlantısı ve sahil konumu avantajlı. Boş arsa 8.000–20.000 TL/m²; imarlı sahil yakını 30.000 TL/m²'yi geçiyor. Yatırım aktivitesi son 2 yılda %40 arttı.</p>

<h3>Tuzla</h3>
<p>Sanayi/lojistik bölgesi. Konut imarı sınırlı, ticari/sanayi imarı yüksek değerli. 15.000–35.000 TL/m² bandı; OSB yakını parsellerde 50.000 TL/m²'yi geçiyor.</p>

<h3>Pendik / Kartal</h3>
<p>Yoğun konut dönüşümü. Boş arsa bulmak giderek zorlaşıyor; bulunanda 40.000–80.000 TL/m² seviyesi var.</p>

<h2>Avrupa Yakası — İlçe Karşılaştırması</h2>

<h3>Silivri</h3>
<p>Trakya'ya geçiş noktası. Tarla/bahçe stoku hâlâ mevcut: 3.000–8.000 TL/m². İmarlı arsa 12.000–25.000 TL/m². Lojistik koridoru etkisiyle son 3 yılda en hızlı değerlenen ilçelerden biri.</p>

<h3>Çatalca</h3>
<p>Boş tarla stoğu geniş, fiyatlar Silivri'den düşük: 2.000–6.000 TL/m². Altyapı yatırımı yavaş ama büyük arazi pozisyonu için cazip.</p>

<h3>Büyükçekmece / Beylikdüzü</h3>
<p>Sahil hattı yoğun imar altında. Yeni boş arsa neredeyse kalmadı; mevcut stok 50.000–120.000 TL/m².</p>

<h2>Fiyat Doğrulama — Nasıl Yapılır?</h2>
<p>İlan fiyatı piyasa değeriyle aynı değildir. Kadastrum ile karşılaştırın: <a href="/sorgu">web sorgu</a> veya eklenti üzerinden mahalle medyanını görün. Emsal fiyatı 3 yıldan eski ise güvenmek riskli.</p>

<div class="cta-box">
  <h3>İstanbul ilçe verisi</h3>
  <p>39 ilçenin mahalle bazlı TL/m² verisi Cadastrum'da.</p>
  <p><a href="/veri/istanbul" class="btn-primary">İstanbul verisine bak →</a></p>
</div>

<h2>Sıkça Sorulanlar</h2>
<h3>İstanbul'da en ucuz arsa hangi ilçede?</h3>
<p>2026 itibarıyla Çatalca ve Silivri en düşük fiyatlı ilçeler. Ancak "ucuz" ile "değerlenecek" aynı şey değil — altyapı projeksiyonuna bakın.</p>
<h3>İstanbul arsa almak için en iyi zaman ne?</h3>
<p>Arsa yatırımı zamanlama değil lokasyon ve imar ağırlıklı bir karar. Fiyat bandını doğru okumak, "ne zaman" sorusundan daha önemli.</p>
`,
  },

  // ── 8. Ankara Arsa Fiyatları 2026 ─────────────────────────────
  {
    slug: "ankara-arsa-fiyatlari-2026",
    baslik: "Ankara Arsa Fiyatları 2026 — İlçe ve Mahalle Analizi",
    aciklama: "Ankara'da arsa ve tarla fiyatları 2026: Çankaya, Etimesgut, Sincan, Kazan, Polatlı karşılaştırması. Cadastrum mahalle bazlı TL/m² verisi.",
    kategori: "analiz",
    yayinTarihi: "2026-07-21",
    okumaSuresi: 8,
    yazar: "Cadastrum",
    keywords: [
      "Ankara arsa fiyatları 2026", "Ankara arsa m2 fiyatı",
      "Kazan arsa", "Polatlı arsa", "Sincan arsa fiyatı",
      "Etimesgut arsa", "Ankara yatırım ilçeleri",
    ],
    icerik: `
<p class="lead">Ankara arsa piyasası İstanbul'dan farklı dinamiklerle hareket ediyor: devlet kurumu yatırımları, OSB genişlemesi ve kuzey gelişim aksı belirleyici. Bu analizde 2026 verisiyle ilçe karşılaştırması yapıyoruz.</p>

<h2>Ankara'da Arsa Değerini Belirleyen Faktörler</h2>
<ul>
  <li><strong>Kuzey gelişim aksı:</strong> Çayyolu–Törekent–İncek koridoru son 5 yılın en hızlı büyüyeni.</li>
  <li><strong>OSB ve Teknokent yakınlığı:</strong> Ostim, İvedik, Sincan OSB çevresinde sanayi imarı yüksek değerli.</li>
  <li><strong>Devlet yatırım kararları:</strong> Ankara'da büyük kamu projeleri ani fiyat sıçraması yaratabilir.</li>
  <li><strong>Konut açığı:</strong> Ankara nüfusu büyürken konut arzı yetersiz — özellikle batı ilçelerinde baskı var.</li>
</ul>

<h2>Merkezi İlçeler</h2>

<h3>Çankaya</h3>
<p>Yüksek değerli konut bölgesi. Boş imarlı arsa son derece nadir, mevcut stok 25.000–70.000 TL/m².</p>

<h3>Etimesgut</h3>
<p>Hızlı büyüyen konut ilçesi. Boş arsa stoğu azalıyor: 12.000–30.000 TL/m². Metro hattı tamamlanınca ek değer bekleniyor.</p>

<h2>Gelişim İlçeleri</h2>

<h3>Kazan</h3>
<p>Ankara'nın kuzeyinde sanayi ve lojistik geçiş noktası. Tarla stoğu geniş: 3.000–8.000 TL/m². Organize sanayi büyümesiyle talep artıyor.</p>

<h3>Polatlı</h3>
<p>Tarım arazisi yoğun, TL/m² en düşük ilçelerden biri: 1.500–4.000 TL/m². Ankara–İstanbul hızlı tren güzergahında yer alması uzun vadeli potansiyel sunuyor.</p>

<h3>Sincan</h3>
<p>Sanayi ağırlıklı: 8.000–18.000 TL/m². OSB yakını parseller daha yüksek. Konut talebi sınırlı.</p>

<h2>Ankara Arsa Veri Kaynakları</h2>
<p>Mahalle bazlı fiyatlar için <a href="/veri/ankara">Ankara veri sayfası</a> ve <a href="/sorgu">sorgu aracı</a> kullanın. İmar durumu için e-Plan zorunlu.</p>

<div class="cta-box">
  <h3>Ankara mahalle verisine eriş</h3>
  <p><a href="/veri/ankara" class="btn-primary">Ankara arsa fiyatları →</a></p>
</div>

<h2>Sıkça Sorulanlar</h2>
<h3>Ankara'da en çok değerlenen ilçe hangisi?</h3>
<p>Son 3 yılda Etimesgut ve Sincan koridoru. Orta vadede Kazan ve Polatlı potansiyel taşıyor.</p>
<h3>Ankara'da tarla alınır mı?</h3>
<p>Polatlı ve Kazan'da tarla stoğu var. Tarla yatırımı uzun vade (5–10 yıl) gerektiriyor; imar beklentisi olmadan alınmamalı.</p>
`,
  },

  // ── 9. Deprem Bölgesinde Arsa ──────────────────────────────────
  {
    slug: "deprem-bolgesinde-arsa-alinir-mi-2026",
    baslik: "Deprem Bölgesinde Arsa Alınır mı? Risk Değerlendirme Rehberi 2026",
    aciklama: "Türkiye'nin deprem haritasında Z1–Z5 zonlar nedir? Deprem riski yüksek bölgede arsa alırken nelere dikkat etmeli? AFAD PGA değeri nasıl yorumlanır?",
    kategori: "rehber",
    yayinTarihi: "2026-07-21",
    okumaSuresi: 10,
    yazar: "Cadastrum",
    keywords: [
      "deprem bölgesinde arsa", "deprem riski arsa yatırımı",
      "AFAD deprem haritası arsa", "PGA değeri nedir",
      "deprem zonu arsa değeri", "Z1 deprem bölgesi arsa",
      "Hatay arsa", "Kahramanmaraş arsa yatırımı",
    ],
    icerik: `
<p class="lead">Türkiye'nin %95'i deprem tehlike haritasında yer alıyor. Bu, "deprem riski var mı?" sorusunu anlamsız kılıyor — asıl soru "ne kadar risk, ne kadar fiyat iskontosuna yansımış?" olmalı.</p>

<h2>AFAD Deprem Tehlike Haritası Nasıl Okunur?</h2>
<p>Türkiye Deprem Tehlike Haritası (TDTH 2018), koordinat bazlı PGA (Peak Ground Acceleration) değerleri sunar. PGA g cinsinden ifade edilir:</p>

<ul>
  <li><strong>PGA < 0.10g:</strong> Düşük tehlike (iç Anadolu'nun bazı bölgeleri)</li>
  <li><strong>PGA 0.10–0.20g:</strong> Orta tehlike</li>
  <li><strong>PGA 0.20–0.40g:</strong> Yüksek tehlike (İstanbul, İzmir, Bursa)</li>
  <li><strong>PGA > 0.40g:</strong> Çok yüksek tehlike (Hatay, Kahramanmaraş, Erzincan)</li>
</ul>

<h2>Deprem Riski Arsa Fiyatını Nasıl Etkiler?</h2>
<p>Piyasa her zaman riski tam olarak fiyatlamaz. 2023 Kahramanmaraş depremi sonrası bazı gözlemler:</p>
<ul>
  <li>Z1 bölgelerde arsa fiyatları kısa vadede %20–40 düştü.</li>
  <li>Yeniden yapılanma sürecinde talep arttı, fiyatlar kısmen toparlandı.</li>
  <li>Kurumsal alıcılar risk iskontosu uyguluyor; bireysel alıcılar çoğu zaman uygulamıyor.</li>
</ul>

<h2>Deprem Bölgesinde Arsa Alırken Kontrol Listesi</h2>
<ol>
  <li><strong>PGA değerini öğren:</strong> AFAD TDTH veya Cadastrum'da koordinat bazlı deprem riski görün.</li>
  <li><strong>Zemin etüdü sorgula:</strong> Fay hattına mesafe, likefaksiyon riski, dolgu zemin sorunu.</li>
  <li><strong>İmar kısıtı kontrol et:</strong> Fay tampon bölgesinde yapılaşma yasaklı olabilir.</li>
  <li><strong>Sigorta maliyeti hesapla:</strong> Yüksek riskli bölgelerde DASK primleri ve yapı sigortası daha yüksek.</li>
  <li><strong>Emsal fiyatı karşılaştır:</strong> Aynı m² için düşük riskli alternatif varsa iskonto yeterli mi?</li>
</ol>

<h2>Risk Skontosunun Makul Olduğu Durumlar</h2>
<p>Deprem riski yüksek bölgede arsa almak anlamsız değil — önemli olan doğru fiyatla almak:</p>
<ul>
  <li>Fiyat aynı büyüklükte düşük riskli parsele göre %30+ daha ucuzsa iskonto çekici olabilir.</li>
  <li>Bölgede devlet yeniden yapılanma teşviki varsa (afet bölgesi ilan edilmiş) ek fırsat doğabilir.</li>
  <li>Tarımsal kullanım için deprem riski konut riskinden farklı değerlendirilmeli.</li>
</ul>

<h2>Cadastrum ile Deprem Riski Analizi</h2>
<p>Eklenti üzerinden her parsel için AFAD TDTH PGA değeri otomatik hesaplanır. Deprem zonu, fiyat motorunda çarpan olarak kullanılır — yüksek riskli bölgede fiyat bandı buna göre düzeltilir.</p>

<div class="cta-box">
  <h3>Parselin deprem riskini öğren</h3>
  <p>AFAD TDTH verisiyle koordinat bazlı PGA analizi.</p>
  <p><a href="/sorgu" class="btn-primary">Deprem riski sorgula →</a></p>
</div>

<h2>Sıkça Sorulanlar</h2>
<h3>Hatay'da arsa alınır mı 2026?</h3>
<p>Teknik olarak alınabilir. Ancak PGA > 0.40g, yeniden yapılanma sürecinde belirsizlik ve yüksek sigorta maliyeti göz önünde tutulmalı. Risk toleransınıza ve fiyata göre karar verin.</p>
<h3>Deprem riski olan bölgede tarla alınır mı?</h3>
<p>Tarımsal kullanım için deprem riski genelde ikincil faktör. Zemin tipi (çatlak, fay) tarım verimliliğini etkileyebilir ama yapı güvenliği kadar kritik değil.</p>
`,
  },

  // ── 10. Hisseli Arsa Riskleri ──────────────────────────────────
  {
    slug: "hisseli-arsa-riskleri-2026",
    baslik: "Hisseli Arsa Riskleri 2026 — Alırken Dikkat Edilmesi Gerekenler",
    aciklama: "Hisseli arsa nedir, riskleri neler? Önalım hakkı, paydaş anlaşmazlığı, izale-i şuyu davası. Hisseli arsa alırken Cadastrum ile nasıl kontrol yapılır?",
    kategori: "rehber",
    yayinTarihi: "2026-07-21",
    okumaSuresi: 9,
    yazar: "Cadastrum",
    keywords: [
      "hisseli arsa riskleri", "hisseli tapu sorunları",
      "izale-i şuyu nedir", "şuyulandırma davası",
      "önalım hakkı arsa", "hisseli arsa satışı",
      "ortak arsa nasıl satılır",
    ],
    icerik: `
<p class="lead">Türkiye'deki arsa ilanlarının önemli bir bölümü hisseli tapulu parsellerdir. Düşük fiyatı cazip görünse de hisseli arsa, dikkatli incelenmediğinde ciddi hukuki ve finansal riskler taşıyor.</p>

<h2>Hisseli Arsa Nedir?</h2>
<p>Bir parselin birden fazla kişi adına tescilli olduğu tapu şeklidir. Her ortak parselin belirli bir payına (örn. 1/4) sahiptir; ancak bu pay, fiziksel olarak belirli bir köşeye işaret etmez — tüm parselde paylı mülkiyet söz konusudur.</p>

<h2>Başlıca Riskler</h2>

<h3>1. Önalım Hakkı (Şüf'a)</h3>
<p>Diğer paydaşların, parseldeki herhangi bir hisseyi satın alma önceliği vardır. Siz hisseyi alıp tapu devri yaptıktan sonra diğer paydaş <strong>3 ay içinde aynı fiyatla sizin yerinize geçebilir</strong> — yani paranızı alırsınız ama parsellerden çıkarılırsınız.</p>

<h3>2. İzale-i Şuyu Davası</h3>
<p>Herhangi bir paydaş ortaklığın giderilmesi (izale-i şuyu) davası açabilir. Dava kazanılırsa parsel <strong>cebri satışa</strong> çıkar — genellikle piyasa değerinin altında. Birden fazla paydaş varsa bu risk sürekli mevcut.</p>

<h3>3. Yapılaşma Engeli</h3>
<p>Parsele yapı yapabilmek için <strong>tüm paydaşların rızası</strong> gereklidir. Bir paydaş uyuşmazlık çıkarırsa inşaat mümkün olmaz.</p>

<h3>4. Parçalanmış Kullanım</h3>
<p>Hissenize karşılık gelen fiziksel alanı belirlemeniz (ifraz) için yine tüm paydaş onayı veya mahkeme kararı gerekir.</p>

<h2>Hisseli Arsa Alırken Kontrol Listesi</h2>
<ol>
  <li>TKGM'den veya <a href="/sorgu">Cadastrum</a>'dan tapu bilgisini doğrula — paydaş sayısı ve pay oranları.</li>
  <li>Diğer paydaşlardan önalım hakkı feragati yazılı al (noter onaylı).</li>
  <li>İzale-i şuyu davası açık olup olmadığını UYAP üzerinden sorgula.</li>
  <li>Parselin imar durumunu e-Plan'dan kontrol et — hisseli arsa çoğu zaman kentsel dönüşüm kapsamında.</li>
  <li>Fiyatı benzer imarlı, tam mülkiyetli parselle karşılaştır — hisse iskontosu gerçekçi mi?</li>
</ol>

<h2>Ne Zaman Mantıklı Olabilir?</h2>
<p>Tüm paydaşlarla aynı anda satın alma yapabilecekseniz (tüm hisseleri birleştirecekseniz), hisseli parseller büyük fırsat sunabilir. Parseli "toparlayabilme" kapasitesi olmadan tek hisse almak riskli.</p>

<div class="cta-box">
  <h3>Parsel bilgisini doğrula</h3>
  <p>TKGM verisiyle tapu, pay ve imar kontrolü.</p>
  <p><a href="/sorgu" class="btn-primary">Parseli sorgula →</a></p>
</div>

<h2>Sıkça Sorulanlar</h2>
<h3>Hisseli arsa satın aldım, diğer paydaş ne yapabilir?</h3>
<p>3 ay içinde şüf'a (önalım) hakkını kullanabilir. Kullanmazsa siz paydaş olursunuz. Ancak herhangi bir zamanda izale-i şuyu davası açabilir.</p>
<h3>Hisseli arsa ucuz neden?</h3>
<p>Hukuki karmaşıklık, likidite düşüklüğü ve potansiyel dava riski fiyatı aşağı çekiyor. İskonto gerçek — ama risk de gerçek.</p>
`,
  },
];
