"""initial schema with message_id

Revision ID: 001
Revises:
Create Date: 2025-12-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create trading_plans table with message_id from the start
    op.create_table(
        'trading_plans',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('message_id', sa.BigInteger(), nullable=False),
        sa.Column('datetime', sa.DateTime(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('buy', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('tp', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('sl', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes
    op.create_index('ix_trading_plans_datetime', 'trading_plans', ['datetime'], unique=False)
    op.create_index('ix_trading_plans_message_id', 'trading_plans', ['message_id'], unique=True)


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_trading_plans_message_id', table_name='trading_plans')
    op.drop_index('ix_trading_plans_datetime', table_name='trading_plans')

    # Drop table
    op.drop_table('trading_plans')
