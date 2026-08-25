@echo off
chcp 65001 >nul
echo ═══════════════════════════════════════════════════════════
echo   Cadastrum — AI Baseline Seed (mahalle_baseline_ai)
echo   65.000+ mahalle × 3 kategori = ~189K satır
echo ═══════════════════════════════════════════════════════════
echo.

REM 1. Wrangler login kontrolü
echo [1/4] Wrangler login kontrol ediliyor...
call npx wrangler whoami >nul 2>&1
if errorlevel 1 (
    echo   ! Login gerekli, tarayıcı açılıyor...
    call npx wrangler login
)
echo   ✓ Login OK
echo.

REM 2. SQL dosyaları üret
echo [2/4] SQL dosyaları üretiliyor...
call node scripts\seed-mahalle-baseline-ai-sql.mjs
if errorlevel 1 (
    echo   ✗ SQL üretimi başarısız!
    pause
    exit /b 1
)
echo.

REM 3. D1'e yükle
echo [3/4] D1 veritabanına yükleniyor...
cd backend\api
set /a sayac=0
for %%f in (..\..\scripts\seed-ai-baseline-*.sql) do (
    set /a sayac+=1
    echo   Parça: %%~nxf ...
    call npx wrangler d1 execute cadastrum-db --remote --file="%%f"
    if errorlevel 1 (
        echo   ✗ %%~nxf başarısız!
    ) else (
        echo   ✓ %%~nxf tamam
    )
)
echo.

REM 4. Doğrulama
echo [4/4] Doğrulama sorguları...
echo.
echo   --- mahalle_baseline_ai toplam satır ---
call npx wrangler d1 execute cadastrum-db --remote --command="SELECT COUNT(*) AS toplam FROM mahalle_baseline_ai"
echo.
echo   --- Kategori dağılımı ---
call npx wrangler d1 execute cadastrum-db --remote --command="SELECT kategori, COUNT(*) AS adet FROM mahalle_baseline_ai GROUP BY kategori ORDER BY adet DESC"
echo.
echo   --- İl bazlı kapsam (kaç il var?) ---
call npx wrangler d1 execute cadastrum-db --remote --command="SELECT COUNT(DISTINCT il_norm) AS il_sayisi, COUNT(DISTINCT ilce_norm) AS ilce_sayisi FROM mahalle_baseline_ai"
echo.

cd ..\..
echo ═══════════════════════════════════════════════════════════
echo   Tamamlandı! Harita fiyat katmanı artık çalışmalı.
echo ═══════════════════════════════════════════════════════════
pause
