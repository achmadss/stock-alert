"""add message_id to trading_plans

Revision ID: 001
Revises:
Create Date: 2025-12-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add message_id column
    op.add_column('trading_plans', sa.Column('message_id', sa.BigInteger(), nullable=True))

    # Create index
    op.create_index('ix_trading_plans_message_id', 'trading_plans', ['message_id'], unique=True)

    # Note: We set nullable=True first, then will set to nullable=False after data migration
    # If table is empty or you want to drop existing data, you can make it NOT NULL immediately


def downgrade() -> None:
    # Drop index
    op.drop_index('ix_trading_plans_message_id', table_name='trading_plans')

    # Drop column
    op.drop_column('trading_plans', 'message_id')
