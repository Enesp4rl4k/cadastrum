@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  EMLAKJET 81 IL TAM TARAMA (baseline genisletme)
echo ============================================
echo  81 il x (arsa+tarla) x 8 sayfa.
echo  ~4-6 saat surer, arka planda. Her il sonrasi kaydedilir.
echo  Cikti: scripts/emlakjet-data-full.sql
echo ============================================
echo.
node scripts\emlakjet-scrape-full.mjs
echo.
echo TAMAM. Yukle: wrangler d1 execute cadastrum-db --remote --file=scripts/emlakjet-data-full.sql
pause
