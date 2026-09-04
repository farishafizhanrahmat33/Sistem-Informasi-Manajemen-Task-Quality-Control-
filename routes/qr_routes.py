import os
import re
from datetime import datetime
from flask import Blueprint, render_template, request, redirect, url_for, session, flash
from flask_babel import gettext as _
from werkzeug.utils import secure_filename
from database import db, QRCodeModel
from pypdf import PdfReader, PdfWriter

qr_bp = Blueprint('qr', __name__)
QR_UPLOAD_FOLDER = 'static/uploads/qr_codes'
ALLOWED_EXTENSIONS = {'.pdf'}


def get_current_role():
    return session.get('role', 'Publik')


def _is_allowed(filename: str) -> bool:
    return os.path.splitext(filename)[1].lower() in ALLOWED_EXTENSIONS


def _unique_filename(filename: str) -> str:
    base, ext = os.path.splitext(filename)
    candidate = filename
    i = 1
    while os.path.exists(os.path.join(QR_UPLOAD_FOLDER, candidate)):
        candidate = f"{base}_{i}{ext}"
        i += 1
    return candidate


@qr_bp.route('/qr_management')
def qr_codes_page():
    role = get_current_role()
    qr_files = db.session.query(QRCodeModel).order_by(QRCodeModel.uploaded_at.desc()).all()
    return render_template('qr_management.html', files=qr_files, role=role)


# F-18: Tambah File QR (Dev, Quality Control)
@qr_bp.route('/upload_qr', methods=['POST'])
def upload_qr():
    role = get_current_role()
    if role not in ['Developer', 'Quality Control']:
        flash(_('Access denied! Only Developer and Quality Control can add QR files.'), 'danger')
        return redirect(url_for('qr.qr_codes_page'))

    file = request.files.get('qr_file')
    if not (file and file.filename and _is_allowed(file.filename)):
        flash(_("That file format's not valid, or nothing was picked."), 'danger')
        return redirect(url_for('qr.qr_codes_page'))

    original_filename = file.filename

    # Ekstrak kode dasar stasiun (misal: logistics_x_courier_station_0080)
    env_match = re.search(r'([a-zA-Z0-9_]+_x_[a-zA-Z0-9_]+_\d+)', original_filename, re.IGNORECASE)
    base_code = env_match.group(1) if env_match else os.path.splitext(secure_filename(original_filename))[0]

    try:
        reader = PdfReader(file.stream)
    except Exception as e:
        flash(_("Couldn't read that PDF: %(error)s", error=e), 'danger')
        return redirect(url_for('qr.qr_codes_page'))

    if not reader.pages:
        flash(_("That PDF doesn't have any pages."), 'danger')
        return redirect(url_for('qr.qr_codes_page'))

    created = 0

    for i, page in enumerate(reader.pages, start=1):
        # Diubah agar nama dokumen menjadi Scene 1, Scene 2, dst. sesuai nomor halamannya
        doc_name = f"Scene {i}"
        safe_base = secure_filename(f"{base_code}_scene_{i}") or f"page_{i}"
        page_filename = _unique_filename(f"{safe_base}.pdf")

        writer = PdfWriter()
        writer.add_page(page)
        with open(os.path.join(QR_UPLOAD_FOLDER, page_filename), 'wb') as f:
            writer.write(f)

        new_qr = QRCodeModel(
            name=doc_name,
            pdf_filename=page_filename,
            uploaded_at=datetime.utcnow(),
            uploaded_by=session.get('username'),
            source_document=base_code,  # Diubah dari original_filename
            page_number=i,
        )   
        db.session.add(new_qr)
        created += 1

    db.session.commit()

    flash(_('%(count)s page(s) successfully uploaded.', count=created), 'success')
    return redirect(url_for('qr.qr_codes_page'))


# F-19: Hapus File QR (Dev, Quality Control)
@qr_bp.route('/delete_qr/<int:qr_id>', methods=['POST'])
def delete_qr(qr_id):
    role = get_current_role()
    if role not in ['Developer', 'Quality Control']:
        flash(_('Access denied!'), 'danger')
        return redirect(url_for('qr.qr_codes_page'))

    qr = db.session.get(QRCodeModel, qr_id)
    if qr:
        filepath = os.path.join(QR_UPLOAD_FOLDER, qr.pdf_filename)
        if os.path.exists(filepath):
            os.remove(filepath)  # Diperbaiki dari os.path.remove menjadi os.remove
        db.session.delete(qr)
        db.session.commit()
        flash(_('Document deleted.'), 'success')
    else:
        flash(_("Document not found."), 'danger')

    return redirect(url_for('qr.qr_codes_page'))


# F-20: Edit/Rename Nama Dokumen QR Langsung dari Web
@qr_bp.route('/edit_qr/<int:qr_id>', methods=['POST'])
def edit_qr(qr_id):
    role = get_current_role()
    if role not in ['Developer', 'Quality Control']:
        flash(_('Access denied!'), 'danger')
        return redirect(url_for('qr.qr_codes_page'))

    qr = db.session.get(QRCodeModel, qr_id)
    if qr:
        new_name = request.form.get('new_name', '').strip()
        if new_name:
            qr.name = new_name
            db.session.commit()
            flash(_('Document renamed to "%(name)s".', name=new_name), 'success')
        else:
            flash(_('Name cannot be empty.'), 'danger')
    else:
        flash(_("Document not found."), 'danger')

    return redirect(url_for('qr.qr_codes_page'))