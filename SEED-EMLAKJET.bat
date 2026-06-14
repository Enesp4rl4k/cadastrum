@echo off
chcp 65001 >nul
cd /d "%~dp0backend\api"
echo ============================================
echo  EMLAKJET VERISINI BACKEND'E YUKLE
echo ============================================
echo.
echo [1/3] Login kontrol...
call npx wrangler whoami >nul 2>&1
if errorlevel 1 (echo Login gerekli & call npx wrangler login)
echo.
echo [2/3] Yukleniyor...
call npx wrangler d1 execute cadastrum-db --remote --file="..\..\scripts\emlakjet-data.sql"
if errorlevel 1 (echo HATA & pause & exit /b 1)
echo.
echo [3/3] Dogrulama...
call npx wrangler d1 execute cadastrum-db --remote --command="SELECT COUNT(*) AS emlakjet_ilan, SUM(CASE WHEN lat IS NOT NULL THEN 1 ELSE 0 END) AS koordlu FROM ilanlar WHERE ilan_no LIKE 'ej_%'"
echo.
echo TAMAM. Gercek arsa/tarla verisi yuklendi.
pause
