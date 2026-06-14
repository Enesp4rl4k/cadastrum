# Backend Custom Domain Setup

Şu anda backend `https://cadastrum-api.cadastrum-tr.workers.dev/v1` URL'sinde çalışıyor (workers.dev subdomain). İdeal olarak `https://api.cadastrum.com.tr/v1` kullanmak istiyoruz çünkü:

1. **Marka tutarlılığı** — cadastrum.com.tr ekosistemi tek domain altında
2. **Daha temiz URL** (`api.cadastrum.com.tr` vs `cadastrum-api.cadastrum-tr.workers.dev`)
3. **DNS ile failover esnekliği** — ilerideki migration için
4. **Extension/site bundle'larında URL hardcode'larından bağımsızlık**

## Ön Koşullar

- `cadastrum.com.tr` domain'i sahip
- Cloudflare hesabında DNS yönetimi (Domain Cloudflare nameserver'ları kullanıyor olmalı)
- Şu an workers.dev URL'si çalışıyor (test edildi)

## Adım 1: Domain'in Cloudflare'de Olduğunu Doğrula

[dash.cloudflare.com](https://dash.cloudflare.com) → "Websites" → `cadastrum.com.tr` listede olmalı.

**Yoksa:**
1. "Add a site" → `cadastrum.com.tr` yaz → Free plan seç
2. Domain registrar'ında nameserver'ları Cloudflare'inki ile değiştir (örn `ada.ns.cloudflare.com`)
3. 24 saat propagation bekle

## Adım 2: Worker'a Custom Domain Bağla

[dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → **cadastrum-api** worker'ı seç.

**Settings → Triggers** sekmesi:

1. **Add Custom Domain** butonuna tıkla
2. Input: `api.cadastrum.com.tr` yaz
3. **Add Domain** → Cloudflare otomatik DNS kaydını ekler (CNAME) + SSL sertifikası oluşturur

Birkaç dakika içinde `https://api.cadastrum.com.tr/v1/health` çalışmaya başlar.

## Adım 3 (Alternatif): wrangler.toml ile

Manuel yerine kod ile yapmak istersen:

[backend/api/wrangler.toml](backend/api/wrangler.toml):

```toml
# Production: api.cadastrum.com (custom domain)
routes = [{ pattern = "api.cadastrum.com.tr/*", custom_domain = true }]
```

Sonra:

```cmd
cd C:\Users\parlak\Downloads\arsa-tkgm-extension\backend\api
```

```cmd
npx wrangler deploy
```

## Adım 4: Doğrulama

```cmd
curl https://api.cadastrum.com.tr/v1/health
```

Yanıt:

```json
{ "status": "ok", "env": "production", ... }
```

Sonra extension+site tarafında hardcoded URL'leri güncelle:

[src/lib/api-fiyat.ts](src/lib/api-fiyat.ts), [src/background/service-worker.ts](src/background/service-worker.ts), [src/sidepanel/components/BildirimKurali.tsx](src/sidepanel/components/BildirimKurali.tsx), [src/sidepanel/views/BootstrapView.tsx](src/sidepanel/views/BootstrapView.tsx), [src/lib/bias-kalibrasyon.ts](src/lib/bias-kalibrasyon.ts), [src/lib/ai-fiyat.ts](src/lib/ai-fiyat.ts), [src/background/scheduler.ts](src/background/scheduler.ts), [src/lib/deprem-tdth.ts](src/lib/deprem-tdth.ts), [manifest.config.ts](manifest.config.ts)

```
https://cadastrum-api.cadastrum-tr.workers.dev/v1
↓
https://api.cadastrum.com.tr/v1
```

`manifest.config.ts` host_permissions'a `https://api.cadastrum.com.tr/*` ekle.

`npm run build` + Chrome reload.

## Geri Düşürme

`api.cadastrum.com.tr` çalışmazsa workers.dev URL'si paralel olarak hâlâ aktif — extension fallback yapabilir. Risk düşük.

## SSL / Sertifika

Cloudflare otomatik SSL veriyor (Universal SSL). Custom cert gerekmiyor. Force HTTPS automatic.

## DNS Propagation Süresi

Cloudflare'de aynı hesapta custom domain bağlamak **5-10 saniye**. Farklı registrar'dan geçiyorsan **24 saat** sürebilir.

## Şu An Hangi Hesapta?

Mevcut deploy `cadastrum-tr.workers.dev` — kişisel Cloudflare hesabı. Eğer `cadastrum.com.tr` farklı bir hesapta (örn şirket veya eski personel) ise:

**Çözüm A**: Domain'i bu hesaba aktar (Cloudflare → Add a Site).

**Çözüm B**: Mevcut hesapta workers.dev'i markala — kalıcı kullan. Subdomain isim daha temiz olabilir:

```cmd
npx wrangler subdomain ...  # Eski wrangler'da, yeni 4'te dashboard
```

veya dashboard → Workers settings → "Subdomain" → `cadastrum-tr` yerine `cadastrum-api` gibi.
