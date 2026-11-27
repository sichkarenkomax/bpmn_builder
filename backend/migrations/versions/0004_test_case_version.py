"""Тест-кейс привязан к версии XML, а не к плавающей текущей версии.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-26
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("test_case", sa.Column("version_id", sa.String(length=36), nullable=True))


def downgrade() -> None:
    op.drop_column("test_case", "version_id")
