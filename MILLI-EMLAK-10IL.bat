@echo off
:: Milli Emlak İhale Scraper — 10 Büyük İl
::
:: Her il için ayrı ayrı çalıştırır, aralara 10sn bekler (nazik tarama).
:: Gereksinimler:
::   set SCRAPER_API_SECRET=...
::   set CADASTRUM_API_URL=https://api.cadastrum.com.tr (opsiyonel, default)
::
:: Çalıştırma: MILLI-EMLAK-10IL.bat
:: Tek il:    node scripts/milli-emlak-scraper.mjs --il=istanbul --maks=100
::
:: Sıra: İstanbul, Ankara, İzmir, Bursa, Antalya, Kocaeli, Gaziantep, Konya, Adana, Mersin

echo [milli-emlak-10il] Basliyor...
echo.

echo [1/10] Istanbul...
node scripts/milli-emlak-scraper.mjs --il=istanbul --maks=100
timeout /t 10 /nobreak >nul

echo [2/10] Ankara...
node scripts/milli-emlak-scraper.mjs --il=ankara --maks=100
timeout /t 10 /nobreak >nul

echo [3/10] Izmir...
node scripts/milli-emlak-scraper.mjs --il=izmir --maks=100
timeout /t 10 /nobreak >nul

echo [4/10] Bursa...
node scripts/milli-emlak-scraper.mjs --il=bursa --maks=100
timeout /t 10 /nobreak >nul

echo [5/10] Antalya...
node scripts/milli-emlak-scraper.mjs --il=antalya --maks=100
timeout /t 10 /nobreak >nul

echo [6/10] Kocaeli...
node scripts/milli-emlak-scraper.mjs --il=kocaeli --maks=100
timeout /t 10 /nobreak >nul

echo [7/10] Gaziantep...
node scripts/milli-emlak-scraper.mjs --il=gaziantep --maks=100
timeout /t 10 /nobreak >nul

echo [8/10] Konya...
node scripts/milli-emlak-scraper.mjs --il=konya --maks=100
timeout /t 10 /nobreak >nul

echo [9/10] Adana...
node scripts/milli-emlak-scraper.mjs --il=adana --maks=100
timeout /t 10 /nobreak >nul

echo [10/10] Mersin...
node scripts/milli-emlak-scraper.mjs --il=mersin --maks=100

echo.
echo [milli-emlak-10il] Tamamlandi!
echo Kontrol: node scripts/d1-sayim-kontrol.mjs
pause
