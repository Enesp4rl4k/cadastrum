# Backend Secrets Setup Rehberi

Cloudflare Worker'da hangi secret'ların set edilmesi gerektiğini ve nasıl ayarlanacağını gösterir.

## Mevcut Set Edilmiş Secret'lar

```
SCRAPER_API_SECRET   ✓  (Bootstrap toplu ilan upload yetkisi)
JWT_SECRET           ✓  (kayıt/giriş token imzası)
```

## Eksik / Önerilen Secret'lar

Aşağıdaki secret'lar set edilmediğinde ilgili özellik devre dışı kalır veya konsola log atar (fail-safe).

### 1. RESEND_API_KEY — Email gönderimi

Olmadan: kayıt/doğrulama/şifre sıfırlama mailleri sadece worker log'una yazılır, gerçek email gitmez.

```cmd
cd C:\Users\parlak\Downloads\arsa-tkgm-extension\backend\api
```

[resend.com](https://resend.com)'dan API key al, sonra:

```cmd
echo re_xxxxxxxxxxxxxxxx | npx wrangler secret put RESEND_API_KEY
```

### 2. GEMINI_API_KEY — AI fiyat tahmin (Google Gemini)

Olmadan: `/v1/ai-fiyat` endpoint'i 503 döner; extension AI tahmin disable.

[aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)'den ücretsiz API key al:

```cmd
echo AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXX | npx wrangler secret put GEMINI_API_KEY
```

### 3. GROQ_API_KEY — AI fiyat tahmin fallback (Llama 3.3)

Olmadan: Gemini başarısızsa fallback yok.

[console.groq.com/keys](https://console.groq.com/keys)'den al:

```cmd
echo gsk_XXXXXXXXXXXXXXXXXXXXXXXXX | npx wrangler secret put GROQ_API_KEY
```

### 4. LEMON_WEBHOOK_SECRET — LemonSqueezy ödeme webhook doğrulama

Olmadan: ödeme webhook'u imzasız kabul edilir → spoof riski.

LemonSqueezy Dashboard → Settings → Webhooks → Signing secret:

```cmd
echo whsec_XXXXXXXXXXXXXXXXXXXXX | npx wrangler secret put LEMON_WEBHOOK_SECRET
```

### 5. TCMB_EVDS_KEY — TCMB EVDS konut endeksi (opsiyonel)

Olmadan: TCMB endeksi cache'lenmez; her sorgu canlı API'den gider (rate limit riski).

[evds2.tcmb.gov.tr](https://evds2.tcmb.gov.tr) → kayıt ol → "Web Servis Şifresi" al:

```cmd
echo XXXXXXXX | npx wrangler secret put TCMB_EVDS_KEY
```

## Set Edilen Secret'ları Görüntüle

```cmd
cd C:\Users\parlak\Downloads\arsa-tkgm-extension\backend\api
```

```cmd
npx wrangler secret list
```

Çıktıda her secret'ın adı + son güncelleme tarihi görünür (değer asla görüntülenmez — Cloudflare encrypt).

## Secret Silme

```cmd
npx wrangler secret delete GEMINI_API_KEY
```

## Production Deploy Sonrası

Her secret değişiminden sonra `wrangler deploy` gerekli **DEĞİL** — secret'lar deploy'dan bağımsız (Cloudflare environment'a inject edilir). Ama secret eklendikten sonra ilk çağrıda Worker yeniden başlar.

## Yeni Hesaba Geçiş

Eğer Cloudflare hesabını değiştirirsen (örn şirket → kişisel), tüm secret'ları yeni hesapta yeniden set etmek zorundasın — encryption key'leri hesap bazında.

## Güvenlik Notu

- Secret değerleri commit edilmez (`.gitignore`'da `.dev.vars` ve `wrangler.toml`'un secret bölümleri yok).
- Secret rotation 90 günde bir önerilir.
- LemonSqueezy webhook secret özellikle hassas — spoof'la ücretsiz Pro tier verilebilir.
