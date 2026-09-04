import os
from werkzeug.utils import secure_filename
from flask import Blueprint, render_template, request, redirect, url_for, session, flash, jsonify, current_app
from flask_babel import gettext as _
from database import db, TaskModel, UserModel, SupportTicket
from sqlalchemy import or_
from werkzeug.security import generate_password_hash, check_password_hash

main_bp = Blueprint('main', __name__)

@main_bp.route('/')
def root():
    return redirect(url_for('main.dashboard'))

# BARU: Tombol/dropdown ganti bahasa manggil route ini, misal
# url_for('main.set_language', lang_code='en') atau 'id'.
@main_bp.route('/set_language/<lang_code>')
def set_language(lang_code):
    if lang_code in current_app.config['LANGUAGES']:
        session['language'] = lang_code
    return redirect(request.referrer or url_for('main.dashboard'))

# F-04: Ringkasan Task (Dev, Quality Control, Supervisor, Publik)
@main_bp.route('/dashboard')
def dashboard():
    role = session.get('role', 'Public')
    metrics = {
        'need': db.session.query(TaskModel).filter_by(qc_category="Need Sample").count(),
        'done': db.session.query(TaskModel).filter_by(qc_category="Sample Done").count(),
        'rev': db.session.query(TaskModel).filter_by(qc_category="Revision").count(),
        'ready': db.session.query(TaskModel).filter_by(qc_category="Ready").count(),
        'skip': db.session.query(TaskModel).filter_by(qc_category="Skipped").count(),
    }
    return render_template('dashboard.html', metrics=metrics, role=role)

# F-01: Autentikasi Login (Dev, Quality Control, Supervisor, Publik)
@main_bp.route('/login', methods=['POST'])
def login():
    login_id = request.form.get('username')
    password = request.form.get('password')

    user = db.session.query(UserModel).filter(
        or_(UserModel.username == login_id, UserModel.email == login_id)
    ).first()

    if user and check_password_hash(user.password, password):
        session['user_id'] = user.id
        session['role'] = user.role
        session['username'] = user.username
        return jsonify({
            "status": "success",
            "message": _("You're in! Logged in as %(role)s.", role=user.role)
        })
    else:
        return jsonify({
            "status": "error",
            "message": _("Wrong username/email or password!")
        }), 401

# F-02: Mengakhiri Sesi (Logout)
@main_bp.route('/logout')
def logout():
    session.clear()
    flash(_('You have been logged out.'), 'info')
    return redirect(url_for('main.dashboard'))

# F-24 & F-25: Detail & Edit Profil
@main_bp.route('/profile')
def profile():
    user_id = session.get('user_id')
    role = session.get('role', 'Public')

    if not user_id:
        flash(_('Log in first to check out your profile.'), 'warning')
        return redirect(url_for('main.dashboard'))

    user = db.session.get(UserModel, user_id)
    return render_template('profile.html', role=role, user=user)

@main_bp.route('/edit_profile', methods=['POST'])
def edit_profile():
    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('main.dashboard'))

    user = db.session.get(UserModel, user_id)

    if user:
        new_username = request.form.get('username')
        if new_username and new_username != user.username:
            existing_user = db.session.query(UserModel).filter_by(username=new_username).first()
            if existing_user:
                flash(_('Nope, that username is already taken by someone else!'), 'danger')
                return redirect(url_for('main.profile'))
            user.username = new_username

        user.nama_lengkap = request.form.get('nama_lengkap')
        user.email = request.form.get('email')

        foto = request.files.get('foto_profil')
        if foto and foto.filename:
            filename = f"user_{user.id}_{secure_filename(foto.filename)}"
            foto.save(os.path.join('static/uploads/profiles', filename))
            user.foto_profil = filename

        db.session.commit()
        flash(_('Profile updated!'), 'success')

    return redirect(url_for('main.profile'))

# F-26: Ganti Password
@main_bp.route('/change_password', methods=['POST'])
def change_password():
    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('main.dashboard'))

    old_password = request.form.get('old_password')
    new_password = request.form.get('new_password')

    user = db.session.get(UserModel, user_id)

    if user and check_password_hash(user.password, old_password):
        user.password = generate_password_hash(new_password)
        db.session.commit()
        flash(_('Password changed, nice!'), 'success')
    else:
        flash(_("Old password doesn't match!"), 'danger')

    return redirect(url_for('main.profile'))

# F-28: FAQ
@main_bp.route('/faq')
def faq():
    role = session.get('role', 'Public')
    return render_template('faq.html', role=role)

# F-29: Customer Service (Semua Role)
@main_bp.route('/support', methods=['GET', 'POST'])
def support():
    role = session.get('role', 'Public')
    if request.method == 'POST':
        user_name = session.get('username', 'Guest/Publik')
        pesan = request.form.get('message')

        new_ticket = SupportTicket(username=str(user_name), message=pesan, status='Open')
        db.session.add(new_ticket)
        db.session.commit()

        flash(_('Your message got sent over to the Developer!'), 'success')
        return redirect(url_for('main.support'))

    return render_template('support.html', role=role)

# F-30: Support Ticket (KHUSUS DEVELOPER sesuai F-30)
@main_bp.route('/admin/support')
def view_tickets():
    current_role = session.get('role')
    if current_role != 'Developer':
        flash(_('Access denied! This support inbox is Developer-only.'), 'danger')
        return redirect(url_for('main.dashboard'))

    tickets = db.session.query(SupportTicket).order_by(SupportTicket.created_at.desc()).all()
    return render_template('admin_support.html', tickets=tickets)

# NEW: Ubah status tiket (Open <-> Resolved) -- khusus Developer
@main_bp.route('/admin/support/<int:ticket_id>/toggle_status', methods=['POST'])
def toggle_ticket_status(ticket_id):
    if session.get('role') != 'Developer':
        flash(_('Access denied!'), 'danger')
        return redirect(url_for('main.dashboard'))

    ticket = db.session.get(SupportTicket, ticket_id)
    if ticket:
        # Nilai mentah 'Open'/'Resolved' tetap disimpan dalam bahasa Inggris di
        # database (biar logic lain yang bandingin status ga kebentur), cuma
        # versi yang ditampilin ke user yang diterjemahin lewat _().
        ticket.status = 'Resolved' if ticket.status == 'Open' else 'Open'
        db.session.commit()
        status_label = _('Resolved') if ticket.status == 'Resolved' else _('Open')
        flash(_('Ticket marked as %(status)s.', status=status_label), 'info')
    else:
        flash(_('Ticket not found.'), 'danger')

    return redirect(url_for('main.view_tickets'))

# F-20, F-21, F-22: User Management (KHUSUS DEVELOPER)
@main_bp.route('/admin/users')
def user_management():
    if session.get('role') != 'Developer':
        flash(_('Access denied! This page is Developer-only.'), 'danger')
        return redirect(url_for('main.dashboard'))

    users = db.session.query(UserModel).all()
    return render_template('user_management.html', users=users)

@main_bp.route('/admin/users/add', methods=['POST'])
def add_user():
    if session.get('role') != 'Developer':
        flash(_('Access denied!'), 'danger')
        return redirect(url_for('main.dashboard'))

    username = request.form.get('username')
    password = request.form.get('password')
    role = request.form.get('role')
    nama_lengkap = request.form.get('nama_lengkap')
    email = request.form.get('email')

    existing = db.session.query(UserModel).filter_by(username=username).first()

    if existing:
        flash(_('Nope, that username is already taken!'), 'danger')
    else:
        hashed_password = generate_password_hash(password)
        new_user = UserModel(
            username=username,
            password=hashed_password,
            role=role,
            nama_lengkap=nama_lengkap,
            email=email
        )
        db.session.add(new_user)
        db.session.commit()
        flash(_('Account %(username)s created with the %(role)s role!', username=username, role=role), 'success')

    return redirect(url_for('main.user_management'))

@main_bp.route('/admin/users/delete/<int:user_id>', methods=['POST'])
def delete_user(user_id):
    if session.get('role') != 'Developer':
        flash(_('Access denied!'), 'danger')
        return redirect(url_for('main.dashboard'))

    user = db.session.get(UserModel, user_id)

    if user:
        if user.id == session.get('user_id'):
            flash(_("Can't delete the account you're currently logged in with!"), 'danger')
        else:
            db.session.delete(user)
            db.session.commit()
            flash(_('Account deleted.'), 'success')

    return redirect(url_for('main.user_management'))

@main_bp.route('/update_user_role/<int:user_id>', methods=['POST'])
def update_user_role(user_id):
    if session.get('role') != 'Developer':
        flash(_('Access denied! Only Developers can change permissions.'), 'danger')
        return redirect(url_for('main.dashboard'))

    new_role = request.form.get('new_role')
    try:
        user = db.session.get(UserModel, user_id)
        if user:
            user.role = new_role
            db.session.commit()
            flash(_('Role for "%(username)s" changed to %(role)s!', username=user.username, role=new_role), 'success')
        else:
            flash(_('User not found.'), 'danger')
    except Exception:
        db.session.rollback()
        flash(_('Something went wrong updating the role.'), 'danger')

    return redirect(url_for('main.user_management'))