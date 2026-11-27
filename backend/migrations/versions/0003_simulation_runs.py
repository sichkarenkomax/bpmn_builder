"""Сохранённые прогоны симуляции и тест-кейсы (этап 3).

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-26
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "simulation_run",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "diagram_id",
            sa.String(length=36),
            sa.ForeignKey("diagram.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version_id", sa.String(length=36), nullable=True),
        sa.Column("variables", sa.JSON(), nullable=False),
        sa.Column("choices", sa.JSON(), nullable=False),
        sa.Column("report", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_simulation_run_diagram_id", "simulation_run", ["diagram_id"])

    op.create_table(
        "test_case",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "diagram_id",
            sa.String(length=36),
            sa.ForeignKey("diagram.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("variables", sa.JSON(), nullable=False),
        sa.Column("choices", sa.JSON(), nullable=False),
        sa.Column("expected_steps", sa.JSON(), nullable=False),
        sa.Column("expected_variables", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_test_case_diagram_id", "test_case", ["diagram_id"])


def downgrade() -> None:
    op.drop_index("ix_test_case_diagram_id", table_name="test_case")
    op.drop_table("test_case")
    op.drop_index("ix_simulation_run_diagram_id", table_name="simulation_run")
    op.drop_table("simulation_run")
