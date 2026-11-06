
from datetime import date
from decimal import Decimal, InvalidOperation

from src.marketlens.database import get_connection


def _to_decimal(value, field_name: str) -> Decimal:
    """Convert a numeric input to a finite Decimal."""
    if isinstance(value, bool):
        raise ValueError(f"{field_name} must be numeric.")

    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f"{field_name} must be numeric.") from None

    if not result.is_finite():
        raise ValueError(f"{field_name} must be finite.")

    return result


def _validate_transaction(
    transaction_type: str,
    quantity,
    price_per_share,
    fees,
    transaction_date,
) -> tuple[str, Decimal, Decimal, Decimal, date]:
    """Validate and normalize a transaction before database access."""
    if not isinstance(transaction_type, str):
        raise ValueError("Transaction type must be BUY or SELL.")

    transaction_type = transaction_type.strip().upper()
    if transaction_type not in {"BUY", "SELL"}:
        raise ValueError("Transaction type must be BUY or SELL.")

    quantity = _to_decimal(quantity, "Quantity")
    price_per_share = _to_decimal(price_per_share, "Price per share")
    fees = _to_decimal(fees, "Fees")

    if quantity <= 0:
        raise ValueError("Quantity must be greater than zero.")
    if price_per_share <= 0:
        raise ValueError("Price per share must be greater than zero.")
    if fees < 0:
        raise ValueError("Fees cannot be negative.")

    if isinstance(transaction_date, str):
        try:
            transaction_date = date.fromisoformat(transaction_date)
        except ValueError:
            raise ValueError(
                "Transaction date must use YYYY-MM-DD format."
            ) from None

    if not isinstance(transaction_date, date):
        raise ValueError("A valid transaction date is required.")

    return (
        transaction_type,
        quantity,
        price_per_share,
        fees,
        transaction_date,
    )


def record_transaction(
    ticker: str,
    transaction_type: str,
    quantity,
    price_per_share,
    transaction_date,
    fees=0,
) -> dict:
    """Persist a BUY or SELL transaction for a registered instrument."""
    if not isinstance(ticker, str) or not ticker.strip():
        raise ValueError("Ticker cannot be empty.")

    ticker = ticker.strip().upper()

    (
        transaction_type,
        quantity,
        price_per_share,
        fees,
        transaction_date,
    ) = _validate_transaction(
        transaction_type,
        quantity,
        price_per_share,
        fees,
        transaction_date,
    )

    with get_connection() as connection:
        with connection.cursor() as cursor:
            # Serialize ledger writes for this instrument so concurrent
            # sales cannot both pass the available-shares check.
            cursor.execute(
                """
                SELECT id
                FROM instruments
                WHERE ticker = %s
                FOR UPDATE
                """,
                (ticker,),
            )
            instrument = cursor.fetchone()

            if instrument is None:
                raise ValueError(
                    f"Unknown ticker '{ticker}'. Import its market data first."
                )

            instrument_id = instrument[0]
            
            # Load the existing history so availability is checked
            # chronologically, not against lifetime net purchases.
            cursor.execute(
                """
                SELECT transaction_type, quantity, transaction_date
                FROM portfolio_transactions
                WHERE instrument_id = %s
                ORDER BY transaction_date, id
                """,
                (instrument_id,),
            )
            history = cursor.fetchall()

            running_quantity = Decimal("0")
            proposed_transaction_applied = False

            def apply_proposed_transaction():
                nonlocal running_quantity

                if transaction_type == "BUY":
                    running_quantity += quantity
                else:
                    if quantity > running_quantity:
                        raise ValueError(
                            f"Cannot sell {quantity} shares of {ticker} "
                            f"on {transaction_date}; only "
                            f"{running_quantity} shares were held "
                            "at that point in time."
                        )
                    running_quantity -= quantity

            for existing_type, existing_quantity, existing_date in history:
                # A new transaction has a later ID than existing
                # transactions on the same date.
                if (
                    not proposed_transaction_applied
                    and existing_date > transaction_date
                ):
                    apply_proposed_transaction()
                    proposed_transaction_applied = True

                existing_quantity = Decimal(str(existing_quantity))

                if existing_type == "BUY":
                    running_quantity += existing_quantity
                elif existing_type == "SELL":
                    if existing_quantity > running_quantity:
                        raise ValueError(
                            f"Ledger inconsistency: {ticker} has a "
                            "historical sale exceeding holdings."
                        )
                    running_quantity -= existing_quantity
                else:
                    raise ValueError(
                        f"Ledger inconsistency: invalid transaction "
                        f"type {existing_type!r}."
                    )

            if not proposed_transaction_applied:
                apply_proposed_transaction()

            cursor.execute(
                """
                INSERT INTO portfolio_transactions (
                    instrument_id,
                    transaction_type,
                    quantity,
                    price_per_share,
                    transaction_date,
                    fees
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    instrument_id,
                    transaction_type,
                    quantity,
                    price_per_share,
                    transaction_date,
                    fees,
                ),
            )
            transaction_id = cursor.fetchone()[0]

    return {
        "id": transaction_id,
        "ticker": ticker,
        "transaction_type": transaction_type,
        "quantity": quantity,
        "price_per_share": price_per_share,
        "transaction_date": transaction_date,
        "fees": fees,
    }

def _validate_transaction_history(rows) -> None:
    """Reject a transaction history that ever produces negative holdings."""
    running_quantity = Decimal("0")

    for transaction_type, quantity, transaction_date in rows:
        quantity = Decimal(str(quantity))

        if transaction_type == "BUY":
            running_quantity += quantity
        elif transaction_type == "SELL":
            if quantity > running_quantity:
                raise ValueError(
                    f"Cannot sell {quantity} shares on {transaction_date}; "
                    f"only {running_quantity} shares were held at that point."
                )
            running_quantity -= quantity
        else:
            raise ValueError(
                f"Invalid transaction type {transaction_type!r}."
            )

def update_transaction(
    transaction_id: int,
    transaction_type: str,
    quantity,
    price_per_share,
    transaction_date,
    fees=0,
) -> dict:
    """Edit a transaction and validate the complete chronological ledger."""
    (
        transaction_type,
        quantity,
        price_per_share,
        fees,
        transaction_date,
    ) = _validate_transaction(
        transaction_type,
        quantity,
        price_per_share,
        fees,
        transaction_date,
    )

    with get_connection() as connection:
        with connection.cursor() as cursor:
            # Find the instrument associated with this transaction.
            cursor.execute(
                """
                SELECT instrument_id
                FROM portfolio_transactions
                WHERE id = %s
                """,
                (transaction_id,),
            )
            initial_row = cursor.fetchone()

            if initial_row is None:
                raise LookupError(
                    f"Transaction {transaction_id} was not found."
                )

            instrument_id = initial_row[0]

            # Serialize ledger modifications for this instrument.
            cursor.execute(
                """
                SELECT id
                FROM instruments
                WHERE id = %s
                FOR UPDATE
                """,
                (instrument_id,),
            )
            if cursor.fetchone() is None:
                raise LookupError("The transaction's instrument was not found.")

            # Recheck after acquiring the instrument lock.
            cursor.execute(
                """
                SELECT id
                FROM portfolio_transactions
                WHERE id = %s AND instrument_id = %s
                FOR UPDATE
                """,
                (transaction_id, instrument_id),
            )
            if cursor.fetchone() is None:
                raise LookupError(
                    f"Transaction {transaction_id} was not found."
                )

            cursor.execute(
                """
                SELECT id, transaction_type, quantity, transaction_date
                FROM portfolio_transactions
                WHERE instrument_id = %s
                ORDER BY transaction_date, id
                """,
                (instrument_id,),
            )
            history = cursor.fetchall()

            updated_history = [
                (
                    row[0],
                    transaction_type if row[0] == transaction_id else row[1],
                    quantity if row[0] == transaction_id else row[2],
                    transaction_date if row[0] == transaction_id else row[3],
                )
                for row in history
            ]

            updated_history.sort(key=lambda row: (row[3], row[0]))

            _validate_transaction_history(
                [(row[1], row[2], row[3]) for row in updated_history]
            )

            cursor.execute(
                """
                UPDATE portfolio_transactions
                SET transaction_type = %s,
                    quantity = %s,
                    price_per_share = %s,
                    transaction_date = %s,
                    fees = %s
                WHERE id = %s AND instrument_id = %s
                """,
                (
                    transaction_type,
                    quantity,
                    price_per_share,
                    transaction_date,
                    fees,
                    transaction_id,
                    instrument_id,
                ),
            )

            cursor.execute(
                """
                SELECT ticker
                FROM instruments
                WHERE id = %s
                """,
                (instrument_id,),
            )
            ticker_row = cursor.fetchone()

    return {
        "id": transaction_id,
        "ticker": ticker_row[0],
        "transaction_type": transaction_type,
        "quantity": quantity,
        "price_per_share": price_per_share,
        "transaction_date": transaction_date,
        "fees": fees,
    }


def delete_transaction(transaction_id: int) -> dict:
    """Delete an erroneous transaction if the remaining ledger is valid."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT instrument_id
                FROM portfolio_transactions
                WHERE id = %s
                """,
                (transaction_id,),
            )
            initial_row = cursor.fetchone()

            if initial_row is None:
                raise LookupError(
                    f"Transaction {transaction_id} was not found."
                )

            instrument_id = initial_row[0]

            cursor.execute(
                """
                SELECT id
                FROM instruments
                WHERE id = %s
                FOR UPDATE
                """,
                (instrument_id,),
            )
            if cursor.fetchone() is None:
                raise LookupError("The transaction's instrument was not found.")

            cursor.execute(
                """
                SELECT id, transaction_type, quantity, transaction_date
                FROM portfolio_transactions
                WHERE instrument_id = %s
                ORDER BY transaction_date, id
                """,
                (instrument_id,),
            )
            history = cursor.fetchall()

            remaining_history = [
                (row[1], row[2], row[3])
                for row in history
                if row[0] != transaction_id
            ]

            _validate_transaction_history(remaining_history)

            cursor.execute(
                """
                DELETE FROM portfolio_transactions
                WHERE id = %s AND instrument_id = %s
                RETURNING id
                """,
                (transaction_id, instrument_id),
            )
            deleted_row = cursor.fetchone()

            if deleted_row is None:
                raise LookupError(
                    f"Transaction {transaction_id} was not found."
                )

    return {"id": transaction_id, "status": "deleted"}

def _calculate_holdings(rows) -> list[dict]:
    """Calculate holdings and realized P/L from ordered transaction rows."""
    states = {}

    for ticker, transaction_type, quantity, price, trade_date, fees in rows:
        quantity = Decimal(str(quantity))
        price = Decimal(str(price))
        fees = Decimal(str(fees))

        state = states.setdefault(
            ticker,
            {
                "quantity": Decimal("0"),
                "cost_basis": Decimal("0"),
                "realized_pnl": Decimal("0"),
            },
        )

        if transaction_type == "BUY":
            state["quantity"] += quantity
            state["cost_basis"] += quantity * price + fees

        elif transaction_type == "SELL":
            held = state["quantity"]

            if quantity > held:
                raise ValueError(
                    f"Ledger inconsistency: {ticker} has a sale "
                    "exceeding holdings."
                )

            if held <= 0:
                raise ValueError(
                    f"Ledger inconsistency: cannot sell {ticker} "
                    "without existing holdings."
                )

            average_cost = state["cost_basis"] / held
            allocated_cost = average_cost * quantity
            net_proceeds = quantity * price - fees

            state["realized_pnl"] += net_proceeds - allocated_cost
            state["quantity"] -= quantity
            state["cost_basis"] -= allocated_cost

            if state["quantity"] == 0:
                state["cost_basis"] = Decimal("0")

        else:
            raise ValueError(
                f"Ledger inconsistency: invalid transaction type "
                f"{transaction_type!r}."
            )

    holdings = []

    for ticker, state in states.items():
        quantity = state["quantity"]

        if quantity <= 0:
            continue

        cost_basis = state["cost_basis"]

        holdings.append(
            {
                "ticker": ticker,
                "quantity": quantity,
                "average_cost": cost_basis / quantity,
                "cost_basis": cost_basis,
                "realized_pnl": state["realized_pnl"],
            }
        )

    return holdings


def get_holdings() -> list[dict]:
    """Load transactions and calculate current holdings."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    i.ticker,
                    t.transaction_type,
                    t.quantity,
                    t.price_per_share,
                    t.transaction_date,
                    t.fees
                FROM portfolio_transactions AS t
                JOIN instruments AS i
                    ON i.id = t.instrument_id
                ORDER BY
                    i.ticker,
                    t.transaction_date,
                    t.id
                """
            )
            rows = cursor.fetchall()

    return _calculate_holdings(rows)


def calculate_portfolio_valuation(holdings, latest_prices) -> dict:
    """Calculate market value and profit/loss for current holdings.

    Args:
        holdings: Output from get_holdings().
        latest_prices: Mapping of ticker to its latest closing price.
    """
    positions = []
    total_market_value = Decimal("0")
    total_cost_basis = Decimal("0")
    total_realized_pnl = Decimal("0")
    unpriced_tickers = []

    for holding in holdings:
        ticker = holding["ticker"]
        quantity = Decimal(str(holding["quantity"]))
        cost_basis = Decimal(str(holding["cost_basis"]))
        realized_pnl = Decimal(str(holding["realized_pnl"]))

        total_cost_basis += cost_basis
        total_realized_pnl += realized_pnl

        raw_price = latest_prices.get(ticker)

        if raw_price is None:
            unpriced_tickers.append(ticker)
            positions.append(
                {
                    **holding,
                    "latest_price": None,
                    "market_value": None,
                    "unrealized_pnl": None,
                    "unrealized_pnl_pct": None,
                }
            )
            continue

        price = Decimal(str(raw_price))

        if not price.is_finite() or price < 0:
            raise ValueError(f"Invalid latest price for {ticker}.")

        market_value = quantity * price
        unrealized_pnl = market_value - cost_basis
        unrealized_pnl_pct = (
            unrealized_pnl / cost_basis * Decimal("100")
            if cost_basis > 0
            else None
        )

        total_market_value += market_value

        positions.append(
            {
                **holding,
                "latest_price": price,
                "market_value": market_value,
                "unrealized_pnl": unrealized_pnl,
                "unrealized_pnl_pct": unrealized_pnl_pct,
            }
        )

    total_unrealized_pnl = (
        sum(
            (
                position["unrealized_pnl"]
                for position in positions
                if position["unrealized_pnl"] is not None
            ),
            Decimal("0"),
        )
        if not unpriced_tickers
        else None
    )

    total_pnl = (
        total_realized_pnl + total_unrealized_pnl
        if total_unrealized_pnl is not None
        else None
    )

    return {
        "positions": positions,
        "count": len(positions),
        "total_market_value": total_market_value,
        "total_cost_basis": total_cost_basis,
        "total_realized_pnl": total_realized_pnl,
        "total_unrealized_pnl": total_unrealized_pnl,
        "total_pnl": total_pnl,
        "unpriced_tickers": unpriced_tickers,
    }


def get_latest_prices(tickers) -> dict:
    """Return the latest stored closing price for each requested ticker."""
    normalized_tickers = sorted(
        {
            ticker.strip().upper()
            for ticker in tickers
            if isinstance(ticker, str) and ticker.strip()
        }
    )

    if not normalized_tickers:
        return {}

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT DISTINCT ON (i.ticker)
                    i.ticker,
                    p.close_price
                FROM instruments AS i
                JOIN daily_prices AS p
                    ON p.instrument_id = i.id
                WHERE i.ticker = ANY(%s)
                ORDER BY i.ticker, p.trade_date DESC
                """,
                (normalized_tickers,),
            )
            rows = cursor.fetchall()

    return {
        ticker: Decimal(str(close_price))
        for ticker, close_price in rows
        if close_price is not None
    }


def get_portfolio_valuation() -> dict:
    """Calculate portfolio value using the latest stored closing prices."""
    holdings = get_holdings()

    latest_prices = get_latest_prices(
        holding["ticker"] for holding in holdings
    )

    return calculate_portfolio_valuation(holdings, latest_prices)

def get_transaction_history():
    """Return recorded portfolio transactions, newest first."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    pt.id,
                    i.ticker,
                    pt.transaction_type,
                    pt.quantity,
                    pt.price_per_share,
                    pt.transaction_date,
                    pt.fees
                FROM portfolio_transactions AS pt
                JOIN instruments AS i
                    ON i.id = pt.instrument_id
                ORDER BY pt.transaction_date DESC, pt.id DESC
                """
            )

            rows = cur.fetchall()

    return [
        {
            "id": row[0],
            "ticker": row[1],
            "transaction_type": row[2],
            "quantity": str(row[3]),
            "price_per_share": str(row[4]),
            "transaction_date": row[5].isoformat(),
            "fees": str(row[6]),
        }
        for row in rows
    ]


def _validate_cash_flow(flow_type, amount, flow_date, description=None):
    """Validate and normalize an external portfolio cash flow."""
    if not isinstance(flow_type, str):
        raise ValueError("Flow type must be DEPOSIT or WITHDRAWAL.")

    flow_type = flow_type.strip().upper()

    if flow_type not in {"DEPOSIT", "WITHDRAWAL"}:
        raise ValueError("Flow type must be DEPOSIT or WITHDRAWAL.")

    amount = _to_decimal(amount, "Amount")

    if amount <= 0:
        raise ValueError("Amount must be greater than zero.")

    if isinstance(flow_date, str):
        try:
            flow_date = date.fromisoformat(flow_date)
        except ValueError:
            raise ValueError(
                "Flow date must use YYYY-MM-DD format."
            ) from None

    if not isinstance(flow_date, date):
        raise ValueError("A valid flow date is required.")

    if description is not None:
        if not isinstance(description, str):
            raise ValueError("Description must be text.")

        description = description.strip() or None

        if description and len(description) > 500:
            raise ValueError("Description cannot exceed 500 characters.")

    return flow_type, amount, flow_date, description


def record_cash_flow(
    flow_type,
    amount,
    flow_date,
    description=None,
) -> dict:
    """Persist an external deposit or withdrawal."""
    (
        flow_type,
        amount,
        flow_date,
        description,
    ) = _validate_cash_flow(
        flow_type,
        amount,
        flow_date,
        description,
    )

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO portfolio_cash_flows (
                    flow_type,
                    amount,
                    flow_date,
                    description
                )
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                (flow_type, amount, flow_date, description),
            )

            flow_id = cursor.fetchone()[0]

    return {
        "id": flow_id,
        "flow_type": flow_type,
        "amount": amount,
        "flow_date": flow_date,
        "description": description,
    }


def get_cash_flow_history() -> list[dict]:
    """Retrieve all external portfolio cash flows chronologically."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, flow_type, amount, flow_date,
                       description, created_at
                FROM portfolio_cash_flows
                ORDER BY flow_date, id
                """
            )

            rows = cursor.fetchall()

    return [
        {
            "id": row[0],
            "flow_type": row[1],
            "amount": row[2],
            "flow_date": row[3],
            "description": row[4],
            "created_at": row[5],
        }
        for row in rows
    ]


def delete_cash_flow(flow_id: int) -> dict:
    """Delete an external cash-flow record."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM portfolio_cash_flows
                WHERE id = %s
                RETURNING id
                """,
                (flow_id,),
            )

            row = cursor.fetchone()

    if row is None:
        raise LookupError(f"Cash flow {flow_id} was not found.")

    return {
        "status": "success",
        "deleted_id": row[0],
    }
