import importlib
import pkgutil

import pytest

import app.models

# Register every model on `Base.metadata`, as `alembic/env.py` does. A test file that imports
# only some models otherwise fails when SQLAlchemy configures the mappers: string relationships
# such as `Question → "TestQuestionGroup"` cannot be found. The loop picks up new models itself.
for _module in pkgutil.iter_modules(app.models.__path__):
    importlib.import_module(f"app.models.{_module.name}")


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption("--run-integration", action="store_true", default=False)


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "integration: real API calls (need API keys, cost money)")


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if config.getoption("--run-integration"):
        return
    skip = pytest.mark.skip(reason="use --run-integration to run")
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip)
