"""Tests for crud/helpers.py token_search."""

from __future__ import annotations

from sqlalchemy import String, create_engine, select, true
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.crud.helpers import token_search
from app.database import Base


class DummyRow(Base):
    __tablename__ = "dummy_token_search"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)


engine = create_engine("sqlite:///:memory:")
Base.metadata.create_all(engine)


def _seed(session: Session) -> None:
    session.add_all(
        [
            DummyRow(id=1, title="History exam", description="World War II"),
            DummyRow(id=2, title="Math quiz", description="Algebra basics"),
            DummyRow(id=3, title="50% off sale", description="Discount store"),
            DummyRow(id=4, title="under_score test", description=None),
        ]
    )
    session.flush()


class TestTokenSearch:
    def test_single_token_matches(self) -> None:
        with Session(engine) as s:
            _seed(s)
            clause = token_search(DummyRow.title, search="history")
            rows = s.scalars(select(DummyRow).where(clause)).all()
            assert [r.id for r in rows] == [1]

    def test_multi_token_and_logic(self) -> None:
        with Session(engine) as s:
            _seed(s)
            clause = token_search(DummyRow.title, DummyRow.description, search="history war")
            rows = s.scalars(select(DummyRow).where(clause)).all()
            assert [r.id for r in rows] == [1]

    def test_multi_token_no_match(self) -> None:
        with Session(engine) as s:
            _seed(s)
            clause = token_search(DummyRow.title, search="history math")
            rows = s.scalars(select(DummyRow).where(clause)).all()
            assert rows == []

    def test_cross_column_match(self) -> None:
        with Session(engine) as s:
            _seed(s)
            clause = token_search(DummyRow.title, DummyRow.description, search="math algebra")
            rows = s.scalars(select(DummyRow).where(clause)).all()
            assert [r.id for r in rows] == [2]

    def test_case_insensitive(self) -> None:
        with Session(engine) as s:
            _seed(s)
            clause = token_search(DummyRow.title, search="HISTORY")
            rows = s.scalars(select(DummyRow).where(clause)).all()
            assert [r.id for r in rows] == [1]

    def test_whitespace_only_returns_all(self) -> None:
        with Session(engine) as s:
            _seed(s)
            clause = token_search(DummyRow.title, search="   ")
            assert clause.compare(true())

    def test_empty_string_returns_all(self) -> None:
        with Session(engine) as s:
            _seed(s)
            clause = token_search(DummyRow.title, search="")
            assert clause.compare(true())

    def test_percent_wildcard_escaped(self) -> None:
        with Session(engine) as s:
            _seed(s)
            clause = token_search(DummyRow.title, search="50%")
            rows = s.scalars(select(DummyRow).where(clause)).all()
            assert [r.id for r in rows] == [3]

    def test_underscore_wildcard_escaped(self) -> None:
        with Session(engine) as s:
            _seed(s)
            clause = token_search(DummyRow.title, search="under_score")
            rows = s.scalars(select(DummyRow).where(clause)).all()
            assert [r.id for r in rows] == [4]
