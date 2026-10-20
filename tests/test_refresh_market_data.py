
import importlib

import pandas as pd


refresh_module = importlib.import_module("data.refresh_market_data")


def test_refresh_success_runs_both_stages(monkeypatch):
    sample_history = pd.DataFrame(
        {"Close": [100.0, 101.0]},
        index=pd.to_datetime(["2026-10-15", "2026-10-16"]),
    )
    calls = []

    def fake_fetch_market_data(ticker, period):
        calls.append(("provider", ticker, period))
        return sample_history

    def fake_import_market_data(ticker):
        calls.append(("database", ticker))
        return 2

    monkeypatch.setattr(
        refresh_module, "fetch_market_data", fake_fetch_market_data
    )
    monkeypatch.setattr(
        refresh_module, "import_market_data", fake_import_market_data
    )

    result = refresh_module.refresh_market_data("aapl", "1y")

    assert result is True
    assert calls == [
        ("provider", "AAPL", "1y"),
        ("database", "AAPL"),
    ]


def test_refresh_provider_failure_skips_database(monkeypatch):
    def fake_fetch_market_data(ticker, period):
        raise RuntimeError("Provider unavailable")

    def unexpected_import(ticker):
        raise AssertionError("Database import must be skipped")

    monkeypatch.setattr(
        refresh_module, "fetch_market_data", fake_fetch_market_data
    )
    monkeypatch.setattr(
        refresh_module, "import_market_data", unexpected_import
    )

    result = refresh_module.refresh_market_data("AAPL", "1y")

    assert result is False


def test_refresh_database_failure_returns_false(monkeypatch):
    sample_history = pd.DataFrame(
        {"Close": [100.0]},
        index=pd.to_datetime(["2026-10-16"]),
    )

    monkeypatch.setattr(
        refresh_module,
        "fetch_market_data",
        lambda ticker, period: sample_history,
    )

    def fake_import_market_data(ticker):
        raise RuntimeError("Database unavailable")

    monkeypatch.setattr(
        refresh_module, "import_market_data", fake_import_market_data
    )

    result = refresh_module.refresh_market_data("AAPL", "1y")

    assert result is False
