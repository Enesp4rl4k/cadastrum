-- Request-correlation-ID — hata_log kayıtlarını wrangler tail loglarıyla
-- çapraz referanslamak için. NULL'a izin verilir (eski kayıtlar / request_id
-- göndermeyen istemciler için).
ALTER TABLE hata_log ADD COLUMN request_id TEXT;
CREATE INDEX IF NOT EXISTS idx_hata_request_id ON hata_log(request_id);
