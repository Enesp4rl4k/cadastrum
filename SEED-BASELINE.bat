@echo off
chcp 65001 >nul
cd /d "%~dp0backend\api"

echo ============================================
echo  BASELINE SEED - 52k mahalle backend'e
echo ============================================
echo.
echo [1/3] Login kontrol (gerekirse tarayici acilir)...
call npx wrangler whoami >nul 2>&1
if errorlevel 1 (
  echo Login gerekli - tarayici aciliyor, eparlak996 hesabini sec
  call npx wrangler login
)

echo.
echo [2/3] 6 parca yukleniyor (her biri ~3 MB)...
for %%F in (01 02 03 04 05 06) do (
  echo   Parca %%F yukleniyor...
  call npx wrangler d1 execute cadastrum-db --remote --file="..\..\scripts\seed-baseline-%%F.sql"
  if errorlevel 1 (echo PARCA %%F HATASI & pause & exit /b 1)
)

echo.
echo [3/3] Dogrulama...
call npx wrangler d1 execute cadastrum-db --remote --command="SELECT COUNT(*) AS baseline_ilan FROM ilanlar WHERE ilan_no LIKE 'bl_%'"

echo.
echo ============================================
echo  TAMAM. 52k mahalle baseline yuklendi.
echo  Artik /sorgu tum Turkiye'de calisir.
echo ============================================
pause
