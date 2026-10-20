
from datetime import date

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from src.marketlens.api import app
from src.marketlens import api


client = TestClient(app)


@pytest.fixture
def sample_market_data():
    """Create deterministic market data for API tests."""
    dates = pd.to_datetime(
        [
            "2026-08-28",
            "2026-08-31",
            "2026-09-01",
            "2026-09-02",
            "2026-09-03",
            "2026-09-30",
            "2026-10-01",
        ]
    )

    return pd.DataFrame(
        {
            "Open": [100, 102, 104, 103, 106, 110, 108],
            "High": [103, 105, 106, 107, 109, 112, 111],
            "Low": [99, 101, 102, 102, 104, 108, 106],
            "Close": [102, 104, 103, 106, 108, 109, 110],
            "Volume": [1000, 1100, 1200, 1300, 1400, 1500, 1600],
        },
        index=dates,
    )


@pytest.fixture
def mock_market_data(monkeypatch, sample_market_data):
    """Make API endpoints use test data instead of PostgreSQL."""

    def fake_load_market_data(ticker):
        if ticker == "UNKNOWN":
            raise ValueError("No market data found for UNKNOWN")
        data = sample_market_data.copy()

        if ticker == "^GSPC":
            data["Close"] = data["Close"] * 2

        return data

    monkeypatch.setattr(
        api,
        "load_market_data_from_db",
        fake_load_market_data,
    )


def test_health_endpoint():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_list_stocks(monkeypatch):
    class FakeCursor:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def execute(self, query):
            pass

        def fetchall(self):
            return [("AAPL", "Apple Inc.", "NASDAQ", "USD")]

    class FakeConnection:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def cursor(self):
            return FakeCursor()

    monkeypatch.setattr(
        api,
        "get_connection",
        lambda: FakeConnection(),
    )

    response = client.get("/stocks")

    assert response.status_code == 200
    assert response.json() == [
        {
            "ticker": "AAPL",
            "name": "Apple Inc.",
            "exchange": "NASDAQ",
            "currency": "USD",
        }
    ]


def test_metrics_endpoint_returns_summary(mock_market_data):
    response = client.get("/stocks/AAPL/metrics")

    assert response.status_code == 200

    body = response.json()
    assert body["ticker"] == "AAPL"
    assert body["metrics"]["observations"] == 7
    assert body["metrics"]["start_date"] == "2026-08-28"
    assert body["metrics"]["end_date"] == "2026-10-01"


def test_metrics_endpoint_filters_dates(mock_market_data):
    response = client.get(
        "/stocks/AAPL/metrics",
        params={
            "start_date": "2026-09-01",
            "end_date": "2026-09-30",
        },
    )

    assert response.status_code == 200

    metrics = response.json()["metrics"]
    assert metrics["observations"] == 4
    assert metrics["start_date"] == "2026-09-01"
    assert metrics["end_date"] == "2026-09-30"


def test_invalid_date_range_returns_400(mock_market_data):
    response = client.get(
        "/stocks/AAPL/metrics",
        params={
            "start_date": "2026-09-30",
            "end_date": "2026-09-01",
        },
    )

    assert response.status_code == 400


def test_unknown_ticker_returns_404(mock_market_data):
    response = client.get("/stocks/UNKNOWN/metrics")

    assert response.status_code == 404


def test_history_endpoint_filters_dates(mock_market_data):
    response = client.get(
        "/stocks/AAPL/history",
        params={
            "start_date": "2026-09-01",
            "end_date": "2026-09-30",
        },
    )

    assert response.status_code == 200

    body = response.json()
    assert body["ticker"] == "AAPL"
    assert body["count"] == 4
    assert all(
        "2026-09-01" <= row["date"] <= "2026-09-30"
        for row in body["history"]
    )


def test_analytics_series_filters_dates(mock_market_data):
    response = client.get(
        "/stocks/AAPL/analytics-series",
        params={
            "start_date": "2026-09-01",
            "end_date": "2026-09-30",
        },
    )

    assert response.status_code == 200

    body = response.json()
    assert body["count"] == 4
    assert all(
        "2026-09-01" <= point["date"] <= "2026-09-30"
        for point in body["series"]
    )


def test_benchmark_comparison_endpoint(mock_market_data):
    response = client.get("/stocks/AAPL/benchmark-comparison")

    assert response.status_code == 200

    body = response.json()
    assert body["ticker"] == "AAPL"
    assert body["benchmark"] == "^GSPC"
    assert body["count"] > 0

    first = body["series"][0]
    assert first["Stock_Return"] == pytest.approx(0.0)
    assert first["Benchmark_Return"] == pytest.approx(0.0)
    assert first["Relative_Performance"] == pytest.approx(0.0)


def test_benchmark_comparison_filters_dates(mock_market_data):
    response = client.get(
        "/stocks/AAPL/benchmark-comparison",
        params={
            "start_date": "2026-09-01",
            "end_date": "2026-09-30",
        },
    )

    assert response.status_code == 200

    body = response.json()
    assert body["count"] == 4
    assert all(
        "2026-09-01" <= point["date"] <= "2026-09-30"
        for point in body["series"]
    )


def test_benchmark_comparison_invalid_dates(mock_market_data):
    response = client.get(
        "/stocks/AAPL/benchmark-comparison",
        params={
            "start_date": "2026-09-30",
            "end_date": "2026-09-01",
        },
    )

    assert response.status_code == 400


def test_metrics_endpoint_includes_beta_and_alpha():
    response = client.get("/stocks/AAPL/metrics")

    assert response.status_code == 200

    metrics = response.json()["metrics"]

    assert "beta" in metrics
    assert "alpha_annual" in metrics
    assert isinstance(metrics["beta"], (int, float))
    assert isinstance(metrics["alpha_annual"], (int, float))



def test_freshness_endpoint_returns_status(monkeypatch):
    def fake_get_data_freshness(ticker):
        return {
            "ticker": ticker,
            "name": "Apple Inc.",
            "exchange": "NASDAQ",
            "currency": "USD",
            "stored_rows": 251,
            "latest_trade_date": "2026-10-15",
            "last_successful_import": "2026-10-16T20:01:04+05:30",
            "provider": {
                "status": "success",
                "rows_downloaded": 252,
                "latest_trade_date": "2026-10-16",
                "error_message": None,
            },
            "database_import": {
                "status": "success",
                "rows_imported": 251,
                "latest_trade_date": "2026-10-15",
                "error_message": None,
            },
            "data_status": "available",
        }

    monkeypatch.setattr(
        api,
        "get_data_freshness",
        fake_get_data_freshness,
    )

    response = client.get("/stocks/AAPL/freshness")

    assert response.status_code == 200
    body = response.json()

    assert body["ticker"] == "AAPL"
    assert body["name"] == "Apple Inc."
    assert body["exchange"] == "NASDAQ"
    assert body["currency"] == "USD"
    assert body["stored_rows"] == 251
    assert body["latest_trade_date"] == "2026-10-15"
    assert body["last_successful_import"] == (
        "2026-10-16T20:01:04+05:30"
    )
    assert body["provider"]["status"] == "success"
    assert body["database_import"]["status"] == "success"
    assert body["data_status"] == "available"


def test_freshness_endpoint_reports_no_stored_data(monkeypatch):
    def fake_get_data_freshness(ticker):
        return {
            "ticker": ticker,
            "name": "Example Corporation",
            "exchange": "NSE",
            "currency": "INR",
            "stored_rows": 0,
            "latest_trade_date": None,
            "last_successful_import": None,
            "provider": None,
            "database_import": None,
            "data_status": "no_data",
        }

    monkeypatch.setattr(
        api,
        "get_data_freshness",
        fake_get_data_freshness,
    )

    response = client.get("/stocks/EXAMPLE.NS/freshness")

    assert response.status_code == 200
    body = response.json()

    assert body["stored_rows"] == 0
    assert body["latest_trade_date"] is None
    assert body["provider"] is None
    assert body["database_import"] is None
    assert body["data_status"] == "no_data"


def test_freshness_endpoint_unknown_ticker_returns_404(monkeypatch):
    def fake_get_data_freshness(ticker):
        raise ValueError(f"No instrument found for {ticker}.")

    monkeypatch.setattr(
        api,
        "get_data_freshness",
        fake_get_data_freshness,
    )

    response = client.get("/stocks/UNKNOWN/freshness")

    assert response.status_code == 404
    assert "UNKNOWN" in response.json()["detail"]


def test_refresh_status_endpoint_returns_both_stages(monkeypatch):
    expected = {
        "ticker": "AAPL",
        "provider": {
            "status": "success",
            "rows_downloaded": 252,
            "latest_trade_date": "2026-10-16",
        },
        "database_import": {
            "status": "failed",
            "rows_imported": 0,
            "latest_trade_date": None,
            "error_message": "Database unavailable",
        },
    }

    monkeypatch.setattr(
        api,
        "get_refresh_status",
        lambda ticker: expected,
    )

    response = client.get("/stocks/AAPL/refresh-status")

    assert response.status_code == 200
    assert response.json() == expected


def test_refresh_status_endpoint_unknown_ticker_returns_404(monkeypatch):
    def fake_refresh_status(ticker):
        raise ValueError(f"No refresh history found for {ticker}.")

    monkeypatch.setattr(
        api,
        "get_refresh_status",
        fake_refresh_status,
    )

    response = client.get("/stocks/UNKNOWN/refresh-status")

    assert response.status_code == 404


def test_drawdown_recovery_endpoint_compares_stock_and_benchmark(
    mock_market_data,
):
    response = client.get("/stocks/AAPL/drawdown-recovery")

    assert response.status_code == 200

    body = response.json()
    assert body["ticker"] == "AAPL"
    assert body["benchmark"] == "^GSPC"
    assert body["count"] > 0
    assert "maximum_drawdown" in body["stock"]
    assert "maximum_drawdown" in body["benchmark_analysis"]
    assert "maximum_drawdown_difference" in body
    assert all(
        "stock_drawdown" in point and "benchmark_drawdown" in point
        for point in body["series"]
    )


def test_drawdown_recovery_endpoint_unknown_ticker_returns_404(
    mock_market_data,
):
    response = client.get("/stocks/UNKNOWN/drawdown-recovery")

    assert response.status_code == 404


def test_market_insights_endpoint_returns_evidence(mock_market_data):
    response = client.get("/stocks/AAPL/insights")

    assert response.status_code == 200
    body = response.json()
    assert body["ticker"] == "AAPL"
    assert body["benchmark"] == "^GSPC"
    assert body["shared_trading_dates"] > 0
    assert len(body["insights"]) >= 1
    assert "disclaimer" in body

    for insight in body["insights"]:
        assert insight["title"]
        assert insight["message"]
        assert insight["evidence"]
