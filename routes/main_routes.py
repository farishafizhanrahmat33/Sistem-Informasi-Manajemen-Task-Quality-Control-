import os
from datetime import datetime, timedelta  # <-- TAMBAHAN: Modul waktu untuk membatasi query
from werkzeug.utils import secure_filename
from flask import Blueprint, render_template, request, redirect, url_for, session, flash, jsonify, current_app
from flask_babel import gettext as _
from database import db, TaskModel, UserModel, SupportTicket
from sqlalchemy import or_, case, func
from werkzeug.security import generate_password_hash, check_password_hash

main_bp = Blueprint('main', __name__)

@main_bp.route('/')
def root():
    # Cek apakah user sudah login
    if 'username' in session or 'user_id' in session:
        return redirect(url_for('main.dashboard'))
    else:
        # Jika belum login (publik), jangan ke dashboard! 
        # Arahkan ke halaman login atau tampilkan template halaman publik utama Anda
        return redirect(url_for('task.task_list')) # Atau ganti ke halaman publik yang sesuai

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
    if 'username' not in session and 'user_id' not in session:
        return redirect(url_for('main.root'))

    role = session.get('role', 'Public')
    
    selected_filter = request.args.get('filter', 'All')
    selected_project = request.args.get('project', 'All')

    projects_raw = db.session.query(
    TaskModel.project_name, 
    func.count(TaskModel.id)
    ).filter(TaskModel.project_name.isnot(None)).group_by(TaskModel.project_name).all()

    projects = sorted([{'name': p[0], 'count': p[1]} for p in projects_raw if p[0]], key=lambda x: x['name'])

    project_list = selected_project.split(',') if selected_project != 'All' else []

    # --- RINGKASAN (METRICS): 1 QUERY SAJA, bukan 6 query .count() terpisah ---
    # Sebelumnya tiap kategori (need/done/rev/ready/skip/prod) manggil query
    # .count() sendiri-sendiri ke database (6x bolak-balik). Sekarang semuanya
    # dihitung dalam SATU query pakai conditional aggregation (SUM(CASE WHEN...)),
    # jauh lebih ringan buat database & server.
    def _cat_case(categories):
        return case(
            ((TaskModel.sent_by_leader == False) & (TaskModel.qc_category.in_(categories)), 1),
            else_=0
        )

    need_case = _cat_case(["To Sample", "Need Sample", "Ke Sampel"])
    done_case = _cat_case(["Sample Done", "Sampel Selesai"])
    rev_case = _cat_case(["Revision", "Revisi"])
    ready_case = _cat_case(["Ready for Production", "Ready", "Siap untuk Produksi", "Siap"])
    skip_case = _cat_case(["Skipped", "Dilewati"])
    prod_case = case((TaskModel.sent_by_leader == True, 1), else_=0)

    # Menyesuaikan waktu ke WIB (UTC+7) agar perhitungan harian akurat
    wib_now = datetime.utcnow() + timedelta(hours=7)
    today_start_wib = wib_now.replace(hour=0, minute=0, second=0, microsecond=0)
    # Kembalikan ke UTC untuk dicocokkan dengan database
    today_start = today_start_wib - timedelta(hours=7)

    # Tambahkan kondisi perhitungan harian (hari ini)
    done_today_case = case(
        ((TaskModel.sent_by_leader == False) & (TaskModel.qc_category.in_(["Sample Done", "Sampel Selesai"])) & (TaskModel.updated_at >= today_start), 1),
        else_=0
    )
    ready_today_case = case(
        ((TaskModel.sent_by_leader == False) & (TaskModel.qc_category.in_(["Ready for Production", "Ready", "Siap untuk Produksi", "Siap"])) & (TaskModel.updated_at >= today_start), 1),
        else_=0
    )

    metrics_query = db.session.query(
        func.coalesce(func.sum(need_case), 0),
        func.coalesce(func.sum(done_case), 0),
        func.coalesce(func.sum(rev_case), 0),
        func.coalesce(func.sum(ready_case), 0),
        func.coalesce(func.sum(skip_case), 0),
        func.coalesce(func.sum(prod_case), 0),
        func.coalesce(func.sum(done_today_case), 0),   # <- Tambahan query Sample Done hari ini
        func.coalesce(func.sum(ready_today_case), 0),  # <- Tambahan query Ready hari ini
    )
    if project_list:
        metrics_query = metrics_query.filter(TaskModel.project_name.in_(project_list))

    # Ekstrak hasil query
    need_n, done_n, rev_n, ready_n, skip_n, prod_n, done_today_n, ready_today_n = metrics_query.one()

    metrics = {
        'need': need_n, 'done': done_n, 'rev': rev_n,
        'ready': ready_n, 'skip': skip_n, 'prod': prod_n,
        'done_today': done_today_n,       # <- Lempar ke frontend
        'ready_today': ready_today_n      # <- Lempar ke frontend
    }
    metrics['total'] = need_n + done_n + rev_n + ready_n + skip_n + prod_n
    metrics['verified'] = done_n + ready_n + prod_n
    metrics['completion_rate'] = round(metrics['verified'] / metrics['total'] * 100) if metrics['total'] > 0 else 0
    
    # QUERY TABEL DIFILTER LANGSUNG DI DATABASE DAN DIBATASI (LIMIT 15)
    query = db.session.query(TaskModel)
    if selected_filter != 'All':
        if selected_filter in ['Need Sample', 'To Sample']:
            query = query.filter(TaskModel.sent_by_leader == False, or_(TaskModel.qc_category == "To Sample", TaskModel.qc_category == "Need Sample", TaskModel.qc_category == "Ke Sampel"))
        elif selected_filter == 'Sample Done':
            query = query.filter(TaskModel.sent_by_leader == False, or_(TaskModel.qc_category == "Sample Done", TaskModel.qc_category == "Sampel Selesai"))
        elif selected_filter == 'Revision':
            query = query.filter(TaskModel.sent_by_leader == False, or_(TaskModel.qc_category == "Revision", TaskModel.qc_category == "Revisi"))
        elif selected_filter in ['Ready', 'Ready for Production']:
            query = query.filter(TaskModel.sent_by_leader == False, or_(TaskModel.qc_category == "Ready for Production", TaskModel.qc_category == "Ready", TaskModel.qc_category == "Siap untuk Produksi", TaskModel.qc_category == "Siap"))
        elif selected_filter == 'Skipped':
            query = query.filter(TaskModel.sent_by_leader == False, or_(TaskModel.qc_category == "Skipped", TaskModel.qc_category == "Dilewati"))
        elif selected_filter in ['Production', 'Submitted / Sent', 'Sent', 'Sent to Team']:
            query = query.filter(TaskModel.sent_by_leader == True)
        else:
            query = query.filter_by(qc_category=selected_filter)
            
    if project_list:
        query = query.filter(TaskModel.project_name.in_(project_list))
    
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    query = query.filter(TaskModel.updated_at >= thirty_days_ago)
    
    recent_tasks = query.order_by(TaskModel.updated_at.desc()).limit(500).all()

    return render_template(
        'dashboard.html', 
        metrics=metrics, 
        role=role, 
        recent_tasks=recent_tasks, 
        selected_filter=selected_filter,
        selected_project=selected_project,
        projects=projects
        
    )
    
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
        
        # --- UBAH BAGIAN INI ---
        # Menyesuaikan waktu UTC ke WIB (UTC + 7 jam)
        user.status = 'Aktif'
        user.last_active = datetime.utcnow() + timedelta(hours=7)
        db.session.commit()
        # ---------------------

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
    user_id = session.get('user_id')
    if user_id:
        user = db.session.get(UserModel, user_id)
        if user:
            user.status = 'Offline'
            db.session.commit()

    session.clear()
    return redirect(url_for('main.root'))

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


# BARU: Reset password akun user lain langsung dari halaman User Management
# (khusus Developer) -- gantiin cara lama yang harus jalanin script terpisah.
@main_bp.route('/admin/users/reset_password/<int:user_id>', methods=['POST'])
def reset_user_password(user_id):
    if session.get('role') != 'Developer':
        flash(_('Access denied! Only Developers can change permissions.'), 'danger')
        return redirect(url_for('main.dashboard'))

    new_password = request.form.get('new_password', '')
    if len(new_password) < 6:
        flash(_('Password must be at least 6 characters long.'), 'danger')
        return redirect(url_for('main.user_management'))

    user = db.session.get(UserModel, user_id)
    if user:
        user.password = generate_password_hash(new_password)
        db.session.commit()
        flash(_('Password for "%(username)s" has been reset.', username=user.username), 'success')
    else:
        flash(_('User not found.'), 'danger')

    return redirect(url_for('main.user_management'))

@main_bp.route('/api/dashboard-data')
def api_dashboard_data():
    if 'username' not in session and 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    selected_filter = request.args.get('filter', 'All')
    selected_project = request.args.get('project', 'All')
    project_list = selected_project.split(',') if selected_project != 'All' else []

    def _cat_case(categories):
        return case(
            ((TaskModel.sent_by_leader == False) & (TaskModel.qc_category.in_(categories)), 1),
            else_=0
        )

    need_case = _cat_case(["To Sample", "Need Sample", "Ke Sampel"])
    done_case = _cat_case(["Sample Done", "Sampel Selesai"])
    rev_case = _cat_case(["Revision", "Revisi"])
    ready_case = _cat_case(["Ready for Production", "Ready", "Siap untuk Produksi", "Siap"])
    skip_case = _cat_case(["Skipped", "Dilewati"])
    prod_case = case((TaskModel.sent_by_leader == True, 1), else_=0)

    # Menyesuaikan waktu ke WIB (UTC+7) agar perhitungan harian akurat
    wib_now = datetime.utcnow() + timedelta(hours=7)
    today_start_wib = wib_now.replace(hour=0, minute=0, second=0, microsecond=0)
    # Kembalikan ke UTC untuk dicocokkan dengan database
    today_start = today_start_wib - timedelta(hours=7)

    # Tambahkan kondisi perhitungan harian (hari ini)
    done_today_case = case(
        ((TaskModel.sent_by_leader == False) & (TaskModel.qc_category.in_(["Sample Done", "Sampel Selesai"])) & (TaskModel.updated_at >= today_start), 1),
        else_=0
    )
    ready_today_case = case(
        ((TaskModel.sent_by_leader == False) & (TaskModel.qc_category.in_(["Ready for Production", "Ready", "Siap untuk Produksi", "Siap"])) & (TaskModel.updated_at >= today_start), 1),
        else_=0
    )

    metrics_query = db.session.query(
        func.coalesce(func.sum(need_case), 0),
        func.coalesce(func.sum(done_case), 0),
        func.coalesce(func.sum(rev_case), 0),
        func.coalesce(func.sum(ready_case), 0),
        func.coalesce(func.sum(skip_case), 0),
        func.coalesce(func.sum(prod_case), 0),
        func.coalesce(func.sum(done_today_case), 0),   # <- Tambahan query Sample Done hari ini
        func.coalesce(func.sum(ready_today_case), 0),  # <- Tambahan query Ready hari ini
    )
    if project_list:
        metrics_query = metrics_query.filter(TaskModel.project_name.in_(project_list))

    # Ekstrak hasil query
    need_n, done_n, rev_n, ready_n, skip_n, prod_n, done_today_n, ready_today_n = metrics_query.one()

    metrics = {
        'need': need_n, 'done': done_n, 'rev': rev_n,
        'ready': ready_n, 'skip': skip_n, 'prod': prod_n,
        'done_today': done_today_n,       # <- Lempar ke frontend
        'ready_today': ready_today_n      # <- Lempar ke frontend
    }
    metrics['total'] = need_n + done_n + rev_n + ready_n + skip_n + prod_n
    metrics['verified'] = done_n + ready_n + prod_n
    metrics['completion_rate'] = round(metrics['verified'] / metrics['total'] * 100) if metrics['total'] > 0 else 0
    
    query = db.session.query(TaskModel)
    if selected_filter != 'All':
        if selected_filter in ['Need Sample', 'To Sample']:
            query = query.filter(TaskModel.sent_by_leader == False, or_(TaskModel.qc_category == "To Sample", TaskModel.qc_category == "Need Sample", TaskModel.qc_category == "Ke Sampel"))
        elif selected_filter == 'Sample Done':
            query = query.filter(TaskModel.sent_by_leader == False, or_(TaskModel.qc_category == "Sample Done", TaskModel.qc_category == "Sampel Selesai"))
        elif selected_filter == 'Revision':
            query = query.filter(TaskModel.sent_by_leader == False, or_(TaskModel.qc_category == "Revision", TaskModel.qc_category == "Revisi"))
        elif selected_filter in ['Ready', 'Ready for Production']:
            query = query.filter(TaskModel.sent_by_leader == False, or_(TaskModel.qc_category == "Ready for Production", TaskModel.qc_category == "Ready", TaskModel.qc_category == "Siap untuk Produksi", TaskModel.qc_category == "Siap"))
        elif selected_filter == 'Skipped':
            query = query.filter(TaskModel.sent_by_leader == False, or_(TaskModel.qc_category == "Skipped", TaskModel.qc_category == "Dilewati"))
        elif selected_filter in ['Production', 'Submitted / Sent', 'Sent', 'Sent to Team']:
            query = query.filter(TaskModel.sent_by_leader == True)
        else:
            query = query.filter_by(qc_category=selected_filter)
            
    if project_list:
        query = query.filter(TaskModel.project_name.in_(project_list))
    
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    query = query.filter(TaskModel.updated_at >= thirty_days_ago)
    
    tasks = query.order_by(TaskModel.updated_at.desc()).limit(500).all()

    tasks_data = []
    for t in tasks:
        display_category = 'Production' if t.sent_by_leader else t.qc_category
        tasks_data.append({
            'project_name': t.project_name or 'General Project',
            'package_name': t.package_name or 'pkg-main',
            'task_id': t.task_id or '',
            'task_name': t.task_name,
            'uploaded_by': t.uploaded_by or 'User',
            'display_category': display_category,
            'updated_at': t.updated_at.strftime('%Y-%m-%d') if t.updated_at else ''
        })

    return jsonify({
        'metrics': metrics,
        'tasks': tasks_data
    })