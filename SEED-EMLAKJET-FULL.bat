@echo off
chcp 65001 >nul
cd /d "%~dp0backend\api"

echo ============================================
echo  EMLAKJET FULL SQL - BACKEND YUKLE
echo ============================================
echo.

if not exist "..\..\scripts\emlakjet-data-full.sql" (
  echo HATA: scripts\emlakjet-data-full.sql yok.
  echo Once: node scripts\emlakjet-scrape-full.mjs
  pause
  exit /b 1
)

echo [1/3] Login kontrol...
call npx wrangler whoami >nul 2>&1
if errorlevel 1 (
  echo Login gerekli
  call npx wrangler login
)

echo.
echo [2/3] Yukleniyor (buyuk dosya, biraz surer)...
call npx wrangler d1 execute cadastrum-db --remote --file="..\..\scripts\emlakjet-data-full.sql"
if errorlevel 1 (echo HATA & pause & exit /b 1)

echo.
echo [3/3] Dogrulama...
rem NOTE: cmd.exe treats % as variable markers; escape LIKE wildcard as %% to keep SQL as 'ej_%'.
call npx wrangler d1 execute cadastrum-db --remote --command="SELECT COUNT(*) AS emlakjet_ilan, SUM(CASE WHEN kategori='arsa' THEN 1 ELSE 0 END) AS arsa, SUM(CASE WHEN kategori='tarla' THEN 1 ELSE 0 END) AS tarla FROM ilanlar WHERE ilan_no LIKE 'ej_%%'"

echo.
echo [4/4] Istatistik refresh...
powershell -NoProfile -Command ^
  "try { if(-not $env:SCRAPER_API_SECRET){ exit 0 }; $u='https://cadastrum-api.cadastrum-tr.workers.dev/v1/istatistik/refresh?secret='+$env:SCRAPER_API_SECRET; Invoke-WebRequest -UseBasicParsing -Method GET -Uri $u -TimeoutSec 240 | Out-Null } catch { }"
echo.
echo TAMAM.
pause
