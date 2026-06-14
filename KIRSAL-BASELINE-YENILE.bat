@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  KIRSAL + MAHALLE BASELINE YENILE
echo  (scrape SQL -^> KNN -^> mahalle-baseline.ts)
echo ============================================
echo.
echo [1/3] Scrape SQL - ilce/mahalle medyan...
node scripts\scrape-baseline-uret.mjs
if errorlevel 1 pause & exit /b 1
echo.
echo [2/3] KNN + kirsal kalibrasyon (1-3 dk)...
node scripts\knn-yumusatma.mjs
if errorlevel 1 pause & exit /b 1
echo.
echo [3/3] Extension TS uret...
node scripts\baseline-ts-uret.mjs
if errorlevel 1 pause & exit /b 1
echo.
echo TAMAM. npm run build ile extension guncelle.
echo D1 icin: SEED-EMLAKJET-TURKIYE.bat (scrape bitince)
pause
