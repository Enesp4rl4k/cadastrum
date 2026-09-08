-- Ö3 — Üretim katman telemetrisi
--
-- SORU: backtest'teki katman dağılımı (mahalle %62 / ilçe %35 / baseline %3)
-- üretimi temsil ediyor mu? Bu varsayım hiç sınanmadı ve sınanması gerekiyor,
-- çünkü iki küme yapısal olarak farklı olabilir:
--   - Backtest korpusu ilan OLAN mahallelerden örnekleniyor
--   - Üretimde kullanıcı HERHANGİ bir konuma bakıyor
--   - Havuzlu mahalle oranı yalnızca %4,5 (2.928/65.718)
--
-- NEDEN ÖNEMLİ: eğer üretimde ağırlık zayıf katmanlardaysa, M1'in kalibre
-- aralığının faydası da sanaldır — o tablo yalnızca ölçülmüş katmanları
-- (n ≥ 100) kapsıyor.
--
-- ── GİZLİLİK: NE TOPLANMIYOR ────────────────────────────────────────────────
--
-- Bu tabloda parsel kimliği, koordinat, fiyat, kullanıcı kimliği YOK.
-- Cevaplanacak soru "hangi katman ne sıklıkta çalışıyor" ve bunun için
-- bunların hiçbiri gerekmiyor. Toplanmayan veri sızdırılamaz.
--
-- Kaydedilen tek şey: gün, kategori, katman, güven bandı, emsal bandı, sayaç.
-- Satırlar GÜNLÜK TOPLAM — her sorgu için ayrı satır değil, `INSERT ... ON
-- CONFLICT DO UPDATE SET adet = adet + 1`. Böylece hem yazma bütçesi düşük
-- kalıyor hem de tek bir sorgunun izi tutulmuyor.
--
-- ── KAPSAM SINIRI, dürüstçe ─────────────────────────────────────────────────
--
-- Bu tablo BACKEND motorunu (/v1/sorgu) ölçüyor. Uzantı içindeki motor
-- (fiyat-tahmin.ts) ayrı bir kod yolu ve onun dağılımı burada görünmez.
-- Uzantı telemetrisi `backendTelemetri` ayarına bağlı ve varsayılan opt-OUT
-- (KVKK); oradan gelecek veri temsili olmayacağı için bu adımda kapsam dışı.

CREATE TABLE IF NOT EXISTS fiyat_katman_gunluk (
  -- Gün (YYYY-MM-DD, UTC). Saat tutulmuyor: "hangi katman ne sıklıkta"
  -- sorusu için gün çözünürlüğü yeterli ve daha az iz bırakıyor.
  gun            TEXT NOT NULL,
  kategori       TEXT NOT NULL,
  -- 'spatial-radius' | 'mahalle-istatistik' | 'il-fallback'
  katman         TEXT NOT NULL,
  -- Güven bandı — ham skor değil. Bant, tek bir sorgunun ayırt edilmesini
  -- zorlaştırırken dağılımı görmeye yetiyor.
  guven_bandi    TEXT NOT NULL,
  -- Emsal adedi bandı: '0' | '1-4' | '5-19' | '20+'
  emsal_bandi    TEXT NOT NULL,
  adet           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (gun, kategori, katman, guven_bandi, emsal_bandi)
);

-- Son N günün dağılımını çekmek için — pipeline-health bu deseni kullanıyor.
CREATE INDEX IF NOT EXISTS idx_fiyat_katman_gun ON fiyat_katman_gunluk(gun);
