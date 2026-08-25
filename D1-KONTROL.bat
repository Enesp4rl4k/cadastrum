@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo  D1 DOGRULAMA — arsa+tarla ilan sayisi
echo ============================================
echo.
echo Yontem 1: Canli API /v1/istatistik/sayim endpoint'i (STATS_SECRET gerekir)
echo Yontem 2: Wrangler D1 dogrudan sorgu
echo.

REM ── Yontem 1: Canlı API üzerinden sayım ────────────────────────
if not "%STATS_SECRET%"=="" (
  echo [API] /v1/istatistik/sayim sorgulanıyor...
  node scripts\d1-sayim-kontrol.mjs
  goto :done
)

REM ── Yontem 2: Wrangler D1 doğrudan sorgu ───────────────────────
echo [D1]  Wrangler ile dogrudan sorgu...
cd backend\api

echo.
echo [1/3] arsa+tarla aktif ilan sayimi:
call npx wrangler d1 execute cadastrum-db --command "SELECT kategori, COUNT(*) as adet FROM ilanlar WHERE kategori IN ('arsa','tarla') AND aktif = 1 GROUP BY kategori;"

echo.
echo [2/3] Toplam aktif ilan:
call npx wrangler d1 execute cadastrum-db --command "SELECT COUNT(*) as toplam_aktif FROM ilanlar WHERE aktif = 1;"

echo.
echo [3/3] Kaynak x kategori (arsa+tarla):
call npx wrangler d1 execute cadastrum-db --command "SELECT kaynak, kategori, COUNT(*) as adet FROM ilanlar WHERE kategori IN ('arsa','tarla') AND aktif = 1 GROUP BY kaynak, kategori ORDER BY adet DESC;"

cd ..\..

:done
echo.
echo ============================================
echo  Hedef: arsa+tarla TOPLAM >= 50000
echo  Eksikse: TAM-VERI-CEK.bat calistir
echo ============================================
echo.
pause
