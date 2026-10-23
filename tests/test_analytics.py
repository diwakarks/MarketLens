
import numpy as np
import pandas as pd
import pytest

from src.marketlens.analytics import (
    calculate_beta_alpha,
    calculate_historical_portfolio_stress,
    calculate_metrics,
    calculate_portfolio_analytics,
    calculate_portfolio_scenario,
    calculate_sharpe_ratio,
    calculate_benchmark_comparison,
    calculate_value_at_risk,
    calculate_expected_shortfall,
    calculate_drawdown_recovery,
    generate_market_insights,
    calculate_portfolio_benchmark_comparison,
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

def test_historical_var_calculation():
    prices = pd.DataFrame({
        "Close": [100, 90, 100, 90, 100, 90, 100, 90, 100, 90, 100]
    })

    var = calculate_value_at_risk(prices, confidence_level=0.90)

    assert var == pytest.approx(0.10)


def test_var_rejects_invalid_confidence_level():
    prices = pd.DataFrame({"Close": [100, 101, 102]})

    with pytest.raises(ValueError, match="Confidence level"):
        calculate_value_at_risk(prices, confidence_level=1.0)


def test_var_requires_at_least_two_prices():
    prices = pd.DataFrame({"Close": [100]})

    with pytest.raises(ValueError, match="At least two"):
        calculate_value_at_risk(prices)


def test_var_rejects_non_positive_prices():
    prices = pd.DataFrame({"Close": [100, 0, 105]})

    with pytest.raises(ValueError, match="positive"):
        calculate_value_at_risk(prices)


def test_var_rejects_duplicate_dates():
    dates = pd.to_datetime(["2026-01-01", "2026-01-01", "2026-01-02"])
    prices = pd.DataFrame(
        {"Close": [100, 101, 102]},
        index=dates,
    )

    with pytest.raises(ValueError, match="duplicate dates"):
        calculate_value_at_risk(prices)


def test_expected_shortfall_calculation():
    prices = pd.DataFrame({
        "Close": [100, 90, 100, 90, 100, 90, 100, 90, 100, 90, 100]
    })

    es = calculate_expected_shortfall(prices, confidence_level=0.90)

    assert es == pytest.approx(0.10)


def test_expected_shortfall_rejects_invalid_confidence_level():
    prices = pd.DataFrame({"Close": [100, 101, 102]})

    with pytest.raises(ValueError, match="Confidence level"):
        calculate_expected_shortfall(prices, confidence_level=1.0)


def test_expected_shortfall_requires_two_prices():
    prices = pd.DataFrame({"Close": [100]})

    with pytest.raises(ValueError, match="At least two"):
        calculate_expected_shortfall(prices)


def test_expected_shortfall_rejects_non_positive_prices():
    prices = pd.DataFrame({"Close": [100, 0, 105]})

    with pytest.raises(ValueError, match="positive"):
        calculate_expected_shortfall(prices)


def test_drawdown_recovery_identifies_peak_trough_and_recovery():
    data = make_market_data([100, 120, 90, 105, 120])

    result = calculate_drawdown_recovery(data)

    assert result["maximum_drawdown"] == pytest.approx(-0.25)
    assert result["peak_date"] == "2026-01-02"
    assert result["peak_close"] == pytest.approx(120)
    assert result["trough_date"] == "2026-01-03"
    assert result["trough_close"] == pytest.approx(90)
    assert result["recovered"] is True
    assert result["recovery_date"] == "2026-01-05"
    assert result["recovery_days"] == 3
    assert result["recovery_trading_sessions"] == 3
    assert result["status"] == "recovered"


def test_drawdown_recovery_reports_unrecovered_event():
    data = make_market_data([100, 120, 90, 100, 110])

    result = calculate_drawdown_recovery(data)

    assert result["maximum_drawdown"] == pytest.approx(-0.25)
    assert result["recovered"] is False
    assert result["recovery_date"] is None
    assert result["recovery_days"] is None
    assert result["recovery_trading_sessions"] is None
    assert result["status"] == "not_recovered"


def test_drawdown_recovery_handles_no_drawdown():
    data = make_market_data([100, 105, 110, 115])

    result = calculate_drawdown_recovery(data)

    assert result["maximum_drawdown"] == pytest.approx(0)
    assert result["status"] == "no_drawdown"
    assert result["peak_date"] is None
    assert result["recovered"] is None


def test_drawdown_recovery_rejects_insufficient_prices():
    data = make_market_data([100])

    with pytest.raises(ValueError, match="At least two"):
        calculate_drawdown_recovery(data)


def test_drawdown_recovery_rejects_duplicate_dates():
    data = make_market_data([100, 120, 90])
    data.index = pd.to_datetime(
        ["2026-01-01", "2026-01-02", "2026-01-02"]
    )

    with pytest.raises(ValueError, match="duplicate dates"):
        calculate_drawdown_recovery(data)


def test_generate_market_insights_compares_performance_and_drawdown():
    stock = make_market_data([100, 120, 90, 105, 120])
    benchmark = make_market_data([100, 110, 100, 105, 110])

    result = generate_market_insights(stock, benchmark, "AAPL")

    assert result["ticker"] == "AAPL"
    assert result["shared_trading_dates"] == 5
    assert result["insights"][0]["category"] == "performance"
    assert result["insights"][0]["evidence"]["stock_return"] == pytest.approx(0.20)
    assert result["insights"][0]["evidence"]["benchmark_return"] == pytest.approx(0.10)

    drawdown = next(
        item for item in result["insights"]
        if item["category"] == "drawdown"
    )
    assert drawdown["evidence"]["stock_maximum_drawdown"] == pytest.approx(-0.25)
    assert drawdown["evidence"]["benchmark_maximum_drawdown"] == pytest.approx(-1 / 11)


def test_generate_market_insights_requires_shared_dates():
    stock = make_market_data([100, 110])
    benchmark = make_market_data([100, 105])
    benchmark.index = pd.to_datetime(["2026-02-01", "2026-02-02"])

    with pytest.raises(ValueError, match="shared trading dates"):
        generate_market_insights(stock, benchmark, "AAPL")


def test_generate_market_insights_rejects_empty_ticker():
    data = make_market_data([100, 110])

    with pytest.raises(ValueError, match="Ticker symbol"):
        generate_market_insights(data, data, " ")


def test_portfolio_analytics_calculates_equal_weight_returns():
    aapl = make_market_data([100, 110, 99, 108.9])
    msft = make_market_data([100, 100, 110, 110])

    result = calculate_portfolio_analytics(
        {"AAPL": aapl, "MSFT": msft},
        {"AAPL": 0.5, "MSFT": 0.5},
    )

    assert result["weights"] == {"AAPL": 0.5, "MSFT": 0.5}
    assert result["shared_trading_dates"] == 4
    assert result["total_return"] == pytest.approx(
        (1.05 * 1.0 * 1.05) - 1.0
    )
    assert result["final_value"] == pytest.approx(
        10_000 * (1.05 * 1.0 * 1.05)
    )
    assert result["rebalancing"] == "daily"
    assert len(result["series"]) == 3


def test_portfolio_analytics_rejects_weights_not_summing_to_one():
    data = make_market_data([100, 110, 120])

    with pytest.raises(ValueError, match="sum to 1.0"):
        calculate_portfolio_analytics(
            {"AAPL": data, "MSFT": data},
            {"AAPL": 0.7, "MSFT": 0.2},
        )


def test_portfolio_analytics_rejects_negative_weights():
    data = make_market_data([100, 110, 120])

    with pytest.raises(ValueError, match="non-negative"):
        calculate_portfolio_analytics(
            {"AAPL": data, "MSFT": data},
            {"AAPL": 1.2, "MSFT": -0.2},
        )


def test_portfolio_analytics_requires_shared_dates():
    aapl = make_market_data([100, 110, 120])
    msft = make_market_data([100, 105, 110])
    msft.index = pd.to_datetime(
        ["2026-02-01", "2026-02-02", "2026-02-03"]
    )

    with pytest.raises(ValueError, match="shared trading dates"):
        calculate_portfolio_analytics(
            {"AAPL": aapl, "MSFT": msft},
            {"AAPL": 0.5, "MSFT": 0.5},
        )


def test_portfolio_risk_decomposition():
    dates = pd.bdate_range("2026-01-01", periods=6)

    market_data = {
        "AAA": pd.DataFrame(
            {"Close": [100, 102, 101, 105, 104, 108]},
            index=dates,
        ),
        "BBB": pd.DataFrame(
            {"Close": [100, 99, 101, 100, 103, 102]},
            index=dates,
        ),
    }

    result = calculate_portfolio_analytics(
        market_data=market_data,
        weights={"AAA": 0.6, "BBB": 0.4},
    )

    concentration = result["concentration"]

    assert np.isclose(
        concentration["herfindahl_hirschman_index"],
        0.6**2 + 0.4**2,
    )
    assert np.isclose(
        concentration["effective_number_of_holdings"],
        1 / (0.6**2 + 0.4**2),
    )

    assert set(result["correlation_matrix"]) == {"AAA", "BBB"}
    assert result["correlation_matrix"]["AAA"]["AAA"] == 1.0

    contributions = result["asset_risk_contributions"]

    assert set(contributions) == {"AAA", "BBB"}
    assert np.isclose(
        sum(
            item["risk_contribution_percent"]
            for item in contributions.values()
        ),
        100.0,
    )


def test_portfolio_scenario_calculates_weighted_loss():
    result = calculate_portfolio_scenario(
        weights={"AAPL": 0.6, "MSFT": 0.4},
        shocks={"AAPL": -0.20, "MSFT": -0.05},
        initial_value=10_000,
    )

    assert result["portfolio_shock_return"] == pytest.approx(-0.14)
    assert result["estimated_pnl"] == pytest.approx(-1400.0)
    assert result["final_value"] == pytest.approx(8600.0)
    assert result["asset_impacts"]["AAPL"]["pnl_impact"] == pytest.approx(-1200.0)
    assert result["asset_impacts"]["MSFT"]["pnl_impact"] == pytest.approx(-200.0)

def test_portfolio_scenario_supports_gains_and_losses():
    result = calculate_portfolio_scenario(
        weights={"AAA": 0.5, "BBB": 0.5},
        shocks={"AAA": 0.10, "BBB": -0.10},
        initial_value=1000,
    )

    assert result["portfolio_shock_return"] == 0.0
    assert result["estimated_pnl"] == 0.0
    assert result["final_value"] == 1000.0

def test_portfolio_scenario_rejects_invalid_weights():
    with pytest.raises(ValueError, match="sum to 1.0"):
        calculate_portfolio_scenario(
            weights={"AAPL": 0.6, "MSFT": 0.3},
            shocks={"AAPL": -0.10, "MSFT": -0.05},
        )

def test_portfolio_scenario_rejects_shocks_below_minus_100_percent():
    with pytest.raises(ValueError, match="at least -100%"):
        calculate_portfolio_scenario(
            weights={"AAPL": 1.0},
            shocks={"AAPL": -1.01},
        )

def test_historical_portfolio_scenario_calculates_buy_and_hold_return():
    import pandas as pd
    import pytest

    from src.marketlens.analytics import (
        calculate_historical_portfolio_scenario,
    )

    dates = pd.to_datetime(["2026-01-05", "2026-01-06", "2026-01-07"])

    market_data = {
        "AAA": pd.DataFrame(
            {"Close": [100.0, 105.0, 110.0]},
            index=dates,
        ),
        "BBB": pd.DataFrame(
            {"Close": [100.0, 98.0, 90.0]},
            index=dates,
        ),
    }

    result = calculate_historical_portfolio_scenario(
        market_data=market_data,
        weights={"AAA": 0.6, "BBB": 0.4},
        start_date="2026-01-05",
        end_date="2026-01-07",
        initial_value=10_000,
    )

    # AAA returns +10%; BBB returns -10%.
    # Weighted portfolio return = 0.6 * 0.10 + 0.4 * (-0.10) = 2%.
    assert result["historical_return"] == pytest.approx(0.02)
    assert result["estimated_pnl"] == pytest.approx(200.0)
    assert result["final_value"] == pytest.approx(10_200.0)
    assert result["rebalancing"] == "none"
    assert result["shared_trading_dates"] == 3
    assert result["asset_impacts"]["AAA"]["pnl_impact"] == pytest.approx(600.0)
    assert result["asset_impacts"]["BBB"]["pnl_impact"] == pytest.approx(-400.0)

def test_portfolio_benchmark_comparison():
    dates = pd.to_datetime(["2025-01-02", "2025-01-03", "2025-01-06"])

    asset_a = pd.DataFrame(
        {"Close": [100.0, 105.0, 110.0]},
        index=dates,
    )
    asset_b = pd.DataFrame(
        {"Close": [100.0, 100.0, 90.0]},
        index=dates,
    )
    benchmark = pd.DataFrame(
        {"Close": [100.0, 102.0, 106.0]},
        index=dates,
    )

    result = calculate_portfolio_benchmark_comparison(
        market_data={"AAA": asset_a, "BBB": asset_b},
        weights={"AAA": 0.6, "BBB": 0.4},
        benchmark_data=benchmark,
        initial_value=10_000.0,
    )

    # AAA return = +10%; BBB return = -10%.
    # Portfolio return = 0.6(10%) + 0.4(-10%) = 2%.
    assert result["portfolio"]["return"] == pytest.approx(0.02)
    assert result["portfolio"]["final_value"] == pytest.approx(10_200.0)

    # Benchmark return = 6%.
    assert result["benchmark"]["return"] == pytest.approx(0.06)
    assert result["benchmark"]["final_value"] == pytest.approx(10_600.0)

    assert result["excess_return"] == pytest.approx(-0.04)
    assert result["ending_value_difference"] == pytest.approx(-400.0)
    assert result["shared_trading_dates"] == 3
    assert result["benchmark"]["ticker"] == "^GSPC"
    assert result["benchmark"]["name"] == "S&P 500"

def test_historical_portfolio_stress_reports_loss_and_drawdown():
    dates = pd.to_datetime([
        "2025-01-02",
        "2025-01-03",
        "2025-01-06",
        "2025-01-07",
    ])
    asset_a = pd.DataFrame(
        {"Close": [100.0, 90.0, 80.0, 95.0]},
        index=dates,
    )
    asset_b = pd.DataFrame(
        {"Close": [100.0, 95.0, 90.0, 100.0]},
        index=dates,
    )

    result = calculate_historical_portfolio_stress(
        market_data={"AAA": asset_a, "BBB": asset_b},
        weights={"AAA": 0.6, "BBB": 0.4},
        start_date="2025-01-02",
        end_date="2025-01-07",
        initial_value=10_000.0,
    )

    # Final asset returns: AAA -5%, BBB 0%.
    # Weighted portfolio return: 0.6(-5%) + 0.4(0%) = -3%.
    assert result["historical_return"] == pytest.approx(-0.03)
    assert result["final_value"] == pytest.approx(9_700.0)
    assert result["estimated_pnl"] == pytest.approx(-300.0)

    # Portfolio values are 10,000; 9,200; 8,000; 9,400.
    assert result["maximum_drawdown"] == pytest.approx(-0.16)
    assert result["maximum_drawdown_date"] == "2025-01-06"
    assert result["recovery_date"] is None
    assert result["recovered_within_period"] is False

def test_historical_portfolio_stress_handles_timezone_aware_prices():
    dates = pd.date_range(
        "2025-01-02",
        periods=4,
        freq="B",
        tz="UTC",
    )

    prices = pd.DataFrame(
        {"Close": [100.0, 90.0, 80.0, 95.0]},
        index=dates,
    )

    result = calculate_historical_portfolio_stress(
        market_data={"AAA": prices},
        weights={"AAA": 1.0},
        start_date="2025-01-02",
        end_date="2025-01-07",
        initial_value=10_000.0,
    )

    assert result["shared_trading_dates"] == 4
    assert result["final_value"] == pytest.approx(9_500.0)
    assert result["historical_return"] == pytest.approx(-0.05)
    assert result["maximum_drawdown"] == pytest.approx(-0.20)
    assert result["maximum_drawdown_date"] == "2025-01-06"
