-- ==============================================================================
-- FILE INISIALISASI DATABASE UNTUK QC MANAGEMENT SYSTEM (POSTGRESQL)
-- ==============================================================================

-- 1. TABEL USERS (Master Data)
CREATE TABLE users (
    id_users SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(100),
    role VARCHAR(50) NOT NULL,
    nama_lengkap VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    foto_profil VARCHAR(255) DEFAULT 'default.png'
);
-- Index untuk mempercepat pencarian berdasarkan username
CREATE INDEX ix_users_username ON users (username);


-- 2. TABEL SUPPORT TICKETS
CREATE TABLE support_tickets (
    id_support_tikets SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'Open' NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Relasi FK: Jika user dihapus, tiket komplainnya otomatis ikut terhapus
    CONSTRAINT fk_support_tickets_username FOREIGN KEY (username) 
        REFERENCES users(username) ON DELETE CASCADE
);
CREATE INDEX ix_support_tickets_username ON support_tickets (username);


-- 3. TABEL QC SYSTEM (TASKS)
CREATE TABLE qc_system (
    id_qc_system SERIAL PRIMARY KEY,
    project_name VARCHAR NOT NULL,
    package_name VARCHAR,
    task_id VARCHAR NOT NULL,
    task_name VARCHAR,
    description TEXT,
    task_goal TEXT,
    initialize_status VARCHAR,
    generalization_direction VARCHAR,
    num INTEGER,
    label VARCHAR,
    pullable_num INTEGER,
    
    -- Kolom Data Excel Mentah
    sop TEXT,
    task_type VARCHAR,
    environment_type VARCHAR,
    source_template_id VARCHAR,
    target_num_task VARCHAR,
    env_summary TEXT,
    excel_status VARCHAR,
    
    -- Kolom Operasional & QC
    case_name VARCHAR,
    link_sample VARCHAR,
    link_sample_2 VARCHAR,
    can_buy_item BOOLEAN DEFAULT TRUE,
    inspector_result VARCHAR,
    notes TEXT,
    qc_category VARCHAR DEFAULT 'Need Sample',
    operational_status VARCHAR DEFAULT 'Active',
    sent_by_leader BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uploaded_by VARCHAR(50),
    
    -- Relasi FK: Jika user uploader dihapus, biarkan nama uploadernya jadi NULL (History aman)
    CONSTRAINT fk_qc_system_uploaded_by FOREIGN KEY (uploaded_by) 
        REFERENCES users(username) ON DELETE SET NULL,
        
    -- Anti Duplikat: Cegah kombinasi Project Name dan Task ID yang sama persis
    CONSTRAINT uq_project_task_id UNIQUE (project_name, task_id)
);
-- Index untuk mempercepat proses sortir dan filter di aplikasi
CREATE INDEX ix_qc_system_project_name ON qc_system (project_name);
CREATE INDEX ix_qc_system_qc_category ON qc_system (qc_category);
CREATE INDEX ix_qc_system_sent_by_leader ON qc_system (sent_by_leader);
CREATE INDEX ix_qc_system_updated_at ON qc_system (updated_at);


-- 4. TABEL QR CODES
CREATE TABLE qr_codes (
    id_qr_codes SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL,
    pdf_filename VARCHAR NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uploaded_by VARCHAR(50),
    
    -- Kolom BARU untuk fitur pemotongan PDF multi-page
    source_document VARCHAR,
    page_number INTEGER,
    
    -- Relasi FK: Keamanan history sama dengan tabel qc_system
    CONSTRAINT fk_qr_codes_uploaded_by FOREIGN KEY (uploaded_by) 
        REFERENCES users(username) ON DELETE SET NULL
);


-- ==============================================================================
-- (OPSIONAL) 5. INSERT DEFAULT ADMIN ACCOUNT
-- Menambahkan akun pertama agar Anda bisa langsung login setelah deploy
-- ==============================================================================
-- Catatan: Password default di bawah ini wajib sudah dalam bentuk hash (bcrypt/werkzeug).
-- Silakan masukkan ulang lewat register aplikasi jika Anda menggunakan sistem hashing.
-- CREATE INSERT INTO users (username, password, email, role, nama_lengkap) 
-- VALUES ('admin', 'masukkan_password_hash_disini', 'admin@system.local', 'Developer', 'Sistem Administrator');