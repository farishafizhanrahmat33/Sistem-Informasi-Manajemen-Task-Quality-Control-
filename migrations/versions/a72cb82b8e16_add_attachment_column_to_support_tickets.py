"""add attachment column to support_tickets

Revision ID: a72cb82b8e16
Revises: 0876a88af900
Create Date: 2026-09-29 ...
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a72cb82b8e16'
down_revision = '0876a88af900'
branch_labels = None
depends_on = None


def upgrade():
    # HANYA TAMBAHKAN KOLOM INI, jangan sentuh tabel users!
    op.add_column('support_tickets', sa.Column('attachment', sa.String(length=255), nullable=True))


def downgrade():
    op.drop_column('support_tickets', 'attachment')