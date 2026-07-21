# Cadastrum — Geliştirme ve Tam Veri Çekme Planı

> Güncelleme: Mayıs 2026 · Hedef: gerçek arsa/tarla ilan fiyatlarını tüm kaynaklardan toplayıp D1 + fiyat motoruna beslemek.

---

## Mevcut durum (özet)

| Alan | Durum |
|------|--------|
| Extension + fiyat motoru | ✅ 119 test, build OK |
| Mahalle baseline (sentetik) | ✅ ~52k mahalle (KNN/kırsal ağırlıklı) |
| Gerçek ilan verisi (D1) | ⚠️ Eksik / parçalı — scraper’lar hazır, tam koşu bekliyor |
| Kaynaklar | Emlakjet (fetch), Hepsiemlak (Puppeteer), Sahibinden (Puppeteer, bot riski) |

---

## Faz 0 — Veri çekme sprint (şimdi, 1–3 gün)

**Amaç:** Mümkün olan en geniş gerçek arsa + tarla `fiyat_per_m2` tabanı.

### Sıra (öncelik = bot riski düşük → yüksek)

| # | Kaynak | Script | Çıktı | Süre (tahmini) |
|---|--------|--------|-------|----------------|
| 1 | **Emlakjet 81 il** | `emlakjet-scrape-full.mjs` | `scripts/emlakjet-data-full.sql` | 4–8 saat |
| 2 | D1 yükle | `SEED-EMLAKJET-FULL.bat` | `ilanlar` tablosu | 10–30 dk |
| 3 | **Hepsiemlak** (80 ilçe) | `aylik-scrape-hepsiemlak.mjs` × arsa + tarla | API `/ilan/batch` | 6–12 saat |
| 4 | **Sahibinden** (80 ilçe) | `aylik-scrape.mjs` × arsa + tarla | API `/ilan/batch` | 6–12 saat (bot’a bağlı) |
| 5 | İstatistik | otomatik `mahalle_istatistik` refresh | backend | ~5 dk |

**Tek komut (81 il + 973 ilçe):** `TURKIYE-TAM-VERI.bat` veya `node scripts/turkiye-tam-veri.mjs`

### Ön koşullar

```powershell
cd C:\Users\parlak\Downloads\arsa-tkgm-extension
npm install
# Backend scraper auth (Hepsiemlak + Sahibinden için):
$env:SCRAPER_API_SECRET = "<SET-SCRAPER-SECRET.bat çıktısındaki değer>"
# Wrangler (D1 seed için):
cd backend\api; npx wrangler login
```

### Doğrulama

```powershell
cd backend\api
npx wrangler d1 execute cadastrum-db --remote --command="SELECT kaynak, kategori, COUNT(*) c FROM ilanlar WHERE aktif=1 GROUP BY kaynak, kategori"
```

Beklenen: `ej_%` (Emlakjet), `hepsiemlak`, `extension` (Sahibinden) satırları; arsa + tarla kategorileri.

---

## Faz 1 — Scraping sonrası kalite kontrol (AI YOK)

> **Karar:** Gemini/Groq mahalle baseline üretimi durduruldu (8500/12000 şablon veri).  
> Tek güvenilir kaynak: Emlakjet + Hepsiemlak + Sahibinden scraping → D1.

| Görev | Açıklama |
|-------|----------|
| Emlakjet 81 il tamamla | `emlakjet-scrape-full.mjs` → `SEED-EMLAKJET-FULL.bat` |
| Kalite kontrol | `VERI-KALITE.bat` — outlier, kategori, mahalle yoğunluğu |
| Baseline TS yenile (AI hariç) | `node scripts/baseline-ts-uret.mjs` |
| Extension build | `npm run build` |
| Hepsiemlak + Sahibinden | `SCRAPER_API_SECRET` ile API batch |
| Key audit | Bandırma Yalı vb. normalize boşlukları |
| Outlier filtre | QC raporu + mevcut IQR (fiyat motoru) |

---

## Faz 2 — Kapsam genişletme (2–4 hafta)

| Görev | Açıklama |
|-------|----------|
| **973 ilçe** Sahibinden bootstrap | `BOOTSTRAP_ILCE_LISTESI` + extension arka plan tarama |
| Emlakjet ilçe bazlı | Yoğun illerde il-ilçe URL (mevcut `emlakjet-scrape.mjs` 10 il) |
| Konut hariç tutma | Sadece arsa/tarla/bahce/zeytinlik (Hepsiemlak slug filtresi) |
| Aylık cron | Task Scheduler + `aylik-scrape-baslat.bat` (arsa+tarla döngüsü) |
| D1 yedek | `npm run d1-backup` |

---

## Faz 3 — Ürün / kalite (ROADMAP ile uyumlu)

Ürün / AI öncelik sırası için bak: [`ROADMAP.md`](./ROADMAP.md) → **Ürün / AI Yol Haritası** (P1–P6, Faz A–C):

1. AI gelecek değer skoru  
2. AI arazi avcısı  
3. Arsa TradingView grafikleri  
4. AI yatırım danışmanı chat  
5. İmar değişikliği tahmini  
6. Arsa dijital ikizi  

Veri / kalite paralel:

- Sel/taşkın, nüfus (statik dataset)
- Onboarding, responsive, Dexie v12
- API tokens / müşteri paneli
- Chrome Web Store v0.4

---

## Kaynak stratejisi

```
                    ┌─────────────────┐
                    │  D1 ilanlar     │
                    └────────▲────────┘
                             │
     ┌───────────────────────┼───────────────────────┐
     │                       │                       │
 Emlakjet (81 il)      Hepsiemlak (ilçe)      Sahibinden (ilçe)
 bot yok, SQL          Puppeteer+API          Puppeteer+API
 arsa+tarla            arsa+tarla             arsa+tarla
     │                       │                       │
     └───────────────────────┴───────────────────────┘
                             │
                    mahalle_istatistik refresh
                             │
                    fiyat-tahmin / spatial emsal
```

**Kural:** Gerçek ilan varsa baseline’ın üzerine yazılır; yoksa sentetik baseline devreye girer.

---

## Riskler

| Risk | Önlem |
|------|--------|
| Sahibinden PerimeterX | `headless=false`, residential IP, Hepsiemlak/Emlakjet öncelik |
| Cloudflare (Hepsiemlak) | Anasayfa session, 8s ilçe arası bekleme |
| Rate limit | Checkpoint (Emlakjet her il), batch max 100 |
| Secret sızıntısı | `.gitignore`, env var, batch’te commit yok |

---

## Başarı kriterleri (Faz 0)

- [ ] D1’de ≥ 50.000 aktif arsa+tarla ilan satırı (kaynaklar toplamı)
- [ ] ≥ %40 mahalle eşleşmeli koordinat (`lat` dolu veya mahalle_norm + merkez)
- [ ] `/sorgu` test: İstanbul Kadıköy, Bodrum, Bandırma — gerçek emsal sayısı > 0
- [ ] `mahalle_istatistik` refresh tamamlandı

---

## Hızlı komutlar

```bat
REM Tam pipeline (Emlakjet + opsiyonel API scraper'lar)
TAM-VERI-CEK.bat

REM Sadece Emlakjet 81 il (secret gerekmez)
node scripts\emlakjet-scrape-full.mjs

REM SQL yükle
SEED-EMLAKJET-FULL.bat

REM Tek il test
node scripts\aylik-scrape.mjs --il=istanbul --ilce=sile --kategori=tarla --maks-ilan=5 --headless=false
```
