# Cadastrum — SaaS Business Plan v2

**Karar tarihi:** 2026-05-02
**Güncelleme:** 2026-05-04
**Durum:** Bireysel + Kurumsal SaaS yönü onaylandı · Ödeme: LemonSqueezy · Para birimi: USD

---

## Tier yapısı

### Tier 0 — Free
- TKGM parsel sorgu (sınırsız)
- Sahibinden ilan tespit + doğrulama
- Heuristic fiyat tahmini (tek parsel)
- Bölge profili: max 0.5 km², 5 tarama/ay
- 5 favori, 50 geçmiş kaydı
- 1 saved scan
- Tek cihaz, sync yok
- AI fiyat: kilit
- Reklam yok

### Tier 1 — Bireysel Pro
**Fiyat: $9/ay · $85/yıl (%21 indirim)**

Free'ye ek:
- Sınırsız favori, geçmiş, bölge profili, saved scan
- **Limitsiz TKGM Sorgu:** TKGM IP engelini aşan özel proxy sunucu rotasyonu
- AI fiyat tahmini (kendi key veya 100 sorgu/ay quota)
- Güneş + Tarım modülleri
- TKGM resmi heatmap overlay
- Sahibinden mahalle TL/m² join
- Watchlist + e-posta uyarı
- PDF rapor (1 sayfa kişisel)
- Cloud sync (3 cihaz)
- 7 gün ücretsiz deneme

### Tier 2 — Kurumsal Standart
**Fiyat: $29/kullanıcı/ay · min 3 kullanıcı ($87/ay minimum)**

Pro'ya ek:
- Multi-user + ekip paylaşımı
- Müşteri/proje organizasyonu
- **Limitsiz TKGM Sorgu:** Kurumsal seviye dedicated IP proxy rotasyonu
- Profesyonel PDF rapor (logo + brand + 15-20 sayfa)
- Çoklu parsel karşılaştırma (4-10 parsel)
- Risk skorlama (deprem, sit, orman, 2-B)
- Manuel imar entry + max yapı hesabı
- Yatırım fırsat dashboard
- 14 gün deneme + onboarding
- 1000 AI sorgu/kullanıcı/ay

### Tier 3 — Kurumsal Pro
**Fiyat: Talep üzerine (~$150-500/ay)**

Standart'a ek:
- Tapu sicil entegrasyon (anlaşmalı sağlayıcı)
- Comp set advanced (TÜİK kapanış fiyatları)
- API access
- 3D görselleştirme
- Bulk import (CSV)
- Excel/PowerBI bağlayıcı
- Dedicated support + SLA
- On-prem opsiyon

---

## Teknik altyapı

- **Backend:** Supabase (Postgres + Auth + RLS + Storage)
- **Proxy Pipeline (Limit Bypass):** Supabase Edge Function + SmartProxy/BrightData rotasyonlu IP ağı (Pro kullanıcıların TKGM 403 limitini aşması için)
- **Ödeme:** LemonSqueezy (Merchant of Record — KDV/fatura halleder, TR kart destekler)
- **Lisans:** LemonSqueezy webhook → Supabase'de kayıt → JWT token → Extension her açılışta doğrular
- **Sync:** Opt-in, encrypted at rest
- **Privacy:** Free tier hiç bulutta veri tutmaz

### LemonSqueezy Entegrasyon Akışı

```
Kullanıcı "Pro'ya Geç" → LemonSqueezy Checkout (overlay/link)
  → Ödeme başarılı → LemonSqueezy webhook → Supabase Edge Function
  → Supabase'de lisans kaydı → Extension'a JWT gönder
  → Extension her açılışta Supabase'den tier doğrula
```

---

## Sprint planı

### Sprint 1 — Lisans framework ✅ TAMAMLANDI
- [x] BUSINESS_PLAN.md
- [x] lib/lisans.ts — tier enum + features + limits
- [x] hook useLisans()
- [x] PaywallKilit component
- [x] Feature gate wiring (favori, scan, AI)
- [x] Mock tier picker (Settings'te)
- [x] Limit enforcement (favori 5, scan/ay 5)

### Sprint 2 — Backend foundation
- [ ] Supabase project + schema (users, licenses, sync)
- [ ] Auth UI (giriş, kayıt, şifre sıfırlama)
- [ ] Lisans validation (Supabase → JWT → Extension)
- [ ] Cloud sync wrapper (favori/scan/ayarlar)

### Sprint 3 — Ödeme (LemonSqueezy)
- [ ] LemonSqueezy product + variant tanımları ($9 Pro, $29 Kurumsal)
- [ ] Checkout link / overlay entegrasyonu
- [ ] Webhook handler (Supabase Edge Function)
- [ ] Trial expiry handling (7 gün Pro, 14 gün Kurumsal)
- [ ] Plan değişiklik (upgrade/downgrade/cancel)

### Sprint 4 — Bireysel Pro launch
- [ ] PDF rapor (kişisel format)
- [ ] E-posta uyarı (Postmark/Resend)
- [ ] Marketing landing page
- [ ] Chrome Web Store listing
- [ ] Privacy policy + KVKK + ToS

### Sprint 5 — Kurumsal feature
- [ ] Multi-user + workspace
- [ ] Risk skorlama (AFAD deprem + sit + orman)
- [ ] Çoklu parsel karşılaştırma
- [ ] Profesyonel PDF
- [ ] Manuel imar entry

---

## Yıllık projeksiyon (USD bazlı)

| Yıl | Free | Bireysel Pro | Kurumsal | ARR (USD) |
|---|---|---|---|---|
| 1 | 5K | 200 | 5 şirket | ~$30K |
| 2 | 25K | 2.000 | 30 şirket | ~$290K |
| 3 | 75K | 5.000 | 80 şirket | ~$700K |

> **Not:** Kurumsal hesap ortalaması min 3 kullanıcı = $87/ay = $1.044/yıl/şirket.
> Yıl 3 Kurumsal katkı ~$835K tek başına.

---

## GTM kanalları

- Chrome Web Store organik (Free)
- YouTube emlak içerik pazarlama ("Bu arsa gerçekten o fiyata mı değer?")
- LinkedIn B2B outbound (GYO, SMYO, danışmanlık firmaları)
- ULIQ/REIDIN konferansları
- Free 14-gün pilot (Kurumsal)
- Diaspora TR yatırımcılar (USD ödemede avantaj)
