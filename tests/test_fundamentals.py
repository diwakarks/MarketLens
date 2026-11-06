from datetime import datetime, timezone

import pandas as pd
import pytest

from src.marketlens.fundamentals import (
    FundamentalsDataUnavailableError,
    FundamentalsProviderError,
    fetch_annual_fundamentals,
    normalize_financial_statements,
)


@pytest.fixture
def annual_statements():
    periods = pd.to_datetime(["2025-03-31", "2024-03-31"])
    income = pd.DataFrame(
        [[1000, 800], [150, 120], [90, 70], [12, 9]],
        index=["Total Revenue", "Operating Income", "Net Income", "Basic EPS"],
        columns=periods,
    )
    balance = pd.DataFrame(
        [[900, 800], [450, 400], [200, 180]],
        index=["Total Assets", "Stockholders Equity", "Total Debt"],
        columns=periods,
    )
    cash_flow = pd.DataFrame(
        [[110, 95], [-30, -25]],
        index=["Operating Cash Flow", "Capital Expenditure"],
        columns=periods,
    )
    return income, balance, cash_flow


def test_normalizes_statements_and_metadata(annual_statements):
    income, balance, cash_flow = annual_statements
    result = normalize_financial_statements(
        "reliance.ns",
        income,
        balance,
        cash_flow,
        info={"longName": "Reliance Industries", "sector": "Energy", "currency": "INR"},
        fetched_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )

    assert result["ticker"] == "RELIANCE.NS"
    assert result["company"]["name"] == "Reliance Industries"
    assert result["periods"] == ["2025-03-31", "2024-03-31"]
    assert result["statements"]["income_statement"]["revenue"]["2025-03-31"] == 1000.0
    assert result["statements"]["balance_sheet"]["total_debt"]["2024-03-31"] == 180.0
    assert result["statements"]["cash_flow"]["operating_cash_flow"]["2025-03-31"] == 110.0


def test_missing_rows_remain_missing_not_zero(annual_statements):
    income, balance, cash_flow = annual_statements
    result = normalize_financial_statements("ABC.NS", income, balance, cash_flow)

    assert result["statements"]["income_statement"]["ebitda"] == {}
    assert result["statements"]["balance_sheet"]["inventory"] == {}


def test_non_numeric_values_become_none():
    period = pd.to_datetime(["2025-03-31"])
    income = pd.DataFrame([["not reported"]], index=["Total Revenue"], columns=period)
    result = normalize_financial_statements("ABC.NS", income, None, None)

    assert result["statements"]["income_statement"]["revenue"]["2025-03-31"] is None


def test_empty_ticker_rejected():
    with pytest.raises(ValueError, match="Ticker symbol cannot be empty"):
        fetch_annual_fundamentals(" ")


def test_provider_failure_is_wrapped():
    def broken_factory(_ticker):
        raise OSError("provider unavailable")

    with pytest.raises(FundamentalsProviderError, match="provider unavailable"):
        fetch_annual_fundamentals("ABC.NS", ticker_factory=broken_factory)


def test_no_statement_periods_raise_unavailable():
    class EmptyInstrument:
        def get_info(self):
            return {"quoteType": "EQUITY"}

        income_stmt = pd.DataFrame()
        balance_sheet = pd.DataFrame()
        cashflow = pd.DataFrame()

    with pytest.raises(FundamentalsDataUnavailableError):
        fetch_annual_fundamentals("ABC.NS", ticker_factory=lambda _: EmptyInstrument())


def _normalized_for_calculation():
    periods = ["2025-03-31", "2024-03-31"]
    return {
        "ticker": "ABC.NS",
        "periods": periods,
        "statements": {
            "income_statement": {
                "revenue": {periods[0]: 1200.0, periods[1]: 1000.0},
                "operating_income": {periods[0]: 180.0, periods[1]: 150.0},
                "net_income": {periods[0]: 120.0, periods[1]: 100.0},
                "basic_eps": {periods[0]: 12.0, periods[1]: 10.0},
                "interest_expense": {periods[0]: -20.0, periods[1]: -15.0},
            },
            "balance_sheet": {
                "total_assets": {periods[0]: 1000.0, periods[1]: 800.0},
                "stockholders_equity": {periods[0]: 500.0, periods[1]: 400.0},
                "total_debt": {periods[0]: 200.0, periods[1]: 160.0},
                "current_assets": {periods[0]: 300.0, periods[1]: 240.0},
                "current_liabilities": {periods[0]: 150.0, periods[1]: 120.0},
            },
            "cash_flow": {
                "operating_cash_flow": {periods[0]: 140.0, periods[1]: 110.0},
                "capital_expenditure": {periods[0]: -40.0, periods[1]: -30.0},
                "free_cash_flow": {},
            },
        },
    }


def test_calculates_profitability_growth_leverage_and_cash_flow():
    from src.marketlens.fundamentals import calculate_fundamental_metrics

    result = calculate_fundamental_metrics(_normalized_for_calculation())
    current = result["metrics"]["2025-03-31"]

    assert current["roe"] == pytest.approx(120 / 450)
    assert current["roa"] == pytest.approx(120 / 900)
    assert current["roce"] == pytest.approx(180 / 765)
    assert current["revenue_growth_yoy"] == pytest.approx(0.20)
    assert current["net_income_growth_yoy"] == pytest.approx(0.20)
    assert current["debt_to_equity"] == pytest.approx(0.40)
    assert current["interest_coverage"] == pytest.approx(9.0)
    assert current["free_cash_flow"] == pytest.approx(100.0)
    assert current["cfo_to_net_income"] == pytest.approx(140 / 120)


def test_first_period_average_balance_sheet_ratios_are_unavailable():
    from src.marketlens.fundamentals import calculate_fundamental_metrics

    result = calculate_fundamental_metrics(_normalized_for_calculation())
    oldest = result["metrics"]["2024-03-31"]

    assert oldest["roe"] is None
    assert oldest["roa"] is None
    assert oldest["roce"] is None
    assert oldest["revenue_growth_yoy"] is None


def test_zero_denominators_and_negative_growth_base_are_unavailable():
    from src.marketlens.fundamentals import calculate_fundamental_metrics

    data = _normalized_for_calculation()
    data["statements"]["balance_sheet"]["stockholders_equity"]["2025-03-31"] = -400.0
    data["statements"]["income_statement"]["revenue"]["2024-03-31"] = -100.0

    result = calculate_fundamental_metrics(data)
    current = result["metrics"]["2025-03-31"]

    assert current["roe"] is None
    assert current["revenue_growth_yoy"] is None


def test_reported_free_cash_flow_takes_precedence():
    from src.marketlens.fundamentals import calculate_fundamental_metrics

    data = _normalized_for_calculation()
    data["statements"]["cash_flow"]["free_cash_flow"] = {"2025-03-31": 123.0}

    result = calculate_fundamental_metrics(data)
    assert result["metrics"]["2025-03-31"]["free_cash_flow"] == 123.0


def test_metric_coverage_counts_only_available_values():
    from src.marketlens.fundamentals import calculate_fundamental_metrics

    result = calculate_fundamental_metrics(_normalized_for_calculation())
    assert result["coverage"]["available_periods"] == 2
    assert result["coverage"]["available_values_by_metric"]["roe"] == 1

def test_null_only_period_is_excluded_from_periods():
    period = pd.to_datetime(["2025-03-31", "2024-03-31"])

    income = pd.DataFrame(
        [[1000.0, None]],
        index=["Total Revenue"],
        columns=period,
    )

    result = normalize_financial_statements(
        "ABC.NS",
        income,
        None,
        None,
    )

    assert result["periods"] == ["2025-03-31"]


def test_coverage_excludes_fields_with_only_null_values():
    period = pd.to_datetime(["2025-03-31"])

    income = pd.DataFrame(
        [[1000.0], [None]],
        index=["Total Revenue", "EBITDA"],
        columns=period,
    )

    result = normalize_financial_statements(
        "ABC.NS",
        income,
        None,
        None,
    )

    assert result["coverage"]["income_statement"] == 1

def test_financial_sector_metrics_are_marked_unsupported():
    from src.marketlens.fundamentals import calculate_fundamental_metrics

    data = _normalized_for_calculation()
    data["company"] = {
        "sector": "Financial Services",
        "industry": "Banks - Regional",
    }

    result = calculate_fundamental_metrics(data)

    assert result["status"] == "unsupported_sector"
    assert result["metrics"]["2025-03-31"]["debt_to_equity"] is None
    assert result["metrics"]["2025-03-31"]["current_ratio"] is None
    assert result["coverage"]["available_values_by_metric"]["roe"] == 0

def test_energy_sector_remains_supported():
    from src.marketlens.fundamentals import calculate_fundamental_metrics

    data = _normalized_for_calculation()
    data["company"] = {"sector": "Energy", "industry": "Oil & Gas"}

    result = calculate_fundamental_metrics(data)

    assert result["status"] == "supported"