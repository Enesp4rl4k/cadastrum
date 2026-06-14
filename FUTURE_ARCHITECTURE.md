# Arsa-TKGM Yeni Nesil Değerleme Mimarisi Önerisi

Bu doküman, mevcut "Heuristic & Static Baseline" modelinden daha sağlıklı, veriye dayalı (Data-driven) ve ölçeklenebilir bir mimariye geçiş için yol haritasını içerir.

## 1. Mevcut Sistemin Limitleri
- **Statik Veri Bağımlılığı:** `ilce-baseline.ts` dosyası manuel güncellenmek zorundadır ve enflasyonist ortamda hızla eskir.
- **Kaba Filtreleme:** Sadece "Mahalle" ve "İlçe" isimlerine odaklanmak, sınır bölgelerindeki (iki mahalle arası) emsalleri kaçırır.
- **Double Counting Riski:** Statik baseline ile dinamik çarpanların (nitelik/imar) çakışması bazen hatalı "aşırı indirimlere" sebep olabilir.

## 2. Önerilen Yeni Mimari: "Spatial & Dynamic Synthesis"

### A. GIS (Yarıçap) Tabanlı Emsal Ağırlıklandırma
- **Mahalle Bağımsızlığı:** Parselin etrafına 3km, 5km ve 10km'lik halkalar çizilir.
- **Distance Decay (Mesafe Kaybı):** Parselin dibindeki bir ilan tahmini %100 etkilerken, 5km ötedeki bir ilan %20 etkiler.
- **Isı Haritası (Heatmap):** Bölgedeki ilan yoğunluğuna göre "sıcak" ve "soğuk" fiyat bölgeleri otomatik oluşur.

### B. Çok Kaynaklı (Multi-Source) Veri Havuzu
- **Resmi Satışlar:** Milli Emlak ve Belediye ihale sonuçlarının (mümkünse) sisteme dahil edilmesi.
- **Banka Portföyleri:** Bankaların (Ziraat, Vakıf vb.) satışa çıkardığı gayrimenkullerin "dip fiyat" (floor price) olarak kullanılması.
- **Platform Entegrasyonu:** Sahibinden + Hepsiemlak + Emlakjet verilerinin tek bir "Normalized Data Schema" altında birleştirilmesi.

### C. Akıllı Semantik Filtreleme
- **Hisse Kontrolü:** İlan metninde "hisseli", "paylı", "intikal" gibi kelimeler geçen ilanların otomatik elenmesi veya %30-50 iskonto ile işlenmesi.
- **Doğrulanmış Emsal:** Kullanıcılar tarafından "Bu ilan gerçekçi / Bu ilan sahte" diye işaretlenen ilanların sistem güven puanını artırması/azaltması.

### D. Hibrit Tahmin Motoru (Heuristic + ML)
- **Baseline Kurtuluşu:** Statik dosyalar yerine, o anki canlı emsal havuzunun "Weighted Median" (Ağırlıklı Medyan) değerinin baz alınması.
- **Öğrenen Çarpanlar:** Yolun, suyun ve imarın fiyat üzerindeki etkisinin sabit rakamlar değil, toplanan veriler üzerinden regresyonla hesaplanması.

## 3. Uygulama Adımları
1. **Adım:** `db.ilanGozlem` tablosuna koordinat bazlı indeksleme eklenmesi.
2. **Adım:** `bolgeBaseliniGetir` fonksiyonunun mahalle yerine yarıçap sorgusu yapacak şekilde güncellenmesi.
3. **Adım:** Merkezi bir veritabanı (Supabase) ile anonimleştirilmiş emsal havuzunun tüm kullanıcılarla paylaşılması.

---
*Hazırlayan: Antigravity AI*
*Tarih: 2026-05-04*
