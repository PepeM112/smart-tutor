import logging
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

import pytest

from app.config import settings
from app.core.enums import AIProvider
from app.services import pricing_service, token_usage_service


def _row(day: date, model: str, tokens: int, cost: str) -> Any:
    return SimpleNamespace(
        date=day,
        provider=None,
        feature=None,
        model=model,
        input_tokens=tokens,
        output_tokens=tokens,
        estimated_cost=Decimal(cost),
    )


def _provider_row(day: date, provider: AIProvider, tokens: int, cost: str) -> Any:
    return SimpleNamespace(
        date=day,
        provider=int(provider),
        feature=None,
        model=None,
        input_tokens=tokens,
        output_tokens=tokens,
        estimated_cost=Decimal(cost),
    )


def test_group_by_model_keeps_the_totals_of_the_provider_view(monkeypatch: pytest.MonkeyPatch) -> None:
    today = date.today()
    model_rows = [_row(today, "claude-haiku-5-5", 10, "0.5"), _row(today, "gpt-4o-mini", 5, "0.25")]
    provider_rows = [
        _provider_row(today, AIProvider.ANTHROPIC, 10, "0.5"),
        _provider_row(today, AIProvider.OPENAI, 5, "0.25"),
    ]
    rows_by_group: dict[str, list[Any]] = {"model": model_rows, "provider": provider_rows}
    monkeypatch.setattr(
        token_usage_service.token_usage_crud,
        "get_daily_summary",
        lambda _db, **kwargs: rows_by_group[kwargs["group_by"]],
    )

    by_model = token_usage_service.get_usage_summary(MagicMock(), user_id="u", days=7, group_by="model")
    by_provider = token_usage_service.get_usage_summary(MagicMock(), user_id="u", days=7, group_by="provider")

    assert {d.model for d in by_model.daily if d.input_tokens} == {"claude-haiku-5-5", "gpt-4o-mini"}
    assert by_model.total_input_tokens == by_provider.total_input_tokens
    assert by_model.total_estimated_cost == by_provider.total_estimated_cost


def test_startup_price_fetch_swallows_errors_and_logs_a_warning(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(settings, "fetch_prices_on_startup", True)
    monkeypatch.setattr("app.database.SessionLocal", MagicMock())
    monkeypatch.setattr(pricing_service, "fetch_and_update_prices", MagicMock(side_effect=RuntimeError("offline")))

    with caplog.at_level(logging.WARNING, logger="smarttutor.pricing"):
        pricing_service.refresh_prices_on_startup()

    assert [r.levelno for r in caplog.records] == [logging.WARNING]
    assert "offline" in caplog.text


def test_startup_price_fetch_runs_when_the_flag_is_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "fetch_prices_on_startup", True)
    monkeypatch.setattr("app.database.SessionLocal", MagicMock())
    fetch = MagicMock(return_value=2)
    monkeypatch.setattr(pricing_service, "fetch_and_update_prices", fetch)

    pricing_service.refresh_prices_on_startup()

    fetch.assert_called_once()


def test_startup_price_fetch_does_nothing_when_the_flag_is_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "fetch_prices_on_startup", False)
    fetch = MagicMock()
    monkeypatch.setattr(pricing_service, "fetch_and_update_prices", fetch)

    pricing_service.refresh_prices_on_startup()

    fetch.assert_not_called()
