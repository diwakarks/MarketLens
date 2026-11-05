
from datetime import date
from decimal import Decimal

import pytest

from src.marketlens import portfolio_ledger as ledger



class FakeCursor:
    def __init__(
        self,
        instrument_id=7,
        available_quantity=10,
        history=None,
    ):
        self.instrument_id = instrument_id
        self.available_quantity = available_quantity
        self.history = history
        self.last_query = ""
        self.inserted_values = None
        self.result = None
        self.rows = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def execute(self, query, params=None):
        self.last_query = query
        self.rows = []
        self.result = None

        if "FROM instruments" in query:
            self.result = (
                (self.instrument_id,)
                if self.instrument_id is not None
                else None
            )

        elif (
            "FROM portfolio_transactions" in query
            and "ORDER BY transaction_date, id" in query
        ):
            if self.history is not None:
                self.rows = list(self.history)
            elif self.available_quantity > 0:
                # Compatibility with existing tests: represent the
                # configured available quantity as an earlier BUY.
                self.rows = [
                    (
                        "BUY",
                        Decimal(str(self.available_quantity)),
                        date(2026, 10, 1),
                    )
                ]

        elif "INSERT INTO portfolio_transactions" in query:
            self.inserted_values = params
            self.result = (123,)

    def fetchone(self):
        return self.result

    def fetchall(self):
        return self.rows


class FakeConnection:
    def __init__(self, cursor):
        self.fake_cursor = cursor

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def cursor(self):
        return self.fake_cursor


def install_fake_connection(monkeypatch, cursor):
    monkeypatch.setattr(
        ledger,
        "get_connection",
        lambda: FakeConnection(cursor),
    )


def test_record_buy_persists_normalized_transaction(monkeypatch):
    cursor = FakeCursor()
    install_fake_connection(monkeypatch, cursor)

    result = ledger.record_transaction(
        "aapl",
        "buy",
        "2.5",
        "100.25",
        "2026-10-15",
        "1.50",
    )

    assert result["id"] == 123
    assert result["ticker"] == "AAPL"
    assert result["transaction_type"] == "BUY"
    assert result["quantity"] == Decimal("2.5")
    assert result["price_per_share"] == Decimal("100.25")

    assert cursor.inserted_values == (
        7,
        "BUY",
        Decimal("2.5"),
        Decimal("100.25"),
        date(2026, 10, 15),
        Decimal("1.50"),
    )


def test_unknown_ticker_is_rejected_without_insert(monkeypatch):
    cursor = FakeCursor(instrument_id=None)
    install_fake_connection(monkeypatch, cursor)

    with pytest.raises(ValueError, match="Unknown ticker"):
        ledger.record_transaction(
            "NOTREAL",
            "BUY",
            1,
            10,
            "2026-10-15",
        )

    assert cursor.inserted_values is None


def test_sale_exceeding_available_shares_is_rejected(monkeypatch):
    cursor = FakeCursor(available_quantity=2)
    install_fake_connection(monkeypatch, cursor)

    with pytest.raises(ValueError, match="only 2 shares were held"):
        ledger.record_transaction(
            "AAPL",
            "SELL",
            3,
            110,
            "2026-10-15",
        )

    assert cursor.inserted_values is None


def test_sale_within_available_shares_is_inserted(monkeypatch):
    cursor = FakeCursor(available_quantity=10)
    install_fake_connection(monkeypatch, cursor)

    result = ledger.record_transaction(
        "AAPL",
        "SELL",
        4,
        110,
        "2026-10-15",
    )

    assert result["transaction_type"] == "SELL"
    assert cursor.inserted_values[1] == "SELL"
    assert cursor.inserted_values[2] == Decimal("4")


def test_backdated_sale_cannot_use_later_purchase(monkeypatch):
    cursor = FakeCursor(
        history=[
            ("BUY", Decimal("10"), date(2026, 10, 20)),
        ]
    )
    install_fake_connection(monkeypatch, cursor)

    with pytest.raises(
        ValueError,
        match="only 0 shares were held",
    ):
        ledger.record_transaction(
            "AAPL",
            "SELL",
            5,
            110,
            "2026-10-15",
        )

    assert cursor.inserted_values is None
