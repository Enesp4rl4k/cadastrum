@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM  Emlakjet Batch Seed — SQL çıktısını API'ye chunk'larla yükle
REM
REM  Kullanım:
REM    1. Bu bat dosyasını düzenle: SEED_SECRET ve API_URL'i gir
REM    2. Önce scraper çalıştır: SCRAPE-EMLAKJET.bat veya SCRAPE-EMLAKJET-81IL.bat
REM    3. Sonra bu bat'ı çalıştır
REM ─────────────────────────────────────────────────────────────────────────────

REM ── Ayarlar (DÜZENLE) ──────────────────────────────────────────────────────
set API_URL=https://cadastrum-api.workers.dev
set SEED_SECRET=BURAYA_SEED_SECRET_GIR

REM Sadece belirli bir ili seed etmek istersen (opsiyonel, boş bırakırsan tümü):
set IL=

REM ── Kontrol ────────────────────────────────────────────────────────────────
if "%SEED_SECRET%"=="BURAYA_SEED_SECRET_GIR" (
  echo [HATA] SEED_SECRET ayarlanmamis. Bu dosyayi duzenleyin.
  pause
  exit /b 1
)

echo.
echo  Emlakjet Batch Seed
echo  API: %API_URL%
echo  IL filtre: %IL%
echo.

REM ── Çalıştır ────────────────────────────────────────────────────────────────
set API_URL=%API_URL%
set SEED_SECRET=%SEED_SECRET%
set IL=%IL%
node scripts/emlakjet-batch-seed.mjs

echo.
echo  Tamamlandi. Cikis kodunu kontrol edin.
pause
