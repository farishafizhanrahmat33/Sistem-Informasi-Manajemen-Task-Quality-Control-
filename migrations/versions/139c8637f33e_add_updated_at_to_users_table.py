"""add updated_at to users table

Revision ID: 139c8637f33e
Revises: d488dc8b5a18
Create Date: 2026-09-29 ...
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '139c8637f33e'
down_revision = 'd488dc8b5a18'
branch_labels = None
depends_on = None


def upgrade():
    # Hanya tambahkan kolom updated_at tanpa mengutak-atik constraint/index lain
    op.add_column('users', sa.Column('updated_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('users', 'updated_at')