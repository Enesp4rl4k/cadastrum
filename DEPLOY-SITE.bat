@echo off
REM Cadastrum site deploy — çift tıkla çalıştır
cd /d "%~dp0site"
echo Building...
call npm run build
if errorlevel 1 (echo BUILD HATASI & pause & exit /b 1)
echo.
echo Deploying to Cloudflare Pages...
call npx wrangler pages deploy dist --project-name cadastrum-site --branch main
echo.
echo TAMAM. Site guncellendi: https://cadastrum.com.tr
pause
