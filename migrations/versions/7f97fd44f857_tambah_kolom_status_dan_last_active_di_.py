"""tambah kolom status dan last_active di tabel users

Revision ID: 7f97fd44f857
Revises: db2a3e1c4ba9
Create Date: 2026-09-19 11:23:53.687427

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7f97fd44f857'
down_revision = 'db2a3e1c4ba9'
branch_labels = None
depends_on = None


def upgrade():
    # Dikosongkan karena kolom sudah ditambahkan manual via DBeaver
    # dan constraint username tidak perlu diubah-ubah agar aman dari error PostgreSQL.
    pass


def downgrade():
    pass