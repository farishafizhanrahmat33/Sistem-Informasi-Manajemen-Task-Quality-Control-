# Sistem Informasi Manajemen Task Quality Control

Sistem informasi berbasis web yang dirancang untuk mengelola, memantau, dan memvalidasi alur kerja *Quality Control* secara komprehensif. Aplikasi ini mempermudah pelacakan status tugas secara *real-time*, sinkronisasi data massal, dan kolaborasi antar divisi.

---

## Fitur Utama

* **Task Tracking Terpusat:** Memantau status QC melalui berbagai tahapan operasional (*Need Sample, Sample Done, Revision, Ready,* hingga *Skipped*).
* **Mass Upload & Data Sync (Excel/CSV):** Modul otomatisasi untuk membaca dan menyinkronkan atribut data mentah secara dinamis seperti *SOP, Target Num, Generalization Direction,* dan *Pullable Num*.
* **Smart Filter & Sort (AJAX):** Pencarian, penyaringan, dan pengurutan data berbasis *Project* maupun *Package* secara asinkron tanpa memuat ulang halaman (*no-reload*).
* **QR Code & Document Management:** Integrasi dengan penampil dokumen (PDF Viewer) langsung di dalam sistem untuk keperluan visualisasi validasi.
* **Adaptive UI/UX:** Antarmuka responsif yang mendukung mode *Dark/Light* secara otomatis.

---

## Teknologi yang Digunakan (Tech Stack)

* **Backend:** Python, Flask, SQLAlchemy
* **Database:** PostgreSQL
* **Data Processing:** Pandas, Openpyxl
* **Frontend:** HTML5, CSS3, JavaScript, Bootstrap 5

---

## Panduan Deployment & Setup

Instruksi untuk mengonfigurasi dan menjalankan aplikasi di lingkungan *development* maupun *production*.

### 1. Persiapan Database (PostgreSQL)
1. Buat database baru di PostgreSQL (contoh: `qc_management_db`).
2. Jalankan file **`init_database.sql`** yang tersedia di repositori untuk membangun skema tabel, relasi (*foreign keys*), dan indeks data secara otomatis.

### 2. Konfigurasi Environment Python
Buka terminal dan arahkan ke direktori *root* proyek:

```bash
# Buat Virtual Environment
python -m venv venv

# Aktifkan Virtual Environment
# Windows: 
venv\Scripts\activate
# Linux/Mac: 
source venv/bin/activate

# Install Dependencies
pip install -r requirements.txt
```

### 3. Pengaturan Variabel Lingkungan (.env)
Buat file bernama .env di direktori root, lalu masukkan konfigurasi berikut:
```
Cuplikan kode
SECRET_KEY=kunci_rahasia_aplikasi_anda_disini
DATABASE_URL=postgresql+psycopg2://postgres:password_database_anda@localhost:5432/qc_management_db
```
### 4. Menjalankan Aplikasi
Mode Development:
```Bash
python app.py
Akses aplikasi melalui browser di http://127.0.0.1:5000.
```
Mode Production:
Gunakan WSGI server untuk stabilitas dan performa operasional yang lebih baik.

Server Linux (Gunicorn):

```Bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
Server Windows (Waitress):
```
```Bash
pip install waitress
waitress-serve --port=5000 app:app
Dikembangkan untuk mendukung digitalisasi dan otomatisasi alur kerja Quality Control.
```