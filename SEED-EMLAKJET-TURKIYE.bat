@echo off
chcp 65001 >nul
cd /d "%~dp0backend\api"

echo ============================================
echo  EMLAKJET TURKIYE — D1 YUKLE (81il + 973ilce)
echo ============================================

call npx wrangler whoami >nul 2>&1
if errorlevel 1 call npx wrangler login

if exist "..\..\scripts\emlakjet-data-full.sql" (
  echo [1] emlakjet-data-full.sql ...
  call npx wrangler d1 execute cadastrum-db --remote --file="..\..\scripts\emlakjet-data-full.sql"
)

if exist "..\..\scripts\emlakjet-data-turkiye.sql" (
  echo [2] emlakjet-data-turkiye.sql ...
  call npx wrangler d1 execute cadastrum-db --remote --file="..\..\scripts\emlakjet-data-turkiye.sql"
)

echo.
echo [3] Dogrulama...
rem NOTE: cmd.exe treats % as variable markers; escape LIKE wildcard as %% to keep SQL as 'ej_%'.
call npx wrangler d1 execute cadastrum-db --remote --command="SELECT COUNT(*) emlakjet, SUM(CASE WHEN mahalle_norm IS NOT NULL THEN 1 ELSE 0 END) mahalleli, COUNT(DISTINCT il_norm||'__'||ilce_norm) ilce FROM ilanlar WHERE ilan_no LIKE 'ej_%%' AND aktif=1"

echo.
echo [4] Mahalle istatistik (secret gerekir)...
if defined SCRAPER_API_SECRET (
  powershell -NoProfile -Command ^
    "try { if(-not $env:SCRAPER_API_SECRET){ exit 0 }; $u='https://cadastrum-api.cadastrum-tr.workers.dev/v1/istatistik/refresh?secret='+$env:SCRAPER_API_SECRET; Invoke-WebRequest -UseBasicParsing -Method GET -Uri $u -TimeoutSec 240 | Out-Null } catch { }"
)
echo.
echo TAMAM.
pause
