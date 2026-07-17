@echo off
REM Cadastrum site deploy — çift tıkla çalıştır
REM
REM CLOUDFLARE_API_TOKEN ortam değişkenini ayarla:
REM   Yöntem 1: Bu dosyanın yanında DEPLOY-SITE-SECRET.bat oluştur (gitignore'da)
REM   Yöntem 2: Windows ortam değişkeni olarak kalıcı ayarla
REM   Yöntem 3: Çalıştırmadan önce: set CLOUDFLARE_API_TOKEN=cfut_xxx...
if "%CLOUDFLARE_API_TOKEN%"=="" (
  echo HATA: CLOUDFLARE_API_TOKEN ortam degiskeni ayarli degil.
  echo DEPLOY-SITE-SECRET.bat dosyasini olustur veya token'i elle ayarla.
  pause
  exit /b 1
)
cd /d "%~dp0site"
echo Building...
call npm run build
if errorlevel 1 (echo BUILD HATASI & pause & exit /b 1)
echo.
echo Deploying to Cloudflare Pages...
call npx wrangler pages deploy dist --project-name cadastrum-site --branch production
echo.
echo TAMAM. Site guncellendi: https://cadastrum.com.tr
pause
