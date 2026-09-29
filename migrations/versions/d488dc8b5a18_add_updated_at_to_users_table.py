"""add updated_at to users table

Revision ID: d488dc8b5a18
Revises: a72cb82b8e16
Create Date: ...
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd488dc8b5a18'
down_revision = 'a72cb82b8e16'
branch_labels = None
depends_on = None


def upgrade():
    # Cukup gunakan perintah add_column tanpa batch_alter_table yang merombak constraint
    op.add_column('users', sa.Column('updated_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('users', 'updated_at')