
from pathlib import Path
import time

import numpy as np
import pandas as pd
import yfinance as yf

import sys

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.marketlens.database import get_connection

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "raw"

REQUIRED_COLUMNS = ["Open", "High", "Low", "Close", "Volume"]
PRICE_COLUMNS = ["Open", "High", "Low", "Close"]
MAX_ATTEMPTS = 3


def _start_provider_log(ticker: str) -> int | None:
    """Record a provider download attempt without hiding logging failures."""
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO provider_refresh_log
                        (ticker, provider, status)
                    VALUES (%s, %s, 'running')
                    RETURNING id
                    """,
                    (ticker, "yfinance"),
                )
                refresh_id = cursor.fetchone()[0]

        return refresh_id

    except Exception as error:
        print(f"Warning: could not start provider log: {error}")
        return None


def _finish_provider_log(
    refresh_id: int | None,
    status: str,
    rows_downloaded: int = 0,
    latest_trade_date=None,
    error_message: str | None = None,
) -> None:
    """Record the final outcome of a provider download attempt."""
    if refresh_id is None:
        return

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE provider_refresh_log
                    SET completed_at = NOW(),
                        status = %s,
                        rows_downloaded = %s,
                        latest_trade_date = %s,
                        error_message = %s
                    WHERE id = %s
                    """,
                    (
                        status,
                        rows_downloaded,
                        latest_trade_date,
                        error_message[:2000] if error_message else None,
                        refresh_id,
                    ),
                )

                if cursor.rowcount != 1:
                    raise RuntimeError(
                        f"Expected to update one provider log row; "
                        f"updated {cursor.rowcount}."
                    )

    except Exception as error:
        # A logging error must not disguise the actual download outcome.
        print(f"Warning: could not finish provider log: {error}")



def _validate_history(history: pd.DataFrame, ticker: str) -> pd.DataFrame:
    """Validate downloaded daily prices before saving them."""
    if history is None or history.empty:
        raise ValueError(
            f"No historical data returned for {ticker}. "
            "Check the symbol and data availability."
        )

    missing = [
        column for column in REQUIRED_COLUMNS
        if column not in history.columns
    ]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    history = history[REQUIRED_COLUMNS].copy()
    history.index = pd.to_datetime(history.index, errors="raise")
    history.index.name = "Date"

    if history.index.hasnans:
        raise ValueError("Invalid dates found in market data.")

    # Daily bars should have unique dates.
    if history.index.has_duplicates:
        raise ValueError("Duplicate dates found in market data.")

    # Validate all required numeric fields.
    for column in REQUIRED_COLUMNS:
        history[column] = pd.to_numeric(history[column], errors="raise")

    numeric_values = history[REQUIRED_COLUMNS].to_numpy(dtype=float)
    if not np.isfinite(numeric_values).all():
        raise ValueError("Non-finite or missing values found in market data.")

    if (history[PRICE_COLUMNS] <= 0).any().any():
        raise ValueError("Prices must be positive.")

    if (history["Volume"] < 0).any():
        raise ValueError("Volume cannot be negative.")

    if (history["Volume"] % 1 != 0).any():
        raise ValueError("Volume must contain whole numbers.")

    if (history["High"] < history["Low"]).any():
        raise ValueError("High cannot be lower than Low.")

    invalid_ohlc = (
        (history["High"] < history["Open"])
        | (history["High"] < history["Close"])
        | (history["Low"] > history["Open"])
        | (history["Low"] > history["Close"])
    )
    if invalid_ohlc.any():
        raise ValueError("Invalid OHLC price relationships.")

    history = history.sort_index()

    # Reject duplicate calendar dates even if timestamps differ.
    if history.index.normalize().has_duplicates:
        raise ValueError("Multiple daily bars found for the same date.")

    return history


def fetch_market_data(
    ticker: str = "AAPL",
    period: str = "1y",
    *,
    output_path: Path | None = None,
) -> pd.DataFrame:
    """Fetch, validate, and safely save daily historical market prices."""
    ticker = ticker.strip().upper()

    if not ticker:
        raise ValueError("Ticker symbol cannot be empty.")

    refresh_id = _start_provider_log(ticker)

    try:
        history = None
        last_error = None

        # Retry transient download failures a bounded number of times.
        for attempt in range(MAX_ATTEMPTS):
            try:
                history = yf.Ticker(ticker).history(
                    period=period,
                    interval="1d",
                    auto_adjust=True,
                )

                if history.empty:
                    raise ValueError(
                        f"No historical data returned for {ticker}."
                    )

                break

            except Exception as error:
                last_error = error

                if attempt < MAX_ATTEMPTS - 1:
                    time.sleep(attempt + 1)

        if history is None or history.empty:
            raise RuntimeError(
                f"Failed to fetch data for {ticker} "
                f"after {MAX_ATTEMPTS} attempts."
            ) from last_error

        # Validate before touching the existing CSV.
        history = _validate_history(history, ticker)

        DATA_DIR.mkdir(parents=True, exist_ok=True)

        if output_path is None:
            output_path = DATA_DIR / f"{ticker}_daily.csv"
        else:
            output_path = Path(output_path)

        output_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = output_path.with_suffix(".csv.tmp")

        try:
            history.to_csv(temporary_path, index=True)
            # Replace the existing file only after validation and writing.
            temporary_path.replace(output_path)
        finally:
            if temporary_path.exists():
                temporary_path.unlink()

        latest_trade_date = history.index.max().date()

        _finish_provider_log(
            refresh_id=refresh_id,
            status="success",
            rows_downloaded=len(history),
            latest_trade_date=latest_trade_date,
        )

        print(f"Ticker: {ticker}")
        print(f"Rows downloaded: {len(history)}")
        print(
            f"Date range: {history.index.min()} "
            f"to {history.index.max()}"
        )
        print(f"Saved to: {output_path}")
        print(history.tail())

        return history

    except Exception as error:
        _finish_provider_log(
            refresh_id=refresh_id,
            status="failed",
            error_message=f"{type(error).__name__}: {error}",
        )
        raise


if __name__ == "__main__":
    fetch_market_data()
