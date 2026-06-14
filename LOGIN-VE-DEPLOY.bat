@echo off
chcp 65001 >nul
cd /d "%~dp0site"

echo ============================================
echo  CADASTRUM SITE - LOGIN + DEPLOY
echo ============================================
echo.

echo [1/5] Eski hesap cache temizleniyor...
if exist "node_modules\.cache\wrangler" rmdir /s /q "node_modules\.cache\wrangler"

echo.
echo [2/5] Site build ediliyor...
call npm run build
if errorlevel 1 (echo BUILD HATASI & pause & exit /b 1)

echo.
echo [3/5] Hesap secimi - TARAYICI ACILACAK
echo   ONEMLI: cadastrum.com.tr'nin sahibi olan hesabi sec!
echo   (Hangi hesapta oldugunu bilmiyorsan ikisini de dene)
echo.
call npx wrangler logout 2>nul
call npx wrangler login
if errorlevel 1 (echo LOGIN HATASI & pause & exit /b 1)

echo.
echo [4/5] Hesap dogrulaniyor...
call npx wrangler whoami

echo.
echo [5/5] Proje olusturuluyor (varsa atlanir) + deploy...
call npx wrangler pages project create cadastrum-site --production-branch main 2>nul
call npx wrangler pages deploy dist --project-name cadastrum-site --branch main
if errorlevel 1 (echo DEPLOY HATASI - yukaridaki mesaja bak & pause & exit /b 1)

echo.
echo ============================================
echo  TAMAM. Yukaridaki URL'de site canli.
echo  Eger cadastrum.com.tr guncellenmediyse,
echo  yanlis hesaba giris yapmis olabilirsin.
echo ============================================
pause
