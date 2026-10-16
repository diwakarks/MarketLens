
import numpy as np
import pandas as pd
import pytest

from src.marketlens.analytics import calculate_metrics


def make_market_data(prices):
    """Create a small dataset with known closing prices."""
    dates = pd.date_range(
        start="2026-01-01",
        periods=len(prices),
        freq="D",
    )

    return pd.DataFrame(
        {"Close": prices},
        index=dates,
    )


def test_daily_returns_are_calculated_correctly():
    data = make_market_data([100.0, 110.0, 99.0])

    analysis, _ = calculate_metrics(data)

    assert np.isnan(analysis["Daily_Return"].iloc[0])
    assert analysis["Daily_Return"].iloc[1] == pytest.approx(0.10)
    assert analysis["Daily_Return"].iloc[2] == pytest.approx(-0.10)


def test_total_and_cumulative_returns_are_correct():
    data = make_market_data([100.0, 110.0, 99.0])

    analysis, summary = calculate_metrics(data)

    # 100 -> 110 -> 99 means a total loss of 1%.
    assert summary["total_return"] == pytest.approx(-0.01)
    assert analysis["Cumulative_Return"].iloc[-1] == pytest.approx(-0.01)


def test_maximum_drawdown_is_correct():
    data = make_market_data([100.0, 120.0, 90.0, 105.0])

    analysis, summary = calculate_metrics(data)

    # The price falls from its peak of 120 to 90: a 25% drawdown.
    assert analysis["Drawdown"].min() == pytest.approx(-0.25)
    assert summary["maximum_drawdown"] == pytest.approx(-0.25)


def test_annualized_volatility_is_non_negative():
    data = make_market_data([100.0, 105.0, 102.0, 108.0])

    _, summary = calculate_metrics(data)

    assert np.isfinite(summary["annualized_volatility"])
    assert summary["annualized_volatility"] >= 0


def test_empty_data_is_rejected():
    data = pd.DataFrame(
        {"Close": pd.Series(dtype=float)}
    )

    with pytest.raises(ValueError, match="empty"):
        calculate_metrics(data)


def test_missing_closing_prices_are_rejected():
    data = make_market_data([100.0, float("nan"), 105.0])

    with pytest.raises(ValueError, match="positive and non-missing"):
        calculate_metrics(data)


def test_non_positive_closing_prices_are_rejected():
    data = make_market_data([100.0, 0.0, 105.0])

    with pytest.raises(ValueError, match="positive and non-missing"):
        calculate_metrics(data)
