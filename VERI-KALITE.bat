@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  SCRAPING VERI KALITE KONTROLU
echo ============================================
node scripts\veri-kalite-kontrol.mjs
echo.
echo Rapor: data\veri-kalite-rapor.json
pause
