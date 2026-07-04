# Faz A — Veri Derinliği Pipeline

Heyelan proxy hariç statik dataset + canlı ilan verisi.

## Statik dataset (extension)

```bash
npm run data:faz-a
# veya tek tek:
npm run data:osb
npm run data:nufus
npm run data:taskin
npm run build
```

| Script | Kaynak | Çıktı |
|--------|--------|-------|
| `osb-uret.mjs` | OSM Overpass + mevcut liste | `src/lib/data/osblar.ts` |
| `nufus-uret.mjs` | TÜİK CSV + OSM population | `src/lib/data/mahalle-nufus.ts` |
| `taskin-proxy-uret.mjs` | OSM waterway + il tablosu | `src/lib/data/mahalle-taskin.ts` |

### TÜİK nüfus CSV

1. https://nip.tuik.gov.tr/Home/Adnks adresinden mahalle düzeyi nüfus indir
2. `data/tuik-adnks-mahalle.csv` olarak kaydet (şablon: `data/tuik-adnks-mahalle.csv.example`)
3. `npm run data:nufus`

CSV yoksa script OSM `population` tag + şehir mahalleleri için il düzeyi tahmin kullanır.

## Canlı ilan (D1)

```bash
# Ön koşul
export SCRAPER_API_SECRET="..."   # Hepsiemlak batch için

# Tam pipeline (saatler sürebilir)
node scripts/turkiye-tam-veri.mjs

# veya
npm run data:ilan
```

D1 yükleme (Windows):

- `SEED-EMLAKJET-FULL.bat` — 81 il
- `SEED-EMLAKJET-TURKIYE.bat` — 973 ilçe detay

Doğrulama:

```bash
cd backend/api
npx wrangler d1 execute cadastrum-db --remote --command="
  SELECT kaynak, kategori, COUNT(*) c FROM ilanlar WHERE aktif=1 GROUP BY kaynak, kategori"
```

## Motor entegrasyonu

- **OSB** → `statik-lojistik.ts` → lojistik skoru
- **Nüfus** → `nufus.ts` → `baseline-engine.ts` + `fiyat-tahmin.ts`
- **Taşkın proxy** → `taskin-risk.ts` → `parselTaskinRiskiGetir()`
- **D1 ilanlar** → cron istatistik → `api-fiyat.ts`
