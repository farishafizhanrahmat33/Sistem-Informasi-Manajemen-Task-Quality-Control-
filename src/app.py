import os
from flask import Flask, request, session
from config import Config
from database import db
from flask_migrate import Migrate
from werkzeug.security import generate_password_hash
from flask_babel import Babel
from datetime import timedelta

# ==========================================
# 1. TENTUKAN JALUR ABSOLUT ROOT PROYEK
# ==========================================
# CURRENT_DIR adalah folder 'src'
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
# PROJECT_ROOT adalah folder utama 'Project Sistem Management' (satu tingkat di atas 'src')
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)

# ==========================================
# 2. ARAHKAN FLASK KE FOLDER TEMPLATES & STATIC YANG BENAR
# ==========================================
app = Flask(__name__, 
            template_folder=os.path.join(PROJECT_ROOT, 'templates'),
            static_folder=os.path.join(PROJECT_ROOT, 'static'))

# TAMBAHKAN KUNCI RAHASIA INI
app.secret_key = 'ganti-dengan-string-acak-yang-sangat-panjang-dan-aman'

# Mengatur durasi "Ingat Saya" menjadi 30 hari
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)

app.config.from_object(Config)
app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024 * 1024  # 1 GB

# ==========================================
# KONFIGURASI BAHASA (FLASK-BABEL)
# ==========================================
app.config['BABEL_DEFAULT_LOCALE'] = 'id'  # Default bahasa Indonesia
app.config['LANGUAGES'] = {'id': 'Bahasa Indonesia', 'en': 'English'}

def get_locale():
    # Cek apakah user sudah memilih bahasa di session
    if 'language' in session:
        return session['language']
    # Jika tidak, deteksi otomatis dari browser
    return request.accept_languages.best_match(app.config['LANGUAGES'].keys())

babel = Babel(app, locale_selector=get_locale)
app.jinja_env.globals['get_locale'] = get_locale


# ==========================================
# 3. PERBAIKI LOKASI PEMBUATAN FOLDER UPLOADS
# ==========================================
qr_codes_dir = os.path.join(PROJECT_ROOT, 'static', 'uploads', 'qr_codes')
profiles_dir = os.path.join(PROJECT_ROOT, 'static', 'uploads', 'profiles')

os.makedirs(qr_codes_dir, exist_ok=True)
os.makedirs(profiles_dir, exist_ok=True)


# Wire up the DB + real SQL migrations (Alembic under the hood)
db.init_app(app)
migrate = Migrate(app, db)

# Register Blueprints
from routes.main_routes import main_bp
from routes.task_routes import task_bp
from routes.qr_routes import qr_bp

app.register_blueprint(main_bp)
app.register_blueprint(task_bp)
app.register_blueprint(qr_bp)


def ensure_default_admin():
    """Create default Developer and Guest accounts if they don't exist yet."""
    from sqlalchemy import inspect
    from database import UserModel
    try:
        if not inspect(db.engine).has_table('users'):
            print("The 'users' table doesn't exist yet -- run 'flask db upgrade' first, then restart.")
            return

        # 1. Buat Akun Developer Default
        if db.session.query(UserModel).filter_by(username='developer').first() is None:
            default_password = os.environ.get('DEFAULT_ADMIN_PASSWORD')
            if not default_password:
                print("WARNING: DEFAULT_ADMIN_PASSWORD belum di-set di .env -- akun developer default TIDAK dibuat.")
                print("Tambahkan baris DEFAULT_ADMIN_PASSWORD=<password_kamu> ke file .env, lalu restart.")
                return            
            default_admin = UserModel(
                username='developer',
                password=generate_password_hash(default_password),
                nama_lengkap='Super Developer',
                email='dev@system.com',
                role='Developer'
            )
            db.session.add(default_admin)
            db.session.commit()
            print("Default Developer account created (username: developer).")

        # 2. Buat Akun Guest/Publik untuk menampung tiket dari pengunjung umum
        if db.session.query(UserModel).filter_by(username='Guest/Publik').first() is None:
            default_guest = UserModel(
                username='Guest/Publik',
                password=generate_password_hash('randomsecurepassword123'),
                nama_lengkap='Public Guest',
                email='guest@system.com',
                role='Publik'
            )
            db.session.add(default_guest)
            db.session.commit()
            print("Default Guest account created for public support tickets.")

    except Exception as e:
        db.session.rollback()
        print(f"Skipped default accounts setup ({e}).")
        print("If this is a fresh database, run 'flask db upgrade' first, then restart.")


with app.app_context():
    ensure_default_admin()

if __name__ == '__main__':
    debug_mode = os.environ.get('FLASK_ENV', 'production') != 'production'
    app.run(debug=debug_mode, port=5000)