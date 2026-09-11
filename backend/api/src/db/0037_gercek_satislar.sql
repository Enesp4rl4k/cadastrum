-- Migration 0037: gercek_satislar — kullanıcı gerçek satış geri besleme döngüsü
--
-- ── NEDEN BU TABLO PROJENİN EN DEĞERLİ VERİSİ ───────────────────────────────
--
-- Bugüne kadarki bütün doğruluk ölçümleri İLAN fiyatı üzerineydi. İlan fiyatı
-- pazarlık öncesi bir istek. Motor ise KAPANIŞ fiyatını hedefliyor ve aradaki
-- farkı `dinamikIndirimOrani` ile %6-24 arası bir iskontoyla modelliyor — ve bu
-- iskonto modeli HİÇ ÖLÇÜLMEDİ. Backtest onu geri ekleyip ilan fiyatıyla
-- kıyaslıyor; yani iskontonun kendisi hiçbir zaman sınanmadı.
--
-- Gerçek işlem fiyatı bu ikisini ilk kez ayırmayı mümkün kılıyor.
--
-- ── BU DOSYA NEDEN YERİNDE DEĞİŞTİRİLDİ ─────────────────────────────────────
--
-- İlk sürüm hiçbir ortamda uygulanmadı: 2026-09-11'de üretimde
-- `no such table: gercek_satislar`. Route ise deploy edilmişti ve her POST'a
-- 503 dönüyordu. Uygulanmamış bir migration'ı düzeltmek, üstüne ALTER zinciri
-- kurmaktan temiz. İlk sürümün dört eksiği:
--
--   1. `kategori` YOKTU — backtest arsa/tarla ayrı ölçüyor; kategorisiz bir
--      gerçek satış hiçbir segmentle kıyaslanamaz.
--   2. Tekrar koruması YOKTU — uzantı başarısız gönderimi yeniden deniyor;
--      aynı satış iki kez sayılırdı.
--   3. Tahminin KATMANI ve İSKONTOSU yoktu — gerçek fiyatla kıyaslanan tahminin
--      hangi katmandan geldiği ve ona ne kadar iskonto uygulandığı bilinmeden
--      "ilan hedefli hata" ile "işlem hedefli hata" ayrılamaz.
--   4. Yer adları yalnızca `.toLowerCase()` ile yazılıyordu ("çatalca");
--      korpus ve motor `normalizeYerAdi` kullanıyor ("catalca"). Hiçbir satır
--      motorun anahtarlarıyla eşleşmezdi — sessizce.
--
-- ── GİZLİLİK: NE TOPLANMIYOR ────────────────────────────────────────────────
--
-- Parsel no, ada no, koordinat, kullanıcı kimliği, kesin alan YOK. Alan bant
-- olarak tutuluyor. `istemci_kimligi` kayıt başına rastgele bir UUID — kişiyi
-- değil kaydı tanımlıyor; tek işi aynı kaydın iki kez sayılmasını önlemek.

CREATE TABLE IF NOT EXISTS gercek_satislar (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Tekrar gönderimde çift kayıt olmasın. Uzantı kayıt anında üretiyor.
  istemci_kimligi   TEXT    NOT NULL UNIQUE,
  -- Konum — `normalizeYerAdi` çıktısı, motorun ve korpusun anahtarlarıyla aynı
  il_norm           TEXT    NOT NULL,
  ilce_norm         TEXT    NOT NULL,
  mahalle_norm      TEXT    NOT NULL DEFAULT '',
  -- Motorun kullandığı kategori. Motor konut ÜRETMİYOR (bkz. o2 ölçümü), o
  -- yüzden yalnızca ikisi. Uzantı motorla AYNI fonksiyonla (`tarımsalMi`)
  -- hesaplıyor — ayrı bir sınıflandırma, kıyası anlamsız kılardı.
  kategori          TEXT    NOT NULL CHECK (kategori IN ('arsa', 'tarla')),
  gercek_per_m2     REAL    NOT NULL,
  alan_bant         TEXT    NOT NULL,
  -- 'satin-alindi' | 'satildi' GERÇEK işlem; 'bilgi' duyum. Ölçüm ikisini ayırır.
  tip               TEXT    NOT NULL DEFAULT 'bilgi',
  tahmin_goruldu    INTEGER NOT NULL DEFAULT 0,
  -- Motorun o anki tahmini (KAPANIŞ hedefli — iskonto uygulanmış hâli)
  heuristic_per_m2  REAL,
  -- Tahminin geldiği katman — backtest kırılımıyla aynı adlar
  baseline_kaynak   TEXT,
  -- Tahmine uygulanan asking→kapanış iskontosu (0-1). İlan eşdeğeri:
  -- heuristic_per_m2 / (1 - uygulanan_indirim)
  uygulanan_indirim REAL,
  giris_tarihi      INTEGER NOT NULL,
  yakalanma_tarihi  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gercek_satislar_konum
  ON gercek_satislar (il_norm, ilce_norm, mahalle_norm);

-- Ölçüm betiği kategori + dönem bazında okuyor.
CREATE INDEX IF NOT EXISTS idx_gercek_satislar_kategori_tarih
  ON gercek_satislar (kategori, yakalanma_tarihi);
