
from datetime import date
from decimal import Decimal

import pytest

from src.marketlens.portfolio_ledger import (
    _calculate_holdings,
    _validate_transaction,
)

from src.marketlens import portfolio_ledger as ledger

def test_buy_and_partial_sell_include_fees_in_average_cost():
    rows = [
        ("AAPL", "BUY", 10, 100, date(2026, 1, 1), 10),
        ("AAPL", "BUY", 10, 120, date(2026, 1, 2), 20),
        ("AAPL", "SELL", 5, 130, date(2026, 1, 3), 5),
    ]

    holdings = _calculate_holdings(rows)

    assert len(holdings) == 1
    holding = holdings[0]

    assert holding["ticker"] == "AAPL"
    assert holding["quantity"] == Decimal("15")
    assert holding["cost_basis"] == Decimal("1672.5")
    assert holding["average_cost"] == Decimal("111.5")
    assert holding["realized_pnl"] == Decimal("87.5")


def test_fully_sold_position_is_not_returned():
    rows = [
        ("MSFT", "BUY", 4, 50, date(2026, 1, 1), 0),
        ("MSFT", "SELL", 4, 60, date(2026, 1, 2), 0),
    ]

    assert _calculate_holdings(rows) == []


def test_multiple_tickers_are_calculated_independently():
    rows = [
        ("AAPL", "BUY", 2, 100, date(2026, 1, 1), 0),
        ("MSFT", "BUY", 3, 50, date(2026, 1, 1), 0),
    ]

    holdings = {
        item["ticker"]: item
        for item in _calculate_holdings(rows)
    }

    assert holdings["AAPL"]["quantity"] == Decimal("2")
    assert holdings["AAPL"]["cost_basis"] == Decimal("200")
    assert holdings["MSFT"]["quantity"] == Decimal("3")
    assert holdings["MSFT"]["cost_basis"] == Decimal("150")


def test_sale_exceeding_holdings_is_rejected():
    rows = [
        ("AAPL", "BUY", 2, 100, date(2026, 1, 1), 0),
        ("AAPL", "SELL", 3, 110, date(2026, 1, 2), 0),
    ]

    with pytest.raises(ValueError, match="exceeding holdings"):
        _calculate_holdings(rows)


@pytest.mark.parametrize(
    ("transaction_type", "quantity", "price", "fees"),
    [
        ("INVALID", 1, 10, 0),
        ("BUY", 0, 10, 0),
        ("BUY", -1, 10, 0),
        ("BUY", 1, 0, 0),
        ("BUY", 1, -10, 0),
        ("BUY", 1, 10, -1),
        ("BUY", float("nan"), 10, 0),
        ("BUY", 1, float("inf"), 0),
    ],
)
def test_invalid_transaction_inputs_are_rejected(
    transaction_type, quantity, price, fees
):
    with pytest.raises(ValueError):
        _validate_transaction(
            transaction_type,
            quantity,
            price,
            fees,
            date(2026, 1, 1),
        )


def test_transaction_inputs_are_normalized():
    result = _validate_transaction(
        " buy ",
        "2.5",
        "100.25",
        "1.50",
        "2026-01-15",
    )

    assert result == (
        "BUY",
        Decimal("2.5"),
        Decimal("100.25"),
        Decimal("1.50"),
        date(2026, 1, 15),
    )


def test_invalid_date_is_rejected():
    with pytest.raises(ValueError, match="YYYY-MM-DD"):
        _validate_transaction("BUY", 1, 10, 0, "15-01-2026")


def test_portfolio_valuation_calculates_market_value_and_pnl():
    holdings = [
        {
            "ticker": "AAPL",
            "quantity": Decimal("10"),
            "average_cost": Decimal("100"),
            "cost_basis": Decimal("1000"),
            "realized_pnl": Decimal("50"),
        },
        {
            "ticker": "MSFT",
            "quantity": Decimal("2"),
            "average_cost": Decimal("200"),
            "cost_basis": Decimal("400"),
            "realized_pnl": Decimal("-10"),
        },
    ]

    result = ledger.calculate_portfolio_valuation(
        holdings,
        {"AAPL": Decimal("120"), "MSFT": Decimal("180")},
    )

    assert result["total_market_value"] == Decimal("1560")
    assert result["total_cost_basis"] == Decimal("1400")
    assert result["total_realized_pnl"] == Decimal("40")
    assert result["total_unrealized_pnl"] == Decimal("160")
    assert result["total_pnl"] == Decimal("200")

    assert result["positions"][0]["unrealized_pnl"] == Decimal("200")
    assert result["positions"][1]["unrealized_pnl"] == Decimal("-40")


def test_portfolio_valuation_marks_missing_prices():
    holdings = [
        {
            "ticker": "AAPL",
            "quantity": Decimal("10"),
            "average_cost": Decimal("100"),
            "cost_basis": Decimal("1000"),
            "realized_pnl": Decimal("50"),
        },
        {
            "ticker": "MSFT",
            "quantity": Decimal("2"),
            "average_cost": Decimal("200"),
            "cost_basis": Decimal("400"),
            "realized_pnl": Decimal("-10"),
        },
    ]

    result = ledger.calculate_portfolio_valuation(
        holdings,
        {"AAPL": Decimal("120")},
    )

    assert result["unpriced_tickers"] == ["MSFT"]
    assert result["positions"][1]["market_value"] is None
    assert result["total_market_value"] == Decimal("1200")
    assert result["total_unrealized_pnl"] is None
    assert result["total_pnl"] is None
