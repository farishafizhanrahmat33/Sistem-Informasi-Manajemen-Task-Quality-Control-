from flask import Blueprint, render_template, request, redirect, url_for, session, flash
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
    if role.lower() in ['publik', 'public']:
        tasks = db.session.query(TaskModel).filter_by(sent_by_leader=True).all()
    else:
        tasks = db.session.query(TaskModel).all()

    projects = sorted(set(t.project_name for t in tasks if t.project_name))
    packages = sorted(set(t.package_name for t in tasks if t.package_name))

    return render_template('index.html', tasks=tasks, projects=projects, packages=packages, role=role)

@task_bp.route('/upload', methods=['POST'])
def upload_file():
    role = get_current_role()
    if role.lower() not in ['developer', 'quality control']:
        flash(f'Access denied! Your role showed up as "{role}".', 'danger')
        return redirect(url_for('task.task_list'))

    file = request.files.get('file')
    project_name = request.form.get('project_name')
    current_username = session.get('username')

    if not file or not project_name:
        flash('File and Project Name are both required!', 'warning')
        return redirect(url_for('task.task_list'))

    try:
        df = pd.read_csv(file) if file.filename.endswith('.csv') else pd.read_excel(file)

        # Helper untuk mencari nama kolom yang bervariasi di Excel
        def get_val(row, keys):
            for k in keys:
                val = row.get(k)
                if pd.notnull(val) and str(val).strip() != '':
                    return str(val).strip()
            return ''

        for _, row in df.iterrows():
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

            existing_task = db.session.query(TaskModel).filter_by(
                project_name=project_name, task_id=raw_task_id
            ).first()

            if existing_task:
                # Perbarui Data Mentah
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
        flash('Project data synced up! New stuff got added and old stuff got updated.', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Could not process the file: {str(e)}', 'danger')

    return redirect(url_for('task.task_list'))

@task_bp.route('/delete_project', methods=['POST'])
def delete_project():
    role = get_current_role()
    if role.lower() not in ['developer', 'quality control']:
        flash('Access denied!', 'danger')
        return redirect(url_for('task.task_list'))

    project_name = request.form.get('project_name')
    if project_name:
        db.session.query(TaskModel).filter_by(project_name=project_name).delete()
        db.session.commit()
        flash(f'Project "{project_name}" and all its tasks got deleted.', 'success')
    return redirect(url_for('task.task_list'))

@task_bp.route('/update/<int:task_id>', methods=['POST'])
def update_task(task_id):
    role = get_current_role()
    if role.lower() not in ['developer', 'quality control']:
        flash("Access denied! You can't edit tasks.", 'danger')
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
        flash('Task details updated.', 'success')

    return redirect(url_for('task.task_list'))

@task_bp.route('/toggle_send/<int:task_id>', methods=['POST'])
def toggle_send(task_id):
    role = get_current_role()
    if role.lower() not in ['developer', 'quality control', 'supervisor']:
        flash("Access denied, you can't forward tasks!", 'danger')
        return redirect(url_for('task.task_list'))

    task = db.session.get(TaskModel, task_id)
    if task:
        task.sent_by_leader = not task.sent_by_leader
        db.session.commit()
        status_msg = "sent over to the Production Team" if task.sent_by_leader else "pulled back"
        flash(f'Task got {status_msg}.', 'info')

    return redirect(url_for('task.task_list'))

@task_bp.route('/toggle_skip/<int:task_id>', methods=['POST'])
def toggle_skip(task_id):
    role = get_current_role()
    if role.lower() not in ['developer', 'quality control']:
        flash('Access denied!', 'danger')
        return redirect(url_for('task.task_list'))

    task = db.session.get(TaskModel, task_id)
    if task:
        if task.qc_category == 'Skipped':
            task.qc_category = 'Need Sample'
            flash('Task restored from Skipped.', 'info')
        else:
            task.qc_category = 'Skipped'
            flash('Task marked as Skipped.', 'warning')
        db.session.commit()

    return redirect(url_for('task.task_list'))

@task_bp.route('/tasks/submitted')
def submitted_tasks():
    role = get_current_role()
    tasks = db.session.query(TaskModel).filter_by(sent_by_leader=True).all()
    projects = sorted(set(t.project_name for t in tasks if t.project_name))
    packages = sorted(set(t.package_name for t in tasks if t.package_name))
    return render_template('submitted_tasks.html', tasks=tasks, projects=projects, packages=packages, role=role)