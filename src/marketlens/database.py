import os
from pathlib import Path
import tempfile

import numpy as np
import pandas as pd
import psycopg
import yfinance as yf
from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW_DATA_DIR = PROJECT_ROOT / "data" / "raw"

load_dotenv(PROJECT_ROOT / ".env")


def get_connection() -> psycopg.Connection:
    """Open a connection to the MarketLens PostgreSQL database."""
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is missing. Check the project's .env file."
        )

    return psycopg.connect(database_url)


def _start_refresh_log(ticker: str) -> int:
    """Record a refresh attempt in its own transaction."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO data_refresh_log (ticker)
                VALUES (%s)
                RETURNING id
                """,
                (ticker,),
            )
            return cursor.fetchone()[0]


def _finish_refresh_log(
    refresh_id: int,
    status: str,
    rows_imported: int = 0,
    latest_trade_date=None,
    error_message: str | None = None,
) -> None:
    """Record the outcome of a refresh in a separate transaction."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE data_refresh_log
                SET status = %s,
                    completed_at = NOW(),
                    rows_imported = %s,
                    latest_trade_date = %s,
                    error_message = %s
                WHERE id = %s
                """,
                (
                    status,
                    rows_imported,
                    latest_trade_date,
                    error_message[:2000] if error_message else None,
                    refresh_id,
                ),
            )


def _start_provider_refresh_log(ticker: str) -> int:
    """Record a provider download attempt in its own transaction."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO provider_refresh_log (ticker)
                VALUES (%s)
                RETURNING id
                """,
                (ticker,),
            )
            return cursor.fetchone()[0]


def _finish_provider_refresh_log(
    refresh_id: int,
    status: str,
    rows_downloaded: int = 0,
    latest_trade_date=None,
    error_message: str | None = None,
) -> None:
    """Record the outcome of a provider download."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE provider_refresh_log
                SET status = %s,
                    completed_at = NOW(),
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


def import_market_data(
    ticker: str = "AAPL",
    *,
    name: str | None = None,
    exchange: str | None = None,
    currency: str | None = None,
    csv_path: Path | None = None,
) -> int:
    """Validate and import historical CSV prices transactionally."""
    ticker = ticker.strip().upper()

    if not ticker:
        raise ValueError("Ticker symbol cannot be empty.")

    # Start logging before file validation so failures are recorded too.
    refresh_id = _start_refresh_log(ticker)

    try:
        if csv_path is None:
            csv_path = RAW_DATA_DIR / f"{ticker}_daily.csv"
        else:
            csv_path = Path(csv_path)
        if not csv_path.exists():
            raise FileNotFoundError(f"CSV file not found: {csv_path}")

        data = pd.read_csv(csv_path)

        required_columns = [
            "Date", "Open", "High", "Low", "Close", "Volume"
        ]

        missing = [
            column for column in required_columns
            if column not in data.columns
        ]

        if missing:
            raise ValueError(f"Missing CSV columns: {missing}")

        if data.empty:
            raise ValueError("The CSV contains no market data.")

        data["trade_date"] = pd.to_datetime(
            data["Date"].astype(str).str.slice(0, 10),
            errors="raise",
        ).dt.date

        numeric_columns = ["Open", "High", "Low", "Close", "Volume"]

        for column in numeric_columns:
            data[column] = pd.to_numeric(data[column], errors="raise")

        if data["trade_date"].duplicated().any():
            raise ValueError("Duplicate trading dates found in the CSV.")

        values = data[numeric_columns].to_numpy(dtype=float)

        if not np.isfinite(values).all():
            raise ValueError(
                "Market data contains missing or non-finite numeric values."
            )

        price_columns = ["Open", "High", "Low", "Close"]

        if (data[price_columns] <= 0).any().any():
            raise ValueError("Prices must be positive.")

        if (data["Volume"] < 0).any():
            raise ValueError("Volume cannot be negative.")

        if (data["Volume"] % 1 != 0).any():
            raise ValueError("Volume must contain whole numbers.")

        if (data["Volume"] > np.iinfo(np.int64).max).any():
            raise ValueError("Volume exceeds the supported integer range.")

        if (data["High"] < data["Low"]).any():
            raise ValueError("High cannot be lower than Low.")

        if (
            (data["High"] < data["Open"])
            | (data["High"] < data["Close"])
            | (data["Low"] > data["Open"])
            | (data["Low"] > data["Close"])
        ).any():
            raise ValueError("Invalid OHLC price relationships.")

        rows = [
            (
                trade_date,
                float(open_price),
                float(high_price),
                float(low_price),
                float(close_price),
                int(volume),
            )
            for (
                trade_date,
                open_price,
                high_price,
                low_price,
                close_price,
                volume,
            ) in data[
                [
                    "trade_date", "Open", "High", "Low",
                    "Close", "Volume",
                ]
            ].itertuples(index=False, name=None)
        ]

        latest_trade_date = max(row[0] for row in rows)

        # Market-data changes remain atomic.
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO instruments (
                        ticker,
                        name,
                        exchange,
                        currency
                    )
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (ticker)
                    DO UPDATE SET
                        name = CASE
                            WHEN %s THEN EXCLUDED.name
                            ELSE instruments.name
                        END,
                        exchange = CASE
                            WHEN %s THEN EXCLUDED.exchange
                            ELSE instruments.exchange
                        END,
                        currency = CASE
                            WHEN %s THEN EXCLUDED.currency
                            ELSE instruments.currency
                        END
                    RETURNING id
                    """,
                    (
                        ticker,
                        name or ("S&P 500 Index" if ticker == "^GSPC" else ticker),
                        exchange or ("INDEX" if ticker == "^GSPC" else None),
                        currency or ("USD" if ticker == "^GSPC" else None),
                        name is not None or ticker == "^GSPC",
                        exchange is not None or ticker == "^GSPC",
                        currency is not None or ticker == "^GSPC",
                    ),
                )

                instrument_id = cursor.fetchone()[0]

                cursor.executemany(
                    """
                    INSERT INTO daily_prices (
                        instrument_id,
                        trade_date,
                        open_price,
                        high_price,
                        low_price,
                        close_price,
                        volume
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (instrument_id, trade_date)
                    DO UPDATE SET
                        open_price = EXCLUDED.open_price,
                        high_price = EXCLUDED.high_price,
                        low_price = EXCLUDED.low_price,
                        close_price = EXCLUDED.close_price,
                        volume = EXCLUDED.volume
                    """,
                    [
                        (instrument_id, *row)
                        for row in rows
                    ],
                )

        # The data transaction has committed. Record success separately.
        try:
            _finish_refresh_log(
                refresh_id,
                status="success",
                rows_imported=len(rows),
                latest_trade_date=latest_trade_date,
            )
        except Exception as log_error:
            print(
                "WARNING: Market data was imported successfully, "
                f"but refresh success logging failed: {log_error}"
            )

        print(f"Ticker: {ticker}")
        print(f"Rows imported or updated: {len(rows)}")
        print(f"Latest trading date: {latest_trade_date}")
        print("Database transaction committed successfully.")

        return len(rows)

    except Exception as error:
        # Do not let a logging failure hide the original import error.
        try:
            _finish_refresh_log(
                refresh_id,
                status="failed",
                error_message=f"{type(error).__name__}: {error}",
            )
        except Exception as log_error:
            print(f"WARNING: Could not record refresh failure: {log_error}")

        raise



def download_and_import_market_data(
    ticker: str,
    *,
    name: str,
    exchange: str,
    currency: str = "INR",
) -> int:
    """Download daily prices, validate them, and import to PostgreSQL."""
    ticker = ticker.strip().upper()

    if not ticker:
        raise ValueError("Ticker symbol cannot be empty.")

    if not name.strip() or not exchange.strip() or not currency.strip():
        raise ValueError(
            "Instrument name, exchange, and currency are required."
        )

    supported_equity = ticker.endswith((".NS", ".BO"))
    supported_benchmark = ticker == "^NSEI"

    if not (supported_equity or supported_benchmark):
        raise ValueError(
            "Only NSE/BSE equities and the NIFTY 50 benchmark "
            "are supported by this download workflow."
        )

    if supported_benchmark:
        if name.strip() != "NIFTY 50 Index":
            raise ValueError(
                "The ^NSEI ticker must use the name 'NIFTY 50 Index'."
            )
        if exchange.strip().upper() != "NSE":
            raise ValueError(
                "The ^NSEI benchmark must use exchange 'NSE'."
            )
        if currency.strip().upper() != "INR":
            raise ValueError(
                "The ^NSEI benchmark must use currency 'INR'."
            )

    provider_refresh_id = _start_provider_refresh_log(ticker)

    try:
        history = yf.Ticker(ticker).history(
            period="max",
            interval="1d",
            auto_adjust=True,
        )

        if history.empty:
            raise ValueError(
                f"No historical market data was found for {ticker}."
            )

        history = history.reset_index()

        required_columns = [
            "Date", "Open", "High", "Low", "Close", "Volume"
        ]

        missing = [
            column for column in required_columns
            if column not in history.columns
        ]

        if missing:
            raise ValueError(
                f"The provider response is missing columns: {missing}"
            )

        candidate = history[required_columns].copy()

        candidate["Date"] = pd.to_datetime(
            candidate["Date"].astype(str).str.slice(0, 10),
            errors="raise",
        ).dt.date

        if candidate["Date"].duplicated().any():
            raise ValueError(
                "Provider data contains duplicate trading dates."
            )

        numeric_columns = ["Open", "High", "Low", "Close", "Volume"]

        for column in numeric_columns:
            candidate[column] = pd.to_numeric(
                candidate[column], errors="raise"
            )

        values = candidate[numeric_columns].to_numpy(dtype=float)

        if not np.isfinite(values).all():
            raise ValueError(
                "Provider data contains missing or non-finite values."
            )

        prices = candidate[["Open", "High", "Low", "Close"]]

        if (prices <= 0).any().any():
            raise ValueError("Provider prices must be positive.")

        if (candidate["Volume"] < 0).any():
            raise ValueError("Provider volume cannot be negative.")

        if (candidate["Volume"] % 1 != 0).any():
            raise ValueError("Provider volume must contain whole numbers.")

        if (candidate["Volume"] > np.iinfo(np.int64).max).any():
            raise ValueError("Provider volume exceeds the supported range.")

        if (candidate["High"] < candidate["Low"]).any():
            raise ValueError("Provider data contains invalid OHLC values.")

        if (
            (candidate["High"] < candidate["Open"])
            | (candidate["High"] < candidate["Close"])
            | (candidate["Low"] > candidate["Open"])
            | (candidate["Low"] > candidate["Close"])
        ).any():
            raise ValueError("Provider data contains invalid OHLC values.")

        latest_trade_date = max(candidate["Date"])
        rows_downloaded = len(candidate)

    except Exception as error:
        try:
            _finish_provider_refresh_log(
                provider_refresh_id,
                status="failed",
                error_message=f"{type(error).__name__}: {error}",
            )
        except Exception as log_error:
            print(
                "WARNING: Could not record provider failure: "
                f"{log_error}"
            )

        raise

    try:
        _finish_provider_refresh_log(
            provider_refresh_id,
            status="success",
            rows_downloaded=rows_downloaded,
            latest_trade_date=latest_trade_date,
        )
    except Exception as log_error:
        print(
            "WARNING: Provider download succeeded, "
            f"but success logging failed: {log_error}"
        )

    csv_path = RAW_DATA_DIR / f"{ticker}_daily.csv"
    csv_path.parent.mkdir(parents=True, exist_ok=True)

    staged_file = tempfile.NamedTemporaryFile(
        prefix=f".{ticker}_",
        suffix="_candidate.csv",
        dir=csv_path.parent,
        delete=False,
    )
    staged_path = Path(staged_file.name)
    staged_file.close()

    keep_candidate = False

    try:
        candidate.to_csv(staged_path, index=False)

        # Import the candidate before promoting it to the active CSV.
        rows_imported = import_market_data(
            ticker,
            name=name.strip(),
            exchange=exchange.strip(),
            currency=currency.strip(),
            csv_path=staged_path,
        )

        try:
            staged_path.replace(csv_path)
        except OSError as error:
            keep_candidate = True
            raise RuntimeError(
                "Database import succeeded, but CSV promotion failed. "
                f"The candidate was retained at {staged_path}"
            ) from error

        return rows_imported

    finally:
        if not keep_candidate:
            staged_path.unlink(missing_ok=True)


def load_market_data_from_db(ticker: str = "AAPL") -> pd.DataFrame:
    """Load historical daily prices from PostgreSQL."""
    ticker = ticker.strip().upper()

    if not ticker:
        raise ValueError("Ticker symbol cannot be empty.")

    query = """
        SELECT
            p.trade_date AS date,
            p.open_price AS "Open",
            p.high_price AS "High",
            p.low_price AS "Low",
            p.close_price AS "Close",
            p.volume AS "Volume"
        FROM daily_prices AS p
        JOIN instruments AS i
            ON i.id = p.instrument_id
        WHERE i.ticker = %s
        ORDER BY p.trade_date ASC;
    """

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, (ticker,))
            rows = cursor.fetchall()
            columns = [description.name for description in cursor.description]

    data = pd.DataFrame(rows, columns=columns)

    if data.empty:
        raise ValueError(
            f"No historical data found in PostgreSQL for {ticker}. "
            "Import the ticker's CSV data first."
        )

    data["date"] = pd.to_datetime(data["date"], errors="raise")
    data = data.set_index("date")
    data.index.name = "Date"

    if data.index.has_duplicates:
        raise ValueError("Duplicate trading dates found in PostgreSQL.")

    return data



def get_data_freshness(ticker: str = "AAPL") -> dict:
    """Return stored-data freshness and the latest refresh outcomes."""
    ticker = ticker.strip().upper()

    if not ticker:
        raise ValueError("Ticker symbol cannot be empty.")

    query = """
        SELECT
            i.ticker,
            i.name,
            i.exchange,
            i.currency,
            COUNT(p.trade_date) AS stored_rows,
            MAX(p.trade_date) AS latest_trade_date,
            (
                SELECT json_build_object(
                    'status', status,
                    'started_at', started_at,
                    'completed_at', completed_at,
                    'rows_downloaded', rows_downloaded,
                    'latest_trade_date', latest_trade_date,
                    'error_message', error_message
                )
                FROM provider_refresh_log
                WHERE ticker = i.ticker
                ORDER BY started_at DESC, id DESC
                LIMIT 1
            ) AS provider,
            (
                SELECT json_build_object(
                    'status', status,
                    'started_at', started_at,
                    'completed_at', completed_at,
                    'rows_imported', rows_imported,
                    'latest_trade_date', latest_trade_date,
                    'error_message', error_message
                )
                FROM data_refresh_log
                WHERE ticker = i.ticker
                ORDER BY started_at DESC, id DESC
                LIMIT 1
            ) AS database_import,
            (
                SELECT completed_at
                FROM data_refresh_log
                WHERE ticker = i.ticker
                  AND status = 'success'
                ORDER BY completed_at DESC, id DESC
                LIMIT 1
            ) AS last_successful_import
        FROM instruments AS i
        LEFT JOIN daily_prices AS p
            ON p.instrument_id = i.id
        WHERE i.ticker = %s
        GROUP BY i.id, i.ticker, i.name, i.exchange, i.currency;
    """

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, (ticker,))
            row = cursor.fetchone()

    if row is None:
        raise ValueError(f"No instrument found for {ticker}.")

    provider = row[6]
    database_import = row[7]

    return {
        "ticker": row[0],
        "name": row[1],
        "exchange": row[2],
        "currency": row[3],
        "stored_rows": row[4],
        "latest_trade_date": (
            row[5].isoformat() if row[5] else None
        ),
        "last_successful_import": (
            row[8].isoformat() if row[8] else None
        ),
        "provider": provider,
        "database_import": database_import,
        "data_status": (
            "available" if row[4] > 0 else "no_data"
        ),
    }


def get_refresh_status(ticker: str = "AAPL") -> dict:
    """Return the latest provider download and database import outcomes."""
    ticker = ticker.strip().upper()

    if not ticker:
        raise ValueError("Ticker symbol cannot be empty.")

    query = """
        SELECT
            (
                SELECT json_build_object(
                    'status', status,
                    'started_at', started_at,
                    'completed_at', completed_at,
                    'rows_downloaded', rows_downloaded,
                    'latest_trade_date', latest_trade_date,
                    'error_message', error_message
                )
                FROM provider_refresh_log
                WHERE ticker = %s
                ORDER BY started_at DESC, id DESC
                LIMIT 1
            ) AS provider,
            (
                SELECT json_build_object(
                    'status', status,
                    'started_at', started_at,
                    'completed_at', completed_at,
                    'rows_imported', rows_imported,
                    'latest_trade_date', latest_trade_date,
                    'error_message', error_message
                )
                FROM data_refresh_log
                WHERE ticker = %s
                ORDER BY started_at DESC, id DESC
                LIMIT 1
            ) AS database_import;
    """

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, (ticker, ticker))
            row = cursor.fetchone()

    return {
        "ticker": ticker,
        "provider": row[0] if row and row[0] else None,
        "database_import": row[1] if row and row[1] else None,
    }


def main() -> None:
    import_market_data("AAPL")


if __name__ == "__main__":
    main()