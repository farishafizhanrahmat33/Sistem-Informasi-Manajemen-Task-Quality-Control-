-- ==============================================================================
-- PATCH SQL: Menambahkan Kolom Status & Terakhir Aktif
-- ==============================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Offline';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMP;
