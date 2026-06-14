@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist logs mkdir logs
title Cadastrum — 973 ilce scrape
echo 973 ilce x arsa+tarla. Bu pencereyi KAPATMA (gunler surebilir).
echo Log: logs\emlakjet-973ilce.log
echo.
node scripts\emlakjet-scrape-turkiye.mjs >> logs\emlakjet-973ilce.log 2>&1
echo.
echo BITTI. D1: SEED-EMLAKJET-TURKIYE.bat
pause
