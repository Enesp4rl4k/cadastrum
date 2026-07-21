-- PERF-2: mahalle_zaman_serisi sorgu performansı için index'ler
-- imar-degisim /v1/imar-degisim/sinyal ve /v1/harita/trend tarafından kullanılır

CREATE INDEX IF NOT EXISTS idx_mzs_il_ilce_kat ON mahalle_zaman_serisi(il_norm, ilce_norm, kategori);
CREATE INDEX IF NOT EXISTS idx_mzs_yil_ay ON mahalle_zaman_serisi(yil, ay);
CREATE INDEX IF NOT EXISTS idx_mzs_il_kat_yil_ay ON mahalle_zaman_serisi(il_norm, kategori, yil, ay);

-- PERF-1: arazi avcısı mahalle_istatistik sorgusunu hızlandır
CREATE INDEX IF NOT EXISTS idx_mi_kategori_medyan ON mahalle_istatistik(kategori, medyan) WHERE medyan > 0;
CREATE INDEX IF NOT EXISTS idx_mi_il_kat_medyan ON mahalle_istatistik(il_norm, kategori, medyan) WHERE medyan > 0 AND ilan_adet >= 3;
CREATE INDEX IF NOT EXISTS idx_mi_ilce_kat ON mahalle_istatistik(il_norm, ilce_norm, kategori);

-- mahalle_baseline_ai fallback sorgusu için
CREATE INDEX IF NOT EXISTS idx_mba_il_kat_tlm2 ON mahalle_baseline_ai(il_norm, kategori, tlm2) WHERE tlm2 > 0;

-- arazi_avci_kriter uyarı sorgusu için (cron)
CREATE INDEX IF NOT EXISTS idx_avci_uyari ON arazi_avci_kriter(uyari_aktif, guncellendi) WHERE uyari_aktif = 1;
