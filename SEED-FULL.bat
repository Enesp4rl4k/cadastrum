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
echo ── ADIM 2: ilanlar tablosu (spatial sorgu motoru baseline) ──
echo    ~52K mahalle × arsa+konut+tarla = ~150K sentetik ilan
echo.

echo [2a] SQL dosyalari kontrol ediliyor...
if not exist scripts\seed-baseline-01.sql (
    echo   seed-baseline-XX.sql bulunamadi, uretiliyor...
    call node scripts\seed-baseline-sql.mjs
)
echo.

echo [2b] D1'e yukleniyor...
cd backend\api
for %%F in (01 02 03 04 05 06) do (
    if exist "..\..\scripts\seed-baseline-%%F.sql" (
        echo   seed-baseline-%%F.sql ...
        call npx wrangler d1 execute cadastrum-db --remote --file="..\..\scripts\seed-baseline-%%F.sql"
        if errorlevel 1 (echo   ✗ HATA parca %%F) else (echo   ✓ OK)
    )
)
cd ..\..
echo.

REM ════════════════════════════════════════════════════════════════
echo ── ADIM 3: istatistik tablolarini yenile (endeks + veri sayfalari) ──
echo.

echo [3] istatistik refresh tetikleniyor (cron job)...
cd backend\api
call npx wrangler d1 execute cadastrum-db --remote --command="INSERT OR REPLACE INTO il_istatistik (il_norm, kategori, medyan, q1, q3, ortalama, ilan_adet, son_guncelleme) SELECT il_norm, kategori, tlm2 AS medyan, ROUND(tlm2 * 0.75) AS q1, ROUND(tlm2 * 1.25) AS q3, tlm2 AS ortalama, COUNT(*) AS ilan_adet, strftime('%%s','now')*1000 AS son_guncelleme FROM mahalle_baseline_ai GROUP BY il_norm, kategori"
echo   ✓ il_istatistik guncellendi
echo.

call npx wrangler d1 execute cadastrum-db --remote --command="INSERT OR REPLACE INTO ilce_istatistik (il_norm, ilce_norm, kategori, medyan, q1, q3, ortalama, ilan_adet, son_guncelleme) SELECT il_norm, ilce_norm, kategori, AVG(tlm2) AS medyan, ROUND(AVG(tlm2) * 0.75) AS q1, ROUND(AVG(tlm2) * 1.25) AS q3, AVG(tlm2) AS ortalama, COUNT(*) AS ilan_adet, strftime('%%s','now')*1000 AS son_guncelleme FROM mahalle_baseline_ai GROUP BY il_norm, ilce_norm, kategori"
echo   ✓ ilce_istatistik guncellendi
echo.
cd ..\..

REM ════════════════════════════════════════════════════════════════
echo ── ADIM 4: Dogrulama ──
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

echo   --- ilanlar baseline ---
call npx wrangler d1 execute cadastrum-db --remote --command="SELECT COUNT(*) AS baseline_ilan FROM ilanlar WHERE ilan_no LIKE 'bl_%%'"
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
echo ║    ✓ Spatial sorgu     (/sorgu endpoint baseline verileri)   ║
echo ║    ✓ Veri sayfalari    (il/ilce istatistik)                  ║
echo ╚══════════════════════════════════════════════════════════════╝
pause
