
import pandas as pd

from data import refresh_market_data as refresh_module


def test_refresh_success_runs_both_stages(monkeypatch, tmp_path):
    sample_history = pd.DataFrame(
        {"Close": [100.0, 101.0]},
        index=pd.to_datetime(["2026-10-15", "2026-10-16"]),
    )
    calls = []

    active_dir = tmp_path / "raw"
    active_dir.mkdir()
    active_path = active_dir / "AAPL_daily.csv"
    active_path.write_text("old data\n", encoding="utf-8")

    monkeypatch.setattr(refresh_module, "RAW_DATA_DIR", active_dir)

    def fake_fetch_market_data(ticker, period, *, output_path=None):
        calls.append(("provider", ticker, period, output_path))
        output_path.write_text("Date,Close\n2026-10-16,101\n", encoding="utf-8")
        return sample_history

    def fake_import_market_data(ticker, *, csv_path=None):
        calls.append(("database", ticker, csv_path))
        assert csv_path is not None
        assert csv_path.exists()
        assert csv_path.read_text(encoding="utf-8").startswith("Date,Close")
        assert active_path.read_text(encoding="utf-8") == "old data\n"
        return 2

    monkeypatch.setattr(
        refresh_module, "fetch_market_data", fake_fetch_market_data
    )
    monkeypatch.setattr(
        refresh_module, "import_market_data", fake_import_market_data
    )

    result = refresh_module.refresh_market_data("aapl", "1y")

    assert result is True
    assert [call[0] for call in calls] == ["provider", "database"]
    assert calls[0][1:3] == ("AAPL", "1y")
    assert calls[1][1] == "AAPL"
    assert calls[1][2] is not None
    assert active_path.read_text(encoding="utf-8").startswith("Date,Close")
    assert list(active_dir.glob("*.csv")) == [active_path]


def test_refresh_provider_failure_skips_database(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(refresh_module, "RAW_DATA_DIR", tmp_path)

    def fake_fetch_market_data(ticker, period, *, output_path=None):
        raise RuntimeError("Provider unavailable")

    def fake_import_market_data(ticker, *, csv_path=None):
        calls.append(ticker)
        return 0

    monkeypatch.setattr(
        refresh_module, "fetch_market_data", fake_fetch_market_data
    )
    monkeypatch.setattr(
        refresh_module, "import_market_data", fake_import_market_data
    )

    assert refresh_module.refresh_market_data("AAPL", "1y") is False
    assert calls == []


def test_refresh_database_failure_preserves_active_csv(monkeypatch, tmp_path):
    monkeypatch.setattr(refresh_module, "RAW_DATA_DIR", tmp_path)
    active_path = tmp_path / "AAPL_daily.csv"
    active_path.write_text("old data\n", encoding="utf-8")

    def fake_fetch_market_data(ticker, period, *, output_path=None):
        output_path.write_text("new candidate\n", encoding="utf-8")
        return pd.DataFrame({"Close": [101.0]})

    def fake_import_market_data(ticker, *, csv_path=None):
        raise RuntimeError("Database unavailable")

    monkeypatch.setattr(
        refresh_module, "fetch_market_data", fake_fetch_market_data
    )
    monkeypatch.setattr(
        refresh_module, "import_market_data", fake_import_market_data
    )

    assert refresh_module.refresh_market_data("AAPL", "1y") is False
    assert active_path.read_text(encoding="utf-8") == "old data\n"
    assert not list(tmp_path.glob("*_candidate.csv"))


def test_refresh_without_existing_csv_handles_database_failure(
    monkeypatch, tmp_path
):
    monkeypatch.setattr(refresh_module, "RAW_DATA_DIR", tmp_path)

    def fake_fetch_market_data(ticker, period, *, output_path=None):
        output_path.write_text("new candidate\n", encoding="utf-8")
        return pd.DataFrame({"Close": [101.0]})

    def fake_import_market_data(ticker, *, csv_path=None):
        raise RuntimeError("Database unavailable")

    monkeypatch.setattr(
        refresh_module, "fetch_market_data", fake_fetch_market_data
    )
    monkeypatch.setattr(
        refresh_module, "import_market_data", fake_import_market_data
    )

    assert refresh_module.refresh_market_data("AAPL", "1y") is False
    assert not (tmp_path / "AAPL_daily.csv").exists()
    assert not list(tmp_path.glob("*_candidate.csv"))
