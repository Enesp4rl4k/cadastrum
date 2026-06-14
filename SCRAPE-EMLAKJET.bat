@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  EMLAKJET GERCEK ARSA/TARLA SCRAPER
echo ============================================
echo  10 il x ilceler x (arsa+tarla) taranir.
echo  ~1-2 saat surer, arka planda calisir.
echo  Her ilce sonrasi kaydedilir (cokerse veri durur).
echo  Bot blogu YOK - Emlakjet server-fetch'e acik.
echo ============================================
echo.
node scripts\emlakjet-scrape.mjs
echo.
echo TAMAM. Simdi SEED-EMLAKJET.bat ile backend'e yukle.
pause
