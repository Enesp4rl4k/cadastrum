@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist logs mkdir logs
title Cadastrum — 81 il scrape
echo 81 il scrape basliyor. Bu pencereyi KAPATMA.
echo Log: logs\emlakjet-81il-resume.log
echo.
node scripts\emlakjet-scrape-full.mjs >> logs\emlakjet-81il-resume.log 2>&1
echo.
echo BITTI. Sonraki: RUN-SCRAPE-973ILCE.bat
pause
