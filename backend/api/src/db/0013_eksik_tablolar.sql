-- Migration 0013: kayıp tabloları ve auth kolonlarını ekle.
--
-- Bağlam: Backend route'ları (auth, admin) zamanla evrildi ama schema.sql
-- güncellenmedi. Production'da pilot test sırasında "no such table:
-- giris_denemesi" ve "ai_kullanim" hataları çıktı. Bu migration o eksik
-- yapıları tek seferde tamamlar.
--
-- Çalıştır:
--   npx wrangler d1 execute cadastrum-db --remote --file="src/db/0013_eksik_tablolar.sql"

-- ── 1. Giriş denemesi (brute-force koruma) ───────────────────────────────────
-- auth.ts line 168 → SELECT sayi FROM giris_denemesi ...
CREATE TABLE IF NOT EXISTS giris_denemesi (
  ip      TEXT NOT NULL,
  dakika  INTEGER NOT NULL,         -- floor(timestamp / 60000)
  sayi    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, dakika)
);

CREATE INDEX IF NOT EXISTS idx_giris_dakika ON giris_denemesi(dakika);

-- ── 2. AI kullanım sayacı (admin dashboard + tier kotası) ─────────────────────
-- admin.ts ai_kullanim sorguları (top tüketici, 7 gün maliyet)
CREATE TABLE IF NOT EXISTS ai_kullanim (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kullanici_id  INTEGER NOT NULL,
  model         TEXT NOT NULL,        -- 'gemini-flash', 'groq-llama', 'ollama-local'
  prompt_token  INTEGER,
  cevap_token   INTEGER,
  maliyet_usd   REAL NOT NULL DEFAULT 0,
  ts            INTEGER NOT NULL,
  basarili      INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_kullanim_user ON ai_kullanim(kullanici_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ai_kullanim_ts ON ai_kullanim(ts DESC);

-- ── 3. Şifre sıfırlama (auth flow eksik kolonlar) ────────────────────────────
-- auth.ts /sifre-sifirlama-baslat ve /sifre-sifirla endpoint'leri için
-- mevcut email_dogrulandi, dogrulama_kod, dogrulama_son'a ek olarak:
ALTER TABLE kullanicilar ADD COLUMN sifre_sifirla_token TEXT;
ALTER TABLE kullanicilar ADD COLUMN sifre_sifirla_son INTEGER;

-- ── 4. Performans index'leri ─────────────────────────────────────────────────
-- Bildirim saatlik tarama: son_tetik filtresine göre
CREATE INDEX IF NOT EXISTS idx_bildirim_user_tetik
  ON bildirim_aboneligi(kullanici_id, son_tetik);

-- İstatistik refresh group-by sorgusu kategori + zaman
CREATE INDEX IF NOT EXISTS idx_ilanlar_kategori_zaman
  ON ilanlar(kategori, yakalanma_tarihi);

-- API token son kullanım — eski/aktif token analytics
CREATE INDEX IF NOT EXISTS idx_api_tokens_kullanim
  ON api_tokens(son_kullanim DESC);
