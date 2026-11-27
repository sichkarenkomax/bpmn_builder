"""Схемы учётных записей, сессий и ACL (4.1)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

AclRole = Literal["viewer", "commenter", "editor"]


def normalize_email(value: str) -> str:
    email = value.strip().lower()
    if "@" not in email or email.startswith("@") or email.endswith("@"):
        msg = "укажите корректный email"
        raise ValueError(msg)
    return email


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            msg = "имя не может быть пустым"
            raise ValueError(msg)
        return name


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return normalize_email(value)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    name: str
    created_at: datetime


class AclEntryRead(BaseModel):
    user_id: str
    email: str
    name: str
    role: str
    is_owner: bool = False


class AclUpdate(BaseModel):
    role: AclRole


__all__ = [
    "AclEntryRead",
    "AclRole",
    "AclUpdate",
    "LoginRequest",
    "RegisterRequest",
    "UserRead",
    "normalize_email",
]
