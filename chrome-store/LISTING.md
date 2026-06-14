# Chrome Web Store Listing — Cadastrum

## 1. STORE LISTING METADATA

### Item name (max 75 char)
```
Cadastrum — Arsa & TKGM Parsel Zekâsı
```

### Summary / Short description (max 132 char)
**Türkçe:**
```
TKGM resmi parsel doğrulama, e-Plan imar sorgusu ve AI fiyat tahmini — Sahibinden ve Hepsiemlak ilanları için tek tıkla.
```

**English (opsiyonel):**
```
Turkish real estate parcel verification, zoning lookup and AI price prediction — one click from Sahibinden & Hepsiemlak.
```

### Category
```
Productivity
```

(Alternative: Tools, Shopping)

### Language
```
Turkish (primary), English (opsiyonel ek)
```

---

## 2. DETAYLI AÇIKLAMA (max 16,000 char)

```
🏠 CADASTRUM — TÜRKİYE'NİN İLK GAYRIMENKUL YATIRIMCISI İÇİN PARSEL ZEKÂSI

Sahibinden ve Hepsiemlak'ta ilan açar açmaz Cadastrum devreye girer. TKGM resmi
kayıtlardan parselin doğrulamasını yapar, e-Plan'dan imar bilgisini çeker, 65.000
mahalle veritabanı üzerinden AI destekli fiyat tahmini sunar. Tek tıkla.

═══ TEMEL ÖZELLİKLER ═══

🗺️ TKGM RESMİ PARSEL DOĞRULAMA
- Sahibinden/Hepsiemlak ilanı açıldığında otomatik tespit
- Ada, parsel, alan, nitelik, malik tipi TKGM kayıtlarından
- Sahte ilan tespiti: TKGM'de olmayan yer = anında uyarı
- Resmi parsel sınırları interaktif harita üzerinde

📐 e-PLAN İMAR SORGUSU
- Tüm Türkiye e-Plan portal entegrasyonu
- Kullanım kararı: konut / ticaret / tarım / endüstri / sit
- TAKS, Emsal (KAKS), maksimum kat sayısı
- Plan revizyon geçmişi ve geçerlilik tarihi

🤖 AI FIYAT TAHMINI
- 65.000 mahalle için AI destekli baseline
- Gemini 2.5 Flash + Llama 3.3 70B fallback
- KNN coğrafi yumuşatma + cross-validation
- TCMB Konut Fiyat Endeksi ile aylık güncel
- Sahil, metro, üniversite, anayol yakınlığı çarpanları

📊 CANLI EMSAL VERİSİ
- Sahibinden + Hepsiemlak'tan canlı medyan
- Tukey IQR ile outlier temizliği
- Aylık trend grafiği — 6 ay geçmiş
- Komşu mahalle ve ilçe karşılaştırması
- Anonim topluluk verisi (opt-in)

⚠️ RİSK ANALİZİ
- AFAD deprem zonu (Z1-Z5) analizi
- Çevre Bakanlığı taşkın risk haritası
- Heyelan ve sel hassasiyeti
- 100 yıllık afet risk skoru

🚀 LOJİSTİK SKOR
- Devlet yolu, otoyol, demiryolu mesafesi
- Havalimanı, liman, sanayi alanı erişimi
- Şehir merkezine süre/mesafe
- Kamu hizmetleri (okul, hastane, market)

📈 PRO ÖZELLİKLER (opsiyonel abonelik)
- Sınırsız parsel sorgusu
- Detaylı PDF rapor (kurumsal kalite)
- Yatırım skoru + SWOT analizi
- Mahalle profili (demografik, sosyoekonomik)
- Trend tahmini (12 aylık projeksiyon)
- Veri export (CSV, JSON)
- Toplu listeleme analizi

═══ NEDEN CADASTRUM? ═══

🔒 GÜVENLİ
- TKGM, e-Plan, AFAD gibi resmi kaynaklar
- Veri tarayıcınızda kalır (sayfa açıldığında çalışır)
- Topluluk verisi anonim, opt-in
- KVKK uyumlu

⚡ HIZLI
- İlan açar açmaz analiz hazır
- Sayfa yüklenmesini engellemez
- Side panel'de paralel görüntü

🎯 DOĞRU
- TKGM birincil kaynak
- AI tahmini cross-validation ile bias düzeltmesi
- Çoklu kaynak triangulation (ilan + AI + banka değerleme)

═══ KİMLER İÇİN? ═══

✓ Arsa/konut yatırımcıları
✓ Gayrimenkul danışmanları
✓ Mimar, mühendis, harita uzmanları
✓ Müteahhitler ve müşavirler
✓ Çiftçiler ve tarım yatırımcısı
✓ Tapu işlemleri öncesi inceleme yapanlar

═══ GİZLİLİK ═══

Cadastrum kullanıcı verisini SATMAZ ve kişisel veri toplamaz.
- İlan verisi: Anonim agregasyon (mahalle medyanı için)
- Hesap verisi: Email + şifre hash (PBKDF2)
- Cookie kullanmıyoruz, tracking yok
- Tam gizlilik politikası: cadastrum.com.tr/gizlilik

═══ TEKNİK BİLGİ ═══

- Manifest V3 (Chrome modern API)
- Side Panel UI (Chrome 114+)
- Service Worker mimarisi
- Backend: Cloudflare Workers + D1
- Public source for transparency

═══ DESTEK ═══

📧 iletisim@cadastrum.com.tr
🌐 cadastrum.com.tr
🐦 @cadastrumtr (yakında)

İLK 100 ÜYE: ERKEN100 promosyon kodu ile 6 ay %40 indirim.
```

---

## 3. PERMISSIONS GEREKÇE (Single Purpose Description)

### Single purpose
```
Türkiye gayrimenkul ilanlarını (Sahibinden, Hepsiemlak) TKGM resmi parsel
verisi ve e-Plan imar bilgisi ile zenginleştirip AI destekli fiyat tahmini
sunan side panel uzantısı.
```

### Permissions justification

**`sidePanel`**: Analiz sonuçlarını yan panelde göstermek için (Chrome 114+ native side panel API).

**`storage`**: Kullanıcı ayarları (tercih edilen kaynak, AI key, harita türü) ve cache (parsel verisi 24 saat) için.

**`contextMenus`**: Sağ tık menüsünden parsel sorgusu başlatmak için ("Cadastrum'da analiz et").

**`tabs`**: Aktif sekmenin URL'sinden ilan tespiti yapmak için (Sahibinden/Hepsiemlak/e-Plan).

**`alarms`**: Periyodik veri yenileme (mahalle istatistik, TCMB endeksi 24 saatte bir).

**`declarativeNetRequest`**: TKGM origin header düzenlemesi (cross-origin sorgu için).

**Host permissions**: TKGM, e-Plan, Sahibinden, Hepsiemlak, OpenStreetMap (harita), TCMB (endeks), Open-Meteo (iklim), AFAD (deprem), Cadastrum API.

### Remote code use
```
NO — Hayır, hiç remote code execution yok. Tüm kod paketle gelir,
güncellemeler Web Store üzerinden.
```

---

## 4. PRIVACY POLICY URL
```
https://cadastrum.com.tr/gizlilik
```

## 5. SUPPORT URL
```
https://cadastrum.com.tr/iletisim
```

## 6. HOMEPAGE URL
```
https://cadastrum.com.tr
```

---

## 7. UPLOAD FILES (chrome-store/ klasörü)

✓ Icon 128×128: `dist/public/icon-128.png`
✓ Small Promo Tile (440×280): `chrome-store/promo-tile-440x280.png`
✓ Marquee Promo Tile (1400×560): `chrome-store/promo-tile-1400x560.png` *opsiyonel*
✓ Screenshots (1280×800):
  - `chrome-store/screenshot-1-tkgm.png`
  - `chrome-store/screenshot-2-eplan.png`
  - `chrome-store/screenshot-3-ai.png`
  - `chrome-store/screenshot-4-emsal.png`

✓ Extension ZIP: build sonrası `dist/` klasörünü ZIP'le

---

## 8. ZIP HAZIRLAMA

```cmd
cd C:\Users\parlak\Downloads\arsa-tkgm-extension
npm run build
cd dist
powershell Compress-Archive -Path * -DestinationPath ..\cadastrum-extension-v0.3.0.zip -Force
```

---

## 9. SUBMIT SONRASI

- **Inceleme süresi**: 1-3 gün (yeni geliştirici için)
- **İlk inceleme**: Manuel review (Google çalışanları)
- **Sonraki güncellemeler**: 1-24 saat (otomatik)
- **Ret nedenleri**: çoğunlukla privacy policy, permissions justification eksik
