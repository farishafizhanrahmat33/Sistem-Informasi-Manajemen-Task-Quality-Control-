import os
import re
from datetime import datetime
from flask import Blueprint, render_template, request, redirect, url_for, session, flash
from flask_babel import gettext as _
from werkzeug.utils import secure_filename
from database import db, QRCodeModel
from pypdf import PdfReader  # Tetap dibutuhkan untuk membaca jumlah halaman PDF
import fitz                  # Library baru untuk convert PDF page ke PNG

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
    env_match = re.search(r'([a-zA-Z0-9_]+_x_[a-zA-Z0-9_]+_\d+)', original_filename, re.IGNORECASE)
    base_code = env_match.group(1) if env_match else os.path.splitext(secure_filename(original_filename))[0]

    file_bytes = file.read()

    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as e:
        flash(_("Couldn't read that PDF: %(error)s", error=e), 'danger')
        return redirect(url_for('qr.qr_codes_page'))

    if len(doc) == 0:
        flash(_("That PDF doesn't have any pages."), 'danger')
        return redirect(url_for('qr.qr_codes_page'))

    created = 0

    for i, page in enumerate(doc, start=1):
        doc_name = f"Scene {i}"
        safe_base = secure_filename(f"{base_code}_scene_{i}") or f"page_{i}"
        
        zoom = 1.5
        mat = fitz.Matrix(zoom, zoom)

        # 1. SIMPAN GAMBAR FULL (UTUH) UNTUK VIEW PREVIEW
        full_filename = _unique_filename(f"{safe_base}.png")
        full_path = os.path.join(QR_UPLOAD_FOLDER, full_filename)
        
        pix_full = page.get_pixmap(matrix=mat)
        pix_full.save(full_path)

        # 2. Simpan gambar thumbnail (Kustomisasi pas pada kotak gambar besar utama)
        base_name, ext = os.path.splitext(full_filename)
        thumb_filename = f"{base_name}_thumb{ext}"
        thumb_path = os.path.join(QR_UPLOAD_FOLDER, thumb_filename)

        page_rect = page.rect
        
        # --- KOORDINAT PRESISI UNTUK FOTO UTAMA SAJA ---
        crop_x0 = page_rect.width * 0.55  # Batas kiri kotak foto utama
        crop_y0 = page_rect.height * 0.42 # Batas atas kotak foto utama
        crop_x1 = page_rect.width * 0.90  # Batas kanan kotak foto utama
        crop_y1 = page_rect.height * 0.70 # Batas bawah kotak foto utama (tepat di atas 3 foto kecil)
        # ----------------------------------------------

        clip_area = fitz.Rect(crop_x0, crop_y0, crop_x1, crop_y1)

        pix_thumb = page.get_pixmap(matrix=mat, clip=clip_area)
        pix_thumb.save(thumb_path)

        new_qr = QRCodeModel(
            name=doc_name,
            pdf_filename=full_filename,  # Menyimpan file utuh untuk modal
            uploaded_at=datetime.utcnow(),
            uploaded_by=session.get('username'),
            source_document=base_code,
            page_number=i,
        )   
        db.session.add(new_qr)
        created += 1

    db.session.commit()

    flash(_('%(count)s page(s) successfully uploaded.', count=created), 'success')
    return redirect(url_for('qr.qr_codes_page'))


@qr_bp.route('/delete_qr/<int:qr_id>', methods=['POST'])
def delete_qr(qr_id):
    role = get_current_role()
    if role not in ['Developer', 'Quality Control']:
        flash(_('Access denied!'), 'danger')
        return redirect(url_for('qr.qr_codes_page'))

    qr = db.session.get(QRCodeModel, qr_id)
    if qr:
        # Hapus file full
        filepath = os.path.join(QR_UPLOAD_FOLDER, qr.pdf_filename)
        if os.path.exists(filepath):
            os.remove(filepath)
            
        # Hapus file thumbnail pendampingnya
        base, ext = os.path.splitext(qr.pdf_filename)
        thumb_filepath = os.path.join(QR_UPLOAD_FOLDER, f"{base}_thumb{ext}")
        if os.path.exists(thumb_filepath):
            os.remove(thumb_filepath)

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