from typing import TypeAlias

from sqlalchemy import ColumnElement, and_, or_, true
from sqlalchemy.orm import InstrumentedAttribute

_TextColumn: TypeAlias = InstrumentedAttribute[str] | InstrumentedAttribute[str | None]


def _escape_ilike(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def ilike_search(column: _TextColumn, *, value: str) -> ColumnElement[bool]:
    """Single-column ILIKE containment search with escaped wildcards."""
    escaped = _escape_ilike(value)
    return column.ilike(f"%{escaped}%", escape="\\")


def token_search(*columns: _TextColumn, search: str) -> ColumnElement[bool]:
    """AND-match every whitespace-delimited token against any of the given columns.

    ``token_search(Test.title, Test.description, search="history exam")``
    produces: ``(title ILIKE '%history%' OR desc ILIKE '%history%')
               AND (title ILIKE '%exam%' OR desc ILIKE '%exam%')``
    """
    tokens = search.split()
    if not tokens:
        return true()
    escaped = [_escape_ilike(t) for t in tokens]
    return and_(*(or_(*(col.ilike(f"%{e}%", escape="\\") for col in columns)) for e in escaped))
