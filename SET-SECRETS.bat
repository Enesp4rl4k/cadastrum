@echo off
cd /d "%~dp0backend\api"

echo ============================================
echo  Cloudflare Worker Secret Kurulum Sihirbazi
echo ============================================
echo.
echo Her secret icin bir deger girilmesi gerekiyor.
echo Rastgele guclu deger uretmek icin: openssl rand -hex 32
echo (veya herhangi guclu bir parola)
echo.
echo --- ADIM 1: SEED_SECRET ---
echo Bu secret /v1/baseline/seed endpoint'ini korur.
echo Asagidaki komut sizi deger girmeye davet edecek:
echo.
wrangler secret put SEED_SECRET
if %errorlevel% neq 0 (
  echo [HATA] SEED_SECRET set edilemedi!
  pause
  exit /b 1
)
echo [OK] SEED_SECRET set edildi.
echo.

echo --- ADIM 2: STATS_SECRET ---
echo Bu secret /v1/istatistik/refresh endpoint'ini korur.
echo.
wrangler secret put STATS_SECRET
if %errorlevel% neq 0 (
  echo [HATA] STATS_SECRET set edilemedi!
  pause
  exit /b 1
)
echo [OK] STATS_SECRET set edildi.
echo.

echo ============================================
echo  Mevcut secret'lari listele (degerler gizli)
echo ============================================
wrangler secret list
echo.
echo Tum secret'lar basariyla set edildi!
pause
