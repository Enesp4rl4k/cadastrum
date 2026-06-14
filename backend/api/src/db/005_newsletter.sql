-- Newsletter aboneliği (Erken Erişim listesi)
-- Run: npx wrangler d1 execute cadastrum-db --remote --file=src/db/005_newsletter.sql

CREATE TABLE IF NOT EXISTS newsletter_aboneler (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  email   TEXT NOT NULL UNIQUE,
  kaynak  TEXT,             -- 'site' | 'footer' | 'hero' | 'fiyat' vb.
  ip      TEXT,
  ts      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_newsletter_ts ON newsletter_aboneler(ts DESC);
