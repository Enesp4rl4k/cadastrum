-- 0041 — TKGM analizi olan ilçelerin merkezleri, ayrı küçük tablo.
--
-- NEDEN: /v1/harita/ilceler merkezleri her çağrıda
--   SELECT ilce_kodu, AVG(enlem), AVG(boylam) FROM tkgm_analiz_noktalari GROUP BY ilce_kodu
-- ile TÜM nokta tablosunu tarayarak hesaplıyordu (2026-09-12: 264.475 satır,
-- eksik ilçeler yüklenince ~990.000 — günlük 5M okuma bütçesinin ~%20'si,
-- tek önbellek ıskalamasında). Ayrıca liste nokta tablosundan türediği için
-- özeti yüklü ama noktası henüz yüklenmemiş ilçeler haritada ÇİZİLEMİYORDU
-- (merkezleri yoktu) — 548 özetin 378'i görünmez kalıyordu.
--
-- Merkezler yerel kaynak SQL'den bir kez hesaplanıp yüklenir:
--   scripts/tkgm-yukleme/00-merkez.sql (tkgm-analiz-eksik-ayir.mjs üretir)
CREATE TABLE IF NOT EXISTS tkgm_ilce_merkez (
  ilce_kodu    INTEGER PRIMARY KEY,
  lat          REAL    NOT NULL,
  lng          REAL    NOT NULL,
  nokta_adet   INTEGER NOT NULL,  -- merkezin kaç benzersiz parselden hesaplandığı
  guncellendi  INTEGER NOT NULL   -- epoch ms
);
