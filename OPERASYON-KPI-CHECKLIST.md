# Operasyon KPI Checklist

Bu checklist canlı operasyon doğruluğunu haftalık izlemek için hazırlanmıştır.

## KPI Kaynağı

- Admin panel → `Operasyon KPI` sekmesi
- API endpoint: `GET /v1/admin/operasyon-kpi?gun=7`

## Hedef Eşikler

- **Mahalle eşleşme oranı:** `>= 90%`
- **Fiyat medyan sapma oranı (arsa):** `<= 35%`
- **Veri eksik oranı:** `<= 15%`

## Durum Sınıflaması

- `IYI` → tüm eşikler sağlanıyor
- `IZLE` → kısmi sapma var, trend takip edilmeli
- `RISK` → operasyonda müdahale gerekir

## Haftalık Operasyon Rutini

1. Admin panelden son `7 gün` KPI değerlerini kaydet.
2. Eğer durum `IZLE` veya `RISK` ise:
   - `Veri Kalitesi` sekmesinde outlier ve eksik mahalle/m² sayılarını kontrol et.
   - `İlan Telemetri` sekmesinde kaynak dağılımını kontrol et.
3. `Mahalle eşleşme oranı < 90%` ise:
   - Son dönem parse değişikliği var mı kontrol et (`sahibinden/hepsiemlak` DOM)
   - Manuel düzeltme geri bildirimlerini alias havuzuna ekle.
4. `Fiyat medyan sapma oranı > 35%` ise:
   - Scrape hacmini artır (özellikle düşük örneklem ilçeler)
   - Aşırı uç (`outlier`) temizliği yap.
5. `Veri eksik oranı > 15%` ise:
   - Kaynak bazlı eksik alan analizi yap (`mahalle_norm`, `m2`)
   - Scraper/parse fallback zincirini gözden geçir.

## Go / No-Go Kuralı

- `IYI` iki hafta üst üste: normal operasyon.
- `IZLE` iki hafta üst üste: iyileştirme sprinti aç.
- `RISK` bir hafta bile görülürse: yeni feature deployunu durdur, veri doğruluk düzeltmesine öncelik ver.
