"""Provider retrieval and normalization for annual company fundamentals.

This module deliberately does not calculate ratios or assign investment scores.
It converts Yahoo Finance statement DataFrames into a stable internal contract.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

import pandas as pd


STATEMENT_FIELDS: dict[str, dict[str, tuple[str, ...]]] = {
    "income_statement": {
        "revenue": ("Total Revenue", "Operating Revenue", "Revenue"),
        "cost_of_revenue": ("Cost Of Revenue", "Cost of Revenue"),
        "gross_profit": ("Gross Profit",),
        "operating_income": ("Operating Income", "Operating Income Loss"),
        "interest_expense": ("Interest Expense", "Interest Expense Non Operating"),
        "pretax_income": ("Pretax Income", "Pre Tax Income"),
        "tax_provision": ("Tax Provision",),
        "net_income": ("Net Income", "Net Income Common Stockholders", "Net Income Continuous Operations"),
        "basic_eps": ("Basic EPS", "Basic EPS Continuing Operations"),
        "diluted_eps": ("Diluted EPS", "Diluted EPS Continuing Operations"),
        "ebitda": ("EBITDA",),
    },
    "balance_sheet": {
        "total_assets": ("Total Assets",),
        "current_assets": ("Current Assets", "Current Assets Total"),
        "current_liabilities": ("Current Liabilities", "Current Liabilities Total"),
        "total_liabilities": ("Total Liabilities Net Minority Interest", "Total Liabilities"),
        "stockholders_equity": ("Stockholders Equity", "Stockholders Equity Including Minority Interest", "Total Equity Gross Minority Interest"),
        "total_debt": ("Total Debt", "Long Term Debt And Capital Lease Obligation", "Long Term Debt"),
        "cash_and_equivalents": ("Cash Cash Equivalents And Short Term Investments", "Cash And Cash Equivalents", "Cash Financial"),
        "inventory": ("Inventory",),
    },
    "cash_flow": {
        "operating_cash_flow": ("Operating Cash Flow", "Cash Flow From Continuing Operating Activities", "Cash Flow From Continuing Operating Activities Continuing Operations"),
        "capital_expenditure": ("Capital Expenditure", "Capital Expenditures"),
        "free_cash_flow": ("Free Cash Flow",),
        "depreciation_amortization": ("Depreciation And Amortization", "Depreciation Amortization Depletion"),
        "stock_based_compensation": ("Stock Based Compensation",),
    },
}


def _clean_statement(statement: Any) -> pd.DataFrame:
    """Return a defensive copy with normalized datetime columns and numeric cells."""
    if not isinstance(statement, pd.DataFrame) or statement.empty:
        return pd.DataFrame()

    frame = statement.copy()
    frame.columns = pd.to_datetime(frame.columns, errors="coerce")
    frame = frame.loc[:, ~frame.columns.isna()]
    if frame.empty:
        return pd.DataFrame()
    frame = frame.reindex(sorted(frame.columns, reverse=True), axis=1)
    frame.index = [str(label).strip() for label in frame.index]
    return frame.apply(pd.to_numeric, errors="coerce")


def _extract_fields(
    statement: pd.DataFrame,
    field_aliases: dict[str, tuple[str, ...]],
) -> dict[str, dict[str, float | None]]:
    """Map provider row labels to canonical fields without inventing values."""
    if statement.empty:
        return {field: {} for field in field_aliases}

    rows = {str(label).casefold(): label for label in statement.index}
    output: dict[str, dict[str, float | None]] = {}
    for field, aliases in field_aliases.items():
        matched_row = next(
            (rows[alias.casefold()] for alias in aliases if alias.casefold() in rows),
            None,
        )
        values: dict[str, float | None] = {}
        if matched_row is not None:
            for period, value in statement.loc[matched_row].items():
                numeric = pd.to_numeric(value, errors="coerce")
                values[pd.Timestamp(period).date().isoformat()] = (
                    float(numeric) if pd.notna(numeric) else None
                )
        output[field] = values
    return output


def normalize_financial_statements(
    ticker: str,
    income_statement: Any,
    balance_sheet: Any,
    cash_flow: Any,
    info: dict[str, Any] | None = None,
    fetched_at: datetime | None = None,
) -> dict[str, Any]:
    """Normalize raw annual statements into MarketLens' provider-neutral shape."""
    raw_statements = {
        "income_statement": _clean_statement(income_statement),
        "balance_sheet": _clean_statement(balance_sheet),
        "cash_flow": _clean_statement(cash_flow),
    }
    normalized = {
        name: _extract_fields(frame, STATEMENT_FIELDS[name])
        for name, frame in raw_statements.items()
    }
    periods = sorted(
        {
            period
            for statement in normalized.values()
            for values in statement.values()
            for period, value in values.items()
            if value is not None
        },
        reverse=True,
    )
    metadata = info or {}
    return {
        "ticker": ticker.strip().upper(),
        "provider": "yfinance",
        "fetched_at": (fetched_at or datetime.now(timezone.utc)).isoformat(),
        "company": {
            "name": metadata.get("longName") or metadata.get("shortName"),
            "sector": metadata.get("sector"),
            "industry": metadata.get("industry"),
            "quote_type": metadata.get("quoteType"),
            "currency": metadata.get("currency"),
            "financial_currency": metadata.get("financialCurrency"),
        },
        "periods": periods,
        "statements": normalized,
        "coverage": {
            name: sum(
                any(value is not None for value in values.values())
                for values in fields.values()
            )
            for name, fields in normalized.items()
        },
    }


def fetch_annual_fundamentals(
    ticker: str,
    ticker_factory: Callable[[str], Any] | None = None,
) -> dict[str, Any]:
    """Fetch annual statements and normalize them; no database writes occur here."""
    symbol = ticker.strip().upper()
    if not symbol:
        raise ValueError("Ticker symbol cannot be empty.")

    if ticker_factory is None:
        try:
            import yfinance as yf
        except ImportError as exc:
            raise FundamentalsProviderError(
                "yfinance is required to retrieve company fundamentals."
            ) from exc
        factory = yf.Ticker
    else:
        factory = ticker_factory
    try:
        instrument = factory(symbol)
        info = instrument.get_info()
        income = instrument.income_stmt
        balance = instrument.balance_sheet
        cash_flow = instrument.cashflow
    except Exception as exc:
        raise FundamentalsProviderError(
            f"Unable to retrieve annual fundamentals for {symbol}: {exc}"
        ) from exc

    result = normalize_financial_statements(
        symbol,
        income,
        balance,
        cash_flow,
        info=info,
    )
    if not result["periods"]:
        raise FundamentalsDataUnavailableError(
            f"The provider returned no annual financial statements for {symbol}."
        )
    return result


class FundamentalsProviderError(RuntimeError):
    """Raised when the external fundamentals provider cannot be reached."""


class FundamentalsDataUnavailableError(ValueError):
    """Raised when the provider responds but supplies no usable statements."""


# Metric calculations are intentionally provider-independent. Values are keyed by
# fiscal period so the API can expose both the result and its reporting period.

def _period_value(
    statements: dict[str, dict[str, dict[str, float | None]]],
    statement_name: str,
    field: str,
    period: str,
) -> float | None:
    value = statements.get(statement_name, {}).get(field, {}).get(period)
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    return numeric if pd.notna(numeric) else None


def _safe_divide(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator is None or denominator == 0:
        return None
    return numerator / denominator


def _average(current: float | None, previous: float | None) -> float | None:
    if current is None or previous is None:
        return None
    return (current + previous) / 2.0


def _growth(current: float | None, previous: float | None) -> float | None:
    """Return YoY growth only when the comparison base is positive."""
    if current is None or previous is None or previous <= 0:
        return None
    return (current / previous) - 1.0


def calculate_fundamental_metrics(normalized: dict[str, Any]) -> dict[str, Any]:
    """Calculate annual profitability, growth, leverage and cash-flow metrics.

    Ratios are returned as decimals (for example, 0.15 means 15%). Missing
    inputs and invalid denominators return None. Balance-sheet averages require
    the immediately preceding available fiscal period.
    """
    statements = normalized.get("statements") or {}
    periods = sorted(set(normalized.get("periods") or []), reverse=True)
    company = normalized.get("company") or {}
    sector = str(company.get("sector") or "").casefold()
    industry = str(company.get("industry") or "").casefold()

    financial_sector = (
        "financial" in sector
        or any(
            keyword in industry
            for keyword in (
                "bank",
                "insurance",
                "credit",
                "financial",
                "mortgage",
                "nbfc",
            )
        )
    )

    metric_names = [
        "roe",
        "roa",
        "roce",
        "operating_margin",
        "net_margin",
        "revenue_growth_yoy",
        "operating_income_growth_yoy",
        "net_income_growth_yoy",
        "eps_growth_yoy",
        "debt_to_equity",
        "current_ratio",
        "interest_coverage",
        "operating_cash_flow",
        "free_cash_flow",
        "cfo_to_net_income",
        "fcf_margin",
    ]

    if financial_sector:
        return {
            "ticker": normalized.get("ticker"),
            "status": "unsupported_sector",
            "sector": company.get("sector"),
            "industry": company.get("industry"),
            "message": (
                "The current fundamental-analysis methodology is designed "
                "for non-financial operating companies. Financial-services "
                "businesses, including banks, NBFCs, insurers and investment "
                "platforms, require sector-specific metrics."
            ),
            "periods": periods,
            "metrics": {
                period: {name: None for name in metric_names}
                for period in periods
            },
            "coverage": {
                "available_periods": len(periods),
                "available_values_by_metric": {
                    name: 0 for name in metric_names
                },
            },
        }
    metrics: dict[str, dict[str, float | None]] = {}

    income_name = "income_statement"
    balance_name = "balance_sheet"
    cash_name = "cash_flow"

    for index, period in enumerate(periods):
        previous_period = periods[index + 1] if index + 1 < len(periods) else None

        revenue = _period_value(statements, income_name, "revenue", period)
        operating_income = _period_value(statements, income_name, "operating_income", period)
        net_income = _period_value(statements, income_name, "net_income", period)
        eps = _period_value(statements, income_name, "basic_eps", period)
        interest_expense = _period_value(statements, income_name, "interest_expense", period)

        assets = _period_value(statements, balance_name, "total_assets", period)
        equity = _period_value(statements, balance_name, "stockholders_equity", period)
        debt = _period_value(statements, balance_name, "total_debt", period)
        current_assets = _period_value(statements, balance_name, "current_assets", period)
        current_liabilities = _period_value(statements, balance_name, "current_liabilities", period)

        cfo = _period_value(statements, cash_name, "operating_cash_flow", period)
        capex = _period_value(statements, cash_name, "capital_expenditure", period)
        reported_fcf = _period_value(statements, cash_name, "free_cash_flow", period)

        previous_assets = _period_value(statements, balance_name, "total_assets", previous_period) if previous_period else None
        previous_equity = _period_value(statements, balance_name, "stockholders_equity", previous_period) if previous_period else None
        previous_current_liabilities = _period_value(statements, balance_name, "current_liabilities", previous_period) if previous_period else None

        average_assets = _average(assets, previous_assets)
        average_equity = _average(equity, previous_equity)
        capital_employed = (
            assets - current_liabilities
            if assets is not None and current_liabilities is not None
            else None
        )
        previous_capital_employed = (
            previous_assets - previous_current_liabilities
            if previous_assets is not None and previous_current_liabilities is not None
            else None
        )
        average_capital_employed = _average(capital_employed, previous_capital_employed)

        fcf = reported_fcf
        if fcf is None and cfo is not None and capex is not None:
            # Yahoo Finance commonly reports capex as a negative cash outflow.
            fcf = cfo + capex if capex <= 0 else cfo - capex

        previous_revenue = _period_value(statements, income_name, "revenue", previous_period) if previous_period else None
        previous_operating_income = _period_value(statements, income_name, "operating_income", previous_period) if previous_period else None
        previous_net_income = _period_value(statements, income_name, "net_income", previous_period) if previous_period else None
        previous_eps = _period_value(statements, income_name, "basic_eps", previous_period) if previous_period else None

        metrics[period] = {
            "roe": _safe_divide(net_income, average_equity),
            "roa": _safe_divide(net_income, average_assets),
            "roce": _safe_divide(operating_income, average_capital_employed),
            "operating_margin": _safe_divide(operating_income, revenue),
            "net_margin": _safe_divide(net_income, revenue),
            "revenue_growth_yoy": _growth(revenue, previous_revenue),
            "operating_income_growth_yoy": _growth(operating_income, previous_operating_income),
            "net_income_growth_yoy": _growth(net_income, previous_net_income),
            "eps_growth_yoy": _growth(eps, previous_eps),
            "debt_to_equity": _safe_divide(debt, equity),
            "current_ratio": _safe_divide(current_assets, current_liabilities),
            "interest_coverage": _safe_divide(operating_income, abs(interest_expense) if interest_expense is not None else None),
            "operating_cash_flow": cfo,
            "free_cash_flow": fcf,
            "cfo_to_net_income": _safe_divide(cfo, net_income),
            "fcf_margin": _safe_divide(fcf, revenue),
        }

    metric_names = list(next(iter(metrics.values())).keys()) if metrics else []
    coverage = {
        name: sum(values.get(name) is not None for values in metrics.values())
        for name in metric_names
    }
    return {
        "ticker": normalized.get("ticker"),
        "status": "supported",
        "periods": periods,
        "metrics": metrics,
        "coverage": {
            "available_periods": len(periods),
            "available_values_by_metric": coverage,
        },
        "methodology": {
            "roe": "Net income / average stockholders' equity; unavailable without current and prior-period equity.",
            "roa": "Net income / average total assets; unavailable without current and prior-period assets.",
            "roce": "Operating income / average (total assets - current liabilities).",
            "growth": "Year-over-year change; unavailable when the prior-period value is zero or negative.",
            "free_cash_flow": "Reported free cash flow when available; otherwise operating cash flow less capital expenditure.",
            "ratio_units": "Ratios and growth rates are decimals; multiply by 100 for percentages.",
        },
    }
