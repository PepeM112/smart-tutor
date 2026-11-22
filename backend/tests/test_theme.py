"""Tests for the theme setting: the validator (light | dark | system) and the old-id data migration.

Run:  pytest tests/test_theme.py
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from pydantic import ValidationError

from app.schemas.user import UserUpdate

MIGRATION_PATH = (
    Path(__file__).resolve().parents[1] / "alembic" / "versions" / "c5d8e2f1a9b3_st_71_theme_light_dark_system.py"
)

OLD_LIGHT_IDS = ["ocean-blue", "sky", "slate-minimal", "sunset", "coral", "forest", "mint", "sage"]
OLD_DARK_IDS = ["midnight", "carbon", "neon", "noir"]
REMOVED_LIGHT_THEMES = ["light-sand", "light-clay", "light-clay-soft", "light-clay-mist", "light-clay-frame"]

REMAP_MIGRATION_PATH = (
    Path(__file__).resolve().parents[1] / "alembic" / "versions" / "4f4d733b7d96_st_75_remap_removed_light_themes.py"
)


def _load_migration(path: Path = MIGRATION_PATH) -> ModuleType:
    spec = importlib.util.spec_from_file_location("theme_migration", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize(
    "theme",
    [
        "light",
        "light-frame",
        "light-ink",
        "light-ink-frame",
        "dark",
        "system",
    ],
)
def test_user_update_accepts_new_themes(theme: str) -> None:
    assert UserUpdate(theme=theme).theme == theme


@pytest.mark.parametrize("theme", [*OLD_LIGHT_IDS, *OLD_DARK_IDS, *REMOVED_LIGHT_THEMES, "", "Light", "auto"])
def test_user_update_rejects_other_values(theme: str) -> None:
    with pytest.raises(ValidationError):
        UserUpdate(theme=theme)


def test_user_update_allows_missing_theme() -> None:
    assert UserUpdate().theme is None


def test_user_update_rejects_explicit_null_theme() -> None:
    with pytest.raises(ValidationError):
        UserUpdate(theme=None)


def test_user_update_rejects_explicit_null_locale() -> None:
    with pytest.raises(ValidationError):
        UserUpdate(locale=None)


def test_upgrade_maps_every_stored_value() -> None:
    migration = _load_migration()
    stored = [*OLD_LIGHT_IDS, *OLD_DARK_IDS, "system", "light", "dark", "unknown-id"]
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(sa.text('CREATE TABLE "user" (id INTEGER PRIMARY KEY, theme VARCHAR(20) NOT NULL)'))
        connection.execute(
            sa.text('INSERT INTO "user" (id, theme) VALUES (:id, :theme)'),
            [{"id": index, "theme": theme} for index, theme in enumerate(stored)],
        )
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        rows = connection.execute(sa.text('SELECT theme FROM "user" ORDER BY id')).scalars().all()
    assert rows == ["light"] * 8 + ["dark"] * 4 + ["system", "light", "dark", "system"]


def test_remap_migration_moves_removed_light_themes() -> None:
    migration = _load_migration(REMAP_MIGRATION_PATH)
    stored = [*REMOVED_LIGHT_THEMES, "light", "light-frame", "light-ink", "light-ink-frame", "dark", "system"]
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(sa.text('CREATE TABLE "user" (id INTEGER PRIMARY KEY, theme VARCHAR(20) NOT NULL)'))
        connection.execute(
            sa.text('INSERT INTO "user" (id, theme) VALUES (:id, :theme)'),
            [{"id": index, "theme": theme} for index, theme in enumerate(stored)],
        )
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        rows = connection.execute(sa.text('SELECT theme FROM "user" ORDER BY id')).scalars().all()
    assert rows == ["light"] * 4 + [
        "light-frame",
        "light",
        "light-frame",
        "light-ink",
        "light-ink-frame",
        "dark",
        "system",
    ]
