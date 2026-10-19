"""Every service and endpoint module must import on its own, in any order.

`app.main` imports the endpoints in a fixed order, which can hide an import cycle between services: the cycle
only fails for a script or a test that imports one of the modules first. One fresh interpreter per module
makes the import order the only variable.
"""

import os
import pkgutil
import subprocess
import sys
from types import ModuleType

import pytest

import app.api.v1.endpoints
import app.services


def _module_names(package: ModuleType, prefix: str) -> list[str]:
    return sorted(m.name for m in pkgutil.walk_packages(package.__path__, prefix=prefix))


MODULES: list[str] = [
    *_module_names(app.services, "app.services."),
    *_module_names(app.api.v1.endpoints, "app.api.v1.endpoints."),
]


@pytest.mark.parametrize("module", MODULES)
def test_the_module_imports_in_a_fresh_interpreter(module: str) -> None:
    # `app.database` raises at import time without a DATABASE_URL. It does not connect, so a dummy is enough.
    env = {**os.environ, "DATABASE_URL": os.environ.get("DATABASE_URL", "postgresql://user:pass@localhost:5432/db")}
    run = subprocess.run(
        [sys.executable, "-c", f"import {module}"], env=env, capture_output=True, text=True, timeout=60, check=False
    )
    assert run.returncode == 0, run.stderr[-2000:]
