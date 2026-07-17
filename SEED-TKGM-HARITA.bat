@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM  TKGM Analiz Seed — Likidite Haritası Veri Dolumu
REM
REM  Ne yapar:
REM    1. TKGM analiz API'sinden 973 ilçe için satış noktalarını çeker
REM    2. SQL dosyasına yazar (tkgm-analiz-data-{tip}-{yil}.sql)
REM    3. Wrangler ile D1'a yükler
REM    4. Harita anında dolar
REM
REM  Süre: ~2-3 saat (2sn/ilçe × ~957 ilçe)
REM  TKGM günlük limit varsa yarıda durur — bat'ı tekrar çalıştırınca
REM  kaldığı yerden devam eder (resume destekli)
REM
REM  Kullanım:
REM    Sadece çalıştır — wrangler login yapılmış olmalı
REM ─────────────────────────────────────────────────────────────────────────────

REM Analiz tipi: 1=Alım-Satım 2=Ana Taşınmaz Satış 3=Ana Taşınmaz İpotekli
REM              4=Bağımsız Bölüm Satış 5=Bağımsız Bölüm İpotekli
set TIP=1
set YIL=2024

REM Sadece bir il seed etmek için: set IL=34 (İstanbul)
set IL=

echo.
echo  TKGM Analiz Seed — Tip=%TIP% Yil=%YIL%
echo  Tum 81 il cekiliyor... (resume destekli)
echo.

REM ── Adım 1: TKGM'den çek, SQL üret ─────────────────────────────────────────
if "%IL%"=="" (
  node scripts/tkgm-analiz-seed.mjs --tip %TIP% --yil %YIL%
) else (
  node scripts/tkgm-analiz-seed.mjs --tip %TIP% --yil %YIL% --il %IL%
)

if %ERRORLEVEL% EQU 2 (
  echo.
  echo  [!] TKGM gunluk limit doldu. Yarin tekrar calistir.
  echo  [!] Kaldigi yerden devam eder.
  pause
  exit /b 2
)

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo  [HATA] Seed scripti basarisiz oldu.
  pause
  exit /b 1
)

REM ── Adım 2: SQL dosyasını D1'a yükle ────────────────────────────────────────
set SQL_DOSYA=scripts/tkgm-analiz-data-%TIP%-%YIL%.sql

if not exist "%SQL_DOSYA%" (
  echo  [HATA] SQL dosyasi bulunamadi: %SQL_DOSYA%
  pause
  exit /b 1
)

echo.
echo  D1 yuklemesi basliyor: %SQL_DOSYA%
echo.

cd backend\api
npx wrangler d1 execute cadastrum-db --remote --file=..\..\%SQL_DOSYA%
cd ..\..

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo  [HATA] D1 yukleme basarisiz.
  echo  Manuel yuklemek icin:
  echo    cd backend\api
  echo    npx wrangler d1 execute cadastrum-db --remote --file=..\..\%SQL_DOSYA%
  pause
  exit /b 1
)

echo.
echo  ============================================
echo   Tamamlandi! Harita artik dolu olmali.
echo   Kontrol: https://cadastrum.com.tr/harita
echo  ============================================
echo.
pause
