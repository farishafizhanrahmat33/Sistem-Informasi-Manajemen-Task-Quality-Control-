import os
from flask import Flask
from config import Config
from database import db
from flask_migrate import Migrate
from werkzeug.security import generate_password_hash

app = Flask(__name__)

# Dinaikin dari 100MB. PDF scene (banyak halaman + foto) gampang tembus itu,
# dan itu langsung kena 413 "Request Entity Too Large" SEBELUM request-nya
# nyampe ke kode kita (jadi mau di-split per halaman pun percuma kalau upload-nya
# udah ditolak duluan). Sesuaikan lagi angkanya sesuai PDF terbesar yang realistis.
# CATATAN: kalau app ini jalan di belakang reverse proxy (Nginx dll) atau di
# platform hosting (Render/Railway/dll), layer itu bisa punya limit sendiri yang
# terpisah dari punya Flask -- limit di sana juga perlu dinaikin manual.

app.config.from_object(Config)
app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024 * 1024  # 1 GB


# Make sure upload folders exist
os.makedirs('static/uploads/qr_codes', exist_ok=True)
os.makedirs('static/uploads/profiles', exist_ok=True)

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
            default_password = os.environ.get('DEFAULT_ADMIN_PASSWORD', 'admin123')
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