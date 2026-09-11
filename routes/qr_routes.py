import os
import re
import json
import hashlib
from datetime import datetime
from flask import Blueprint, render_template, request, redirect, url_for, session, flash, jsonify
from flask_babel import gettext as _
from werkzeug.utils import secure_filename
from database import db, QRCodeModel
from pypdf import PdfReader
import pymupdf as fitz  # Diperbarui menggunakan pymupdf agar bersih dari warning

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


# ==========================================================================
# PELACAK PROGRES UPLOAD (untuk fitur "lanjutkan upload yang terputus")
#
# Disimpan sebagai file JSON kecil, TERPISAH dari database -- supaya tidak
# perlu ubah skema tabel QRCodeModel. Kuncinya BUKAN nama file/kode proyek
# saja, tapi juga HASH ISI FILE. Jadi kalau ada file LAIN yang beda isi tapi
# kebetulan kode proyeknya sama, hash-nya pasti beda -> tidak akan dianggap
# "lanjutan", semua halamannya tetap diproses normal, tidak ada yang di-skip.
# ==========================================================================

def _progress_path(base_code: str) -> str:
    return os.path.join(QR_UPLOAD_FOLDER, f".progress_{secure_filename(base_code)}.json")


def _load_progress(base_code: str, file_hash: str) -> set:
    """Kembalikan set nomor halaman yang sudah pernah berhasil, HANYA kalau
    file yang di-upload sekarang persis sama (hash cocok) dengan percobaan
    sebelumnya. Kalau tidak ada progres tersimpan, atau hash-nya beda (berarti
    ini file lain, bukan lanjutan), kembalikan set kosong -- artinya semua
    halaman diproses dari awal, tidak ada yang di-skip."""
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


def _tmp_pdf_path(base_code: str) -> str:
    """Lokasi salinan sementara PDF mentah, dipakai endpoint per-halaman
    (/upload_qr/page) supaya file cukup dikirim SEKALI dari browser (lewat
    /upload_qr/init), lalu tiap request per-halaman berikutnya tinggal buka
    salinan ini -- tidak perlu upload ulang seluruh file tiap halaman."""
    return os.path.join(QR_UPLOAD_FOLDER, f".tmp_{secure_filename(base_code)}.pdf")


def _resolve_base_code(original_filename: str) -> str:
    env_match = re.search(r'([a-zA-Z0-9_]+_x_[a-zA-Z0-9_]+_\d+)', original_filename, re.IGNORECASE)
    return env_match.group(1) if env_match else os.path.splitext(secure_filename(original_filename))[0]


def _render_and_save_page(doc, i: int, base_code: str, already_uploaded_pages: set, file_hash: str) -> bool:
    """Proses SATU halaman (render gambar full + thumbnail, simpan ke DB).
    Dipakai baik oleh route lama (/upload_qr, proses semua halaman sekaligus)
    maupun route baru (/upload_qr/page, proses 1 halaman per request) --
    supaya logikanya tidak ada yang duplikat/ketinggalan sinkron.

    Return True kalau sukses, False kalau gagal (halaman ini dilewati,
    tapi tidak menjatuhkan proses halaman lain)."""
    page = doc[i - 1]
    doc_name = f"Scene {i}"
    safe_base = secure_filename(f"{base_code}_scene_{i}") or f"page_{i}"

    full_path = None
    thumb_path = None
    pix_full = None
    pix_thumb = None
    try:
        # Dioptimalkan dari 1.5 ke 1.2 agar proses render lebih ringan & terhindar dari timeout server
        zoom = 1.2
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
        crop_y0 = page_rect.height * 0.42  # Batas atas kotak foto utama
        crop_x1 = page_rect.width * 0.90  # Batas kanan kotak foto utama
        crop_y1 = page_rect.height * 0.70  # Batas bawah kotak foto utama
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


# F-18: Tambah File QR (Dev, Quality Control)
# CATATAN: route ini masih dipertahankan sebagai FALLBACK kalau JavaScript di
# browser tidak jalan (proses semua halaman dalam SATU request, seperti versi
# lama). Jalur utama yang dipakai UI sekarang ada di 3 endpoint di bawahnya
# (/upload_qr/init, /upload_qr/page, /upload_qr/finalize), yang memecah proses
# jadi banyak request kecil per-halaman supaya tidak kena timeout server saat
# PDF-nya banyak halaman.
@qr_bp.route('/upload_qr', methods=['POST'])
def upload_qr():
    role = get_current_role()
    if role not in ['Developer', 'Quality Control']:
        flash(_('Access denied! Only Developer and Quality Control can add QR files.'), 'danger')
        return redirect(url_for('qr.qr_codes_page'))

    # ======================================================
    # PENCEGAHAN ERROR 500: Buat folder otomatis jika belum ada
    # ======================================================
    if not os.path.exists(QR_UPLOAD_FOLDER):
        os.makedirs(QR_UPLOAD_FOLDER, exist_ok=True)
    # ======================================================

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

    # Hash isi file -- ini yang jadi penentu "apakah ini upload ulang file yang
    # SAMA PERSIS" (baru boleh skip halaman), bukan sekadar kode proyek di nama
    # filenya (yang bisa kebetulan sama walau isi filenya beda).
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    already_uploaded_pages = _load_progress(base_code, file_hash)

    created = 0
    skipped = 0
    failed_pages = []

    for i in range(1, len(doc) + 1):
        if i in already_uploaded_pages:
            # Halaman ini sudah pernah berhasil di-upload sebelumnya (dari
            # percobaan upload yang sama, yang mungkin terputus di tengah).
            # Lewati saja -- tidak perlu render/save ulang.
            skipped += 1
            continue

        ok = _render_and_save_page(doc, i, base_code, already_uploaded_pages, file_hash)
        if ok:
            created += 1
        else:
            failed_pages.append(i)

    # ======================================================
    # PENCEGAHAN MEMORY LEAK: Tutup dokumen setelah selesai
    # ======================================================
    doc.close()

    if not failed_pages:
        # Semua halaman dari file ini sudah tuntas (baik baru diproses maupun
        # sudah ada dari percobaan sebelumnya) -- file pelacak progres tidak
        # dibutuhkan lagi, bersihkan.
        _clear_progress(base_code)

    if created:
        flash(_('%(count)s new page(s) successfully uploaded.', count=created), 'success')
    if skipped:
        flash(_('%(count)s page(s) skipped (already uploaded from a previous attempt of this exact file).', count=skipped), 'info')
    if failed_pages:
        flash(_('%(count)s page(s) failed to process: %(pages)s. Upload the exact same file again to retry just these pages.', count=len(failed_pages), pages=', '.join(map(str, failed_pages))), 'danger')
    return redirect(url_for('qr.qr_codes_page'))


# ==========================================================================
# JALUR UPLOAD BARU (CHUNKED / PER-HALAMAN)
#
# Dipakai oleh script.js supaya request ke server SELALU cepat, berapa pun
# jumlah halaman PDF-nya -- karena tiap request cuma memproses 1 halaman.
# Ini menghindari timeout di server/reverse-proxy (yang konfigurasinya di
# luar kendali aplikasi ini) untuk PDF dengan banyak halaman.
#
# Alurnya:
#   1) POST /upload_qr/init   -> kirim file sekali, dapat total_pages + info
#                                 halaman mana saja yang sudah pernah sukses
#   2) POST /upload_qr/page   -> dipanggil berkali-kali oleh browser, 1x per
#                                 halaman yang belum selesai
#   3) POST /upload_qr/finalize -> beres-beres (hapus salinan sementara,
#                                 bersihkan file progres kalau semua sukses)
# ==========================================================================

@qr_bp.route('/upload_qr/init', methods=['POST'])
def upload_qr_init():
    role = get_current_role()
    if role not in ['Developer', 'Quality Control']:
        return jsonify({'error': _('Access denied! Only Developer and Quality Control can add QR files.')}), 403

    if not os.path.exists(QR_UPLOAD_FOLDER):
        os.makedirs(QR_UPLOAD_FOLDER, exist_ok=True)

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

    # Simpan salinan file mentah sementara di server -- supaya endpoint
    # per-halaman (di bawah) bisa membukanya lagi tanpa perlu browser
    # mengirim ulang seluruh file di tiap request per-halaman.
    with open(_tmp_pdf_path(base_code), 'wb') as f:
        f.write(file_bytes)

    already_done = _load_progress(base_code, file_hash)

    return jsonify({
        'base_code': base_code,
        'file_hash': file_hash,
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

    try:
        page_num = int(request.form.get('page', ''))
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid page number.'}), 400

    tmp_path = _tmp_pdf_path(base_code)
    if not base_code or not os.path.exists(tmp_path):
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

    # Catatan: tetap balas HTTP 200 walau 1 halaman gagal -- "gagal" di sini
    # artinya gagal RENDER halaman tersebut, bukan error pada request-nya.
    # Browser akan mencatatnya sebagai failed_pages dan bisa retry belakangan.
    return jsonify({'status': 'ok' if ok else 'failed', 'page': page_num})


@qr_bp.route('/upload_qr/finalize', methods=['POST'])
def upload_qr_finalize():
    role = get_current_role()
    if role not in ['Developer', 'Quality Control']:
        return jsonify({'error': _('Access denied!')}), 403

    base_code = request.form.get('base_code', '')
    had_failures = request.form.get('had_failures') == '1'

    if base_code:
        tmp_path = _tmp_pdf_path(base_code)
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

        if not had_failures:
            # Semua halaman tuntas -- file pelacak progres tidak dibutuhkan lagi.
            _clear_progress(base_code)

    return jsonify({'status': 'done'})


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