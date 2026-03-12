"""SQLAlchemy typing helpers for SQLModel query expressions."""

from typing import Any, TypeVar, cast

from sqlalchemy.sql.elements import ColumnElement

T = TypeVar("T")


def col(expr: Any) -> ColumnElement[Any]:
    """Cast SQLModel attributes to SQLAlchemy column elements for type checking."""
    return cast("ColumnElement[Any]", expr)
