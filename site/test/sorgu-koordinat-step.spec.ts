/**
 * Sorgu formu — enlem/boylam alanlarının HTML `step` kısıtı otomatik-doldurma
 * ile çakışmamalı.
 *
 * ── NEDEN (2026-09-13, canlıda kullanıcı tarafından yakalandı) ─────────────
 *
 * `#lat`/`#lng` girdileri `step="0.0001"` (4 ondalık) taşıyordu. Ama
 * `setKoordinat()` bu alanları ÜÇ otomatik-gönder yolunda dolduruyor —
 * harita tıklaması (`.toFixed(5)`, 5 ondalık), "Bulunduğum konum" (ham GPS,
 * ~15 ondalık) ve adres arama sonucu (sağlayıcının kendi hassasiyeti) —
 * bunların HİÇBİRİ 0.0001'in tam katı değil. Tarayıcının yerleşik doğrulaması
 * (`steps mismatch`) bu üç yolu SESSİZCE engelliyordu: `form.requestSubmit()`
 * hata fırlatmadan reddediliyor, `fetch` hiç atılmıyordu — kullanıcı bir
 * uyarı balonu görüyordu, hiçbir ağ isteği ya da konsol hatası yoktu.
 *
 * Yalnızca ELLE 4 ondalıklı bir değer yazan kullanıcı sorunu hiç görmüyordu
 * — canlı doğrulamayı böyle geçmiştim (form_input ile "41.1430" yazmıştım).
 *
 * Bu test HTML kaynağını okuyup kısıtı doğruluyor; gerçek tarayıcı
 * doğrulamasını (jsdom `checkValidity` step desteği eksik) değil, kaynaktaki
 * çakışmayı yakalıyor.
 *
 * MUTASYON: sorgu.astro'da `step="any"`ı `step="0.0001"` olarak geri al →
 * bu test kırılır.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const KAYNAK = readFileSync(join(__dirname, "..", "src", "pages", "sorgu.astro"), "utf8");

describe("sorgu formu — koordinat alanları", () => {
  it("#lat ve #lng step=\"any\" — otomatik doldurmanın hassasiyetiyle çakışmaz", () => {
    const latEtiket = /<input type="number" id="lat"[^>]*>/.exec(KAYNAK)?.[0];
    const lngEtiket = /<input type="number" id="lng"[^>]*>/.exec(KAYNAK)?.[0];
    expect(latEtiket, "lat girdisi bulunamadı").toBeTruthy();
    expect(lngEtiket, "lng girdisi bulunamadı").toBeTruthy();
    expect(latEtiket).toContain('step="any"');
    expect(lngEtiket).toContain('step="any"');
  });

  it("setKoordinat'ı çağıran her otomatik-gönder yolu required alanları HTML kısıtına uyacak şekilde dolduruyor", () => {
    // Üç çağrı yeri de autoSorgu=true ile setKoordinat kullanıyor — hâlâ
    // öyle mi diye bakıyoruz; biri kaldırılıp doğrudan requestSubmit çağıran
    // yeni bir yol eklenirse bu test onu YAKALAMAZ, ama mevcut üçünü sayıyor.
    const cagrilar = [...KAYNAK.matchAll(/setKoordinat\([^)]*true\)/g)];
    expect(cagrilar.length).toBeGreaterThanOrEqual(3);
  });
});
