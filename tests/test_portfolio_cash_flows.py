
from datetime import date
from decimal import Decimal

import pytest

from src.marketlens.portfolio_ledger import (
    _validate_cash_flow,
    record_cash_flow,
    get_cash_flow_history,
    delete_cash_flow,
)


def test_validate_deposit():
    result = _validate_cash_flow(
        "DEPOSIT",
        "10000.50",
        "2026-01-01",
        "Initial capital",
    )

    assert result == (
        "DEPOSIT",
        Decimal("10000.50"),
        date(2026, 1, 1),
        "Initial capital",
    )


def test_validate_withdrawal():
    result = _validate_cash_flow(
        "WITHDRAWAL",
        5000,
        date(2026, 1, 2),
    )

    assert result[0] == "WITHDRAWAL"
    assert result[1] == Decimal("5000")


def test_cash_flow_rejects_invalid_type():
    with pytest.raises(ValueError, match="DEPOSIT or WITHDRAWAL"):
        _validate_cash_flow(
            "BUY",
            1000,
            "2026-01-01",
        )


def test_cash_flow_rejects_zero_amount():
    with pytest.raises(ValueError, match="greater than zero"):
        _validate_cash_flow(
            "DEPOSIT",
            0,
            "2026-01-01",
        )


def test_cash_flow_rejects_negative_amount():
    with pytest.raises(ValueError, match="greater than zero"):
        _validate_cash_flow(
            "WITHDRAWAL",
            -100,
            "2026-01-01",
        )


def test_cash_flow_rejects_invalid_date():
    with pytest.raises(ValueError, match="YYYY-MM-DD"):
        _validate_cash_flow(
            "DEPOSIT",
            1000,
            "01-01-2026",
        )


def test_cash_flow_rejects_long_description():
    with pytest.raises(ValueError, match="500 characters"):
        _validate_cash_flow(
            "DEPOSIT",
            1000,
            "2026-01-01",
            "x" * 501,
    )
