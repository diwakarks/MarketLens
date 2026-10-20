
import pandas as pd
import pytest

from src.marketlens import database as database_module


def install_mock_provider(monkeypatch):
    calls = {}

    history = pd.DataFrame(
        {
            "Open": [99.0, 100.0],
            "High": [102.0, 103.0],
            "Low": [98.0, 99.0],
            "Close": [101.0, 102.0],
            "Volume": [1000, 1200],
        },
        index=pd.DatetimeIndex(
            ["2026-10-15", "2026-10-16"], name="Date"
        ),
    )

    class FakeTicker:
        def __init__(self, ticker):
            calls["ticker"] = ticker

        def history(self, **kwargs):
            calls["history_kwargs"] = kwargs
            return history.copy()

    monkeypatch.setattr(database_module.yf, "Ticker", FakeTicker)
    monkeypatch.setattr(
        database_module, "_start_provider_refresh_log", lambda ticker: 17
    )
    monkeypatch.setattr(
        database_module,
        "_finish_provider_refresh_log",
        lambda refresh_id, **kwargs: calls.setdefault(
            "log_updates", []
        ).append((refresh_id, kwargs)),
    )

    return calls


def test_download_import_success_promotes_adjusted_candidate(
    monkeypatch, tmp_path
):
    calls = install_mock_provider(monkeypatch)
    monkeypatch.setattr(database_module, "RAW_DATA_DIR", tmp_path)

    active_path = tmp_path / "AAPL.NS_daily.csv"
    active_path.write_text("old data\n", encoding="utf-8")

    def fake_import(
        ticker, *, name=None, exchange=None, currency=None, csv_path=None
    ):
        assert ticker == "AAPL.NS"
        assert name == "Example Ltd"
        assert exchange == "NSE"
        assert currency == "INR"
        assert csv_path is not None and csv_path.exists()

        imported = pd.read_csv(csv_path)
        assert len(imported) == 2
        assert "Close" in imported.columns
        return len(imported)

    monkeypatch.setattr(database_module, "import_market_data", fake_import)

    result = database_module.download_and_import_market_data(
        "aapl.ns",
        name="Example Ltd",
        exchange="NSE",
    )

    assert result == 2
    assert calls["ticker"] == "AAPL.NS"
    assert calls["history_kwargs"] == {
        "period": "max",
        "interval": "1d",
        "auto_adjust": True,
    }
    assert active_path.read_text(encoding="utf-8").startswith("Date,")
    assert not list(tmp_path.glob(".*_candidate.csv"))


def test_download_import_database_failure_preserves_active_csv(
    monkeypatch, tmp_path
):
    install_mock_provider(monkeypatch)
    monkeypatch.setattr(database_module, "RAW_DATA_DIR", tmp_path)

    active_path = tmp_path / "AAPL.NS_daily.csv"
    active_path.write_text("old data\n", encoding="utf-8")

    def fail_import(*args, **kwargs):
        raise RuntimeError("Database unavailable")

    monkeypatch.setattr(database_module, "import_market_data", fail_import)

    with pytest.raises(RuntimeError, match="Database unavailable"):
        database_module.download_and_import_market_data(
            "AAPL.NS",
            name="Example Ltd",
            exchange="NSE",
        )

    assert active_path.read_text(encoding="utf-8") == "old data\n"
    assert not list(tmp_path.glob(".*_candidate.csv"))


def test_download_import_promotion_failure_retains_candidate(
    monkeypatch, tmp_path
):
    install_mock_provider(monkeypatch)
    monkeypatch.setattr(database_module, "RAW_DATA_DIR", tmp_path)

    active_path = tmp_path / "AAPL.NS_daily.csv"
    active_path.write_text("old data\n", encoding="utf-8")

    def successful_import(*args, **kwargs):
        assert kwargs["csv_path"].exists()
        return 2

    monkeypatch.setattr(
        database_module, "import_market_data", successful_import
    )

    def fail_replace(self, target):
        raise OSError("Simulated promotion failure")

    monkeypatch.setattr(database_module.Path, "replace", fail_replace)

    with pytest.raises(RuntimeError, match="CSV promotion failed"):
        database_module.download_and_import_market_data(
            "AAPL.NS",
            name="Example Ltd",
            exchange="NSE",
        )

    assert active_path.read_text(encoding="utf-8") == "old data\n"

    candidates = list(tmp_path.glob(".*_candidate.csv"))
    assert len(candidates) == 1
    assert candidates[0].exists()
    assert len(pd.read_csv(candidates[0])) == 2


def test_download_provider_failure_is_logged_and_skips_import(
    monkeypatch, tmp_path
):
    calls = {"logs": [], "imports": 0}

    class FailingTicker:
        def __init__(self, ticker):
            pass

        def history(self, **kwargs):
            raise RuntimeError("Provider unavailable")

    monkeypatch.setattr(database_module.yf, "Ticker", FailingTicker)
    monkeypatch.setattr(database_module, "RAW_DATA_DIR", tmp_path)
    monkeypatch.setattr(
        database_module, "_start_provider_refresh_log", lambda ticker: 23
    )
    monkeypatch.setattr(
        database_module,
        "_finish_provider_refresh_log",
        lambda refresh_id, **kwargs: calls["logs"].append(
            (refresh_id, kwargs)
        ),
    )

    def unexpected_import(*args, **kwargs):
        calls["imports"] += 1
        raise AssertionError("Import must not run after provider failure")

    monkeypatch.setattr(
        database_module, "import_market_data", unexpected_import
    )

    with pytest.raises(RuntimeError, match="Provider unavailable"):
        database_module.download_and_import_market_data(
            "AAPL.NS",
            name="Example Ltd",
            exchange="NSE",
        )

    assert calls["imports"] == 0
    assert calls["logs"][0][0] == 23
    assert calls["logs"][0][1]["status"] == "failed"
    assert not list(tmp_path.glob(".*_candidate.csv"))


@pytest.mark.parametrize(
    ("ticker", "name", "exchange", "currency"),
    [
        ("AAPL", "AAPL", "NASDAQ", "USD"),
        ("MSFT", "MSFT", "NASDAQ", "USD"),
        ("^GSPC", "S&P 500 Index", "INDEX", "USD"),
        ("^NSEI", "NIFTY 50 Index", "NSE", "INR"),
    ],
)
def test_download_import_accepts_registered_us_instruments_and_benchmarks(
    monkeypatch, tmp_path, ticker, name, exchange, currency
):
    install_mock_provider(monkeypatch)
    monkeypatch.setattr(database_module, "RAW_DATA_DIR", tmp_path)

    def fake_import(
        imported_ticker, *, name=None, exchange=None,
        currency=None, csv_path=None
    ):
        assert imported_ticker == ticker
        assert csv_path is not None and csv_path.exists()
        return len(pd.read_csv(csv_path))

    monkeypatch.setattr(
        database_module, "import_market_data", fake_import
    )

    result = database_module.download_and_import_market_data(
        ticker,
        name=name,
        exchange=exchange,
        currency=currency,
    )

    assert result == 2


@pytest.mark.parametrize(
    ("ticker", "name", "exchange", "currency"),
    [
        ("AAPL", "AAPL", "NYSE", "USD"),
        ("MSFT", "MSFT", "NASDAQ", "INR"),
        ("^GSPC", "S&P 500 Index", "NASDAQ", "USD"),
        ("^NSEI", "NIFTY 50 Index", "NSE", "USD"),
        ("UNKNOWN", "Unknown", "NASDAQ", "USD"),
    ],
)
def test_download_import_rejects_unsupported_metadata(
    monkeypatch, ticker, name, exchange, currency
):
    calls = install_mock_provider(monkeypatch)

    with pytest.raises(ValueError):
        database_module.download_and_import_market_data(
            ticker,
            name=name,
            exchange=exchange,
            currency=currency,
        )

    assert "ticker" not in calls
