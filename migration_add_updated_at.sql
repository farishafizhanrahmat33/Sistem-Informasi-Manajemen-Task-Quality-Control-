-- Migration: Add updated_at column to users table
-- Target Database: SQLite / MySQL / PostgreSQL compatible

ALTER TABLE users ADD COLUMN updated_at DATETIME;

-- Opsional: Jika ada data user lama yang kolom updated_at-nya bernilai NULL, 
-- kita bisa perbarui dengan waktu saat ini agar tidak kosong.
UPDATE users SET updated_at = CURRENT_TIMESTAMP;