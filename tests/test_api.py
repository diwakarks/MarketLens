
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


def test_list_stocks_filters_by_market(monkeypatch):
    class FakeCursor:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def execute(self, query):
            pass

        def fetchall(self):
            return [
                ("AAPL", "Apple Inc.", "NASDAQ", "USD"),
                ("TCS.NS", "Tata Consultancy Services", "NSE", "INR"),
                ("^NSEI", "NIFTY 50", "NSE", "INR"),
            ]

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

    response_in = client.get("/stocks?market=IN")
    assert response_in.status_code == 200
    assert response_in.json() == [
        {
            "ticker": "TCS.NS",
            "name": "Tata Consultancy Services",
            "exchange": "NSE",
            "currency": "INR",
        }
    ]

    response_us = client.get("/stocks?market=US")
    assert response_us.status_code == 200
    assert response_us.json() == [
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


def test_refresh_stock_endpoint_success(monkeypatch):
    calls = []

    def fake_download_and_import(ticker, name, exchange, currency):
        calls.append((ticker, name, exchange, currency))
        return 150

    monkeypatch.setattr(
        api,
        "download_and_import_market_data",
        fake_download_and_import,
    )
    monkeypatch.setattr(
        api,
        "get_data_freshness",
        lambda ticker: {
            "ticker": ticker,
            "stored_rows": 150,
            "latest_trade_date": "2026-10-23",
            "last_successful_import": "2026-10-23T14:30:00Z",
        },
    )
    monkeypatch.setattr(
        api,
        "get_refresh_status",
        lambda ticker: {
            "ticker": ticker,
            "provider": {"status": "success", "rows_downloaded": 150},
            "database_import": {"status": "success", "rows_imported": 150},
        },
    )

    response = client.post("/stocks/TCS.NS/refresh")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "success"
    assert body["ticker"] == "TCS.NS"
    assert body["rows_imported"] == 150
    assert body["latest_trade_date"] == "2026-10-23"
    assert body["last_successful_import"] == "2026-10-23T14:30:00Z"
    assert len(calls) == 1
    assert calls[0][0] == "TCS.NS"
    assert calls[0][3] == "INR"


def test_refresh_stock_endpoint_failure(monkeypatch):
    def fake_download_and_import(ticker, name, exchange, currency):
        raise RuntimeError("Provider connection timeout")

    monkeypatch.setattr(
        api,
        "download_and_import_market_data",
        fake_download_and_import,
    )

    response = client.post("/stocks/TCS.NS/refresh")

    assert response.status_code == 502
    assert "Provider connection timeout" in response.json()["detail"]


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


def test_historical_portfolio_stress_uses_database_data(
    monkeypatch, sample_market_data
):
    loaded_tickers = []

    def fake_load_market_data_from_db(ticker):
        loaded_tickers.append(ticker)
        return sample_market_data.copy()

    monkeypatch.setattr(
        api,
        "load_market_data_from_db",
        fake_load_market_data_from_db,
    )
    monkeypatch.setattr(
        api,
        "calculate_historical_portfolio_stress",
        lambda **kwargs: {"source": "database"},
    )

    response = client.post(
        "/portfolio/historical-stress",
        json={
            "tickers": ["AAPL", "MSFT"],
            "weights": [0.5, 0.5],
            "start_date": "2026-08-28",
            "end_date": "2026-09-03",
            "initial_value": 10000,
        },
    )

    assert response.status_code == 200
    assert response.json() == {"source": "database"}
    assert loaded_tickers == ["AAPL", "MSFT"]


def test_import_stock_success(monkeypatch):
    def fake_download_and_import(
        ticker, *, name, exchange, currency
    ):
        assert ticker == "aapl"
        assert name == "Apple Inc."
        assert exchange == "NASDAQ"
        assert currency == "USD"
        return 250

    monkeypatch.setattr(
        api,
        "download_and_import_market_data",
        fake_download_and_import,
    )

    response = client.post(
        "/stocks/import",
        params={
            "ticker": "aapl",
            "name": "Apple Inc.",
            "exchange": "NASDAQ",
            "currency": "USD",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "ticker": "AAPL",
        "rows_imported": 250,
        "status": "success",
    }


def test_import_stock_invalid_metadata_returns_400(monkeypatch):
    def fake_download_and_import(*args, **kwargs):
        raise ValueError("Instrument metadata is invalid.")

    monkeypatch.setattr(
        api,
        "download_and_import_market_data",
        fake_download_and_import,
    )

    response = client.post(
        "/stocks/import",
        params={
            "ticker": "AAPL",
            "name": "Apple Inc.",
            "exchange": "NYSE",
            "currency": "USD",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Instrument metadata is invalid."


def test_import_stock_unexpected_failure_returns_502(monkeypatch):
    def fake_download_and_import(*args, **kwargs):
        raise RuntimeError("Internal failure details")

    monkeypatch.setattr(
        api,
        "download_and_import_market_data",
        fake_download_and_import,
    )

    response = client.post(
        "/stocks/import",
        params={
            "ticker": "AAPL",
            "name": "Apple Inc.",
            "exchange": "NASDAQ",
            "currency": "USD",
        },
    )

    assert response.status_code == 502
    assert response.json()["detail"] == (
        "Unable to download or import market data."
    )


def test_create_portfolio_transaction_success(monkeypatch):
    def fake_record_transaction(**kwargs):
        assert kwargs["ticker"] == "AAPL"
        assert kwargs["transaction_type"] == "BUY"
        assert kwargs["transaction_date"] == date(2026, 10, 20)
        return {
            "id": 1,
            "ticker": "AAPL",
            "transaction_type": "BUY",
            "quantity": 10.0,
            "price_per_share": 150.0,
            "transaction_date": date(2026, 10, 20),
            "fees": 2.0,
        }

    monkeypatch.setattr(api, "record_transaction", fake_record_transaction)

    response = client.post(
        "/portfolio/transactions",
        json={
            "ticker": "AAPL",
            "transaction_type": "BUY",
            "quantity": 10,
            "price_per_share": 150,
            "transaction_date": "2026-10-20",
            "fees": 2,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "success"
    assert body["transaction"]["ticker"] == "AAPL"
    assert body["transaction"]["transaction_date"] == "2026-10-20"
    assert body["transaction"]["fees"] == 2.0


def test_create_portfolio_transaction_rejects_invalid_transaction(
    monkeypatch,
):
    def fake_record_transaction(**kwargs):
        raise ValueError("Transaction type must be BUY or SELL.")

    monkeypatch.setattr(api, "record_transaction", fake_record_transaction)

    response = client.post(
        "/portfolio/transactions",
        json={
            "ticker": "AAPL",
            "transaction_type": "HOLD",
            "quantity": 10,
            "price_per_share": 150,
            "transaction_date": "2026-10-20",
            "fees": 0,
        },
    )

    assert response.status_code == 400
    assert "BUY or SELL" in response.json()["detail"]


def test_create_portfolio_transaction_rejects_invalid_quantity():
    response = client.post(
        "/portfolio/transactions",
        json={
            "ticker": "AAPL",
            "transaction_type": "BUY",
            "quantity": 0,
            "price_per_share": 150,
            "transaction_date": "2026-10-20",
            "fees": 0,
        },
    )

    assert response.status_code == 422


def test_portfolio_holdings_returns_holdings(monkeypatch):
    monkeypatch.setattr(
        api,
        "get_holdings",
        lambda: [
            {
                "ticker": "AAPL",
                "quantity": 10.0,
                "average_cost": 150.0,
                "cost_basis": 1500.0,
                "realized_pnl": 25.0,
            }
        ],
    )

    response = client.get("/portfolio/holdings")

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["holdings"][0]["ticker"] == "AAPL"
    assert body["holdings"][0]["quantity"] == 10.0
    assert body["holdings"][0]["cost_basis"] == 1500.0


def test_portfolio_holdings_returns_empty_list(monkeypatch):
    monkeypatch.setattr(api, "get_holdings", lambda: [])

    response = client.get("/portfolio/holdings")

    assert response.status_code == 200
    assert response.json() == {"count": 0, "holdings": []}


def test_portfolio_holdings_handles_ledger_error(monkeypatch):
    def fake_get_holdings():
        raise ValueError("Ledger data is inconsistent.")

    monkeypatch.setattr(api, "get_holdings", fake_get_holdings)

    response = client.get("/portfolio/holdings")

    assert response.status_code == 400
    assert response.json()["detail"] == "Ledger data is inconsistent."


def test_portfolio_valuation_endpoint_returns_summary(monkeypatch):
    expected = {
        "positions": [
            {
                "ticker": "AAPL",
                "quantity": 10,
                "cost_basis": 1000,
                "latest_price": 120,
                "market_value": 1200,
                "unrealized_pnl": 200,
                "unrealized_pnl_pct": 20,
                "realized_pnl": 50,
            }
        ],
        "count": 1,
        "total_market_value": 1200,
        "total_cost_basis": 1000,
        "total_realized_pnl": 50,
        "total_unrealized_pnl": 200,
        "total_pnl": 250,
        "unpriced_tickers": [],
    }

    monkeypatch.setattr(
        api,
        "get_portfolio_valuation",
        lambda: expected,
    )

    response = client.get("/portfolio/valuation")

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["positions"][0]["ticker"] == "AAPL"
    assert body["total_market_value"] == 1200
    assert body["total_pnl"] == 250


def test_portfolio_valuation_endpoint_handles_empty_portfolio(monkeypatch):
    monkeypatch.setattr(
        api,
        "get_portfolio_valuation",
        lambda: {
            "positions": [],
            "count": 0,
            "total_market_value": 0,
            "total_cost_basis": 0,
            "total_realized_pnl": 0,
            "total_unrealized_pnl": 0,
            "total_pnl": 0,
            "unpriced_tickers": [],
        },
    )

    response = client.get("/portfolio/valuation")

    assert response.status_code == 200
    assert response.json()["count"] == 0
    assert response.json()["positions"] == []


def test_portfolio_valuation_endpoint_handles_service_error(monkeypatch):
    def fake_valuation():
        raise ValueError("Ledger data is inconsistent.")

    monkeypatch.setattr(
        api,
        "get_portfolio_valuation",
        fake_valuation,
    )

    response = client.get("/portfolio/valuation")

    assert response.status_code == 400
    assert response.json()["detail"] == "Ledger data is inconsistent."
