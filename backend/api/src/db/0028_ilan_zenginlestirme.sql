-- Migration 0028: İlan zenginleştirme alanları
--
-- NEDEN: Hold-out backtest ölçümü, fiyat tahminindeki kalan hatanın veri
-- HACMİNDEN değil ÖZELLİK DERİNLİĞİNDEN kaynaklandığını gösterdi:
--   - Aynı mahalle içinde fiyat dağılımı ±%90 (log-std 0.642)
--   - Bunun sadece %39.5'ini m² açıklıyor; kalan %60.5 imar/tapu/konum gibi
--     elimizde OLMAYAN özelliklerden
--   - Üretimde imar_durumu kapsamı %1.4, gerçek parsel koordinatı %0
--     (lat/lng dolu olanların hepsi mahalle merkezi — spatial motor bu yüzden atıl)
--
-- Emlakjet ilan DETAY sayfası bunları yapısal olarak veriyor:
--   JSON-LD PropertyValue "İmar Durumu"  → imar_durumu
--   Gömülü JSON  geometry.coordinates    → gerçek parsel poligonu (lat/lng)
--   HTML "Tapu Durumu" (Hisseli/Müstakil)→ tapu_durumu
-- Liste sayfası JSON-LD'si de bedavaya başlık (name) veriyor.

-- İlan başlığı — rafineri NLP'si (hisseli/kooperatif/hobi bahçesi tespiti) ve
-- segmentBul() bunu kullanıyor; şu ana kadar backend tarafında hiç saklanmıyordu.
ALTER TABLE ilanlar ADD COLUMN baslik TEXT;

-- Tapu durumu — "Hisseli Tapu" / "Müstakil Tapu" vb. Rafineri bunu regex ile
-- başlıktan tahmin etmeye çalışıyordu; artık yapısal alan olarak geliyor.
ALTER TABLE ilanlar ADD COLUMN tapu_durumu TEXT;

-- Zenginleştirme kuyruğu: NULL = detay sayfası henüz çekilmedi.
-- Cron her turda bir miktar NULL kaydı işler (kademeli backfill).
ALTER TABLE ilanlar ADD COLUMN zenginlestirildi INTEGER;

-- Kuyruk taraması için — WHERE zenginlestirildi IS NULL ORDER BY id LIMIT N
CREATE INDEX IF NOT EXISTS idx_ilanlar_zenginlestirme
  ON ilanlar(zenginlestirildi, id);
