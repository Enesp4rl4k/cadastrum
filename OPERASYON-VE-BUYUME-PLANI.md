# Operasyonel Sıkılık & Pazar Payı Planı

**Tarih:** 2026-07-02
**Kapsam:** Cadastrum (extension + backend + site) — operasyonel güvenilirliği sertleştirip pazar payını büyütmek.
**Tez:** Bir gayrimenkul VERİ ürününde operasyonel sıkılık ile büyüme aynı şeydir — *doğruluk + güvenilirlik + güven* hem elde tutmayı hem de dönüşümü yönlendirir. Bu yüzden ops ve growth ayrı listeler değil, tek zincir.

Bu plan mevcut dokümanları (`ROADMAP.md`, `BUSINESS_PLAN.md`, `marketing/REKABET_ANALIZI.md`, `OPERASYON-KPI-CHECKLIST.md`) tekrar etmez; onların **kapatmadığı boşlukları** hedefler.

---

## A. Bulgular (ölçülen, tahmin değil)

| # | Bulgu | Kanıt | Etki |
|---|---|---|---|
| B1 | Extension ve backend'de **runtime hata izleme yok** | grep: `Sentry/captureException` yalnızca `site/Base.astro`'da | Scraper/parse kırılması, service-worker crash'i sessiz → körlemesine operasyon |
| B2 | Backend testleri **canlı API'ye** vuruyor | `test/proxy.spec.ts`, `auth.spec.ts` vb. `fetch(API)` | Deterministik değil; ağ/canlı-state ile kırılır; deploy güvenliği zayıf |
| B3 | **Soğuk-başlangıç doğruluğu düşük** | `data/backtest-rapor.json`: arsa ±%20 isabet ~%14, MAPE ~%131; tarla ±%20 ~%24 | Çekirdek değer vaadi + "Endeksa'dan doğru" iddiası riskte |
| B4 | Doğruluk **regresyon koruması yok** | backtest harness var ama CI'da koşmuyor (`.github/workflows/ci.yml`) | Bir refactor MAPE'yi bozar, kimse fark etmez |
| B5 | Veri boru hattı **kırılganlık sinyali vermiyor** | scraper aylık cron; parse başarı oranı canlı izlenmiyor | Sahibinden/Hepsiemlak DOM değişince veri sessizce çürür |
| B6 | **Paylaşılabilir rapor büyüme döngüsüne bağlı değil** | `src/lib/rapor-html.ts` yeni; SEO/OG/CTA yok | En güçlü viral kanal atıl |
| B7 | **Fiyatlandırma rakibin 5x'i** | `REKABET_ANALIZI.md`: Pro ₺499 vs Endeksa ₺99 | Dönüşüm engeli (kendi dokümanınız da işaretliyor) |
| B8 | **65.000 mahalle verisi programatik SEO'ya dönmemiş** | `MAHALLE_OZELLIK`, ilçe/mahalle baseline tabloları | Devasa organik trafik yüzeyi kullanılmıyor |

---

## B. Operasyonel Sıkılık (güven = ürünün kendisi)

### O1 — Gözlemlenebilirlik (observability) · **en yüksek öncelik**
Ücretli bağımlılık gerekmez (mevcut CF Worker + D1 yeter):
- Backend: `POST /v1/telemetri/hata` → D1 `hata_log(kaynak, mesaj, stack, surum, ts, meta)`. `app.onError` zaten var; oraya kalıcı yazma + günlük özet ekle.
- Extension: service-worker + content-script'lerde global `onerror`/`onunhandledrejection` yakala, **batch + throttle** ile backend'e gönder (PII yok, opt-out ayarı).
- **Parse-break kanaryası:** her scrape/parse'ta `parse_basari_orani`'nı kaynak (sahibinden/hepsiemlak) bazında yaz; oran < %80 düşerse admin'e e-posta (mevcut `emailGonder` altyapısı).
- Çıktı: admin panelde "Sistem Sağlığı" — hata hacmi, parse başarı trendi, kaynak dağılımı.

### O2 — Deterministik testler (deploy güvenliği)
- Canlı-API backend testlerini **`app.request()` + sahte D1** desenine taşı (`test/rapor.spec.ts` şablon). Öncelik: `auth`, `bildirim`, `emsal-spatial`, `fiyat`.
- Fiyat motorunun kritik yollarına birim testi (segment/imar/skew çarpan zinciri regresyon kilidi).
- Hedef: CI'da ağ bağımlılığı sıfır; her PR yeşil = güvenli deploy.

### O3 — Doğruluk regresyon kilidi (CI)
- `node scripts/backtest-baseline.mjs`'i CI'a ekle; MAPE/within20 bir eşiği **kötüleştirirse PR fail**. (baseline snapshot vs yeni.)
- Değerleme değişiklikleri artık ölçülmeden merge edilemez.

### O4 — Veri boru hattı SLO'ları
- Freshness dashboard: ilçe bazlı son taze emsal yaşı; TR enflasyonunda 180-gün cutoff'a yaklaşan ilçeler için otomatik scrape-önceliklendirme.
- Aylık cron → **sıcak ilçelerde haftalık**; parse-break'te otomatik yeniden dene.

### O5 — Release güvenliği
- `OPERASYON-KPI-CHECKLIST.md`'deki Go/No-Go'yu **otomatik alarma** bağla (RISK bir hafta → deploy freeze bildirimi).
- Sürüm rollback runbook'u + Web Store staged rollout (%20 → %100).

---

## C. Pazar Payı (dağıtım · dönüşüm · elde tutma)

### G1 — Paylaşılabilir rapor = **büyüme döngüsü** (bugünün işini kaldıraçla)
Bu, en yüksek getirili büyüme mekaniği ve altyapısı hazır (`/v1/rapor/:id`):
- Her paylaşılan rapor URL'i **markalı + OG/Twitter kartı + "Cadastrum ile oluşturuldu → ücretsiz analiz et" CTA'sı**.
- Emlakçı raporu müşteriye/WhatsApp'a atar → kurulmamış kullanıcı markalı sayfayı görür → install. Viral katsayı.
- Rapor sayfaları **indekslenebilir** (SEO): "Bodrum Yalıkavak 152/7 arsa değerleme" long-tail.
- Ölçüm: rapor→install dönüşümü, paylaşım başına görüntülenme.

### G2 — Programatik SEO (65k mahalle atıl varlık)
- Site'ta mahalle/ilçe başına **otomatik üretilen fiyat sayfası** (baseline + trend + güven). 65k mahalle = 65k long-tail sayfa.
- "X mahallesi arsa m² fiyatı" aramalarında organik akış → sıfır-CAC edinim. Endeksa'nın brand'ına karşı **kapsam** silahı.
- Teknik: statik üretim (Astro), aylık veri tazelemesinde rebuild.

### G3 — Fiyatlandırma düzeltmesi (dönüşüm engeli)
- `REKABET_ANALIZI.md` önerisini uygula: **Pro ₺249 / Pro+ ₺499 / Kurumsal ₺1.999**.
- Free tier'ı **edinim kaması** yap (ilan-akışında değer anı ücretsiz; AI/PDF/paylaşım Pro).

### G4 — Web Store & aktivasyon
- **Review motoru:** değer anından sonra (ilk başarılı analiz + rapor) in-app 5-yıldız prompt'u. Rakip "Sahibinden Parsel Sorgu" 5.0 → sosyal kanıt paritesi şart.
- Listing SEO (dokümandaki keyword'ler) + 30 sn demo video.
- Time-to-first-wow: ilk ilanda otomatik analiz + tek ekran onboarding.

### G5 — Konumlandırma
- "İlan-First Gayrimenkul AI" kategorisini sahiplen (doküman zaten öneriyor). Ama artık **kanıtla**: O3'ün ürettiği **public doğruluk sayfası** ("metodolojimiz + cross-validation MAPE") = güven = brand. Endeksa'nın %13 hatasına karşı şeffaflık silahı.

---

## D. 90 Günlük Sıralama

**Gün 0–30 — Operasyonel taban (körlüğü bitir):**
- O1 gözlemlenebilirlik + parse-break kanaryası
- O2 backend testlerini deterministik yap (kritik route'lar)
- O3 backtest'i CI'a regresyon kilidi olarak ekle

**Gün 30–60 — Doğruluk + büyüme motoru:**
- ML AVM v1 (LightGBM) → B3'ü kapat, "doğruluk" iddiasını rakamla destekle
- G1 paylaşılabilir rapor: OG/CTA/SEO + install dönüşüm ölçümü
- G3 fiyatlandırma düzeltmesi

**Gün 60–90 — Ölçek:**
- G2 programatik SEO mahalle sayfaları (65k long-tail)
- G4 review motoru + aktivasyon funnel enstrümantasyonu
- O4 veri freshness SLO + sıcak ilçe haftalık scrape

---

## E. Başarı Metrikleri (mevcut KPI'lara bağlı)

| Alan | Metrik | Bugün (tahmini) | 90-gün hedefi |
|---|---|---|---|
| Doğruluk | arsa ±%20 isabet (soğuk-başlangıç) | ~%14 | ≥ %30 (ML AVM) |
| Doğruluk | arsa medyan sapma (KPI eşiği ≤%35) | sınırda | ≤ %25 |
| Güvenilirlik | parse başarı oranı görünürlüğü | yok | canlı + alarm |
| Güvenilirlik | backend test determinizmi | canlı-API | %100 offline |
| Büyüme | rapor→install dönüşümü | 0 (ölçülmüyor) | ölçülür + optimize |
| Büyüme | organik SEO giriş sayfası | ~0 | 65k mahalle sayfası |
| Büyüme | Web Store rating | — | ≥ 4.5 (review motoru) |

---

## F. Tek Cümlelik Sonuç
En büyük tek hamle: **doğruluğu ML AVM ile kanıtlanabilir kıl** (O3+ML) ve **paylaşılabilir raporu viral döngüye çevir** (G1) — biri güveni, diğeri dağıtımı çözer; ikisi de bugün elimizdeki altyapının üstüne kurulur.
