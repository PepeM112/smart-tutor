from typing import TypeAlias

from sqlalchemy import ColumnElement, and_, or_, true
from sqlalchemy.orm import InstrumentedAttribute

_TextColumn: TypeAlias = InstrumentedAttribute[str] | InstrumentedAttribute[str | None]


def token_search(*columns: _TextColumn, search: str) -> ColumnElement[bool]:
    """AND-match every whitespace-delimited token against any of the given columns.

    ``token_search(Test.title, Test.description, search="history exam")``
    produces: ``(title ILIKE '%history%' OR desc ILIKE '%history%')
               AND (title ILIKE '%exam%' OR desc ILIKE '%exam%')``
    """
    tokens = search.split()
    if not tokens:
        return true()
    escaped = [t.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") for t in tokens]
    return and_(*(or_(*(col.ilike(f"%{e}%", escape="\\") for col in columns)) for e in escaped))
