from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import UniqueConstraint
from datetime import datetime

db = SQLAlchemy()


# ==========================================
# 1. USERS
# ==========================================
class UserModel(db.Model):
    __tablename__ = 'users'

    # Physical column is "id_users" per the ERD; the Python attribute stays
    # "id" so the rest of the code (user.id, session['user_id']...) doesn't
    # need to change everywhere.
    id = db.Column('id_users', db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False, index=True)
    password = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(100), nullable=True)
    role = db.Column(db.String(50), nullable=False)
    nama_lengkap = db.Column(db.String(100), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # NOT on the ERD -- kept so the existing "Edit Profile > upload photo"
    # feature keeps working. Drop this column (and the matching bits in
    # main_routes.py / profile.html) if you actually want to match the
    # diagram 1:1 and retire that feature.
    foto_profil = db.Column(db.String(255), default='default.png')

    tickets = db.relationship("SupportTicket", back_populates="user", cascade="all, delete")
    tasks_uploaded = db.relationship("TaskModel", back_populates="uploader")
    qr_codes_uploaded = db.relationship("QRCodeModel", back_populates="uploader")


# ==========================================
# 2. SUPPORT TICKETS
# ==========================================
class SupportTicket(db.Model):
    __tablename__ = 'support_tickets'

    id = db.Column('id_support_tikets', db.Integer, primary_key=True)
    username = db.Column(db.String(50), db.ForeignKey('users.username', ondelete='CASCADE'), nullable=False, index=True)
    message = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), default='Open', nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("UserModel", back_populates="tickets")


# ==========================================
# 3. QC SYSTEM (TASKS)
# ==========================================
class TaskModel(db.Model):
    __tablename__ = 'qc_system'

    id = db.Column('id_qc_system', db.Integer, primary_key=True, autoincrement=True)
    project_name = db.Column(db.String, nullable=False, index=True)
    package_name = db.Column(db.String)
    task_id = db.Column(db.String, nullable=False)
    task_name = db.Column(db.String)
    description = db.Column(db.Text)
    task_goal = db.Column(db.Text)
    initialize_status = db.Column(db.String)
    generalization_direction = db.Column(db.String)
    num = db.Column(db.Integer)
    label = db.Column(db.String)
    pullable_num = db.Column(db.Integer)
    
    # --- KOLOM BARU UNTUK DATA EXCEL ---
    sop = db.Column(db.Text, nullable=True)
    task_type = db.Column(db.String, nullable=True)
    environment_type = db.Column(db.String, nullable=True)
    source_template_id = db.Column(db.String, nullable=True)
    target_num_task = db.Column(db.String, nullable=True)
    env_summary = db.Column(db.Text, nullable=True)
    excel_status = db.Column(db.String, nullable=True)
    # -----------------------------------

    case_name = db.Column(db.String, nullable=True)
    link_sample = db.Column(db.String, nullable=True)
    link_sample_2 = db.Column(db.String, nullable=True)
    can_buy_item = db.Column(db.Boolean, default=True)
    inspector_result = db.Column(db.String, nullable=True)
    notes = db.Column(db.Text, nullable=True)

    qc_category = db.Column(db.String, default="Need Sample", index=True)
    operational_status = db.Column(db.String, default="Active")
    sent_by_leader = db.Column(db.Boolean, default=False, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)

    uploaded_by = db.Column(db.String(50), db.ForeignKey('users.username', ondelete='SET NULL'), nullable=True)
    uploader = db.relationship("UserModel", back_populates="tasks_uploaded")

    __table_args__ = (
        UniqueConstraint('project_name', 'task_id', name='uq_project_task_id'),
    )

# ==========================================
# 4. QR CODES
# ==========================================
class QRCodeModel(db.Model):
    __tablename__ = 'qr_codes'

    id = db.Column('id_qr_codes', db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String, nullable=False)
    pdf_filename = db.Column(db.String, nullable=False)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)
    uploaded_by = db.Column(db.String(50), db.ForeignKey('users.username', ondelete='SET NULL'), nullable=True)

    # BARU: dulu 1 row = 1 PDF utuh. Sekarang upload_qr() motong PDF multi-page
    # jadi 1 row per halaman, dan 2 kolom ini nyimpen dari file asli mana &
    # halaman ke berapa row itu berasal (nullable karena row lama, sebelum
    # fitur ini ada, ga punya data ini).
    source_document = db.Column(db.String, nullable=True)
    page_number = db.Column(db.Integer, nullable=True)

    uploader = db.relationship("UserModel", back_populates="qr_codes_uploaded")