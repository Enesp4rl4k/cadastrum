@echo off
chcp 65001 >nul
echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║  Cadastrum — FULL DATA SEED                                 ║
echo ║  Taban Fiyat + Likidite + Spatial harita verilerini doldurur ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

REM 0. Wrangler login
echo [0] Wrangler login kontrol ediliyor...
cd /d "%~dp0backend\api"
call npx wrangler whoami >nul 2>&1
if errorlevel 1 (
    echo   ! Login gerekli, tarayici aciliyor...
    call npx wrangler login
)
echo   OK
cd /d "%~dp0"
echo.

REM ════════════════════════════════════════════════════════════════
echo ── ADIM 1: mahalle_baseline_ai tablosu (harita fiyat katmani) ──
echo    ~65K mahalle × 3 kategori = ~189K satir
echo.

echo [1a] SQL dosyalari uretiliyor...
call node scripts\seed-mahalle-baseline-ai-sql.mjs
if errorlevel 1 (echo HATA! & pause & exit /b 1)
echo.

echo [1b] D1'e yukleniyor...
cd backend\api
for %%f in (..\..\scripts\seed-ai-baseline-*.sql) do (
    echo   %%~nxf ...
    call npx wrangler d1 execute cadastrum-db --remote --file="%%f"
    if errorlevel 1 (echo   ✗ HATA %%~nxf) else (echo   ✓ OK)
)
cd ..\..
echo.

REM ════════════════════════════════════════════════════════════════
echo ── ADIM 2: Dogrulama ──
echo.
cd backend\api

echo   --- mahalle_baseline_ai ---
call npx wrangler d1 execute cadastrum-db --remote --command="SELECT COUNT(*) AS ai_baseline_satir FROM mahalle_baseline_ai"
echo.

echo   --- mahalle_baseline_ai kategori dagilimi ---
call npx wrangler d1 execute cadastrum-db --remote --command="SELECT kategori, COUNT(*) AS adet FROM mahalle_baseline_ai GROUP BY kategori"
echo.

echo   --- il_istatistik (harita fiyat katmani) ---
call npx wrangler d1 execute cadastrum-db --remote --command="SELECT COUNT(DISTINCT il_norm) AS il_sayisi FROM il_istatistik"
echo.

echo   --- sentetik ilan sizintisi (0 OLMALI) ---
call npx wrangler d1 execute cadastrum-db --remote --command="SELECT COUNT(*) AS sentetik_ilan FROM ilanlar WHERE ilan_no GLOB 'bl_*'"
echo.

echo   --- ilanlar kategori dagilimi ---
call npx wrangler d1 execute cadastrum-db --remote --command="SELECT kategori, COUNT(*) AS adet FROM ilanlar WHERE aktif=1 GROUP BY kategori"
echo.

cd ..\..

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║  TAMAMLANDI!                                                ║
echo ║                                                             ║
echo ║  Harita katmanlari artik calismali:                         ║
echo ║    ✓ Fiyat choropleth  (81 il, medyan TL/m²)                ║
echo ║    ✓ Likidite katmani  (81 il, TUIK 2025 — zaten statik)    ║
echo ║    ✓ Gelisen bolgeler  (likidite + altyapi + fiyat momentum)║
echo ║    ✓ Veri sayfalari    (il/ilce istatistik)                  ║
echo ╚══════════════════════════════════════════════════════════════╝
pause
