-- ======================================================================
-- SCRIPT UPGRADE: Menambahkan index pada kolom package_name di tabel qc_system
-- ======================================================================
CREATE INDEX ix_qc_system_package_name ON qc_system (package_name);


-- ======================================================================
-- SCRIPT DOWNGRADE (Opsional jika perlu dibatalkan): Menghapus kembali index
-- ======================================================================
-- DROP INDEX IF EXISTS ix_qc_system_package_name;

