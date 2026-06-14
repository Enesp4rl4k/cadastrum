# 🏠 Cadastrum Beta — Kurulum Rehberi

**Cadastrum**, Sahibinden ve Hepsiemlak'ta gezerken otomatik olarak TKGM resmi
parsel doğrulama, e-Plan imar bilgisi ve mahalle bazlı fiyat tahmini gösteren
Chrome eklentisidir.

🌐 [cadastrum.com.tr](https://cadastrum.com.tr)

---

## Kurulum (3 Dakika)

### 1. ZIP'i çıkar
İndirdiğin `cadastrum-extension-v0.3.0-beta.zip` dosyasına sağ tık → **"Tümünü
ayıkla"**. Klasör adını hatırla (örn. `cadastrum-extension-v0.3.0-beta`).

### 2. Chrome'da Geliştirici Modu

1. Chrome aç → adres çubuğuna yaz: `chrome://extensions`
2. Sayfanın **sağ üstünde "Geliştirici modu"** butonu var → **AÇ**
3. Üstte 3 yeni buton çıkar:
   - "Paketlenmemiş öğe yükle"
   - "Paketle"
   - "Güncelle"

### 3. Eklentiyi yükle

1. **"Paketlenmemiş öğe yükle"** butonuna tıkla
2. ZIP'ten çıkardığın klasörü seç (içinde `manifest.json` olan)
3. "Klasör seç" → eklenti yüklenir
4. Listede **"Cadastrum — Arsa TKGM Parsel Zekâsı"** görmelisin

### 4. Kullanmaya başla

1. Tarayıcının sağ üstünde 🧩 (puzzle) ikonuna tıkla
2. Cadastrum'u bul → 📌 ikonuna basıp **sabitlle** (her zaman görünsün)
3. Sahibinden'de bir arsa ilanı aç → **otomatik yan panel açılır**
4. TKGM kayıt + e-Plan imar + mahalle medyanı görünür ✓

---

## Test Senaryoları (Beta İçin)

Lütfen şunları dene + geri bildirim ver:

### 🟢 Temel Akış
- [ ] Sahibinden'de bir arsa ilanı aç → yan panel otomatik açıldı mı?
- [ ] TKGM kayıt göründü mü? (ada, parsel, alan, nitelik)
- [ ] e-Plan imar bilgisi geldi mi? (TAKS, Emsal, kullanım kararı)
- [ ] Mahalle medyan fiyatı doğru görünüyor mu?

### 🟡 İleri Özellikler
- [ ] Hepsiemlak'ta da çalışıyor mu?
- [ ] AI fiyat tahmini sayısı mantıklı mı? (gerçek piyasayla kıyasla)
- [ ] Risk analizi (deprem zonu) doğru ili gösteriyor mu?
- [ ] Sahibinden liste sayfasında çoklu ilan analizi çalışıyor mu?

### 🔴 Olası Sorunlar
- [ ] Bir mahalle / il için yanlış fiyat?
- [ ] TKGM bulamadı uyarısı yanlış mı? (gerçekten var olan parsel için)
- [ ] Sayfa yavaşladı mı?
- [ ] Tarayıcı kapanırken / yeniden açarken bir sorun?

---

## Pro Hesap (Tam Erişim) — Beta'cılara Hediye

Beta testçilere ücretsiz Pro hesap sözüm. Kayıt akışı:

1. https://cadastrum.com.tr/kayit → email + şifre ile kayıt ol
2. Bana bildiriminizi atın (WhatsApp/email) — admin panelinden Pro yapayım
3. Eklenti otomatik Pro tier'ı algılar (sidepanel başlığında "Pro" rozeti çıkar)

**Pro özellikleri:**
- Sınırsız AI fiyat tahmini (Free 3/gün)
- Detaylı PDF rapor
- Mahalle profili + trend tahmini
- 81 il + tüm ilçeler erişim

---

## Geri Bildirim — Önemli!

5 dakikalık kullanım sonrası 2-3 cümle geri bildirim:

**Hangi konuda?**
1. **Çalışmayanlar** — bug, hata, garip davranış
2. **Eksikler** — "şu da olsa iyi olurdu"
3. **Genel his** — kullanışlı mı, karışık mı, beğendin mi?

**Nereye?**
- WhatsApp'a yaz (Enes'e direkt)
- Veya email: iletisim@cadastrum.com.tr
- Veya tweetle: [@cadastrum](https://x.com/cadastrum)

---

## Bilinen Sınırlamalar

- ⚠️ Chrome Web Store onay sürecinde — şu an sadece "geliştirici modu"yla yüklenir
- ⚠️ İlk açılışta birkaç saniye yükleme (TKGM API)
- ⚠️ Kırsal mahallelerde fiyat tahmini düşük güvenli olabilir (veri az)
- ⚠️ Henüz banka değerleme entegrasyonu yok (yol haritasında)

---

## Sıkça Sorulan

**Verilerim güvenli mi?**
Evet. TKGM ve e-Plan resmi devlet API'leri. Kişisel veri tarayıcınızda kalır.
Sadece Pro AI sorgu yaparsanız anonim parsel bilgisi backend'e gider (kişisel
veri yok). KVKK uyumluyuz.

**Telefonda çalışıyor mu?**
Şu an sadece masaüstü Chrome (ve Edge, Brave). Mobil uzantı için yol haritasında
plan var ama ileride.

**Türkiye dışı çalışır mı?**
TKGM ve e-Plan sadece Türkiye verileri içeriyor. Yurt dışı parseller için
çalışmaz, ama Türkiye için her yerden erişilebilir.

---

## Teşekkür

Beta testine zaman ayırdığın için teşekkürler 🙏

— Enes Parlak
Cadastrum kurucusu
[cadastrum.com.tr](https://cadastrum.com.tr)
