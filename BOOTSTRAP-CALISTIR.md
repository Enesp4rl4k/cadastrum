# Bootstrap Canlı Veri Çekme — Adım Adım Runbook

> **Hedef**: Sahibinden'den canlı emsal verisi çekip Cadastrum'un spatial baseline motorunu **gerçek veriyle** beslemek.
>
> **Süre**: İlk pilot (İstanbul Şile + Beykoz arsa) ~10 dk · Türkiye geneli bir gece (8 saat).

---

## Pre-flight (her çalıştırma öncesi)

```bash
cd C:\Users\parlak\Downloads\arsa-tkgm-extension
node scripts/canli-veri-on-kontrol.mjs --token=<SENIN_JWT_TOKEN>
```

Tüm `✓` görmeden ileri gitme. Eksik varsa aşağıdaki adımları çalıştır.

---

## A · Backend Deploy (sadece bir kez — yeni endpoint'ler şu an 404)

```bash
cd backend/api

# 1. D1 migration'ları (sırayla)
wrangler d1 execute cadastrum-db --remote --file=src/db/0007_spatial.sql
wrangler d1 execute cadastrum-db --remote --file=src/db/0008_dogrulama.sql
wrangler d1 execute cadastrum-db --remote --file=src/db/0010_bildirim.sql
wrangler d1 execute cadastrum-db --remote --file=src/db/0011_crm.sql
wrangler d1 execute cadastrum-db --remote --file=src/db/0012_api_tokens.sql

# 2. Yeni Worker kodunu deploy et
wrangler deploy

# 3. (Eğer ilk kez ayarlıyorsan) scraper secret
wrangler secret put SCRAPER_API_SECRET
# İçeride uzun rastgele string gir — bunu ileride extension'a da gireceksin
```

**Doğrulama**: yeniden `node scripts/canli-veri-on-kontrol.mjs` çalıştır → tüm `✓`.

---

## B · Admin User Setup (sadece bir kez)

```bash
# 1. cadastrum.com.tr/kayit'tan kendi kullanıcını oluştur (varsa atla)

# 2. Email'i admin yap (KENDİ EMAİL'İNLE DEĞİŞTİR)
cd backend/api
wrangler d1 execute cadastrum-db --remote \
  --command="UPDATE kullanicilar SET admin=1 WHERE email='eparlak996@gmail.com'"

# 3. Doğrula
wrangler d1 execute cadastrum-db --remote \
  --command="SELECT id, email, admin, tier FROM kullanicilar WHERE admin=1"

# 4. Site'tan ÇIKIŞ + GİRİŞ yap — JWT'ye admin=1 claim'i bu sırada yazılır
```

---

## C · Extension'ı Bootstrap Build'iyle Yükle

```bash
cd C:\Users\parlak\Downloads\arsa-tkgm-extension
npm run build
```

Chrome'da:
1. `chrome://extensions` → "Developer mode" açık
2. Eski yüklü Cadastrum varsa **kaldır** (Dexie schema değişti, temiz başla)
3. "Load unpacked" → `dist/` klasörü seç
4. Side panel'i aç → site'a giriş yap (auth-koprusu JWT'yi storage'a yazar)
5. Side panel'i kapat-aç → **Boot** sekmesi görünmeli (admin claim devrede)

**Görmüyorsan**: chrome.storage.local → `cadastrum_token` var mı? DevTools console:
```javascript
chrome.storage.local.get("cadastrum_token", console.log)
```

---

## D · Pilot Tarama (İstanbul Şile — ~5 dk, 50 ilan)

Boot sekmesi:
1. **scraper_api_secret** alanına Backend'de set ettiğin secret'ı gir, "Kaydet"
2. İl: **İstanbul**, ilçe seçimi yok → İstanbul tümü, ya da kod manuel: tek ilçe için "Tüm Türkiye" kapalı
3. Kategori: **arsa** (sadece bu)
4. Rate: **6000ms**, Bekle: **4000ms** (varsayılan)
5. **Başlat** → ~5-10 dk içinde liste tab'ları arka planda açılıp kapanır

**Doğrulama** (DevTools → side panel devtools):
```javascript
// Dexie'de kaç ilan birikti
(await db.ilanGozlem.count())
// Detay kuyruğunda kaç bekleyen var
(await db.detayKuyrugu.where("durum").equals("beklemede").count())
```

---

## E · Detay Zenginleştirme (Lat/Lng Toplama)

Boot panelinde "🎯 Detay Zenginleştirme" kutusundan:
1. **Başlat** butonuna bas
2. ~6 sn/ilan rate'iyle her bekleyen ilan için tab açılır → koord çekilir → tab kapanır
3. 50 ilan ≈ **5 dk**

Live durum: Tamam / Bekleyen / Hata / Kalıcı sayıları artar. Beklenen %60+ tamam.

---

## F · Backend İstatistik Refresh

Bootstrap + detay zenginleştirme bittikten sonra **mahalle_istatistik tablosunu güncelle** — yoksa toplanan ilanlar baseline'a yansımaz.

Boot panelinde "📊 Refresh tetikle" butonu → backend `/v1/istatistik/refresh` çalışır.

Manuel doğrulama:
```bash
cd backend/api
wrangler d1 execute cadastrum-db --remote \
  --command="SELECT COUNT(*) toplam, SUM(CASE WHEN lat IS NOT NULL THEN 1 ELSE 0 END) koordlu FROM ilanlar"
wrangler d1 execute cadastrum-db --remote \
  --command="SELECT il_norm, ilce_norm, ilan_adet, medyan FROM mahalle_istatistik ORDER BY ilan_adet DESC LIMIT 10"
```

---

## G · Sonuç Doğrulama (Spatial Motor Devrede)

Sahibinden'de bir İstanbul Şile arsa ilanı aç → Cadastrum side panel'de **Fiyat Tahmini** kartı:
- "Kaynak: **spatial-radius** (N emsal)" rozeti görünmeli
- Eskiden `ilce-baseline` yazıyordu

**veya** [src/sidepanel/components/EmsalRadiusSlider.tsx](src/sidepanel/components/EmsalRadiusSlider.tsx) içinde 1/3/5/10 km segmented kontrolünde emsal sayısı görünür.

---

## H · Türkiye Geneli Tarama (İsteğe Bağlı, Bir Gece)

Pilot başarılıysa:
1. Boot panel: "Tüm Türkiye" toggle aç
2. Toplam ~2156 sayfa × 6 sn = **~3.5 saat liste**
3. Sonra ~30k-100k ilan için detay zenginleştirme = **~50 saat** (yavaş çekecek, hafta sonu bırak)
4. D1 free limiti **100k req/day** — günde max ~50 ilçe önerilen

**Önemli**: bilgisayarın bu süre boyunca açık + uyumadan kalmalı (Chrome arka plan tab'ları aktif).

---

## Risk Yönetimi

| Risk | Belirti | Çözüm |
|---|---|---|
| **PerimeterX / IP yasağı** | Bot Engel sayacı > 5 | Bootstrap'i 1 saat durdur, devam et. 24 saat IP yasaklarsa farklı ağ |
| **D1 limit aşımı** | Backend 429 cevap | Günde max 50 ilçe; sonraki gün devam |
| **Detay kuyruğunda kalıcı-hata >50** | Sahibinden DOM değişti? | sahibinden.ts content script'i güncelle |
| **lat/lng coverage <%40** | JSON-LD bot koruması arttı | Worker yarıçapı düşür (3km), retry artır |

## Çıktılar

İlk pilot (Şile) sonrası bekleyiş:
- D1 `ilanlar`: ~50 yeni kayıt
- D1 `ilanlar.lat IS NOT NULL`: ~30 kayıt (%60 coverage)
- `mahalle_istatistik` Şile mahalleleri: medyan/q1/q3 dolu
- Extension Şile parselinde: **spatial-radius** kaynağı aktif

Türkiye geneli bir hafta sonra:
- ~30k-100k yeni emsal
- ~15k-60k koordlu emsal
- 300+ ilçe için canlı medyan
- Spatial motor **çalışan** durumda → baseline kalitesi 5/10 → 7-8/10
