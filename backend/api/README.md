# Cadastrum API

Türkiye gayrimenkul fiyat verisi REST API'si — Hono.js + Cloudflare Workers + D1.

## Endpoint'ler

```
GET  /v1/health
GET  /v1/fiyat/mahalle/:il/:ilce/:mahalle?kategori=arsa
GET  /v1/fiyat/ilce/:il/:ilce?kategori=arsa
GET  /v1/fiyat/il/:il?kategori=arsa
POST /v1/ilan          # Tek ilan kaydı (rate-limited: 100/saat/IP)
POST /v1/ilan/batch    # Toplu (max 100, scraper Bearer auth ile)
GET  /v1/istatistik/refresh?secret=XXX  # Manuel refresh
```

## Lokal geliştirme

```bash
cd backend/api
npm install
npm run db:migrate-local   # Lokal D1'e schema yükle
npm run dev                 # http://localhost:8787
```

## Production deploy

```bash
# 1. Cloudflare hesabına giriş
npx wrangler login

# 2. D1 database oluştur
npm run db:create
# Output'taki database_id'yi wrangler.toml'a yaz

# 3. Schema yükle
npm run db:migrate

# 4. Secret kaydet (scraper batch auth için)
npx wrangler secret put SCRAPER_API_SECRET
# Random string gir (örn: openssl rand -hex 32 ile üret)

# 5. Deploy
npm run deploy
# Output: https://cadastrum-api.<account>.workers.dev

# 6. (Opsiyonel) Custom domain bağla
# Cloudflare Dashboard → Workers → Triggers → Custom Domains
# api.cadastrum.com → cadastrum-api worker
```

## Tüketim örnekleri

```bash
# Health
curl https://cadastrum-api.workers.dev/v1/health

# Mahalle fiyat
curl "https://cadastrum-api.workers.dev/v1/fiyat/mahalle/balikesir/bandirma/yali?kategori=arsa"

# İlan ingest (extension)
curl -X POST https://cadastrum-api.workers.dev/v1/ilan \
  -H "Content-Type: application/json" \
  -d '{
    "kaynak": "extension",
    "ilan_no": "987654321",
    "il": "Balıkesir",
    "ilce": "Bandırma",
    "mahalle": "Yalı",
    "fiyat_per_m2": 8400,
    "m2": 920,
    "kategori": "arsa"
  }'
```

## Mimari

```
[Extension/Scraper] → POST /v1/ilan → ilanlar (raw)
                                          ↓
                            Cron (her gün 03:00 UTC)
                                          ↓
                            mahalle_istatistik / ilce_istatistik / il_istatistik
                                          ↓
              GET /v1/fiyat/* ←── Public API (CDN cache 1 saat)
```

D1 free tier: 5GB storage, 5M reads/gün, 100K writes/gün — başlangıç için fazlasıyla yeterli.
