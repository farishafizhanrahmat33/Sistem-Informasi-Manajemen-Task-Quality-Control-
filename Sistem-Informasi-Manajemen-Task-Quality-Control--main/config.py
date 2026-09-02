import os
import secrets
from dotenv import load_dotenv

load_dotenv()


def _normalize_db_url(url: str) -> str:
    # Some hosts (Heroku/Render/etc) hand out "postgres://", SQLAlchemy 2.x
    # wants "postgresql://" -- this line fixes that up automatically.
    if url and url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return url


class Config:
    # Always set SECRET_KEY via .env in real use. The random fallback below
    # only exists so a fresh checkout doesn't crash -- it's regenerated on
    # every restart, so without a real .env value everyone gets logged out
    # each time the server restarts.
    SECRET_KEY = os.environ.get('SECRET_KEY') or secrets.token_hex(32)

    # Single source of truth for the DB connection -- database.py just
    # uses whatever Flask-SQLAlchemy is configured with here, instead of
    # building its own separate connection string.
    SQLALCHEMY_DATABASE_URI = _normalize_db_url(
        os.environ.get('DATABASE_URL') or 'sqlite:///database.db'
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,  # drop dead connections instead of erroring on them
    }

    MAX_CONTENT_LENGTH = 20 * 1024 * 1024  # 20 MB cap per upload

    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    SESSION_COOKIE_SECURE = os.environ.get('FLASK_ENV', 'production') == 'production'