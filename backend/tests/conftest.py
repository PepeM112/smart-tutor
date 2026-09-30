import importlib
import pkgutil
from collections.abc import Iterator

import pytest
from sqlalchemy.orm import Session

import app.models

# Register every model on `Base.metadata`, as `alembic/env.py` does. A test file that imports
# only some models otherwise fails when SQLAlchemy configures the mappers: string relationships
# such as `Question → "TestQuestionGroup"` cannot be found. The loop picks up new models itself.
for _module in pkgutil.iter_modules(app.models.__path__):
    importlib.import_module(f"app.models.{_module.name}")


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption("--run-integration", action="store_true", default=False)
    parser.addoption("--run-db", action="store_true", default=False)


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "integration: real API calls (need API keys, cost money)")
    config.addinivalue_line("markers", "db: real Postgres (DATABASE_URL); each test is rolled back")


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    # Opt-in markers: (marker, option). The db tests need the network and the shared dev DB.
    opt_in = [("integration", "--run-integration"), ("db", "--run-db")]
    skips = {
        marker: pytest.mark.skip(reason=f"use {option} to run")
        for marker, option in opt_in
        if not config.getoption(option)
    }
    for item in items:
        for marker in skips.keys() & set(item.keywords):
            item.add_marker(skips[marker])


@pytest.fixture
def db_session() -> Iterator[Session]:
    """A session on the real DB inside one outer transaction that is always rolled back.

    `create_savepoint`: each `db.commit()` in the services only releases a SAVEPOINT, so the
    code runs as in production, but nothing stays in the DB after the test.
    """
    # Imported here: `app.database` raises at import time when DATABASE_URL is not set.
    from app.database import engine

    connection = engine.connect()
    outer = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        outer.rollback()
        connection.close()
