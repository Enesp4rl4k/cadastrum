@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist logs mkdir logs
if not exist data mkdir data

echo ============================================
echo  TURKIYE TAM VERI — 81 il + 973 ilce
echo ============================================
echo  Faz 1: 81 il (emlakjet-scrape-full)
echo  Faz 2: 973 ilce x arsa+tarla (mahalle)
echo  Log: logs\turkiye-tam-veri.log
echo ============================================
echo.

node scripts\turkiye-tam-veri.mjs >> logs\turkiye-tam-veri.log 2>&1

echo.
echo Bitti veya hata — log: logs\turkiye-tam-veri.log
echo D1: SEED-EMLAKJET-TURKIYE.bat
pause
