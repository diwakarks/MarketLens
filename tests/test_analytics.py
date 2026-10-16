
import numpy as np
import pandas as pd
import pytest

from src.marketlens.analytics import (
    calculate_beta_alpha, 
    calculate_metrics, 
    calculate_sharpe_ratio,
    calculate_benchmark_comparison,
)


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


def test_cumulative_returns_track_investment_growth():
    data = make_market_data([100.0, 110.0, 121.0, 110.0])

    analysis, _ = calculate_metrics(data)

    assert np.isnan(analysis["Cumulative_Return"].iloc[0])
    assert analysis["Cumulative_Return"].iloc[1] == pytest.approx(0.10)
    assert analysis["Cumulative_Return"].iloc[2] == pytest.approx(0.21)
    assert analysis["Cumulative_Return"].iloc[3] == pytest.approx(0.10)


def test_drawdown_returns_to_zero_at_a_new_peak():
    data = make_market_data([100.0, 120.0, 90.0, 125.0])

    analysis, summary = calculate_metrics(data)

    assert analysis["Drawdown"].iloc[0] == pytest.approx(0.0)
    assert analysis["Drawdown"].iloc[2] == pytest.approx(-0.25)
    assert analysis["Drawdown"].iloc[3] == pytest.approx(0.0)
    assert summary["maximum_drawdown"] == pytest.approx(-0.25)


def test_analysis_preserves_input_observations_and_order():
    data = make_market_data([100.0, 95.0, 105.0])

    analysis, summary = calculate_metrics(data)

    assert len(analysis) == len(data)
    assert analysis.index.equals(data.index)
    assert analysis["Close"].tolist() == [100.0, 95.0, 105.0]
    assert summary["observations"] == 3


def test_sharpe_ratio_returns_finite_number():
    data = pd.DataFrame(
        {"Close": [100, 102, 101, 104, 103, 106]}
    )

    result = calculate_sharpe_ratio(data)

    assert isinstance(result, float)
    assert result == pytest.approx(result)
    assert result != 0


def test_sharpe_ratio_rejects_missing_close_column():
    data = pd.DataFrame({"Open": [100, 101, 102]})

    with pytest.raises(ValueError, match="Close"):
        calculate_sharpe_ratio(data)


def test_sharpe_ratio_rejects_insufficient_prices():
    data = pd.DataFrame({"Close": [100, 102]})

    with pytest.raises(ValueError, match="three closing prices"):
        calculate_sharpe_ratio(data)


def test_sharpe_ratio_rejects_zero_volatility():
    data = pd.DataFrame({"Close": [100, 100, 100, 100]})

    with pytest.raises(ValueError, match="zero or invalid volatility"):
        calculate_sharpe_ratio(data)


def test_beta_alpha_for_identical_stock_and_benchmark():
    prices = pd.DataFrame(
        {"Close": [100, 102, 101, 105, 103, 108]},
        index=pd.date_range("2026-01-01", periods=6),
    )

    result = calculate_beta_alpha(prices, prices)

    assert result["beta"] == pytest.approx(1.0)
    assert result["alpha_annual"] == pytest.approx(0.0, abs=1e-10)


def test_beta_alpha_rejects_zero_market_variance():
    dates = pd.date_range("2026-01-01", periods=5)
    stock = pd.DataFrame(
        {"Close": [100, 101, 103, 102, 105]},
        index=dates,
    )
    benchmark = pd.DataFrame(
        {"Close": [100, 100, 100, 100, 100]},
        index=dates,
    )

    with pytest.raises(ValueError, match="market variance"):
        calculate_beta_alpha(stock, benchmark)


def test_beta_alpha_rejects_insufficient_shared_dates():
    stock = pd.DataFrame(
        {"Close": [100, 102]},
        index=pd.date_range("2026-01-01", periods=2),
    )
    benchmark = pd.DataFrame(
        {"Close": [100, 101]},
        index=pd.date_range("2026-02-01", periods=2),
    )

    with pytest.raises(ValueError, match="shared closing-price dates"):
        calculate_beta_alpha(stock, benchmark)
