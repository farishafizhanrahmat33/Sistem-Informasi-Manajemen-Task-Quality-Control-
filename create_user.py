"""
Interactive CLI for creating a user account (mainly for production, where
you don't want to rely on the auto-created 'developer'/'admin123' default).

Usage:
    python create_user.py
"""
import getpass

from app import app
from database import db, UserModel
from werkzeug.security import generate_password_hash

VALID_ROLES = ['Developer', 'Quality Control', 'Supervisor', 'Public']


def create_user():
    with app.app_context():
        username = input('Username: ').strip()
        if not username:
            print("Username can't be empty.")
            return

        if db.session.query(UserModel).filter_by(username=username).first():
            print(f'"{username}" is already taken.')
            return

        password = getpass.getpass('Password: ')
        password_confirm = getpass.getpass('Confirm password: ')
        if password != password_confirm:
            print("Passwords don't match.")
            return
        if len(password) < 8:
            print("Password should be at least 8 characters.")
            return

        nama_lengkap = input('Full name (optional): ').strip() or None
        email = input('Email (optional): ').strip() or None

        role = input(f'Role {VALID_ROLES} [Developer]: ').strip() or 'Developer'
        if role not in VALID_ROLES:
            print(f'"{role}" is not a valid role.')
            return

        user = UserModel(
            username=username,
            password=generate_password_hash(password),
            role=role,
            nama_lengkap=nama_lengkap,
            email=email,
        )
        db.session.add(user)
        db.session.commit()
        print(f'Account "{username}" created with the {role} role.')


if __name__ == "__main__":
    create_user()