"""
Optional demo/sample data for local development.

Usage:
    python seed.py
"""
from app import app
from database import db, UserModel
from werkzeug.security import generate_password_hash


def seed_data():
    with app.app_context():
        if db.session.query(UserModel).filter_by(username='qc_demo').first() is None:
            demo_qc = UserModel(
                username='qc_demo',
                password=generate_password_hash('qc12345'),
                nama_lengkap='Demo QC Staff',
                email='qc_demo@system.com',
                role='Quality Control'
            )
            db.session.add(demo_qc)
            db.session.commit()
            print("Demo Quality Control account created (qc_demo / qc12345).")
        else:
            print("Demo data already present, nothing to do.")


if __name__ == "__main__":
    seed_data()