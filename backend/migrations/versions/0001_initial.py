"""Начальная схема: диаграммы, версии, права, комментарии, вложения.

Revision ID: 0001
Revises:
Create Date: 2026-11-12
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "diagram",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("owner_id", sa.String(length=64), nullable=True),
        sa.Column("current_version_id", sa.String(length=36), nullable=True),
        sa.Column("etag", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "diagram_version",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "diagram_id",
            sa.String(length=36),
            sa.ForeignKey("diagram.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("xml", sa.Text(), nullable=False),
        sa.Column("message", sa.String(length=255), nullable=True),
        sa.Column("author_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_diagram_version_diagram_id", "diagram_version", ["diagram_id"])

    op.create_table(
        "diagram_acl",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "diagram_id",
            sa.String(length=36),
            sa.ForeignKey("diagram.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False, server_default="viewer"),
        sa.UniqueConstraint("diagram_id", "user_id", name="uq_acl_diagram_user"),
    )
    op.create_index("ix_diagram_acl_diagram_id", "diagram_acl", ["diagram_id"])

    op.create_table(
        "comment",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "diagram_id",
            sa.String(length=36),
            sa.ForeignKey("diagram.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("element_id", sa.String(length=255), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("author_id", sa.String(length=64), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_comment_diagram_id", "comment", ["diagram_id"])

    op.create_table(
        "attachment",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "diagram_id",
            sa.String(length=36),
            sa.ForeignKey("diagram.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("element_id", sa.String(length=255), nullable=True),
        sa.Column("s3_key", sa.String(length=512), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=128), nullable=True),
        sa.Column("size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_attachment_diagram_id", "attachment", ["diagram_id"])


def downgrade() -> None:
    op.drop_table("attachment")
    op.drop_table("comment")
    op.drop_table("diagram_acl")
    op.drop_table("diagram_version")
    op.drop_table("diagram")
