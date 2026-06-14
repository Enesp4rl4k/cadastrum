# Aylık Otomatik Scraper — Kurulum

İki seçenek (her ikisi de ücretsiz):

## Seçenek A — Yerel (Windows, kendi bilgisayarında)

Avantaj: residential IP → PerimeterX bot koruması çoğunlukla geçer.
Dezavantaj: ayın 1'inde bilgisayar açık olmalı.

### 1. Puppeteer kur (bir kez)

```cmd
cd C:\Users\parlak\Downloads\arsa-tkgm-extension
```

```cmd
npm install puppeteer
```

Chromium browser otomatik iner (~170 MB).

### 2. Manuel test (kuruyor mu)

```cmd
set SCRAPER_API_SECRET=<SCRAPER_API_SECRET_BURAYA>
```

```cmd
node scripts/aylik-scrape.mjs --il=istanbul --ilce=sile --maks-ilan=3
```

Beklenen çıktı:
```
📊 Cadastrum Aylık Scraper
[1/1] istanbul/sile
  → https://www.sahibinden.com/satilik-arsa/istanbul-sile?pagingSize=50
  ✓ 102 unique ilan link bulundu
  → backend: basarili=3, dup=0, hata=0
✓ TAMAM
```

`bot challenge` veya `Bot engel` çıkarsa Puppeteer'ı `headless: false` ile çalıştır (CAPTCHA tek seferlik manuel çözülür, sonra cookie kalır):

```cmd
node scripts/aylik-scrape.mjs --il=istanbul --ilce=sile --maks-ilan=3 --headless=false
```

### 3. Windows Task Scheduler — aylık otomatik

1. **Görev Zamanlayıcı** aç (`taskschd.msc`)
2. Sağ menü → **Görev Oluştur** (Create Task)
3. **Genel** sekmesi:
   - Ad: `Cadastrum Aylık Scraper`
   - "En yüksek ayrıcalıklarla çalıştır" işaretle
4. **Tetikleyiciler** → Yeni:
   - "Bir programa göre"
   - "Aylık"
   - Aylar: "Tümü"
   - Günler: "1"
   - Başlangıç: 04:00 (sabah erken)
5. **Eylemler** → Yeni:
   - Eylem: "Program başlat"
   - Program/komut dosyası: `cmd.exe`
   - Argüman: `/c C:\Users\parlak\Downloads\arsa-tkgm-extension\scripts\aylik-scrape-baslat.bat`
6. **Koşullar**:
   - "Görevi yalnızca bilgisayar AC gücüne bağlıyken başlat" işaretsiz bırakabilirsin
   - "Kullanılabilir bir ağ bağlantısı gerekli" işaretle
7. **Tamam** → şifren istenir, ver.

### 4. Başlatıcı batch dosyası

`scripts/aylik-scrape-baslat.bat` (zaten hazır, sonraki bölümde):
```cmd
@echo off
cd /d C:\Users\parlak\Downloads\arsa-tkgm-extension
set SCRAPER_API_SECRET=BURAYA_SECRET_YAPISTIR
node scripts/aylik-scrape.mjs >> logs\scraper-%date:~-4%%date:~3,2%%date:~0,2%.log 2>&1
```

> **Önemli**: `BURAYA_SECRET_YAPISTIR` yerine kendi secret'ını yaz. Dosya hassas → `.gitignore`'da.

### 5. Manuel ilk run

Task Scheduler'da görevi sağ tık → "Çalıştır". Logs klasörü oluşturulup log dosyası yazılır. Bittiğinde:

```cmd
cd C:\Users\parlak\Downloads\arsa-tkgm-extension\backend\api
```

```cmd
npx wrangler d1 execute cadastrum-db --remote --command="SELECT COUNT(*) FROM ilanlar"
```

İlan sayısı artmalı.

---

## Seçenek B — GitHub Actions (bulutta, bilgisayar kapalıyken)

Avantaj: bilgisayar açık olması gerekmiyor, sınırsız ücretsiz (public repo).
Dezavantaj: GitHub Actions IP'leri (Azure data center) Sahibinden tarafından bloklanabilir → bot engel riski yüksek.

### 1. Repo'yu GitHub'a push (yoksa)

```cmd
cd C:\Users\parlak\Downloads\arsa-tkgm-extension
```

```cmd
git remote add origin https://github.com/<username>/cadastrum.git
git push -u origin main
```

### 2. SCRAPER_API_SECRET'ı GitHub Secrets'a ekle

GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

- Name: `SCRAPER_API_SECRET`
- Value: `<SCRAPER_API_SECRET_BURAYA>`

### 3. Workflow zaten hazır: `.github/workflows/aylik-scrape.yml`

Otomatik tetik: her ayın 1'i 03:00 UTC (06:00 TR).

Manuel tetik: **Actions** sekmesi → "Aylık Sahibinden Scraper" → **Run workflow**.

### 4. Sonuç log

Actions sekmesinde her run'ın log'una bakabilirsin. `bot challenge` çıkıyorsa Seçenek A'ya geç.

---

## Hangisi Sende Çalışır?

**Önce A'yı dene** — residential IP avantajı. Manuel test (`node scripts/aylik-scrape.mjs --il=istanbul --ilce=sile --maks-ilan=3`) çalıştıysa Task Scheduler kur, ayda bir otomatik.

**A'da bot challenge çıkarsa**: `--headless=false` ile CAPTCHA'yı bir kez çöz, browser cookie cache'lenir.

**Bilgisayar her ay açık olmuyorsa**: B'yi de paralel kur — GitHub Actions monthly cron. Her ikisi tetiklenir, biri başarılı olursa veri akar.

---

## Manuel İlk Run Önerisi (şu an)

Sahip olduğun secret ile:

```cmd
cd C:\Users\parlak\Downloads\arsa-tkgm-extension
```

```cmd
npm install puppeteer
```

```cmd
set SCRAPER_API_SECRET=<SCRAPER_API_SECRET_BURAYA>
```

Önce **tek ilçe** test (5 dakika):

```cmd
node scripts/aylik-scrape.mjs --il=istanbul --ilce=sile --maks-ilan=5 --headless=false
```

Çalışırsa **tüm popüler İstanbul** (~30 dakika):

```cmd
node scripts/aylik-scrape.mjs --il=istanbul --maks-ilan=10
```

Çalışırsa **80 ilçe Türkiye geneli** (~3-4 saat, bilgisayar açık kalmalı):

```cmd
node scripts/aylik-scrape.mjs --maks=80 --maks-ilan=15
```

Beklenen sonuç: 1000-1200 yeni ilan, mahalle_istatistik tablosu otomatik refresh.
