import os
import re
from pathlib import Path
from babel.messages.pofile import read_po, write_po

# List template yang perlu di-wrap
TEMPLATES_TO_WRAP = [
    'templates/dashboard.html',
    'templates/index.html',
    'templates/login_modal.html',
    'templates/navbar.html',
    'templates/profile.html',
    'templates/admin_support.html',
    'templates/user_management.html',
    'templates/support.html',
    'templates/faq.html',
    # Tambah template lain sesuai project kamu
]

def wrap_text_in_template(filepath):
    """
    Wrap teks yang user-facing pakai {{ _('...') }}
    Skip: Jinja tags, HTML attributes, URL, numbers only
    """
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Pattern: text di antara > dan <, atau antara > dan {{ atau > dan {%
    # Yang perlu di-wrap: text content (bukan tags, attributes, atau Jinja)
    
    # Contoh pola yang skip:
    patterns_to_skip = [
        r'{%.*?%}',      # Jinja tags
        r'{{.*?}}',      # Jinja expressions (udah ada?)
        r'data-.*?=',    # HTML attributes
        r'class=',       # CSS class
        r'id=',          # ID
        r'href=',        # Links
        r'\d+',          # Numbers only
    ]
    
    # Regex buat detect teks yang perlu di-wrap
    # Text yang ada di antara > dan < (teks content di HTML)
    # Exclude: whitespace only, numbers only, sudah ada {{ _
    
    def should_wrap(text):
        text = text.strip()
        if not text:
            return False
        if text.startswith('{{'):  # Sudah ada Jinja
            return False
        if text.isdigit():  # Numbers only
            return False
        if re.match(r'^[\s\-:,\.]+$', text):  # Symbols/whitespace only
            return False
        # Skip kalau sudah ada {{ _
        if '{{ _' in text or '{%' in text:
            return False
        return True
    
    # Find text nodes (antara > dan <)
    wrapped = re.sub(
        r'(>)([^<{]+?)(<)',
        lambda m: m.group(1) + (f"{{{{ _({m.group(2)!r}) }}}}" if should_wrap(m.group(2)) else m.group(2)) + m.group(3),
        content
    )
    
    # Safer approach: hanya wrap teks yang jelas-jelas content
    # Ini agak risky, jadi better approach: do it semi-manually dengan tool
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(wrapped)
    
    print(f"Wrapped: {filepath}")

# Jalanin wrapper (optional, risky - better do it manual)
# for tmpl in TEMPLATES_TO_WRAP:
#     if os.path.exists(tmpl):
#         wrap_text_in_template(tmpl)

# NEW TRANSLATIONS untuk string yang akan ketemu setelah wrap
NEW_TRANSLATIONS = {
    # Dari dashboard.html (contoh)
    "Quality Control Dashboard": "Dashboard Kontrol Kualitas",
    "Sample Done": "Sampel Selesai",
    "Ready for Production": "Siap Produksi",
    
    # Dari index.html (contoh)
    "Task ID": "ID Task",
    "Project": "Proyek",
    "Package": "Paket",
    "Status": "Status",
    "Search Task ID, Spec, or Description...": "Cari ID Task, Spek, atau Deskripsi...",
    
    # Dari profile.html (contoh)
    "My Profile": "Profil Saya",
    "Full Name": "Nama Lengkap",
    "Email": "Email",
    "Change Password": "Ubah Password",
    "Save Changes": "Simpan Perubahan",
    
    # Dari support.html
    "Send Message": "Kirim Pesan",
    "Message": "Pesan",
    "Your Message": "Pesan Kamu",
    
    # Tambah lebih banyak sesuai yang ketemu di template
}

def add_translations_to_po():
    """
    Tambah terjemahan baru ke file .po
    """
    po_path = 'translations/id/LC_MESSAGES/messages.po'
    
    with open(po_path, 'rb') as f:
        catalog = read_po(f)
    
    added = 0
    for msgid, msgstr in NEW_TRANSLATIONS.items():
        # Cek apakah entry sudah ada
        existing = catalog.get(msgid)
        if existing is None or not existing.string:
            # Tambah atau update
            for message in catalog:
                if message.id == msgid:
                    message.string = msgstr
                    added += 1
                    break
    
    with open(po_path, 'wb') as f:
        write_po(f, catalog, width=0)
    
    print(f"Added/Updated {added} translations")

if __name__ == '__main__':
    print("⚠️ Script ini hanya helper semi-automatic.")
    print("Rekomendasi: wrap template MANUAL dulu (lebih safe), baru jalanin extract/compile.")
    print()
    print("Step-by-step MANUAL lebih aman:")
    print("1. Buka setiap template di templates/")
    print("2. Wrap user-facing text pakai {{ _('...') }}")
    print("3. Jalanin: pybabel extract -F babel.cfg -o messages.pot .")
    print("4. Jalanin: pybabel update -i messages.pot -d translations")
    print("5. Edit translations/id/LC_MESSAGES/messages.po isi msgstr yang kosong")
    print("6. Jalanin: pybabel compile -d translations")