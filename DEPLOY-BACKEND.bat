@echo off
chcp 65001 >nul
cd /d "%~dp0backend\api"
echo ============================================
echo  BACKEND DEPLOY (login + deploy)
echo ============================================
echo.
echo [1/3] Login - TARAYICI ACILACAK (eparlak996 hesabini sec)
call npx wrangler login
echo.
echo [2/3] Hesap dogrulaniyor...
call npx wrangler whoami
echo.
echo [3/3] Deploy...
call npx wrangler deploy
echo.
echo TAMAM. Backend guncellendi (koordinat backfill aktif).
pause
