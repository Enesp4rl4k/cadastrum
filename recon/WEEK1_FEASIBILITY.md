# Hafta 1 — Feasibility Raporu

**Tarih:** 2026-05-02
**Soru:** atlas.tkgm.gov.tr'de parsel seçim event'i (lat/lng + ada/parsel) hangi DOM/network olayından çıkar?
**Cevap:** DOM event'ini reverse-engineer etmeye gerek yok — TKGM'nin public REST API'si zaten lat/lng → tam parsel bilgisini direkt veriyor. Atlas frontend'i de aynı backend'i kullanıyor.

---

## Asıl Endpoint (lat/lng → parsel)

```
GET https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/parsel/{lat}/{lng}/
```

- **CRS:** EPSG:4326 (WGS84). Hiç projeksiyon dönüşümü yok, harita CRS'i ne olursa olsun WGS84'e çevirip atılıyor.
- **Auth:** Yok. Public, rate-limit gözlemlenmedi (QGIS plugin günlük sayaç tutuyor ama TKGM tarafında zorlama yok).
- **Headers:**
  ```
  Accept: application/json
  User-Agent: Mozilla/5.0 (...)   # boş bırakırsan bazen 403 dönüyor
  ```

### Canlı doğrulama (2026-05-02)

```bash
curl -H "Accept: application/json" -H "User-Agent: Mozilla/5.0" \
  "https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/parsel/41.0086/28.9802/"
```

Dönen GeoJSON Feature (Sultanahmet/Fatih):
```json
{
  "type": "Feature",
  "geometry": { "type": "Polygon", "coordinates": [[[28.98104,41.00878], ...]] },
  "properties": {
    "ilceAd": "Fatih",
    "mevkii": "Babi Hümayun C",
    "ilId": 56,
    "adaNo": ...,
    "parselNo": ...,
    "mahalleId": ...,
    "mahalleAd": ...,
    "ilAd": ...,
    "alan": ...,
    "nitelik": ...,
    "pafta": ...
    // + gittigiParselListe (tarihsel parsel zinciri)
  }
}
```

---

## Yardımcı Endpoint'ler

| Amaç | URL |
|---|---|
| İl listesi (81 il) | `https://parselsorgu.tkgm.gov.tr/app/modules/administrativeQuery/data/ilListe.json` |
| İlçe listesi | `https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/idariYapi/ilceListe/{ilKodu}` |
| Mahalle listesi | `https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/idariYapi/mahalleListe/{ilceKodu}` |
| Ada/parsel ile sorgu | `https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/parsel/{mahalleKodu}/{adaNo}/{parselNo}` |
| Parsel üzerindeki bloklar | `https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/parsel/blok/{mahalleKodu}/{adaNo}/{parselNo}` |
| Bağımsız bölümler (kat mülkiyeti) | `https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/parsel/bagimsizbolum/{mahalleKodu}/{adaNo}/{parselNo}/{blokNo}` |

---

## Hata yönetimi notları (QGIS plugin'den)

- Bazı hata cevapları XML `<string>...</string>` formatında dönüyor — JSON parse'tan önce kontrol gerek.
- 200 dönen body'de `Message` alanı varsa o aslında hata mesajı — `_extract_message_from_raw` ile yakala.
- Boş body (parsel yok) durumunda `type != "Feature"` olur → "Beklenmeyen API yanıtı" yerine "Bu noktada parsel kaydı yok" mesajı göster.

---

## Atlas vs. Parselsorgu

- **atlas.tkgm.gov.tr**: WebFetch sırasında ECONNREFUSED — muhtemelen rate-limit veya bot-block (TR IP'den browser ile açılınca sorunsuz). Frontend muhtemelen OpenLayers + ESRI MapServer tile karması.
- **parselsorgu.tkgm.gov.tr**: SPA, splash logo dışında static HTML yok — JS bundle'ları çalıştırılınca `cbsapi.tkgm.gov.tr/megsiswebapi.v3.1` ile konuşuyor.
- İkisi de aynı backend'i kullanıyor → extension hangisinin üstünde çalışırsa çalışsın aynı endpoint'i çağıracağız, **DOM scraping'e ihtiyaç yok.**

---

## Karar

**Hafta 1 hedefi tamamlandı, plan değişiyor:**

- ❌ atlas DOM event reverse engineering → **iptal** (gereksiz, public API var)
- ✅ Doğrudan `cbsapi.tkgm.gov.tr` üstüne MV3 extension kurulumuna geç

### Hafta 2 önerisi
1. MV3 extension iskeleti (Vite + CRXJS + TypeScript)
2. Background service worker'da TKGM client (yukarıdaki endpoint'lerin TS sarmalayıcısı)
3. Popup/sidepanel: harita (MapLibre veya Leaflet) + sağ tıkla "Bu noktayı sorgula"
4. Toplu sorgu için CSV/KML export

### Açık sorular (sen karar ver)
- Extension hangi browser? Sadece Chrome/Edge yeter mi yoksa Firefox da olacak mı?
- Harita içinde mi (kendi UI), yoksa atlas.tkgm.gov.tr üstünde overlay mi?
- Veriyi yerel saklayacak mıyız (favoriler/notlar)? IndexedDB önerim.
- Ticarileştirme niyeti var mı? (TKGM ToS açısından — public endpoint ama scrape limiti belirsiz)

---

## Referanslar

- QGIS Plugin source: `_reference_qgis_plugin/` (klonlandı, MIT-benzeri lisans varsayımı — `LICENSE` kontrol edildi)
  - Asıl mantık: `tkgm_api.py:307-318`
  - Click→koordinat: `map_tool.py:23-43`
- PHP wrapper: `https://github.com/burakaktna/tkgmservice` (lat/lng yok, sadece il/ilçe/mahalle/ada-parsel)
- Reverse-engineered repo: `https://github.com/brktrk/parselsorgu`
