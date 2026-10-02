import os
import re
import json
import hashlib
import uuid
import threading
from datetime import datetime
from flask import Blueprint, render_template, request, redirect, url_for, session, flash, jsonify, current_app
from flask_babel import gettext as _
from werkzeug.utils import secure_filename
from database import db, QRCodeModel
from pypdf import PdfReader
from sqlalchemy import func
import pymupdf as fitz

qr_bp = Blueprint('qr', __name__)

def get_qr_upload_folder():
    """Mengembalikan path absolut folder upload QR secara dinamis."""
    return os.path.join(current_app.static_folder, 'uploads', 'qr_codes')

ALLOWED_EXTENSIONS = {'.pdf'}

# Kunci global buat penomoran Scene
scene_lock = threading.Lock()


def get_current_role():
    return session.get('role', 'Publik')


def _is_allowed(filename: str) -> bool:
    return os.path.splitext(filename)[1].lower() in ALLOWED_EXTENSIONS


def _unique_filename(filename: str) -> str:
    base, ext = os.path.splitext(filename)
    candidate = filename
    i = 1
    upload_folder = get_qr_upload_folder()
    while os.path.exists(os.path.join(upload_folder, candidate)):
        candidate = f"{base}_{i}{ext}"
        i += 1
    return candidate


def _progress_path(base_code: str) -> str:
    return os.path.join(get_qr_upload_folder(), f".progress_{secure_filename(base_code)}.json")


def _load_progress(base_code: str, file_hash: str) -> set:
    path = _progress_path(base_code)
    if not os.path.exists(path):
        return set()
    try:
        with open(path, 'r') as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return set()

    if data.get('file_hash') != file_hash:
        return set()
    return set(data.get('completed_pages', []))


def _save_progress(base_code: str, file_hash: str, completed_pages: set):
    path = _progress_path(base_code)
    with open(path, 'w') as f:
        json.dump({'file_hash': file_hash, 'completed_pages': sorted(completed_pages)}, f)


def _clear_progress(base_code: str):
    path = _progress_path(base_code)
    if os.path.exists(path):
        os.remove(path)


def _tmp_pdf_path(upload_id: str) -> str:
    safe_id = re.sub(r'[^a-zA-Z0-9_-]', '', upload_id)[:64]
    return os.path.join(get_qr_upload_folder(), f".tmp_{safe_id}.pdf")


def _resolve_base_code(original_filename: str) -> str:
    env_match = re.search(r'([a-zA-Z0-9_]+_x_[a-zA-Z0-9_]+_\d+)', original_filename, re.IGNORECASE)
    return env_match.group(1) if env_match else os.path.splitext(secure_filename(original_filename))[0]


def _render_and_save_page(doc, i: int, base_code: str, already_uploaded_pages: set, file_hash: str) -> bool:
    page = doc[i - 1]

    full_path = None
    thumb_path = None
    pix_full = None
    pix_thumb = None
    upload_folder = get_qr_upload_folder()
    
    try:
        with scene_lock:
            max_page_query = db.session.query(func.max(QRCodeModel.page_number)).scalar()
            scene_num = (max_page_query or 0) + 1

            doc_name = f"Scene {scene_num}"
            safe_base = secure_filename(f"{base_code}_scene_{scene_num}") or f"page_{scene_num}"

            zoom = 1.2
            mat = fitz.Matrix(zoom, zoom)

            # 1. SIMPAN GAMBAR FULL
            full_filename = _unique_filename(f"{safe_base}.png")
            full_path = os.path.join(upload_folder, full_filename)

            pix_full = page.get_pixmap(matrix=mat)
            pix_full.save(full_path)

            # 2. Simpan gambar thumbnail
            base_name, ext = os.path.splitext(full_filename)
            thumb_filename = f"{base_name}_thumb{ext}"
            thumb_path = os.path.join(upload_folder, thumb_filename)

            page_rect = page.rect
            crop_x0 = page_rect.width * 0.55
            crop_y0 = page_rect.height * 0.42
            crop_x1 = page_rect.width * 0.90
            crop_y1 = page_rect.height * 0.70

            clip_area = fitz.Rect(crop_x0, crop_y0, crop_x1, crop_y1)

            pix_thumb = page.get_pixmap(matrix=mat, clip=clip_area)
            pix_thumb.save(thumb_path)

            new_qr = QRCodeModel(
                name=doc_name,
                pdf_filename=full_filename,
                uploaded_at=datetime.utcnow(),
                uploaded_by=session.get('username'),
                source_document=base_code,
                page_number=scene_num,
            )
            db.session.add(new_qr)
            db.session.commit()

            already_uploaded_pages.add(i)
            _save_progress(base_code, file_hash, already_uploaded_pages)
            return True

    except Exception:
        db.session.rollback()
        for path in (full_path, thumb_path):
            if path and os.path.exists(path):
                os.remove(path)
        return False

    finally:
        pix_full = None
        pix_thumb = None


@qr_bp.route('/qr_management')
def qr_codes_page():
    role = get_current_role()
    qr_files = db.session.query(QRCodeModel).order_by(QRCodeModel.uploaded_at.desc()).all()
    return render_template('qr_management.html', files=qr_files, role=role)


@qr_bp.route('/upload_qr', methods=['POST'])
def upload_qr():
    role = get_current_role()
    if role not in ['Developer', 'Quality Control']:
        flash(_('Access denied! Only Developer and Quality Control can add QR files.'), 'danger')
        return redirect(url_for('qr.qr_codes_page'))

    upload_folder = get_qr_upload_folder()
    if not os.path.exists(upload_folder):
        os.makedirs(upload_folder, exist_ok=True)

    file = request.files.get('qr_file')
    if not (file and file.filename and _is_allowed(file.filename)):
        flash(_("That file format's not valid, or nothing was picked."), 'danger')
        return redirect(url_for('qr.qr_codes_page'))

    base_code = _resolve_base_code(file.filename)
    file_bytes = file.read()

    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as e:
        flash(_("Couldn't read that PDF: %(error)s", error=e), 'danger')
        return redirect(url_for('qr.qr_codes_page'))

    if len(doc) == 0:
        flash(_("That PDF doesn't have any pages."), 'danger')
        return redirect(url_for('qr.qr_codes_page'))

    file_hash = hashlib.sha256(file_bytes).hexdigest()
    already_uploaded_pages = _load_progress(base_code, file_hash)

    created = 0
    skipped = 0
    failed_pages = []

    for i in range(1, len(doc) + 1):
        if i in already_uploaded_pages:
            skipped += 1
            continue

        ok = _render_and_save_page(doc, i, base_code, already_uploaded_pages, file_hash)
        if ok:
            created += 1
        else:
            failed_pages.append(i)

    doc.close()

    if not failed_pages:
        _clear_progress(base_code)

    if created:
        flash(_('%(count)s new page(s) successfully uploaded.', count=created), 'success')
    if skipped:
        flash(_('%(count)s page(s) skipped (already uploaded from a previous attempt of this exact file).', count=skipped), 'info')
    if failed_pages:
        flash(_('%(count)s page(s) failed to process: %(pages)s. Upload the exact same file again to retry just these pages.', count=len(failed_pages), pages=', '.join(map(str, failed_pages))), 'danger')
    return redirect(url_for('qr.qr_codes_page'))


@qr_bp.route('/upload_qr/init', methods=['POST'])
def upload_qr_init():
    role = get_current_role()
    if role not in ['Developer', 'Quality Control']:
        return jsonify({'error': _('Access denied! Only Developer and Quality Control can add QR files.')}), 403

    upload_folder = get_qr_upload_folder()
    if not os.path.exists(upload_folder):
        os.makedirs(upload_folder, exist_ok=True)

    file = request.files.get('qr_file')
    if not (file and file.filename and _is_allowed(file.filename)):
        return jsonify({'error': _("That file format's not valid, or nothing was picked.")}), 400

    base_code = _resolve_base_code(file.filename)
    file_bytes = file.read()

    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        total_pages = len(doc)
        doc.close()
    except Exception as e:
        return jsonify({'error': _("Couldn't read that PDF: %(error)s", error=str(e))}), 400

    if total_pages == 0:
        return jsonify({'error': _("That PDF doesn't have any pages.")}), 400

    file_hash = hashlib.sha256(file_bytes).hexdigest()
    upload_id = uuid.uuid4().hex

    with open(_tmp_pdf_path(upload_id), 'wb') as f:
        f.write(file_bytes)

    already_done = _load_progress(base_code, file_hash)

    return jsonify({
        'base_code': base_code,
        'file_hash': file_hash,
        'upload_id': upload_id,
        'total_pages': total_pages,
        'already_done': sorted(already_done),
    })


@qr_bp.route('/upload_qr/page', methods=['POST'])
def upload_qr_page():
    role = get_current_role()
    if role not in ['Developer', 'Quality Control']:
        return jsonify({'error': _('Access denied!')}), 403

    base_code = request.form.get('base_code', '')
    file_hash = request.form.get('file_hash', '')
    upload_id = request.form.get('upload_id', '')

    try:
        page_num = int(request.form.get('page', ''))
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid page number.'}), 400

    tmp_path = _tmp_pdf_path(upload_id)
    if not upload_id or not base_code or not os.path.exists(tmp_path):
        return jsonify({'error': _('Upload session expired or invalid. Please upload the file again.')}), 400

    try:
        doc = fitz.open(tmp_path)
    except Exception as e:
        return jsonify({'error': _("Couldn't read that PDF: %(error)s", error=str(e))}), 400

    if page_num < 1 or page_num > len(doc):
        doc.close()
        return jsonify({'error': 'Page out of range.'}), 400

    already_uploaded_pages = _load_progress(base_code, file_hash)

    if page_num in already_uploaded_pages:
        doc.close()
        return jsonify({'status': 'skipped', 'page': page_num})

    ok = _render_and_save_page(doc, page_num, base_code, already_uploaded_pages, file_hash)
    doc.close()

    return jsonify({'status': 'ok' if ok else 'failed', 'page': page_num})


@qr_bp.route('/upload_qr/finalize', methods=['POST'])
def upload_qr_finalize():
    role = get_current_role()
    if role not in ['Developer', 'Quality Control']:
        return jsonify({'error': _('Access denied!')}), 403

    base_code = request.form.get('base_code', '')
    upload_id = request.form.get('upload_id', '')
    had_failures = request.form.get('had_failures') == '1'

    if upload_id:
        tmp_path = _tmp_pdf_path(upload_id)
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    if base_code and not had_failures:
        _clear_progress(base_code)

    return jsonify({'status': 'done'})


@qr_bp.route('/delete_qr/<int:qr_id>', methods=['POST'])
def delete_qr(qr_id):
    role = get_current_role()
    if role not in ['Developer', 'Quality Control']:
        flash(_('Access denied!'), 'danger')
        return redirect(url_for('qr.qr_codes_page'))

    qr = db.session.get(QRCodeModel, qr_id)
    upload_folder = get_qr_upload_folder()
    if qr:
        filepath = os.path.join(upload_folder, qr.pdf_filename)
        if os.path.exists(filepath):
            os.remove(filepath)
            
        base, ext = os.path.splitext(qr.pdf_filename)
        thumb_filepath = os.path.join(upload_folder, f"{base}_thumb{ext}")
        if os.path.exists(thumb_filepath):
            os.remove(thumb_filepath)

        db.session.delete(qr)
        db.session.commit()
        flash(_('Document deleted.'), 'success')
    else:
        flash(_("Document not found."), 'danger')

    return redirect(url_for('qr.qr_codes_page'))


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


@qr_bp.route('/delete_qr_source', methods=['POST'])
def delete_qr_source():
    source_code = request.form.get('source_code')
    if source_code:
        QRCodeModel.query.filter_by(source_document=source_code).delete()
        db.session.commit()
        flash(f'Berhasil menghapus seluruh scene dalam environment code: {source_code}', 'success')
    else:
        flash('Environment code tidak valid!', 'danger')
    
    return redirect(url_for('qr.qr_codes_page'))