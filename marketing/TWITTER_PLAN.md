# Twitter/X Tanıtım Planı

## Hesap Kurulumu

**Username**: `@cadastrumtr` (test et, alındıysa `@cadastrum_tr`)
**Display name**: `Cadastrum`
**Bio** (160 char max):
```
Türkiye'nin parsel zekâsı 🏠
TKGM doğrulama · e-Plan imar · AI fiyat · 65k mahalle baseline
Sahibinden + Hepsiemlak için Chrome eklentisi 👇
```

**Location**: `Türkiye`
**Website**: `cadastrum.com.tr`
**Profile photo**: `chrome-store/promo-tile-440x280.png` (V3 logo'lu)
**Header banner** (1500x500): yapılacak

---

## Pinned Tweet (Lansman günü)

```
Türkiye'de arsa/konut yatırımı yapacaksan ilanın gerçek olduğunu nasıl anlarsın?

Cadastrum — Sahibinden + Hepsiemlak ilanlarını TKGM kayıtları ile saniyede doğrular, e-Plan imarını çeker, 65 bin mahalle veritabanından AI fiyat tahmini sunar.

🔗 cadastrum.com.tr (Chrome eklentisi 🚀)
```

---

## İlk Hafta Tweet Thread'leri

### Tweet 1 — Launch announcement (gün 1)
```
🚀 Cadastrum bugün canlıya çıktı.

Türkiye gayrimenkul yatırımcısı için tasarlanmış Chrome eklentisi:
✓ TKGM resmi parsel doğrulama
✓ e-Plan imar sorgusu
✓ AI fiyat tahmini (65k mahalle)
✓ Sahibinden + Hepsiemlak entegrasyonu

Detaylar 🧵
```

### Tweet 2 — Problem
```
Türkiye'de arsa alacaksan 5 farklı sekme açıp 10 dakika harcıyorsun:

1️⃣ TKGM Parsel Sorgu
2️⃣ e-Plan İmar
3️⃣ Sahibinden emsal
4️⃣ Hepsiemlak emsal
5️⃣ Hesap makinesi

Her ilan için tekrar tekrar.
Tek tıkla halledilmeli — değil mi?
```

### Tweet 3 — Çözüm
```
Cadastrum açıkken Sahibinden ilanına girersin.

Yan panelde otomatik:
✅ TKGM kayıt doğrulaması
✅ Ada + parsel + alan + nitelik
✅ e-Plan imar (TAKS, Emsal, kullanım)
✅ Mahalle medyanı (canlı emsal)
✅ AI fiyat aralığı

Saniyeler içinde.
```

### Tweet 4 — Veri
```
Her şeyin temeli VERİ:

📊 65.000 mahalle baseline (KNN coğrafi yumuşatma)
🤖 AI tahmini (Gemini 2.5 Flash + Llama fallback)
📈 TCMB Konut Fiyat Endeksi entegrasyonu
🗺️ AFAD deprem zonu + taşkın haritası
🚀 Lojistik skor (yol/havalimanı/şehir)

Hiçbiri kapalı kaynak değil — referanslar açık.
```

### Tweet 5 — Pricing
```
Free plan:
✓ TKGM doğrulama (sınırsız)
✓ e-Plan imar
✓ Mahalle medyanı (5 il)
✓ Günde 3 AI sorgusu

Pro: ₺499/ay
✓ Tüm 81 il
✓ Sınırsız AI
✓ PDF rapor
✓ Yatırım skoru

İlk 100 üye: ERKEN100 → 6 ay %40 indirim
```

### Tweet 6 — CTA
```
Chrome eklentisi:
👉 (link buraya — store yayınlanınca)

Web sitesi:
👉 cadastrum.com.tr

Sorular için:
💬 iletisim@cadastrum.com.tr

Beraber Türkiye gayrimenkulüne şeffaflık getirelim 🇹🇷
```

---

## Devam Eden Stratejisi (sonraki 3 ay)

### Haftalık format

**Pazartesi — Veri Pazartesisi**
- Bir mahallenin haftalık fiyat değişimi
- Örnek: "Bebek arsa medyanı geçen hafta 87.000 → bu hafta 89.500 TL/m²"
- Grafik + kaynak

**Çarşamba — Eğitim**
- Türkiye gayrimenkulu hakkında bilgilendirici içerik
- TAKS nedir, Emsal nasıl hesaplanır, parsel sorgu nasıl yapılır
- 1-2 dakikada okunur thread'ler

**Cuma — Vaka Analizi**
- Bir parselin ilan-gerçek-tahmin karşılaştırması
- "Bu ilan 800K TL/m² istiyor — Cadastrum 350K diyor — neden?"
- Anonim, data odaklı

**Pazar — Kullanıcı Hikayesi**
- Cadastrum kullanan kişilerin deneyimi (önce kendin, sonra erken kullanıcılar)
- Screenshots, gerçek workflow

### Hashtag stratejisi
Asıl: `#Cadastrum`
Genel: `#arsa`, `#konut`, `#gayrimenkul`, `#yatırım`, `#TKGM`
Niş: `#mahallefiyatları`, `#parselsorgu`, `#imardurumu`

### Engagement stratejisi
- Türkiye gayrimenkul Twitter community'sini takip et (@gayrimenkulnews, @sahibinden, @hepsiemlak)
- Comment + value-add (spam değil) — birinin sorduğu gayrimenkul sorusunu Cadastrum data'sıyla yanıtla
- Reddit r/Turkce, r/turkey'de mahalle threads'lerinde yorum yap

### KPI hedefleri (3 ay)
- Takipçi: 0 → 1000
- Newsletter abone: 0 → 200
- Chrome installation: 0 → 100
- Pro abonelik: 0 → 5

---

## Header Banner Üretim

Boyut: 1500×500
Tasarım: Aynı imperial blue + champagne tema
Üzerine: "Türkiye'nin parsel zekâsı" + cadastrum.com.tr

Üretim için: `node scripts/twitter-banner.mjs` (ileride yapılacak)
