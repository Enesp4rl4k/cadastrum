# Türkiye Gayrimenkul Tech Pazarı — Rekabet Analizi

**Tarih**: 9 Mayıs 2026
**Hazırlayan**: Cadastrum (Claude cowork ile)
**Amaç**: Cadastrum'un pazardaki konumunu tespit, rakiplerden öğrenilecek dersleri çıkarmak

---

## 📊 PAZAR ÖZETİ

Türkiye'de **150-200 PropTech startup** aktif. Pazar segmentleri:
1. **İlan platformları** (Sahibinden, Hepsiemlak, Emlakjet) — 30M+ ziyaretçi/ay
2. **Değerleme/analiz** (Endeksa, REIDIN, EmlakIQ) — 4M+ değerleme yapıldı
3. **Chrome eklentileri** (Sahibinden Parsel Sorgu, EvSkoru, vd.) — niche araç
4. **B2B kurumsal araçlar** (banka değerleme, profesyonel raporlar)

**Türkiye gayrimenkul ortalama m² fiyatı (Mart 2026)**: 40.380 TL — yıllık ~1M konut işlemi.

---

## 🎯 BİREYSEL RAKİPLER

### 1. Endeksa — Pazar Lideri 🥇

**Konum**: Türkiye'nin en büyük emlak değerleme platformu

**Güçlü yönleri:**
- 4 milyondan fazla e-değerleme yapılmış
- Atlas — yapay zeka emlak asistanı (konuşarak değerleme)
- Yatırım Skoru özelliği
- Mobil app (iOS + Android)
- Emlakjet partnerliği (15M+ ziyaretçi/ay erişim)
- Yıllık değer raporu yayınlıyor (PR/brand boost)
- 10 yıllık brand awareness

**Fiyatlandırma:**
- **Standard**: ₺99/ay → 3 rapor/gün
- **Kurumsal**: ₺399/ay → sınırsız rapor

**Zayıf yönleri:**
- ❌ Web/mobil-only — Sahibinden ilan akışında değil
- ❌ Manual address girişi — kullanıcı parsel/koordinat aramalı
- ❌ TKGM resmi entegrasyonu yok (sadece kendi DB'si)
- ❌ e-Plan imar bilgisi yok
- ❌ %13 hata payı (İstanbul için bile)
- ❌ Sahte ilan tespiti yok

**Cadastrum vs Endeksa:**
- 🟢 Cadastrum daha **doğru** (TKGM resmi kaynak)
- 🟢 Cadastrum **akış-içinde** (ilan açar açmaz)
- 🟢 Cadastrum **daha kapsamlı** (TKGM + e-Plan + risk + AI)
- 🔴 Endeksa **brand**, **mobile**, **conversational AI** önde

### 2. Emlakjet — İlan Platformu

**Konum**: Sahibinden alternatifi ilan sitesi

**Özellikler:**
- 60M sayfa görüntülenme/ay
- 15M ziyaretçi/ay
- Endeksa entegrasyonu (alan değer raporları)
- Akıllı arama kayıtları
- Harita destekli arama

**Cadastrum'a etkisi**:
- Emlakjet **kanal** (Cadastrum onun ilanlarını da analiz edebilir, ileride content_script eklenebilir)
- Endeksa partnerliği nedeniyle rekabet **dolaylı**

### 3. REIDIN — Kurumsal B2B

**Konum**: Premium kurumsal analitik

**Özellikler:**
- Çeyreklik gayrimenkul güven endeksi
- Konut fiyat endeksleri
- Premium B2B/kurumsal abonelik
- 25+ yıllık marka

**Pazar segmenti**: Bankalar, GYO'lar, kurumsal yatırımcılar — **Cadastrum'ın hedef pazarı değil**

### 4. EmlakIQ — Yeni AI Platform

**Konum**: AI tahmine dayalı emlak yatırım analizi (Q4 2025 lansmanı)

**Özellikler:**
- 6-12 ay önceden pazar tahminleri (ML modelleri)
- Bölge puanlama (50+ gösterge, 1-100 skor)
- Gerçek zamanlı uyarılar
- TÜİK + TCMB + TOKİ veri kaynakları
- Hedef: kurumsal yatırımcılar, geliştiriciler, fonlar

**Cadastrum vs EmlakIQ:**
- 🟢 Cadastrum daha **operasyonel** (her ilanı analiz)
- 🟢 EmlakIQ daha **stratejik** (12 ay tahmin, B2B yatırım fonu)
- 🔴 Hedef kitleler farklı, doğrudan rakip değil

---

## 🧩 CHROME EXTENSION RAKİPLERİ (Türkiye)

### 1. Sahibinden Parsel Sorgu — TKGM Otomatik Sorgulama
*ID: `cfafacnhnlafajjfnmfmmkdcgaemimje`*

**Durum**: En yakın rakip. Sahibinden, Hepsiemlak, Emlakjet, Milli Emlak, ilanlar.com'da TKGM otomatik sorgu yapar.

**Güçlü yönleri:**
- ⭐ 5.0/5 rating
- TKGM resmi sorgu otomasyonu (bizim core feature aynı)
- Çoklu site desteği

**Zayıf yönleri:**
- ❌ Sadece TKGM (e-Plan, fiyat, risk YOK)
- ❌ Mahalle medyan fiyat YOK
- ❌ AI tahmin YOK
- ❌ Sidepanel UI yok (basit popup)
- ❌ Lojistik/risk skor YOK

**Cadastrum'ın avantajı**: 6+ feature kat fazla. Onlar TKGM-only, biz **all-in-one**.

### 2. EvSkoru for Sahibinden
*ID: `ehpbdgmeonpifdbkfdbimehpdlnhpjcf`*

**Durum**: Niche skor aracı, **27 kullanıcı** (çok küçük)

**Özellikler:**
- Konum bazlı evskoru
- Fay hattı, ulaşım, eğitim, gürültü skoru
- Sahibinden için

**Cadastrum'a karşı**: Risk modülümüz daha kapsamlı. Onlar rakip bile değil.

### 3. Diğerleri (zayıf rakipler)
- **Parsel Bilgi Bulucu** — koordinat bazlı parsel, çok basit
- **Parsel DXF** — DXF formatı dönüştürücü, niche
- **Sahibinden Fiyat Geçmişi** — sadece fiyat trendi (potansiyel feature olarak ekleyebiliriz)
- **Sahibinden Extra** — UI iyileştirme, kapsamlı analiz yok

---

## 🌍 GLOBAL ÖRNEKLER (İlham Kaynakları)

### PropFly — Zillow için
**Model**: Chrome extension, Zillow listing analiz
**Öğrenilecek**: "Lightning-fast" branding — hız vurgu yapıyor

### REI Lense — Multi-platform
**Model**: Zillow, Redfin, Realtor için single tool
**Öğrenilecek**: Multi-platform genişlik (biz Sahibinden + Hepsiemlak yapıyoruz, ileride Emlakjet eklenebilir)

### Homeluten
**Model**: Mahalle bilgisi, suç haritası, gürültü, trafik overlay
**Öğrenilecek**: **Görsel overlay** Sahibinden harita üstüne basabilir (V2 için)

### Redfin & Zillow Analytics Extension
**Model**: "Deep Extract" — listing description, agent contact, full property facts pull
**Öğrenilecek**: **Toplu CSV export** ileride Pro feature olabilir

---

## 🏆 CADASTRUM'IN POZİSYONU

### Eşsiz Avantajlar (Türkiye'de hiç kimsede yok)
1. **TKGM + e-Plan + AI + Risk + Lojistik tek panelde** — tek "all-in-one"
2. **Sahibinden + Hepsiemlak ilan akışında otomatik** — kullanıcı manuel girmiyor
3. **Sahte ilan tespiti** — TKGM yoksa anında uyarı
4. **65.000 mahalle AI baseline** — kırsal/küçük şehir kapsama
5. **Çoklu kaynak triangulation** — tek kaynağa bağımlı değil
6. **Cross-validation bias düzeltmesi** — şeffaf metodoloji

### Rakipten Öğrenilecek Dersler

| Rakip | Cadastrum'da Eksik | Öncelik |
|---|---|---|
| Endeksa Atlas | Conversational AI ("Bebek'te bu fiyat normal mi?" sor) | YÜKSEK (V2) |
| Endeksa | Mobil app | DÜŞÜK (web yeterli ilk 6 ay) |
| Endeksa | Yatırım Skoru (1-100 skala) | ORTA (V2) |
| Endeksa | Brand awareness | KRİTİK (marketing) |
| EvSkoru | Fay hattı / deprem detayı | DÜŞÜK (zaten Risk var) |
| Sahibinden Fiyat Geçmişi | Bireysel ilan fiyat trendi | YÜKSEK (V2) |
| Homeluten | Map overlay (görsel) | ORTA (V3) |
| REI Lense | Multi-platform genişlik | DÜŞÜK (zaten 2 site) |
| EmlakIQ | 12 ay tahmin grafiği | ORTA (Pro+ için) |

### Fiyatlandırma Kıyaslama

| Plan | Cadastrum | Endeksa | EmlakIQ |
|---|---|---|---|
| Free | ₺0 (3 AI/gün, top 5 il) | ❌ Yok | ❌ Yok |
| Standart | ₺499/ay | ₺99/ay (3 rapor/gün) | ? |
| Kurumsal | ₺2.999/ay | ₺399/ay (sınırsız) | ? |

**🚨 Sorun**: Cadastrum Pro **5x pahalı**. Yeniden değerlendirme gerekebilir:
- Endeksa rapor başına çok az iş, biz **her ilanda otomatik analiz**
- Yine de psikolojik fiyat eşiği önemli — ₺199 veya ₺299 daha yumuşak girer

**Öneri**:
- Pro **₺249/ay** → giriş kolaylaştır
- Pro+ **₺499/ay** → mevcut özellikler + AI sınırsız + PDF
- Kurumsal **₺1.999/ay** → ekip + brand + öncelikli destek

---

## 🎯 STRATEJİK ÖNERİLER

### 1. Konumlandırma (positioning)

Mevcut: "Parsel Zekâsı"
Öneri (rakipten farklılaşmak için):

> "Türkiye'nin tek **ilan-first** gayrimenkul AI eklentisi"
> Endeksa = Web rapor (manuel, ayrı sekme)
> Cadastrum = İlan açar açmaz analiz (otomatik, akış-içinde)

### 2. Marketing Mesajları

**Endeksa kullananlara**:
> "Endeksa raporu için 5 sekme açıyor musun? Cadastrum ilanı açar açmaz aynı analizi yan panelde gösterir + TKGM resmi doğrulama bonus."

**Sahibinden Parsel Sorgu kullananlara**:
> "Sadece TKGM yetmez. Cadastrum: TKGM + e-Plan imar + mahalle medyanı + AI + risk — hepsi birden, ücretsiz."

**EvSkoru kullananlara**:
> "27 kullanıcılı bir araç yerine, 65.000 mahalle data tabanlı tam çözüm."

### 3. SEO Hedef Keyword'ler (rakip analizinden)

Hedef long-tail (rakip zayıf, biz öne çıkabiliriz):

- "sahibinden ilan analiz eklentisi"
- "TKGM otomatik sorgu chrome"
- "arsa fiyat tahmin uygulama"
- "ilan parsel doğrulama"
- "e-Plan imar sorgu kolay"
- "Endeksa alternatifi"
- "mahalle bazlı arsa fiyatı"

### 4. Feature Roadmap (rekabete göre öncelik)

**Q2 2026 (yakın)**:
- ✅ Conversational AI ("ilanı analiz et" → doğal dil sorgu) — Endeksa Atlas paritesi
- ✅ Yatırım Skoru (1-100, görsel) — kullanıcı kararını netleştirir
- ✅ İlan fiyat geçmişi (Sahibinden Fiyat Geçmişi paritesi)

**Q3 2026**:
- Mobile companion app (kayıtlı parsel görüntüleme + bildirim)
- Map overlay (Sahibinden harita üstüne çizgili katman)
- Toplu CSV export (Pro)

**Q4 2026 / 2027**:
- 12 ay tahmin grafiği (EmlakIQ paritesi)
- Banka değerleme entegrasyonu
- B2B kurumsal panel (multi-user, brand'lı PDF)

---

## 📈 PAZAR DENEYİMİ (Customer Discovery için Sorular)

Bu rakip analizi sonrası emlakçı/yatırımcılarla yapılacak görüşmelerde:

1. "Şu an arsa/konut analizi için hangi araçları kullanıyorsun?"
2. "Endeksa kullanıyor musun? Ne için, neyi eksik buluyorsun?"
3. "Sahibinden'de ilan açtığında ek bilgi (TKGM, imar) için ne yapıyorsun?"
4. "₺200/ay ile ₺500/ay bir araç için fiyat eşiğin ne?"
5. "Mobile mı web mi browser extension mı tercih edersin?"

---

## 🔑 ANA SONUÇ

**Cadastrum'ın pazardaki yeri:**

- Hiç kimse **all-in-one ilan analizi** yapmıyor
- Endeksa pazar lideri ama **akış-dışı** (manual)
- Chrome extension rakipleri **single-feature** (sadece TKGM veya skor)
- Pazar boyutu **büyük** (1M yıllık konut işlemi, 60M Sahibinden ziyaretçisi)

**Stratejik karar noktası:**

İki yol var:
1. **Hızlı follower** ol → Endeksa'nın Atlas, Yatırım Skoru gibi feature'ları taklit et, brand kazan
2. **Kategori yarat** → "İlan-First Real Estate AI" — yeni bir kategori, owned position

**Önerim**: 2'ye git. "Endeksa rakibi" demek yerine "Endeksa'nın yapamadığı şey" de.

> "Endeksa: rapor üretir. Cadastrum: ilanı analiz eder."

---

## 🔗 KAYNAKLAR

- [REIDIN 2026 Q1 Endeks](https://reidin.com/tr/reidin-turkiye-gayrimenkul-sektoru-guven-endeksi-ve-fiyat-beklenti-endeksi-2026-1-ceyrek-donem-sonuclari/)
- [Endeksa Mart 2026 Konut Değer Raporu](https://www.gayrimenkulhaber.com/guncel/endeksa-ve-emlakjetin-hazirladigi-mart-2026-konut-deger-raporu-satis-hacmi-buyuksehirlerde-yogunlasirken-reel-fiyat-artisi-sinirli-kaldi/)
- [Endeksa Atlas AI Tanıtım](https://www.aa.com.tr/tr/isdunyasi/hizmet/endeksadan-yapay-zeka-emlak-asistani-atlas/691744)
- [EmlakIQ Platform](https://emlakiq.com/en/)
- [Sahibinden Parsel Sorgu Chrome Eklentisi](https://chromewebstore.google.com/detail/sahibinden-parsel-sorgula/cfafacnhnlafajjfnmfmmkdcgaemimje)
- [EvSkoru Chrome Eklentisi](https://chromewebstore.google.com/detail/evskoru-for-sahibinden/ehpbdgmeonpifdbkfdbimehpdlnhpjcf)
- [TKGM Parsel Sorgu](https://parselsorgu.tkgm.gov.tr/)
- [Türkiye PropTech Genel](https://kurums.com/proptech/)
