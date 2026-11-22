"""Tests for the time format and timezone settings of `UserUpdate` / `UserRead`.

Run:  pytest tests/test_user_settings.py
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.user import UserUpdate


@pytest.mark.parametrize("time_format", ["12h", "24h"])
def test_time_format_accepts_both_values(time_format: str) -> None:
    assert UserUpdate(time_format=time_format).time_format == time_format  # type: ignore[arg-type]


@pytest.mark.parametrize("value", ["13h", "", "24H"])
def test_time_format_rejects_other_values(value: str) -> None:
    with pytest.raises(ValidationError):
        UserUpdate(time_format=value)  # type: ignore[arg-type]


def test_time_format_rejects_null() -> None:
    with pytest.raises(ValidationError, match="cannot be null"):
        UserUpdate(time_format=None)


# Legacy names: browsers still report them, and slim images only know them through the `tzdata` package.
@pytest.mark.parametrize(
    "zone", ["Europe/Madrid", "America/New_York", "UTC", "Asia/Calcutta", "Europe/Kiev", "Asia/Saigon", "US/Eastern"]
)
def test_timezone_accepts_iana_zones(zone: str) -> None:
    assert UserUpdate(timezone=zone).timezone == zone


@pytest.mark.parametrize("zone", ["Mars/Olympus", "madrid", "GMT+2"])
def test_timezone_rejects_unknown_zones(zone: str) -> None:
    with pytest.raises(ValidationError, match="IANA"):
        UserUpdate(timezone=zone)


@pytest.mark.parametrize("cleared", [None, ""])
def test_timezone_null_or_empty_clears_it(cleared: str | None) -> None:
    update = UserUpdate(timezone=cleared)
    assert update.timezone is None
    assert update.model_dump(exclude_unset=True) == {"timezone": None}
