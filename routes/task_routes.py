from flask import Blueprint, render_template, request, redirect, url_for, session, flash
from flask_babel import gettext as _
from database import db, TaskModel
import pandas as pd

task_bp = Blueprint('task', __name__)

def get_current_role():
    role = session.get('role', 'Publik')
    if role:
        return str(role).strip()
    return 'Publik'

@task_bp.route('/tasks')
def task_list():
    role = get_current_role()
    page = request.args.get('page', 1, type=int)
    per_page = 15

    selected_status = request.args.get('status', 'All')
    search_query = request.args.get('q', '').strip()
    
    # MENANGKAP BANYAK NILAI SEKALIGUS (MULTIPLY FILTER)
    selected_projects = request.args.getlist('project')
    selected_packages = request.args.getlist('package')
    
    sort_by = request.args.get('sort_by', 'updated')
    sort_order = request.args.get('sort_order', 'desc')

    # Query args yang perlu dipertahankan di link pagination
    current_args = {k: v for k, v in request.args.lists() if k != 'page'}

    # Base query dengan batasan role
    base_query = db.session.query(TaskModel)
    if role.lower() in ['publik', 'public']:
        base_query = base_query.filter_by(sent_by_leader=True)

    # Ambil daftar proyek & paket unik untuk pilihan filter
    projects_query = db.session.query(TaskModel.project_name).filter(TaskModel.project_name.isnot(None)).distinct().all()
    projects = sorted([p[0] for p in projects_query])

    packages_query = db.session.query(TaskModel.package_name).filter(TaskModel.package_name.isnot(None)).distinct().all()
    packages = sorted([p[0] for p in packages_query])

    # --- TAMBAHAN BARU: PEMETAAN RELASI CASCADING FILTER ---
    proj_pkg_pairs = db.session.query(TaskModel.project_name, TaskModel.package_name)\
        .filter(TaskModel.project_name.isnot(None), TaskModel.package_name.isnot(None))\
        .distinct().all()

    project_package_map = {}
    package_project_map = {}

    for proj, pkg in proj_pkg_pairs:
        project_package_map.setdefault(proj, []).append(pkg)
        package_project_map.setdefault(pkg, []).append(proj)
    # -----------------------------------------------------

    # Helper untuk menerapkan filter pencarian, proyek, dan paket (MENGGUNAKAN .in_())
    def apply_filters(q):
        if selected_projects and 'All' not in selected_projects:
            q = q.filter(TaskModel.project_name.in_(selected_projects))
        if selected_packages and 'All' not in selected_packages:
            q = q.filter(TaskModel.package_name.in_(selected_packages))
        if search_query:
            term = f"%{search_query}%"
            q = q.filter(db.or_(
                TaskModel.task_id.ilike(term),
                TaskModel.task_name.ilike(term),
                TaskModel.description.ilike(term),
                TaskModel.task_goal.ilike(term)
            ))
        return q

    # Hitung jumlah total data (count) secara global untuk setiap tab status
    def get_count_for_status(status_val):
        q = apply_filters(base_query)
        if status_val != 'All':
            if status_val == 'Sent to Team':
                q = q.filter_by(sent_by_leader=True)
            else:
                q = q.filter_by(sent_by_leader=False, qc_category=status_val)
        return q.count()

    count_all = get_count_for_status('All')
    count_need_sample = get_count_for_status('Need Sample')
    count_sample_done = get_count_for_status('Sample Done')
    count_revision = get_count_for_status('Revision')
    count_ready = get_count_for_status('Ready')
    count_skipped = get_count_for_status('Skipped')
    count_sent = get_count_for_status('Sent to Team')

    # Terapkan filter status yang sedang aktif untuk data utama
    main_query = apply_filters(base_query)
    if selected_status != 'All':
        if selected_status == 'Sent to Team':
            main_query = main_query.filter_by(sent_by_leader=True)
        else:
            main_query = main_query.filter_by(sent_by_leader=False, qc_category=selected_status)

    # Pemetaan opsi sort di UI ke kolom aslinya di database
    sort_columns = {
        'updated': TaskModel.updated_at,
        'task-id': TaskModel.task_id,
        'pullable': TaskModel.pullable_num,
        'task-name': TaskModel.task_name,
    }
    order_column = sort_columns.get(sort_by, TaskModel.updated_at)
    order_expr = order_column.asc() if sort_order == 'asc' else order_column.desc()

    pagination = main_query.order_by(order_expr, TaskModel.id.desc()).paginate(page=page, per_page=per_page, error_out=False)
    tasks = pagination.items

    return render_template(
        'index.html',
        tasks=tasks,
        projects=projects,
        packages=packages,
        project_package_map=project_package_map, # DIKIRIM KE HTML
        package_project_map=package_project_map, # DIKIRIM KE HTML
        role=role,
        pagination=pagination,
        current_args=current_args,
        selected_status=selected_status,
        search_query=search_query,
        selected_projects=selected_projects,
        selected_packages=selected_packages,
        sort_by=sort_by,
        sort_order=sort_order,
        count_all=count_all,
        count_need_sample=count_need_sample,
        count_sample_done=count_sample_done,
        count_revision=count_revision,
        count_ready=count_ready,
        count_skipped=count_skipped,
        count_sent=count_sent
    )
    
@task_bp.route('/upload', methods=['POST'])
def upload_file():
    role = get_current_role()
    if role.lower() not in ['developer', 'quality control']:
        flash(_('Access denied! Your role showed up as "%(role)s".', role=role), 'danger')
        return redirect(url_for('task.task_list'))

    file = request.files.get('file')
    project_name = request.form.get('project_name')
    current_username = session.get('username')

    if not file or not project_name:
        flash(_('File and Project Name are both required!'), 'warning')
        return redirect(url_for('task.task_list'))

    try:
        df = pd.read_csv(file) if file.filename.endswith('.csv') else pd.read_excel(file)

        # Bersihkan prefix kode bahasa/negara di Excel jika ada (misal: '包01_')
        if 'Package Name' in df.columns:
            df['Package Name'] = df['Package Name'].str.replace(r'^包\d+_', '', regex=True)

        # Saring duplikat berdasarkan (Task ID + Package) -- BUKAN Task ID doang.
        # Task ID memang bisa sama di package yang berbeda (unik-nya per package,
        # bukan per project), jadi dedup harus ikut kolom package biar baris dari
        # package lain yang task_id-nya kebetulan sama nggak ketendang.
        package_col_candidates = ['Package', 'Package Name', 'package', 'package_name']
        package_col = next((c for c in package_col_candidates if c in df.columns), None)

        if 'Task ID' in df.columns:
            dedup_subset = ['Task ID', package_col] if package_col else ['Task ID']
            df = df.drop_duplicates(subset=dedup_subset, keep='first')

        # Helper untuk mencari nama kolom yang bervariasi di Excel
        def get_val(row, keys):
            for k in keys:
                val = row.get(k)
                if pd.notnull(val) and str(val).strip() != '':
                    return str(val).strip()
            return ''

        for _idx, row in df.iterrows():
            raw_task_id = get_val(row, ['Task ID', 'task_id'])
            if not raw_task_id:
                continue  

            pkg_name = get_val(row, ['Package', 'Package Name', 'package', 'package_name']) or 'General'
            
            raw_pullable = get_val(row, ['Pullable Num', 'pullable_num'])
            pullable_val = int(raw_pullable) if raw_pullable.isdigit() else 0

            # Ekstraksi Semua Kolom Data Mentah Baru
            sop_val = get_val(row, ['SOP', 'sop'])
            init_status = get_val(row, ['Initialize Status', 'Initial Status', 'initialize_status'])
            gen_dir = get_val(row, ['Generalization Direction', 'Gen Direction', 'generalization_direction'])
            t_type = get_val(row, ['Task Type', 'task_type'])
            lbl = get_val(row, ['Label', 'label'])
            env_t = get_val(row, ['Environment Type', 'Env Types', 'environment_type'])
            src_tmpl = get_val(row, ['Source Template ID', 'source_template_id'])
            tgt_num = get_val(row, ['Target Num / Task', 'target_num_task'])
            env_sum = get_val(row, ['Env Summary', 'env_summary'])
            ex_status = get_val(row, ['Status', 'status'])
            
            raw_num = get_val(row, ['Num', 'num'])
            num_val = int(raw_num) if raw_num.isdigit() else None

            # Cek keberadaan task berdasarkan project_name + package_name + task_id
            # (task_id cuma unik DI DALAM satu package, bukan di seluruh project --
            # jadi package_name WAJIB ikut di sini, kalau nggak, task dari package
            # lain yang task_id-nya kebetulan sama bisa ke-timpa/ke-gabung salah).
            existing_task = db.session.query(TaskModel).filter_by(
                project_name=project_name,
                package_name=pkg_name,
                task_id=raw_task_id
            ).first()

            if existing_task:
                # Perbarui Data Mentah & Package Name
                existing_task.package_name = pkg_name
                existing_task.task_name = get_val(row, ['Task Name', 'task_name'])
                existing_task.description = get_val(row, ['Description', 'description'])
                existing_task.task_goal = get_val(row, ['Task Goal', 'task_goal'])
                existing_task.pullable_num = pullable_val
                existing_task.sop = sop_val
                existing_task.initialize_status = init_status
                existing_task.generalization_direction = gen_dir
                existing_task.task_type = t_type
                existing_task.num = num_val
                existing_task.label = lbl
                existing_task.environment_type = env_t
                existing_task.source_template_id = src_tmpl
                existing_task.target_num_task = tgt_num
                existing_task.env_summary = env_sum
                existing_task.excel_status = ex_status
            else:
                # Buat Data Baru
                new_task = TaskModel(
                    project_name=project_name,
                    task_id=raw_task_id,
                    package_name=pkg_name,
                    task_name=get_val(row, ['Task Name', 'task_name']),
                    description=get_val(row, ['Description', 'description']),
                    task_goal=get_val(row, ['Task Goal', 'task_goal']),
                    pullable_num=pullable_val,
                    sop=sop_val,
                    initialize_status=init_status,
                    generalization_direction=gen_dir,
                    task_type=t_type,
                    num=num_val,
                    label=lbl,
                    environment_type=env_t,
                    source_template_id=src_tmpl,
                    target_num_task=tgt_num,
                    env_summary=env_sum,
                    excel_status=ex_status,
                    qc_category="Need Sample",
                    uploaded_by=current_username
                )
                db.session.add(new_task)

        db.session.commit()
        flash(_('Project data synced up! New stuff got added and old stuff got updated.'), 'success')
    except Exception as e:
        db.session.rollback()
        flash(_('Could not process the file: %(error)s', error=str(e)), 'danger')

    return redirect(url_for('task.task_list'))

@task_bp.route('/delete_project', methods=['POST'])
def delete_project():
    role = get_current_role()
    if role.lower() not in ['developer', 'quality control']:
        flash(_('Access denied!'), 'danger')
        return redirect(url_for('task.task_list'))

    project_name = request.form.get('project_name')
    if project_name:
        db.session.query(TaskModel).filter_by(project_name=project_name).delete()
        db.session.commit()
        flash(_('Project "%(project)s" and all its tasks got deleted.', project=project_name), 'success')
    return redirect(url_for('task.task_list'))

@task_bp.route('/update/<int:task_id>', methods=['POST'])
def update_task(task_id):
    role = get_current_role()
    if role.lower() not in ['developer', 'quality control']:
        flash(_("Access denied! You can't edit tasks."), 'danger')
        return redirect(url_for('task.task_list'))

    task = db.session.get(TaskModel, task_id)
    if task:
        task.case_name = request.form.get('case_name')
        task.link_sample = request.form.get('link_sample')
        task.link_sample_2 = request.form.get('link_sample_2')
        task.inspector_result = request.form.get('inspector_result')
        task.operational_status = request.form.get('operational_status', 'Active')
        task.notes = request.form.get('notes')

        # Ambil inputan dari dropdown secara aman
        hasil_inspeksi = str(task.inspector_result).strip().lower()

        # Logika Penentuan Tab (Category)
        if hasil_inspeksi in ['passed', 'approved', 'approved (pass)']:
            task.qc_category = 'Ready'
        elif hasil_inspeksi in ['failed', 'revision']:
            task.qc_category = 'Revision'
        elif hasil_inspeksi == 'need sample':
            task.qc_category = 'Need Sample'
        elif hasil_inspeksi in ['waiting inspect', 'waiting for inspect']:
            task.qc_category = 'Sample Done'
        else:
            # Jika ada input lain yang tidak terduga, kembalikan ke Sample Done
            task.qc_category = 'Sample Done'

        db.session.commit()
        flash(_('Task details updated.'), 'success')

    return redirect(url_for('task.task_list'))

@task_bp.route('/toggle_send/<int:task_id>', methods=['POST'])
def toggle_send(task_id):
    role = get_current_role()
    if role.lower() not in ['developer', 'quality control', 'supervisor']:
        flash(_("Access denied, you can't forward tasks!"), 'danger')
        return redirect(url_for('task.task_list'))

    task = db.session.get(TaskModel, task_id)
    if task:
        task.sent_by_leader = not task.sent_by_leader
        db.session.commit()
        status_msg = _("sent over to the Production Team") if task.sent_by_leader else _("pulled back")
        flash(_('Task got %(status)s.', status=status_msg), 'info')

    return redirect(url_for('task.task_list'))

@task_bp.route('/toggle_skip/<int:task_id>', methods=['POST'])
def toggle_skip(task_id):
    role = get_current_role()
    if role.lower() not in ['developer', 'quality control']:
        flash(_('Access denied!'), 'danger')
        return redirect(url_for('task.task_list'))

    task = db.session.get(TaskModel, task_id)
    if task:
        if task.qc_category == 'Skipped':
            task.qc_category = 'Need Sample'
            flash(_('Task restored from Skipped.'), 'info')
        else:
            task.qc_category = 'Skipped'
            flash(_('Task marked as Skipped.'), 'warning')
        db.session.commit()

    return redirect(url_for('task.task_list'))

@task_bp.route('/tasks/submitted')
def submitted_tasks():
    role = get_current_role()
    page = request.args.get('page', 1, type=int)
    per_page = 50

    # Ambil dropdown unik khusus untuk data yang sudah dikirim
    projects_query = db.session.query(TaskModel.project_name).filter(TaskModel.project_name.isnot(None), TaskModel.sent_by_leader==True).distinct().all()
    projects = sorted([p[0] for p in projects_query])

    packages_query = db.session.query(TaskModel.package_name).filter(TaskModel.package_name.isnot(None), TaskModel.sent_by_leader==True).distinct().all()
    packages = sorted([p[0] for p in packages_query])

    # Paginasi khusus data submitted
    pagination = db.session.query(TaskModel).filter_by(sent_by_leader=True).order_by(TaskModel.id.desc()).paginate(page=page, per_page=per_page, error_out=False)
    tasks = pagination.items

    return render_template('submitted_tasks.html', tasks=tasks, projects=projects, packages=packages, role=role, pagination=pagination)