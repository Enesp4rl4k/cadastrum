@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo  CADASTRUM — TAM VERI CEKME
echo ============================================
echo.
echo Faz 1: Emlakjet 81 il (arsa+tarla) - 4-8 saat
echo Faz 2-3: Hepsiemlak + Sahibinden (SCRAPER_API_SECRET gerekir)
echo.
echo Sadece Emlakjet icin:  TAM-VERI-CEK.bat emlakjet
echo.

if /i "%~1"=="emlakjet" (
  node scripts\tam-veri-cek.mjs --sadece-emlakjet
  goto :done
)

if "%SCRAPER_API_SECRET%"=="" (
  echo UYARI: SCRAPER_API_SECRET bos — sadece Emlakjet calisacak.
  echo Hepsiemlak/Sahibinden icin once:
  echo   set SCRAPER_API_SECRET=^<secret^>
  echo veya SET-SCRAPER-SECRET.bat sonrasi ayni degeri buraya yaz.
  echo.
  node scripts\tam-veri-cek.mjs --sadece-emlakjet
  goto :done
)

node scripts\tam-veri-cek.mjs --maks-ilce=80 --maks-ilan=25

:done
echo.
pause
