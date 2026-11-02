-- Agent reports are addressed by an unguessable key; the page data needs
-- the owner token (only its hash is stored), the PDF only the key.
ALTER TABLE reports ADD COLUMN key TEXT;
ALTER TABLE reports ADD COLUMN owner_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_key ON reports(key);
