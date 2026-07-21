# Cadastrum — Ödeme Sistemi Aktivasyon Kılavuzu

Bu adımları sırayla tamamla. Kod değişiklikleri hazır — sadece external service kurulumları ve secret'lar gerekiyor.

---

## ADIM 1 — Resend (e-posta) Kurulumu

1. [resend.com](https://resend.com) → üye ol (ücretsiz, 100 mail/gün)
2. API Keys → Create API Key → kopyala
3. Domains → `cadastrum.com.tr` doğrula (DNS TXT kaydı ekle)

---

## ADIM 2 — LemonSqueezy Ürün Kurulumu

1. [lemonsqueezy.com](https://lemonsqueezy.com) → store oluştur: `cadastrum`
2. **Products → New Product → Pro**
   - Name: `Cadastrum Pro`
   - Price: ₺499/ay (recurring monthly)
   - Yıllık: ₺4999/yıl (recurring yearly)
   - 7 gün trial işaretle
   - Variant ID'yi kaydet: `PRO_MONTHLY_VARIANT_ID` ve `PRO_YEARLY_VARIANT_ID`
3. **Products → New Product → Pro+**
   - Name: `Cadastrum Pro+`
   - Price: ₺999/ay (recurring monthly)
   - Yıllık: ₺9999/yıl
   - Variant ID'yi kaydet: `PROPLUS_MONTHLY_VARIANT_ID`
4. **Settings → Webhooks → Create**
   - URL: `https://cadastrum-api.cadastrum-tr.workers.dev/v1/lemon/webhook`
   - Events: subscription_created, subscription_updated, subscription_cancelled, subscription_resumed, subscription_expired, subscription_payment_failed
   - Signing Secret'ı kopyala

---

## ADIM 3 — backend/api/src/routes/lemon.ts güncelle

Variant ID'leri doldur:

```typescript
const VARIANT_TIER: Record<string, "pro" | "pro_plus" | "kurumsal"> = {
  "PRO_MONTHLY_VARIANT_ID":    "pro",
  "PRO_YEARLY_VARIANT_ID":     "pro",
  "PROPLUS_MONTHLY_VARIANT_ID": "pro_plus",
  "PROPLUS_YEARLY_VARIANT_ID":  "pro_plus",
};
```

---

## ADIM 4 — Site .env güncelle

`site/.env` dosyasına ekle (yoksa oluştur):

```
PUBLIC_LEMON_PRO_VARIANT=PRO_MONTHLY_VARIANT_ID
PUBLIC_LEMON_PROPLUS_VARIANT=PROPLUS_MONTHLY_VARIANT_ID
```

---

## ADIM 5 — Wrangler Secret'ları Set Et

```powershell
cd backend\api

# JWT Secret (rastgele üret)
$jwt = -join ((48..57) + (97..102) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
echo $jwt
# Çıktıyı kopyala, sonra:
npx wrangler secret put JWT_SECRET
# Prompt'a yapıştır

# Resend API Key
npx wrangler secret put RESEND_API_KEY
# Resend dashboard'dan kopyaladığın key'i gir

# LemonSqueezy Webhook Secret
npx wrangler secret put LEMON_WEBHOOK_SECRET
# LS dashboard'dan kopyaladığın signing secret'ı gir
```

---

## ADIM 6 — KV Namespace Oluştur

```powershell
cd backend\api
npx wrangler kv:namespace create "RATE_LIMIT_KV"
```

Çıktı şöyle görünür:
```
{ binding = "RATE_LIMIT_KV", id = "abcdef1234567890abcdef1234567890" }
```

`backend/api/wrangler.toml` içindeki şu satırı güncelle:
```toml
[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "BURAYA_CIKTI_ID_YAPISTIR"
```

---

## ADIM 7 — D1 Migration Çalıştır

```powershell
cd backend\api
npx wrangler d1 execute cadastrum-db --remote --file=src/db/0020_kullanicilar_tam.sql
```

Doğrula:
```powershell
npx wrangler d1 execute cadastrum-db --remote --command="SELECT name FROM sqlite_master WHERE type='table' AND name IN ('kullanicilar','giris_denemesi')"
```

---

## ADIM 8 — Backend Deploy

```powershell
cd backend\api
npx wrangler deploy
```

Canlı test:
```powershell
curl https://cadastrum-api.cadastrum-tr.workers.dev/v1/health
```

---

## ADIM 9 — Site Deploy

```powershell
DEPLOY-SITE.bat
```

veya:
```powershell
cd site
npx astro build
npx wrangler pages deploy dist --project-name=cadastrum-site
```

---

## ADIM 10 — E2E Test

Sırayla test et:

1. **Kayıt**: `https://cadastrum.com.tr/kayit` → email + şifre → doğrulama kodu mail geldi mi?
2. **Giriş**: `https://cadastrum.com.tr/giris` → extension'da HesapDurumu "Free" göstermeli
3. **Checkout**: `/fiyat` → "7 gün ücretsiz dene" → LemonSqueezy overlay açılmalı
4. **Webhook test**: LS dashboard → Webhooks → Send test event → D1'de tier değişti mi?
   ```powershell
   cd backend\api
   npx wrangler d1 execute cadastrum-db --remote --command="SELECT email, tier, tier_bitis FROM kullanicilar LIMIT 5"
   ```
5. **Extension sync**: Hesap sayfasından giriş → extension panelinde tier rozeti güncellenmeli

---

## Özet — Ne Değişti (Kod)

| Dosya | Değişiklik |
|-------|-----------|
| `src/lib/lisans.ts` | `cadastrum_kullanici` storage'dan backend tier okur; `onChanged` dinleyici tier değişince yeniler |
| `src/sidepanel/components/AbonelikYonetimi.tsx` | "Şimdi yükselt" → `cadastrum.com.tr/fiyat` LemonSqueezy checkout'a yönlendirir |
| `src/sidepanel/components/RaporExportButonu.tsx` | Free tier → kilitli görünüm + Pro CTA |
| `src/sidepanel/components/BildirimKurali.tsx` | `watchlist-uyari` lisans kapısı eklendi |
| `backend/api/src/db/0020_kullanicilar_tam.sql` | idempotent migration (tablo yoksa oluştur) |
| Silindi | `console.error(e.message` dosyası, `eplan_cookie.txt` |
